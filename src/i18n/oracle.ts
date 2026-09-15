import type { QualityLang } from "@/domain/quality_human";
import type { BindingConstraint, SimulatorBottleneckKind } from "@/domain/simulator";
import { useLang } from "./lang";

/** UI chrome for /oracle (Simulator). Domain numbers stay out of this file. */
export interface OracleUiStrings {
  title: string;
  subtitle: string;
  reset: string;
  freedomDate: string;
  notWithinHorizon: string;
  monthsAheadOfToday: (n: string) => string;
  monthsBehindToday: (n: string) => string;
  sameAsTodayPace: string;
  daysAheadOfToday: (n: string) => string;
  daysBehindToday: (n: string) => string;
  daysAheadOfDeadline: (n: string) => string;
  daysBehindDeadline: (n: string) => string;
  sameAsDeadline: string;
  vsTodayPace: string;
  vsDeadline: string;
  raceAria: string;
  raceToday: string;
  racePlan: string;
  raceDeadline: string;
  leversAria: string;
  adsLabel: string;
  adsHint: string;
  farmsLabel: string;
  farmsHint: string;
  capitalLabel: string;
  capitalHint: string;
  closingsOutput: (n: string) => string;
  marginalAdsSooner: (n: string) => string;
  marginalFarmSooner: (n: string) => string;
  marginalAdsLater: (n: string) => string;
  marginalFarmLater: (n: string) => string;
  leverBindsAds: (constraint: string) => string;
  leverBindsFarms: (constraint: string) => string;
  constraintDemand: string;
  constraintInventory: string;
  constraintCapital: string;
  advancedToggle: string;
  advancedHide: string;
  salePriceLabel: string;
  cprLabel: string;
  cprHint: string;
  conversionLabel: string;
  takeLabel: string;
  assumption: string;
  bottleneckAria: string;
  bottleneckInventory: string;
  bottleneckDemand: string;
  bottleneckCapital: (amount: string, date: string) => string;
  bottleneckCapitalNoDate: (amount: string) => string;
  bottleneckNone: string;
  costAria: string;
  costAds: string;
  costLand: string;
  costPeak: string;
  costInterest: string;
  costNet: string;
  chartTitle: string;
  chartLegendAria: string;
  legendPlan: string;
  legendToday: string;
  legendGoal: string;
  legendSaved: string;
  deadline: string;
  presetsAria: string;
  presetToday: string;
  presetRequired: string;
  presetPlusOne: string;
  presetAggressive: string;
  saveName: string;
  save: string;
  remove: string;
  savedAria: string;
  compare: string;
  compareAria: string;
  comparePick: string;
  noSaved: string;
  projectedExitAtCurrentPace: string;
  projectedExitFormula: string;
}

