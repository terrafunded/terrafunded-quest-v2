import type { QualityLang } from "@/domain/quality_human";
import type { EngineBand, EngineBottleneck } from "@/domain/engine";

/** UI strings for /engine. The verdict paragraph comes from the domain (`EngineResult.verdict`). */
export interface EngineUiStrings {
  title: string;
  subtitle: string;
  reset: string;
  verdictLabel: string;
  assumption: string;
  measured: string;
  inputs: string;
  cycleMonths: string;
  cycleHint: (farm: string | null, excluded: string, source: string | null) => string;
  cycleSlider: string;
  costPerReservation: string;
  costPerReservationHint: string;
  conversion: string;
  conversionHint: (pct: string) => string;
  costPerClosing: (n: string) => string;
  lotsPerFarm: string;
  farmCost: string;
  acres: string;
  costPerAcre: string;
  acresHint: string;
  salesPace: string;
  salesPaceAssumption: string;
  salesPaceHint: (pace: string) => string;
  figures: string;
  inventoryToday: string;
  inventoryDetail: (available: number, reserved: number, expected: string) => string;
  inventoryProfit: string;
  inventoryMonths: string;
  lotsProduced: string;
  turns: string;
  netNoFresh: string;
  shortfall: string;
  shortfallLots: string;
  shortfallFarms: string;
  freshCapital: string;
  peakOutstanding: string;
  peakHint: string;
  capitalDeadline: string;
  totalAdSpend: string;
  adShare: (pct: string) => string;
  totalInterest: string;
  bottleneck: string;
  bottleneckLabel: Record<EngineBottleneck, string>;
  charts: string;
  turnsChart: string;
  turnsChartHint: string;
  profitChart: string;
  profitChartHint: string;
  inventoryChart: string;
  inventoryChartHint: string;
  capitalChart: string;
  capitalChartHint: string;
  sensitivity: string;
  sensitivityHint: string;
  sensitivityPace: string;
  sensitivityCycle: string;
  loadScenario: string;
  scenarioName: string;
  scenarioPlaceholder: string;
  save: string;
  savedScenarios: string;
  loadOne: string;
  noneSaved: string;
  remove: string;
  effectiveCycle: (n: string) => string;
  couplingNote: string;
  band: Record<EngineBand, string>;
  months: string;
  never: string;
  chartAria: string;
}

