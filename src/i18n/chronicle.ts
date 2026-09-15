import type { EventKind } from "@/domain";
import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /chronicle. Event narrative prose stays in the domain. */
export interface ChronicleUiStrings {
  title: string;
  subtitle: string;
  all: string;
  kind: Record<EventKind, string>;
  empty: string;
  showOlder: (n: number) => string;
  upcoming: string;
  netToDate: string;
}

export const CHRONICLE_UI: Record<QualityLang, ChronicleUiStrings> = {
  en: {
    title: "Chronicle",
    subtitle:
      "Every real event, newest first, told as the scribes would tell it — each line from the row that produced it — with the running net profit and a celebration each time it crosses another million. A reservation is narrated with the day its closing is expected; the closing says how long after the reservation it came; a cancellation gives the lot back to the market.",
    all: "All",
    kind: {
      farm_acquired: "Farm acquired",
      reservation: "Reservation",
      cancellation: "Cancelled",
      closing: "Closing",
      note_sale: "Note sale",
      distribution: "Distribution",
      milestone: "Milestone",
      liberation: "Liberation",
    },
    empty: "Nothing chronicled yet",
    showOlder: (n) => `Show older (${n} more)`,
    upcoming: "upcoming",
    netToDate: "net to date",
  },
  es: {
    title: "Crónica",
    subtitle:
      "Cada evento real, del más reciente al más antiguo, contado como lo harían los escribas — cada línea de la fila que lo produjo — con la utilidad neta acumulada y una celebración cada vez que cruza otro millón. Una reserva se narra con el día en que se espera su cierre; el cierre dice cuánto después de la reserva llegó; una cancelación devuelve el lote al mercado.",
    all: "Todos",
    kind: {
      farm_acquired: "Finca adquirida",
      reservation: "Reserva",
      cancellation: "Cancelada",
      closing: "Cierre",
      note_sale: "Venta de pagaré",
      distribution: "Distribución",
      milestone: "Hito",
      liberation: "Liberación",
    },
    empty: "Aún no hay nada en la crónica",
    showOlder: (n) => `Ver anteriores (${n} más)`,
    upcoming: "próximo",
    netToDate: "utilidad a la fecha",
  },
};

export function useChronicleStrings(): ChronicleUiStrings {
  const [lang] = useLang();
  return CHRONICLE_UI[lang];
}
