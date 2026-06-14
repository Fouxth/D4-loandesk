import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatTHB } from "@/utils/format";
import type { LendingConfig } from "@/utils/lendingConfig";
import { resolveLateFee, type LateFeeMode } from "@/utils/lateFee";
import { updateLoanLateFee, logActivity } from "@/lib/services";

type Props = {
  loanId: string;
  loan: any;
  lending: LendingConfig;
  rawDaysOverdue: number;
  dueDate?: string | null;
  contractRemaining: number;
  onSaved: () => void;
};

export function LateFeeEditor({
  loanId,
  loan,
  lending,
  rawDaysOverdue,
  dueDate,
  contractRemaining,
  onSaved,
}: Props) {
  const { autoFee, effectiveFee, daysOverdue, hoursOverdue, mode: currentMode } = resolveLateFee(
    lending,
    loan,
    rawDaysOverdue,
    dueDate,
  );
  const feeUnit = lending.lateFeePerHour > 0 ? `${hoursOverdue} ชม.` : `${daysOverdue} วัน`;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LateFeeMode>(currentMode);
  const [customAmount, setCustomAmount] = useState(
    String(loan.lateFeeAmount ?? loan.late_fee_amount ?? autoFee ?? 0),
  );
  const [note, setNote] = useState(loan.lateFeeNote ?? loan.late_fee_note ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(currentMode);
    setCustomAmount(String(loan.lateFeeAmount ?? loan.late_fee_amount ?? autoFee ?? 0));
    setNote(loan.lateFeeNote ?? loan.late_fee_note ?? "");
  }, [open, currentMode, loan, autoFee]);

  const previewFee =
    mode === "waive" ? 0 : mode === "custom" ? Math.max(0, Number(customAmount) || 0) : autoFee;
  const previewRemaining = Math.max(contractRemaining - effectiveFee + previewFee, 0);

  const save = async () => {
    if (mode === "custom" && (customAmount === "" || Number(customAmount) < 0)) {
      toast.error("กรุณาระบุจำนวนค่าปรับ");
      return;
    }
    setBusy(true);
    try {
      await updateLoanLateFee(loanId, {
        mode,
        amount: mode === "custom" ? Number(customAmount) : undefined,
        note: note.trim() || undefined,
      });
      try {
        await logActivity({
          action: "adjust_late_fee",
          entity_type: "loan",
          entity_id: loanId,
          details: { mode, amount: mode === "custom" ? Number(customAmount) : null, note },
        });
      } catch {
        /* optional */
      }
      toast.success("บันทึกค่าปรับเรียบร้อยแล้ว");
      setOpen(false);
      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message);
    } finally {
      setBusy(false);
    }
  };

  if (rawDaysOverdue <= 0 && currentMode === "auto" && autoFee <= 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
          <Pencil className="h-3 w-3 mr-1" />
          จัดการ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>จัดการค่าปรับล่าช้า</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-muted/30 p-3 space-y-1">
            <p className="text-muted-foreground">
              ค่าปรับตามระบบ ({feeUnit}): <span className="font-bold text-foreground">{formatTHB(autoFee)}</span>
            </p>
            <p className="text-muted-foreground">
              ยอดค้างตามสัญญา: <span className="font-bold text-foreground">{formatTHB(contractRemaining)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">เลือกวิธีคิดค่าปรับ</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "auto"} onChange={() => setMode("auto")} />
                <span>ใช้ตามระบบ ({formatTHB(autoFee)})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "waive"} onChange={() => setMode("waive")} />
                <span>ยกเว้นทั้งหมด (฿0)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
                <span>กำหนดเอง</span>
              </label>
            </div>
            {mode === "custom" && (
              <Input
                type="number"
                min={0}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="bg-muted/20"
                placeholder="จำนวนค่าปรับ (บาท)"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">หมายเหตุ (ไม่บังคับ)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="bg-muted/20 resize-none"
              placeholder="เช่น ลูกค้าตกลงลดค่าปรับ"
            />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
            <p>ค่าปรับที่ใช้: <span className="font-bold text-primary">{formatTHB(previewFee)}</span></p>
            <p>ยอดคงเหลือใหม่: <span className="font-black text-primary">{formatTHB(previewRemaining)}</span></p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={busy}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
