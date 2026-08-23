import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, CheckCheck, Upload, X, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatTHB, getThaiDateStr, daysBetween } from "@/utils/format";
import { createPayment, getPaymentsByLoan, updateLoan, logActivity } from "@/lib/services";
import { useSettings } from "@/contexts/SettingsContext";
import { resolveLateFee } from "@/utils/lateFee";
import { shouldSkipContractLateFee } from "@/utils/tpPayment";

interface SettleLoanModalProps {
  loan: any;
  onDone?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Optional precalculated values
  remaining?: number;
  effectiveFee?: number;
}

export function SettleLoanModal({
  loan,
  onDone,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  remaining: precalcRemaining,
  effectiveFee: precalcEffectiveFee,
}: SettleLoanModalProps) {
  const { lending } = useSettings();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;

  const [loading, setLoading] = useState(false);
  const [contractRemaining, setContractRemaining] = useState<number>(precalcRemaining ?? 0);
  const [lateFee, setLateFee] = useState<number>(precalcEffectiveFee ?? 0);
  const [discount, setDiscount] = useState<number | "">("");
  const [customPayoff, setCustomPayoff] = useState<number | "">("");
  const [paymentDate, setPaymentDate] = useState(getThaiDateStr());
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "other">("cash");
  const [notes, setNotes] = useState("ปิดยอดสัญญาครบถ้วน");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextInstallmentNumber, setNextInstallmentNumber] = useState<number>(1);

  // Load contract details and payments when modal opens
  useEffect(() => {
    if (!isOpen || !loan?.id) return;

    if (precalcRemaining !== undefined) {
      setContractRemaining(precalcRemaining);
      setLateFee(precalcEffectiveFee ?? 0);
      setDiscount("");
      setCustomPayoff("");
      setPaymentDate(getThaiDateStr());
      setMethod("cash");
      setNotes("ปิดยอดสัญญาครบถ้วน");
      setSlipFile(null);
      return;
    }

    setLoading(true);
    getPaymentsByLoan(loan.id)
      .then((paymentsData: any[]) => {
        const payments = paymentsData ?? [];
        const isInterestOnly = Boolean(loan.isInterestOnly || loan.isPawn || loan.is_interest_only || loan.is_pawn);
        const principal = Number(loan.principal || 0);
        const totalPayable = Number(loan.totalPayable ?? loan.total_payable ?? 0);

        const principalPaid = payments
          .filter((p: any) => p.category === "principal")
          .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
        const totalPaid = payments.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);

        const remainingBase = isInterestOnly
          ? Math.max(principal - principalPaid, 0)
          : Math.max(totalPayable - totalPaid, 0);

        const skipLate = shouldSkipContractLateFee(loan);
        const dueDateStr = loan.dueDate || loan.due_date ? String(loan.dueDate || loan.due_date).substring(0, 10) : null;
        const rawDays = (!skipLate && dueDateStr) ? Math.max(0, daysBetween(dueDateStr, getThaiDateStr())) : 0;
        const { effectiveFee } = resolveLateFee(lending, loan, rawDays, dueDateStr);
        const finalLateFee = skipLate ? 0 : effectiveFee;

        const recordedInstallmentNumbers = payments
          .map((payment: any) => Number(payment.installmentNumber ?? payment.installment_number))
          .filter((num: number) => Number.isFinite(num) && num > 0);
        const nextNum = recordedInstallmentNumbers.length > 0
          ? Math.max(...recordedInstallmentNumbers) + 1
          : payments.length + 1;

        setContractRemaining(remainingBase);
        setLateFee(finalLateFee);
        setDiscount("");
        setCustomPayoff("");
        setPaymentDate(getThaiDateStr());
        setMethod("cash");
        setNotes("ปิดยอดสัญญาครบถ้วน");
        setSlipFile(null);
        setNextInstallmentNumber(nextNum);
      })
      .catch((err) => {
        console.error("Failed to load payments for settle modal:", err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, loan, precalcRemaining, precalcEffectiveFee, lending]);

  const numLateFee = Number(lateFee) || 0;
  const numDiscount = Number(discount) || 0;
  const computedPayoff = Math.max(0, contractRemaining + numLateFee - numDiscount);
  const finalPayoffAmount = customPayoff !== "" ? Number(customPayoff) : computedPayoff;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (finalPayoffAmount === null || finalPayoffAmount === undefined || isNaN(finalPayoffAmount) || finalPayoffAmount < 0) {
      toast.error("กรุณาระบุยอดเงินปิดยอดที่ถูกต้อง");
      return;
    }

    setBusy(true);
    try {
      // 1. Record payment for payoff amount
      await createPayment(
        {
          loanId: loan.id,
          amount: finalPayoffAmount,
          installmentNumber: nextInstallmentNumber,
          paymentDate,
          method,
          category: "principal",
          notes: notes.trim() || `ชำระปิดยอดสัญญา (สัญญา ฿${contractRemaining.toLocaleString()}${numLateFee > 0 ? ` + ปรับ ฿${numLateFee.toLocaleString()}` : ""}${numDiscount > 0 ? ` - ส่วนลด ฿${numDiscount.toLocaleString()}` : ""})`,
        },
        slipFile
      );

      // 2. Explicitly ensure loan status is marked as completed
      await updateLoan(loan.id, {
        status: "completed",
      });

      // 3. Log Activity
      try {
        await logActivity({
          action: "settle_loan",
          entity_type: "loan",
          entity_id: loan.id,
          details: {
            loanNumber: loan.loanNumber || loan.loan_number,
            customerName: loan.customerName || loan.customer_name,
            payoffAmount: finalPayoffAmount,
            contractRemaining,
            lateFee: numLateFee,
            discount: numDiscount,
          },
        });
      } catch (logErr) {
        console.error("Failed to log activity for settle loan:", logErr);
      }

      toast.success(`🎉 ปิดยอดสัญญา ${loan.loanNumber || loan.loan_number} เรียบร้อยแล้ว! (รับชำระ ${formatTHB(finalPayoffAmount)})`);
      setIsOpen(false);
      onDone?.();
    } catch (error: any) {
      toast.error(error.message || "เกิดข้อผิดพลาดในการปิดยอดสัญญา");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="h-8 px-2.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-xs font-bold gap-1 active:scale-95 transition-all shadow-sm"
            title="ปิดยอดสัญญา (ชำระยอดคงเหลือทั้งหมด)"
          >
            <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
            <span>ปิดยอด</span>
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 sm:p-6 border-border shadow-[var(--shadow-elevated)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <span>ปิดยอดสัญญา (Payoff)</span>
            </div>
            {loan?.loanNumber && (
              <span className="text-xs font-mono font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                {loan.loanNumber}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground text-left">
            รับชำระยอดคงเหลือทั้งหมดพร้อมค่าปรับล่าช้า (ถ้ามี) เพื่อปิดยอดสัญญาให้เสร็จสิ้น
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">กำลังคำนวณยอดปิดสัญญา...</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 pt-1">
            {/* Payoff Breakdown Card */}
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">ลูกค้า:</span>
                <span className="font-bold text-foreground">{loan?.customerName || loan?.customer_name || "—"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">ยอดคงเหลือตามสัญญา:</span>
                <span className="font-bold text-foreground">{formatTHB(contractRemaining)}</span>
              </div>
              {numLateFee > 0 && (
                <div className="flex justify-between items-center text-xs text-destructive font-bold">
                  <span className="flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>ค่าปรับล่าช้า:</span>
                  </span>
                  <span>+{formatTHB(numLateFee)}</span>
                </div>
              )}
              {numDiscount > 0 && (
                <div className="flex justify-between items-center text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>ส่วนลดปิดยอด:</span>
                  </span>
                  <span>-{formatTHB(numDiscount)}</span>
                </div>
              )}

              <div className="border-t border-emerald-500/30 pt-2 flex justify-between items-center">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                    ยอดเงินสุทธิที่ต้องรับชำระ
                  </span>
                  <span className="text-[10px] text-muted-foreground">สัญญาจะเปลี่ยนเป็นสถานะ "ปิดยอดแล้ว" ทันที</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 block">
                    {formatTHB(finalPayoffAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Inputs grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center justify-between">
                  <span>ค่าปรับล่าช้า (บาท)</span>
                  {numLateFee > 0 && (
                    <button
                      type="button"
                      onClick={() => setLateFee(0)}
                      className="text-[10px] text-muted-foreground hover:text-destructive underline"
                    >
                      ยกเว้นค่าปรับ
                    </button>
                  )}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={lateFee}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setLateFee(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="bg-muted/20 text-destructive font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ส่วนลดปิดยอด (บาท)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={discount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDiscount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className="bg-muted/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  วันที่ชำระ
                </Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="bg-muted/20 font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ช่องทางการชำระ
                </Label>
                <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                  <SelectTrigger className="bg-muted/20 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">เงินสด</SelectItem>
                    <SelectItem value="bank_transfer">โอนผ่านธนาคาร</SelectItem>
                    <SelectItem value="other">อื่นๆ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 col-span-1 sm:col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  แนบหลักฐานการโอน (สลิป)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="settle-slip-upload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("settle-slip-upload")?.click()}
                    className="w-full justify-start text-muted-foreground font-normal rounded-xl border-dashed h-10 gap-2"
                  >
                    <Upload className="h-4 w-4 shrink-0" />
                    <span className="truncate text-xs">
                      {slipFile ? slipFile.name : "คลิกเพื่อเลือกไฟล์รูปสลิป (ถ้ามี)"}
                    </span>
                  </Button>
                  {slipFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSlipFile(null)}
                      className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 col-span-1 sm:col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  หมายเหตุ
                </Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ปิดยอดเงินสด / ลูกค้าจ่ายครบแล้ว"
                  className="bg-muted/20"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={busy} className="rounded-xl">
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={busy || finalPayoffAmount <= 0}
                className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-[var(--shadow-elevated)] min-w-[160px] gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="h-4 w-4" strokeWidth={2.5} />
                    <span>ยืนยันปิดยอด {formatTHB(finalPayoffAmount)}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
