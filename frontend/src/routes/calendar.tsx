import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import { getLoans } from "@/lib/services";

export const Route = createFileRoute("/calendar")({
  component: () => (
    <ProtectedRoute>
      <AppLayout>
        <CalendarView />
      </AppLayout>
    </ProtectedRoute>
  ),
});

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const STATUS_STYLE: Record<string, string> = {
  active: "bg-primary/10 text-primary border-primary/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-success/10 text-success border-success/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  active: "ปกติ",
  overdue: "เกินกำหนด",
  completed: "ครบแล้ว",
  cancelled: "ยกเลิก",
};

/** Convert ISO string or Date to YYYY-MM-DD */
function toYMD(d: any): string {
  if (!d) return "";
  const s = String(d);
  // "2026-05-13T00:00:00.000Z" → "2026-05-13"
  return s.substring(0, 10);
}

function CalendarView() {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getLoans()
      .then((data) => setLoans(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const grid = useMemo(() => {
    const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++)
      cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    return cells;
  }, [month]);

  // Map dueDate (YYYY-MM-DD) → loans[]
  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    loans.forEach((l) => {
      const key = toYMD(l.dueDate);
      if (key) (map[key] ||= []).push(l);
    });
    return map;
  }, [loans]);

  const today = new Date().toISOString().split("T")[0];

  const selectedLoans = selected ? byDate[selected] ?? [] : [];

  return (
    <div className="animate-in fade-in duration-500 space-y-4">
      <PageHeader
        title="ปฏิทิน"
        description="รายการสัญญาครบกำหนดชำระเงิน"
        actions={
          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[150px] text-center font-bold text-sm">
              {THAI_MONTHS[month.getMonth()]} {month.getFullYear() + 543}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm">กำลังโหลด...</span>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Calendar Grid */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {THAI_DAYS_SHORT.map((d, i) => (
                <div
                  key={d}
                  className={`py-2 text-center text-[10px] font-bold uppercase tracking-widest ${
                    i === 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map((date, i) => {
                if (!date)
                  return <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[90px]" />;

                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const items = byDate[key] ?? [];
                const isToday = key === today;
                const isSelected = key === selected;
                const hasOverdue = items.some((l) => l.status === "overdue");

                return (
                  <div
                    key={key}
                    onClick={() => setSelected(isSelected ? null : key)}
                    className={`min-h-[80px] sm:min-h-[90px] rounded-xl border p-1.5 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : isToday
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : items.length > 0
                        ? hasOverdue
                          ? "border-destructive/40 hover:bg-destructive/5"
                          : "border-primary/20 hover:bg-primary/5"
                        : "border-border hover:bg-muted/10"
                    }`}
                  >
                    <div
                      className={`text-xs font-bold ${
                        isToday ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {date.getDate()}
                      {isToday && (
                        <span className="ml-1 inline-block h-1 w-1 rounded-full bg-primary align-middle" />
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 2).map((l) => (
                        <div
                          key={l.id}
                          className={`truncate rounded px-1 py-0.5 text-[8px] sm:text-[9px] font-semibold border ${
                            STATUS_STYLE[l.status] ?? STATUS_STYLE.active
                          }`}
                        >
                          {l.customerName ?? l.loanNumber}
                        </div>
                      ))}
                      {items.length > 2 && (
                        <p className="text-[8px] text-muted-foreground text-center font-bold">
                          +{items.length - 2} รายการ
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side Panel */}
          <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden h-fit">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {selected
                  ? `สัญญาครบกำหนด ${selected}`
                  : "เลือกวันเพื่อดูรายละเอียด"}
              </h3>
            </div>

            {!selected ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground px-4">
                <AlertCircle className="h-8 w-8 opacity-30" />
                <p className="text-sm text-center">คลิกที่วันในปฏิทินเพื่อดูสัญญาที่ครบกำหนด</p>
              </div>
            ) : selectedLoans.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <p className="text-sm">ไม่มีสัญญาครบกำหนดในวันนี้</p>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-y-auto max-h-[500px]">
                {selectedLoans.map((l) => (
                  <Link
                    key={l.id}
                    to="/loans/$loanId"
                    params={{ loanId: l.id }}
                    className="block px-4 py-3 hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate text-foreground">
                          {l.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.loanNumber} · {l.paymentType === "daily" ? "รายวัน" : l.paymentType === "weekly" ? "รายสัปดาห์" : "รายเดือน"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                          STATUS_STYLE[l.status] ?? STATUS_STYLE.active
                        }`}
                      >
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-primary">
                      ยอดรวม ฿{Number(l.totalPayable).toLocaleString()}
                    </p>
                  </Link>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="border-t border-border px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">สถานะ</p>
              <div className="space-y-1">
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full border ${STATUS_STYLE[k]}`} />
                    <span className="text-[10px] text-muted-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
