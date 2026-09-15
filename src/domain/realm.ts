import type { PaymentsSnapshot } from "./types";
import { buildInterestLedger, type InterestLedger } from "./interest";
import { computeLots, isSold, type Lot } from "./lot";
import { computeFarms, type FarmEconomics } from "./farm";
import { computeGoal, withVerdict, type GoalStatus } from "./goal";
import { computePathToGoal, withPathToGoalFarms, type PathToGoal } from "./pathToGoal";
import { computeQualityIssues, emptySourceTableIssues, type QualityIssue } from "./quality";
import { computeEvents, withLiberationEvents, type RealmEvent } from "./events";
import { computeInvestors, type InvestorSummary } from "./investors";
import { computeTreasury, type Treasury } from "./treasury";
import { computeTrophies, type Trophy } from "./trophies";
import { deriveOracleDefaults, farmCadence, type FarmCadence, type OracleParams } from "./oracle";
import { resolveEra, type Era, type EraStart } from "./era";
import { computeDebt, type Debt } from "./debt";
import { computeOxygen, type Oxygen } from "./oxygen";
import { computeLiberation, type Liberation } from "./liberation";
import { computeCapitalComposition, type CapitalComposition } from "./sponsorCapital";
import { computeCampaigns, type Campaign } from "./campaigns";
import { computeStreaks, type Streaks } from "./streaks";
import { computeFutures, type Futures } from "./futures";
import { narrateAll } from "./narrative";
import { buildStory, type Story } from "./story";
import { computePipeline, type Pipeline } from "./pipeline";
import { computeExpected, reservationsMade, type Expected } from "./expected";
import { deriveWarPlanDefaults, solveWarPlan, type RotationBenchmark, type WarPlan, type WarPlanDefaults } from "./warplan";
import { computeSeasonality, type SeasonalProfile } from "./seasonality";
import { computeMonthlyHistory, type MonthlyPoint } from "./history";
import { startOfUtcDay, toIsoDate } from "./dates";
import { computeProfitLayers, type ProfitLayers } from "./profitLayers";

/** Everything the pages render. Built once from a snapshot; pages never compute money. */
export interface Realm {
  asOf: Date;
  lots: Lot[];
  farms: FarmEconomics[];
  interestByFarm: Map<string, InterestLedger>;
  goal: GoalStatus;
  quality: QualityIssue[];
  events: RealmEvent[];
  investors: InvestorSummary[];
  treasury: Treasury;
  trophies: Trophy[];
  oracleDefaults: OracleParams;
  // Phase 2: Epic
  debt: Debt;
  oxygen: Oxygen;
  liberation: Liberation;
  /** Capital deployed by sponsor and kind, plus the concentration figure the Council judges. */
  capitalComposition: CapitalComposition;
  campaigns: Campaign[];
  campaignByFarm: Map<string, Campaign>;
  /** Consecutive weeks / months with a closing. */
  streaks: Streaks;
  /** Consecutive weeks / months with a reservation made (its netProfit is the net profit at stake). */
  reservationStreaks: Streaks;
  futures: Futures;
  /** One line of chronicle prose per event id. */
  narrative: Map<string, string>;
  story: Story;
  /** Reservations layer — read-only view of the pipeline; never feeds the goal, pace or oxygen. */
  pipeline: Pipeline;
  /** Every live reservation with its expected close date and expected net profit; the reservation and closing paces. */
  expected: Expected;
  /** WAR PLAN — the inputs /warplan starts from, each next to the real figure it came from. */
  warPlanDefaults: WarPlanDefaults;
  /** The War Plan solved on the real defaults (the Throne Room's rotation strip reads it). */
  warPlan: WarPlan;
  /**
   * Shared path-to-goal reading: flat lots-to-sell, rotation farms-to-buy / capital-to-raise,
   * and inventory runway. Throne, Council, Engine and War Plan all read farms/capital from here.
   */
  pathToGoal: PathToGoal;
  /** The realm's capital cycle: the benchmark farm and every sponsor farm graded against it. */
  rotation: RotationBenchmark;
  /** Month-of-year shape of the realm's closings since the era start (not applied with under 12 months of history). */
  seasonality: SeasonalProfile;
  /**
   * THE ERA (config ERA_START): every rate, average and trend is measured from its start; totals
   * keep the full history. Null when no era applies (disabled, or not begun by asOf).
   */
  era: Era | null;
  /** The era start the realm was built with, so re-solving the War Plan on the realm measures the same era. */
  eraStart: EraStart;
  /** How often a farm is bought — the Oracle's "new farm every N months", with the farms behind it. */
  farmCadence: FarmCadence;
  /**
   * Booked net profit at closing, net cash in hand, and notes still held.
   * Derived from existing lot fields — does not change the goal.
   */
  profitLayers: ProfitLayers;
  /** Reservations, closings and net profit by calendar month — the Pulse charts. */
  history: MonthlyPoint[];
  snapshot: PaymentsSnapshot;
}

/** Milliseconds per `buildRealm` stage. Filled when `RealmOptions.timings` is passed. */
export type RealmStageTimings = Record<string, number>;

