import type { QualityIssue, QualityKind, QualitySeverity } from "./quality";

/**
 * The Data Quality page in plain language. `quality.ts` stays the single source of what is wrong;
 * this module only decides how to say it — in Spanish and English, per lot, with the two
 * conflicting values side by side, where to fix it in Payments, and a WhatsApp-ready message.
 * No column names appear in the visible text; they stay behind "Detalles técnicos".
 */
export type QualityLang = "es" | "en";
export const QUALITY_LANGS: readonly QualityLang[] = ["es", "en"];
export const DEFAULT_QUALITY_LANG: QualityLang = "es";

export interface HumanValue {
  /** Where the value comes from, e.g. "Expediente" / "Nota". */
  label: string;
  value: string;
}

export interface HumanIssue {
  id: string;
  kind: QualityKind;
  severity: QualitySeverity;
  lotName: string | null;
  farmName: string | null;
  /** Short human title of the problem. */
  title: string;
  /** One sentence: what is wrong. */
  explanation: string;
  /** What the operations user should look up before changing anything. */
  check: string;
  /** Screen and field in Payments, e.g. "File Cases → Lamar Lot 5 → Sale price". */
  fix: string;
  /** The two disagreeing values, when the problem is a disagreement between two records. */
  values: { left: HumanValue; right: HumanValue } | null;
  /** Which value Quest is currently using (or how it copes). */
  using: string;
  since: string | null;
  /** localStorage key for "Revisado" / "Nota": lot + issue kind (+ note code when a kind can repeat on one lot). */
  reviewKey: string;
  technical: { id: string; kind: QualityKind; message: string; details: [string, string][] };
  /** The issue as `quality.ts` reported it. */
  source: QualityIssue;
}

/** One card: a lot (or a farm, for farm-level problems) with every issue on it. */
export interface LotCard {
  key: string;
  /** Lot name, or the farm name for farm-level problems. */
  title: string;
  farmName: string | null;
  /** True when the card is a farm rather than a lot. */
  isFarm: boolean;
  severity: QualitySeverity;
  issues: HumanIssue[];
}

export interface QualitySummary {
  /** Distinct lots carrying at least one issue (farm-level cards not counted). */
  lotsWithIssues: number;
  farmsWithIssues: number;
  issues: number;
  /** Σ |file-case price − note price| over price mismatches — net profit that moves with the fix. */
  priceMismatchDollars: number;
  priceMismatches: number;
  /** The unresolved issue that has existed longest (by `since`), or null when none is dated. */
  oldest: { issue: HumanIssue; card: LotCard; since: string; days: number } | null;
  unresolved: number;
}

const SEVERITY_RANK: Record<QualitySeverity, number> = { error: 0, warning: 1, info: 2 };

/** Order of issues inside a card: money first, then dates, then bookkeeping. */
const KIND_ORDER: readonly QualityKind[] = [
  "price_mismatch",
  "down_payment_mismatch",
  "lot_count_mismatch",
  "farm_capital_null",
  "sold_note_without_sale",
  "reservation_after_note_start",
  "note_before_farm_purchase",
  "completed_without_closing_date",
  "active_file_case_with_note",
  "sale_without_sold_flag",
  "note_without_file_case",
  "multiple_notes_on_lot",
  "test_client_on_real_case",
  "legacy_farm_with_lots",
  "cash_deal_missing_down_payment",
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$118,506.75"; "—" for null in the UI language. */
export function humanMoney(n: number | null | undefined, lang: QualityLang = "es"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return lang === "es" ? "sin dato" : "no value";
  return usd.format(n);
}

const DATE_FMT: Record<QualityLang, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
};

/** "7 sep 2026" (es) or "Sep 7, 2026" (en); "sin fecha"/"no date" for null. */
export function humanDate(iso: string | null | undefined, lang: QualityLang = "es"): string {
  if (!iso) return lang === "es" ? "sin fecha" : "no date";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT[lang].format(d).replace(/\./g, "");
}

