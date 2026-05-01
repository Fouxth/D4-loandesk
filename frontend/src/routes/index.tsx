import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { formatTHB } from "@/utils/format";
import { getDashboardData } from "@/lib/services";
import {
  Users, Wallet, Calendar as CalIcon, AlertTriangle, TrendingUp, DollarSign, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

export const Route = createFileRoute("/")({
  component: () => (
    <ProtectedRoute>
      <AppLayout>
        <Dashboard />
      </AppLayout>
    </ProtectedRoute>
  ),
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

function Dashboard() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<{ month: string; collected: number }[]>([]);
  const [trend, setTrend] = useState<{ day: string; amount: number }[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getDashboardData();
        setSummary(data.summary as Summary);
        setMonthly(data.monthly);
        setTrend(data.trend);
        setStatusBreakdown(data.statusBreakdown.map((item: any) => ({
          ...item,
          name: t(`loans.status.${item.name}`, item.name)
        })));
      } catch (e) {
        console.error("Failed to load dashboard data", e);
      }
    })();
  }, [t]);

  if (!summary) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground animate-pulse">{t('dashboard.loading')}</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-6 pb-10">
      <PageHeader 
        title={t('dashboard.title')} 
        description={t('dashboard.description')} 
      />

      {/* Main Stats Row */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Link to="/customers" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/50 transition-transform hover:-translate-y-1">
          <StatCard label="ลูกค้าทั้งหมด" value={`${summary.customers.toLocaleString()} คน`} icon={Users} tone="primary" />
        </Link>
        <Link to="/loans" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/50 transition-transform hover:-translate-y-1">
          <StatCard label="สัญญาเงินกู้" value={`${summary.totalLoans.toLocaleString()} สัญญา`} icon={Wallet} tone="primary" />
        </Link>
        <Link to="/loans" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-warning/50 transition-transform hover:-translate-y-1">
          <StatCard label="ครบกำหนดวันนี้" value={`${summary.dueToday.toLocaleString()} สัญญา`} icon={CalIcon} tone="warning" />
        </Link>
        <Link to="/loans" className="block outline-none rounded-2xl focus-visible:ring-2 focus-visible:ring-destructive/50 transition-transform hover:-translate-y-1">
          <StatCard label="เกินกำหนดชำระ" value={`${summary.overdue.toLocaleString()} สัญญา`} icon={AlertTriangle} tone="destructive" />
        </Link>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Financial Highlights */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-primary/80 uppercase tracking-widest mb-1">ยอดเงินคงค้างรวม</p>
                <h4 className="text-3xl font-black text-primary tracking-tight">{formatTHB(summary.outstanding)}</h4>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-primary/60 font-medium">
                <Activity className="h-3 w-3" /> ยอดเงินต้นและดอกเบี้ยที่ยังไม่ได้รับชำระ
              </div>
            </div>
            
            <div className="bg-success/10 border border-success/20 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-success/80 uppercase tracking-widest mb-1">ยอดเก็บเงินวันนี้</p>
                <h4 className="text-3xl font-black text-success tracking-tight">{formatTHB(summary.todayCollections)}</h4>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-success/60 font-medium">
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
              <ResponsiveContainer width="100%" height="100%">
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
                    formatter={(v: number) => [formatTHB(v), "เก็บได้"]}
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
              <ResponsiveContainer width="100%" height="100%">
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
                <p className="text-[10px] uppercase font-bold text-muted-foreground">ทั้งหมด</p>
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
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">กำไรเดือนนี้</p>
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
            <ResponsiveContainer width="100%" height="100%">
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
                  formatter={(v: number) => [formatTHB(v), "ยอดชำระ"]}
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