export interface RealmOptions {
  /** Era start (ISO) for every rate and trend; `null` measures over the whole history. Default: config ERA_START. */
  eraStart?: EraStart;
  /**
   * ISO deadline the goal, debt, War Plan defaults, Exodus defaults and Oracle futures run against.
   * Default: `computeGoal`'s `GOAL_DEADLINE` fallback (end of 2027). Not a free date at the app
   * level — the HorizonProvider only ever passes one of the three `deadlineForHorizon` values.
   */
  deadline?: string;
  /** When set, each named stage writes its elapsed milliseconds here. Production callers omit this. */
  timings?: RealmStageTimings;
  /**
   * UI language for domain prose that renders on screen (verdicts, narrative, story, trophies,
   * futures, campaign reasons, War Plan). Defaults to English so fixture tests stay green;
   * the RealmProvider passes `useLang()`.
   */
  lang?: import("./quality_human").QualityLang;
}

function stage<T>(timings: RealmStageTimings | undefined, name: string, fn: () => T): T {
  if (!timings) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    timings[name] = performance.now() - t0;
  }
}

/** Compute now when profiling; otherwise on first property access so the Throne Room skips Oracle/Quality/trophy math. */
function defer<T>(timings: RealmStageTimings | undefined, name: string, fn: () => T): () => T {
  if (timings) {
    const value = stage(timings, name, fn);
    return () => value;
  }
  let value: T | undefined;
  let ready = false;
  return () => {
    if (!ready) {
      value = fn();
      ready = true;
    }
    return value as T;
  };
}

