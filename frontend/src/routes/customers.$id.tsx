import { getCustomerById, getLoansByCustomer, getPayments, getCustomerAttachments } from "@/lib/services";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, loanStatusTone, getEffectiveStatus, getLoanStatusLabel } from "@/components/StatusBadge";
import { formatTHB, formatDate } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, FileText, Paperclip, Pencil, Star, Sparkles } from "lucide-react";
import { EditLoanModal } from "@/components/EditLoanModal";
import { calcCustomerCreditProfile } from "@/utils/creditScore";
import { CreditScoreBadge } from "@/components/CreditScoreBadge";
import { cn } from "@/utils/utils";

export const Route = createFileRoute("/customers/$id")({
  component: () => (
    <ProtectedRoute><AppLayout><Detail /></AppLayout></ProtectedRoute>
  ),
});

function resolveFileUrl(filePath?: string | null) {
  if (!filePath) return "";
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '').replace(/\/api$/, '') ?? '';
  return `${apiBase}/${filePath}`;
}

function isImageFileName(name: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(name);
}

function Detail() {
  const { id } = Route.useParams();
  const [c, setC] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const load = async () => {
    try {
      const cust = await getCustomerById(id);
      setC(cust);
      const ls = await getLoansByCustomer(id);
      setLoans(ls ?? []);

      // Get all payments for this customer's loans
      const allPayments = await getPayments();
      const customerPayments = allPayments.filter((p: any) => ls.some((l: any) => l.id === p.loanId));
      setPayments(customerPayments);

      const atts = await getCustomerAttachments(id);
      setAttachments(atts ?? []);
    } catch (e) {
      console.error("Failed to load customer details", e);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const creditProfile = useMemo(() => {
    if (!c) return null;
    return calcCustomerCreditProfile(c, loans, payments);
  }, [c, loans, payments]);

  if (!c || !creditProfile) return <div className="flex h-64 items-center justify-center text-muted-foreground animate-pulse">กำลังโหลดข้อมูลลูกค้า...</div>;

  const outstanding = loans.reduce((sum, l) => {
    const paid = payments.filter((p) => p.loanId === l.id).reduce((a, p) => a + Number(p.amount), 0);
    return l.status !== "completed" && l.status !== "cancelled" ? sum + Math.max(Number(l.totalPayable) - paid, 0) : sum;
  }, 0);

  return (
    <div className="animate-in fade-in duration-500 pb-16">
      <Link to="/customers">
        <Button variant="ghost" size="sm" className="mb-4 hover:bg-muted">
          <ArrowLeft className="mr-1 h-4 w-4" />ย้อนกลับ
        </Button>
      </Link>
      <PageHeader
        title={c.fullName}
        description={c.phone || "ไม่มีเบอร์โทรศัพท์"}
        actions={
          <CreditScoreBadge profile={creditProfile} size="md" showScore />
        }
      />

      {/* Credit Scoring & Intelligence Card */}
      <div className="rounded-2xl border border-primary/30 bg-card p-5 sm:p-6 shadow-[var(--shadow-elevated)] mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-primary/15 flex items-center justify-center text-primary">
              <Star className="h-6 w-6 fill-primary/30 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-foreground">การประเมินเครดิตและประวัติการผ่อนชำระ</h3>
                <CreditScoreBadge profile={creditProfile} size="sm" showScore />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                ประเมินจากประวัติทั้งหมด {creditProfile.totalLoansCount} สัญญา (สำเร็จแล้ว {creditProfile.completedLoansCount} สัญญา)
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl">
            <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-300">
              วงเงินที่แนะนำสำหรับกู้ครั้งถัดไป
            </p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {creditProfile.recommendedNextCreditLimit > 0 ? formatTHB(creditProfile.recommendedNextCreditLimit) : "ไม่แนะนำให้ปล่อยกู้เพิ่ม"}
            </p>
          </div>
        </div>

        {/* 4 Score Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground font-bold">อัตราจ่ายตรงเวลา</p>
            <p className="text-lg font-black text-foreground mt-0.5">{creditProfile.onTimePaymentRate}%</p>
            <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${creditProfile.onTimePaymentRate}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground font-bold">ประวัติทบดอก (ท+ป)</p>
            <p className={cn("text-lg font-black mt-0.5", creditProfile.rollPenaltyCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
              {creditProfile.rollPenaltyCount} ครั้ง
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {creditProfile.rollPenaltyCount === 0 ? "ไม่เคยขอทบ" : "มีการขอผลัด/ทบดอก"}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground font-bold">ปิดยอดสำเร็จแล้ว</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{creditProfile.completedLoansCount} สัญญา</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              จากทั้งหมด {creditProfile.totalLoansCount} สัญญา
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground font-bold">ยอดเงินกู้สะสม</p>
            <p className="text-lg font-black text-foreground mt-0.5">{formatTHB(creditProfile.totalBorrowedAmount)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              คืนแล้ว {formatTHB(creditProfile.totalRepaidAmount)}
            </p>
          </div>
        </div>

        {/* AI Credit Advice Box */}
        <div className="rounded-xl bg-muted/40 border border-border/80 p-3.5 space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-foreground">
                <span className="text-muted-foreground">ผลวิเคราะห์:</span> {creditProfile.analysis}
              </p>
              <p className="text-muted-foreground">
                <span className="font-bold text-foreground">คำแนะนำ:</span> {creditProfile.recommendation}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 pb-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">ข้อมูลส่วนตัว</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">ระดับความเสี่ยง</dt>
              <dd>
                <StatusBadge tone={c.riskLevel === "high" ? "destructive" : c.riskLevel === "medium" ? "warning" : "success"}>
                  {c.riskLevel === 'high' ? 'สูง' : c.riskLevel === 'medium' ? 'กลาง' : 'ต่ำ'}
                </StatusBadge>
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">เลขบัตรประชาชน</dt>
              <dd className="font-mono font-medium">{c.idCard || "—"}</dd>
            </div>
            <div className="flex justify-between items-start gap-4">
              <dt className="text-muted-foreground shrink-0">ที่อยู่</dt>
              <dd className="text-right text-foreground">{c.address || "—"}</dd>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-3">
              <dt className="text-muted-foreground font-bold">ยอดเงินคงค้างรวม</dt>
              <dd className="font-black text-lg text-primary">{formatTHB(outstanding)}</dd>
            </div>
          </dl>
          {c.notes && (
            <div className="mt-4 rounded-lg bg-muted/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">หมายเหตุ</p>
              <p className="text-xs text-foreground leading-relaxed">{c.notes}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] lg:col-span-2 overflow-hidden flex flex-col">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">สัญญาเงินกู้ ({loans.length})</h3>
          <div className="space-y-2 overflow-y-auto max-h-[400px] pr-1">
            {loans.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีสัญญาเงินกู้</p>}
            {loans.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3.5 hover:bg-muted/30 transition-all group">
                <Link to="/loans/$loanId" params={{ loanId: l.id }} className="min-w-0 flex-1">
                  <p className="text-sm font-bold group-hover:text-primary transition-colors">{l.loanNumber}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(l.startDate)} → {formatDate(l.dueDate)}</p>
                </Link>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-sm font-black text-foreground">{formatTHB(l.totalPayable)}</p>
                    <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                      {getLoanStatusLabel(l)}
                    </StatusBadge>
                  </div>
                  <EditLoanModal
                    loan={l}
                    onDone={load}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title="แก้ไขสัญญา"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] lg:col-span-3 overflow-hidden">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">ประวัติการชำระเงิน ({payments.length})</h3>
          <div className="max-h-80 space-y-1 overflow-auto pr-1">
            {payments.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีประวัติการชำระเงิน</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/50 py-3 text-sm last:border-0 hover:bg-muted/20 px-2 rounded-lg transition-colors">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{formatDate(p.paymentDate)}</span>
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">งวดที่ #{p.installmentNumber ?? "—"}</span>
                </div>
                <span className="font-bold text-success text-base">{formatTHB(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] mb-10 overflow-hidden">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2 flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> เอกสารแนบ ({attachments.length})
        </h3>

        {attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-xl bg-muted/5">
            <Paperclip className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารแนบ (สามารถแนบได้ที่หน้าแก้ไขลูกค้า)</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {attachments.map((att) => {
              const url = resolveFileUrl(att.filePath);
              const isImage = isImageFileName(att.fileName ?? "");
              return (
                <div key={att.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border shadow-sm">
                  {isImage ? (
                    <button
                      type="button"
                      onClick={() => setPreview({ url, name: att.fileName })}
                      className="block w-full h-full"
                    >
                      <img
                        src={url}
                        alt={att.fileName}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    </button>
                  ) : (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center gap-1.5 w-full h-full bg-muted/40 hover:bg-muted/60 transition-colors px-2 text-center"
                    >
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground truncate max-w-full">{att.fileName}</span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl w-[95vw] p-2 sm:p-4">
          <DialogTitle className="sr-only">{preview?.name}</DialogTitle>
          {preview && <img src={preview.url} alt={preview.name} className="w-full max-h-[85vh] rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
