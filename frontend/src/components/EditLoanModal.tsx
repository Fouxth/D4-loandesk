import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatTHB } from "@/utils/format";
import { calcLoan } from "@/utils/loanCalc";
import { updateLoan, logActivity } from "@/lib/services";

interface EditLoanModalProps {
  loan: any;
  onDone?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EditLoanModal({
  loan,
  onDone,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: EditLoanModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;

  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  // Initialize form whenever loan changes or modal opens
  useEffect(() => {
    if (loan && isOpen) {
      const startDateStr = loan.startDate
        ? (loan.startDate instanceof Date ? loan.startDate.toISOString().substring(0, 10) : String(loan.startDate).substring(0, 10))
        : (loan.start_date ? String(loan.start_date).substring(0, 10) : "");

      const dueDateStr = loan.dueDate
        ? (loan.dueDate instanceof Date ? loan.dueDate.toISOString().substring(0, 10) : String(loan.dueDate).substring(0, 10))
        : (loan.due_date ? String(loan.due_date).substring(0, 10) : "");

      const promiseDateStr = loan.promiseDate
        ? (loan.promiseDate instanceof Date ? loan.promiseDate.toISOString().substring(0, 10) : String(loan.promiseDate).substring(0, 10))
        : (loan.promise_date ? String(loan.promise_date).substring(0, 10) : "");

      setForm({
        principal: Number(loan.principal || 0),
        interestRate: Number(loan.interestRate ?? loan.interest_rate ?? 0),
        installmentsCount: Number(loan.installmentsCount ?? loan.installments_count ?? 1),
        paymentType: loan.paymentType || loan.payment_type || "daily",
        startDate: startDateStr,
        dueDate: dueDateStr,
        promiseDate: promiseDateStr,
        status: (loan.status || "active").toLowerCase(),
        notes: loan.notes || "",
        isInterestOnly: Boolean(loan.isInterestOnly || loan.is_interest_only),
        isIndefinite: Boolean(loan.isIndefinite || loan.is_indefinite),
        isPrincipalInterestAtEnd: Boolean(loan.isPrincipalInterestAtEnd || loan.is_principal_interest_at_end),
        isPawn: Boolean(loan.isPawn || loan.is_pawn),
        pawnItem: loan.pawnItem || loan.pawn_item || "",
        pawnStatus: loan.pawnStatus || loan.pawn_status || "in_storage",
        documentFee: Number(loan.documentFee || loan.document_fee || 0),
        advanceFee: Number(loan.advanceFee || loan.advance_fee || 0),
        parkingFee: Number(loan.parkingFee || loan.parking_fee || 0),
      });
    }
  }, [loan, isOpen]);

  // Recalculate loan summary preview
  const calc = useMemo(() => {
    const p = Number(form.principal || 0);
    const r = Number(form.interestRate || 0);
    const count = Number(form.installmentsCount || 1);
    const type = form.paymentType || "daily";
    const start = form.startDate ? new Date(form.startDate) : new Date();

    return calcLoan(
      p,
      r,
      count,
      type,
      start,
      form.isInterestOnly,
      form.isPrincipalInterestAtEnd
    );
  }, [
    form.principal,
    form.interestRate,
    form.installmentsCount,
    form.paymentType,
    form.startDate,
    form.isInterestOnly,
    form.isPrincipalInterestAtEnd,
  ]);

  const totalDeductions =
    Number(form.documentFee || 0) +
    Number(form.advanceFee || 0) +
    Number(form.parkingFee || 0);
  const netDisbursement = Math.max(Number(form.principal || 0) - totalDeductions, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loan?.id) return;

    try {
      setBusy(true);
      const computedDueDate = form.isIndefinite
        ? null
        : form.dueDate || (calc.due ? calc.due.toISOString().substring(0, 10) : null);

      const payload = {
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        interestAmount: calc.interest,
        totalPayable: calc.total,
        installmentsCount: Number(form.installmentsCount),
        installmentAmount: calc.installment,
        paymentType: form.paymentType,
        startDate: form.startDate,
        dueDate: computedDueDate,
        promiseDate: form.promiseDate || null,
        status: form.status,
        notes: form.notes,
        isInterestOnly: form.isInterestOnly,
        isIndefinite: form.isIndefinite,
        isPrincipalInterestAtEnd: form.isPrincipalInterestAtEnd,
        isPawn: form.isPawn,
        pawnItem: form.pawnItem || null,
        pawnStatus: form.isPawn ? form.pawnStatus : null,
        documentFee: Number(form.documentFee || 0),
        advanceFee: Number(form.advanceFee || 0),
        parkingFee: form.isPawn ? Number(form.parkingFee || 0) : 0,
      };

      await updateLoan(loan.id, payload);

      try {
        await logActivity({
          action: "update_loan",
          entity_type: "loan",
          entity_id: loan.id,
          details: {
            loanNumber: loan.loanNumber || loan.loan_number,
            customerName: loan.customerName || loan.customer_name,
            principal: payload.principal,
            status: payload.status,
          },
        });
      } catch (logErr) {
        console.error("Failed to log activity:", logErr);
      }

      toast.success("บันทึกการแก้ไขข้อมูลสัญญาเรียบร้อยแล้ว");
      setIsOpen(false);
      onDone?.();
    } catch (err: any) {
      console.error("Update loan failed:", err);
      toast.error(err.response?.data?.error || err.message || "บันทึกข้อมูลไม่สำเร็จ");
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
            variant="outline"
            className="h-11 rounded-xl font-bold border-border/60 bg-card shadow-sm gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/30"
          >
            <Pencil className="h-4 w-4" />
            แก้ไขสัญญา
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-xl w-[95vw] sm:w-full max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            แก้ไขข้อมูลสัญญา {loan?.loanNumber}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            ลูกค้า: <span className="font-bold text-foreground">{loan?.customerName}</span>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Principal */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ยอดเงินต้น (บาท)
              </Label>
              <Input
                type="number"
                min={1}
                value={form.principal ?? ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, principal: e.target.value === "" ? "" : Number(e.target.value) })}
                className="bg-muted/20 font-bold"
                required
              />
            </div>

            {/* Interest Rate */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                อัตราดอกเบี้ย (%)
              </Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={form.interestRate ?? ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value === "" ? "" : Number(e.target.value) })}
                className="bg-muted/20"
                required
              />
            </div>

