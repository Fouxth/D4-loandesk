import { logActivity, getLoanById, getPaymentsByLoan, createPayment, deletePayment, refinanceLoan, deleteLoan, updateLoan, getLoanAttachments, uploadAttachment, deleteAttachment } from "@/lib/services";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusBadge, loanStatusTone, getEffectiveStatus, getLoanStatusLabel, getLoanNextDueDate } from "@/components/StatusBadge";
import { ArrowLeft, Plus, Trash2, Camera, Image as ImageIcon, X, Loader2, Pencil, RefreshCw, PlusCircle, Flame, CheckCheck } from "lucide-react";
import { cn } from "@/utils/utils";
import { toast } from "sonner";
import { formatTHB, formatDate, daysBetween, getThaiDateStr } from "@/utils/format";
import { calcLoan } from "@/utils/loanCalc";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useSettings } from "@/contexts/SettingsContext";
import { resolveLateFee } from "@/utils/lateFee";
import { LateFeeEditor } from "@/components/LateFeeEditor";
import { PromiseDateEditor } from "@/components/PromiseDateEditor";
import { EditLoanModal } from "@/components/EditLoanModal";
import { TopupLoanModal } from "@/components/TopupLoanModal";
import { SettleLoanModal } from "@/components/SettleLoanModal";
import { getLoanCategory } from "@/utils/loanType";
import {
  calcLoanPaidTotal,
  calcLoanTotalOwed,
  calcTpSettlementAmount,
  shouldSkipContractLateFee,
} from "@/utils/tpPayment";

export const Route = createFileRoute("/loans/$loanId")({
  component: () => (<ProtectedRoute><AppLayout><LoanDetail /></AppLayout></ProtectedRoute>),
});

const METHOD_LABELS: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนผ่านธนาคาร",
  other: "อื่นๆ",
};
const PAWN_STATUS_LABELS: Record<string, string> = {
  in_storage: "อยู่ในคลัง",
  redeemed: "ไถ่ถอนแล้ว",
  forfeited: "หลุดจำนำ",
};

function resolveFileUrl(filePath?: string | null) {
  if (!filePath) return "";
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '').replace(/\/api$/, '') ?? '';
  return `${apiBase}/${filePath}`;
}

