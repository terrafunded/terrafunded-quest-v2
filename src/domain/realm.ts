import type { PaymentsSnapshot } from "./types";
import { buildInterestLedger, type InterestLedger } from "./interest";
import { computeLots, isSold, type Lot } from "./lot";
import { computeFarms, type FarmEconomics } from "./farm";
import { computeGoal, withVerdict, type GoalStatus } from "./goal";
import { computeQualityIssues, type QualityIssue } from "./quality";
import { computeEvents, withLiberationEvents, type RealmEvent } from "./events";
import { computeInvestors, type InvestorSummary } from "./investors";
import { computeTreasury, type Treasury } from "./treasury";
import { computeTrophies, type Trophy } from "./trophies";
import { deriveOracleDefaults, farmCadence, type FarmCadence, type OracleParams } from "./oracle";
import { resolveEra, type Era, type EraStart } from "./era";
import { computeDebt, type Debt } from "./debt";
import { computeOxygen, type Oxygen } from "./oxygen";
import { computeLiberation, type Liberation } from "./liberation";
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
  /** Reservations, closings and net profit by calendar month — the Pulse charts. */
  history: MonthlyPoint[];
  snapshot: PaymentsSnapshot;
}

export interface RealmOptions {
  /** Era start (ISO) for every rate and trend; `null` measures over the whole history. Default: config ERA_START. */
  eraStart?: EraStart;
  /**
   * ISO deadline the goal, debt, War Plan defaults, Exodus defaults and Oracle futures run against.
   * Default: `computeGoal`'s `GOAL_DEADLINE` fallback (end of 2027). Not a free date at the app
   * level — the HorizonProvider only ever passes one of the three `deadlineForHorizon` values.
   */
  deadline?: string;
}

export function buildRealm(snapshot: PaymentsSnapshot, now: Date = new Date(), opts: RealmOptions = {}): Realm {
  const asOf = startOfUtcDay(now);
  const eraStart = opts.eraStart;
  const era = resolveEra(asOf, eraStart);
  const interestByFarm = new Map<string, InterestLedger>();
  for (const farm of snapshot.farmAcquisitions) {
    interestByFarm.set(farm.id, buildInterestLedger(farm, snapshot.investorDistributions, asOf));
  }

  const lots = computeLots({
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
  });

  const farms = computeFarms(snapshot.farmAcquisitions, lots, snapshot.propertyCosts, snapshot.investors, interestByFarm, asOf);
  const goal = withVerdict(computeGoal(lots, farms, asOf, { eraStart, deadline: opts.deadline }));
  // The reservations layer reads the same lots the goal reads and never feeds back into it.
  const pipeline = computePipeline(lots, asOf, { closedLotsPerMonth: goal.closedLotsPerMonth, eraStart });
  const expected = computeExpected(lots, pipeline, goal, asOf, { eraStart });
  const quality = computeQualityIssues({
    farms: snapshot.farmAcquisitions,
    properties: snapshot.properties,
    fileCases: snapshot.fileCases,
    notes: snapshot.notes,
    noteSales: snapshot.noteSales,
    clients: snapshot.clients,
  });
  const investors = computeInvestors(snapshot.investors, farms, snapshot.investorDistributions);
  const treasury = computeTreasury(lots, snapshot.investorDistributions, snapshot.noteSales);
  const oracleDefaults = deriveOracleDefaults(lots, farms, goal, { eraStart });
  const cadence = farmCadence(farms, asOf, eraStart);

  // Phase 2
  const liberation = computeLiberation(farms, investors, snapshot.investorDistributions);
  const events = withLiberationEvents(
    computeEvents(lots, snapshot.farmAcquisitions, snapshot.investorDistributions, snapshot.investors, asOf),
    liberation.moments,
    asOf,
  );
  const debt = computeDebt(farms, goal, lots, { eraStart });
  const oxygen = computeOxygen(lots, farms, asOf, { conversionPct: expected.conversionPct, eraStart });
  const campaigns = computeCampaigns(farms, lots, asOf);
  const streaks = computeStreaks(
    lots.filter((l) => isSold(l) && l.closeDate).map((l) => ({ date: l.closeDate as string, netProfit: l.netProfit ?? 0 })),
    asOf,
    eraStart,
  );
  // Reservation streaks count every pledge made — live, closed since, or cancelled — by its reservation date.
  const reservationStreaks = computeStreaks(
    reservationsMade(lots).map((r) => ({ date: r.date, netProfit: r.netProfitAtStake })),
    asOf,
    eraStart,
  );
  const activeFarms = farms.filter((f) => f.monthsSinceFunding !== null && f.soldLots < f.totalLots).length;
  const futures = computeFutures(oracleDefaults, goal, goal.availableLots + goal.reservedLots, asOf, activeFarms, expected, { cadenceSince: cadence.sinceLabel });
  const trophies = computeTrophies({ lots, farms, goal, events, treasury, investors, streaks, reservationStreaks, liberation });
  const narrative = narrateAll(events, {
    lotsById: new Map(lots.map((l) => [l.propertyId, l])),
    oxygenByLot: oxygen.perLot,
    provisionalByLot: oxygen.provisional,
    expectedByLot: expected.byId,
    farmDealTypeByName: new Map(snapshot.farmAcquisitions.map((f) => [f.farm_name ?? "", f.deal_type])),
    currentYear: asOf.getUTCFullYear(),
    asOf: toIsoDate(asOf),
  });
  const story = buildStory(goal, farms, debt, oxygen, liberation);
  const seasonality = computeSeasonality(lots, asOf, { eraStart });
  const history = computeMonthlyHistory(lots, asOf, { eraStart });
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
  const warPlanDefaults = deriveWarPlanDefaults(warPlanContext);
  const warPlan = solveWarPlan(warPlanDefaults.inputs, warPlanContext);

  return {
    asOf,
    lots,
    farms,
    interestByFarm,
    goal,
    quality,
    events,
    investors,
    treasury,
    trophies,
    oracleDefaults,
    debt,
    oxygen,
    liberation,
    campaigns,
    campaignByFarm: new Map(campaigns.map((c) => [c.farmId, c])),
    streaks,
    reservationStreaks,
    futures,
    narrative,
    story,
    pipeline,
    expected,
    warPlanDefaults,
    warPlan,
    rotation: warPlan.benchmark,
    seasonality,
    era,
    eraStart,
    farmCadence: cadence,
    history,
    snapshot,
  };
}
