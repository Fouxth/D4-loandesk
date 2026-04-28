import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { formatTHB } from "@/lib/format";
import { StatusBadge, loanStatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  component: () => (<ProtectedRoute><AppLayout><CalendarView /></AppLayout></ProtectedRoute>),
});

function CalendarView() {
  const [loans, setLoans] = useState<any[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  useEffect(() => {
    supabase.from("loans").select("id, loan_number, due_date, total_payable, status, customers(full_name)").then(({ data }) => setLoans(data ?? []));
  }, []);

  const grid = useMemo(() => {
    const first = new Date(month);
    const offset = first.getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(month.getFullYear(), month.getMonth(), d) });
    return cells;
  }, [month]);

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    loans.forEach((l) => { (map[l.due_date] ||= []).push(l); });
    return map;
  }, [loans]);

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Loan due dates"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[140px] text-center font-semibold">{month.toLocaleDateString("en", { month: "long", year: "numeric" })}</span>
            <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />
      <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((c, i) => {
            if (!c.date) return <div key={i} className="min-h-[90px]" />;
            const key = c.date.toISOString().split("T")[0];
            const items = byDate[key] ?? [];
            const isToday = key === new Date().toISOString().split("T")[0];
            return (
              <div key={i} className={`min-h-[90px] rounded-lg border p-1.5 ${isToday ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{c.date.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((l) => (
                    <Link key={l.id} to="/loans/$loanId" params={{ loanId: l.id }} className="block truncate rounded bg-accent/50 px-1.5 py-0.5 text-[10px] hover:bg-accent">
                      {l.customers?.full_name} · {formatTHB(l.total_payable)}
                    </Link>
                  ))}
                  {items.length > 3 && <p className="text-[10px] text-muted-foreground">+{items.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