export function buildRealm(snapshot: PaymentsSnapshot, now: Date = new Date(), opts: RealmOptions = {}): Realm {
  const timings = opts.timings;
  const lang = opts.lang ?? "en";
  const t0 = timings ? performance.now() : 0;
  const asOf = startOfUtcDay(now);
  const eraStart = opts.eraStart;
  const era = resolveEra(asOf, eraStart);
  const interestByFarm = stage(timings, "buildInterestLedgers", () => {
    const map = new Map<string, InterestLedger>();
    for (const farm of snapshot.farmAcquisitions) {
      map.set(farm.id, buildInterestLedger(farm, snapshot.investorDistributions, asOf));
    }
    return map;
  });

  const lots = stage(timings, "computeLots", () =>
    computeLots({
      farms: snapshot.farmAcquisitions,
      properties: snapshot.properties,
      fileCases: snapshot.fileCases,
      notes: snapshot.notes,
      noteSales: snapshot.noteSales,
      propertyCosts: snapshot.propertyCosts,
      clients: snapshot.clients,
      investors: snapshot.investors,
      interestByFarm,
      asOf,
    }),
  );

  const farms = stage(timings, "computeFarms", () =>
    computeFarms(snapshot.farmAcquisitions, lots, snapshot.propertyCosts, snapshot.investors, interestByFarm, asOf),
  );
  const goal = stage(timings, "computeGoal", () => withVerdict(computeGoal(lots, farms, asOf, { eraStart, deadline: opts.deadline }), undefined, lang));
  // The reservations layer reads the same lots the goal reads and never feeds back into it.
  const pipeline = stage(timings, "computePipeline", () =>
    computePipeline(lots, asOf, { closedLotsPerMonth: goal.closedLotsPerMonth, eraStart }),
  );
  const expected = stage(timings, "computeExpected", () => computeExpected(lots, pipeline, goal, asOf, { eraStart }));
  const getQuality = defer(timings, "computeQualityIssues", () => [
    ...computeQualityIssues({
      farms: snapshot.farmAcquisitions,
      properties: snapshot.properties,
      fileCases: snapshot.fileCases,
      notes: snapshot.notes,
      noteSales: snapshot.noteSales,
      clients: snapshot.clients,
    }),
    ...emptySourceTableIssues(
      {
        farm_acquisitions: snapshot.farmAcquisitions.length,
        properties: snapshot.properties.length,
        file_cases: snapshot.fileCases.length,
        notes: snapshot.notes.length,
        note_sales: snapshot.noteSales.length,
        investor_distributions: snapshot.investorDistributions.length,
        property_costs: snapshot.propertyCosts.length,
        investors: snapshot.investors.length,
        clients: snapshot.clients.length,
      },
      lang,
    ),
  ]);
  const investors = stage(timings, "computeInvestors", () => computeInvestors(snapshot.investors, farms, snapshot.investorDistributions));
  const treasury = stage(timings, "computeTreasury", () => computeTreasury(lots, snapshot.investorDistributions, snapshot.noteSales));
  const oracleDefaults = stage(timings, "deriveOracleDefaults", () => deriveOracleDefaults(lots, farms, goal, { eraStart }));
  const profitLayers = stage(timings, "computeProfitLayers", () => computeProfitLayers(lots, oracleDefaults.noteSalePct / 100));
  const getCadence = defer(timings, "farmCadence", () => farmCadence(farms, asOf, eraStart));

  // Phase 2
  const liberation = stage(timings, "computeLiberation", () => computeLiberation(farms, investors, snapshot.investorDistributions));
  const getCapitalComposition = defer(timings, "computeCapitalComposition", () => computeCapitalComposition(investors));
  const events = stage(timings, "computeEvents", () =>
    withLiberationEvents(
      computeEvents(lots, snapshot.farmAcquisitions, snapshot.investorDistributions, snapshot.investors, asOf, undefined, lang),
      liberation.moments,
      asOf,
      lang,
    ),
  );
  const debt = stage(timings, "computeDebt", () => computeDebt(farms, goal, lots, { eraStart }));
  const oxygen = stage(timings, "computeOxygen", () => computeOxygen(lots, farms, asOf, { conversionPct: expected.conversionPct, eraStart }));
  const campaigns = stage(timings, "computeCampaigns", () => computeCampaigns(farms, lots, asOf, undefined, lang));
  const getStreaks = defer(timings, "computeStreaks", () =>
    computeStreaks(
      lots.filter((l) => isSold(l) && l.closeDate).map((l) => ({ date: l.closeDate as string, netProfit: l.netProfit ?? 0 })),
      asOf,
      eraStart,
    ),
  );
  // Reservation streaks count every pledge made — live, closed since, or cancelled — by its reservation date.
  const getReservationStreaks = defer(timings, "computeReservationStreaks", () =>
    computeStreaks(
      reservationsMade(lots).map((r) => ({ date: r.date, netProfit: r.netProfitAtStake })),
      asOf,
      eraStart,
    ),
  );
  const activeFarms = farms.filter((f) => f.monthsSinceFunding !== null && f.soldLots < f.totalLots).length;
  const getFutures = defer(timings, "computeFutures", () =>
    computeFutures(oracleDefaults, goal, goal.availableLots + goal.reservedLots, asOf, activeFarms, expected, {
      cadenceSince: getCadence().sinceLabel,
      lang,
    }),
  );
  const getTrophies = defer(timings, "computeTrophies", () =>
    computeTrophies({
      lots,
      farms,
      goal,
      events,
      treasury,
      investors,
      streaks: getStreaks(),
      reservationStreaks: getReservationStreaks(),
      liberation,
      lang,
    }),
  );
  const narrative = stage(timings, "narrateAll", () =>
    narrateAll(events, {
      lotsById: new Map(lots.map((l) => [l.propertyId, l])),
      oxygenByLot: oxygen.perLot,
      provisionalByLot: oxygen.provisional,
      expectedByLot: expected.byId,
      farmDealTypeByName: new Map(snapshot.farmAcquisitions.map((f) => [f.farm_name ?? "", f.deal_type])),
      currentYear: asOf.getUTCFullYear(),
      asOf: toIsoDate(asOf),
      lang,
    }),
  );
  const story = stage(timings, "buildStory", () => buildStory(goal, farms, debt, oxygen, liberation, lang));
  const seasonality = stage(timings, "computeSeasonality", () => computeSeasonality(lots, asOf, { eraStart }));
  const history = stage(timings, "computeMonthlyHistory", () => computeMonthlyHistory(lots, asOf, { eraStart }));
  const warPlanContext = {
    asOf,
    lots,
    farms,
    goal,
    investors,
    oracleDefaults,
    pipeline,
    liberation,
    campaigns,
    snapshot,
    seasonality,
    eraStart,
  };
  const warPlanDefaults = stage(timings, "deriveWarPlanDefaults", () => deriveWarPlanDefaults(warPlanContext));
  const warPlan = stage(timings, "solveWarPlan", () => solveWarPlan(warPlanDefaults.inputs, warPlanContext, lang));
  // Farms-to-buy and capital-to-raise come from the War Plan rotation schedule (one source of
  // truth). The closed-form turns formula is not used for display — see pathToGoal.ts.
  const pathToGoal = stage(timings, "computePathToGoal", () => computePathToGoal(goal, warPlan, asOf));
  const goalAligned = withPathToGoalFarms(goal, pathToGoal);
  if (timings) timings.total = performance.now() - t0;

  return {
    asOf,
    lots,
    farms,
    interestByFarm,
    goal: goalAligned,
    get quality() {
      return getQuality();
    },
    events,
    investors,
    treasury,
    get trophies() {
      return getTrophies();
    },
    oracleDefaults,
    profitLayers,
    debt,
    oxygen,
    liberation,
    get capitalComposition() {
      return getCapitalComposition();
    },
    campaigns,
    campaignByFarm: new Map(campaigns.map((c) => [c.farmId, c])),
    get streaks() {
      return getStreaks();
    },
    get reservationStreaks() {
      return getReservationStreaks();
    },
    get futures() {
      return getFutures();
    },
    narrative,
    story,
    pipeline,
    expected,
    warPlanDefaults,
    warPlan,
    pathToGoal,
    rotation: warPlan.benchmark,
    seasonality,
    era,
    eraStart,
    get farmCadence() {
      return getCadence();
    },
    history,
    snapshot,
  };
}
