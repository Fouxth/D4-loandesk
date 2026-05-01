import { cn } from "@/utils/utils";

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
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      TONE_CLASSES[tone],
      className
    )}>
      {children}
    </span>
  );
}

export function loanStatusTone(status: string): any {
  switch (status?.toLowerCase()) {
    case 'active': return 'primary';
    case 'overdue': return 'destructive';
    case 'completed': return 'success';
    case 'cancelled': return 'muted';
    default: return 'muted';
  }
}
