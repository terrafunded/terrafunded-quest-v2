import type { FarmAcquisitionRow, FileCaseRow, NoteRow, NoteSaleRow, PropertyRow, ClientRow } from "./types";
import { isSubdividedFarm, pickFileCase } from "./lot";
import { LEGACY_FARM_NAMES } from "../config/goal";
import { groupBy, indexBy } from "./math";

export type QualitySeverity = "error" | "warning" | "info";

export type QualityKind =
  | "price_mismatch"
  | "down_payment_mismatch"
  | "reservation_after_note_start"
  | "farm_capital_null"
  | "sold_note_without_sale"
  | "sale_without_sold_flag"
  | "note_without_file_case"
  | "multiple_notes_on_lot"
  | "completed_without_closing_date"
  | "active_file_case_with_note"
  | "test_client_on_real_case"
  | "legacy_farm_with_lots"
  | "lot_count_mismatch"
  | "note_before_farm_purchase"
  | "cash_deal_missing_down_payment";

export interface QualityIssue {
  id: string;
  kind: QualityKind;
  severity: QualitySeverity;
  farmName: string | null;
  lotName: string | null;
  propertyId: string | null;
  message: string;
  details: Record<string, string | number | boolean | null>;
}

export interface QualityInputs {
  farms: FarmAcquisitionRow[];
  properties: PropertyRow[];
  fileCases: FileCaseRow[];
  notes: NoteRow[];
  noteSales: NoteSaleRow[];
  clients: ClientRow[];
}

const nearlyEqual = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
};

/**
 * Every place the data disagrees with itself. Never corrected, never hidden.
 * Ordered by severity, then farm, then lot.
 */
