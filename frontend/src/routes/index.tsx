import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { formatTHB } from "@/utils/format";
import { getDashboardData, getLoans } from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users, Wallet, Calendar as CalIcon, AlertTriangle, TrendingUp, Activity,
  Plus, Receipt, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { StatusBadge, loanStatusTone } from "@/components/StatusBadge";
import { formatDate } from "@/utils/format";

export const Route = createFileRoute("/")({
  component: () => {
    const { user, roles } = useAuth();
    
    // Automatically redirect system super-admins directly to the super admin console
    if (user && user.tenantId === 'system' && roles.includes('admin')) {
      return <Navigate to="/super-admin" />;
    }

    return (
      <ProtectedRoute>
        <AppLayout>
          <Dashboard />
        </AppLayout>
      </ProtectedRoute>
    );
  },
});

interface Summary {
  customers: number;
  totalLoans: number;
  activeLoans: number;
  dueToday: number;
  overdue: number;
  outstanding: number;
  todayCollections: number;
  monthlyProfit: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "hsl(220 80% 60%)",
  completed: "hsl(150 60% 50%)",
  overdue: "hsl(15 75% 55%)",
  cancelled: "hsl(220 10% 60%)",
};

function getLogicalDateStr(d: Date = new Date()): string {
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const thaiTime = new Date(utc + (3600000 * 7));
  thaiTime.setHours(thaiTime.getHours() - 5);
  return `${thaiTime.getFullYear()}-${String(thaiTime.getMonth() + 1).padStart(2, '0')}-${String(thaiTime.getDate()).padStart(2, '0')}`;
}

function getEffectiveStatus(l: any): string {
  if (l.status === 'completed' || l.status === 'cancelled' || l.status === 'forfeited' || l.status === 'refinanced') return l.status;
  const todayStr = getLogicalDateStr();
  const dueStr = l.dueDate ? l.dueDate.substring(0, 10) : '';
  if (dueStr < todayStr) return 'overdue';
  if (dueStr === todayStr) return 'due_today';
  return 'active';
}

