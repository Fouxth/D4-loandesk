import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { getActivityLogs } from "@/lib/services";
import {
  UserPlus,
  FileText,
  CreditCard,
  LogIn,
  Edit2,
  Trash2,
  Activity,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/activity")({
  component: () => (
    <ProtectedRoute>
      <AppLayout>
        <ActivityPage />
      </AppLayout>
    </ProtectedRoute>
  ),
});

const ACTION_CONFIG: Record<
  string,
  { label: string; icon: any; color: string; bg: string }
> = {
  // seeded Thai text actions
  "สร้างลูกค้าใหม่":   { label: "สร้างลูกค้าใหม่",       icon: UserPlus,  color: "text-success",     bg: "bg-success/10" },
  "สร้างสัญญาเงินกู้": { label: "สร้างสัญญาเงินกู้",     icon: FileText,  color: "text-primary",     bg: "bg-primary/10" },
  "รับชำระเงิน":       { label: "รับชำระเงิน",           icon: CreditCard, color: "text-info",       bg: "bg-info/10" },
  "อัปเดตสถานะสัญญา": { label: "อัปเดตสถานะสัญญา",     icon: Edit2,     color: "text-warning",     bg: "bg-warning/10" },
  // English key actions
  create_customer:  { label: "เพิ่มลูกค้าใหม่",          icon: UserPlus,  color: "text-success",     bg: "bg-success/10" },
  update_customer:  { label: "แก้ไขข้อมูลลูกค้า",        icon: Edit2,     color: "text-warning",     bg: "bg-warning/10" },
  delete_customer:  { label: "ลบข้อมูลลูกค้า",           icon: Trash2,    color: "text-destructive", bg: "bg-destructive/10" },
  create_loan:      { label: "สร้างสัญญาเงินกู้",        icon: FileText,  color: "text-primary",     bg: "bg-primary/10" },
  update_loan:      { label: "แก้ไขสัญญาเงินกู้",        icon: Edit2,     color: "text-warning",     bg: "bg-warning/10" },
  record_payment:   { label: "บันทึกการชำระเงิน",        icon: CreditCard, color: "text-info",       bg: "bg-info/10" },
  delete_payment:   { label: "ลบประวัติการชำระเงิน",     icon: Trash2,    color: "text-destructive", bg: "bg-destructive/10" },
  login:            { label: "เข้าสู่ระบบ",              icon: LogIn,     color: "text-muted-foreground", bg: "bg-muted" },
  signup:           { label: "สมัครสมาชิก",              icon: UserPlus,  color: "text-success",     bg: "bg-success/10" },
};

const ENTITY_LABEL: Record<string, string> = {
  customer: "ลูกค้า",
  loan:     "สัญญาเงินกู้",
  payment:  "การชำระเงิน",
  user:     "ผู้ใช้",
};

function formatRelative(dateStr: any): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "เมื่อกี้";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function ActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getActivityLogs()
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-in fade-in duration-500 space-y-4">
      <PageHeader
        title="บันทึกกิจกรรม"
        description="รายการการกระทำล่าสุดในระบบทั้งหมด"
      />

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden pb-10">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">กำลังโหลด...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Activity className="h-10 w-10 opacity-20" />
            <p className="text-sm">ยังไม่มีกิจกรรมในระบบ</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const cfg =
                ACTION_CONFIG[log.action] ?? {
                  label: log.action.replace(/_/g, " "),
                  icon: Activity,
                  color: "text-muted-foreground",
                  bg: "bg-muted",
                };
              const Icon = cfg.icon;
              const details = log.details
                ? typeof log.details === "string"
                  ? JSON.parse(log.details)
                  : log.details
                : null;

              return (
                <li
                  key={log.id}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-muted/5 transition-colors"
                >
                  {/* Icon */}
                  <div
                    className={`shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${cfg.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-foreground">
                        {cfg.label}
                      </p>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatRelative(log.createdAt)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        โดย{" "}
                        <span className="font-semibold text-primary">
                          {log.userName || "ระบบ"}
                        </span>
                      </span>
                      {log.entityType && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {ENTITY_LABEL[log.entityType] ?? log.entityType}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    {details && Object.keys(details).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(details).map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            <span className="font-semibold text-foreground/70">{k}:</span>{" "}
                            {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
