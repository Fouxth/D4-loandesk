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

import { useTranslation } from "react-i18next";

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
  { labelTH: string; labelEN: string; icon: any; color: string; bg: string }
> = {
  "สร้างลูกค้าใหม่":   { labelTH: "สร้างลูกค้าใหม่", labelEN: "Create New Customer", icon: UserPlus,  color: "text-success", bg: "bg-success/10" },
  "สร้างสัญญาเงินกู้": { labelTH: "สร้างสัญญาเงินกู้", labelEN: "Create Loan Agreement", icon: FileText,  color: "text-primary", bg: "bg-primary/10" },
  "รับชำระเงิน":       { labelTH: "รับชำระเงิน", labelEN: "Record Payment", icon: CreditCard, color: "text-info", bg: "bg-info/10" },
  "อัปเดตสถานะสัญญา": { labelTH: "อัปเดตสถานะสัญญา", labelEN: "Update Loan Status", icon: Edit2, color: "text-warning", bg: "bg-warning/10" },
  create_customer:  { labelTH: "เพิ่มลูกค้าใหม่", labelEN: "Add Customer", icon: UserPlus, color: "text-success", bg: "bg-success/10" },
  update_customer:  { labelTH: "แก้ไขข้อมูลลูกค้า", labelEN: "Update Customer", icon: Edit2, color: "text-warning", bg: "bg-warning/10" },
  delete_customer:  { labelTH: "ลบข้อมูลลูกค้า", labelEN: "Delete Customer", icon: Trash2, color: "text-destructive", bg: "bg-destructive/10" },
  create_loan:      { labelTH: "สร้างสัญญาเงินกู้", labelEN: "Create Loan", icon: FileText, color: "text-primary", bg: "bg-primary/10" },
  update_loan:      { labelTH: "แก้ไขสัญญาเงินกู้", labelEN: "Update Loan", icon: Edit2, color: "text-warning", bg: "bg-warning/10" },
  update_loan_promise_date: { labelTH: "เลื่อน / กำหนดวันนัดจ่าย", labelEN: "Update Promise Date", icon: Edit2, color: "text-primary", bg: "bg-primary/10" },
  delete_loan:      { labelTH: "ลบสัญญาเงินกู้", labelEN: "Delete Loan", icon: Trash2, color: "text-destructive", bg: "bg-destructive/10" },
  refinance_loan:   { labelTH: "ต่อสัญญา / เพิ่มต้น", labelEN: "Refinance Loan", icon: Edit2, color: "text-primary", bg: "bg-primary/10" },
  adjust_late_fee:  { labelTH: "ปรับแต่งค่าปรับ", labelEN: "Adjust Late Fee", icon: Edit2, color: "text-warning", bg: "bg-warning/10" },
  record_payment:   { labelTH: "บันทึกการชำระเงิน", labelEN: "Record Payment", icon: CreditCard, color: "text-info", bg: "bg-info/10" },
  delete_payment:   { labelTH: "ลบประวัติการชำระเงิน", labelEN: "Delete Payment", icon: Trash2, color: "text-destructive", bg: "bg-destructive/10" },
  create_expense:   { labelTH: "บันทึกค่าใช้จ่าย", labelEN: "Record Expense", icon: FileText, color: "text-warning", bg: "bg-warning/10" },
  delete_expense:   { labelTH: "ลบค่าใช้จ่าย", labelEN: "Delete Expense", icon: Trash2, color: "text-destructive", bg: "bg-destructive/10" },
  update_settings:  { labelTH: "อัปเดตการตั้งค่าระบบ", labelEN: "Update Settings", icon: Edit2, color: "text-primary", bg: "bg-primary/10" },
  login:            { labelTH: "เข้าสู่ระบบ", labelEN: "User Login", icon: LogIn, color: "text-muted-foreground", bg: "bg-muted" },
  signup:           { labelTH: "สมัครสมาชิก", labelEN: "Sign Up", icon: UserPlus, color: "text-success", bg: "bg-success/10" },
};

const ENTITY_LABEL: Record<string, { th: string; en: string }> = {
  customer: { th: "ลูกค้า", en: "Customer" },
  loan:     { th: "สัญญาเงินกู้", en: "Loan" },
  payment:  { th: "การชำระเงิน", en: "Payment" },
  expense:  { th: "ค่าใช้จ่าย", en: "Expense" },
  settings: { th: "ตั้งค่า", en: "Settings" },
  user:     { th: "ผู้ใช้", en: "User" },
};

function formatExactDateTime(dateStr: any, isEN: boolean): string {
  if (!dateStr) return isEN ? "Earlier" : "ก่อนหน้านี้";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return isEN ? "Earlier" : "ก่อนหน้านี้";
  
  if (isEN) {
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedTime = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${formattedDate} at ${formattedTime}`;
  }

  const thaiDate = date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const thaiTime = date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${thaiDate} ${thaiTime} น.`;
}

function formatRelative(dateStr: any, isEN: boolean): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 0 || diff < 60) return isEN ? "Just now" : "เมื่อกี้";
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return isEN ? `${mins} min${mins > 1 ? 's' : ''} ago` : `${mins} นาทีที่แล้ว`;
  }
  if (diff < 86400) {
    const hrs = Math.floor(diff / 3600);
    return isEN ? `${hrs} hour${hrs > 1 ? 's' : ''} ago` : `${hrs} ชั่วโมงที่แล้ว`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return isEN ? `${days} day${days > 1 ? 's' : ''} ago` : `${days} วันที่แล้ว`;
  }
  return "";
}

function ActivityPage() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language?.startsWith('en');
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
        title={t('activity.title', 'บันทึกกิจกรรม')}
        description={t('activity.description', 'รายการการกระทำล่าสุดในระบบทั้งหมด')}
      />

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden pb-10">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">{t('common.loading', 'กำลังโหลด...')}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Activity className="h-10 w-10 opacity-20" />
            <p className="text-sm">{t('activity.no_logs', 'ยังไม่มีกิจกรรมในระบบ')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const cfg =
                ACTION_CONFIG[log.action] ?? {
                  labelTH: log.action.replace(/_/g, " "),
                  labelEN: log.action.replace(/_/g, " "),
                  icon: Activity,
                  color: "text-muted-foreground",
                  bg: "bg-muted",
                };
              const actionLabel = isEN ? cfg.labelEN : cfg.labelTH;
              const Icon = cfg.icon;
              const details = log.details
                ? typeof log.details === "string"
                  ? JSON.parse(log.details)
                  : log.details
                : null;

              const entityTypeKey = log.entityType || log.entity_type;
              const entityLabel = entityTypeKey
                ? isEN
                  ? ENTITY_LABEL[entityTypeKey]?.en ?? entityTypeKey
                  : ENTITY_LABEL[entityTypeKey]?.th ?? entityTypeKey
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
                        {actionLabel}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        <span className="font-semibold text-foreground/80">
                          {formatExactDateTime(log.createdAt || log.created_at, isEN)}
                        </span>
                        {formatRelative(log.createdAt || log.created_at, isEN) && (
                          <span className="text-muted-foreground font-normal">
                            ({formatRelative(log.createdAt || log.created_at, isEN)})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {isEN ? "by" : "โดย"}{" "}
                        <span className="font-semibold text-primary">
                          {log.userName || log.user_name || (isEN ? "System" : "ระบบ")}
                        </span>
                      </span>
                      {entityLabel && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {entityLabel}
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