function Dashboard() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<{ month: string; collected: number }[]>([]);
  const [trend, setTrend] = useState<{ day: string; amount: number }[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [dueLoans, setDueLoans] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [data, loans] = await Promise.all([
          getDashboardData(),
          getLoans(),
        ]);
        setSummary(data.summary as Summary);
        setMonthly(data.monthly);
        setTrend(data.trend);
        setStatusBreakdown(data.statusBreakdown.map((item: any) => ({
          ...item,
          name: t(`loans.status.${item.name}`, item.name)
        })));

        // Due today + overdue loans for quick list
        const todayAndOverdue = (loans ?? []).filter((l: any) => {
          const status = getEffectiveStatus(l);
          return status === 'due_today' || status === 'overdue';
        }).slice(0, 5);
        setDueLoans(todayAndOverdue);
      } catch (e) {
        console.error("Failed to load dashboard data", e);
      }
    })();
  }, [t]);

  if (!summary) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground animate-pulse">{t('dashboard.loading')}</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-6 pb-6">
      <PageHeader 
        title={t('dashboard.title')} 
        description={t('dashboard.description')} 
      />

      {/* ─── MOBILE QUICK ACTIONS ─────────────────────────────── */}
      <div className="flex gap-3 md:hidden">
        <Link
          to="/loans"
          className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-primary text-primary-foreground p-4 shadow-lg shadow-primary/25 active:scale-95 transition-transform"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          <span className="text-[11px] font-black uppercase tracking-widest">สัญญาใหม่</span>
        </Link>
        <Link
          to="/payments"
          className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-success/10 border border-success/20 text-success p-4 active:scale-95 transition-transform"
        >
          <Receipt className="h-5 w-5" />
          <span className="text-[11px] font-black uppercase tracking-widest">รับชำระ</span>
        </Link>
        <Link
          to="/calendar"
          className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-muted/50 border border-border p-4 active:scale-95 transition-transform"
        >
          <CalIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">ปฏิทิน</span>
        </Link>
      </div>

      {/* ─── FINANCIAL HIGHLIGHTS (mobile — 2 big numbers) ────── */}
      <div className="grid gap-3 grid-cols-2 md:hidden">
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-primary/70 uppercase tracking-widest mb-1">ยอดคงค้างรวม</p>
          <p className="text-xl font-black text-primary leading-tight">{formatTHB(summary.outstanding)}</p>
        </div>
        <div className="bg-success/10 border border-success/20 rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-success/70 uppercase tracking-widest mb-1">เก็บวันนี้</p>
          <p className="text-xl font-black text-success leading-tight">{formatTHB(summary.todayCollections)}</p>
        </div>
      </div>

      {/* ─── STAT CARDS ───────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <Link to="/customers" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/50 transition-transform hover:-translate-y-1 active:scale-95">
          <StatCard label="ลูกค้าทั้งหมด" value={`${summary.customers.toLocaleString()} คน`} icon={Users} tone="primary" />
        </Link>
        <Link to="/loans" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/50 transition-transform hover:-translate-y-1 active:scale-95">
          <StatCard label="สัญญาเงินกู้" value={`${summary.totalLoans.toLocaleString()} สัญญา`} icon={Wallet} tone="primary" />
        </Link>
        <Link to="/loans" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-warning/50 transition-transform hover:-translate-y-1 active:scale-95">
          <StatCard label="ครบกำหนดวันนี้" value={`${summary.dueToday.toLocaleString()} สัญญา`} icon={CalIcon} tone="warning" />
        </Link>
        <Link to="/loans" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-destructive/50 transition-transform hover:-translate-y-1 active:scale-95">
          <StatCard label="เกินกำหนดชำระ" value={`${summary.overdue.toLocaleString()} สัญญา`} icon={AlertTriangle} tone="destructive" />
        </Link>
      </div>

      {/* ─── DUE TODAY LIST (mobile only) ────────────────────── */}
      {dueLoans.length > 0 && (
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">⚡ ต้องติดตามวันนี้</h3>
            <Link to="/loans" className="text-[11px] font-bold text-primary flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {dueLoans.map((l) => {
              const status = getEffectiveStatus(l);
              return (
                <Link
                  key={l.id}
                  to="/loans/$loanId"
                  params={{ loanId: l.id }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-muted-foreground">{l.loanNumber}</p>
                    <p className="font-bold text-sm text-foreground truncate">{l.customerName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(l.dueDate)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                    <StatusBadge tone={loanStatusTone(status)}>
                      {status === 'overdue' ? 'เกินกำหนด' : 'วันนี้'}
                    </StatusBadge>
                    <span className="font-black text-sm text-primary">{formatTHB(l.totalPayable)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── DESKTOP LAYOUT ─────────────────────────────────── */}
      <div className="hidden md:grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Financial Highlights */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-primary/80 uppercase tracking-widest mb-1">ยอดเงินคงค้างรวม</p>
                <h4 className="text-3xl font-black text-primary tracking-tight">{formatTHB(summary.outstanding)}</h4>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-primary/60 font-medium">
                <Activity className="h-3 w-3" /> ยอดเงินต้นและดอกเบี้ยที่ยังไม่ได้รับชำระ
              </div>
            </div>
            
            <div className="bg-success/10 border border-success/20 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-success/80 uppercase tracking-widest mb-1">ยอดเก็บเงินวันนี้</p>
                <h4 className="text-3xl font-black text-success tracking-tight">{formatTHB(summary.todayCollections)}</h4>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-success/60 font-medium">
                <TrendingUp className="h-3 w-3" /> ยอดเงินที่จัดเก็บได้จริงในวันนี้
              </div>
            </div>
          </div>

          {/* Collection Chart */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-foreground">สถิติการจัดเก็บรายเดือน</h3>
              <div className="h-8 w-8 rounded-lg bg-muted/30 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={monthly}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--chart-text)" fontSize={11} axisLine={false} tickLine={false} dy={10} />
                  <YAxis stroke="var(--chart-text)" fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--chart-primary)', opacity: 0.08 }}
                    contentStyle={{ background: "var(--chart-card-bg)", border: "1px solid var(--chart-border)", borderRadius: 12, boxShadow: 'var(--shadow-elevated)', color: 'var(--foreground)' }}
                    labelStyle={{ color: 'var(--chart-text)' }}
                    formatter={(value) => [formatTHB(Number(value ?? 0)), "เก็บได้"] as any}
                  />
                  <Bar dataKey="collected" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Status Breakdown & Small Stats */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] overflow-hidden h-full flex flex-col">
            <h3 className="text-sm font-bold text-foreground mb-6">สัดส่วนสถานะสัญญา</h3>
            <div className="flex-1 min-h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5}>
                    {statusBreakdown.map((entry, index) => {
                      const key = Object.keys(STATUS_COLORS).find(k => t(`loans.status.${k}`) === entry.name) || 'active';
                      return <Cell key={index} fill={STATUS_COLORS[key] ?? "var(--chart-muted)"} stroke="none" />;
                    })}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--chart-card-bg)", border: "1px solid var(--chart-border)", borderRadius: 12, color: 'var(--foreground)' }} labelStyle={{ color: 'var(--chart-text)' }} />
                  <Legend 
                    verticalAlign="bottom" 
                    iconType="circle" 
                    wrapperStyle={{ paddingTop: 20, fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
                <p className="text-[11px] uppercase font-bold text-muted-foreground">ทั้งหมด</p>
                <p className="text-2xl font-black">{summary.activeLoans + summary.overdue}</p>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">กำไรเดือนนี้</p>
                    <p className="text-sm font-black text-foreground">{formatTHB(summary.monthlyProfit)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Trend Section */}
        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-sm font-bold text-foreground">แนวโน้มการชำระเงิน</h3>
              <p className="text-xs text-muted-foreground">ความเคลื่อนไหวในช่วง 14 วันที่ผ่านมา</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--chart-text)" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: "var(--chart-card-bg)", border: "1px solid var(--chart-border)", borderRadius: 12, color: 'var(--foreground)' }}
                  labelStyle={{ color: 'var(--chart-text)' }}
                  formatter={(value) => [formatTHB(Number(value ?? 0)), "ยอดชำระ"] as any}
                />
                <Area type="monotone" dataKey="amount" stroke="var(--chart-primary)" strokeWidth={3} fill="url(#trendGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
