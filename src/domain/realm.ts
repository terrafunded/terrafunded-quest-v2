import type { PaymentsSnapshot } from "./types";
import { buildInterestLedger, type InterestLedger } from "./interest";
import { computeLots, type Lot } from "./lot";
import { computeFarms, type FarmEconomics } from "./farm";
import { computeGoal, withVerdict, type GoalStatus } from "./goal";
import { computeQualityIssues, type QualityIssue } from "./quality";
import { computeEvents, type RealmEvent } from "./events";
import { computeInvestors, type InvestorSummary } from "./investors";
import { computeTreasury, type Treasury } from "./treasury";
import { computeTrophies, type Trophy } from "./trophies";
import { deriveOracleDefaults, type OracleParams } from "./oracle";
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
  const events = computeEvents(lots, snapshot.farmAcquisitions, snapshot.investorDistributions, snapshot.investors, asOf);
  const investors = computeInvestors(snapshot.investors, farms, snapshot.investorDistributions);
  const treasury = computeTreasury(lots, snapshot.investorDistributions, snapshot.noteSales);
  const trophies = computeTrophies({ lots, farms, goal, events, treasury, investors });
  const oracleDefaults = deriveOracleDefaults(lots, farms, goal);

  return { asOf, lots, farms, interestByFarm, goal, quality, events, investors, treasury, trophies, oracleDefaults, snapshot };
}
