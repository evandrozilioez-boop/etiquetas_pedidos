const TZ = "America/Sao_Paulo";

export function fmtDateLong(isoDate: string) {
  return new Date(`${isoDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ });
}
export function fmtDay(d: Date | string) {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ });
}
export function fmtDateTime(d: Date | string) {
  return new Date(d).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2).replace(".", ",")} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(b / 1e3))} KB`;
}
export function fmtDuration(sec: number | null | undefined) {
  if (!sec && sec !== 0) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function monthYear(isoDate: string) {
  return new Date(`${isoDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: TZ });
}
