import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatTHB, formatDate } from "@/lib/format";

export const Route = createFileRoute("/payments")({
  component: () => (<ProtectedRoute><AppLayout><Payments /></AppLayout></ProtectedRoute>),
});

function Payments() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    supabase.from("payments").select("*, loans(loan_number, customers(full_name))").order("payment_date", { ascending: false }).limit(500).then(({ data }) => setRows(data ?? []));
  }, []);
  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.loans?.loan_number?.toLowerCase().includes(q) || r.loans?.customers?.full_name?.toLowerCase().includes(q);
  });
  const total = filtered.reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div>
      <PageHeader title="Payments" description={`${filtered.length} payments · ${formatTHB(total)} collected`} />
      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search loan or customer…" className="pl-9" />
      </div>
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Loan</TableHead><TableHead>Customer</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                <TableCell><Link to="/loans/$loanId" params={{ loanId: p.loan_id }} className="font-medium hover:underline">{p.loans?.loan_number}</Link></TableCell>
                <TableCell>{p.loans?.customers?.full_name}</TableCell>
                <TableCell className="text-muted-foreground capitalize">{p.method}</TableCell>
                <TableCell className="text-right font-medium">{formatTHB(p.amount)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No payments</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
