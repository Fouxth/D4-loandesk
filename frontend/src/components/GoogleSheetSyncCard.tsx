import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Upload,
  PlusCircle,
  Sparkles,
  ExternalLink,
  Save,
  Check,
  Layers,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { formatTHB } from "@/utils/format";
import {
  getGoogleSyncConfig,
  saveGoogleSyncConfig,
  auditGoogleSheet,
  applyGoogleSheetSync,
} from "@/lib/services";
import { cn } from "@/utils/utils";

const DEFAULT_SAMPLE_URL =
  "https://docs.google.com/spreadsheets/d/1dckaK-aiQni4ILj9dV9-ZjITVjN3ifUm/edit?usp=sharing";

export function GoogleSheetSyncCard() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [skipClosed, setSkipClosed] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [file, setFile] = useState<File | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [auditData, setAuditData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"mismatched" | "new" | "synced" | "dbOnly" | "skipped">("mismatched");
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Load saved configuration on mount
  useEffect(() => {
    getGoogleSyncConfig()
      .then((cfg) => {
        if (cfg) {
          setSheetUrl(cfg.sheetUrl || DEFAULT_SAMPLE_URL);
          if (cfg.skipClosed !== undefined) setSkipClosed(cfg.skipClosed);
          if (cfg.defaultYear) setSelectedYear(String(cfg.defaultYear));
          if (cfg.lastSyncAt) setLastSyncTime(cfg.lastSyncAt);
        }
      })
      .catch((e) => console.error("Failed to load sync config", e))
      .finally(() => setLoadingConfig(false));
  }, []);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await saveGoogleSyncConfig({
        sheetUrl,
        skipClosed,
        defaultYear: selectedYear === "all" ? undefined : parseInt(selectedYear, 10),
      });
      toast.success("บันทึกการตั้งค่า Google Sheets เริ่มต้นแล้ว");
    } catch (e: any) {
      toast.error(e.response?.data?.error || "ไม่สามารถบันทึกการตั้งค่าได้");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunAudit = async () => {
    if (!sheetUrl && !file) {
      toast.error("กรุณาระบุ URL ของ Google Sheets หรือเลือกไฟล์ Excel");
      return;
    }

    setAuditing(true);
    try {
      const res = await auditGoogleSheet({
        sheetUrl: file ? undefined : sheetUrl,
        file: file || undefined,
        beYear: selectedYear === "all" ? undefined : parseInt(selectedYear, 10),
        skipClosed,
      });
      setAuditData(res);

      if (res.mismatchedLoans?.length > 0) {
        setActiveTab("mismatched");
      } else if (res.newLoans?.length > 0) {
        setActiveTab("new");
      } else {
        setActiveTab("synced");
      }

      toast.success("ตรวจเช็คข้อมูลเรียบร้อยแล้ว");
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || "เกิดข้อผิดพลาดในการตรวจสอบ Google Sheets");
    } finally {
      setAuditing(false);
    }
  };

  const handleApplySync = async () => {
    setSyncing(true);
    try {
      const res = await applyGoogleSheetSync({
        sheetUrl: file ? undefined : sheetUrl,
        file: file || undefined,
        beYear: selectedYear === "all" ? undefined : parseInt(selectedYear, 10),
        skipClosed,
      });

      toast.success(
        `ซิงค์ข้อมูลสำเร็จ! เพิ่มลูกค้า ${res.summary.customersCreated} คน, สัญญาใหม่ ${res.summary.loansCreated} สัญญา, เติมงวดชำระ ${res.summary.paymentsCreated} รายการ`,
      );
      setConfirmOpen(false);
      setLastSyncTime(new Date().toISOString());

      // Re-run audit to show fresh synced status
      await handleRunAudit();
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || "เกิดข้อผิดพลาดในการซิงค์ข้อมูล");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Description Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-foreground">ตรวจเช็คและซิงค์ข้อมูล Google Sheets</h3>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Auto-Reconcile
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                ดึงข้อมูลจากสมุดบัญชีเงินกู้บน Google Sheets เพื่อเปรียบเทียบ ตรวจสอบความถูกต้อง และเติมยอดชำระเงินอัตโนมัติ
              </p>
            </div>
          </div>

          {lastSyncTime && (
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-xl border border-border/50 self-start md:self-auto">
              ซิงค์ล่าสุด: <span className="font-semibold text-foreground">{new Date(lastSyncTime).toLocaleString("th-TH")}</span>
            </div>
          )}
        </div>

        {/* Input & Filters Section */}
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>Google Sheets URL (ลิงก์แชร์สเปรดชีต)</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  *(ต้องเปิดแชร์เป็น "ทุกคนที่มีลิงก์สามารถดูได้")*
                </span>
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveConfig}
                disabled={savingConfig || loadingConfig}
                className="h-7 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
              >
                <Save className="h-3 w-3" />
                {savingConfig ? "กำลังบันทึก..." : "บันทึกเป็นค่าเริ่มต้น"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="font-mono text-xs rounded-xl"
              />
              {sheetUrl && (
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl"
                  asChild
                  title="เปิดดูใน Google Sheets"
                >
                  <a href={sheetUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Option Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/40">
            {/* Skip Closed / Black highlight toggle */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground">ข้ามสัญญาที่คุมดำ (ปิดแล้ว)</span>
                  <span className="h-2 w-2 rounded-full bg-black border border-muted-foreground/30 inline-block" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  ไม่นำเข้าแถวที่คุมแถบสีดำ (นำเข้าเฉพาะสัญญาที่ยังเปิดอยู่)
                </p>
              </div>
              <Switch checked={skipClosed} onCheckedChange={setSkipClosed} />
            </div>

            {/* Year Selector */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">กรองเฉพาะปี พ.ศ.</span>
                <p className="text-[10px] text-muted-foreground">เลือกช่วงปีของสัญญา</p>
              </div>
              <div className="flex rounded-lg bg-background p-0.5 border border-border/60 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedYear("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-all",
                    selectedYear === "all" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedYear("69")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-all",
                    selectedYear === "69" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  ปี 69
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedYear("68")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-all",
                    selectedYear === "68" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  ปี 68
                </button>
              </div>
            </div>

            {/* Upload File Alternative */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 border border-border/40">
              <div className="space-y-0.5 min-w-0 pr-2">
                <span className="text-xs font-bold text-foreground">หรืออัปโหลดไฟล์ (.xlsx)</span>
                <p className="text-[10px] text-muted-foreground truncate">
                  {file ? file.name : "ใช้แทน URL ได้"}
                </p>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setFile(e.target.files[0]);
                  }}
                />
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-bold hover:bg-muted text-foreground transition-all">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  {file ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
                </span>
              </label>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Button
              onClick={handleRunAudit}
              disabled={auditing || syncing}
              className="w-full sm:w-auto h-10 px-5 font-bold rounded-xl gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20"
            >
              <RefreshCw className={cn("h-4 w-4", auditing && "animate-spin")} />
              {auditing ? "กำลังดึงข้อมูลและตรวจเช็ค..." : "ตรวจเช็คและเปรียบเทียบข้อมูล (Run Audit)"}
            </Button>

            {auditData && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={syncing || auditing}
                variant="default"
                className="w-full sm:w-auto h-10 px-5 font-bold rounded-xl gap-2 bg-primary text-primary-foreground shadow-md"
              >
                <Sparkles className="h-4 w-4" />
                ซิงค์ข้อมูลเข้าสู่ระบบทันที (Sync Now)
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Audit Results Dashboard */}
      {auditData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs text-center">
              <span className="text-[11px] font-bold text-muted-foreground block">สัญญาใน Sheet ทั้งหมด</span>
              <span className="text-xl font-black text-foreground mt-0.5 block">
                {auditData.summary.totalInSheet.toLocaleString()}
              </span>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs text-center bg-zinc-900/5 dark:bg-zinc-800/30">
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] font-bold text-muted-foreground">คุมดำ (ปิดยอดแล้ว)</span>
                <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-zinc-400" />
              </div>
              <span className="text-xl font-black text-muted-foreground mt-0.5 block">
                {auditData.summary.blackRowsCount.toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
                {skipClosed ? "✓ ข้ามไม่นำเข้า" : "นำเข้าด้วย"}
              </span>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3.5 shadow-xs text-center">
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block">
                สัญญาที่จะนำเข้า (Active)
              </span>
              <span className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5 block">
                {auditData.summary.totalActiveInSheet.toLocaleString()}
              </span>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 shadow-xs text-center">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block">
                ต้องเติมงวด / อัปเดต
              </span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5 block">
                {auditData.summary.mismatchedCount.toLocaleString()}
              </span>
            </div>

            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 shadow-xs text-center">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block">สัญญาใหม่</span>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                {auditData.summary.newLoansCount.toLocaleString()}
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 shadow-xs text-center">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                ตรงกันสมบูรณ์แล้ว
              </span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {auditData.summary.syncedCount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Breakdown by Sheet */}
          {auditData.loansBySheet && Object.keys(auditData.loansBySheet).length > 0 && (
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> สรุปจำนวนสัญญาแยกตามประเภทชีต
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {Object.entries(auditData.loansBySheet).map(([sheet, stats]: [string, any]) => (
                  <div key={sheet} className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                    <span className="text-xs font-black text-foreground truncate block">{sheet}</span>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                      <span>เปิด: <strong className="text-blue-600 font-black">{stats.active}</strong></span>
                      <span>คุมดำ: <strong className="text-muted-foreground font-bold">{stats.black}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab Navigation for Detailed Tables */}
          <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
            <div className="flex items-center gap-1 border-b border-border p-2 bg-muted/30 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab("mismatched")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all",
                  activeTab === "mismatched"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>ต้องเติมงวด / อัปเดต ({auditData.mismatchedLoans.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("new")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all",
                  activeTab === "new"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>สัญญาใหม่ ({auditData.newLoans.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("synced")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all",
                  activeTab === "synced"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>ตรงกันแล้ว ({auditData.syncedLoans.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("dbOnly")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all",
                  activeTab === "dbOnly"
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Database className="h-3.5 w-3.5" />
                <span>ในเว็บที่ไม่มีใน Sheet ({auditData.dbOnlyLoans.length})</span>
              </button>
            </div>

            {/* Tab 1: Mismatched Loans (To Append Payments) */}
            {activeTab === "mismatched" && (
              <div className="p-4 space-y-3">
                {auditData.mismatchedLoans.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-bold">ไม่มีสัญญาที่ข้อมูลคลาดเคลื่อน ทุกสัญญาตรงกันสมบูรณ์</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="text-xs text-muted-foreground font-medium bg-amber-500/10 text-amber-800 dark:text-amber-300 p-2.5 rounded-xl border border-amber-500/20">
                      💡 <strong>สัญญาในกลุ่มนี้มีอยู่ในระบบแล้ว:</strong> เมื่อกดซิงค์ ระบบจะเข้าไป <strong>เติมงวดชำระเงินที่ยังขาดในเว็บ</strong> และปรับปรุงยอดหนี้ให้ตรงกับ Excel โดยไม่สร้างสัญญาซ้ำ
                    </div>

                    {auditData.mismatchedLoans.map((loan: any, idx: number) => {
                      const isExpanded = expandedLoanId === (loan.id || idx.toString());
                      return (
                        <div
                          key={loan.id || idx}
                          className="rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-all p-3.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black text-sm">
                                #{idx + 1}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-foreground">{loan.customerName}</span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    {loan.sourceSheet}
                                  </span>
                                  {loan.loanNumber && (
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      ({loan.loanNumber})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  <span>เริ่ม: <strong>{loan.startDate}</strong></span>
                                  <span>เงินต้น: <strong>{formatTHB(loan.principal)}</strong></span>
                                  <span>ส่งวันละ: <strong>{formatTHB(loan.installmentAmount)}</strong></span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {loan.missingPaymentsCount > 0 && (
                                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                  เติมงวดใหม่ +{loan.missingPaymentsCount} งวด
                                </span>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setExpandedLoanId(isExpanded ? null : loan.id || idx.toString())
                                }
                                className="h-8 text-xs font-bold gap-1"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {isExpanded ? "ซ่อนรายละเอียด" : "ดูงวดที่จะเติม"}
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Diff View */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/50 space-y-2 animate-in fade-in duration-300">
                              {/* Payment Diffs */}
                              {loan.paymentDiffs && loan.paymentDiffs.length > 0 && (
                                <div>
                                  <span className="text-[11px] font-black uppercase text-muted-foreground block mb-1.5">
                                    รายการงวดชำระที่จะบันทึก / ปรับปรุง:
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {loan.paymentDiffs.map((p: any) => (
                                      <div
                                        key={p.installmentNumber}
                                        className={cn(
                                          "p-2 rounded-lg text-xs border flex items-center justify-between",
                                          p.action === "insert"
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                                            : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300",
                                        )}
                                      >
                                        <div>
                                          <span className="font-bold">งวดที่ {p.installmentNumber}</span>
                                          <span className="text-[10px] block opacity-80">{p.date}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="font-black">
                                            {p.category === "roll_penalty" ? "ท+ป" : formatTHB(p.amount)}
                                          </span>
                                          <span className="text-[10px] block font-bold">
                                            {p.action === "insert" ? "(เพิ่มใหม่)" : "(ปรับยอด)"}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: New Loans */}
            {activeTab === "new" && (
              <div className="p-4 space-y-3">
                {auditData.newLoans.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-60" />
                    <p className="text-sm font-bold">ไม่มีสัญญาใหม่ที่จะต้องสร้าง</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditData.newLoans.map((loan: any, idx: number) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border/80 bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                            +{idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-foreground">{loan.customerName}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                {loan.sourceSheet}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>เริ่ม: <strong>{loan.startDate}</strong></span>
                              <span>เงินต้น: <strong>{formatTHB(loan.principal)}</strong></span>
                              <span>ส่งวันละ: <strong>{formatTHB(loan.installmentAmount)}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-right self-end sm:self-auto">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            มีประวัติชำระ {loan.totalPaymentsInSheet} งวด
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Synced Loans */}
            {activeTab === "synced" && (
              <div className="p-4 space-y-3">
                {auditData.syncedLoans.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <p className="text-sm font-bold">ยังไม่มีสัญญาที่ตรงกัน 100%</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {auditData.syncedLoans.map((loan: any, idx: number) => (
                      <div
                        key={loan.id || idx}
                        className="rounded-xl border border-border/60 bg-muted/10 p-3 flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="text-xs font-black text-foreground truncate">
                              {loan.customerName}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            ต้น {formatTHB(loan.principal)} • ผ่อน {loan.totalPaymentsInDb} งวด
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md shrink-0">
                          ตรงกัน
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: DB Only Loans */}
            {activeTab === "dbOnly" && (
              <div className="p-4 space-y-3">
                <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border/50">
                  ℹ️ สัญญาในรายการนี้มีอยู่ในระบบ D4-LoanDesk แต่ไม่พบใน Sheet ที่ตรวจเช็ค <strong>(ระบบจะไม่ลบสัญญาเหล่านี้ ข้อมูลจะยังคงอยู่ปลอดภัย 100%)</strong>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {auditData.dbOnlyLoans.map((loan: any) => (
                    <div
                      key={loan.id}
                      className="rounded-xl border border-border/60 bg-muted/10 p-3 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-black text-foreground block">{loan.customerName}</span>
                        <span className="text-[10px] text-muted-foreground block">
                          {loan.loanNumber} • ต้น {formatTHB(loan.principal)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {loan.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog before Sync */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <Sparkles className="h-5 w-5 text-primary" />
              ยืนยันการซิงค์ข้อมูล Google Sheets
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              ระบบจะนำข้อมูลจาก Google Sheets เข้าสู่ระบบ D4-LoanDesk ตามสรุปดังนี้:
            </DialogDescription>
          </DialogHeader>

          {auditData && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl bg-muted/50 p-3 space-y-2 text-xs font-medium">
                <div className="flex justify-between">
                  <span>สัญญาใหม่ที่จะถูกสร้าง:</span>
                  <strong className="text-indigo-600 font-bold">{auditData.summary.newLoansCount} สัญญา</strong>
                </div>
                <div className="flex justify-between">
                  <span>สัญญาที่จะเติมงวดชำระ / อัปเดต:</span>
                  <strong className="text-amber-600 font-bold">{auditData.summary.mismatchedCount} สัญญา</strong>
                </div>
                <div className="flex justify-between">
                  <span>สัญญาที่คุมดำ (ข้ามการนำเข้า):</span>
                  <strong className="text-muted-foreground font-bold">{auditData.summary.blackRowsCount} สัญญา</strong>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                *การซิงค์จะไม่ลบข้อมูลสัญญาเดิมที่มีอยู่ในเว็บ แต่จะเติมงวดการชำระเงินให้สมบูรณ์*
              </p>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={syncing}
              className="rounded-xl font-bold text-xs"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleApplySync}
              disabled={syncing}
              className="rounded-xl font-bold text-xs bg-primary text-primary-foreground gap-1.5"
            >
              {syncing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> กำลังซิงค์ข้อมูล...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> ยืนยันการซิงค์
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
