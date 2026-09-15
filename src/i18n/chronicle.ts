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
    title: "Activity",
    subtitle:
      "Every real event, newest first. Each line comes from the row that produced it, with running net profit and a mark each time it crosses another million. A reservation includes the expected closing date; a closing says how long after the reservation it came; a cancellation returns the lot to inventory.",
    all: "All",
    kind: {
      farm_acquired: "Farm acquired",
      reservation: "Reservation",
      cancellation: "Cancelled",
      closing: "Closing",
      note_sale: "Note sale",
      distribution: "Distribution",
      milestone: "Milestone",
      liberation: "Capital returned",
    },
    empty: "No activity yet",
    showOlder: (n) => `Show older (${n} more)`,
    upcoming: "upcoming",
    netToDate: "net to date",
  },
  es: {
    title: "Actividad",
    subtitle:
      "Cada evento real, del más reciente al más antiguo. Cada línea sale de la fila que lo produjo, con la utilidad neta acumulada y una marca cada vez que cruza otro millón. Una reserva incluye la fecha de cierre esperada; un cierre dice cuánto después de la reserva llegó; una cancelación devuelve el lote al inventario.",
    all: "Todos",
    kind: {
      farm_acquired: "Finca adquirida",
      reservation: "Reserva",
      cancellation: "Cancelada",
      closing: "Cierre",
      note_sale: "Venta de pagaré",
      distribution: "Distribución",
      milestone: "Hito",
      liberation: "Capital devuelto",
    },
    empty: "Aún no hay actividad",
    showOlder: (n) => `Ver anteriores (${n} más)`,
    upcoming: "próximo",
    netToDate: "utilidad a la fecha",
  },
};

export function useChronicleStrings(): ChronicleUiStrings {
  const [lang] = useLang();
  return CHRONICLE_UI[lang];
}
