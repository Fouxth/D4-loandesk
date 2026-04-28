import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/activity")({
  component: () => (<ProtectedRoute><AppLayout><Activity /></AppLayout></ProtectedRoute>),
});

function Activity() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => setLogs(data ?? []));
  }, []);
  return (
    <div>
      <PageHeader title="Activity log" description="All recent actions" />
      <div className="rounded-xl border border-border bg-card divide-y divide-border shadow-[var(--shadow-card)]">
        {logs.length === 0 && <div className="px-4 py-12 text-center text-muted-foreground">No activity yet</div>}
        {logs.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium capitalize">{l.action.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">{l.entity_type ?? "—"} · {l.entity_id?.slice(0, 8) ?? ""}</p>
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(l.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