/** "Lamar — Lot 5" → "Lamar Lot 5", the way Payments lists it. Addresses are left as they are. */
export function paymentsLotName(lotName: string | null, farmName: string | null): string {
  const raw = (lotName ?? farmName ?? "").replace(/\s+/g, " ").trim();
  return raw.replace(/\s+—\s+/g, " ");
}

type Texts = {
  title: string;
  explanation: string;
  check: string;
  fix: string;
  values: { left: HumanValue; right: HumanValue } | null;
  using: string;
};

interface Ctx {
  lot: string;
  farm: string;
  noteCode: string;
  d: QualityIssue["details"];
  str: (k: string) => string | null;
  num: (k: string) => number | null;
  money: (k: string) => string;
  date: (k: string) => string;
}

const T: Record<QualityLang, Record<QualityKind, (c: Ctx) => Texts>> = {
  es: {
    price_mismatch: (c) => ({
      title: "Precio distinto entre expediente y nota",
      explanation: `El precio de venta del expediente de ${c.lot} no coincide con el monto original de su nota ${c.noteCode}.`,
      check: "Cuál es el precio que firmó el comprador (contrato de venta o pagaré).",
      fix: `File Cases → ${c.lot} → Sale price, o Notes → ${c.noteCode} → Original amount (deja el mismo valor en ambos)`,
      values: { left: { label: "Expediente", value: c.money("fileCaseSalePrice") }, right: { label: "Nota", value: c.money("noteOriginalAmount") } },
      using: `Quest usa la nota (${c.money("noteOriginalAmount")}) para la ganancia de este lote.`,
    }),
    down_payment_mismatch: (c) => ({
      title: "Enganche distinto entre expediente y nota",
      explanation: `El enganche registrado en el expediente de ${c.lot} no coincide con el de su nota ${c.noteCode}.`,
      check: "El recibo del enganche que pagó el comprador.",
      fix: `File Cases → ${c.lot} → Down payment, o Notes → ${c.noteCode} → Down payment`,
      values: { left: { label: "Expediente", value: c.money("fileCaseDownPayment") }, right: { label: "Nota", value: c.money("noteDownPayment") } },
      using: `Quest usa la nota (${c.money("noteDownPayment")}) para el efectivo recibido.`,
    }),
    reservation_after_note_start: (c) => ({
      title: "La reserva tiene fecha posterior al inicio de la nota",
      explanation: `El expediente dice que ${c.lot} se reservó después de que su nota ${c.noteCode} ya había empezado, y eso no puede ser.`,
      check: "La fecha real en que el comprador reservó el lote.",
      fix: `File Cases → ${c.lot} → Reservation date (o Notes → ${c.noteCode} → Start date)`,
      values: { left: { label: "Reserva", value: c.date("reservationDate") }, right: { label: "Inicio de la nota", value: c.date("noteStartDate") } },
      using: "Quest usa la fecha de reserva tal cual y no cuenta los días de espera de este lote.",
    }),
    farm_capital_null: (c) => ({
      title: "Finca sin capital de inversionista registrado",
      explanation: `La finca ${c.farm} no tiene registrado cuánto capital puso el inversionista.`,
      check: "Cuánto capital se recibió por esta finca y de quién.",
      fix: `Farm Acquisitions → ${c.farm} → Investor capital`,
      values: null,
      using: "Quest estima el costo de la tierra con los costos registrados de la propiedad.",
    }),
    sold_note_without_sale: (c) => ({
      title: "Nota marcada como vendida sin venta registrada",
      explanation: `La nota ${c.noteCode} de ${c.lot} aparece como vendida, pero no hay ninguna venta de nota con comprador, fecha y precio.`,
      check: "Si la nota de verdad se vendió: a quién, cuándo y por cuánto.",
      fix: `Note Sales → nueva venta para ${c.noteCode} (o Notes → ${c.noteCode} → Sold: desmarcar si no se vendió)`,
      values: { left: { label: "Nota", value: "vendida" }, right: { label: "Venta de nota", value: "no existe" } },
      using: "Quest no cuenta ningún efectivo por esta venta mientras no exista el registro.",
    }),
    sale_without_sold_flag: (c) => ({
      title: "Venta de nota registrada, pero la nota no está marcada como vendida",
      explanation: `Existe una venta registrada para la nota ${c.noteCode} de ${c.lot}, pero la nota sigue apareciendo como no vendida.`,
      check: "Que la venta sea real y esté completa.",
      fix: `Notes → ${c.noteCode} → Sold: marcar`,
      values: { left: { label: "Venta de nota", value: c.str("saleDate") ? `registrada el ${c.date("saleDate")}` : "registrada" }, right: { label: "Nota", value: "no vendida" } },
      using: "Quest cuenta la venta: el lote aparece con la nota vendida.",
    }),
    note_without_file_case: (c) => ({
      title: "Nota sin expediente",
      explanation: `Hay una nota de pago (${c.noteCode}) para ${c.lot}, pero ningún expediente activo o completado que respalde la venta.`,
      check: "Si la venta existe y a qué expediente pertenece.",
      fix: `File Cases → crear o reactivar el expediente de ${c.lot} (o Notes → ${c.noteCode} → Property, si la nota está en el lote equivocado)`,
      values: null,
      using: "Quest cuenta el lote como vendido a partir de la nota.",
    }),
    multiple_notes_on_lot: (c) => ({
      title: "Varias notas en un mismo lote",
      explanation: `${c.lot} tiene varias notas de pago (${c.str("noteCodes") ?? "?"}); cada lote debería tener una sola.`,
      check: "Si son lotes distintos registrados bajo una misma propiedad o notas repetidas.",
      fix: `Notes → ${c.str("noteCodes") ?? c.noteCode} → Property: asignar cada nota a su lote (o Properties → dividir el lote)`,
      values: null,
      using: "Quest usa una sola nota para este lote: la vendida si hay, si no la más reciente.",
    }),
    completed_without_closing_date: (c) => ({
      title: "Expediente completado sin fecha de cierre",
      explanation: `El expediente de ${c.lot} está marcado como completado pero no dice cuándo se cerró la venta.`,
      check: "La fecha de la escritura o del cierre.",
      fix: `File Cases → ${c.lot} → Closing date`,
      values: { left: { label: "Expediente", value: "sin fecha de cierre" }, right: { label: "Nota", value: c.str("noteStartDate") ? `inicia el ${c.date("noteStartDate")}` : "no hay nota" } },
      using: c.str("noteStartDate") ? "Quest usa la fecha de inicio de la nota como fecha de cierre." : "Quest no puede fechar este cierre, así que no cuenta para el ritmo.",
    }),
    active_file_case_with_note: (c) => ({
      title: "Expediente todavía activo aunque ya hay nota",
      explanation: `Ya existe una nota de pago (${c.noteCode}) para ${c.lot}, pero el expediente sigue como activo en lugar de completado.`,
      check: "Si la venta ya cerró; en ese caso el expediente debe completarse con su fecha de cierre.",
      fix: `File Cases → ${c.lot} → Status: Completed + Closing date`,
      values: { left: { label: "Expediente", value: "activo" }, right: { label: "Nota", value: c.str("noteStartDate") ? `existe desde el ${c.date("noteStartDate")}` : "existe" } },
      using: "Quest ya cuenta el lote como vendido por la nota.",
    }),
    test_client_on_real_case: (c) => ({
      title: "Comprador de prueba en un expediente real",
      explanation: `El comprador del expediente de ${c.lot} es un cliente de prueba o no se puede leer, pero el expediente es real y se cuenta.`,
      check: "Quién es el comprador real de este lote.",
      fix: `File Cases → ${c.lot} → Client: elegir al comprador real (o Clients → crear al comprador)`,
      values: null,
      using: "Quest cuenta la venta y muestra al comprador como desconocido.",
    }),
    legacy_farm_with_lots: (c) => ({
      title: "Finca antigua con varios lotes",
      explanation: `${c.farm} está documentada como una operación única antigua, pero tiene ${c.num("totalLots") ?? "varios"} lotes registrados.`,
      check: "Si es una finca subdividida que debería contarse o si los lotes están de más.",
      fix: `Farm Acquisitions → ${c.farm} → Total lots (o Properties → ${c.farm} → quitar los lotes de más)`,
      values: { left: { label: "Documentada", value: "operación única" }, right: { label: "Registrados", value: `${c.num("totalLots") ?? "?"} lotes` } },
      using: "Quest la deja fuera del conteo de lotes y de la meta.",
    }),
    lot_count_mismatch: (c) => ({
      title: "La cantidad de lotes no coincide",
      explanation: `La finca ${c.farm} dice tener ${c.num("totalLots") ?? "?"} lotes, pero hay ${c.num("lotRows") ?? "?"} propiedades registradas.`,
      check: "El plano de subdivisión: cuántos lotes son realmente.",
      fix: `Farm Acquisitions → ${c.farm} → Total lots, o Properties → ${c.farm} → agregar o quitar lotes`,
      values: { left: { label: "Finca", value: `${c.num("totalLots") ?? "?"} lotes` }, right: { label: "Propiedades", value: `${c.num("lotRows") ?? "?"} registradas` } },
      using: `Quest cuenta las propiedades registradas (${c.num("lotRows") ?? "?"}).`,
    }),
    note_before_farm_purchase: (c) => ({
      title: "Nota anterior a la compra de la finca",
      explanation: `La nota ${c.noteCode} empieza el ${c.date("noteStart")}, antes de que la finca ${c.farm} se comprara el ${c.date("farmClosing")}.`,
      check: "La fecha real de compra de la finca y la fecha de inicio de la nota.",
      fix: `Farm Acquisitions → ${c.farm} → Closing date (o Notes → ${c.noteCode} → Start date)`,
      values: { left: { label: "Inicio de la nota", value: c.date("noteStart") }, right: { label: "Compra de la finca", value: c.date("farmClosing") } },
      using: "Quest usa las dos fechas tal como están registradas.",
    }),
    cash_deal_missing_down_payment: (c) => ({
      title: "Venta de contado sin enganche registrado",
      explanation: `La venta de ${c.lot} es de contado y ya se completó, pero no tiene enganche registrado.`,
      check: "Si de verdad se pagó todo al cierre.",
      fix: `File Cases → ${c.lot} → Down payment (si hubo)`,
      values: { left: { label: "Precio", value: c.money("salePrice") }, right: { label: "Enganche", value: c.money("downPayment") } },
      using: "Quest cuenta el precio completo como efectivo recibido.",
    }),
  },
  en: {
    price_mismatch: (c) => ({
      title: "Sale price differs between file case and note",
      explanation: `The sale price on the ${c.lot} file case does not match the original amount of its note ${c.noteCode}.`,
      check: "The price the buyer actually signed (sales contract or promissory note).",
      fix: `File Cases → ${c.lot} → Sale price, or Notes → ${c.noteCode} → Original amount (leave the same value in both)`,
      values: { left: { label: "File case", value: c.money("fileCaseSalePrice") }, right: { label: "Note", value: c.money("noteOriginalAmount") } },
      using: `Quest uses the note (${c.money("noteOriginalAmount")}) for this lot's profit.`,
    }),
    down_payment_mismatch: (c) => ({
      title: "Down payment differs between file case and note",
      explanation: `The down payment on the ${c.lot} file case does not match the one on its note ${c.noteCode}.`,
      check: "The receipt for the down payment the buyer paid.",
      fix: `File Cases → ${c.lot} → Down payment, or Notes → ${c.noteCode} → Down payment`,
      values: { left: { label: "File case", value: c.money("fileCaseDownPayment") }, right: { label: "Note", value: c.money("noteDownPayment") } },
      using: `Quest uses the note (${c.money("noteDownPayment")}) for cash received.`,
    }),
    reservation_after_note_start: (c) => ({
      title: "Reservation dated after the note started",
      explanation: `The file case says ${c.lot} was reserved after its note ${c.noteCode} had already started, which cannot be.`,
      check: "The real date the buyer reserved the lot.",
      fix: `File Cases → ${c.lot} → Reservation date (or Notes → ${c.noteCode} → Start date)`,
      values: { left: { label: "Reservation", value: c.date("reservationDate") }, right: { label: "Note start", value: c.date("noteStartDate") } },
      using: "Quest keeps the reservation date as is and does not count this lot's waiting days.",
    }),
    farm_capital_null: (c) => ({
      title: "Farm without investor capital on file",
      explanation: `The ${c.farm} farm has no record of how much capital the investor put in.`,
      check: "How much capital came in for this farm, and from whom.",
      fix: `Farm Acquisitions → ${c.farm} → Investor capital`,
      values: null,
      using: "Quest estimates the land cost from the property costs on file.",
    }),
    sold_note_without_sale: (c) => ({
      title: "Note flagged as sold with no sale on file",
      explanation: `Note ${c.noteCode} on ${c.lot} is flagged as sold, but there is no note sale with a buyer, date and price.`,
      check: "Whether the note really was sold: to whom, when, and for how much.",
      fix: `Note Sales → new sale for ${c.noteCode} (or Notes → ${c.noteCode} → Sold: untick if it was not sold)`,
      values: { left: { label: "Note", value: "sold" }, right: { label: "Note sale", value: "missing" } },
      using: "Quest counts no cash from this sale until the record exists.",
    }),
    sale_without_sold_flag: (c) => ({
      title: "Note sale on file, but the note is not flagged as sold",
      explanation: `A sale is on file for note ${c.noteCode} on ${c.lot}, but the note still shows as unsold.`,
      check: "That the sale is real and complete.",
      fix: `Notes → ${c.noteCode} → Sold: tick`,
      values: { left: { label: "Note sale", value: c.str("saleDate") ? `on file, ${c.date("saleDate")}` : "on file" }, right: { label: "Note", value: "not sold" } },
      using: "Quest counts the sale: the lot shows its note as sold.",
    }),
    note_without_file_case: (c) => ({
      title: "Note without a file case",
      explanation: `There is a payment note (${c.noteCode}) for ${c.lot}, but no active or completed file case backing the sale.`,
      check: "Whether the sale exists and which file case it belongs to.",
      fix: `File Cases → create or reactivate the ${c.lot} file case (or Notes → ${c.noteCode} → Property, if the note sits on the wrong lot)`,
      values: null,
      using: "Quest counts the lot as sold on the strength of the note.",
    }),
    multiple_notes_on_lot: (c) => ({
      title: "Several notes on one lot",
      explanation: `${c.lot} carries several payment notes (${c.str("noteCodes") ?? "?"}); each lot should have one.`,
      check: "Whether these are different lots filed under one property, or duplicate notes.",
      fix: `Notes → ${c.str("noteCodes") ?? c.noteCode} → Property: point each note at its own lot (or Properties → split the lot)`,
      values: null,
      using: "Quest uses a single note for this lot: the sold one if any, otherwise the most recent.",
    }),
    completed_without_closing_date: (c) => ({
      title: "Completed file case without a closing date",
      explanation: `The ${c.lot} file case is marked completed but does not say when the sale closed.`,
      check: "The deed or closing date.",
      fix: `File Cases → ${c.lot} → Closing date`,
      values: { left: { label: "File case", value: "no closing date" }, right: { label: "Note", value: c.str("noteStartDate") ? `starts ${c.date("noteStartDate")}` : "no note" } },
      using: c.str("noteStartDate") ? "Quest uses the note's start date as the closing date." : "Quest cannot date this closing, so it does not count toward the pace.",
    }),
    active_file_case_with_note: (c) => ({
      title: "File case still active although a note exists",
      explanation: `A payment note (${c.noteCode}) already exists for ${c.lot}, but the file case is still active instead of completed.`,
      check: "Whether the sale has closed; if so the file case should be completed with its closing date.",
      fix: `File Cases → ${c.lot} → Status: Completed + Closing date`,
      values: { left: { label: "File case", value: "active" }, right: { label: "Note", value: c.str("noteStartDate") ? `exists since ${c.date("noteStartDate")}` : "exists" } },
      using: "Quest already counts the lot as sold because of the note.",
    }),
    test_client_on_real_case: (c) => ({
      title: "Test buyer on a real file case",
      explanation: `The buyer on the ${c.lot} file case is a test client or cannot be read, but the file case is real and is counted.`,
      check: "Who the real buyer of this lot is.",
      fix: `File Cases → ${c.lot} → Client: pick the real buyer (or Clients → create the buyer)`,
      values: null,
      using: "Quest counts the sale and shows the buyer as unknown.",
    }),
    legacy_farm_with_lots: (c) => ({
      title: "Legacy farm with several lots",
      explanation: `${c.farm} is documented as a one-off legacy deal, yet it has ${c.num("totalLots") ?? "several"} lots on file.`,
      check: "Whether it is a subdivided farm that should count, or the extra lots are spurious.",
      fix: `Farm Acquisitions → ${c.farm} → Total lots (or Properties → ${c.farm} → remove the extra lots)`,
      values: { left: { label: "Documented", value: "one-off deal" }, right: { label: "On file", value: `${c.num("totalLots") ?? "?"} lots` } },
      using: "Quest leaves it out of the lot count and the goal.",
    }),
    lot_count_mismatch: (c) => ({
      title: "Lot count does not match",
      explanation: `The ${c.farm} farm says it has ${c.num("totalLots") ?? "?"} lots, but ${c.num("lotRows") ?? "?"} properties are on file.`,
      check: "The subdivision plat: how many lots there really are.",
      fix: `Farm Acquisitions → ${c.farm} → Total lots, or Properties → ${c.farm} → add or remove lots`,
      values: { left: { label: "Farm", value: `${c.num("totalLots") ?? "?"} lots` }, right: { label: "Properties", value: `${c.num("lotRows") ?? "?"} on file` } },
      using: `Quest counts the properties on file (${c.num("lotRows") ?? "?"}).`,
    }),
    note_before_farm_purchase: (c) => ({
      title: "Note starts before the farm was bought",
      explanation: `Note ${c.noteCode} starts ${c.date("noteStart")}, before the ${c.farm} farm was bought on ${c.date("farmClosing")}.`,
      check: "The real purchase date of the farm and the start date of the note.",
      fix: `Farm Acquisitions → ${c.farm} → Closing date (or Notes → ${c.noteCode} → Start date)`,
      values: { left: { label: "Note start", value: c.date("noteStart") }, right: { label: "Farm purchase", value: c.date("farmClosing") } },
      using: "Quest uses both dates as recorded.",
    }),
    cash_deal_missing_down_payment: (c) => ({
      title: "Cash sale without a down payment on file",
      explanation: `The ${c.lot} sale is a cash deal and has completed, but no down payment is on file.`,
      check: "Whether everything really was paid at closing.",
      fix: `File Cases → ${c.lot} → Down payment (if there was one)`,
      values: { left: { label: "Price", value: c.money("salePrice") }, right: { label: "Down payment", value: c.money("downPayment") } },
      using: "Quest counts the full price as cash received.",
    }),
  },
};

