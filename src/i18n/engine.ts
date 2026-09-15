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
  profitBasis: string;
  profitBasisEra: string;
  profitBasisLifetime: string;
  profitBasisWhy: string;
  profitBasisFigures: (era: string, lifetime: string, eraLots: number, lifetimeLots: number) => string;
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
  shortfallFarmsHint: string;
  farmsStillNeeded: string;
  farmsStillNeededHint: string;
  freshCapital: string;
  peakOutstanding: string;
  peakHint: string;
  capitalDeadline: string;
  totalAdSpend: string;
  adShare: (pct: string) => string;
  totalInterest: string;
  bottleneck: string;
  bottleneckLabel: Record<EngineBottleneck, string>;
  bottleneckDetail: (code: import("@/domain/engine").EngineBottleneckCode) => string;
  capitalDeadlineDetail: (code: import("@/domain/engine").EngineCapitalDeadlineCode) => string;
  interestBesideVerdict: (interest: string, share: string) => string;
  interestShareHint: (share: string) => string;
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
  inventoryDry: string;
  cycleArrow: (from: string, to: string) => string;
  blockRecycledFresh: (farm: string, cost: string, recycled: string, fresh: string) => string;
}

export const ENGINE_UI: Record<QualityLang, EngineUiStrings> = {
  en: {
    title: "Capital projection",
    subtitle:
      "Capital already deployed, reused as many times as it can before the deadline. Do you reach $10M — and if not, how much new capital, by when. Same forecast as the Simulator and the Plan, inverted.",
    reset: "Reset to real data",
    verdictLabel: "The verdict",
    assumption: "Assumption",
    measured: "Measured",
    inputs: "Inputs",
    profitBasis: "Profit per lot basis",
    profitBasisEra: "Era average (default)",
    profitBasisLifetime: "Lifetime average",
    profitBasisWhy: "Era excludes pre-operation closings — better estimator of today's business.",
    profitBasisFigures: (era, lifetime, eraLots, lifetimeLots) =>
      `Era ${era}/lot (${eraLots} closings) · Lifetime ${lifetime}/lot (${lifetimeLots} closings).`,
    cycleMonths: "Cycle length (months)",
    cycleHint: (farm, excluded, source) =>
      `Default from the rotation benchmark${source ? ` (${source})` : ""}${farm ? ` — ${farm}` : ""}. Lamar and other pre-era turns are excluded by ERA_START${excluded ? `: ${excluded}` : ""}. Slide to see the range; the whole page swings on this number.`,
    cycleSlider: "Cycle",
    costPerReservation: "Cost per reservation",
    costPerReservationHint: "No ad-spend table in Payments. Cost per closing = this ÷ conversion.",
    conversion: "Conversion",
    conversionHint: (pct) => `Resolved conversion used for forecasts (measured ${pct}).`,
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
    shortfallFarms: "Shortfall in farms (fresh capital)",
    shortfallFarmsHint:
      "Farms that need new capital only — zero when returned capital covers the gap. Not the Overview farms figure.",
    farmsStillNeeded: "Farms to buy (rotation schedule)",
    farmsStillNeededHint:
      "Same Plan rotation schedule as Overview — farms the required plan buys with capital turning before the deadline, not lots ÷ lots-per-farm.",
    freshCapital: "Fresh capital required",
    peakOutstanding: "Peak outstanding",
    peakHint: "The maximum owed across all sponsors in any month — what actually has to be raised, not the sum of farm costs. Same powder under more turns does not raise the peak.",
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

    bottleneckDetail: (code) => {
      switch (code.code) {
        case "none":
          return "Deployed capital and inventory cover the goal at this pace — no constraint binds.";
        case "land_before_return":
          return `Inventory runs dry in month ${code.dryMonth}, before capital returns in month ${code.returnMonth}. Fly to Texas — buy land, do not wait on a raise.`;
        case "land_inventory":
          return `Inventory lasts ${code.inventoryMonths.toFixed(1)} months; capital needs ${code.cycleMonths.toFixed(1)} months to return. The land gap binds.`;
        case "sales_pace":
          return `Inventory hits zero in month ${code.dryMonth} while capital is still out. A faster pace returns capital sooner (cycle couples to pace); a slower pace wastes the raise.`;
        case "sales_pace_no_fresh":
          return `At ${code.salesPace.toFixed(1)} lots/month the deployed capital cannot reach the goal before the deadline even with a raise that still completes a turn. Speed (or land that converts sooner) moves the needle more than capital.`;
        case "capital_no_turn":
          return `A ${code.cycleMonths.toFixed(1)}-month cycle cannot complete a turn before the deadline. Raise earlier or shorten the cycle.`;
        case "capital_short":
          return `Profit falls short with the capital already deployed. Fresh capital must land by month ${code.deadlineMonth} to complete a turn.`;
      }
    },
    capitalDeadlineDetail: (code) => {
      switch (code.code) {
        case "not_needed":
          return "No fresh capital is required — recycled capital funds the remaining farms.";
        case "no_turn":
          return `A ${code.cycleMonths.toFixed(1)}-month turn cannot complete before ${code.deadline}.`;
        case "last_buy":
          return `Last month a farm can be bought and still return capital by the deadline: purchase month ${code.buyMonth} + ${code.cycleMonths}-month cycle ≤ deadline month ${code.deadlineMonth}.`;
      }
    },
    interestBesideVerdict: (interest, share) =>
      `${interest} of every turn goes to sponsor interest — ${share} of the net profit this projection produces. More turns mean more interest; that is the strongest argument against simply adding another cycle.`,
    interestShareHint: (share) => `${share} of net profit — the price of turning capital`,
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
      "Limitation: the Simulator hard-codes a constant cycleMonths. Here pace and cycle are coupled — selling faster returns capital sooner.",
    band: { met: "Goal reached", close: "Close", short: "Short", far: "Far short" },
    months: "months",
    never: "never",
    chartAria: "Capital projection charts",
    inventoryDry: "Inventory dry",
    cycleArrow: (from, to) => `${from} mo → ${to}`,
    blockRecycledFresh: (farm, cost, recycled, fresh) =>
      `${farm}: ${cost} · recycled ${recycled} · fresh ${fresh}`,
  },
  es: {
    title: "Proyección de capital",
    subtitle:
      "El capital ya desplegado, reutilizado cuantas veces pueda antes del plazo. ¿Llegas a $10M — y si no, cuánto capital nuevo, para cuándo. El mismo pronóstico del Simulador y el Plan, invertido.",
    reset: "Restablecer a datos reales",
    verdictLabel: "El veredicto",
    assumption: "Supuesto",
    measured: "Medido",
    inputs: "Entradas",
    profitBasis: "Base de utilidad por lote",
    profitBasisEra: "Promedio de la era (por defecto)",
    profitBasisLifetime: "Promedio de por vida",
    profitBasisWhy: "La era excluye cierres pre-operación — mejor estimador del negocio de hoy.",
    profitBasisFigures: (era, lifetime, eraLots, lifetimeLots) =>
      `Era ${era}/lote (${eraLots} cierres) · Por vida ${lifetime}/lote (${lifetimeLots} cierres).`,
    cycleMonths: "Duración del ciclo (meses)",
    cycleHint: (farm, excluded, source) =>
      `Por defecto del ciclo de rotación${source ? ` (${source})` : ""}${farm ? ` — ${farm}` : ""}. Lamar y otros giros pre-era quedan fuera por ERA_START${excluded ? `: ${excluded}` : ""}. Desliza para ver el rango; toda la página gira sobre este número.`,
    cycleSlider: "Ciclo",
    costPerReservation: "Costo por reserva",
    costPerReservationHint: "No hay tabla de anuncios en Payments. Costo por cierre = esto ÷ conversión.",
    conversion: "Conversión",
    conversionHint: (pct) => `Conversión resuelta usada en pronósticos (medida ${pct}).`,
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
    shortfallFarms: "Faltante en fincas (capital fresco)",
    shortfallFarmsHint:
      "Fincas que necesitan capital nuevo — cero cuando el capital devuelto cubre el hueco. No es la cifra de fincas de Resumen.",
    farmsStillNeeded: "Fincas a comprar (calendario de rotación)",
    farmsStillNeededHint:
      "El mismo calendario de rotación del Plan que Resumen — fincas que el plan requerido compra con el capital girando antes de la fecha límite, no lotes ÷ lotes-por-finca.",
    freshCapital: "Capital fresco requerido",
    peakOutstanding: "Pico adeudado",
    peakHint: "Lo máximo adeudado a sponsors en un mes — lo que realmente hay que levantar, no la suma de costos de finca. El mismo polvo con más giros no sube el pico.",
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

    bottleneckDetail: (code) => {
      switch (code.code) {
        case "none":
          return "El capital desplegado y el inventario cubren la meta a este ritmo — no hay cuello de botella.";
        case "land_before_return":
          return `El inventario se agota en el mes ${code.dryMonth}, antes de que el capital regrese en el mes ${code.returnMonth}. Vuela a Texas — compra tierra, no esperes un raise.`;
        case "land_inventory":
          return `El inventario dura ${code.inventoryMonths.toFixed(1)} meses; el capital necesita ${code.cycleMonths.toFixed(1)} meses para regresar. Falta tierra.`;
        case "sales_pace":
          return `El inventario llega a cero en el mes ${code.dryMonth} mientras el capital sigue afuera. Un ritmo más rápido devuelve el capital antes (el ciclo se acopla al ritmo); uno más lento desperdicia el raise.`;
        case "sales_pace_no_fresh":
          return `A ${code.salesPace.toFixed(1)} lotes/mes el capital desplegado no alcanza la meta antes del plazo ni con un raise que aún complete un giro. La velocidad (o tierra que convierta antes) mueve más la aguja que el capital.`;
        case "capital_no_turn":
          return `Un ciclo de ${code.cycleMonths.toFixed(1)} meses no puede completar un giro antes del plazo. Levanta antes o acorta el ciclo.`;
        case "capital_short":
          return `La utilidad se queda corta con el capital ya desplegado. El capital fresco debe llegar para el mes ${code.deadlineMonth} para completar un giro.`;
      }
    },
    capitalDeadlineDetail: (code) => {
      switch (code.code) {
        case "not_needed":
          return "No hace falta capital fresco — el capital reciclado financia las fincas que faltan.";
        case "no_turn":
          return `Un giro de ${code.cycleMonths.toFixed(1)} meses no puede completarse antes de ${code.deadline}.`;
        case "last_buy":
          return `Último mes en que se puede comprar una finca y aún devolver capital antes del plazo: mes de compra ${code.buyMonth} + ciclo de ${code.cycleMonths} meses ≤ mes plazo ${code.deadlineMonth}.`;
      }
    },
    interestBesideVerdict: (interest, share) =>
      `${interest} de cada giro se va en interés a sponsors — ${share} de la utilidad neta que produce esta proyección. Más giros significan más interés; ese es el argumento más fuerte contra simplemente añadir otro ciclo.`,
    interestShareHint: (share) => `${share} de la utilidad neta — el precio de girar el capital`,
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
      "Limitación: el Simulador fija un cycleMonths constante. Aquí ritmo y ciclo están acoplados — vender más rápido devuelve el capital antes.",
    band: { met: "Meta alcanzada", close: "Cerca", short: "Corto", far: "Muy corto" },
    months: "meses",
    never: "nunca",
    chartAria: "Gráficas de proyección de capital",
    inventoryDry: "Inventario agotado",
    cycleArrow: (from, to) => `${from} mo → ${to}`,
    blockRecycledFresh: (farm, cost, recycled, fresh) =>
      `${farm}: ${cost} · reciclado ${recycled} · fresco ${fresh}`,
  },
};
