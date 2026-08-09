import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getTenants, generateTenant, updateTenantStatus } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ShieldAlert,
  Sparkles,
  Key,
  CheckCircle,
  Copy,
  Users,
  FileText,
  Plus,
  Clock,
  Store,
  Loader2,
  LogOut,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";

export const Route = createFileRoute("/super-admin")({
  component: SuperAdminPage,
});

interface TenantInfo {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  ownerUsername: string;
  customerCount: number;
  loanCount: number;
}

interface TenantGeneratedData {
  tenantId: string;
  tenantName: string;
  username: string;
  defaultPassword: string;
}

// ─── Custom Confirm Modal ────────────────────────────────────────────────────
interface ConfirmModalProps {
  open: boolean;
  tenant: TenantInfo | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmToggleModal({ open, tenant, onConfirm, onCancel, loading }: ConfirmModalProps) {
  if (!open || !tenant) return null;

  const willSuspend = tenant.isActive; // toggling active → suspended

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(6px)" }}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
        {/* Accent top bar */}
        <div
          className={`h-1 w-full ${
            willSuspend
              ? "bg-gradient-to-r from-rose-500 via-orange-500 to-rose-600"
              : "bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600"
          }`}
        />

        {/* Close btn */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-4 px-7 py-7 text-center">
          {/* Icon */}
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ring-4 ${
              willSuspend
                ? "bg-rose-500/10 ring-rose-500/20 text-rose-500"
                : "bg-emerald-500/10 ring-emerald-500/20 text-emerald-500"
            }`}
          >
            {willSuspend ? (
              <AlertTriangle className="h-7 w-7" />
            ) : (
              <ToggleRight className="h-7 w-7" />
            )}
          </div>

          {/* Title */}
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {willSuspend ? "ระงับการใช้งานร้านค้า?" : "เปิดใช้งานร้านค้า?"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              ร้านค้า:{" "}
              <span className="font-semibold text-foreground">{tenant.name}</span>
            </p>
          </div>

          {/* Warning (only when suspending) */}
          {willSuspend && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-left text-sm text-rose-600 dark:text-rose-400 w-full">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                ผู้ใช้งานทั้งหมดของร้านนี้จะถูก
                <span className="font-bold">เตะออกจากระบบทันที</span>{" "}
                และจะเข้าระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full mt-1">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl"
            >
              ยกเลิก
            </Button>
            <Button
              id="confirm-toggle-btn"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 rounded-xl font-semibold text-white shadow-md ${
                willSuspend
                  ? "bg-rose-500 hover:bg-rose-600"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : willSuspend ? (
                <>
                  <ToggleLeft className="h-4 w-4 mr-1.5" /> ระงับเลย
                </>
              ) : (
                <>
                  <ToggleRight className="h-4 w-4 mr-1.5" /> เปิดใช้งาน
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
function SuperAdminPage() {
  const { user, roles, loading, signOut } = useAuth();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [creditorName, setCreditorName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<TenantGeneratedData | null>(null);

  // Confirmation modal state
  const [confirmTarget, setConfirmTarget] = useState<TenantInfo | null>(null);
  const [toggling, setToggling] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadTenantsList = async () => {
    try {
      setLoadingTenants(true);
      const res = await getTenants();
      if (res.success) setTenants(res.data || []);
    } catch (e: any) {
      console.error(e);
      toast.error("ไม่สามารถดึงข้อมูลร้านค้าได้");
    } finally {
      setLoadingTenants(false);
    }
  };

  useEffect(() => {
    if (user && user.tenantId === "system") loadTenantsList();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSuperAdmin =
    user && user.tenantId === "system" && roles.includes("admin");
  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4 backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-destructive">ปฏิเสธการเข้าถึง</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ขออภัย หน้าจอนี้สำหรับผู้ดูแลระบบสูงสุด (Super Admin) ของ D4-LoanDesk
            เท่านั้น บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้
          </p>
          <Button
            onClick={() => (window.location.href = "/")}
            className="w-full mt-2"
          >
            กลับไปหน้าหลัก
          </Button>
        </div>
      </div>
    );
  }

  // Open the custom confirm modal instead of window.confirm()
  const handleToggleClick = (tenant: TenantInfo) => {
    if (tenant.id === "system") return;
    setConfirmTarget(tenant);
  };

  // Actually execute the toggle after modal confirmation
  const handleConfirmToggle = async () => {
    if (!confirmTarget) return;
    const newStatus = !confirmTarget.isActive;
    setToggling(true);
    try {
      const res = await updateTenantStatus(confirmTarget.id, newStatus);
      if (res.success) {
        toast.success(
          newStatus
            ? "เปิดใช้งานระบบของร้านค้าแล้ว"
            : "ระงับการใช้งานระบบของร้านค้าแล้ว"
        );
        setConfirmTarget(null);
        loadTenantsList();
      } else {
        toast.error(res.error || "ไม่สามารถปรับเปลี่ยนสถานะได้");
      }
    } catch (e: any) {
      toast.error(
        e.response?.data?.error || "เกิดข้อผิดพลาดในการติดต่อเซิร์ฟเวอร์"
      );
    } finally {
      setToggling(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditorName.trim())
      return toast.error("กรุณาระบุชื่อเจ้าหนี้หรือชื่อร้านค้า");
    setGenerating(true);
    try {
      const res = await generateTenant(creditorName);
      if (res.success && res.data) {
        setGeneratedData(res.data);
        toast.success("สร้างระบบเจ้าหนี้ใหม่เรียบร้อยแล้ว!");
        loadTenantsList();
        setCreditorName("");
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการสร้างระบบ");
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "เกิดข้อผิดพลาดในการติดต่อเซิร์ฟเวอร์"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!generatedData) return;
    const textToCopy = `ชื่อร้านค้า: ${generatedData.tenantName}\nชื่อผู้ใช้งาน: ${generatedData.username}\nรหัสผ่านเริ่มต้น: ${generatedData.defaultPassword}`;
    navigator.clipboard.writeText(textToCopy);
    toast.success("คัดลอกข้อมูลบัญชีเรียบร้อยแล้ว!");
  };

  return (
    <>
      {/* Custom Confirmation Modal — rendered outside normal flow */}
      <ConfirmToggleModal
        open={!!confirmTarget}
        tenant={confirmTarget}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmTarget(null)}
        loading={toggling}
      />

      <div className="min-h-screen bg-background text-foreground pb-12">
        {/* Header */}
        <div className="relative overflow-hidden bg-primary/5 border-b border-border py-8 px-4 sm:px-6 lg:px-8">
          <div className="absolute top-0 right-0 h-40 w-[400px] rounded-full bg-primary/10 blur-3xl" />
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
                Super Admin Console
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                แผงควบคุมระบบเครือข่ายเจ้าหนี้และออกร้านค้าอัตโนมัติ (SaaS
                Management)
              </p>
            </div>
             <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-xl text-xs text-muted-foreground w-fit animate-in fade-in duration-300">
                <span className={`h-2 w-2 rounded-full ${loadingTenants ? "bg-yellow-500" : tenants.length > 0 ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                {loadingTenants ? "กำลังตรวจสอบการเชื่อมต่อ..." : tenants.length > 0 ? "เชื่อมต่อกับ PostgreSQL สำเร็จ" : "การเชื่อมต่อ PostgreSQL มีปัญหา"}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                }}
                className="text-xs font-bold text-red-500 hover:bg-red-500/10 hover:text-red-600 active:scale-95 transition-all gap-1.5 h-9 rounded-xl px-4 border border-red-500/20 shadow-sm bg-card cursor-pointer"
              >
                {signingOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                {signingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Create Form */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-indigo-500/10 to-primary/5 rounded-bl-full" />
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Plus className="h-5 w-5 text-primary" /> เปิดระบบเจ้าหนี้รายใหม่
              </h2>

              {!generatedData ? (
                <form onSubmit={handleGenerate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="super-creditor-name">
                      ชื่อร้านค้า / ชื่อเจ้าหนี้ (ภาษาไทย หรือ อังกฤษ)
                    </Label>
                    <Input
                      id="super-creditor-name"
                      placeholder="เช่น สมชาย เงินด่วน, เฮียหมู แคปปิตอล"
                      required
                      value={creditorName}
                      onChange={(e) => setCreditorName(e.target.value)}
                      className="bg-muted/30 py-5"
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      * พิมพ์เฉพาะชื่อร้านกู้ ระบบจะนำไปแปลงเป็นคาราโอเกะภาษาอังกฤษสำหรับ
                      URL และ Gen บัญชีให้อัตโนมัติในพริบตา
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full py-5 text-sm font-semibold shadow-md bg-gradient-to-r from-primary to-indigo-600 hover:opacity-95 text-white"
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    สร้างระบบกู้เงินทันที
                  </Button>
                </form>
              ) : (
                <div className="space-y-4 animate-in zoom-in-95 duration-300">
                  <div className="text-center space-y-1">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-green-600 dark:text-green-400">
                      สร้างสำเร็จแล้ว!
                    </h3>
                  </div>
                  <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 space-y-3 relative">
                    <div className="absolute top-2 right-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={handleCopyCredentials}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-y-2 text-xs">
                      <span className="text-muted-foreground">ชื่อร้านกู้:</span>
                      <span className="col-span-2 font-semibold">
                        {generatedData.tenantName}
                      </span>
                      <span className="text-muted-foreground">ชื่อผู้ใช้:</span>
                      <span className="col-span-2 font-mono font-bold text-primary">
                        {generatedData.username}
                      </span>
                      <span className="text-muted-foreground">รหัสผ่าน:</span>
                      <span className="col-span-2 font-mono bg-yellow-100 dark:bg-yellow-950 px-2 py-0.5 rounded text-yellow-800 dark:text-yellow-200 font-bold inline-flex items-center gap-1 w-max">
                        <Key className="h-3 w-3" /> {generatedData.defaultPassword}
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={() => setGeneratedData(null)}
                    className="w-full py-4 text-xs font-semibold"
                    variant="outline"
                  >
                    สร้างเพิ่มอีกร้าน
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Tenant List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Store className="h-5 w-5 text-indigo-500" /> บัญชีเจ้าหนี้ที่เปิดใช้งานอยู่ (
                  {tenants.length})
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-primary"
                  onClick={loadTenantsList}
                  disabled={loadingTenants}
                >
                  {loadingTenants ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "รีเฟรชรายการ"
                  )}
                </Button>
              </div>

              {loadingTenants ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    กำลังดาวน์โหลดข้อมูลร้านค้า...
                  </p>
                </div>
              ) : tenants.length === 0 ? (
                <div className="py-20 text-center space-y-2">
                  <Store className="mx-auto h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-muted-foreground">
                    ยังไม่มีเจ้าหนี้รายอื่นลงทะเบียน
                  </p>
                  <p className="text-xs text-muted-foreground">
                    คุณสามารถป้อนชื่อเจ้าหนี้ฝั่งซ้ายเพื่อสร้างบัญชีใหม่ได้ทันที
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-3 font-semibold">ชื่อร้านค้า (เจ้าหนี้)</th>
                        <th className="pb-3 font-semibold">ชื่อผู้ใช้ล็อกอิน</th>
                        <th className="pb-3 font-semibold text-center">ลูกค้า</th>
                        <th className="pb-3 font-semibold text-center">สัญญากู้</th>
                        <th className="pb-3 font-semibold text-center">สถานะระบบ</th>
                        <th className="pb-3 font-semibold text-right">วันที่สร้าง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {tenants.map((t) => (
                        <tr
                          key={t.id}
                          className="hover:bg-muted/20 transition-colors group"
                        >
                          <td className="py-4 font-semibold text-foreground">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                {t.name.slice(0, 2)}
                              </div>
                              <div>
                                <span className="block">{t.name}</span>
                                <span className="block text-[10px] font-mono text-muted-foreground">
                                  {t.id}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 font-mono font-bold text-xs text-primary">
                            {t.ownerUsername || "-"}
                          </td>
                          <td className="py-4 text-center font-semibold">
                            <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-xs">
                              <Users className="h-3 w-3" /> {t.customerCount}
                            </span>
                          </td>
                          <td className="py-4 text-center font-semibold">
                            <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded text-xs">
                              <FileText className="h-3 w-3" /> {t.loanCount}
                            </span>
                          </td>
                          <td className="py-4 text-center">
                            {t.id === "system" ? (
                              <span className="inline-flex items-center bg-muted border border-border/80 px-2 py-0.5 rounded text-[10px] text-muted-foreground font-bold tracking-wider uppercase">
                                ระบบหลัก
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                id={`toggle-tenant-${t.id}`}
                                onClick={() => handleToggleClick(t)}
                                className={`h-7 px-3 text-[10px] font-bold rounded-xl shadow-sm transition-all duration-300 gap-1.5 ${
                                  t.isActive
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    t.isActive
                                      ? "bg-emerald-500 animate-pulse"
                                      : "bg-rose-500"
                                  }`}
                                />
                                {t.isActive ? "เปิดใช้งาน" : "ระงับการใช้งาน"}
                              </Button>
                            )}
                          </td>
                          <td className="py-4 text-right text-xs text-muted-foreground font-mono">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(t.createdAt).toLocaleDateString("th-TH", {
                                year: "2-digit",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