const SEVERITY_LABEL: Record<QualityLang, Record<QualitySeverity, string>> = {
  es: { error: "Error", warning: "Aviso", info: "Dato" },
  en: { error: "Error", warning: "Warning", info: "Info" },
};

export function severityLabel(severity: QualitySeverity, lang: QualityLang): string {
  return SEVERITY_LABEL[lang][severity];
}

/** Kinds that can appear more than once on the same lot (one per note); their review key carries the note code. */
const PER_NOTE_KINDS: readonly QualityKind[] = ["sold_note_without_sale", "sale_without_sold_flag", "note_without_file_case", "note_before_farm_purchase"];

export function reviewKeyOf(issue: Pick<QualityIssue, "kind" | "lotName" | "farmName" | "details">): string {
  const lot = (issue.lotName ?? `farm:${issue.farmName ?? "?"}`).replace(/\s+/g, " ").trim();
  const note = PER_NOTE_KINDS.includes(issue.kind) ? String(issue.details["noteCode"] ?? "") : "";
  return note ? `${lot}::${issue.kind}::${note}` : `${lot}::${issue.kind}`;
}

/** Plain-language reading of one issue, in the given language. */
export function humanizeIssue(issue: QualityIssue, lang: QualityLang = DEFAULT_QUALITY_LANG): HumanIssue {
  const d = issue.details;
  const str = (k: string): string | null => {
    const v = d[k];
    return v === null || v === undefined || v === "" ? null : String(v);
  };
  const num = (k: string): number | null => {
    const v = d[k];
    return typeof v === "number" ? v : null;
  };
  const ctx: Ctx = {
    lot: paymentsLotName(issue.lotName, issue.farmName) || (lang === "es" ? "este lote" : "this lot"),
    farm: issue.farmName ?? (lang === "es" ? "esta finca" : "this farm"),
    noteCode: str("noteCode") ?? (lang === "es" ? "sin código" : "no code"),
    d,
    str,
    num,
    money: (k) => humanMoney(typeof d[k] === "number" ? (d[k] as number) : null, lang),
    date: (k) => humanDate(str(k), lang),
  };
  const t = T[lang][issue.kind](ctx);
  const details: [string, string][] = Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => [k, typeof v === "number" ? String(v) : String(v)]);
  return {
    id: issue.id,
    kind: issue.kind,
    severity: issue.severity,
    lotName: issue.lotName,
    farmName: issue.farmName,
    title: t.title,
    explanation: t.explanation,
    check: t.check,
    fix: t.fix,
    values: t.values,
    using: t.using,
    since: issue.since,
    reviewKey: reviewKeyOf(issue),
    technical: { id: issue.id, kind: issue.kind, message: issue.message, details },
    source: issue,
  };
}

