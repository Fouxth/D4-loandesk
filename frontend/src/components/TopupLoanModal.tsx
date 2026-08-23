import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatTHB, getThaiDateStr } from "@/utils/format";
import { topupLoan } from "@/lib/services";

interface TopupLoanModalProps {
  loan: any;
  onDone?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TopupLoanModal({
  loan,
  onDone,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: TopupLoanModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;

  const oldPrincipal = Number(loan?.principal || 0);
  const oldInstallment = Number(loan?.installmentAmount ?? loan?.installment_amount ?? 0);
  const oldRate = Number(loan?.interestRate ?? loan?.interest_rate ?? 0);

  const [addedPrincipal, setAddedPrincipal] = useState<number | "">("");
  const [newInstallment, setNewInstallment] = useState<number | "">("");
  const [topupDate, setTopupDate] = useState(getThaiDateStr());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const prevOpenRef = useRef(false);

  // Initialize/reset form ONLY on open transition (false -> true)
  useEffect(() => {
    if (loan && isOpen && !prevOpenRef.current) {
      setAddedPrincipal("");
      setNewInstallment("");
      setTopupDate(getThaiDateStr());
      setNotes("");
    }
    prevOpenRef.current = isOpen;
  }, [loan, isOpen]);

  const numAdded = Number(addedPrincipal) || 0;
  const newTotalPrincipal = oldPrincipal + numAdded;

  // Auto calculate suggested new installment when addedPrincipal changes
  const handleAddedChange = (val: number | "") => {
    setAddedPrincipal(val);
    if (val === "" || Number(val) <= 0) {
      setNewInstallment(oldInstallment > 0 ? oldInstallment : "");
      return;
    }
    const addedNum = Number(val);
    const calculatedNewPrincipal = oldPrincipal + addedNum;
    if (oldPrincipal > 0 && oldInstallment > 0) {
      // Scale daily interest proportionally
      const suggestedDaily = Math.round((oldInstallment / oldPrincipal) * calculatedNewPrincipal);
      setNewInstallment(suggestedDaily);
    } else if (oldRate > 0) {
      const suggestedDaily = Math.round((calculatedNewPrincipal * oldRate) / 100);
      setNewInstallment(suggestedDaily);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addedPrincipal || Number(addedPrincipal) <= 0) {
      toast.error("กรุณาระบุจำนวนเงินต้นที่ต้องการเบิกเพิ่ม");
      return;
    }

    setBusy(true);
    try {
      await topupLoan(loan.id, {
        addedPrincipal: Number(addedPrincipal),
        newInstallmentAmount: newInstallment === "" ? oldInstallment : Number(newInstallment),
        topupDate,
        notes: notes.trim(),
      });

      toast.success(`➕ เบิกเงินต้นเพิ่ม +฿${Number(addedPrincipal).toLocaleString()} สำเร็จแล้ว (ยอดใหม่ ฿${newTotalPrincipal.toLocaleString()})`);
      setIsOpen(false);
      onDone?.();
    } catch (error: any) {
      toast.error(error.message || "เกิดข้อผิดพลาดในการเบิกเงินต้นเพิ่ม");
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
            className="flex-1 sm:flex-initial border-primary/30 text-primary hover:bg-primary/10 h-11 px-5 rounded-xl font-bold gap-2 shadow-sm"
          >
            <PlusCircle className="h-4 w-4" />
            <span>เบิกเงินต้นเพิ่ม</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 sm:p-6 border-border shadow-[var(--shadow-elevated)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            <span>เบิกเงินต้นเพิ่ม (Top-up ดอกลอย)</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            เพิ่มยอดเงินต้นในสัญญาเดิม ({loan?.loanNumber}) และปรับยอดดอกเบี้ยต่อวันใหม่ตามต้องการ
          </DialogDescription>
        </DialogHeader>

        {/* Comparison Summary Card */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">เงินต้นเดิม:</span>
            <span className="font-bold text-foreground">{formatTHB(oldPrincipal)}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">ดอกเบี้ยเดิม:</span>
            <span className="font-bold text-foreground">{formatTHB(oldInstallment)} / วัน</span>
          </div>
          {numAdded > 0 && (
            <div className="border-t border-primary/20 pt-2.5 space-y-2">
              <div className="flex justify-between items-center text-xs text-success font-bold">
                <span>➕ ยอดเบิกเพิ่ม:</span>
                <span>+{formatTHB(numAdded)}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-black text-primary">
                <span>💎 เงินต้นรวมใหม่:</span>
                <span className="text-base">{formatTHB(newTotalPrincipal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-warning">
                <span>🏷 ดอกเบี้ยต่อวันใหม่:</span>
                <span>{formatTHB(newInstallment === "" ? oldInstallment : Number(newInstallment))} / วัน</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 col-span-1 sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-primary">
                จำนวนเงินต้นที่เบิกเพิ่ม (บาท) *
              </Label>
              <Input
                type="number"
                min={1}
                value={addedPrincipal}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleAddedChange(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="เช่น 5000"
                className="bg-primary/10 border-primary/30 font-black text-primary text-lg"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ดอกเบี้ยต่อวันใหม่ (บาท/วัน)
              </Label>
              <Input
                type="number"
                min={0}
                value={newInstallment}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setNewInstallment(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={String(oldInstallment)}
                className="bg-muted/20 font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                วันที่เบิกเพิ่ม
              </Label>
              <Input
                type="date"
                value={topupDate}
                onChange={(e) => setTopupDate(e.target.value)}
                className="bg-muted/20 font-bold"
              />
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                หมายเหตุ / บันทึกเพิ่มเติม
              </Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น ลูกค้าขอเพิ่ม 5,000 บาท โอนเข้าบัญชี..."
                className="bg-muted/20"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={busy} className="rounded-xl">
              ยกเลิก
            </Button>
            <Button type="submit" disabled={busy || !addedPrincipal || Number(addedPrincipal) <= 0} className="rounded-xl font-bold shadow-[var(--shadow-elevated)] min-w-[130px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              บันทึกเบิกเพิ่ม
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
