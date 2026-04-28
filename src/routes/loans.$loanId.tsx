import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusBadge, loanStatusTone } from "@/components/StatusBadge";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatTHB, formatDate } from "@/lib/format";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/loans/$loanId")({
  component: () => (<ProtectedRoute><AppLayout><LoanDetail /></AppLayout></ProtectedRoute>),
});

function LoanDetail() {
  const { loanId } = Route.useParams();
  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data: l } = await supabase.from("loans").select("*, customers(id, full_name, phone)").eq("id", loanId).single();
    setLoan(l);
    const { data: ps } = await supabase.from("payments").select("*").eq("loan_id", loanId).order("payment_date", { ascending: false });
    setPayments(ps ?? []);
  };
  useEffect(() => { load(); }, [loanId]);

  if (!loan) return <div className="text-muted-foreground">Loading…</div>;
  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const remaining = Math.max(Number(loan.total_payable) - paid, 0);

  const removePayment = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logActivity("delete_payment", "payment", id);
    toast.success("Payment deleted");
    load();
  };

  return (
    <div>
      <Link to="/loans"><Button variant="ghost" size="sm" className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button></Link>
      <PageHeader
        title={loan.loan_number}
        description={loan.customers?.full_name}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Record payment</Button></DialogTrigger>
            <PaymentForm loanId={loanId} suggested={Number(loan.installment_amount)} nextNum={payments.length + 1} onDone={() => { setOpen(false); load(); }} />
          </Dialog>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] lg:col-span-1">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge tone={loanStatusTone(loan.status)}>{loan.status}</StatusBadge></dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Principal</dt><dd>{formatTHB(loan.principal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Interest</dt><dd>{formatTHB(loan.interest_amount)} ({loan.interest_rate}%)</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd className="font-semibold">{formatTHB(loan.total_payable)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd className="text-success">{formatTHB(paid)}</dd></div>
            <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Remaining</dt><dd className="text-base font-bold">{formatTHB(remaining)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Installment</dt><dd>{formatTHB(loan.installment_amount)} {loan.payment_type}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Period</dt><dd>{formatDate(loan.start_date)} → {formatDate(loan.due_date)}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] lg:col-span-2">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payments ({payments.length})</h3>
          <div className="max-h-[500px] space-y-1 overflow-auto">
            {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">#{p.installment_number ?? "—"} · {formatTHB(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)} · {p.method}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removePayment(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ loanId, suggested, nextNum, onDone }: { loanId: string; suggested: number; nextNum: number; onDone: () => void }) {
  const [form, setForm] = useState({
    amount: suggested, payment_date: new Date().toISOString().split("T")[0],
    installment_number: nextNum, method: "cash" as "cash" | "bank_transfer" | "mobile" | "other", notes: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("payments").insert({ ...form, loan_id: loanId, created_by: user?.id } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    await logActivity("record_payment", "payment", undefined, { loan_id: loanId, amount: form.amount });
    toast.success("Payment recorded");
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={1} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Installment #</Label><Input type="number" min={1} value={form.installment_number} onChange={(e) => setForm({ ...form, installment_number: +e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={form.method} onValueChange={(v: any) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem><SelectItem value="bank_transfer">Bank</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem><SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button type="submit" disabled={busy}>Record</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
