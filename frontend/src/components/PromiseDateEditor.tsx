import { useEffect, useState } from "react";
import { Calendar, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateLoan, logActivity } from "@/lib/services";
import { formatDate } from "@/utils/format";

type Props = {
  loanId: string;
  loan: any;
  onSaved: () => void;
};

export function PromiseDateEditor({ loanId, loan, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const currentPromiseDate = loan?.promiseDate || loan?.promise_date || loan?.dueDate || loan?.due_date || '';
  const initialDateStr = currentPromiseDate ? String(currentPromiseDate).substring(0, 10) : '';

  const [promiseDate, setPromiseDate] = useState(initialDateStr);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const d = loan?.promiseDate || loan?.promise_date || loan?.dueDate || loan?.due_date || '';
      setPromiseDate(d ? String(d).substring(0, 10) : '');
    }
  }, [open, loan]);

  const save = async () => {
    const targetPromiseDate = promiseDate || (loan?.dueDate || loan?.due_date ? String(loan.dueDate || loan.due_date).substring(0, 10) : null);
    setBusy(true);
    try {
      await updateLoan(loanId, { promiseDate: targetPromiseDate });
      try {
        await logActivity({
          action: "update_loan_promise_date",
          entity_type: "loan",
          entity_id: loanId,
          details: { promiseDate },
        });
      } catch (e) {
        console.error("Failed to log activity:", e);
      }
      toast.success("บันทึกวันนัดจ่ายเรียบร้อยแล้ว");
      setOpen(false);
      onSaved();
    } catch (error: any) {
      toast.error(error.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1 font-bold"
        >
          <Pencil className="h-3 w-3" />
          เลื่อนวันนัดจ่าย
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <Calendar className="h-5 w-5 text-primary" />
            กำหนด / แก้ไขวันนัดจ่าย
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {initialDateStr && (
            <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg">
              วันนัดจ่ายปัจจุบัน: <span className="font-bold text-foreground">{formatDate(initialDateStr)}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              เลือกวันนัดจ่ายใหม่
            </Label>
            <Input
              type="date"
              value={promiseDate}
              onChange={(e) => setPromiseDate(e.target.value)}
              className="bg-muted/20 font-medium"
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 ระบบจะใช้ **วันนัดจ่าย** นี้ในการคำนวณสถานะสัญญา โดยสัญญาจะยังคงสถานะ **ปกติ** จนกระทั่งพ้นวันนัดจ่ายใหม่นี้
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={save} disabled={busy} className="font-bold px-5">
            {busy ? "กำลังบันทึก..." : "บันทึกวันนัดจ่าย"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
