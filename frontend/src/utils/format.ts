// Realtime Thailand Date string (YYYY-MM-DD) in Asia/Bangkok timezone
export function getThaiDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
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
  if (typeof d === "string") {
    const clean = d.split("T")[0];
    const parts = clean.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const date = new Date(parts[0], parts[1] - 1, parts[2]);
      return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
    }
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return isNaN(date.getTime()) ? "ไม่มีกำหนด" : date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysBetween(a: string | Date | null | undefined, b: string | Date | null | undefined) {
  if (!a || !b) return 0;
  const parseLocal = (v: string | Date) => {
    if (typeof v === "string") {
      const clean = v.split("T")[0];
      const parts = clean.split("-").map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      return new Date(v);
    }
    return new Date(v.getTime());
  };

  const d1 = parseLocal(a);
  const d2 = parseLocal(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;

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