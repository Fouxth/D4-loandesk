import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "@tanstack/react-router";
import { formatTHB } from "@/utils/format";
import { getNotifications } from "@/lib/services";

type Alert = {
  id: string;
  loan_number: string;
  customer: string;
  due_date: string;
  amount: number;
  kind: "due" | "overdue";
};

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getNotifications();
        const list: Alert[] = (data ?? []).map((l: any) => ({
          id: l.id,
          loan_number: l.loanNumber,
          customer: l.customerName ?? "—",
          due_date: l.dueDate,
          amount: Number(l.totalPayable),
          kind: l.status === "overdue" ? "overdue" : "due",
        }));
        setAlerts(list);
      } catch (e) {
        console.error("Failed to load notifications", e);
      }
    };
    
    load();
    const timer = setInterval(load, 30000); // Poll every 30 seconds
    return () => clearInterval(timer);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full hover:bg-muted" aria-label="แจ้งเตือน">
          <Bell className="h-4.5 w-4.5" />
          {alerts.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
              {alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-[var(--shadow-elevated)] border-border">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-bold">การแจ้งเตือน</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ยอดค้างชำระ & ครบกำหนด</p>
        </div>
        <div className="max-h-80 overflow-auto">
          {alerts.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
                <Bell className="h-5 w-5 opacity-20" />
              </div>
              ไม่มีการแจ้งเตือนในขณะนี้ ✨
            </div>
          ) : (
            alerts.map((a) => (
              <Link
                key={a.id}
                to="/loans/$loanId"
                params={{ loanId: a.id }}
                className="block border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{a.customer}</p>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">{a.loan_number}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter ${
                      a.kind === "overdue"
                        ? "bg-destructive/15 text-destructive border border-destructive/20"
                        : "bg-warning/15 text-warning-foreground border border-warning/20"
                    }`}
                  >
                    {a.kind === 'overdue' ? 'ค้างชำระ' : 'วันนี้'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-bold text-primary">{formatTHB(a.amount)}</p>
              </Link>
            ))
          )}
        </div>
        {alerts.length > 0 && (
          <div className="border-t border-border bg-muted/10 p-2 text-center">
            <Button variant="ghost" size="sm" className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground" asChild>
              <Link to="/loans">ดูสัญญาทั้งหมด</Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}