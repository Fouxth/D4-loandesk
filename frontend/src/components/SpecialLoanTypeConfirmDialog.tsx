import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle, Package, Percent } from "lucide-react";

export type SpecialLoanType = "interest_only" | "principal_interest_at_end" | "pawn";

interface SpecialLoanTypeConfirmDialogProps {
  type: SpecialLoanType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function SpecialLoanTypeConfirmDialog({
  type,
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: SpecialLoanTypeConfirmDialogProps) {
  if (!type) return null;

  const contentMap: Record<
    SpecialLoanType,
    {
      title: string;
      icon: React.ReactNode;
      badgeColor: string;
      bullets: string[];
      confirmLabel: string;
      actionClass: string;
    }
  > = {
    interest_only: {
      title: 'ยืนยันการเลือก "เงินกู้แบบดอกลอย"',
      icon: <Percent className="h-5 w-5 text-primary" />,
      badgeColor: "bg-primary/10 text-primary border-primary/20",
      bullets: [
        "สัญญานี้จะเก็บเฉพาะดอกเบี้ยรายวันไปเรื่อยๆ (ไม่มีกำหนดวันสิ้นสุดสัญญา)",
        "ระบบจะปรับอัตราดอกเบี้ยเป็น 2% ต่อวัน ให้อัตโนมัติ",
        "ยอดเงินต้นจะคงอยู่จนกว่าลูกค้าจะนำเงินก้อนมาชำระตัดต้นหรือปิดยอด",
      ],
      confirmLabel: "ยืนยันเลือกดอกลอย",
      actionClass: "bg-primary text-primary-foreground hover:bg-primary/90",
    },
    principal_interest_at_end: {
      title: 'ยืนยันการเลือก "จบต้นจบดอก"',
      icon: <AlertCircle className="h-5 w-5 text-amber-500" />,
      badgeColor: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      bullets: [
        "⚠️ ลูกค้ารายนี้จะไม่ต้องผ่อนค่างวดรายวัน",
        "ลูกค้าจะต้องนำเงินต้นและดอกเบี้ยรวมทั้งหมดทีเดียว มาชำระคืนในวันครบกำหนดสัญญา",
        "💡 หากต้องการให้ลูกค้าผ่อนชำระเป็นรายวันตามปกติ กรุณากดยกเลิก และไม่ต้องเลือกตัวเลือกนี้",
      ],
      confirmLabel: "ยืนยันเลือกจบต้นจบดอก",
      actionClass: "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/20",
    },
    pawn: {
      title: 'ยืนยันการเลือก "จำนำสิ่งของ"',
      icon: <Package className="h-5 w-5 text-indigo-500" />,
      badgeColor: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      bullets: [
        "สัญญานี้จะเป็นสัญญาจำนำทรัพย์สิน (รอบชำระดอกเบี้ยรายเดือน)",
        "จำเป็นต้องระบุรายละเอียดสิ่งของ/ทรัพย์สินที่ลูกค้านำมาวางจำนำ",
        "ทรัพย์สินจะถูกบันทึกเข้าคลังเพื่อรอการไถ่ถอนหรือตัดหลุดจำนำ",
      ],
      confirmLabel: "ยืนยันเลือกจำนำ",
      actionClass: "bg-indigo-600 text-white hover:bg-indigo-700",
    },
  };

  const config = contentMap[type];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <div className={`p-2 rounded-xl border ${config.badgeColor} shrink-0`}>
              {config.icon}
            </div>
            <span>{config.title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground pt-1">
              <div className="rounded-xl bg-muted/40 border border-border/60 p-3 space-y-2 text-left">
                {config.bullets.map((b, idx) => (
                  <p key={idx} className={b.startsWith("⚠️") || b.startsWith("💡") ? "font-bold text-foreground text-xs" : "text-xs"}>
                    {b}
                  </p>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                คุณแน่ใจหรือไม่ว่าต้องการตั้งค่ารูปแบบสัญญานี้?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
          <AlertDialogCancel
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            className="rounded-xl font-bold border-border/60 h-10"
          >
            ยกเลิก
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
              onOpenChange(false);
            }}
            className={`rounded-xl font-bold h-10 px-5 ${config.actionClass}`}
          >
            {config.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