export const ORACLE_UI: Record<QualityLang, OracleUiStrings> = {
  en: {
    title: "Simulator",
    subtitle: "Ads and land you can buy. Closings are the result. Cost is never hidden.",
    reset: "Reset to today's pace",
    freedomDate: "Freedom date",
    notWithinHorizon: "Not within 10 years",
    monthsAheadOfToday: (n) => `${n} months ahead of today's pace`,
    monthsBehindToday: (n) => `${n} months behind today's pace`,
    sameAsTodayPace: "Same date as today's pace",
    daysAheadOfToday: (n) => `${n} days ahead of today's pace`,
    daysBehindToday: (n) => `${n} days behind today's pace`,
    daysAheadOfDeadline: (n) => `${n} days ahead of the deadline`,
    daysBehindDeadline: (n) => `${n} days behind the deadline`,
    sameAsDeadline: "Same date as the deadline",
    vsTodayPace: "versus today's pace",
    vsDeadline: "versus the deadline",
    raceAria: "Race from today to the goal",
    raceToday: "Today's pace",
    racePlan: "Your plan",
    raceDeadline: "Deadline",
    leversAria: "Plan levers",
    adsLabel: "Monthly ad spend",
    adsHint: "Turns into reservations, then closings after conversion and the observed lag.",
    farmsLabel: "Farms per quarter",
    farmsHint: "Each farm at the recent land cost, arriving after the farm-to-first-close lag.",
    capitalLabel: "Capital available for land",
    capitalHint: "From the sponsor mix. Farms past this stay unfunded.",
    closingsOutput: (n) => `${n} closings/month (output — min of demand and inventory)`,
    marginalAdsSooner: (n) => `+$5K/month ads = ${n} days sooner`,
    marginalFarmSooner: (n) => `+1 farm/quarter = ${n} days sooner`,
    marginalAdsLater: (n) => `+$5K/month ads = ${n} days later`,
    marginalFarmLater: (n) => `+1 farm/quarter = ${n} days later`,
    leverBindsAds: (constraint) => `More ads will not move the date — ${constraint} binds`,
    leverBindsFarms: (constraint) => `More farms will not move the date — ${constraint} binds`,
    constraintDemand: "demand",
    constraintInventory: "inventory",
    constraintCapital: "capital",
    advancedToggle: "Advanced",
    advancedHide: "Hide advanced",
    salePriceLabel: "Average sale price",
    cprLabel: "Cost per reservation",
    cprHint: "Assumption — no ad-spend table exists yet.",
    conversionLabel: "Conversion",
    takeLabel: "Investor share",
    assumption: "assumption",
    bottleneckAria: "Next best action",
    bottleneckInventory: "Out of lots — buy land. More ads is wasted.",
    bottleneckDemand: "Idle inventory — raise ads before buying more land.",
    bottleneckCapital: (amount, date) => `Out of capital — raise ${amount} by ${date}.`,
    bottleneckCapitalNoDate: (amount) => `Out of capital — raise ${amount}.`,
    bottleneckNone: "No constraint binds at this pace.",
    costAria: "Cost of this plan",
    costAds: "Ad spend",
    costLand: "Land capital",
    costPeak: "Peak owed",
    costInterest: "Interest paid",
    costNet: "Net after costs",
    chartTitle: "Cumulative net after ads and interest",
    chartLegendAria: "Chart legend",
    legendPlan: "Your plan",
    legendToday: "Today's pace",
    legendGoal: "Goal",
    legendSaved: "Months saved",
    deadline: "Deadline",
    presetsAria: "Presets",
    presetToday: "Today's pace",
    presetRequired: "Required pace",
    presetPlusOne: "+1 farm",
    presetAggressive: "Aggressive",
    saveName: "Scenario name",
    save: "Save",
    remove: "Remove",
    savedAria: "Saved scenarios",
    compare: "Compare",
    compareAria: "Side-by-side compare",
    comparePick: "Pick up to 3",
    noSaved: "No saved scenarios yet.",
    projectedExitAtCurrentPace: "Projected exit at current pace",
    projectedExitFormula: "remaining ÷ era average net profit per lot ÷ trailing closings per month",
  },
  es: {
    title: "Simulador",
    subtitle: "Anuncios y tierra que puedes comprar. Los cierres son el resultado. El costo no se esconde.",
    reset: "Volver al ritmo de hoy",
    freedomDate: "Fecha de libertad",
    notWithinHorizon: "No en 10 años",
    monthsAheadOfToday: (n) => `${n} meses por delante del ritmo de hoy`,
    monthsBehindToday: (n) => `${n} meses por detrás del ritmo de hoy`,
    sameAsTodayPace: "La misma fecha que el ritmo de hoy",
    daysAheadOfToday: (n) => `${n} días por delante del ritmo de hoy`,
    daysBehindToday: (n) => `${n} días por detrás del ritmo de hoy`,
    daysAheadOfDeadline: (n) => `${n} días por delante de la fecha límite`,
    daysBehindDeadline: (n) => `${n} días por detrás de la fecha límite`,
    sameAsDeadline: "La misma fecha que la fecha límite",
    vsTodayPace: "respecto al ritmo de hoy",
    vsDeadline: "respecto a la fecha límite",
    raceAria: "Carrera de hoy a la meta",
    raceToday: "Ritmo de hoy",
    racePlan: "Tu plan",
    raceDeadline: "Fecha límite",
    leversAria: "Palancas del plan",
    adsLabel: "Gasto mensual en anuncios",
    adsHint: "Se convierte en reservas, luego en cierres según la conversión y el desfase observado.",
    farmsLabel: "Fincas por trimestre",
    farmsHint: "Cada finca al costo reciente de tierra, llega después del desfase finca → primer cierre.",
    capitalLabel: "Capital disponible para tierra",
    capitalHint: "De la mezcla de sponsors. Las fincas que pasen de esto quedan sin fondeo.",
    closingsOutput: (n) => `${n} cierres/mes (resultado — mínimo entre demanda e inventario)`,
    marginalAdsSooner: (n) => `+$5K/mes en anuncios = ${n} días antes`,
    marginalFarmSooner: (n) => `+1 finca/trimestre = ${n} días antes`,
    marginalAdsLater: (n) => `+$5K/mes en anuncios = ${n} días después`,
    marginalFarmLater: (n) => `+1 finca/trimestre = ${n} días después`,
    leverBindsAds: (constraint) => `Más anuncios no mueven la fecha — ata ${constraint}`,
    leverBindsFarms: (constraint) => `Más fincas no mueven la fecha — ata ${constraint}`,
    constraintDemand: "la demanda",
    constraintInventory: "el inventario",
    constraintCapital: "el capital",
    advancedToggle: "Avanzado",
    advancedHide: "Ocultar avanzado",
    salePriceLabel: "Precio de venta promedio",
    cprLabel: "Costo por reserva",
    cprHint: "Supuesto — aún no hay tabla de gasto en anuncios.",
    conversionLabel: "Conversión",
    takeLabel: "Parte del inversionista",
    assumption: "supuesto",
    bottleneckAria: "Siguiente mejor acción",
    bottleneckInventory: "Sin lotes — compra tierra. Más anuncios se desperdician.",
    bottleneckDemand: "Inventario parado — sube anuncios antes de comprar más tierra.",
    bottleneckCapital: (amount, date) => `Sin capital — consigue ${amount} para el ${date}.`,
    bottleneckCapitalNoDate: (amount) => `Sin capital — consigue ${amount}.`,
    bottleneckNone: "Ninguna restricción ata a este ritmo.",
    costAria: "Costo de este plan",
    costAds: "Gasto en anuncios",
    costLand: "Capital de tierra",
    costPeak: "Pico adeudado",
    costInterest: "Interés pagado",
    costNet: "Neto tras costos",
    chartTitle: "Utilidad neta acumulada tras anuncios e interés",
    chartLegendAria: "Leyenda de la gráfica",
    legendPlan: "Tu plan",
    legendToday: "Ritmo de hoy",
    legendGoal: "Meta",
    legendSaved: "Meses ganados",
    deadline: "Fecha límite",
    presetsAria: "Preajustes",
    presetToday: "Ritmo de hoy",
    presetRequired: "Ritmo requerido",
    presetPlusOne: "+1 finca",
    presetAggressive: "Agresivo",
    saveName: "Nombre del escenario",
    save: "Guardar",
    remove: "Quitar",
    savedAria: "Escenarios guardados",
    compare: "Comparar",
    compareAria: "Comparación lado a lado",
    comparePick: "Elige hasta 3",
    noSaved: "Aún no hay escenarios guardados.",
    projectedExitAtCurrentPace: "Salida proyectada al ritmo actual",
    projectedExitFormula: "restante ÷ utilidad neta promedio de la era por lote ÷ cierres/mes recientes",
  },
};

export function constraintLabel(t: OracleUiStrings, c: BindingConstraint | SimulatorBottleneckKind | null): string {
  if (c === "inventory") return t.constraintInventory;
  if (c === "capital") return t.constraintCapital;
  if (c === "demand") return t.constraintDemand;
  return t.constraintDemand;
}

export function useOracleStrings(): OracleUiStrings {
  const [lang] = useLang();
  return ORACLE_UI[lang];
}
