import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatTHB, formatDate } from "@/lib/format";

export const Route = createFileRoute("/expenses")({
  component: () => (<ProtectedRoute><AppLayout><Expenses /></AppLayout></ProtectedRoute>),
});

function Expenses() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const load = async () => { const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false }); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  const total = rows.reduce((a, e) => a + Number(e.amount), 0);
  const remove = async (id: string) => { if (!confirm("Delete?")) return; await supabase.from("expenses").delete().eq("id", id); load(); };
  return (
    <div>
      <PageHeader title="Expenses" description={`${rows.length} entries · ${formatTHB(total)} total`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Add expense</Button></DialogTrigger>
          <ExpenseForm onDone={() => { setOpen(false); load(); }} />
        </Dialog>
      } />
      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground">{formatDate(e.expense_date)}</TableCell>
                <TableCell className="capitalize">{e.category}</TableCell>
                <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                <TableCell className="text-right font-medium">{formatTHB(e.amount)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No expenses</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ category: "fuel" as any, amount: 0, expense_date: new Date().toISOString().split("T")[0], description: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expenses").insert({ ...form, created_by: user?.id } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Expense added"); onDone();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fuel">Fuel</SelectItem><SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="calls">Calls</SelectItem><SelectItem value="documents">Documents</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={1} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={busy}>Add</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
