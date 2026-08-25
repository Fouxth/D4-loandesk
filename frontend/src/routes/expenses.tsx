import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
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
import { Plus, Trash2, TrendingDown, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatTHB, formatDate, getThaiDateStr } from "@/utils/format";
import { getExpenses, createExpense, deleteExpense } from "@/lib/services";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useTranslation } from "react-i18next";
import { useSessionState } from "@/hooks/useSessionState";

export const Route = createFileRoute("/expenses")({
  component: () => (<ProtectedRoute><AppLayout><Expenses /></AppLayout></ProtectedRoute>),
});

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "ค่าน้ำมัน",
  staff: "เงินเดือนพนักงาน",
  calls: "ค่าโทรศัพท์",
  documents: "ค่าเอกสาร",
  other: "อื่นๆ",
};

function formatMonthYearTH(monthKey: string): string {
  if (monthKey === 'all') return 'ทุกเดือน (ทั้งหมด)';
  const parts = monthKey.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return monthKey;
  const [y, m] = parts;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

function Expenses() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const currentMonthKey = getThaiDateStr().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useSessionState<string>("expenses_selected_month", currentMonthKey);
  
  const load = async () => { 
    const data = await getExpenses(); 
    setRows(data ?? []); 
  };
  
  useEffect(() => { load(); }, []);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>([
      currentMonthKey,
      selectedMonth,
      ...rows.map((r) => String(r.expenseDate || r.expense_date || "").substring(0, 7)).filter(Boolean)
    ]);
    
    const now = new Date();
    for (let i = -12; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(mKey);
    }

    return Array.from(monthsSet).filter(m => m !== 'all').sort().reverse();
  }, [currentMonthKey, selectedMonth, rows]);

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

  const filteredRows = rows.filter((r) => {
    if (selectedMonth === 'all') return true;
    const dateStr = String(r.expenseDate || r.expense_date || '').substring(0, 7);
    return dateStr === selectedMonth;
  });

  const totalFiltered = filteredRows.reduce((a, e) => a + Number(e.amount), 0);

  const remove = async (id: string) => { 
    try {
      await deleteExpense(id); 
      load(); 
      toast.success("ลบรายการเรียบร้อยแล้ว");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const monthLabelText = selectedMonth === 'all' ? 'ทุกเดือน' : formatMonthYearTH(selectedMonth);

  return (
    <div className="animate-in fade-in duration-500 space-y-4">
      <PageHeader 
        title="ค่าใช้จ่าย" 
        description={`ประจำเดือน: ${monthLabelText} · ทั้งหมด ${filteredRows.length} รายการ · รวม ${formatTHB(totalFiltered)}`} 
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-[var(--shadow-elevated)] w-full sm:w-auto h-11 px-6 rounded-xl font-bold">
                <Plus className="mr-2 h-5 w-5" />เพิ่มค่าใช้จ่าย
              </Button>
            </DialogTrigger>
            <ExpenseForm onDone={() => { setOpen(false); load(); }} />
          </Dialog>
        } 
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

        <div className="flex items-center justify-between sm:justify-end gap-3 px-3 py-1.5 bg-muted/30 border border-border/50 rounded-xl">
          <span className="text-xs font-bold text-muted-foreground">ยอดรวมเดือนนี้:</span>
          <span className="text-base font-black text-destructive">{formatTHB(totalFiltered)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                <TableHead className="font-bold whitespace-nowrap">{t('expenses.table.date', 'วันที่')}</TableHead>
                <TableHead className="font-bold whitespace-nowrap">{t('expenses.table.category', 'หมวดหมู่')}</TableHead>
                <TableHead className="font-bold whitespace-nowrap">{t('expenses.table.description', 'รายละเอียด')}</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">{t('expenses.table.amount', 'จำนวนเงิน')}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((e) => (
                <TableRow key={e.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs">{formatDate(e.expenseDate)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {CATEGORY_LABELS[e.category] || e.category}
                  </TableCell>
                  <TableCell className="text-muted-foreground min-w-[200px]">{e.description || "—"}</TableCell>
                  <TableCell className="text-right font-bold text-destructive whitespace-nowrap">{formatTHB(e.amount)}</TableCell>
                  <TableCell className="text-right">
                    <ConfirmDelete
                      onConfirm={() => remove(e.id)}
                      title="ยืนยันการลบค่าใช้จ่าย"
                      description={`คุณแน่ใจหรือไม่ว่าต้องการลบรายการค่าใช้จ่ายนี้?\nการดำเนินการนี้ไม่สามารถกู้คืนได้`}
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </ConfirmDelete>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-border/50">
          {filteredRows.map((e) => (
            <div key={e.id} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/5 flex items-center justify-center text-destructive">
                  <TrendingDown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold">{CATEGORY_LABELS[e.category] || e.category}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{formatDate(e.expenseDate)}</span>
                    {(e.details || e.description) && (
                      <>
                        <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                        <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{e.details || e.description}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-black text-destructive text-sm">{formatTHB(e.amount)}</span>
                <ConfirmDelete
                  onConfirm={() => remove(e.id)}
                  title="ยืนยันการลบค่าใช้จ่าย"
                  description="คุณแน่ใจหรือไม่ว่าต้องการลบรายการค่าใช้จ่ายนี้? การดำเนินการนี้ไม่สามารถกู้คืนได้"
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDelete>
              </div>
            </div>
          ))}
        </div>

        {filteredRows.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            ไม่มีรายการค่าใช้จ่ายประจำ{monthLabelText}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ 
    category: "fuel" as any, 
    amount: 0, 
    expenseDate: new Date().toISOString().split("T")[0], 
    description: "" 
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setBusy(true);
    try {
      await createExpense({
        ...form,
        details: form.description,
      });
      toast.success("บันทึกค่าใช้จ่ายเรียบร้อยแล้ว"); 
      setForm({ 
        category: "fuel" as any, 
        amount: 0, 
        expenseDate: getThaiDateStr(), 
        description: "" 
      });
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="w-[95vw] sm:w-full max-w-md border-border shadow-[var(--shadow-elevated)]">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">เพิ่มรายการค่าใช้จ่าย</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">หมวดหมู่</Label>
            <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fuel">ค่าน้ำมัน</SelectItem>
                <SelectItem value="staff">เงินเดือนพนักงาน</SelectItem>
                <SelectItem value="calls">ค่าโทรศัพท์</SelectItem>
                <SelectItem value="documents">ค่าเอกสาร</SelectItem>
                <SelectItem value="other">อื่นๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">จำนวนเงิน (บาท)</Label>
            <Input type="number" min={0} step={0.01} value={form.amount} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">วันที่</Label>
          <Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="bg-muted/20" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">รายละเอียด</Label>
          <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-muted/20" placeholder="ระบุรายละเอียดค่าใช้จ่าย..." />
        </div>
        <DialogFooter className="pt-4">
          <Button type="submit" disabled={busy} className="w-full py-6 text-base font-bold shadow-[var(--shadow-elevated)]">
            {busy ? "กำลังบันทึก..." : "บันทึกค่าใช้จ่าย"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