export const ENGINE_UI: Record<QualityLang, EngineUiStrings> = {
  en: {
    title: "The Engine",
    subtitle:
      "Capital already in the ground, turning as many times as it can before the deadline. Do you reach $10M — and if not, how much fresh capital, by when. Same forecast as the Oracle and War Plan, inverted.",
    reset: "Reset to real data",
    verdictLabel: "The verdict",
    assumption: "Assumption",
    measured: "Measured",
    inputs: "Inputs",
    cycleMonths: "Cycle length (months)",
    cycleHint: (farm, excluded, source) =>
      `Default from the rotation benchmark${source ? ` (${source})` : ""}${farm ? ` — ${farm}` : ""}. Lamar and other pre-era turns are excluded by ERA_START${excluded ? `: ${excluded}` : ""}. Slide to see the range; the whole page swings on this number.`,
    cycleSlider: "Cycle",
    costPerReservation: "Cost per reservation",
    costPerReservationHint: "No ad-spend table in Payments. Cost per closing = this ÷ conversion.",
    conversion: "Conversion",
    conversionHint: (pct) => `Pipeline conversion including cancellations (measured ${pct}).`,
    costPerClosing: (n) => `Cost per closing ${n}`,
    lotsPerFarm: "Lots per farm",
    farmCost: "Cost per farm",
    acres: "Acres",
    costPerAcre: "$ / acre",
    acresHint: "Test a find: 60 acres at $4,200. When both are set they override cost per farm.",
    salesPace: "Sales pace (closings / month)",
    salesPaceAssumption:
      "KEY ASSUMPTION — sales pace is purchased with ad spend and modelled as LINEAR. Any pace is reachable by spending closings ÷ conversion × cost per reservation per month. This ignores rising cost per reservation at volume and the operational ceiling of a 15-person team.",
    salesPaceHint: (pace) => `Trailing closings/month: ${pace}.`,
    figures: "The figures",
    inventoryToday: "Lots in inventory today",
    inventoryDetail: (a, r, e) => `${a} available + ${r} reserved × conversion = ${e} expected`,
    inventoryProfit: "Net profit if inventory sells",
    inventoryMonths: "Months inventory lasts at pace",
    lotsProduced: "Lots produced before deadline",
    turns: "Capital turns",
    netNoFresh: "Net profit with no new capital",
    shortfall: "Shortfall",
    shortfallLots: "Shortfall in lots",
    shortfallFarms: "Shortfall in farms",
    freshCapital: "Fresh capital required",
    peakOutstanding: "Peak outstanding",
    peakHint: "The maximum owed across all sponsors in any month — what actually has to be raised, not the sum of farm costs.",
    capitalDeadline: "The capital deadline",
    totalAdSpend: "Total ad spend implied",
    adShare: (pct) => `${pct} of net profit — cheap next to capital`,
    totalInterest: "Total sponsor interest",
    bottleneck: "The bottleneck",
    bottleneckLabel: {
      land: "Land",
      sales_pace: "Sales pace",
      capital: "Capital",
      none: "None — goal covered",
    },
    charts: "Charts",
    turnsChart: "The Turns",
    turnsChartHint: "One swimlane per farm. See the same dollar work three times. Vertical lines mark inventory-dry months and the capital deadline.",
    profitChart: "Cumulative profit vs the goal",
    profitChartHint: "Stacked: inventory, turn 2+, fresh capital — against the straight line to $10M.",
    inventoryChart: "Inventory over time",
    inventoryChartHint: "Sawtooth down as lots sell, up as farms land. Troughs at zero are the gaps this page exists to prevent.",
    capitalChart: "Capital outstanding",
    capitalChartHint: "Total owed to sponsors per month; peak annotated. Interest accrued on the secondary axis.",
    sensitivity: "The sensitivity grid",
    sensitivityHint: "Pace (current · ×1.5 · ×2) against cycle (benchmark ±60 days). Hover for the verdict; click to load those inputs.",
    sensitivityPace: "Sales pace",
    sensitivityCycle: "Cycle",
    loadScenario: "Load into inputs",
    scenarioName: "Scenario name",
    scenarioPlaceholder: "e.g. Texas trip",
    save: "Save",
    savedScenarios: "Saved scenarios",
    loadOne: "Load",
    noneSaved: "None saved on this device",
    remove: "Remove",
    effectiveCycle: (n) => `Effective cycle ${n} mo (coupled to pace)`,
    couplingNote:
      "Limitation: the Oracle hard-codes a constant cycleMonths. Here pace and cycle are coupled — selling faster returns capital sooner.",
    band: { met: "Goal reached", close: "Close", short: "Short", far: "Far short" },
    months: "months",
    never: "never",
    chartAria: "The Engine charts",
  },
  es: {
    title: "El Motor",
    subtitle:
      "El capital ya en tierra, girando cuantas veces pueda antes del plazo. ¿Llegas a $10M — y si no, cuánto capital fresco, para cuándo. El mismo pronóstico del Oráculo y el War Plan, invertido.",
    reset: "Restablecer a datos reales",
    verdictLabel: "El veredicto",
    assumption: "Supuesto",
    measured: "Medido",
    inputs: "Entradas",
    cycleMonths: "Duración del ciclo (meses)",
    cycleHint: (farm, excluded, source) =>
      `Por defecto del ciclo de rotación${source ? ` (${source})` : ""}${farm ? ` — ${farm}` : ""}. Lamar y otros giros pre-era quedan fuera por ERA_START${excluded ? `: ${excluded}` : ""}. Desliza para ver el rango; toda la página gira sobre este número.`,
    cycleSlider: "Ciclo",
    costPerReservation: "Costo por reserva",
    costPerReservationHint: "No hay tabla de anuncios en Payments. Costo por cierre = esto ÷ conversión.",
    conversion: "Conversión",
    conversionHint: (pct) => `Conversión del pipeline con cancelaciones (medida ${pct}).`,
    costPerClosing: (n) => `Costo por cierre ${n}`,
    lotsPerFarm: "Lotes por finca",
    farmCost: "Costo por finca",
    acres: "Acres",
    costPerAcre: "$ / acre",
    acresHint: "Prueba un hallazgo: 60 acres a $4,200. Si ambos están puestos, sustituyen el costo por finca.",
    salesPace: "Ritmo de ventas (cierres / mes)",
    salesPaceAssumption:
      "SUPUESTO CLAVE — el ritmo de ventas se compra con anuncios y se modela como LINEAL. Cualquier ritmo es alcanzable gastando cierres ÷ conversión × costo por reserva al mes. Ignora el alza del costo por reserva a volumen y el techo operativo de un equipo de 15.",
    salesPaceHint: (pace) => `Cierres/mes recientes: ${pace}.`,
    figures: "Las cifras",
    inventoryToday: "Lotes en inventario hoy",
    inventoryDetail: (a, r, e) => `${a} disponibles + ${r} reservados × conversión = ${e} esperados`,
    inventoryProfit: "Utilidad neta si se vende el inventario",
    inventoryMonths: "Meses que dura el inventario al ritmo",
    lotsProduced: "Lotes producidos antes del plazo",
    turns: "Giros de capital",
    netNoFresh: "Utilidad neta sin capital nuevo",
    shortfall: "Faltante",
    shortfallLots: "Faltante en lotes",
    shortfallFarms: "Faltante en fincas",
    freshCapital: "Capital fresco requerido",
    peakOutstanding: "Pico adeudado",
    peakHint: "Lo máximo adeudado a sponsors en un mes — lo que realmente hay que levantar, no la suma de costos de finca.",
    capitalDeadline: "La fecha límite del capital",
    totalAdSpend: "Gasto en anuncios implícito",
    adShare: (pct) => `${pct} de la utilidad neta — barato frente al capital`,
    totalInterest: "Interés total a sponsors",
    bottleneck: "El cuello de botella",
    bottleneckLabel: {
      land: "Tierra",
      sales_pace: "Ritmo de ventas",
      capital: "Capital",
      none: "Ninguno — meta cubierta",
    },
    charts: "Gráficas",
    turnsChart: "Los Giros",
    turnsChartHint: "Un carril por finca. Mira el mismo dólar trabajar tres veces. Líneas verticales: meses sin inventario y la fecha límite del capital.",
    profitChart: "Utilidad acumulada vs la meta",
    profitChartHint: "Apilada: inventario, giro 2+, capital fresco — contra la línea recta a $10M.",
    inventoryChart: "Inventario en el tiempo",
    inventoryChartHint: "Diente de sierra: baja al vender, sube al aterrizar fincas. Los valles en cero son los huecos que esta página evita.",
    capitalChart: "Capital adeudado",
    capitalChartHint: "Total adeudado a sponsors por mes; pico anotado. Interés acumulado en el eje secundario.",
    sensitivity: "La cuadrícula de sensibilidad",
    sensitivityHint: "Ritmo (actual · ×1.5 · ×2) contra ciclo (benchmark ±60 días). Pasa el cursor para el veredicto; clic para cargar esas entradas.",
    sensitivityPace: "Ritmo de ventas",
    sensitivityCycle: "Ciclo",
    loadScenario: "Cargar en entradas",
    scenarioName: "Nombre del escenario",
    scenarioPlaceholder: "p. ej. Viaje a Texas",
    save: "Guardar",
    savedScenarios: "Escenarios guardados",
    loadOne: "Cargar",
    noneSaved: "Ninguno en este dispositivo",
    remove: "Quitar",
    effectiveCycle: (n) => `Ciclo efectivo ${n} meses (acoplado al ritmo)`,
    couplingNote:
      "Limitación: el Oráculo fija un cycleMonths constante. Aquí ritmo y ciclo están acoplados — vender más rápido devuelve el capital antes.",
    band: { met: "Meta alcanzada", close: "Cerca", short: "Corto", far: "Muy corto" },
    months: "meses",
    never: "nunca",
    chartAria: "Gráficas del Motor",
  },
};