export function computeQualityIssues(i: QualityInputs): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const farmById = indexBy(i.farms, (f) => f.id);
  const propById = indexBy(i.properties, (p) => p.id);
  const casesByProp = groupBy(i.fileCases, (c) => c.property_id);
  const notesByProp = groupBy(i.notes, (n) => n.property_id);
  const salesByNote = groupBy(i.noteSales, (s) => s.note_id);
  const clientById = indexBy(i.clients, (c) => c.id);
  const propsByFarm = groupBy(i.properties, (p) => p.farm_acquisition_id);

  const farmNameOf = (p: PropertyRow | undefined) => (p?.farm_acquisition_id ? farmById.get(p.farm_acquisition_id)?.farm_name ?? null : null);
  const lotNameOf = (p: PropertyRow | undefined) => p?.name ?? null;

  const push = (kind: QualityKind, severity: QualitySeverity, p: PropertyRow | undefined, message: string, details: QualityIssue["details"], idSuffix = "") => {
    issues.push({
      id: `${kind}:${p?.id ?? details["farmId"] ?? "global"}${idSuffix}`,
      kind,
      severity,
      farmName: farmNameOf(p),
      lotName: lotNameOf(p),
      propertyId: p?.id ?? null,
      message,
      details,
    });
  };

  // Farms
  for (const farm of i.farms) {
    const legacy = LEGACY_FARM_NAMES.includes(farm.farm_name ?? "");
    const lotRows = propsByFarm.get(farm.id)?.length ?? 0;
    if (farm.investor_capital === null) {
      issues.push({
        id: `farm_capital_null:${farm.id}`,
        kind: "farm_capital_null",
        severity: isSubdividedFarm(farm) ? "error" : "warning",
        farmName: farm.farm_name,
        lotName: null,
        propertyId: null,
        message: `${farm.farm_name ?? "Farm"} has investor_capital NULL; land cost falls back to property_costs.`,
        details: { farmId: farm.id, dealType: farm.deal_type, totalLots: farm.total_lots },
      });
    }
    if (legacy && (farm.total_lots ?? 0) > 1) {
      issues.push({
        id: `legacy_farm_with_lots:${farm.id}`,
        kind: "legacy_farm_with_lots",
        severity: "warning",
        farmName: farm.farm_name,
        lotName: null,
        propertyId: null,
        message: `${farm.farm_name} is documented as a legacy one-off but has total_lots = ${farm.total_lots}; excluded from lot economics.`,
        details: { farmId: farm.id, totalLots: farm.total_lots, lotRows },
      });
    }
    if (isSubdividedFarm(farm) && farm.total_lots !== null && lotRows !== farm.total_lots) {
      issues.push({
        id: `lot_count_mismatch:${farm.id}`,
        kind: "lot_count_mismatch",
        severity: "error",
        farmName: farm.farm_name,
        lotName: null,
        propertyId: null,
        message: `${farm.farm_name} says total_lots = ${farm.total_lots} but has ${lotRows} property rows.`,
        details: { farmId: farm.id, totalLots: farm.total_lots, lotRows },
      });
    }
  }

  // Lots with notes
  for (const [propertyId, notes] of notesByProp) {
    const p = propById.get(propertyId);
    const farm = p?.farm_acquisition_id ? farmById.get(p.farm_acquisition_id) : undefined;
    const fileCase = pickFileCase(casesByProp.get(propertyId) ?? []);

    if (notes.length > 1) {
      push("multiple_notes_on_lot", "warning", p, `${lotNameOf(p) ?? propertyId} has ${notes.length} notes (${notes.map((n) => n.note_code ?? "?").join(", ")}).`, {
        noteCodes: notes.map((n) => n.note_code ?? "?").join(", "),
      });
    }

    for (const note of notes) {
      const sales = salesByNote.get(note.id) ?? [];
      if (note.is_sold && sales.length === 0) {
        push("sold_note_without_sale", "error", p, `${note.note_code ?? "Note"} is flagged is_sold but has no note_sales row.`, { noteCode: note.note_code }, `:${note.id}`);
      }
      if (!note.is_sold && sales.length > 0) {
        push("sale_without_sold_flag", "warning", p, `${note.note_code ?? "Note"} has a note_sales row but is_sold = false.`, { noteCode: note.note_code }, `:${note.id}`);
      }
      if (farm && isSubdividedFarm(farm) && !fileCase) {
        push("note_without_file_case", "warning", p, `${note.note_code ?? "Note"} exists but the lot has no active/completed file case.`, { noteCode: note.note_code }, `:${note.id}`);
      }
      if (farm && (farm.total_lots ?? 0) > 1 && farm.closing_date && note.start_date && note.start_date < farm.closing_date) {
        push(
          "note_before_farm_purchase",
          "warning",
          p,
          `${note.note_code ?? "Note"} starts ${note.start_date}, before ${farm.farm_name} closed on ${farm.closing_date}.`,
          { noteCode: note.note_code, noteStart: note.start_date, farmClosing: farm.closing_date },
          `:${note.id}`,
        );
      }
    }

    if (fileCase) {
      const note = notes[0];
      if (!note) continue;
      if (!nearlyEqual(fileCase.sale_price, note.original_amount)) {
        push(
          "price_mismatch",
          "error",
          p,
          `file_cases.sale_price ${fmt(fileCase.sale_price)} ≠ notes.original_amount ${fmt(note.original_amount)}. Quest uses the note.`,
          { fileCaseSalePrice: fileCase.sale_price, noteOriginalAmount: note.original_amount, noteCode: note.note_code },
        );
      }
      if (!nearlyEqual(fileCase.down_payment ?? 0, note.down_payment ?? 0)) {
        push(
          "down_payment_mismatch",
          "error",
          p,
          `file_cases.down_payment ${fmt(fileCase.down_payment)} ≠ notes.down_payment ${fmt(note.down_payment)}. Quest uses the note.`,
          { fileCaseDownPayment: fileCase.down_payment, noteDownPayment: note.down_payment, noteCode: note.note_code },
        );
      }
      if (fileCase.reservation_date && note.start_date && fileCase.reservation_date > note.start_date) {
        push(
          "reservation_after_note_start",
          "error",
          p,
          `file_cases.reservation_date ${fileCase.reservation_date} is after notes.start_date ${note.start_date}.`,
          { reservationDate: fileCase.reservation_date, noteStartDate: note.start_date, noteCode: note.note_code },
        );
      }
      if (fileCase.status === "active") {
        push("active_file_case_with_note", "warning", p, `File case is still 'active' although a note (${note.note_code ?? "?"}) already exists.`, {
          fileCaseStatus: fileCase.status,
          noteCode: note.note_code,
        });
      }
    }
  }

  // File cases on their own
  for (const [propertyId, cases] of casesByProp) {
    const p = propById.get(propertyId);
    const farm = p?.farm_acquisition_id ? farmById.get(p.farm_acquisition_id) : undefined;
    if (!farm || !isSubdividedFarm(farm)) continue;
    const fc = pickFileCase(cases);
    if (!fc) continue;
    if (fc.status === "completed" && !fc.closing_date) {
      push("completed_without_closing_date", "warning", p, `File case is completed but closing_date is NULL; pace calculations use the note start date if any.`, {
        dealType: fc.deal_type,
      });
    }
    if (fc.deal_type === "cash" && fc.status === "completed" && (fc.down_payment === null || fc.down_payment === 0)) {
      push("cash_deal_missing_down_payment", "info", p, `Cash deal completed with down_payment ${fmt(fc.down_payment)}; cash realized counts the full sale price.`, {
        salePrice: fc.sale_price,
        downPayment: fc.down_payment,
      });
    }
    if (fc.client_id && !clientById.has(fc.client_id)) {
      push("test_client_on_real_case", "warning", p, `Buyer (client ${fc.client_id.slice(0, 8)}…) is a test client or is not readable, but the file case is real and counted.`, {
        clientId: fc.client_id,
        status: fc.status,
      });
    }
  }

  const rank: Record<QualitySeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    const f = (a.farmName ?? "").localeCompare(b.farmName ?? "");
    if (f !== 0) return f;
    return (a.lotName ?? "").localeCompare(b.lotName ?? "");
  });
}

function fmt(n: number | null): string {
  return n === null ? "NULL" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
