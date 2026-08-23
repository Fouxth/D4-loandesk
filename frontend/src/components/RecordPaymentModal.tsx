import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatTHB, getThaiDateStr } from "@/utils/format";
import { cn } from "@/utils/utils";
import { createPayment, getPaymentsByLoan, logActivity } from "@/lib/services";
import { useSettings } from "@/contexts/SettingsContext";

interface RecordPaymentModalProps {
  loan: any;
  onDone?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Optional precalculated values when used in loan details page
  suggested?: number;
  nextNum?: number;
  isInterestOnly?: boolean;
  installmentAmount?: number;
}

export function RecordPaymentModal({
  loan,
  onDone,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  suggested: precalcSuggested,
  nextNum: precalcNextNum,
  isInterestOnly: precalcIsInterestOnly,
  installmentAmount: precalcInstallmentAmount,
}: RecordPaymentModalProps) {
  const { lending } = useSettings();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;

  const loanId = loan?.id;
  const loanNumber = loan?.loanNumber || loan?.loan_number || "";
  const customerName = loan?.customerName || loan?.customer_name || "";

  const isInterestOnlyMode = precalcIsInterestOnly !== undefined
    ? precalcIsInterestOnly
    : Boolean(loan?.isInterestOnly || loan?.isPawn || loan?.is_interest_only || loan?.is_pawn);

  const instAmount = precalcInstallmentAmount !== undefined
    ? precalcInstallmentAmount
    : Number(loan?.installmentAmount ?? loan?.installment_amount ?? 0);

  const [loadingData, setLoadingData] = useState(false);
  const [calcSuggested, setCalcSuggested] = useState<number>(precalcSuggested ?? instAmount);

  const [baseNextNum, setBaseNextNum] = useState<number>(precalcNextNum ?? 1);
  const [interestDays, setInterestDays] = useState<number | "">(1);

  const [form, setForm] = useState({
    amount: precalcSuggested ?? instAmount,
    paymentDate: getThaiDateStr(),
    installmentNumber: precalcNextNum ?? 1,
    method: "cash" as "cash" | "bank_transfer" | "mobile" | "other",
    category: (isInterestOnlyMode ? "interest" : "principal") as "interest" | "principal" | "roll_penalty",
    notes: isInterestOnlyMode ? "ชำระดอกเบี้ย 1 วัน" : "",
  });

  const [rollDays, setRollDays] = useState<number | "">(1);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const tpPenaltyAmount = lending.tpPenaltyAmount ?? 100;

  const calcTpForDays = (daysCount: number) => {
    const days = Math.max(1, daysCount);
    const totalDaysToPay = days + 1; // วันที่ทบ + วันนี้ 1 วัน
    const totalInst = totalDaysToPay * instAmount;
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

  const prevOpenRef = useRef(false);

  // Load latest payment stats when modal opens (if not precalculated)
  useEffect(() => {
    if (!isOpen || !loanId) {
      prevOpenRef.current = isOpen;
      return;
    }

    if (prevOpenRef.current) {
      // Modal was already open, do not clobber user inputs on background refresh!
      return;
    }
    prevOpenRef.current = true;

    if (precalcSuggested !== undefined && precalcNextNum !== undefined) {
      setCalcSuggested(precalcSuggested);
      setBaseNextNum(precalcNextNum);
      setInterestDays(1);
      setForm({
        amount: precalcSuggested,
        paymentDate: getThaiDateStr(),
        installmentNumber: precalcNextNum,
        method: "cash",
        category: isInterestOnlyMode ? "interest" : "principal",
        notes: isInterestOnlyMode ? "ชำระดอกเบี้ย 1 วัน" : "",
      });
      setRollDays(1);
      setSlipFile(null);
      return;
    }

    setLoadingData(true);
    getPaymentsByLoan(loanId)
      .then((paymentsData: any[]) => {
        const payments = paymentsData ?? [];
        const isPrincipalInterestAtEnd = Boolean(loan?.isPrincipalInterestAtEnd || loan?.is_principal_interest_at_end);
        const principal = Number(loan?.principal || 0);
        const totalPayable = Number(loan?.totalPayable ?? loan?.total_payable ?? 0);
        
        const principalPaid = payments
          .filter((p: any) => p.category === "principal")
          .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
        const totalPaid = payments.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);

        const contractRemaining = isInterestOnlyMode
          ? Math.max(principal - principalPaid, 0)
          : Math.max(totalPayable - totalPaid, 0);

        const recordedInstallmentNumbers = payments
          .map((payment: any) => Number(payment.installmentNumber ?? payment.installment_number))
          .filter((num: number) => Number.isFinite(num) && num > 0);

        const nextNum = recordedInstallmentNumbers.length > 0
          ? Math.max(...recordedInstallmentNumbers) + 1
          : payments.length + 1;

        const dueAmountBase = isPrincipalInterestAtEnd ? contractRemaining : instAmount;
        const suggested = isInterestOnlyMode
          ? instAmount
          : Math.max(Math.min(dueAmountBase, contractRemaining || dueAmountBase), 0);

        setCalcSuggested(suggested);
        setBaseNextNum(nextNum);
        setInterestDays(1);
        setForm({
          amount: suggested,
          paymentDate: getThaiDateStr(),
          installmentNumber: nextNum,
          method: "cash",
          category: isInterestOnlyMode ? "interest" : "principal",
          notes: isInterestOnlyMode ? "ชำระดอกเบี้ย 1 วัน" : "",
        });
        setRollDays(1);
        setSlipFile(null);
      })
      .catch((err) => {
        console.error("Failed to load payments for loan modal:", err);
      })
      .finally(() => setLoadingData(false));
  }, [isOpen, loanId, precalcSuggested, precalcNextNum, isInterestOnlyMode, instAmount]);

  const handleInterestDaysChange = (val: number | "") => {
    setInterestDays(val);
    const days = val === "" ? 1 : Number(val);
    const totalAmt = days * instAmount;
    setForm((prev) => ({
      ...prev,
      amount: totalAmt,
      notes: `ชำระดอกเบี้ย ${days} วัน (วันละ ${formatTHB(instAmount)})`,
    }));
  };

  const handleCategoryChange = (v: "interest" | "principal" | "roll_penalty") => {
    if (v === "roll_penalty") {
      const days = rollDays === "" ? 1 : Number(rollDays);
      const calcResult = calcTpForDays(days);
      setForm((current) => ({
        ...current,
        category: v,
        installmentNumber: baseNextNum + days,
        amount: calcResult.totalTp > 0 ? calcResult.totalTp : current.amount,
        notes: `ชำระ ท+ป ${days} วัน (${calcResult.totalDaysToPay} งวด ฿${calcResult.totalInst} + ปรับ ฿${calcResult.totalPen})`,
      }));
    } else if (v === "interest" && isInterestOnlyMode) {
      const days = interestDays === "" ? 1 : Number(interestDays);
      setForm((current) => ({
        ...current,
        category: v,
        installmentNumber: baseNextNum,
        amount: days * instAmount,
        notes: `ชำระดอกเบี้ย ${days} วัน`,
      }));
    } else {
      setForm((current) => ({
        ...current,
        category: v,
        installmentNumber: baseNextNum,
        amount: calcSuggested,
        notes: "",
      }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      form.amount === null ||
      form.amount === undefined ||
      (form.amount as any) === "" ||
      Number(form.amount) < 0 ||
      isNaN(Number(form.amount))
    ) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }

    setBusy(true);
    try {
      if (form.category === "roll_penalty") {
        const days = Math.max(1, rollDays === "" ? 1 : Number(rollDays));
        const totalInstallmentsCount = days + 1; // วันที่ทบ + วันนี้ 1 วัน
        const baseInstAmount = instAmount > 0 ? instAmount : (Number(form.amount) / totalInstallmentsCount);
        const penaltyPerDay = tpPenaltyAmount || 100;

        // 1. Create rolled days payments (งวดที่ทบ)
        for (let k = 0; k < days; k++) {
          const instNum = baseNextNum + k;
          const rolledPaymentAmount = baseInstAmount + penaltyPerDay;
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
        const currentInstNum = baseNextNum + days;
        await createPayment(
          {
            loanId,
            amount: baseInstAmount,
            installmentNumber: currentInstNum,
            paymentDate: form.paymentDate,
            method: form.method,
            category: isInterestOnlyMode ? "interest" : "principal",
            notes: `ชำระค่างวดปกติ (วันที่ ${totalInstallmentsCount}/${totalInstallmentsCount})`,
          },
          days === 0 ? slipFile : null
        );

        try {
          await logActivity({
            action: "record_payment",
            entity_type: "payment",
            details: { loanId, amount: form.amount, category: "roll_penalty", days, startInstallment: baseNextNum, endInstallment: currentInstNum, loanNumber, customerName },
          });
        } catch (logError) {}

        toast.success(`⚡️ บันทึกชำระ ท+ป ${days} วัน + วันนี้ 1 วัน รวม ${totalInstallmentsCount} งวด (งวดที่ ${baseNextNum} - ${currentInstNum}) เรียบร้อยแล้ว`);
      } else {
        await createPayment({ ...form, loanId }, slipFile);
        try {
          await logActivity({
            action: "record_payment",
            entity_type: "payment",
            details: { loanId, amount: form.amount, loanNumber, customerName },
          });
        } catch (logError) {
          console.error("Activity log failed:", logError);
        }
        toast.success("บันทึกการชำระเงินเรียบร้อยแล้ว");
      }

      setIsOpen(false);
      onDone?.();
    } catch (error: any) {
      toast.error(error.message || "เกิดข้อผิดพลาดในการบันทึกการชำระเงิน");
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
            className="h-8 px-2.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground text-xs font-bold gap-1 active:scale-95 transition-all"
            title="บันทึกการชำระเงิน"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            <span>รับชำระ</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="w-[95vw] sm:w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 border-border shadow-[var(--shadow-elevated)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between gap-2">
            <span>บันทึกการชำระเงิน</span>
            {loanNumber && (
              <span className="text-xs font-mono font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                {loanNumber}
              </span>
            )}
          </DialogTitle>
          {customerName && (
            <p className="text-xs text-muted-foreground font-medium text-left">
              ลูกค้า: <span className="font-bold text-foreground">{customerName}</span>
            </p>
          )}
        </DialogHeader>

        {loadingData ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">กำลังโหลดข้อมูลงวด...</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  จำนวนเงิน (บาท)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amount: e.target.value === "" ? ("" as any) : Number(e.target.value),
                    })
                  }
                  className="bg-muted/20 font-bold text-primary text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ชำระงวดที่
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={form.installmentNumber}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      installmentNumber: e.target.value === "" ? ("" as any) : Number(e.target.value),
                    })
                  }
                  className="bg-muted/20"
                />
                {form.category === "roll_penalty" && (
                  <p className="text-[10px] text-warning font-semibold">
                    ✨ ครอบคลุมงวดที่ {baseNextNum} ถึง {form.installmentNumber}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  วันที่ชำระ
                </Label>
                <Input
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  className="bg-muted/20"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ช่องทางการชำระ
                </Label>
                <Select value={form.method} onValueChange={(v: any) => setForm({ ...form, method: v })}>
                  <SelectTrigger className="bg-muted/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">เงินสด</SelectItem>
                    <SelectItem value="bank_transfer">โอนผ่านธนาคาร</SelectItem>
                    <SelectItem value="other">อื่นๆ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={form.category === "roll_penalty" || (isInterestOnlyMode && form.category === "interest") ? "space-y-2" : "space-y-2 col-span-1 sm:col-span-2"}>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ประเภทการชำระ
                </Label>
                <Select value={form.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="bg-muted/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interest">ชำระดอกเบี้ย</SelectItem>
                    <SelectItem value="principal">{isInterestOnlyMode ? "ตัดเงินต้น / คืนต้น" : "ชำระเงินต้น / ปิดยอด"}</SelectItem>
                    <SelectItem value="roll_penalty">ชำระ ท+ป (ทบ + ปรับ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isInterestOnlyMode && form.category === "interest" && (
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
                        installmentNumber: baseNextNum + days,
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
            {isInterestOnlyMode && form.category === "interest" && (
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
                  <span>💡 คำนวณดอกเบี้ย {interestDays || 1} วัน (วันละ {formatTHB(instAmount)}):</span>
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
                  <p>
                    • ค่างวด {currentTpCalc.totalDaysToPay} วัน (ทบ {currentTpCalc.days} วัน + วันนี้ 1 วัน):{" "}
                    <span className="font-semibold text-foreground">{formatTHB(currentTpCalc.totalInst)}</span>
                  </p>
                  <p>
                    • ค่าปรับ ท+ป ({currentTpCalc.days} วัน x {formatTHB(tpPenaltyAmount || 100)}):{" "}
                    <span className="font-semibold text-foreground">{formatTHB(currentTpCalc.totalPen)}</span>
                  </p>
                  <p className="text-[10px] text-warning/80 pt-0.5">* วันที่จ่ายจริง (วันนี้) ไม่มีการคิดค่าปรับ</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                หมายเหตุ
              </Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-muted/20"
                placeholder="ระบุรายละเอียดเพิ่มเติม..."
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor={`payment-slip-${loanId || "modal"}`}
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                แนบสลิปการโอน (ไม่บังคับ)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  key={slipFile ? "payment-slip-selected" : "payment-slip-empty"}
                  id={`payment-slip-${loanId || "modal"}`}
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
                <p className="text-[11px] text-muted-foreground truncate">{slipFile.name}</p>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="submit"
                disabled={busy}
                className="w-full py-6 text-base font-bold shadow-[var(--shadow-elevated)]"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึก...
                  </span>
                ) : (
                  "ยืนยันการชำระเงิน"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
