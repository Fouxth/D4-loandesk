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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, loanStatusTone } from "@/components/StatusBadge";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calcLoan } from "@/lib/loanCalc";
import { formatTHB, formatDate } from "@/lib/format";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/loans")({
  component: () => (<ProtectedRoute><AppLayout><Loans /></AppLayout></ProtectedRoute>),
});

function Loans() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("loans").select("*, customers(full_name)").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.loan_number.toLowerCase().includes(q) || r.customers?.full_name.toLowerCase().includes(q);
    const matchStatus = filter === "all" || r.status === filter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <PageHeader
        title="Loans" description={`${rows.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />New loan</Button></DialogTrigger>
            <NewLoanForm onDone={() => { setOpen(false); load(); }} />
          </Dialog>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search loan # or customer…" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loan #</TableHead><TableHead>Customer</TableHead><TableHead>Principal</TableHead>
              <TableHead>Total</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => (
              <TableRow key={l.id} className="cursor-pointer">
                <TableCell><Link to="/loans/$loanId" params={{ loanId: l.id }} className="font-medium hover:underline">{l.loan_number}</Link></TableCell>
                <TableCell>{l.customers?.full_name}</TableCell>
                <TableCell>{formatTHB(l.principal)}</TableCell>
                <TableCell className="font-medium">{formatTHB(l.total_payable)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(l.due_date)}</TableCell>
                <TableCell><StatusBadge tone={loanStatusTone(l.status)}>{l.status}</StatusBadge></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No loans found</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewLoanForm({ onDone }: { onDone: () => void }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({
    customer_id: "", principal: 10000, interest_rate: 20, installments_count: 30,
    payment_type: "daily" as "daily" | "weekly" | "monthly",
    start_date: new Date().toISOString().split("T")[0], notes: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => { supabase.from("customers").select("id, full_name").order("full_name").then(({ data }) => setCustomers(data ?? [])); }, []);

  const calc = calcLoan(form.principal, form.interest_rate, form.installments_count, form.payment_type, new Date(form.start_date));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error("Select a customer");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("loans").insert({
      customer_id: form.customer_id, principal: form.principal, interest_rate: form.interest_rate,
      interest_amount: calc.interest, total_payable: calc.total, installments_count: form.installments_count,
      installment_amount: calc.installment, payment_type: form.payment_type, start_date: form.start_date,
      due_date: calc.due.toISOString().split("T")[0], notes: form.notes, created_by: user?.id,
    } as any).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    await logActivity("create_loan", "loan", data.id);
    toast.success("Loan created");
    onDone();
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>New loan</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Customer</Label>
          <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Principal (THB)</Label><Input type="number" min={1} value={form.principal} onChange={(e) => setForm({ ...form, principal: +e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Interest %</Label><Input type="number" min={0} step={0.1} value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: +e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Installments</Label><Input type="number" min={1} value={form.installments_count} onChange={(e) => setForm({ ...form, installments_count: +e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={form.payment_type} onValueChange={(v: any) => setForm({ ...form, payment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <div><p className="text-xs text-muted-foreground">Interest</p><p className="font-semibold">{formatTHB(calc.interest)}</p></div>
            <div><p className="text-xs text-muted-foreground">Total payable</p><p className="font-semibold">{formatTHB(calc.total)}</p></div>
            <div><p className="text-xs text-muted-foreground">Per installment</p><p className="font-semibold">{formatTHB(calc.installment)}</p></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Due: {formatDate(calc.due)}</p>
        </div>
        <DialogFooter><Button type="submit" disabled={busy}>Create loan</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
