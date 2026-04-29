export const THB = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatTHB(value: number | string | null | undefined) {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  if (isNaN(n as number)) return "฿0";
  return THB.format(n as number);
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function dueStatus(dueDate: string, balance: number) {
  if (balance <= 0) return { label: "ชำระแล้ว", tone: "success" as const };
  const diff = daysBetween(new Date(dueDate), new Date());
  if (diff === 0) return { label: "ครบกำหนดวันนี้", tone: "warning" as const };
  if (diff > 0 && diff <= 7) return { label: `ครบกำหนดใน ${diff} วัน`, tone: "info" as const };
  if (diff > 7) return { label: `เร็วๆ นี้`, tone: "muted" as const };
  if (diff < 0 && diff >= -7) return { label: `ค้างชำระ ${-diff} วัน`, tone: "warning" as const };
  return { label: `ค้างชำระ ${-diff} วัน`, tone: "destructive" as const };
}