/**
 * One card per lot (farm-level problems get a card per farm), every issue on it inside,
 * cards sorted by their worst severity, then farm, then lot; issues inside by severity.
 */
export function groupIssuesByLot(issues: QualityIssue[], lang: QualityLang = DEFAULT_QUALITY_LANG): LotCard[] {
  const cards = new Map<string, LotCard>();
  for (const issue of issues) {
    const isFarm = issue.lotName === null;
    const title = (isFarm ? issue.farmName ?? "—" : issue.lotName ?? "—").replace(/\s+/g, " ").trim();
    const key = isFarm ? `farm:${title}` : `lot:${issue.propertyId ?? title}`;
    const human = humanizeIssue(issue, lang);
    const card = cards.get(key);
    if (card) {
      card.issues.push(human);
      if (SEVERITY_RANK[human.severity] < SEVERITY_RANK[card.severity]) card.severity = human.severity;
    } else {
      cards.set(key, { key, title, farmName: issue.farmName, isFarm, severity: human.severity, issues: [human] });
    }
  }
  const list = [...cards.values()];
  for (const c of list) c.issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
  return list.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    const f = (a.farmName ?? a.title).localeCompare(b.farmName ?? b.title);
    if (f !== 0) return f;
    if (a.isFarm !== b.isFarm) return a.isFarm ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });
}

