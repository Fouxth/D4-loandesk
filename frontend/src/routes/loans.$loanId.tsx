import { logActivity, getLoanById, getPaymentsByLoan, createPayment, deletePayment, refinanceLoan, deleteLoan, updateLoan, getLoanAttachments, uploadAttachment, deleteAttachment } from "@/lib/services";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { ArrowLeft, Plus, Trash2, Camera, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatTHB, formatDate } from "@/utils/format";
import { calcLoan } from "@/utils/loanCalc";
import { RefreshCw } from "lucide-react";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useSettings } from "@/contexts/SettingsContext";
import { daysBetween } from "@/utils/format";

export const Route = createFileRoute("/loans/$loanId")({
  component: () => (<ProtectedRoute><AppLayout><LoanDetail /></AppLayout></ProtectedRoute>),
});

const METHOD_LABELS: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนผ่านธนาคาร",
  mobile: "โมบายแบงก์กิ้ง",
  other: "อื่นๆ",
};
const PAWN_STATUS_LABELS: Record<string, string> = {
  in_storage: "อยู่ในคลัง",
  redeemed: "ไถ่ถอนแล้ว",
  forfeited: "หลุดจำนำ",
};

function LoanDetail() {
  const { loanId } = Route.useParams();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const { lending } = useSettings();

  const load = async () => {
    try {
      const l = await getLoanById(loanId);
      setLoan(l);
      const [ps, atts] = await Promise.all([
        getPaymentsByLoan(loanId),
        getLoanAttachments(loanId)
      ]);
      setPayments(ps ?? []);
      setAttachments(atts ?? []);
    } catch (e) {
      console.error("Failed to load loan details", e);
    }
  };
  
  useEffect(() => { load(); }, [loanId]);

  if (!loan) return <div className="flex h-64 items-center justify-center text-muted-foreground animate-pulse">กำลังโหลดข้อมูลสัญญา...</div>;
  
  const principalPaid = payments.filter(p => p.category === 'principal').reduce((a, p) => a + Number(p.amount), 0);
  const interestPaid = payments.filter(p => p.category === 'interest').reduce((a, p) => a + Number(p.amount), 0);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount), 0);
  
  // Late fee calculation
  const today = new Date().toISOString().split('T')[0];
  const diff = daysBetween(today, loan.dueDate);
  const daysOverdue = (loan.status === 'active' || loan.status === 'overdue') && diff > 0 ? diff : 0;
  const lateFeeTotal = daysOverdue * (lending.lateFeePerDay || 0);
  
  const remaining = loan.isInterestOnly 
    ? Math.max(Number(loan.principal) + lateFeeTotal - principalPaid, 0)
    : Math.max(Number(loan.totalPayable) + lateFeeTotal - totalPaid, 0);

  const removePayment = async (id: string) => {
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

  const updatePawnStatus = async (status: string) => {
    try {
      const updateData: any = { pawn_status: status };
      if (status === 'redeemed') {
        updateData.status = 'completed';
      } else if (status === 'forfeited') {
        updateData.status = 'forfeited';
      }
      await updateLoan(loanId, updateData);
      toast.success("อัปเดตสถานะเรียบร้อยแล้ว");
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAttachment(loanId, file);
      toast.success("อัปโหลดรูปภาพเรียบร้อยแล้ว");
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (id: string) => {
    try {
      await deleteAttachment(id);
      toast.success("ลบรูปภาพเรียบร้อยแล้ว");
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const removeLoan = async () => {
    try {
      await deleteLoan(loanId);
      try {
        await logActivity({ action: "delete_loan", entity_type: "loan", entity_id: loanId, details: { loanNumber: loan.loanNumber } });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success("ลบสัญญาเรียบร้อยแล้ว");
      navigate({ to: "/loans" });
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
                isInterestOnly={loan.isInterestOnly}
                onDone={() => { setOpen(false); load(); }} 
              />
            </Dialog>

            <RefinanceDialog 
              loan={loan} 
              remaining={remaining} 
              onDone={() => { load(); }} 
            />

            <ConfirmDelete 
              onConfirm={removeLoan}
              title="ยืนยันการลบสัญญา"
              description={`🚨 คุณแน่ใจหรือไม่ว่าต้องการลบสัญญานี้?\nการลบจะลบข้อมูลประวัติการชำระเงินทั้งหมดที่เกี่ยวข้องออกไปด้วย และไม่สามารถกู้คืนได้!`}
            >
              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive shadow-sm" title="ลบสัญญา">
                <Trash2 className="h-5 w-5" />
              </Button>
            </ConfirmDelete>
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
                  {loan.status === 'active' ? 'ปกติ' : 
                   loan.status === 'overdue' ? 'เกินกำหนด' : 
                   loan.status === 'completed' ? (loan.isPawn ? 'ไถ่ถอนแล้ว' : 'เสร็จสิ้น') : 
                   loan.status === 'forfeited' ? 'หลุดจำนำ' : 
                   loan.status === 'refinanced' ? 'ต่อดอกใหม่' : 'ยกเลิก'}
                </StatusBadge>
                {loan.isInterestOnly && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-primary/20 text-primary">
                    ดอกลอย
                  </span>
                )}
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
            {lateFeeTotal > 0 && (
              <div className="flex justify-between items-center">
                <dt className="text-destructive font-medium">ค่าปรับล่าช้า ({daysOverdue} วัน)</dt>
                <dd className="font-bold text-destructive">+{formatTHB(lateFeeTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-border pt-2">
              <dt className="text-muted-foreground">ยอดรวมทั้งหมด</dt>
              <dd className="font-bold">{formatTHB(loan.totalPayable)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ชำระแล้ว (รวมทั้งหมด)</dt>
              <dd className="font-bold text-success">{formatTHB(totalPaid)}</dd>
            </div>
            {loan.isInterestOnly && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-muted-foreground pl-4">└ ดอกเบี้ยที่จ่ายแล้ว</dt>
                <dd className="font-medium">{formatTHB(interestPaid)}</dd>
              </div>
            )}
            {loan.isInterestOnly && (
              <div className="flex justify-between items-center text-xs border-b border-border/50 pb-2">
                <dt className="text-muted-foreground pl-4">└ เงินต้นที่คืนแล้ว</dt>
                <dd className="font-medium">{formatTHB(principalPaid)}</dd>
              </div>
            )}
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
              <dd className="text-xs">
                {loan.isIndefinite ? (
                  <span className="font-bold text-primary">ไม่มีกำหนด (เก็บไปเรื่อยๆ)</span>
                ) : (
                  <>{formatDate(loan.startDate)} → {formatDate(loan.dueDate)}</>
                )}
              </dd>
            </div>
          </dl>
          
          {loan.isPawn && (
            <div className="mt-6 pt-6 border-t border-border">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">ข้อมูลทรัพย์สินจำนำ</h4>
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <p className="text-sm font-bold text-foreground mb-2">{loan.pawnItem}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    loan.pawnStatus === 'redeemed' ? 'bg-success/20 text-success' : 
                    loan.pawnStatus === 'forfeited' ? 'bg-destructive/20 text-destructive' : 
                    'bg-warning/20 text-warning-foreground'
                  }`}>
                    {PAWN_STATUS_LABELS[loan.pawnStatus] || loan.pawnStatus}
                  </span>
                  
                  <Select value={loan.pawnStatus} onValueChange={updatePawnStatus}>
                    <SelectTrigger className="h-7 w-28 text-[10px] bg-background">
                      <SelectValue placeholder="เปลี่ยนสถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_storage">อยู่ในคลัง</SelectItem>
                      <SelectItem value="redeemed">ไถ่ถอนแล้ว</SelectItem>
                      <SelectItem value="forfeited">หลุดจำนำ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
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
                    {p.category === 'interest' && <span className="ml-2 text-[10px] font-bold text-primary uppercase bg-primary/10 px-1 rounded">ดอกเบี้ย</span>}
                    {p.category === 'principal' && <span className="ml-2 text-[10px] font-bold text-success-foreground uppercase bg-success/10 px-1 rounded">เงินต้น</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDate(p.paymentDate)} · {METHOD_LABELS[p.method] || p.method}
                  </p>
                </div>
                <ConfirmDelete
                  onConfirm={() => removePayment(p.id)}
                  title="ยืนยันการลบประวัติการชำระเงิน"
                  description={`คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการชำระเงินนี้?\nการดำเนินการนี้ไม่สามารถกู้คืนได้`}
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </ConfirmDelete>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] mb-10 overflow-hidden">
        <div className="flex items-center justify-between mb-6 border-b border-border pb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> รูปถ่ายหลักฐาน ({attachments.length})
          </h3>
          <div className="flex gap-2">
            <Input 
              type="file" 
              id="photo-upload" 
              className="hidden" 
              accept="image/*" 
              onChange={handleUpload}
            />
            <Button 
              variant="outline" 
              size="sm" 
              disabled={uploading}
              onClick={() => document.getElementById('photo-upload')?.click()}
              className="rounded-xl border-primary/20 text-primary hover:bg-primary/5 font-bold h-9 shadow-sm"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
              {uploading ? "กำลังอัปโหลด..." : "แนบรูปถ่าย / ถ่ายภาพ"}
            </Button>
          </div>
        </div>

        {attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl bg-muted/5">
            <Camera className="h-12 w-12 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">ยังไม่มีรูปถ่ายแนบในสัญญานี้</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {attachments.map((att) => (
              <div key={att.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border shadow-sm">
                <a 
                  href={`${import.meta.env.VITE_API_URL || 'http://localhost:9876'}/${att.filePath}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="block w-full h-full"
                >
                  <img 
                    src={`${import.meta.env.VITE_API_URL || 'http://localhost:9876'}/${att.filePath}`} 
                    alt={att.fileName} 
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                </a>
                <Button 
                  variant="destructive" 
                  size="icon" 
                  onClick={() => removeAttachment(att.id)}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentForm({ loanId, suggested, nextNum, isInterestOnly, onDone }: { loanId: string; suggested: number; nextNum: number; isInterestOnly: boolean; onDone: () => void }) {
  const [form, setForm] = useState({
    amount: suggested, 
    paymentDate: new Date().toISOString().split("T")[0],
    installmentNumber: nextNum, 
    method: "cash" as "cash" | "bank_transfer" | "mobile" | "other", 
    category: isInterestOnly ? "interest" : "principal" as "interest" | "principal",
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
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ประเภทการชำระ</Label>
            <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="interest">ชำระดอกเบี้ย</SelectItem>
                <SelectItem value="principal">ชำระเงินต้น / ปิดยอด</SelectItem>
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
  const { lending } = useSettings();
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
