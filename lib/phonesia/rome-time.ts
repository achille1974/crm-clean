export const ROME_TIME_ZONE = "Europe/Rome";

export function romeDate(value: Date | string = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ROME_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftDate(day: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Data non valida");
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day) throw new Error("Data non valida");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function romeDayStart(day = romeDate()): Date {
  shiftDate(day, 0); // Validate calendar dates as well as syntax.
  const noon = new Date(`${day}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", {timeZone: ROME_TIME_ZONE, timeZoneName:"longOffset"})
    .formatToParts(noon).find((part) => part.type === "timeZoneName")!.value;
  // Determine the offset at midnight, including the two DST transition days.
  let candidate = new Date(`${day}T00:00:00${zone.replace("GMT", "") || "+00:00"}`);
  const midnightZone = new Intl.DateTimeFormat("en-US", {timeZone:ROME_TIME_ZONE,timeZoneName:"longOffset"})
    .formatToParts(candidate).find((part)=>part.type==="timeZoneName")!.value;
  candidate = new Date(`${day}T00:00:00${midnightZone.replace("GMT", "") || "+00:00"}`);
  return candidate;
}

export function parseDatabaseTime(value: string): Date {
  // Legacy timestamp-without-time-zone columns store UTC.
  return new Date(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value);
}

export function formatRomeTime(value?: string | null): string {
  if (!value) return "—";
  const date = parseDatabaseTime(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {timeZone:ROME_TIME_ZONE,day:"2-digit",month:"2-digit",
    year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
}
