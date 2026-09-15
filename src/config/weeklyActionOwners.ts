import type { WeeklyDetectorType } from "../domain/weeklyActions";

/**
 * TODO: map each detector to the exact Score user name (the `usuario` field).
 * Empty string disables Send to Score — the button shows "Assign an owner in config".
 * Do not guess names; fill this from Score's roster.
 */
export const WEEKLY_ACTION_OWNERS: Record<WeeklyDetectorType, string> = {
  stuck_reservation: "",
  farm_fully_reserved_no_closings: "",
  idle_farm: "",
  committed_unfunded_capital: "",
  next_farm_fund_by: "",
  held_note_discount: "",
  quality_blocker: "",
  pace: "",
  stage_bottleneck: "",
  inventory: "",
  concentration: "",
  losing_ground: "",
  conversion: "",
  recycle: "",
  quality: "",
};
