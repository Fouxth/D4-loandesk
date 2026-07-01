// Thai business day changes at 05:00 UTC+7 (= 22:00 UTC). Shift +2h then read UTC date to avoid browser-timezone arithmetic.
export function getThaiDateStr(d: Date = new Date()): string {
  const adjusted = new Date(d.getTime() + 2 * 3600000);
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}-${String(adjusted.getUTCDate()).padStart(2, '0')}`;
}

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
  if (!d) return "ไม่มีกำหนด";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysBetween(a: string | Date | null | undefined, b: string | Date | null | undefined) {
  if (!a || !b) return 0;
  const d1 = typeof a === "string" ? new Date(a.split("T")[0]) : a;
  const d2 = typeof b === "string" ? new Date(b.split("T")[0]) : b;
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;

  // Set both to midnight to ignore time part
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

export function dueStatus(dueDate: string, balance: number) {
  if (balance <= 0) return { label: "ชำระแล้ว", tone: "success" as const };
  const diff = daysBetween(dueDate, getThaiDateStr());
  if (diff === 0) return { label: "ครบกำหนดวันนี้", tone: "warning" as const };
  if (diff > 0 && diff <= 7) return { label: `ครบกำหนดใน ${diff} วัน`, tone: "info" as const };
  if (diff > 7) return { label: `อีก ${diff} วัน`, tone: "muted" as const };
  if (diff < 0 && diff >= -7) return { label: `ค้างชำระ ${-diff} วัน`, tone: "warning" as const };
  return { label: `ค้างชำระ ${-diff} วัน`, tone: "destructive" as const };
}