export const THB = new Intl.NumberFormat("en-US", {
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
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function dueStatus(dueDate: string, balance: number) {
  if (balance <= 0) return { label: "Paid", tone: "success" as const };
  const diff = daysBetween(new Date(dueDate), new Date());
  if (diff === 0) return { label: "Due today", tone: "warning" as const };
  if (diff > 0 && diff <= 7) return { label: `Due in ${diff}d`, tone: "info" as const };
  if (diff > 7) return { label: `Upcoming`, tone: "muted" as const };
  if (diff < 0 && diff >= -7) return { label: `Overdue ${-diff}d`, tone: "warning" as const };
  return { label: `Overdue ${-diff}d`, tone: "destructive" as const };
}