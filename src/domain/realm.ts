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
import { deriveOracleDefaults, type OracleParams } from "./oracle";
import { computeDebt, type Debt } from "./debt";
import { computeOxygen, type Oxygen } from "./oxygen";
import { computeLiberation, type Liberation } from "./liberation";
import { computeCampaigns, type Campaign } from "./campaigns";
import { computeStreaks, type Streaks } from "./streaks";
import { computeFutures, type Futures } from "./futures";
import { narrateAll } from "./narrative";
import { buildStory, type Story } from "./story";
import { startOfUtcDay } from "./dates";

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
  streaks: Streaks;
  futures: Futures;
  /** One line of chronicle prose per event id. */
  narrative: Map<string, string>;
  story: Story;
  snapshot: PaymentsSnapshot;
}

export function buildRealm(snapshot: PaymentsSnapshot, now: Date = new Date()): Realm {
  const asOf = startOfUtcDay(now);
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
  const goal = withVerdict(computeGoal(lots, farms, asOf));
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
  const oracleDefaults = deriveOracleDefaults(lots, farms, goal);

  // Phase 2
  const liberation = computeLiberation(farms, investors, snapshot.investorDistributions);
  const events = withLiberationEvents(
    computeEvents(lots, snapshot.farmAcquisitions, snapshot.investorDistributions, snapshot.investors, asOf),
    liberation.moments,
    asOf,
  );
  const firstClose = lots.filter(isSold).map((l) => l.closeDate).filter((d): d is string => !!d).sort()[0] ?? null;
  const debt = computeDebt(farms, goal, firstClose);
  const oxygen = computeOxygen(lots, farms, asOf);
  const campaigns = computeCampaigns(farms, lots, asOf);
  const streaks = computeStreaks(
    lots.filter((l) => isSold(l) && l.closeDate).map((l) => ({ date: l.closeDate as string, netProfit: l.netProfit ?? 0 })),
    asOf,
  );
  const activeFarms = farms.filter((f) => f.monthsSinceFunding !== null && f.soldLots < f.totalLots).length;
  const futures = computeFutures(oracleDefaults, goal, goal.availableLots + goal.reservedLots, asOf, activeFarms);
  const trophies = computeTrophies({ lots, farms, goal, events, treasury, investors, streaks, liberation });
  const narrative = narrateAll(events, {
    lotsById: new Map(lots.map((l) => [l.propertyId, l])),
    oxygenByLot: oxygen.perLot,
    farmDealTypeByName: new Map(snapshot.farmAcquisitions.map((f) => [f.farm_name ?? "", f.deal_type])),
    currentYear: asOf.getUTCFullYear(),
  });
  const story = buildStory(goal, farms, debt, oxygen, liberation);

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
    futures,
    narrative,
    story,
    snapshot,
  };
}
