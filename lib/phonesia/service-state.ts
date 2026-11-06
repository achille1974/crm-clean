// A historical contract proves a service was purchased, not that it is still active.
export function isServizioAttivo(status?: string | null): boolean {
  return String(status ?? "").trim().toUpperCase() === "ATTIVO";
}

export function isServizioDaVerificare(status?: string | null): boolean {
  return ["", "NON_DEFINITO", "IN_ATTIVAZIONE"].includes(String(status ?? "").trim().toUpperCase());
}
