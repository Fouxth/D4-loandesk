import { cn } from "@/utils/utils";
import { getThaiDateStr } from "@/utils/format";

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: "primary" | "warning" | "destructive" | "success" | "muted" | "info";
  className?: string;
}

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary border-primary/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  success: "bg-success/10 text-success border-success/20",
  muted: "bg-muted text-muted-foreground border-transparent",
  info: "bg-info/10 text-info border-info/20",
};

export function StatusBadge({ children, tone = "muted", className }: StatusBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
      TONE_CLASSES[tone],
      className
    )}>
      {children}
    </span>
  );
}

export function getLoanNextDueDate(l: any): string | null {
  if (!l) return null;
  const rawStatus = (l.status ?? '').toLowerCase();
  if (['completed', 'cancelled', 'forfeited', 'refinanced'].includes(rawStatus)) {
    return null;
  }

  const isIndefinite = l.isIndefinite ?? l.is_indefinite;
  const notes = l.notes ?? '';
  const interestRate = Number(l.interestRate ?? l.interest_rate ?? 0);
  const isZeroDebt = notes.includes('ยอดติด') || notes.includes('ยอดติดค้างชำระ') || (interestRate === 0 && (l.installmentsCount === 1 || !l.paymentType));

  if (isIndefinite || isZeroDebt) {
    return null;
  }

  const isPrincipalInterestAtEnd = l.isPrincipalInterestAtEnd ?? l.is_principal_interest_at_end;
  if (isPrincipalInterestAtEnd) {
    const rawDue = l.dueDate || l.due_date;
    return rawDue ? String(rawDue).substring(0, 10) : null;
  }

  const paidCount = Number(l.paidInstallmentsCount ?? l.paid_installments_count ?? l.paidInstallments ?? 0);
  const startDateStr = l.startDate || l.start_date;
  if (!startDateStr) {
    const rawDue = l.dueDate || l.due_date;
    return rawDue ? String(rawDue).substring(0, 10) : null;
  }

  const startParts = String(startDateStr).substring(0, 10).split('-').map(Number);
  if (startParts.length !== 3 || startParts.some(isNaN)) {
    const rawDue = l.dueDate || l.due_date;
    return rawDue ? String(rawDue).substring(0, 10) : null;
  }

  const [y, m, d] = startParts;
  const paymentType = l.paymentType || l.payment_type || 'monthly';

  const nextDate = new Date(y, m - 1, d);

  if (paymentType === 'daily') {
    nextDate.setDate(nextDate.getDate() + paidCount);
  } else if (paymentType === 'weekly') {
    nextDate.setDate(nextDate.getDate() + paidCount * 7);
  } else if (paymentType === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + paidCount);
  }

  const nextDueDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
  
  const finalDueDateStr = l.dueDate || l.due_date ? String(l.dueDate || l.due_date).substring(0, 10) : null;
  if (finalDueDateStr && nextDueDateStr > finalDueDateStr) {
    return finalDueDateStr;
  }

  return nextDueDateStr;
}

export function getEffectiveStatus(l: any): string {
  if (!l) return 'active';
  const rawStatus = (l.status ?? '').toLowerCase();
  if (['completed', 'cancelled', 'forfeited', 'refinanced'].includes(rawStatus)) {
    return rawStatus;
  }
  const isIndefinite = l.isIndefinite ?? l.is_indefinite;
  const notes = l.notes ?? '';
  const interestRate = Number(l.interestRate ?? l.interest_rate ?? 0);
  const isZeroDebt = notes.includes('ยอดติด') || notes.includes('ยอดติดค้างชำระ') || (interestRate === 0 && (l.installmentsCount === 1 || !l.paymentType));

  if (isIndefinite || isZeroDebt) {
    return 'active';
  }
  const todayStr = getThaiDateStr();
  const dueStr = getLoanNextDueDate(l);
  if (dueStr && dueStr < todayStr) return 'overdue';
  if (dueStr && dueStr === todayStr) return 'due_today';
  return 'active';
}

export function loanStatusTone(status: string): any {
  switch (status?.toLowerCase()) {
    case 'active': return 'primary';
    case 'overdue': return 'destructive';
    case 'due_today': return 'warning';
    case 'completed': return 'success';
    case 'forfeited': return 'destructive';
    case 'refinanced': return 'info';
    case 'cancelled': return 'muted';
    default: return 'muted';
  }
}

export function getLoanStatusLabel(l: any, t?: (key: string) => string): string {
  const eff = getEffectiveStatus(l);
  const isPawn = l?.isPawn ?? l?.is_pawn;
  if (eff === 'completed' && isPawn) return 'ไถ่ถอนแล้ว';
  if (eff === 'completed') return 'เสร็จสิ้น';
  if (eff === 'forfeited') return 'หลุดจำนำ';
  if (eff === 'refinanced') return 'ต่อดอกใหม่';
  if (eff === 'cancelled') return 'ยกเลิก';
  if (eff === 'overdue') return 'เกินกำหนด';
  if (eff === 'due_today') return 'ครบกำหนดวันนี้';
  if (eff === 'active') return 'ปกติ';
  return t ? t(`loans.status.${eff}`) : eff;
}
