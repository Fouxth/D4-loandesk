import { logActivity, getLoanById, getPaymentsByLoan, createPayment, deletePayment, refinanceLoan } from "@/lib/services";
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
import { toast } from "sonner";
import { formatTHB, formatDate } from "@/utils/format";
import { calcLoan } from "@/utils/loanCalc";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/loans/$loanId")({
  component: () => (<ProtectedRoute><AppLayout><LoanDetail /></AppLayout></ProtectedRoute>),
});

const METHOD_LABELS: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนผ่านธนาคาร",
  mobile: "โมบายแบงก์กิ้ง",
  other: "อื่นๆ",
};

function LoanDetail() {
  const { loanId } = Route.useParams();
  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const l = await getLoanById(loanId);
      setLoan(l);
      const ps = await getPaymentsByLoan(loanId);
      setPayments(ps ?? []);
    } catch (e) {
      console.error("Failed to load loan details", e);
    }
  };
  
  useEffect(() => { load(); }, [loanId]);

  if (!loan) return <div className="flex h-64 items-center justify-center text-muted-foreground animate-pulse">กำลังโหลดข้อมูลสัญญา...</div>;
  
  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const remaining = Math.max(Number(loan.totalPayable) - paid, 0);

  const removePayment = async (id: string) => {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการชำระเงินนี้?")) return;
    try {
      await deletePayment(id);
      try {
        await logActivity({ action: "delete_payment", entity_type: "payment", entity_id: id });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success("ลบประวัติการชำระเงินเรียบร้อยแล้ว");
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <Link to="/loans">
        <Button variant="ghost" size="sm" className="mb-4 hover:bg-muted">
          <ArrowLeft className="mr-1 h-4 w-4" />ย้อนกลับ
        </Button>
      </Link>
      
      <PageHeader
        title={loan.loanNumber}
        description={loan.customerName}
        actions={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1 sm:flex-initial shadow-[var(--shadow-elevated)] h-11 px-6 rounded-xl font-bold">
                  <Plus className="mr-2 h-5 w-5" />บันทึกการชำระเงิน
                </Button>
              </DialogTrigger>
              <PaymentForm 
                loanId={loanId} 
                suggested={Number(loan.installmentAmount)} 
                nextNum={payments.length + 1} 
                onDone={() => { setOpen(false); load(); }} 
              />
            </Dialog>

            <RefinanceDialog 
              loan={loan} 
              remaining={remaining} 
              onDone={() => { load(); }} 
            />
          </div>
        }
      />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 pb-10">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] lg:col-span-1">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">สรุปข้อมูลสัญญา</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">สถานะ</dt>
              <dd>
                <StatusBadge tone={loanStatusTone(loan.status)}>
                  {loan.status === 'active' ? 'ปกติ' : loan.status === 'overdue' ? 'เกินกำหนด' : loan.status === 'completed' ? 'เสร็จสิ้น' : 'ยกเลิก'}
                </StatusBadge>
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">เงินต้น</dt>
              <dd className="font-medium">{formatTHB(loan.principal)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ดอกเบี้ย ({loan.interestRate}%)</dt>
              <dd className="font-medium text-warning-foreground">{formatTHB(loan.interestAmount)}</dd>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-2">
              <dt className="text-muted-foreground">ยอดรวมทั้งหมด</dt>
              <dd className="font-bold">{formatTHB(loan.totalPayable)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ชำระแล้ว</dt>
              <dd className="font-bold text-success">{formatTHB(paid)}</dd>
            </div>
            <div className="flex justify-between items-center border-t border-primary/20 bg-primary/5 -mx-6 px-6 py-3 mt-2">
              <dt className="text-primary font-bold">ยอดคงเหลือ</dt>
              <dd className="text-xl font-black text-primary">{formatTHB(remaining)}</dd>
            </div>
            <div className="flex justify-between items-center mt-2">
              <dt className="text-muted-foreground">ยอดชำระต่องวด</dt>
              <dd className="font-bold">{formatTHB(loan.installmentAmount)} ({loan.paymentType === 'daily' ? 'รายวัน' : loan.paymentType === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน'})</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ระยะเวลาสัญญา</dt>
              <dd className="text-xs">{formatDate(loan.startDate)} → {formatDate(loan.dueDate)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] lg:col-span-2 overflow-hidden flex flex-col">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">ประวัติการชำระเงิน ({payments.length})</h3>
          <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
            {payments.length === 0 && <p className="text-sm text-muted-foreground py-12 text-center">ยังไม่มีประวัติการชำระเงิน</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-border/50 rounded-xl px-4 py-3 hover:bg-muted/30 transition-colors group">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    งวดที่ #{p.installmentNumber ?? "—"} · <span className="text-success">{formatTHB(p.amount)}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDate(p.paymentDate)} · {METHOD_LABELS[p.method] || p.method}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removePayment(p.id)} className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
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
    amount: suggested, 
    paymentDate: new Date().toISOString().split("T")[0],
    installmentNumber: nextNum, 
    method: "cash" as "cash" | "bank_transfer" | "mobile" | "other", 
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createPayment({ ...form, loanId });
      try {
        await logActivity({ action: "record_payment", entity_type: "payment", details: { loanId, amount: form.amount } });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success("บันทึกการชำระเงินเรียบร้อยแล้ว");
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
        <DialogTitle className="text-xl font-bold">บันทึกการชำระเงิน</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">จำนวนเงิน (บาท)</Label>
            <Input type="number" min={1} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ชำระงวดที่</Label>
            <Input type="number" min={1} value={form.installmentNumber} onChange={(e) => setForm({ ...form, installmentNumber: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">วันที่ชำระ</Label>
            <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ช่องทางการชำระ</Label>
            <Select value={form.method} onValueChange={(v: any) => setForm({ ...form, method: v })}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">เงินสด</SelectItem>
                <SelectItem value="bank_transfer">โอนผ่านธนาคาร</SelectItem>
                <SelectItem value="mobile">โมบายแบงก์กิ้ง</SelectItem>
                <SelectItem value="other">อื่นๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">หมายเหตุ</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-muted/20" placeholder="ระบุรายละเอียดเพิ่มเติม..." />
        </div>
        <DialogFooter className="pt-4">
          <Button type="submit" disabled={busy} className="w-full py-6 text-base font-bold shadow-[var(--shadow-elevated)]">
            {busy ? "กำลังบันทึก..." : "ยืนยันการชำระเงิน"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RefinanceDialog({ loan, remaining, onDone }: { loan: any; remaining: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    additionalPrincipal: 0,
    interestRate: Number(loan.interestRate),
    installmentsCount: Number(loan.installmentsCount),
    paymentType: loan.paymentType,
    startDate: new Date().toISOString().split("T")[0],
    notes: `รียอดใหม่จากสัญญา ${loan.loanNumber}`,
  });

  const totalPrincipal = remaining + Number(form.additionalPrincipal);
  const calc = calcLoan(totalPrincipal, form.interestRate, form.installmentsCount, form.paymentType, new Date(form.startDate));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await refinanceLoan(loan.id, {
        principal: totalPrincipal,
        interestRate: form.interestRate,
        interestAmount: calc.interest,
        totalPayable: calc.total,
        installmentsCount: form.installmentsCount,
        installmentAmount: calc.installment,
        paymentType: form.paymentType,
        startDate: form.startDate,
        dueDate: calc.due.toISOString().split("T")[0],
        notes: form.notes,
      });
      try {
        await logActivity({ action: "refinance_loan", entity_type: "loan", entity_id: loan.id, details: { newPrincipal: totalPrincipal } });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success("รียอดสัญญาใหม่เรียบร้อยแล้ว");
      setOpen(false);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-initial border-primary/20 text-primary hover:bg-primary/5 h-11 px-6 rounded-xl font-bold shadow-sm">
          <RefreshCw className="mr-2 h-5 w-5" />รียอดใหม่
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">รียอดสัญญาใหม่ (Refinance)</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">ยอดคงเหลือเดิม</p>
              <p className="text-lg font-black">{formatTHB(remaining)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">เงินต้นใหม่รวม</p>
              <p className="text-lg font-black text-primary">{formatTHB(totalPrincipal)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">เพิ่มเงินต้น (+)</Label>
              <Input type="number" value={form.additionalPrincipal} onChange={(e) => setForm({ ...form, additionalPrincipal: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">อัตราดอกเบี้ย (%)</Label>
              <Input type="number" step={0.1} value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">จำนวนงวด</Label>
              <Input type="number" value={form.installmentsCount} onChange={(e) => setForm({ ...form, installmentsCount: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ความถี่</Label>
              <Select value={form.paymentType} onValueChange={(v: any) => setForm({ ...form, paymentType: v })}>
                <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">รายวัน</SelectItem>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-1 sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">วันที่เริ่มสัญญาใหม่</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="bg-muted/20" />
            </div>
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">ยอดรวมใหม่</p>
                <p className="text-sm font-bold text-primary">{formatTHB(calc.total)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">ต่องวด</p>
                <p className="text-sm font-bold text-primary">{formatTHB(calc.installment)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">สิ้นสุดวันที่</p>
                <p className="text-[10px] font-bold">{formatDate(calc.due.toISOString().split("T")[0])}</p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="submit" disabled={busy} className="w-full py-6 text-base font-bold shadow-[var(--shadow-elevated)]">
              {busy ? "กำลังดำเนินการ..." : "ยืนยันการรียอดสัญญาใหม่"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