            {/* Installments Count */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                จำนวนงวด
              </Label>
              <Input
                type="number"
                min={1}
                value={form.installmentsCount ?? ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, installmentsCount: e.target.value === "" ? "" : Number(e.target.value) })}
                className="bg-muted/20"
                required
              />
            </div>

            {/* Payment Frequency */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ความถี่ในการชำระ
              </Label>
              <Select
                value={form.paymentType || "daily"}
                onValueChange={(v) => setForm({ ...form, paymentType: v })}
              >
                <SelectTrigger className="bg-muted/20 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">รายวัน</SelectItem>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                วันที่เริ่มสัญญา
              </Label>
              <Input
                type="date"
                value={form.startDate || ""}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="bg-muted/20"
                required
              />
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                วันครบกำหนดสัญญา
              </Label>
              <Input
                type="date"
                value={form.dueDate || ""}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="bg-muted/20"
              />
            </div>

            {/* Promise Date */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-primary">
                วันนัดชำระ / เลื่อนนัด (Promise Date)
              </Label>
              <Input
                type="date"
                value={form.promiseDate || ""}
                onChange={(e) => setForm({ ...form, promiseDate: e.target.value })}
                className="bg-primary/5 border-primary/20 font-medium"
              />
            </div>

            {/* Loan Status */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                สถานะสัญญา
              </Label>
              <Select
                value={form.status || "active"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="bg-muted/20 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">ปกติ (Active)</SelectItem>
                  <SelectItem value="completed">ปิดยอดแล้ว (Completed)</SelectItem>
                  <SelectItem value="overdue">เกินกำหนด (Overdue)</SelectItem>
                  <SelectItem value="forfeited">หลุดจำนำ (Forfeited)</SelectItem>
                  <SelectItem value="refinanced">รียอดใหม่แล้ว (Refinanced)</SelectItem>
                  <SelectItem value="cancelled">ยกเลิกสัญญา (Cancelled)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Special Loan Options */}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              รูปแบบสัญญาพิเศษ
            </Label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isInterestOnly}
                  onChange={(e) => setForm({ ...form, isInterestOnly: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>ดอกลอย (เก็บแต่ดอก)</span>
              </label>

              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPrincipalInterestAtEnd}
                  onChange={(e) => setForm({ ...form, isPrincipalInterestAtEnd: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>จบต้นจบดอก</span>
              </label>

              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isIndefinite}
                  onChange={(e) => setForm({ ...form, isIndefinite: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>ไม่มีกำหนดสิ้นสุด (ยอดติด)</span>
              </label>

              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPawn}
                  onChange={(e) => setForm({ ...form, isPawn: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>สัญญาจำนำสิ่งของ</span>
              </label>
            </div>
          </div>

          {/* Pawn Item Details if Pawn */}
          {form.isPawn && (
            <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 space-y-3 animate-in fade-in">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-primary">
                  รายละเอียดทรัพย์สินจำนำ
                </Label>
                <Input
                  value={form.pawnItem || ""}
                  onChange={(e) => setForm({ ...form, pawnItem: e.target.value })}
                  placeholder="เช่น รถเก๋ง ทะเบียน กก 1234, พระเลี่ยมทอง..."
                  className="bg-card border-primary/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  สถานะทรัพย์สิน
                </Label>
                <Select
                  value={form.pawnStatus || "in_storage"}
                  onValueChange={(v) => setForm({ ...form, pawnStatus: v })}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_storage">อยู่ในคลัง (In Storage)</SelectItem>
                    <SelectItem value="redeemed">ไถ่ถอนแล้ว (Redeemed)</SelectItem>
                    <SelectItem value="forfeited">หลุดจำนำ (Forfeited)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Upfront Fees */}
          <div className="border-t border-border/60 pt-3 space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              ค่าธรรมเนียมหัก ณ ที่จ่าย (บาท)
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">ค่าเอกสาร</span>
                <Input
                  type="number"
                  min={0}
                  value={form.documentFee ?? ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, documentFee: e.target.value === "" ? "" : Number(e.target.value) })}
                  className="bg-muted/20"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">ค่าบริการล่วงหน้า</span>
                <Input
                  type="number"
                  min={0}
                  value={form.advanceFee ?? ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, advanceFee: e.target.value === "" ? "" : Number(e.target.value) })}
                  className="bg-muted/20"
                />
              </div>
              {form.isPawn && (
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">ค่าฝากจอด</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.parkingFee ?? ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setForm({ ...form, parkingFee: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="bg-muted/20"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              หมายเหตุสัญญา
            </Label>
            <Input
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="หมายเหตุเพิ่มเติม..."
              className="bg-muted/20"
            />
          </div>

          {/* Preview Calculated Summary Card */}
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 shadow-sm space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-primary">
              สรุปยอดตามการคำนวณใหม่
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block">ดอกเบี้ยรวม</span>
                <span className="font-bold text-primary">{formatTHB(calc.interest)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">ยอดรวมทั้งหมด</span>
                <span className="font-bold text-primary">{formatTHB(calc.total)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">
                  {form.isPrincipalInterestAtEnd ? "ยอดปิด" : "ค่างวด"}
                </span>
                <span className="font-bold text-primary">{formatTHB(calc.installment)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">เงินออกสุทธิ</span>
                <span className="font-bold text-warning">{formatTHB(netDisbursement)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={busy}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={busy} className="font-bold gap-2">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  บันทึกข้อมูลสัญญา
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
