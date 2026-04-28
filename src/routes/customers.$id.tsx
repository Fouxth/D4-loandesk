import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, loanStatusTone } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { formatTHB, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/customers/$id")({
  component: () => (
    <ProtectedRoute><AppLayout><Detail /></AppLayout></ProtectedRoute>
  ),
});

function Detail() {
  const { id } = Route.useParams();
  const [c, setC] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: cust } = await supabase.from("customers").select("*").eq("id", id).single();
      setC(cust);
      const { data: ls } = await supabase.from("loans").select("*").eq("customer_id", id).order("created_at", { ascending: false });
      setLoans(ls ?? []);
      const loanIds = (ls ?? []).map((l) => l.id);
      if (loanIds.length) {
        const { data: ps } = await supabase.from("payments").select("*").in("loan_id", loanIds).order("payment_date", { ascending: false });
        setPayments(ps ?? []);
      }
    })();
  }, [id]);

  if (!c) return <div className="text-muted-foreground">Loading…</div>;

  const outstanding = loans.reduce((sum, l) => {
    const paid = payments.filter((p) => p.loan_id === l.id).reduce((a, p) => a + Number(p.amount), 0);
    return l.status !== "completed" && l.status !== "cancelled" ? sum + Math.max(Number(l.total_payable) - paid, 0) : sum;
  }, 0);

  return (
    <div>
      <Link to="/customers"><Button variant="ghost" size="sm" className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button></Link>
      <PageHeader title={c.full_name} description={c.phone || "No phone"} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Risk</dt><dd><StatusBadge tone={c.risk_level === "high" ? "destructive" : c.risk_level === "medium" ? "warning" : "success"}>{c.risk_level}</StatusBadge></dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">ID card</dt><dd>{c.id_card || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Address</dt><dd className="text-right">{c.address || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Outstanding</dt><dd className="font-semibold">{formatTHB(outstanding)}</dd></div>
          </dl>
          {c.notes && <p className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">{c.notes}</p>}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] lg:col-span-2">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loans ({loans.length})</h3>
          <div className="space-y-2">
            {loans.length === 0 && <p className="text-sm text-muted-foreground">No loans yet</p>}
            {loans.map((l) => (
              <Link key={l.id} to="/loans/$loanId" params={{ loanId: l.id }} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50">
                <div>
                  <p className="text-sm font-medium">{l.loan_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(l.start_date)} → {formatDate(l.due_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatTHB(l.total_payable)}</p>
                  <StatusBadge tone={loanStatusTone(l.status)}>{l.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] lg:col-span-3">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history ({payments.length})</h3>
          <div className="max-h-80 space-y-1 overflow-auto">
            {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                <span className="text-muted-foreground">{formatDate(p.payment_date)} · #{p.installment_number ?? "—"}</span>
                <span className="font-medium">{formatTHB(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