/** Days between two ISO dates (UTC midnight), floored. */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)) - 1, Number(fromIso.slice(8, 10)));
  const b = Date.UTC(Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10)));
  return Math.floor((b - a) / 86_400_000);
}

/**
 * The top-of-page summary. `reviewed` holds the review keys already ticked "Revisado"; the
 * oldest issue is searched among the rest.
 */
export function summarizeQuality(cards: LotCard[], asOf: string, reviewed: ReadonlySet<string> = new Set()): QualitySummary {
  let priceMismatchDollars = 0;
  let priceMismatches = 0;
  let unresolved = 0;
  let issues = 0;
  let oldest: QualitySummary["oldest"] = null;
  for (const card of cards) {
    for (const issue of card.issues) {
      issues += 1;
      if (issue.kind === "price_mismatch") {
        const a = issue.source.details["fileCaseSalePrice"];
        const b = issue.source.details["noteOriginalAmount"];
        if (typeof a === "number" && typeof b === "number") {
          priceMismatchDollars += Math.abs(a - b);
          priceMismatches += 1;
        }
      }
      if (reviewed.has(issue.reviewKey)) continue;
      unresolved += 1;
      if (issue.since && (oldest === null || issue.since < oldest.since)) {
        oldest = { issue, card, since: issue.since, days: Math.max(0, daysBetween(issue.since, asOf.slice(0, 10))) };
      }
    }
  }
  return {
    lotsWithIssues: cards.filter((c) => !c.isFarm).length,
    farmsWithIssues: cards.filter((c) => c.isFarm).length,
    issues,
    priceMismatchDollars: Math.round(priceMismatchDollars * 100) / 100,
    priceMismatches,
    oldest,
    unresolved,
  };
}

