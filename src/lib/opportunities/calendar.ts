import type { EditorialEntry } from "./types";
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function readCalendar(value: unknown): EditorialEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 200).flatMap(v => {
    if (!v || typeof v !== "object") return [];
    const r = v as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.title !== "string" || typeof r.brief !== "string" || seen.has(r.id)) return [];
    seen.add(r.id);
    return [{ id: r.id.slice(0, 500), title: r.title.slice(0, 1000), brief: r.brief.slice(0, 20000), date: typeof r.date === "string" && validDate(r.date) ? r.date : "", status: ["Idea", "Planned", "Drafting", "Published"].includes(String(r.status)) ? r.status as EditorialEntry["status"] : "Idea" }];
  });
}
export function calendarCsv(entries: EditorialEntry[]): string {
  const cell = (v: string) => `"${v.replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  return [["Title", "Date", "Status", "Brief"], ...entries.map(e => [e.title, e.date, e.status, e.brief])].map(row => row.map(cell).join(",")).join("\r\n");
}
