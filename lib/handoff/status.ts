export const HANDOFF_STATUSES = [
  "pending",
  "taken",
  "done",
  "overdue",
  "reminded",
  "ignored",
] as const;

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HANDOFF_OPEN_STATUSES = ["pending", "taken", "overdue"] as const;
export type HandoffOpenStatus = (typeof HANDOFF_OPEN_STATUSES)[number];

export const HANDOFF_CLOSED_STATUSES = ["done", "ignored"] as const;
export type HandoffClosedStatus = (typeof HANDOFF_CLOSED_STATUSES)[number];

export function isHandoffStatus(value: unknown): value is HandoffStatus {
  return typeof value === "string" && HANDOFF_STATUSES.includes(value as HandoffStatus);
}

export function isHandoffOpenStatus(value: unknown): value is HandoffOpenStatus {
  return (
    typeof value === "string" &&
    HANDOFF_OPEN_STATUSES.includes(value as HandoffOpenStatus)
  );
}