/** "Expediente: $118,506.75 / Nota: $113,507.00" */
export function valuesLine(values: HumanIssue["values"]): string | null {
  if (!values) return null;
  return `${values.left.label}: ${values.left.value} / ${values.right.label}: ${values.right.value}`;
}

/**
 * The WhatsApp message for one card — always in Spanish, plain text, ready to paste:
 * lot, each problem, the two values, and the fix in Payments.
 */
export function whatsappForCard(card: LotCard, options: { reviewed?: ReadonlySet<string>; includeReviewed?: boolean } = {}): string {
  const es = card.issues.map((i) => humanizeIssue(i.source, "es"));
  const list = options.includeReviewed === false && options.reviewed ? es.filter((i) => !options.reviewed?.has(i.reviewKey)) : es;
  const where = card.isFarm ? "finca" : card.farmName ? `finca ${card.farmName}` : "";
  const head = `*${card.title}*${where ? ` (${where})` : ""} — ${list.length} ${list.length === 1 ? "problema" : "problemas"}`;
  const body = list.map((i, n) => {
    const lines = [`${n + 1}) ${i.title}`];
    const v = valuesLine(i.values);
    if (v) lines.push(`   ${v} — ${i.using}`);
    else lines.push(`   ${i.explanation} ${i.using}`);
    lines.push(`   Corregir en Payments: ${i.fix}`);
    return lines.join("\n");
  });
  return [head, ...body].join("\n");
}

/** The whole list as one WhatsApp message (Spanish): header with the summary, then every card. */
export function whatsappForAll(cards: LotCard[], summary: QualitySummary, asOf: string, options: { reviewed?: ReadonlySet<string>; includeReviewed?: boolean } = {}): string {
  const visible =
    options.includeReviewed === false && options.reviewed
      ? cards.filter((c) => c.issues.some((i) => !options.reviewed?.has(i.reviewKey)))
      : cards;
  const head = `*Calidad de datos — ${humanDate(asOf, "es")}*`;
  const line2 = `${summary.lotsWithIssues} ${summary.lotsWithIssues === 1 ? "lote" : "lotes"} con problemas${summary.farmsWithIssues > 0 ? ` y ${summary.farmsWithIssues} ${summary.farmsWithIssues === 1 ? "finca" : "fincas"}` : ""} · ${humanMoney(summary.priceMismatchDollars, "es")} de ganancia afectada por diferencias de precio`;
  return [`${head}\n${line2}`, ...visible.map((c) => whatsappForCard(c, options))].join("\n\n");
}