function LoanDetail() {
  const { loanId } = Route.useParams();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const { lending } = useSettings();
  const [openMobile, setOpenMobile] = useState(false);

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
  
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !open && !openMobile && !document.querySelector('[role="dialog"]')) {
        load();
      }
    }, 30000);

    const onFocus = () => {
      if (!open && !openMobile && !document.querySelector('[role="dialog"]')) load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loanId, open, openMobile]);

  if (!loan) return <div className="flex h-64 items-center justify-center text-muted-foreground animate-pulse">กำลังโหลดข้อมูลสัญญา...</div>;

  const pawnStatus = loan.pawnStatus || 'in_storage';
  const isPrincipalInterestAtEnd = loan.isPrincipalInterestAtEnd ?? loan.is_principal_interest_at_end;
  
  const installmentAmount = Number(loan.installmentAmount ?? 0);
  const tpConfig = {
    tpRollAmount: lending.tpRollAmount,
    tpPayAmount: lending.tpPayAmount,
    tpPenaltyAmount: lending.tpPenaltyAmount,
  };
  const rollPenalties = payments.filter((p) => p.category === 'roll_penalty');
  const regularPayments = payments.filter((p) => p.category !== 'roll_penalty');
  const tpCount = rollPenalties.length;

  const principalPaid = payments.filter(p => p.category === 'principal').reduce((a, p) => a + Number(p.amount), 0);
  const interestPaid = payments.filter(p => p.category === 'interest').reduce((a, p) => a + Number(p.amount), 0);

  const hasTpAccounting = tpCount > 0 && installmentAmount > 0;
  const totalPaid = hasTpAccounting
    ? calcLoanPaidTotal(payments, installmentAmount, tpConfig)
    : payments.reduce((a, p) => a + Number(p.amount), 0);

  const paidInstallments = regularPayments.length + tpCount;

  const loanWithPayments = { ...loan, paidInstallmentsCount: payments.length };
  const contractDueDateStr = loan.promiseDate || loan.dueDate || loan.due_date;
  const today = getThaiDateStr();
  const diff = contractDueDateStr ? daysBetween(today, contractDueDateStr) : 0;
  const skipContractLateFee = shouldSkipContractLateFee(loan);
  const rawDaysOverdue =
    !skipContractLateFee && contractDueDateStr && (getEffectiveStatus(loanWithPayments) === 'active' || getEffectiveStatus(loanWithPayments) === 'overdue' || getEffectiveStatus(loanWithPayments) === 'due_today')
      ? Math.max(diff, 0)
      : 0;
  const { autoFee, effectiveFee, daysOverdue, hoursOverdue, mode: lateFeeMode } = resolveLateFee(
    lending,
    loan,
    rawDaysOverdue,
    contractDueDateStr,
  );
  const lateFeeUnitParts = [
    daysOverdue > 0 ? `${daysOverdue} วัน` : null,
    hoursOverdue > 0 ? `${hoursOverdue} ชม.` : null,
  ].filter(Boolean);
  const lateFeeUnit = lateFeeUnitParts.length > 0 ? lateFeeUnitParts.join(' ') : '0 ชม.';

  const isPawnLoan = Boolean(loan.isPawn || loan.is_pawn);
  const isFloatingInterest = Boolean((loan.isInterestOnly || loan.is_interest_only) && !isPawnLoan);
  const isInterestOnlyMode = Boolean(isFloatingInterest || isPawnLoan);

  const totalOwed = hasTpAccounting
    ? calcLoanTotalOwed(Number(loan.totalPayable), tpCount, installmentAmount, tpConfig)
    : Number(isInterestOnlyMode ? loan.principal : loan.totalPayable);

  const contractRemaining = isInterestOnlyMode
    ? Math.max(Number(loan.principal) - principalPaid, 0)
    : Math.max(totalOwed - totalPaid, 0);

  const remaining = contractRemaining + (skipContractLateFee ? 0 : effectiveFee);
  const loanCategory = getLoanCategory(loan);
  const totalInstallments = Number(loan.installmentsCount ?? 0);
  const recordedInstallmentNumbers = payments
    .map((payment) => Number(payment.installmentNumber ?? payment.installment_number ?? payment.installmentNo))
    .filter((installmentNumber) => Number.isFinite(installmentNumber) && installmentNumber > 0);
  const nextInstallmentNumber = recordedInstallmentNumbers.length > 0
    ? Math.max(...recordedInstallmentNumbers) + 1
    : payments.length + 1;
  const dueAmountBase = isPrincipalInterestAtEnd ? contractRemaining : installmentAmount;
  const suggestedPaymentAmount = isFloatingInterest
    ? installmentAmount
    : Math.max(Math.min(dueAmountBase, contractRemaining || dueAmountBase), 0);

  // Floating Interest (ดอกลอย) calculations
  const dailyFloatingRate = Number(loan.installmentAmount ?? loan.installment_amount ?? (Number(loan.principal) * Number(loan.interestRate || 0) / 100));
  const interestPayments = payments.filter((p) => p.category === 'interest');
  const lastInterestPaymentDate = interestPayments.length > 0
    ? String(interestPayments[0].paymentDate || interestPayments[0].payment_date).substring(0, 10)
    : String(loan.startDate || loan.start_date || '').substring(0, 10);
  const todayDateStr = getThaiDateStr();
  const floatingDaysUnpaid = lastInterestPaymentDate ? Math.max(0, daysBetween(lastInterestPaymentDate, todayDateStr)) : 1;
  const floatingDueTodayDays = floatingDaysUnpaid;
  const floatingDueTodayAmount = floatingDueTodayDays * dailyFloatingRate;

  const removePayment = async (id: string) => {
    try {
      await deletePayment(id);
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
    e.target.value = "";
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
                suggested={suggestedPaymentAmount} 
                nextNum={nextInstallmentNumber} 
                isInterestOnly={isFloatingInterest}
                installmentAmount={loan.installmentAmount ?? loan.installment_amount ?? 0}
                tpPenaltyAmount={lending.tpPenaltyAmount ?? 100}
                floatingDaysDue={floatingDueTodayDays}
                isOpen={open}
                onDone={() => { setOpen(false); load(); }} 
              />
            </Dialog>

            {isFloatingInterest && (
              <TopupLoanModal loan={loan} onDone={load} />
            )}

            {loan.status !== 'completed' && (
              <SettleLoanModal
                loan={loan}
                remaining={contractRemaining}
                effectiveFee={effectiveFee}
                nextInstallmentNumber={nextInstallmentNumber}
                onDone={load}
              />
            )}

            <EditLoanModal loan={loan} onDone={load} />

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

      {/* ─── FLOATING INTEREST (ดอกลอย) HIGHLIGHT CARD ───────── */}
      {isFloatingInterest && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 shadow-[var(--shadow-elevated)] animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shadow-sm">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  สัญญาเงินกู้แบบดอกลอย (Floating Interest)
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-primary/20 text-primary">เก็บแต่ดอกเบี้ย</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  เก็บดอกเบี้ยตามรอบรายวัน/รายงวด · คืนเงินต้นเมื่อต้องการปิดยอดหรือตัดต้น
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TopupLoanModal loan={loan} onDone={load} />
              {loan.status !== 'completed' && (
                <SettleLoanModal
                  loan={loan}
                  remaining={contractRemaining}
                  effectiveFee={effectiveFee}
                  onDone={load}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-background/90 backdrop-blur rounded-xl p-3.5 border border-border shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block uppercase tracking-wider">เงินต้นคงค้าง</span>
              <span className="text-base sm:text-lg font-black text-primary block mt-0.5">{formatTHB(contractRemaining)}</span>
              <span className="text-[10px] text-muted-foreground">ยอดเดิม {formatTHB(loan.principal)}</span>
            </div>
            <div className="bg-background/90 backdrop-blur rounded-xl p-3.5 border border-border shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block uppercase tracking-wider">ดอกเบี้ยต่อวัน</span>
              <span className="text-base sm:text-lg font-black text-warning block mt-0.5">
                {formatTHB(dailyFloatingRate)} <span className="text-xs font-normal text-muted-foreground">/วัน</span>
              </span>
              <span className="text-[10px] text-muted-foreground">อัตรา {loan.interestRate}%</span>
            </div>
            <div className="bg-background/90 backdrop-blur rounded-xl p-3.5 border border-primary/30 bg-primary/5 shadow-sm">
              <span className="text-[11px] font-bold text-primary block uppercase tracking-wider">ดอกเบี้ยที่ต้องชำระวันนี้</span>
              <span className="text-base sm:text-lg font-black text-primary block mt-0.5">
                {formatTHB(floatingDueTodayAmount)}
              </span>
              <span className="text-[10px] text-primary/80 font-semibold block">
                {floatingDaysUnpaid > 1 ? `ค้าง ${floatingDueTodayDays} วัน (${formatTHB(dailyFloatingRate)}/วัน)` : `งวดประจำวันนี้ 1 วัน`}
              </span>
            </div>
            <div className="bg-background/90 backdrop-blur rounded-xl p-3.5 border border-border shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block uppercase tracking-wider">ดอกเบี้ยที่เก็บแล้วรวม</span>
              <span className="text-base sm:text-lg font-black text-success block mt-0.5">{formatTHB(interestPaid)}</span>
              <span className="text-[10px] text-muted-foreground">{interestPayments.length} รายการ</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── MOBILE STICKY ACTION BAR ─────────────────────── */}
      <div className="fixed bottom-[calc(3.8rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 md:hidden px-4 pb-2">
        <div className="flex gap-3 rounded-2xl bg-background/90 backdrop-blur-xl border border-border shadow-2xl p-3">
          <Dialog open={openMobile} onOpenChange={setOpenMobile}>
            <DialogTrigger asChild>
              <Button className="flex-1 h-12 rounded-xl font-bold shadow-[var(--shadow-elevated)] gap-2">
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                รับชำระเงิน
              </Button>
            </DialogTrigger>
            <PaymentForm 
              loanId={loanId} 
              suggested={suggestedPaymentAmount} 
              nextNum={nextInstallmentNumber} 
              isInterestOnly={isFloatingInterest}
              installmentAmount={loan.installmentAmount ?? loan.installment_amount ?? 0}
              tpPenaltyAmount={lending.tpPenaltyAmount ?? 100}
              floatingDaysDue={floatingDueTodayDays}
              isOpen={openMobile}
              onDone={() => { setOpenMobile(false); load(); }} 
            />
          </Dialog>

          {isFloatingInterest && (
            <TopupLoanModal
              loan={loan}
              onDone={load}
              trigger={
                <Button
                  variant="outline"
                  className="h-12 px-3 rounded-xl shrink-0 border-primary/30 text-primary font-bold gap-1.5"
                  title="เบิกเงินต้นเพิ่ม"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span className="text-xs">เบิกเพิ่ม</span>
                </Button>
              }
            />
          )}

          {loan.status !== 'completed' && (
            <SettleLoanModal
              loan={loan}
              remaining={contractRemaining}
              effectiveFee={effectiveFee}
              nextInstallmentNumber={nextInstallmentNumber}
              onDone={load}
              trigger={
                <Button
                  variant="outline"
                  className="h-12 px-3 rounded-xl shrink-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold gap-1.5"
                  title="ปิดยอดสัญญา"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="text-xs">ปิดยอด</span>
                </Button>
              }
            />
          )}

          <EditLoanModal
            loan={loan}
            onDone={load}
            trigger={
              <Button
                variant="outline"
                className="h-12 w-12 rounded-xl shrink-0 border-border/60"
                title="แก้ไขสัญญา"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />

          {loan.isPawn && (
            <Button
              variant="outline"
              className="h-12 w-12 rounded-xl shrink-0 border-border/60"
              onClick={() => document.getElementById('photo-upload')?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 pb-44 md:pb-10">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] lg:col-span-1">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">สรุปข้อมูลสัญญา</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">สถานะ</dt>
              <dd>
                <StatusBadge tone={loanStatusTone(getEffectiveStatus(loan))}>
                  {getLoanStatusLabel(loan)}
                </StatusBadge>
                {isFloatingInterest && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-primary/20 text-primary">
                    ดอกลอย
                  </span>
                )}
                {isPrincipalInterestAtEnd && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-warning/20 text-warning">
                    จบต้นจบดอก
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ประเภท / ระยะสัญญา</dt>
              <dd className="text-right text-xs font-bold">
                {loanCategory}
                {!loan.isIndefinite && totalInstallments > 0 && (
                  <span className="block text-muted-foreground font-medium">
                    {isPrincipalInterestAtEnd ? 'ระยะเวลา ' : ''}{totalInstallments} {isPrincipalInterestAtEnd ? '' : 'งวด '}(
                    {loan.paymentType === "daily"
                      ? "รายวัน"
                      : loan.paymentType === "weekly"
                        ? "รายสัปดาห์"
                        : "รายเดือน"}
                    )
                  </span>
                )}
              </dd>
            </div>
            {!loan.isIndefinite && !isPrincipalInterestAtEnd && totalInstallments > 0 && (
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">ความคืบหน้าการชำระ</dt>
                <dd className="font-bold">
                  <span className={paidInstallments >= totalInstallments ? "text-success" : "text-foreground"}>
                    {paidInstallments} / {totalInstallments} งวด
                  </span>
                  <span className="text-muted-foreground font-normal text-xs ml-1">
                    ({formatTHB(totalPaid)} / {formatTHB(hasTpAccounting ? totalOwed : loan.totalPayable)})
                  </span>
                  {rollPenalties.length > 0 && (
                    <span className="block text-[11px] text-warning font-bold mt-0.5">
                      ท+ป {rollPenalties.length} ครั้ง
                    </span>
                  )}
                </dd>
              </div>
            )}
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">เงินต้น</dt>
              <dd className="font-medium">{formatTHB(loan.principal)}</dd>
            </div>
            {(Number(loan.documentFee) > 0 || Number(loan.advanceFee) > 0 || Number(loan.parkingFee) > 0) && (
              <div className="space-y-1">
                {Number(loan.documentFee) > 0 && (
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground pl-4">└ หักค่าเอกสาร</dt>
                    <dd className="font-medium text-destructive">-{formatTHB(loan.documentFee)}</dd>
                  </div>
                )}
                {Number(loan.advanceFee) > 0 && (
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground pl-4">└ หักค่าล่วงหน้า</dt>
                    <dd className="font-medium text-destructive">-{formatTHB(loan.advanceFee)}</dd>
                  </div>
                )}
                {Number(loan.parkingFee) > 0 && (
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground pl-4">└ หักค่าฝากจอด</dt>
                    <dd className="font-medium text-destructive">-{formatTHB(loan.parkingFee)}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground pl-4 font-bold">└ ยอดที่จ่ายลูกค้าจริง</dt>
                  <dd className="font-bold text-success">
                    {formatTHB(Math.max(
                      Number(loan.principal) -
                        Number(loan.documentFee || 0) -
                        Number(loan.advanceFee || 0) -
                        Number(loan.parkingFee || 0),
                      0
                    ))}
                  </dd>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ดอกเบี้ย ({loan.interestRate}%)</dt>
              <dd className="font-medium text-warning">{formatTHB(loan.interestAmount)}</dd>
            </div>
            {(effectiveFee > 0 || rawDaysOverdue > 0 || lateFeeMode !== 'auto') && !skipContractLateFee && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <dt className="text-destructive font-medium flex items-center gap-1 flex-wrap">
                    ค่าปรับล่าช้า ({lateFeeUnit})
                    <LateFeeEditor
                      loanId={loanId}
                      loan={loan}
                      lending={lending}
                      rawDaysOverdue={rawDaysOverdue}
                      dueDate={contractDueDateStr}
                      contractRemaining={contractRemaining}
                      onSaved={load}
                    />
                  </dt>
                  <dd className="font-bold text-destructive">+{formatTHB(effectiveFee)}</dd>
                </div>
                {autoFee !== effectiveFee && (
                  <p className="text-[11px] text-muted-foreground pl-0">
                    ตามระบบ {formatTHB(autoFee)} → ใช้จริง {formatTHB(effectiveFee)}
                    {lateFeeMode === 'waive' && ' (ยกเว้นแล้ว)'}
                  </p>
                )}
                {(loan.lateFeeNote || loan.late_fee_note) && (
                  <p className="text-[11px] text-muted-foreground italic">
                    {loan.lateFeeNote || loan.late_fee_note}
                  </p>
                )}
              </div>
            )}
            {hasTpAccounting && tpCount > 0 && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-muted-foreground pl-4">└ รวม ท+ป ({tpCount} ครั้ง)</dt>
                <dd className="font-medium text-warning">{formatTHB(tpCount * calcTpSettlementAmount(installmentAmount, tpConfig))}</dd>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-border pt-2">
              <dt className="text-muted-foreground">ยอดรวมทั้งหมด</dt>
              <dd className="font-bold">{formatTHB(hasTpAccounting ? totalOwed : loan.totalPayable)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ชำระแล้ว (รวมทั้งหมด)</dt>
              <dd className="font-bold text-success">{formatTHB(totalPaid)}</dd>
            </div>
            {isInterestOnlyMode && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-muted-foreground pl-4">└ ดอกเบี้ยที่จ่ายแล้ว</dt>
                <dd className="font-bold text-warning">{formatTHB(interestPaid)}</dd>
              </div>
            )}
            {isInterestOnlyMode && (
              <div className="flex justify-between items-center text-xs border-b border-border/50 pb-2">
                <dt className="text-muted-foreground pl-4">└ เงินต้นที่คืนแล้ว</dt>
                <dd className="font-bold text-success">{formatTHB(principalPaid)}</dd>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-primary/20 bg-primary/5 -mx-6 px-6 py-3 mt-2">
              <dt className="text-primary font-bold">ยอดคงเหลือ</dt>
              <dd className="text-xl font-black text-primary">{formatTHB(remaining)}</dd>
            </div>
            <div className="flex justify-between items-center mt-2">
              <dt className="text-muted-foreground">{isPrincipalInterestAtEnd ? 'ยอดปิดวันครบกำหนด' : 'ยอดชำระต่องวด'}</dt>
              <dd className="font-bold">{formatTHB(loan.installmentAmount)} ({loan.paymentType === 'daily' ? 'รายวัน' : loan.paymentType === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน'})</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">กำหนดวันเก็บเงิน</dt>
              <dd className="text-xs font-bold text-foreground">
                {loan.paymentType === 'monthly' ? (
                  `ทุกวันที่ ${new Date(loan.startDate || loan.start_date).getDate() || 1} ของทุกเดือน`
                ) : loanCategory === 'ยอดติด' ? (
                  'ทยอยชำระคืน'
                ) : loan.paymentType === 'weekly' ? (
                  'ทุกสัปดาห์'
                ) : (
                  'รายวัน'
                )}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">วันนัดจ่าย (วันนัดชำระ)</dt>
              <dd className="text-xs font-bold text-primary flex items-center gap-1.5 flex-wrap justify-end">
                {loan.promiseDate || loan.promise_date ? (
                  <span>{formatDate(loan.promiseDate || loan.promise_date)}</span>
                ) : (
                  <span className="text-muted-foreground font-normal">ยังไม่ได้ระบุ</span>
                )}
                <PromiseDateEditor loanId={loanId} loan={loan} onSaved={load} />
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">รอบชำระถัดไป</dt>
              <dd className="text-xs font-bold text-primary">
                {getLoanNextDueDate(loan) ? formatDate(getLoanNextDueDate(loan)) : (
                  loan.paymentType === 'monthly' ? `วันที่ ${new Date(loan.startDate || loan.start_date).getDate() || 1} ของเดือนถัดไป` : 'ไม่มีกำหนด'
                )}
              </dd>
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
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-3">ข้อมูลทรัพย์สินจำนำ</h4>
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <p className="text-sm font-bold text-foreground mb-2">{loan.pawnItem}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    pawnStatus === 'redeemed' ? 'bg-success/20 text-success' : 
                    pawnStatus === 'forfeited' ? 'bg-destructive/20 text-destructive' : 
                    'bg-warning/20 text-warning'
                  }`}>
                    {PAWN_STATUS_LABELS[pawnStatus] || pawnStatus}
                  </span>
                  
                  <Select value={pawnStatus} onValueChange={updatePawnStatus}>
                    <SelectTrigger className="h-7 w-28 text-[11px] bg-background">
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
            {payments.map((p) => {
              const tpAmount = p.category === 'roll_penalty'
                ? calcTpSettlementAmount(installmentAmount, tpConfig)
                : Number(p.amount);
              const slipUrl = resolveFileUrl(p.slipUrl ?? p.slip_url);
              const slipFileName = p.slipFileName ?? p.slip_file_name ?? 'payment-slip';
              return (
              <div key={p.id} className="flex items-center justify-between border border-border/50 rounded-xl px-4 py-3 hover:bg-muted/30 transition-colors group">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    งวดที่ #{p.installmentNumber ?? "—"}
                    {p.category === 'roll_penalty' ? (
                      <>
                        {" · "}
                        <span className="text-success">{formatTHB(tpAmount)}</span>
                        <span className="ml-2 text-[11px] font-bold text-warning uppercase bg-warning/10 px-1 rounded">ท+ป</span>
                      </>
                    ) : (
                      <> · <span className="text-success">{formatTHB(p.amount)}</span></>
                    )}
                    {p.category === 'interest' && <span className="ml-2 text-[11px] font-bold text-primary uppercase bg-primary/10 px-1 rounded">ดอกเบี้ย</span>}
                    {p.category === 'principal' && <span className="ml-2 text-[11px] font-bold text-success uppercase bg-success/10 px-1 rounded">เงินต้น</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDate(p.paymentDate)} · {METHOD_LABELS[p.method] || p.method}
                    {p.notes && <span className="block mt-0.5 text-foreground/80">{p.notes}</span>}
                  </p>
                  {slipUrl && (
                    <a
                      href={slipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"
                      title={slipFileName}
                    >
                      <ImageIcon className="h-3 w-3" />
                      ดูสลิป
                    </a>
                  )}
                </div>
                <ConfirmDelete
                  onConfirm={() => removePayment(p.id)}
                  title="ยืนยันการลบประวัติการชำระเงิน"
                  description={`คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการชำระเงินนี้?\nการดำเนินการนี้ไม่สามารถกู้คืนได้`}
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </ConfirmDelete>
              </div>
            );
            })}
          </div>
        </div>
      </div>

      {loan.isPawn && (
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
            {attachments.map((att) => {
              const imageUrl = resolveFileUrl(att.filePath);
              return (
                <div key={att.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border shadow-sm">
                  <a 
                    href={imageUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="block w-full h-full"
                  >
                    <img 
                      src={imageUrl} 
                      alt={att.fileName} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  </a>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full shadow-lg"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function PaymentForm({
  loanId,
  suggested,
  nextNum,
  isInterestOnly,
  installmentAmount = 0,
  tpPenaltyAmount = 100,
  floatingDaysDue = 1,
  isOpen = true,
  onDone,
}: {
  loanId: string;
  suggested: number;
  nextNum: number;
  isInterestOnly: boolean;
  installmentAmount?: number;
  tpPenaltyAmount?: number;
  floatingDaysDue?: number;
  isOpen?: boolean;
  onDone: () => void;
}) {
  const dailyRate = installmentAmount > 0 ? installmentAmount : suggested;
  const initialDays = isInterestOnly ? (floatingDaysDue || 1) : 1;
  const initialAmount = isInterestOnly ? (initialDays * dailyRate) : suggested;

  const [interestDays, setInterestDays] = useState<number | "">(initialDays);
  const [form, setForm] = useState({
    amount: initialAmount,
    paymentDate: getThaiDateStr(),
    installmentNumber: nextNum, 
    method: "cash" as "cash" | "bank_transfer" | "mobile" | "other", 
    category: (isInterestOnly ? "interest" : "principal") as "interest" | "principal" | "roll_penalty",
    notes: isInterestOnly ? `ชำระดอกเบี้ย ${initialDays} วัน` : "",
  });
  const [rollDays, setRollDays] = useState<number | "">(1);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const prevOpenRef = useRef(false);

  // Re-initialize form whenever modal is opened
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const days = isInterestOnly ? (floatingDaysDue || 1) : 1;
      const amt = isInterestOnly ? (days * dailyRate) : suggested;
      setInterestDays(days);
      setForm({
        amount: amt,
        paymentDate: getThaiDateStr(),
        installmentNumber: nextNum,
        method: "cash",
        category: isInterestOnly ? "interest" : "principal",
        notes: isInterestOnly ? `ชำระดอกเบี้ย ${days} วัน` : "",
      });
      setRollDays(1);
      setSlipFile(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, suggested, nextNum, isInterestOnly, floatingDaysDue, dailyRate]);

  const calcTpForDays = (daysCount: number) => {
    const days = Math.max(1, daysCount);
    const totalDaysToPay = days + 1; // วันที่ทบ + วันนี้ 1 วัน
    const totalInst = totalDaysToPay * installmentAmount;
    const totalPen = days * (tpPenaltyAmount || 100);
    return {
      days,
      totalDaysToPay,
      totalInst,
      totalPen,
      totalTp: totalInst + totalPen,
    };
  };

  const currentTpCalc = calcTpForDays(rollDays === "" ? 1 : Number(rollDays));

  const handleInterestDaysChange = (val: number | "") => {
    setInterestDays(val);
    const days = val === "" ? 1 : Number(val);
    const totalAmt = days * dailyRate;
    setForm((prev) => ({
      ...prev,
      amount: totalAmt,
      notes: `ชำระดอกเบี้ย ${days} วัน (วันละ ${formatTHB(dailyRate)})`,
    }));
  };

  const handleCategoryChange = (v: "interest" | "principal" | "roll_penalty") => {
    if (v === "roll_penalty") {
      const days = rollDays === "" ? 1 : Number(rollDays);
      const calcResult = calcTpForDays(days);
      setForm((current) => ({
        ...current,
        category: v,
        installmentNumber: nextNum + days,
        amount: calcResult.totalTp > 0 ? calcResult.totalTp : current.amount,
        notes: `ชำระ ท+ป ${days} วัน (${calcResult.totalDaysToPay} งวด ฿${calcResult.totalInst} + ปรับ ฿${calcResult.totalPen})`,
      }));
    } else if (v === "interest" && isInterestOnly) {
      const days = interestDays === "" ? 1 : Number(interestDays);
      setForm((current) => ({
        ...current,
        category: v,
        installmentNumber: nextNum,
        amount: days * dailyRate,
        notes: `ชำระดอกเบี้ย ${days} วัน`,
      }));
    } else {
      setForm((current) => ({
        ...current,
        category: v,
        installmentNumber: nextNum,
        amount: suggested,
        notes: "",
      }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.amount === null || form.amount === undefined || (form.amount as any) === "" || Number(form.amount) <= 0 || isNaN(Number(form.amount))) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง (มากกว่า 0)");
      return;
    }
    setBusy(true);
    try {
      if (form.category === "roll_penalty") {
        const days = Math.max(1, rollDays === "" ? 1 : Number(rollDays));
        const totalInstallmentsCount = days + 1; // วันที่ทบ + วันนี้ 1 วัน
        const baseInstAmount = Number(installmentAmount > 0 ? installmentAmount : (Number(form.amount) / totalInstallmentsCount));
        const penaltyPerDay = Number(tpPenaltyAmount || 100);
        
        // 1. Create rolled days payments (งวดที่ทบ)
        for (let k = 0; k < days; k++) {
          const instNum = nextNum + k;
          const rolledPaymentAmount = Number(baseInstAmount) + Number(penaltyPerDay);
          const isFirst = k === 0;
          await createPayment(
            {
              loanId,
              amount: rolledPaymentAmount,
              installmentNumber: instNum,
              paymentDate: form.paymentDate,
              method: form.method,
              category: "roll_penalty",
              notes: `ชำระ ท+ป วันที่ ${k + 1}/${days} (ทบ ฿${baseInstAmount.toLocaleString()} + ปรับ ฿${penaltyPerDay.toLocaleString()})`,
            },
            isFirst ? slipFile : null
          );
        }

        // 2. Create current day payment (งวดปัจจุบัน วันที่ 4)
        const currentInstNum = nextNum + days;
        await createPayment(
          {
            loanId,
            amount: baseInstAmount,
            installmentNumber: currentInstNum,
            paymentDate: form.paymentDate,
            method: form.method,
            category: isInterestOnly ? "interest" : "principal",
            notes: `ชำระค่างวดปกติ (วันที่ ${totalInstallmentsCount}/${totalInstallmentsCount})`,
          },
          days === 0 ? slipFile : null
        );

        toast.success(`⚡️ บันทึกชำระ ท+ป ${days} วัน + วันนี้ 1 วัน รวม ${totalInstallmentsCount} งวด (งวดที่ ${nextNum} - ${currentInstNum}) เรียบร้อยแล้ว`);
      } else {
        await createPayment({ ...form, loanId }, slipFile);
        toast.success("บันทึกการชำระเงินเรียบร้อยแล้ว");
      }

      setForm({
        amount: suggested,
        paymentDate: getThaiDateStr(),
        installmentNumber: nextNum + 1,
        method: "cash",
        category: isInterestOnly ? "interest" : "principal",
        notes: "",
      });
      setRollDays(1);
      setSlipFile(null);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent
      className="w-[95vw] sm:w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] p-4 sm:p-6 border-border shadow-2xl"
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('input, textarea, select, [contenteditable="true"], button')) {
          (document.activeElement as HTMLElement)?.blur();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg sm:text-xl font-bold">บันทึกการชำระเงิน</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isInterestOnly && form.category === "principal" ? "จำนวนเงินต้นที่ตัดคืน (บาท)" : "จำนวนเงิน (บาท)"}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              enterKeyHint="done"
              min={0}
              step={0.01}
              value={form.amount}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? "" : Number(e.target.value) as any })}
              className="bg-muted/20 font-bold text-primary text-base sm:text-sm h-11 sm:h-10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ชำระงวดที่</Label>
            <Input type="number" min={1} value={form.installmentNumber} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, installmentNumber: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
            {form.category === "roll_penalty" && (
              <p className="text-[10px] text-warning font-semibold">
                ✨ ครอบคลุมงวดที่ {nextNum} ถึง {form.installmentNumber}
              </p>
            )}
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
                <SelectItem value="other">อื่นๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={form.category === "roll_penalty" || (isInterestOnly && form.category === "interest") ? "space-y-2" : "space-y-2 col-span-1 sm:col-span-2"}>
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ประเภทการชำระ</Label>
            <Select value={form.category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="interest">ชำระดอกเบี้ย</SelectItem>
                <SelectItem value="principal">{isInterestOnly ? "ตัดเงินต้น / คืนต้น" : "ชำระเงินต้น / ปิดยอด"}</SelectItem>
                <SelectItem value="roll_penalty">ชำระ ท+ป (ทบ + ปรับ)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Floating Interest Quick Days selector */}
          {isInterestOnly && form.category === "interest" && (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-primary flex items-center justify-between">
                <span>จำนวนวันที่จ่ายดอก (วัน)</span>
              </Label>
              <Input
                type="number"
                min={1}
                value={interestDays}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleInterestDaysChange(e.target.value === "" ? "" : Number(e.target.value))}
                className="bg-primary/10 border-primary/40 font-bold text-primary"
              />
            </div>
          )}

          {form.category === "roll_penalty" && (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-warning flex items-center justify-between">
                <span>จำนวนวันที่ทบ (วัน)</span>
              </Label>
              <Input
                type="number"
                min={1}
                value={rollDays}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const val = e.target.value === "" ? "" : Number(e.target.value);
                  setRollDays(val);
                  const days = val === "" ? 1 : Number(val);
                  const calcResult = calcTpForDays(days);
                  setForm((prev) => ({
                    ...prev,
                    installmentNumber: nextNum + days,
                    amount: calcResult.totalTp,
                    notes: `ชำระ ท+ป ${days} วัน (${calcResult.totalDaysToPay} งวด ฿${calcResult.totalInst} + ปรับ ฿${calcResult.totalPen})`,
                  }));
                }}
                className="bg-warning/10 border-warning/40 font-bold text-warning"
              />
            </div>
          )}
        </div>

        {/* Quick Days Selector Pills for Floating Interest */}
        {isInterestOnly && form.category === "interest" && (
          <div className="space-y-2 pt-1 border-t border-border/50">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] font-bold text-muted-foreground mr-1">เลือกด่วน:</span>
              {[1, 2, 3, 5, 7, 10, 15, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleInterestDaysChange(d)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-lg border transition-all",
                    interestDays === d
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/30 text-muted-foreground border-border/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                  )}
                >
                  {d} วัน
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs flex justify-between items-center text-primary font-bold">
              <span>💡 คำนวณดอกเบี้ย {interestDays || 1} วัน (วันละ {formatTHB(dailyRate)}):</span>
              <span className="text-sm font-black">{formatTHB(form.amount)}</span>
            </div>
          </div>
        )}
        {form.category === "roll_penalty" && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-1.5 text-xs animate-in fade-in">
            <div className="flex justify-between items-center font-bold text-warning">
              <span>💡 คำนวณยอด ท+ป {currentTpCalc.days} วัน:</span>
              <span className="text-sm font-black">{formatTHB(currentTpCalc.totalTp)}</span>
            </div>
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              <p>• ค่างวด {currentTpCalc.totalDaysToPay} วัน (ทบ {currentTpCalc.days} วัน + วันนี้ 1 วัน): <span className="font-semibold text-foreground">{formatTHB(currentTpCalc.totalInst)}</span></p>
              <p>• ค่าปรับ ท+ป ({currentTpCalc.days} วัน x {formatTHB(tpPenaltyAmount || 100)}): <span className="font-semibold text-foreground">{formatTHB(currentTpCalc.totalPen)}</span></p>
              <p className="text-[10px] text-warning/80 pt-0.5">* วันที่จ่ายจริง (วันนี้) ไม่มีการคิดค่าปรับ</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">หมายเหตุ</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-muted/20" placeholder="ระบุรายละเอียดเพิ่มเติม..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`payment-slip-${loanId}`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            แนบสลิปการโอน (ไม่บังคับ)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              key={slipFile ? 'payment-slip-selected' : 'payment-slip-empty'}
              id={`payment-slip-${loanId}`}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
              className="bg-muted/20"
            />
            {slipFile && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => setSlipFile(null)}
                title="ล้างไฟล์"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {slipFile && (
            <p className="text-[11px] text-muted-foreground truncate">
              {slipFile.name}
            </p>
          )}
        </div>
        <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pb-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onDone()}
            disabled={busy}
            className="h-11 sm:h-10 rounded-xl font-semibold w-full sm:w-auto border-border/60"
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="h-12 sm:h-10 rounded-xl font-bold bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] w-full sm:w-auto min-w-[160px] gap-1.5 text-sm"
          >
            {busy ? "กำลังบันทึก..." : "ยืนยันการชำระเงิน"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function RefinanceDialog({ loan, remaining, onDone }: { loan: any; remaining: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { lending } = useSettings();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const initFormData = () => {
    const initPrin = Number(loan?.principal || remaining || 10000);
    return {
      principal: initPrin,
      interestRate: Number(loan?.interestRate ?? loan?.interest_rate ?? 20),
      installmentsCount: Number(loan?.installmentsCount ?? loan?.installments_count ?? 30),
      paymentType: (loan?.paymentType || loan?.payment_type || "daily") as "daily" | "weekly" | "monthly",
      startDate: getThaiDateStr(),
      promiseDate: "",
      notes: `รียอดใหม่จากสัญญา ${loan?.loanNumber || ""}`,
      isInterestOnly: Boolean(loan?.isInterestOnly || loan?.is_interest_only),
      isPrincipalInterestAtEnd: Boolean(loan?.isPrincipalInterestAtEnd || loan?.is_principal_interest_at_end),
      isPawn: Boolean(loan?.isPawn || loan?.is_pawn),
      pawnItem: loan?.pawnItem || loan?.pawn_item || "",
    };
  };

  const [form, setForm] = useState(initFormData);
  const [applyDocumentFee, setApplyDocumentFee] = useState(false);
  const [documentFee, setDocumentFee] = useState<number | string>(lending.documentFeeAmount || 300);
  const [applyAdvanceFee, setApplyAdvanceFee] = useState(false);
  const [advanceFee, setAdvanceFee] = useState<number | string>(lending.advanceFeeAmount || 500);
  const [applyParkingFee, setApplyParkingFee] = useState(false);
  const [parkingFee, setParkingFee] = useState<number | string>(lending.parkingFeeAmount || 500);
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setForm(initFormData());
      setApplyDocumentFee(false);
      setDocumentFee(lending.documentFeeAmount || 300);
      setApplyAdvanceFee(false);
      setAdvanceFee(lending.advanceFeeAmount || 500);
      setApplyParkingFee(false);
      setParkingFee(lending.parkingFeeAmount || 500);
    }
  };

  const isIndefiniteLoan = Boolean(form.isPawn);

  const calc = calcLoan(
    Number(form.principal || 0),
    Number(form.interestRate || 0),
    Number(form.installmentsCount || 1),
    form.paymentType,
    form.startDate,
    form.isInterestOnly,
    isIndefiniteLoan,
    form.isPrincipalInterestAtEnd
  );

  const appliedDocumentFee = applyDocumentFee ? Number(documentFee) || 0 : 0;
  const appliedAdvanceFee = applyAdvanceFee ? Number(advanceFee) || 0 : 0;
  const appliedParkingFee = form.isPawn && applyParkingFee ? Number(parkingFee) || 0 : 0;
  const totalDeductions = remaining + appliedDocumentFee + appliedAdvanceFee + appliedParkingFee;
  const netDisbursement = Math.max(Number(form.principal || 0) - totalDeductions, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.principal || Number(form.principal) <= 0) {
      toast.error("กรุณาระบุยอดเงินต้นสัญญาใหม่");
      return;
    }
    setBusy(true);
    try {
      const res = await refinanceLoan(loan.id, {
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        interestAmount: calc.interest,
        totalPayable: calc.total,
        installmentsCount: Number(form.installmentsCount),
        installmentAmount: calc.installment,
        paymentType: form.paymentType,
        startDate: form.startDate,
        dueDate: isIndefiniteLoan ? null : (calc.dueStr || (calc.due ? calc.due.toISOString().split("T")[0] : null)),
        promiseDate: form.promiseDate || (form.isPrincipalInterestAtEnd ? (calc.dueStr || (calc.due ? calc.due.toISOString().split("T")[0] : null)) : null),
        notes: form.notes,
        isInterestOnly: form.isInterestOnly,
        isIndefinite: isIndefiniteLoan,
        isPrincipalInterestAtEnd: form.isPrincipalInterestAtEnd,
        isPawn: form.isPawn,
        pawnItem: form.isPawn ? form.pawnItem : null,
        documentFee: appliedDocumentFee,
        advanceFee: appliedAdvanceFee,
        parkingFee: appliedParkingFee,
        deductedOldRemaining: remaining,
        netDisbursement,
      });

      toast.success("รียอดสัญญาใหม่เรียบร้อยแล้ว (เริ่มส่งงวดที่ 1 ใหม่)");
      setOpen(false);

      const newLoanId = res?.id || res?.[0]?.id;
      if (newLoanId) {
        navigate({ to: "/loans/$loanId", params: { loanId: newLoanId } });
      } else {
        onDone();
      }
    } catch (error: any) {
      toast.error(error.message || "เกิดข้อผิดพลาดในการรียอดสัญญาใหม่");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-initial border-primary/20 text-primary hover:bg-primary/5 h-11 px-6 rounded-xl font-bold shadow-sm">
          <RefreshCw className="mr-2 h-5 w-5" />รียอดใหม่
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl w-[95vw] sm:w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">รียอดสัญญาใหม่ (Refinance)</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            สร้างสัญญาใหม่ เริ่มนับงวดที่ 1 ใหม่ และหักล้างยอดคงค้างสัญญาเดิม ({loan.loanNumber})
          </DialogDescription>
        </DialogHeader>

        {/* Existing Debt Card */}
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-warning">ยอดคงค้างสัญญาเดิมที่จะหักล้าง ({loan.loanNumber})</p>
            <p className="text-xs text-muted-foreground mt-0.5">สัญญาเดิมจะถูกเปลี่ยนสถานะเป็น "รียอดแล้ว" (เคลียร์ยอด)</p>
          </div>
          <span className="text-base font-black text-warning shrink-0">{formatTHB(remaining)}</span>
        </div>

        <form onSubmit={submit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-primary">
                ยอดเงินต้นสัญญาใหม่ (บาท) *
              </Label>
              <Input
                type="number"
                min={1}
                value={form.principal}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, principal: e.target.value === "" ? "" as any : Number(e.target.value) })}
                className="bg-primary/10 border-primary/30 font-black text-primary text-base"
                placeholder="เช่น 10000"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">อัตราดอกเบี้ย (%)</Label>
              <Input
                type="number"
                step={0.1}
                min={0}
                value={form.interestRate}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value === "" ? "" as any : Number(e.target.value) })}
                className="bg-muted/20"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">จำนวนงวด (เริ่มส่งใหม่)</Label>
              <Input
                type="number"
                min={1}
                value={form.installmentsCount}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, installmentsCount: e.target.value === "" ? "" as any : Number(e.target.value) })}
                className="bg-muted/20"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ความถี่ในการชำระ</Label>
              <Select value={form.paymentType} onValueChange={(v: any) => setForm({ ...form, paymentType: v })}>
                <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">รายวัน</SelectItem>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={form.isPrincipalInterestAtEnd ? "space-y-2 col-span-1" : "space-y-2 col-span-1 sm:col-span-2"}>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">วันที่เริ่มสัญญาใหม่</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="bg-muted/20" />
            </div>

            {form.isPrincipalInterestAtEnd && (
              <div className="space-y-2 col-span-1">
                <Label className="text-xs font-bold uppercase tracking-wider text-primary">วันนัดจ่าย (วันครบกำหนด)</Label>
                <Input
                  type="date"
                  value={form.promiseDate || calc.dueStr || ""}
                  onChange={(e) => setForm({ ...form, promiseDate: e.target.value })}
                  className="bg-primary/10 border-primary/30 font-bold"
                />
              </div>
            )}

            {/* Loan Mode Options */}
            <div className="col-span-1 sm:col-span-2 space-y-2 pt-1 border-t border-border/50">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="refinanceIsInterestOnly"
                  checked={form.isInterestOnly}
                  disabled={form.isPrincipalInterestAtEnd}
                  onChange={(e) => setForm({ ...form, isInterestOnly: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="refinanceIsInterestOnly" className="text-sm font-bold text-foreground cursor-pointer">
                  เงินกู้แบบดอกลอย (เก็บแต่ดอกเบี้ย)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="refinanceIsPrincipalInterestAtEnd"
                  checked={form.isPrincipalInterestAtEnd}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      isPrincipalInterestAtEnd: e.target.checked,
                      isInterestOnly: e.target.checked ? false : form.isInterestOnly,
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="refinanceIsPrincipalInterestAtEnd" className="text-sm font-bold text-foreground cursor-pointer">
                  จบต้นจบดอก (ชำระครั้งเดียววันครบกำหนด)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="refinanceIsPawn"
                  checked={form.isPawn}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm({
                      ...form,
                      isPawn: checked,
                      paymentType: checked ? "monthly" : form.paymentType,
                      isInterestOnly: checked ? true : form.isInterestOnly,
                      isPrincipalInterestAtEnd: checked ? false : form.isPrincipalInterestAtEnd,
                    });
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="refinanceIsPawn" className="text-sm font-bold text-foreground cursor-pointer">
                  จำนำสิ่งของ
                </Label>
              </div>
            </div>

            {form.isPawn && (
              <div className="space-y-2 p-3 bg-primary/5 rounded-xl border border-primary/20 col-span-1 sm:col-span-2 animate-in fade-in">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-primary">รายละเอียดสิ่งของที่จำนำ</Label>
                <Input
                  value={form.pawnItem}
                  onChange={(e) => setForm({ ...form, pawnItem: e.target.value })}
                  placeholder="เช่น รถเก๋ง วีออส สีดำ, พระเลี่ยมทอง..."
                  className="bg-background border-primary/30"
                />
              </div>
            )}

            {/* Fee Deduction Checkboxes */}
            <div className={cn(
              "col-span-1 sm:col-span-2 grid gap-4 border-t border-border/50 pt-3",
              form.isPawn ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
            )}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="refinanceApplyDocumentFee"
                    checked={applyDocumentFee}
                    onChange={(e) => setApplyDocumentFee(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="refinanceApplyDocumentFee" className="text-sm font-bold text-foreground cursor-pointer">
                    หักค่าเอกสาร
                  </Label>
                </div>
                {applyDocumentFee && (
                  <Input
                    type="number"
                    min={0}
                    value={documentFee}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDocumentFee(e.target.value === "" ? "" : Number(e.target.value))}
                    className="bg-muted/20"
                  />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="refinanceApplyAdvanceFee"
                    checked={applyAdvanceFee}
                    onChange={(e) => setApplyAdvanceFee(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="refinanceApplyAdvanceFee" className="text-sm font-bold text-foreground cursor-pointer">
                    หักค่าล่วงหน้า
                  </Label>
                </div>
                {applyAdvanceFee && (
                  <Input
                    type="number"
                    min={0}
                    value={advanceFee}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setAdvanceFee(e.target.value === "" ? "" : Number(e.target.value))}
                    className="bg-muted/20"
                  />
                )}
              </div>

              {form.isPawn && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="refinanceApplyParkingFee"
                      checked={applyParkingFee}
                      onChange={(e) => setApplyParkingFee(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="refinanceApplyParkingFee" className="text-sm font-bold text-foreground cursor-pointer">
                      หักค่าฝากจอด
                    </Label>
                  </div>
                  {applyParkingFee && (
                    <Input
                      type="number"
                      min={0}
                      value={parkingFee}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setParkingFee(e.target.value === "" ? "" : Number(e.target.value))}
                      className="bg-muted/20"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">หมายเหตุ</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-muted/20"
                placeholder="ระบุรายละเอียดเพิ่มเติม..."
              />
            </div>
          </div>

          {/* Preliminary Summary */}
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 shadow-sm space-y-3">
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-2">
                📋 สรุปสัญญาใหม่ (เริ่มส่งงวดที่ 1 ใหม่)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ยอดเงินต้นใหม่</p>
                  <p className="text-sm font-bold text-primary">{formatTHB(Number(form.principal || 0))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ดอกเบี้ย</p>
                  <p className="text-sm font-bold text-primary">{formatTHB(calc.interest)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ยอดรวมทั้งหมด</p>
                  <p className="text-sm font-bold text-primary">{formatTHB(calc.total)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                    {form.isPrincipalInterestAtEnd ? "ยอดปิด" : "ต่องวด"}
                  </p>
                  <p className="text-sm font-bold text-primary">{formatTHB(calc.installment)}</p>
                </div>
              </div>
            </div>

            {/* Financial Settlement Breakdown */}
            <div className="border-t border-primary/20 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>ยอดจัดสัญญาใหม่:</span>
                <span className="font-semibold text-foreground">{formatTHB(Number(form.principal || 0))}</span>
              </div>
              <div className="flex justify-between items-center text-destructive">
                <span>หัก: ยอดคงค้างสัญญาเดิม ({loan.loanNumber}):</span>
                <span className="font-semibold">-{formatTHB(remaining)}</span>
              </div>
              {appliedDocumentFee > 0 && (
                <div className="flex justify-between items-center text-destructive">
                  <span>หัก: ค่าเอกสาร:</span>
                  <span className="font-semibold">-{formatTHB(appliedDocumentFee)}</span>
                </div>
              )}
              {appliedAdvanceFee > 0 && (
                <div className="flex justify-between items-center text-destructive">
                  <span>หัก: ค่าล่วงหน้า:</span>
                  <span className="font-semibold">-{formatTHB(appliedAdvanceFee)}</span>
                </div>
              )}
              {appliedParkingFee > 0 && (
                <div className="flex justify-between items-center text-destructive">
                  <span>หัก: ค่าฝากจอด:</span>
                  <span className="font-semibold">-{formatTHB(appliedParkingFee)}</span>
                </div>
              )}

              <div className="border-t border-primary/20 pt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">
                  💵 ยอดเงินจ่ายลูกค้าจริง (หักยอดค้างและค่าธรรมเนียมแล้ว):
                </span>
                <span className="text-base font-black text-success">{formatTHB(netDisbursement)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="submit"
              disabled={busy || Number(form.principal || 0) <= 0}
              className="w-full py-6 text-base font-bold shadow-[var(--shadow-elevated)]"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังดำเนินการรียอด...
                </span>
              ) : (
                "ยืนยันการรียอดสัญญาใหม่ (เริ่มส่งใหม่)"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
