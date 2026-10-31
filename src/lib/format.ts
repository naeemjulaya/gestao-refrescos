/** Formatação de valores em meticais (MT) e datas em português. */

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 1234.5 -> "1.234,50 MT" */
export function mt(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${neg ? "-" : ""}${groupThousands(int)},${dec} MT`;
}

/** 1234.5 -> "1.235" (sem casas decimais, para contagens) */
export function fmtInt(v: number): string {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  return groupThousands(String(Math.abs(n))).replace(/^/, n < 0 ? "-" : "");
}

/** +1234.5 -> "+1.234,50 MT" (para lucros) */
export function mtSigned(v: number): string {
  if (v > 0) return `+${mt(v)}`;
  return mt(v);
}

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function parseISO(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

/** "2026-10-31" -> "31/10/2026" */
export function fmtDate(iso: string): string {
  const d = parseISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "2026-10-31" -> "sábado, 31/10/2026" */
export function fmtDateLong(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getDay()]}, ${fmtDate(iso)}`;
}

/** ISO datetime -> "31/10/2026 14:35" */
export function fmtDateTime(iso: string): string {
  const d = parseISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

/** ISO date (YYYY-MM-DD) -> "31 de outubro de 2026" */
export function fmtDateHuman(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Data local de hoje em YYYY-MM-DD (sem dependência de fuso do servidor). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Dias inteiros entre uma data YYYY-MM-DD e hoje (positivo = passado). */
export function daysAgo(iso: string): number {
  const d = parseISO(iso);
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** Data de hoje como "sábado, 31/10/2026" */
export function todayLabel(): string {
  return fmtDateLong(todayISO());
}

/** Primeiro dia do mês atual em YYYY-MM-DD */
export function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
