import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { formatTHB } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/reports")({
  component: () => (<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>),
});

function Reports() {
  const [data, setData] = useState<{ ranking: any[]; daily: any[]; monthlyIncome: number; monthlyExp: number; outstanding: number; overdueCount: number } | null>(null);

  useEffect(() => {
    (async () => {
      const monthStart = new Date(); monthStart.setDate(1);
      const ms = monthStart.toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];

      const [{ data: payments }, { data: expenses }, { data: loans }, { data: customers }] = await Promise.all([
        supabase.from("payments").select("amount, payment_date, loan_id"),
        supabase.from("expenses").select("amount, expense_date").gte("expense_date", ms),
        supabase.from("loans").select("id, customer_id, total_payable, status"),
        supabase.from("customers").select("id, full_name"),
      ]);

      const monthlyIncome = (payments ?? []).filter((p: any) => p.payment_date >= ms).reduce((a: number, p: any) => a + Number(p.amount), 0);
      const monthlyExp = (expenses ?? []).reduce((a: number, e: any) => a + Number(e.amount), 0);

      const paidByLoan = new Map<string, number>();
      (payments ?? []).forEach((p: any) => paidByLoan.set(p.loan_id, (paidByLoan.get(p.loan_id) ?? 0) + Number(p.amount)));

      let outstanding = 0; let overdueCount = 0;
      const paidByCustomer = new Map<string, number>();
      (loans ?? []).forEach((l: any) => {
        const paid = paidByLoan.get(l.id) ?? 0;
        if (l.status === "active" || l.status === "overdue") outstanding += Math.max(Number(l.total_payable) - paid, 0);
        if (l.status === "overdue") overdueCount++;
        paidByCustomer.set(l.customer_id, (paidByCustomer.get(l.customer_id) ?? 0) + paid);
      });

      const ranking = (customers ?? []).map((c: any) => ({ name: c.full_name, total: paidByCustomer.get(c.id) ?? 0 }))
        .sort((a, b) => b.total - a.total).slice(0, 10);

      // daily collections last 7 days
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days[d.toISOString().split("T")[0]] = 0; }
      (payments ?? []).forEach((p: any) => { if (p.payment_date in days) days[p.payment_date] += Number(p.amount); });

      setData({ ranking, daily: Object.entries(days).map(([date, total]) => ({ date, total })), monthlyIncome, monthlyExp, outstanding, overdueCount });
    })();
  }, []);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageHeader title="Reports" description="Profit, collections and rankings" />
      <div className="grid gap-4 md:grid-cols-4">
        <Card label="Monthly income" value={formatTHB(data.monthlyIncome)} />
        <Card label="Monthly expenses" value={formatTHB(data.monthlyExp)} />
        <Card label="Net profit" value={formatTHB(data.monthlyIncome - data.monthlyExp)} highlight />
        <Card label="Outstanding" value={formatTHB(data.outstanding)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Daily collections (7 days)">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Collected</TableHead></TableRow></TableHeader>
            <TableBody>{data.daily.map((d) => <TableRow key={d.date}><TableCell>{d.date}</TableCell><TableCell className="text-right font-medium">{formatTHB(d.total)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>
        <Section title="Top customers (by total paid)">
          <Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Total paid</TableHead></TableRow></TableHeader>
            <TableBody>{data.ranking.map((r) => <TableRow key={r.name}><TableCell>{r.name}</TableCell><TableCell className="text-right font-medium">{formatTHB(r.total)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>
      </div>
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-[var(--shadow-card)] ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
