import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { formatTHB, getThaiDateStr } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getReportData } from "@/lib/services";
import {
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  AlertCircle,
  Loader2,
  Medal,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => (
    <ProtectedRoute>
      <AppLayout>
        <Reports />
      </AppLayout>
    </ProtectedRoute>
  ),
});

interface ReportData {
  monthlyIncome: number;
  monthlyExp: number;
  outstanding: number;
  daily: { date: string; total: number }[];
  ranking: { name: string; total: number }[];
}

function formatMonthYearTH(monthKey: string): string {
  if (monthKey === 'all') return 'ทุกเดือน (ทั้งหมด)';
  const parts = monthKey.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return monthKey;
  const [y, m] = parts;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

function Reports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentMonthKey = getThaiDateStr().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  useEffect(() => {
    setLoading(true);
    const monthStart = selectedMonth === 'all' ? 'all' : `${selectedMonth}-01`;
    getReportData(monthStart)
      .then((res) => {
        setData(res as ReportData);
        setError(null);
      })
      .catch((e) => setError(e.message || "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>([
      currentMonthKey,
      selectedMonth,
    ]);
    
    const now = new Date();
    for (let i = -12; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(mKey);
    }

    return Array.from(monthsSet).filter(m => m !== 'all').sort().reverse();
  }, [currentMonthKey, selectedMonth]);

  const handlePrevMonth = () => {
    if (selectedMonth === 'all') return;
    const parts = selectedMonth.split('-').map(Number);
    if (parts.length !== 2) return;
    let [y, m] = parts;
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    const prevKey = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(prevKey);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 'all') return;
    const parts = selectedMonth.split('-').map(Number);
    if (parts.length !== 2) return;
    let [y, m] = parts;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    const nextKey = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(nextKey);
  };

  const monthLabelText = selectedMonth === 'all' ? 'ทุกเดือน' : formatMonthYearTH(selectedMonth);

  const netProfit = (data?.monthlyIncome ?? 0) - (data?.monthlyExp ?? 0);
  const profitPositive = netProfit >= 0;

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <PageHeader
        title="รายงานสรุป"
        description={`ประจำเดือน: ${monthLabelText} · สรุปกำไร การจัดเก็บ และอันดับลูกค้า`}
      />

      {/* Month Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border border-border p-3 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={handlePrevMonth}
            disabled={selectedMonth === 'all'}
            title="เดือนก่อนหน้า"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-10 min-w-[200px] bg-muted/20 rounded-xl font-bold border-border">
              <Calendar className="mr-2 h-4 w-4 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🗓️ ทุกเดือน (ทั้งหมด)</SelectItem>
              {availableMonths.map((mKey) => (
                <SelectItem key={mKey} value={mKey}>
                  📅 {formatMonthYearTH(mKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={handleNextMonth}
            disabled={selectedMonth === 'all'}
            title="เดือนถัดไป"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 px-4 py-1.5 bg-muted/30 border border-border/50 rounded-xl">
          <span className="text-xs font-bold text-muted-foreground">รายงานประจำเดือน:</span>
          <span className="text-base font-black text-primary">{monthLabelText}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm">กำลังโหลดข้อมูลรายงาน...</span>
        </div>
      ) : error || !data ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <span className="text-sm">{error || "ไม่พบข้อมูล"}</span>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="รายรับประจำเดือน"
              value={formatTHB(data.monthlyIncome)}
              icon={TrendingUp}
              iconClass="text-success"
              trend={`รายรับจากการชำระเงินประจำ${monthLabelText}`}
              tone="success"
            />
            <StatCard
              label="รายจ่ายประจำเดือน"
              value={formatTHB(data.monthlyExp)}
              icon={TrendingDown}
              iconClass="text-destructive"
              trend={`ค่าใช้จ่ายทั้งหมดประจำ${monthLabelText}`}
              tone="destructive"
            />
            <StatCard
              label="กำไรสุทธิประจำเดือน"
              value={formatTHB(Math.abs(netProfit))}
              icon={CircleDollarSign}
              iconClass={profitPositive ? "text-primary" : "text-destructive"}
              highlight
              trend={profitPositive ? "▲ มีกำไร" : "▼ ขาดทุน"}
              trendClass={profitPositive ? "text-success" : "text-destructive"}
              tone="primary"
            />
            <StatCard
              label="ยอดคงค้างทั้งหมด"
              value={formatTHB(data.outstanding)}
              icon={AlertCircle}
              iconClass="text-warning"
              trend="ยอดรวมที่ยังไม่ได้รับชำระ"
              tone="warning"
            />
          </div>

          {/* Tables */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 pb-10">
            {/* Daily Collections */}
            <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
              <div className="bg-primary/5 px-5 py-4 border-b border-border/50">
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary/70">
                  ยอดเก็บเงินรายวัน (7 วันล่าสุด)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/50">
                      <TableHead className="font-bold">วันที่</TableHead>
                      <TableHead className="text-right font-bold">ยอดที่เก็บได้</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.daily.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                          ไม่มีข้อมูลการชำระเงิน
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.daily.map((d) => (
                        <TableRow key={d.date} className={d.total > 0 ? "" : "opacity-50"}>
                          <TableCell className="font-medium">{d.date}</TableCell>
                          <TableCell
                            className={`text-right font-bold ${
                              d.total > 0 ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            {d.total > 0 ? formatTHB(d.total) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Customer Ranking */}
            <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
              <div className="bg-primary/5 px-5 py-4 border-b border-border/50">
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary/70">
                  อันดับลูกค้า (ตามยอดชำระรวม)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/50">
                      <TableHead className="w-10 font-bold">#</TableHead>
                      <TableHead className="font-bold">ลูกค้า</TableHead>
                      <TableHead className="text-right font-bold">ชำระแล้วรวม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ranking.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          ไม่มีข้อมูลการชำระเงิน
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.ranking.map((r, i) => (
                        <TableRow key={r.name}>
                          <TableCell>
                            {i === 0 ? (
                              <Medal className="h-4 w-4 text-yellow-500" />
                            ) : i === 1 ? (
                              <Medal className="h-4 w-4 text-slate-400" />
                            ) : i === 2 ? (
                              <Medal className="h-4 w-4 text-amber-600" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{i + 1}</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {formatTHB(r.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  trend,
  trendClass,
  highlight,
  tone = "primary"
}: {
  label: string;
  value: string;
  icon: any;
  iconClass?: string;
  trend?: string;
  trendClass?: string;
  highlight?: boolean;
  tone?: "primary" | "success" | "destructive" | "warning";
}) {
  const tones = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-success/20 bg-success/5 text-success",
    destructive: "border-destructive/20 bg-destructive/5 text-destructive",
    warning: "border-warning/20 bg-warning/5 text-warning",
  };

  return (
    <div
      data-highlight={highlight ? "1" : "0"}
      className={`rounded-2xl border p-6 shadow-[var(--shadow-elevated)] transition-all hover:scale-[1.02] ${tones[tone]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
          {label}
        </p>
        <div className={`p-2 rounded-lg bg-current/10`}>
          <Icon className={`h-4 w-4 ${iconClass ?? ""}`} />
        </div>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-foreground">{value}</p>
      {trend && (
        <p className={`mt-2 text-[11px] font-bold ${trendClass || "opacity-60"}`}>{trend}</p>
      )}
    </div>
  );
}
