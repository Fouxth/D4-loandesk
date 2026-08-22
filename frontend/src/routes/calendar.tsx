import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
  Calendar as CalendarIcon,
  Columns,
  ListTodo,
  User,
  ArrowRight,
  Filter,
} from "lucide-react";
import { getLoans } from "@/lib/services";
import { useTranslation } from "react-i18next";
import { formatTHB, formatDate, getThaiDateStr } from "@/utils/format";
import { getLoanCategory, LOAN_CATEGORY_OPTIONS } from "@/utils/loanType";
import {
  StatusBadge,
  loanStatusTone,
  getEffectiveStatus,
  getLoanStatusLabel,
  getLoanNextDueDate,
} from "@/components/StatusBadge";
import { cn } from "@/utils/utils";

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
const ENGLISH_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_DAYS_FULL = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
const ENGLISH_DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toYMD(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.substring(0, 10);
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return String(d).substring(0, 10);
}

function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CalendarView() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language?.startsWith("en");
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View Switcher: "month" | "week" | "day"
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

  // Category Filter
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Selected Month & Day
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState<string>(() => getThaiDateStr());

  useEffect(() => {
    setLoading(true);
    getLoans()
      .then((data) => setLoans(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Filter loans by category
  const filteredLoans = useMemo(() => {
    if (typeFilter === "all") return loans;
    return loans.filter((l) => getLoanCategory(l) === typeFilter);
  }, [loans, typeFilter]);

  // Map dates to active loans scheduled on that date
  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredLoans.forEach((l) => {
      const nextDue = getLoanNextDueDate(l);
      const primaryKey = nextDue ? toYMD(nextDue) : toYMD(l.dueDate);
      if (primaryKey) {
        (map[primaryKey] ||= []).push(l);
      }
    });
    return map;
  }, [filteredLoans]);

  const today = useMemo(() => getThaiDateStr(), []);
  const selectedLoans = selected ? byDate[selected] ?? [] : [];

  const monthLabel = isEN
    ? `${ENGLISH_MONTHS[month.getMonth()]} ${month.getFullYear()}`
    : `${THAI_MONTHS[month.getMonth()]} ${month.getFullYear() + 543}`;

  const daysShort = isEN ? ENGLISH_DAYS_SHORT : THAI_DAYS_SHORT;

  // Month Grid Cells
  const monthGrid = useMemo(() => {
    const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    return cells;
  }, [month]);

  // Week Grid Days (7 days based on selected date)
  const weekDays = useMemo(() => {
    const curr = selected ? new Date(selected) : new Date();
    const dayOfWeek = curr.getDay(); // 0 = Sun, 1 = Mon...
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayOfWeek);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selected]);

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === "month") {
      setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
    } else if (viewMode === "week") {
      const d = new Date(selected);
      d.setDate(d.getDate() - 7);
      setSelected(formatDateYMD(d));
    } else {
      const d = new Date(selected);
      d.setDate(d.getDate() - 1);
      setSelected(formatDateYMD(d));
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    } else if (viewMode === "week") {
      const d = new Date(selected);
      d.setDate(d.getDate() + 7);
      setSelected(formatDateYMD(d));
    } else {
      const d = new Date(selected);
      d.setDate(d.getDate() + 1);
      setSelected(formatDateYMD(d));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setSelected(getThaiDateStr());
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-4 pb-16">
      <PageHeader
        title={t("calendar.title", "ปฏิทิน")}
        description={t("calendar.description", "ตารางและกำหนดการรับชำระเงินตามสัญญา")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher Buttons */}
            <div className="flex items-center bg-card border border-border p-1 rounded-xl shadow-sm">
              <Button
                variant={viewMode === "month" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-3 rounded-lg text-xs font-bold gap-1.5 transition-all",
                  viewMode === "month" && "shadow-sm"
                )}
                onClick={() => setViewMode("month")}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>เดือน</span>
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-3 rounded-lg text-xs font-bold gap-1.5 transition-all",
                  viewMode === "week" && "shadow-sm"
                )}
                onClick={() => setViewMode("week")}
              >
                <Columns className="h-3.5 w-3.5" />
                <span>สัปดาห์</span>
              </Button>
              <Button
                variant={viewMode === "day" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-3 rounded-lg text-xs font-bold gap-1.5 transition-all",
                  viewMode === "day" && "shadow-sm"
                )}
                onClick={() => setViewMode("day")}
              >
                <ListTodo className="h-3.5 w-3.5" />
                <span>รายวัน</span>
              </Button>
            </div>

            {/* Month / Period Navigator */}
            <div className="flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted rounded-lg"
                onClick={handlePrev}
                title="ย้อนหลัง"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[130px] text-center font-bold text-xs text-foreground px-1">
                {viewMode === "month"
                  ? monthLabel
                  : viewMode === "week"
                  ? `${formatDate(formatDateYMD(weekDays[0]))} - ${formatDate(formatDateYMD(weekDays[6]))}`
                  : formatDate(selected)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted rounded-lg"
                onClick={handleNext}
                title="ถัดไป"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs font-bold rounded-lg border-primary/30 text-primary hover:bg-primary/10"
                onClick={handleToday}
              >
                วันนี้
              </Button>
            </div>
          </div>
        }
      />

      {/* Category Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 pr-1">
          <Filter className="h-3.5 w-3.5" />
          <span>ประเภท:</span>
        </div>
        <button
          onClick={() => setTypeFilter("all")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap",
            typeFilter === "all"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-card border-border hover:bg-muted text-muted-foreground"
          )}
        >
          ทุกประเภท ({loans.length})
        </button>
        {LOAN_CATEGORY_OPTIONS.map((cat) => {
          const count = loans.filter((l) => getLoanCategory(l) === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setTypeFilter(cat)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
                typeFilter === cat
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border hover:bg-muted text-muted-foreground"
              )}
            >
              <span>{cat}</span>
              <span className="opacity-70 text-[10px]">({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm">{t("common.loading", "กำลังโหลด...")}</span>
        </div>
      ) : (
        <>
          {/* VIEW MODE 1: MONTH VIEW */}
          {viewMode === "month" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {/* Calendar Grid */}
              <div className="rounded-2xl border border-border bg-card p-2 sm:p-5 shadow-[var(--shadow-elevated)]">
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-2">
                  {daysShort.map((d, i) => (
                    <div
                      key={d}
                      className={`py-2 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-widest ${
                        i === 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Date cells */}
                <div className="grid grid-cols-7 gap-1">
                  {monthGrid.map((date, i) => {
                    if (!date)
                      return <div key={`empty-${i}`} className="min-h-[64px] sm:min-h-[100px]" />;

                    const key = formatDateYMD(date);
                    const items = byDate[key] ?? [];
                    const isToday = key === today;
                    const isSelected = key === selected;
                    const totalInst = items.reduce(
                      (sum, l) => sum + Number(l.installmentAmount ?? l.installment_amount ?? 0),
                      0
                    );

                    return (
                      <div
                        key={key}
                        onClick={() => setSelected(key)}
                        className={cn(
                          "min-h-[64px] sm:min-h-[100px] rounded-xl border p-1 sm:p-2 cursor-pointer transition-all flex flex-col justify-between",
                          isSelected
                            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                            : isToday
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : items.length > 0
                            ? "border-border hover:border-primary/40 hover:bg-muted/10"
                            : "border-border/60 hover:bg-muted/10 opacity-80 hover:opacity-100"
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "text-xs font-bold inline-flex items-center justify-center h-5 w-5 rounded-full",
                                isToday
                                  ? "bg-primary text-primary-foreground font-black"
                                  : isSelected
                                  ? "text-primary font-black"
                                  : "text-muted-foreground"
                              )}
                            >
                              {date.getDate()}
                            </span>
                            {items.length > 0 && (
                              <span className="text-[10px] font-black bg-primary/15 text-primary px-1.5 py-0.2 rounded-md">
                                {items.length}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 space-y-0.5 hidden sm:block">
                            {items.slice(0, 2).map((l) => (
                              <div
                                key={l.id}
                                className="truncate rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-foreground border border-border/40"
                              >
                                {l.customerName || l.loanNumber}
                              </div>
                            ))}
                            {items.length > 2 && (
                              <p className="text-[10px] text-muted-foreground text-center font-bold">
                                +{items.length - 2} คน
                              </p>
                            )}
                          </div>
                        </div>

                        {items.length > 0 && (
                          <div className="pt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 text-right truncate">
                            {formatTHB(totalInst)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Side Panel */}
              <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden h-fit flex flex-col">
                <div className="border-b border-border px-4 py-3.5 bg-muted/20 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      กำหนดชำระประจำวัน
                    </h3>
                    <p className="text-sm font-black text-foreground">
                      {formatDate(selected)}
                    </p>
                  </div>
                  <span className="bg-primary text-primary-foreground font-bold text-xs px-2.5 py-1 rounded-lg shadow-sm">
                    {selectedLoans.length} สัญญา
                  </span>
                </div>

                {selectedLoans.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground px-4">
                    <AlertCircle className="h-8 w-8 opacity-30" />
                    <p className="text-xs text-center">ไม่มีสัญญาที่มีรอบชำระในวันนี้</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border overflow-y-auto max-h-[500px] p-1">
                    {selectedLoans.map((l) => {
                      const instAmt = Number(l.installmentAmount ?? l.installment_amount ?? 0);
                      return (
                        <Link
                          key={l.id}
                          to="/loans/$loanId"
                          params={{ loanId: l.id }}
                          className="group block p-3 rounded-xl hover:bg-muted/30 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{l.customerName}</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {l.loanNumber} · {getLoanCategory(l)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                {formatTHB(instAmt)}
                              </p>
                              <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                                {getLoanStatusLabel(l, t)}
                              </StatusBadge>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW MODE 2: WEEK VIEW */}
          {viewMode === "week" && (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {weekDays.map((d, idx) => {
                const key = formatDateYMD(d);
                const items = byDate[key] ?? [];
                const isToday = key === today;
                const totalInst = items.reduce(
                  (sum, l) => sum + Number(l.installmentAmount ?? l.installment_amount ?? 0),
                  0
                );

                return (
                  <div
                    key={key}
                    className={cn(
                      "rounded-2xl border bg-card p-3 shadow-[var(--shadow-elevated)] flex flex-col justify-between transition-all min-h-[320px]",
                      isToday
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border"
                    )}
                  >
                    <div>
                      {/* Day Header */}
                      <div className="border-b border-border/60 pb-2.5 mb-2.5 flex items-center justify-between">
                        <div>
                          <p
                            className={cn(
                              "text-xs font-bold",
                              idx === 0 ? "text-destructive" : "text-muted-foreground"
                            )}
                          >
                            {THAI_DAYS_SHORT[d.getDay()]}
                          </p>
                          <p className="text-sm font-black text-foreground">{d.getDate()}</p>
                        </div>
                        {items.length > 0 && (
                          <span className="text-[10px] font-black bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                            {items.length} คน
                          </span>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                        {items.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground/60 text-center py-6">
                            ไม่มีรายการ
                          </p>
                        ) : (
                          items.map((l) => {
                            const instAmt = Number(l.installmentAmount ?? l.installment_amount ?? 0);
                            return (
                              <Link
                                key={l.id}
                                to="/loans/$loanId"
                                params={{ loanId: l.id }}
                                className="block p-2 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/40 hover:bg-muted/40 transition-all text-xs"
                              >
                                <p className="font-bold text-foreground truncate">{l.customerName}</p>
                                <div className="flex items-center justify-between mt-1 text-[11px]">
                                  <span className="text-muted-foreground text-[10px]">{l.loanNumber}</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatTHB(instAmt)}
                                  </span>
                                </div>
                              </Link>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Column Total */}
                    {items.length > 0 && (
                      <div className="pt-2.5 mt-2 border-t border-border/60 flex justify-between items-center text-xs">
                        <span className="text-muted-foreground text-[11px] font-bold">รวม:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">
                          {formatTHB(totalInst)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 3: DAY AGENDA VIEW */}
          {viewMode === "day" && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Day Header Banner */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-elevated)] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center text-primary font-black text-lg">
                    {new Date(selected).getDate()}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-foreground">
                      {THAI_DAYS_FULL[new Date(selected).getDay()]}ที่ {formatDate(selected)}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      มีสัญญาที่ต้องรับชำระทั้งหมด <span className="font-bold text-foreground">{selectedLoans.length}</span> รายการ
                    </p>
                  </div>
                </div>

                <div className="text-right bg-muted/20 px-4 py-2 rounded-xl border border-border">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                    ยอดรวมที่ต้องเก็บ
                  </p>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {formatTHB(
                      selectedLoans.reduce(
                        (sum, l) => sum + Number(l.installmentAmount ?? l.installment_amount ?? 0),
                        0
                      )
                    )}
                  </p>
                </div>
              </div>

              {/* Day Cards List */}
              {selectedLoans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                  <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-bold">ไม่มีรายการที่ต้องเก็บในวันที่ {formatDate(selected)}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {selectedLoans.map((l) => {
                    const instAmt = Number(l.installmentAmount ?? l.installment_amount ?? 0);
                    return (
                      <div
                        key={l.id}
                        className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-elevated)] flex flex-col sm:flex-row items-center justify-between gap-3 hover:border-primary/40 transition-all"
                      >
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-foreground">{l.customerName}</span>
                              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                                {l.loanNumber}
                              </span>
                              <StatusBadge tone="info">{getLoanCategory(l)}</StatusBadge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              ยอดกู้รวม: {formatTHB(l.totalPayable)} · เงินต้น: {formatTHB(l.principal)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">ค่างวด</p>
                            <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                              {formatTHB(instAmt)}
                            </p>
                          </div>
                          <Link
                            to="/loans/$loanId"
                            params={{ loanId: l.id }}
                            className="inline-flex items-center gap-1 text-xs font-bold bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground px-3 py-2 rounded-xl transition-all"
                          >
                            <span>ดูสัญญา</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

