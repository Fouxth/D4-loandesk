import { logActivity, getLoans, createLoan, getCustomers, createPayment, createBulkPayments, getPayments } from "@/lib/services";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, loanStatusTone, getEffectiveStatus, getLoanStatusLabel, getLoanNextDueDate } from "@/components/StatusBadge";
import { Plus, Search, Calendar, User, DollarSign, Pencil, Zap, Loader2, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { calcLoan } from "@/utils/loanCalc";
import { formatTHB, formatDate, getThaiDateStr } from "@/utils/format";
import { getLoanCategory, LOAN_CATEGORY_OPTIONS } from "@/utils/loanType";
import { useSettings } from "@/contexts/SettingsContext";
import { CustomerSelect } from "@/components/CustomerSelect";
import { EditLoanModal } from "@/components/EditLoanModal";
import { RecordPaymentModal } from "@/components/RecordPaymentModal";
import { SettleLoanModal } from "@/components/SettleLoanModal";
import { calcCustomerCreditProfile } from "@/utils/creditScore";
import { CreditScoreBadge } from "@/components/CreditScoreBadge";
import { cn } from "@/utils/utils";
import { useSessionState } from "@/hooks/useSessionState";

export const Route = createFileRoute("/loans/")({
  component: () => (<ProtectedRoute><AppLayout><Loans /></AppLayout></ProtectedRoute>),
});

function Loans() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useSessionState("loans_search", "");
  const [filter, setFilter] = useSessionState("loans_status_filter", "all");
  const [typeFilter, setTypeFilter] = useSessionState("loans_type_filter", "all");
  const [open, setOpen] = useState(false);

  // Quick Pay & Bulk Pay State
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());
  const [quickPayingId, setQuickPayingId] = useState<string | null>(null);
  const [quickPayTarget, setQuickPayTarget] = useState<any | null>(null);
  const [quickPayMethod, setQuickPayMethod] = useState<"cash" | "bank_transfer" | "other">("cash");
  const [quickPayDate, setQuickPayDate] = useState(getThaiDateStr());

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPaymentDate, setBulkPaymentDate] = useState(getThaiDateStr());
  const [bulkMethod, setBulkMethod] = useState<"cash" | "bank_transfer" | "other">("cash");

  const load = async () => {
    try {
      const data = await getLoans();
      setRows(data ?? []);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };
  
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('[role="dialog"]')) {
        load();
      }
    }, 30000);

    const onFocus = () => {
      if (!document.querySelector('[role="dialog"]')) {
        load();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const todayStr = getThaiDateStr();
  const isTodayDue = (r: any) => {
    const nextDue = getLoanNextDueDate(r) || r.dueDate;
    const status = getEffectiveStatus(r);
    if (["completed", "cancelled", "forfeited"].includes(status)) return false;
    return nextDue === todayStr || status === "due_today";
  };

  const countAll = rows.length;
  const countTodayDue = rows.filter(isTodayDue).length;
  const countOverdue = rows.filter((r) => getEffectiveStatus(r) === "overdue").length;
  const countCompleted = rows.filter((r) => getEffectiveStatus(r) === "completed").length;

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
                        r.loanNumber.toLowerCase().includes(q) ||
                        r.customerName.toLowerCase().includes(q);
    const status = getEffectiveStatus(r);
    const matchStatus =
      filter === "all" ||
      (filter === "today_due" && isTodayDue(r)) ||
      (filter === "active" && (status === "active" || status === "due_today")) ||
      status === filter;
    const matchType = typeFilter === "all" || getLoanCategory(r) === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  // Active / Eligible for Bulk Pay from currently filtered loans
  const activeEligibleLoans = filtered.filter(
    (l) => !["completed", "cancelled", "forfeited"].includes(getEffectiveStatus(l))
  );
  const isAllSelected =
    activeEligibleLoans.length > 0 &&
    activeEligibleLoans.every((l) => selectedLoanIds.has(l.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLoanIds(new Set());
    } else {
      setSelectedLoanIds(new Set(activeEligibleLoans.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedLoanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onTriggerQuickPay = (loan: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setQuickPayTarget(loan);
    setQuickPayMethod("cash");
    setQuickPayDate(getThaiDateStr());
  };

  const handleQuickPayConfirm = async () => {
    if (!quickPayTarget) return;
    const loan = quickPayTarget;
    const loanId = loan.id;
    const customerName = loan.customerName || loan.customer_name || "—";
    const isInterestOnly = Boolean(loan.isInterestOnly || loan.isPawn || loan.is_interest_only || loan.is_pawn);
    const instAmount = Number(loan.installmentAmount ?? loan.installment_amount ?? 0);
    const nextNum = Number(loan.paidInstallmentsCount ?? loan.paid_installments_count ?? 0) + 1;

    if (instAmount <= 0) {
      toast.error("ไม่สามารถชำระด่วนได้ เนื่องจากยอดค่างวดเป็น 0");
      return;
    }

    setQuickPayingId(loanId);
    try {
      await createPayment({
        loanId,
        amount: instAmount,
        installmentNumber: nextNum,
        paymentDate: quickPayDate,
        method: quickPayMethod,
        category: isInterestOnly ? "interest" : "principal",
        notes: "ชำระด่วน",
      });
      try {
        await logActivity({
          action: "record_payment",
          entity_type: "payment",
          details: { loanId, amount: instAmount, loanNumber: loan.loanNumber, customerName, isQuickPay: true },
        });
      } catch (e) {}
      toast.success(`⚡️ บันทึกชำระ ${customerName} ฿${instAmount.toLocaleString()} (งวดที่ ${nextNum}) เรียบร้อยแล้ว`);
      setQuickPayTarget(null);
      await load();
    } catch (error: any) {
      toast.error(error.message || "เกิดข้อผิดพลาดในการบันทึกชำระด่วน");
    } finally {
      setQuickPayingId(null);
    }
  };

  const selectedLoansList = rows.filter((r) => selectedLoanIds.has(r.id));
  const selectedTotalAmount = selectedLoansList.reduce(
    (sum, l) => sum + Number(l.installmentAmount ?? l.installment_amount ?? 0),
    0
  );

  const handleBulkSubmit = async () => {
    if (selectedLoansList.length === 0) return;

    setBulkBusy(true);
    try {
      const payloads = selectedLoansList.map((l) => {
        const isInterestOnly = Boolean(l.isInterestOnly || l.isPawn || l.is_interest_only || l.is_pawn);
        const instAmount = Number(l.installmentAmount ?? l.installment_amount ?? 0);
        const nextNum = Number(l.paidInstallmentsCount ?? l.paid_installments_count ?? 0) + 1;
        return {
          loanId: l.id,
          amount: instAmount,
          installmentNumber: nextNum,
          paymentDate: bulkPaymentDate,
          method: bulkMethod,
          category: isInterestOnly ? "interest" : "principal",
          notes: `บันทึกกลุ่ม ${bulkPaymentDate}`,
        };
      });

      const res = await createBulkPayments(payloads);
      try {
        await logActivity({
          action: "bulk_record_payments",
          entity_type: "payment",
          details: { count: res.successCount, total: payloads.length, totalAmount: selectedTotalAmount },
        });
      } catch (e) {}

      toast.success(`⚡️ บันทึกรับชำระพร้อมกัน ${res.successCount} สัญญา (รวม ฿${selectedTotalAmount.toLocaleString()}) เรียบร้อยแล้ว`);
      setSelectedLoanIds(new Set());
      setBulkConfirmOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาดในการบันทึกกลุ่ม");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      <PageHeader
        title={t('loans.title')} 
        description={`${t('common.total', 'ทั้งหมด')} ${rows.length} ${t('common.items', 'รายการ')}`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-[var(--shadow-elevated)] w-full sm:w-auto h-11 px-6 rounded-xl font-bold">
                <Plus className="mr-2 h-5 w-5" />{t('loans.create_new')}
              </Button>
            </DialogTrigger>
            <NewLoanForm onDone={() => { setOpen(false); load(); }} existingLoans={rows} />
          </Dialog>
        }
      />

      {/* Quick Filter Tabs / Chips */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            filter === "all"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-card border-border hover:bg-muted text-muted-foreground"
          )}
        >
          <span>ทั้งหมด</span>
          <span className="opacity-80 text-[11px]">({countAll})</span>
        </button>

        <button
          onClick={() => setFilter("today_due")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            filter === "today_due"
              ? "bg-amber-500 text-white border-amber-600 shadow-sm"
              : "bg-card border-border hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
          )}
        >
          <span>⚡️ ต้องเก็บวันนี้</span>
          <span className="bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 rounded-full text-[10px] font-black">
            {countTodayDue}
          </span>
        </button>

        <button
          onClick={() => setFilter("overdue")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            filter === "overdue"
              ? "bg-rose-500 text-white border-rose-600 shadow-sm"
              : "bg-card border-border hover:bg-rose-500/10 text-rose-600 dark:text-rose-400"
          )}
        >
          <span>🔴 ค้างชำระ</span>
          <span className="opacity-80 text-[11px]">({countOverdue})</span>
        </button>

        <button
          onClick={() => setFilter("completed")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            filter === "completed"
              ? "bg-blue-600 text-white border-blue-700 shadow-sm"
              : "bg-card border-border hover:bg-muted text-muted-foreground"
          )}
        >
          <span>🔵 ปิดยอดแล้ว</span>
          <span className="opacity-80 text-[11px]">({countCompleted})</span>
        </button>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('loans.search_placeholder')} 
            className="pl-9 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20" 
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-44 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20 font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('loans.status.all')}</SelectItem>
            <SelectItem value="today_due">⚡️ ต้องเก็บวันนี้</SelectItem>
            <SelectItem value="overdue">{t('loans.status.overdue')}</SelectItem>
            <SelectItem value="completed">{t('loans.status.completed')}</SelectItem>
            <SelectItem value="cancelled">{t('loans.status.cancelled')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20 font-medium">
            <SelectValue placeholder="ทุกประเภท" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {LOAN_CATEGORY_OPTIONS.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden md:block rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
              <TableHead className="w-10 px-3 text-center">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="เลือกทั้งหมด"
                />
              </TableHead>
              <TableHead className="font-bold">{t('loans.table.loan_number', 'เลขที่สัญญา')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.customer', 'ชื่อลูกค้า')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.type', 'ประเภท')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.principal', 'เงินต้น')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.total', 'ยอดรวม')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.due_date', 'ครบกำหนด')}</TableHead>
              <TableHead className="font-bold text-center">{t('loans.table.status', 'สถานะ')}</TableHead>
              <TableHead className="font-bold text-center pr-6">จัดการ / รับชำระ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => {
              const isEligible = !["completed", "cancelled", "forfeited"].includes(getEffectiveStatus(l));
              const isSelected = selectedLoanIds.has(l.id);
              const instAmt = Number(l.installmentAmount ?? l.installment_amount ?? 0);
              const isPayingThis = quickPayingId === l.id;

              return (
                <TableRow
                  key={l.id}
                  className={cn(
                    "hover:bg-muted/20 transition-colors cursor-pointer",
                    isSelected && "bg-primary/5 hover:bg-primary/10"
                  )}
                  onClick={() => isEligible && toggleSelect(l.id)}
                >
                  <TableCell className="px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(l.id)}
                      disabled={!isEligible}
                      aria-label={`เลือก ${l.customerName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link to="/loans/$loanId" params={{ loanId: l.id }} className="font-bold text-primary hover:underline flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {l.loanNumber}
                      {l.isPawn && <span className="bg-primary/20 text-primary text-[11px] px-1 rounded">จำนำ</span>}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{l.customerName}</TableCell>
                  <TableCell>
                    <StatusBadge tone="info">{getLoanCategory(l)}</StatusBadge>
                    {l.isInterestOnly && !l.isPawn && (
                      <span className="block text-[10px] font-bold text-primary mt-0.5">
                        💎 ดอกลอย ฿{instAmt}/วัน
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatTHB(l.principal)}</TableCell>
                  <TableCell className="font-bold">
                    {l.isInterestOnly && !l.isPawn ? (
                      <div>
                        <span>{formatTHB(l.principal)}</span>
                        <span className="block text-[10px] text-warning font-semibold">ดอก {formatTHB(instAmt)}/วัน</span>
                      </div>
                    ) : (
                      formatTHB(l.totalPayable)
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(getLoanNextDueDate(l) || l.dueDate)}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                      {getLoanStatusLabel(l, t)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-center pr-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {/* Quick 1-Click Pay */}
                      {isEligible && instAmt > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPayingThis}
                          onClick={(e) => onTriggerQuickPay(l, e)}
                          className="h-8 px-2.5 rounded-lg border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-bold text-xs gap-1 shadow-sm active:scale-95 transition-all"
                          title={l.isInterestOnly && !l.isPawn ? `จ่ายดอกเบี้ย ฿${instAmt.toLocaleString()}` : `จ่ายด่วนงวดปกติ ฿${instAmt.toLocaleString()}`}
                        >
                          {isPayingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
                          )}
                          <span>{l.isInterestOnly && !l.isPawn ? `จ่ายดอก ฿${instAmt.toLocaleString()}` : `฿${instAmt.toLocaleString()}`}</span>
                        </Button>
                      )}

                      <RecordPaymentModal
                        loan={l}
                        onDone={load}
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10 font-bold text-xs gap-1"
                            title="บันทึกการชำระเงิน (ท+ป / ปรับยอด)"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                            <span>รับชำระ</span>
                          </Button>
                        }
                      />
                      {l.status !== 'completed' && (
                        <SettleLoanModal
                          loan={l}
                          onDone={load}
                        />
                      )}
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
        {filtered.map((l) => {
          const isEligible = !["completed", "cancelled", "forfeited"].includes(getEffectiveStatus(l));
          const isSelected = selectedLoanIds.has(l.id);
          const instAmt = Number(l.installmentAmount ?? l.installment_amount ?? 0);
          const isPayingThis = quickPayingId === l.id;

          return (
            <div
              key={l.id} 
              className={cn(
                "group rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-elevated)] active:scale-[0.99] transition-all block relative cursor-pointer",
                isSelected && "border-primary ring-2 ring-primary/20 bg-primary/5"
              )}
            >
              {/* Full card clickable link overlay */}
              <Link
                to="/loans/$loanId"
                params={{ loanId: l.id }}
                className="absolute inset-0 z-0 rounded-2xl"
                aria-label={`สัญญา ${l.loanNumber} ${l.customerName}`}
              />

              <div className="relative z-10 pointer-events-none">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-start gap-2.5">
                    {isEligible && (
                      <div className="pointer-events-auto pt-0.5" onClick={(e) => toggleSelect(l.id, e)}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(l.id)}
                          aria-label={`เลือก ${l.customerName}`}
                        />
                      </div>
                    )}
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded mb-1 inline-flex items-center gap-1">
                        {l.loanNumber}
                        {l.isPawn && <span className="bg-primary text-white text-[10px] px-1 rounded ml-1">จำนำ</span>}
                      </span>
                      <div className="font-bold text-foreground text-lg flex items-center gap-2 group-hover:text-primary transition-colors">
                        <User className="h-4 w-4 text-primary" /> {l.customerName}
                      </div>
                      <StatusBadge tone="info">{getLoanCategory(l)}</StatusBadge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                      {getLoanStatusLabel(l, t)}
                    </StatusBadge>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-2 mb-3">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> ยอดรวมทั้งหมด
                    </p>
                    <p className="font-black text-primary">{formatTHB(l.totalPayable)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> ครบกำหนด
                    </p>
                    <p className="text-xs font-bold text-foreground">{formatDate(getLoanNextDueDate(l) || l.dueDate)}</p>
                  </div>
                </div>

                {/* Mobile Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                  {isEligible && instAmt > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPayingThis}
                      onClick={(e) => onTriggerQuickPay(l, e)}
                      className="h-8 px-2.5 rounded-lg border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-bold text-xs gap-1 shadow-sm active:scale-95 transition-all"
                      title={`จ่ายด่วน ฿${instAmt.toLocaleString()}`}
                    >
                      {isPayingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
                      )}
                      <span>จ่ายด่วน ฿{instAmt.toLocaleString()}</span>
                    </Button>
                  )}
                  <RecordPaymentModal
                    loan={l}
                    onDone={load}
                    trigger={
                      <Button
                        size="sm"
                        className="h-8 px-2.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground text-xs font-bold gap-1 active:scale-95 transition-all"
                        title="บันทึกการชำระเงิน"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        <span>รับชำระ</span>
                      </Button>
                    }
                  />
                  {l.status !== 'completed' && (
                    <SettleLoanModal
                      loan={l}
                      onDone={load}
                    />
                  )}
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
            </div>
          );
        })}
      </div>

      {/* Floating Sticky Bulk Pay Action Bar */}
      {selectedLoanIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-4 max-w-2xl mx-auto z-40 bg-card/95 backdrop-blur-md border border-primary/40 p-3.5 sm:p-4 rounded-2xl shadow-[var(--shadow-elevated)] flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-black text-sm">
              {selectedLoanIds.size}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                เลือก {selectedLoanIds.size} สัญญา
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                ยอดรวมงวดปกติ: <span className="font-black text-emerald-600 dark:text-emerald-400">{formatTHB(selectedTotalAmount)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLoanIds(new Set())}
              className="text-xs rounded-xl h-9 font-medium"
            >
              ยกเลิก
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkConfirmOpen(true)}
              className="h-9 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5 active:scale-95 transition-all"
            >
              <Zap className="h-3.5 w-3.5 fill-white" />
              <span>บันทึกจ่ายปกติทุกคน ({selectedLoanIds.size} คน)</span>
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Pay Confirmation Dialog */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[85vh] overflow-y-auto border-border shadow-[var(--shadow-elevated)]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500 fill-emerald-500" />
              <span>ยืนยันบันทึกการชำระเงินกลุ่ม ({selectedLoansList.length} สัญญา)</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  วันที่ชำระ
                </Label>
                <Input
                  type="date"
                  value={bulkPaymentDate}
                  onChange={(e) => setBulkPaymentDate(e.target.value)}
                  className="bg-muted/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  ช่องทางการชำระ
                </Label>
                <Select value={bulkMethod} onValueChange={(v: any) => setBulkMethod(v)}>
                  <SelectTrigger className="bg-muted/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">เงินสด</SelectItem>
                    <SelectItem value="bank_transfer">โอนผ่านธนาคาร</SelectItem>
                    <SelectItem value="other">อื่นๆ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                รายชื่อและยอดเงินที่จะตัดงวด ({selectedLoansList.length} รายการ)
              </Label>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-border bg-muted/10 divide-y divide-border/40 p-1">
                {selectedLoansList.map((l) => {
                  const instAmt = Number(l.installmentAmount ?? l.installment_amount ?? 0);
                  const nextNum = Number(l.paidInstallmentsCount ?? l.paid_installments_count ?? 0) + 1;
                  return (
                    <div key={l.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          <span>{l.customerName}</span>
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                            {l.loanNumber}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">งวดที่ {nextNum}</p>
                      </div>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatTHB(instAmt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex justify-between items-center text-xs">
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                ยอดรวมทั้งสิ้น ({selectedLoansList.length} คน):
              </span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                {formatTHB(selectedTotalAmount)}
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              variant="outline"
              disabled={bulkBusy}
              onClick={() => setBulkConfirmOpen(false)}
              className="rounded-xl"
            >
              ยกเลิก
            </Button>
            <Button
              disabled={bulkBusy}
              onClick={handleBulkSubmit}
              className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5"
            >
              {bulkBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>ยืนยันบันทึกทั้ง {selectedLoansList.length} รายการ</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Pay Single Confirmation Dialog */}
      <Dialog open={!!quickPayTarget} onOpenChange={(isOpen) => !isOpen && setQuickPayTarget(null)}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md border-border shadow-[var(--shadow-elevated)]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500 fill-emerald-500" />
              <span>ยืนยันการรับชำระด่วน</span>
            </DialogTitle>
          </DialogHeader>

          {quickPayTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {quickPayTarget.loanNumber}
                    </span>
                    <h3 className="text-lg font-black text-foreground mt-0.5">
                      {quickPayTarget.customerName}
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground bg-card/80 px-2.5 py-1 rounded-lg border border-border">
                    งวดที่ {Number(quickPayTarget.paidInstallmentsCount ?? quickPayTarget.paid_installments_count ?? 0) + 1}
                  </span>
                </div>

                <div className="pt-2 border-t border-emerald-500/20 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    ยอดค่างวดที่ต้องชำระ:
                  </span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {formatTHB(Number(quickPayTarget.installmentAmount ?? quickPayTarget.installment_amount ?? 0))}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    วันที่ชำระ
                  </Label>
                  <Input
                    type="date"
                    value={quickPayDate}
                    onChange={(e) => setQuickPayDate(e.target.value)}
                    className="bg-muted/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    ช่องทางการชำระ
                  </Label>
                  <Select value={quickPayMethod} onValueChange={(v: any) => setQuickPayMethod(v)}>
                    <SelectTrigger className="bg-muted/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">เงินสด</SelectItem>
                      <SelectItem value="bank_transfer">โอนผ่านธนาคาร</SelectItem>
                      <SelectItem value="other">อื่นๆ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button
              variant="outline"
              disabled={!!quickPayingId}
              onClick={() => setQuickPayTarget(null)}
              className="rounded-xl"
            >
              ยกเลิก
            </Button>
            <Button
              disabled={!!quickPayingId}
              onClick={handleQuickPayConfirm}
              className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5"
            >
              {quickPayingId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>ยืนยันรับชำระ ฿{Number(quickPayTarget?.installmentAmount ?? quickPayTarget?.installment_amount ?? 0).toLocaleString()}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground bg-card rounded-xl border border-dashed border-border mt-4">
          {t('messages.no_data')}
        </div>
      )}
    </div>
  );
}

function NewLoanForm({ onDone, existingLoans = [] }: { onDone: () => void; existingLoans?: any[] }) {
  const { t } = useTranslation();
  const { lending } = useSettings();
  const [customers, setCustomers] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    principal: 10000,
    interestRate: 20,
    installmentsCount: 30,
    paymentType: "daily" as "daily" | "weekly" | "monthly",
    startDate: getThaiDateStr(),
    promiseDate: "",
    notes: "",
    isInterestOnly: false,
    isIndefinite: false,
    isPrincipalInterestAtEnd: false,
    isPawn: false,
    pawnItem: "",
  });
  const [isZeroInterestDebt, setIsZeroInterestDebt] = useState(false);
  const [applyDocumentFee, setApplyDocumentFee] = useState(false);
  const [documentFee, setDocumentFee] = useState(lending.documentFeeAmount);
  const [applyAdvanceFee, setApplyAdvanceFee] = useState(false);
  const [advanceFee, setAdvanceFee] = useState(lending.advanceFeeAmount);
  const [applyParkingFee, setApplyParkingFee] = useState(false);
  const [parkingFee, setParkingFee] = useState(lending.parkingFeeAmount);
  const [busy, setBusy] = useState(false);

  useEffect(() => { 
    getCustomers().then(data => setCustomers(data ?? []));
    getPayments().then(data => setAllPayments(data ?? [])).catch(() => {});
  }, []);

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === form.customerId), [customers, form.customerId]);
  const customerLoans = useMemo(() => existingLoans.filter((l) => (l.customerId || l.customer_id) === form.customerId), [existingLoans, form.customerId]);
  const customerPayments = useMemo(() => allPayments.filter((p) => customerLoans.some((l) => l.id === p.loanId)), [allPayments, customerLoans]);
  const selectedCreditProfile = useMemo(() => {
    if (!selectedCustomer) return null;
    return calcCustomerCreditProfile(selectedCustomer, customerLoans, customerPayments);
  }, [selectedCustomer, customerLoans, customerPayments]);
  
  const isIndefiniteLoan = Boolean(form.isPawn || isZeroInterestDebt);

  const calc = calcLoan(
    form.principal,
    form.interestRate,
    form.installmentsCount,
    form.paymentType,
    form.startDate,
    form.isInterestOnly,
    isIndefiniteLoan,
    form.isPrincipalInterestAtEnd,
  );

  const appliedDocumentFee = applyDocumentFee ? Number(documentFee) || 0 : 0;
  const appliedAdvanceFee = applyAdvanceFee ? Number(advanceFee) || 0 : 0;
  const appliedParkingFee = form.isPawn && applyParkingFee ? Number(parkingFee) || 0 : 0;
  const netDisbursement = Math.max(
    Number(form.principal || 0) - appliedDocumentFee - appliedAdvanceFee - appliedParkingFee,
    0
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId && !form.isPawn) return toast.error("กรุณาเลือกลูกค้า");
    setBusy(true);
    try {
      const data = await createLoan({
        customerId: form.customerId,
        principal: form.principal,
        interestRate: form.interestRate,
        interestAmount: calc.interest,
        totalPayable: calc.total,
        installmentsCount: form.installmentsCount,
        installmentAmount: calc.installment,
        paymentType: form.paymentType,
        startDate: form.startDate,
        dueDate: isIndefiniteLoan ? null : (calc.dueStr || (calc.due ? calc.due.toISOString().split("T")[0] : null)),
        promiseDate: form.promiseDate || (form.isPrincipalInterestAtEnd ? (calc.dueStr || (calc.due ? calc.due.toISOString().split("T")[0] : null)) : null),
        notes: form.notes,
        isInterestOnly: form.isInterestOnly,
        isIndefinite: isIndefiniteLoan,
        isPrincipalInterestAtEnd: form.isPrincipalInterestAtEnd,
        isPawn: form.isPawn,
        pawnItem: form.isPawn ? form.pawnItem : null,
        documentFee: appliedDocumentFee,
        advanceFee: appliedAdvanceFee,
        parkingFee: appliedParkingFee,
      });
      
      const loanId = (data as any)[0]?.id;
      if (loanId) {
        try {
          await logActivity({ action: "create_loan", entity_type: "loan", entity_id: loanId });
        } catch (logError) {
          console.error("Activity log failed:", logError);
        }
      }
      
      setForm({
        customerId: "",
        principal: 10000,
        interestRate: 20,
        installmentsCount: 30,
        paymentType: "daily",
        startDate: getThaiDateStr(),
        promiseDate: "",
        notes: "",
        isInterestOnly: false,
        isIndefinite: false,
        isPrincipalInterestAtEnd: false,
        isPawn: false,
        pawnItem: "",
      });
      setIsZeroInterestDebt(false);
      setApplyDocumentFee(false);
      setApplyAdvanceFee(false);
      setApplyParkingFee(false);
      toast.success(t('common.save_success', 'บันทึกเรียบร้อยแล้ว'));
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-xl w-[95vw] sm:w-full max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">{t('loans.create_new')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">เลือกลูกค้า</Label>
          <CustomerSelect
            value={form.customerId}
            onValueChange={(v) => setForm({ ...form, customerId: v })}
            customers={customers}
            placeholder="พิมพ์ค้นหาชื่อ หรือเบอร์โทรศัพท์ลูกค้า..."
          />

          {/* Customer Credit Assessment Banner */}
          {selectedCreditProfile && (
            <div className={cn(
              "rounded-xl border p-3 text-xs space-y-1.5 transition-all animate-in fade-in",
              selectedCreditProfile.category === 'good'
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : selectedCreditProfile.category === 'regular'
                ? "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300"
                : selectedCreditProfile.category === 'watchlist'
                ? "bg-orange-500/10 border-orange-500/30 text-orange-800 dark:text-orange-300"
                : selectedCreditProfile.category === 'blocked'
                ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                : "bg-muted/40 border-border text-muted-foreground"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <CreditScoreBadge profile={selectedCreditProfile} size="xs" />
                </div>
                <span className="font-bold">
                  {selectedCreditProfile.totalLoansCount === 0
                    ? "ลูกค้าใหม่"
                    : `เคยกู้ ${selectedCreditProfile.totalLoansCount} สัญญา (ปิดแล้ว ${selectedCreditProfile.completedLoansCount})`}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-current/15">
                <span>{selectedCreditProfile.recommendation}</span>
                {selectedCreditProfile.recommendedNextCreditLimit > 0 && (
                  <span className="font-black shrink-0 ml-2">
                    วงเงินแนะนำ: {formatTHB(selectedCreditProfile.recommendedNextCreditLimit)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ยอดเงินต้น (บาท)</Label>
            <Input type="number" min={1} value={form.principal} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, principal: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">อัตราดอกเบี้ย (%)</Label>
            <Input type="number" min={0} step={0.1} value={form.interestRate} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, interestRate: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">จำนวนงวด</Label>
            <Input type="number" min={1} value={form.installmentsCount} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, installmentsCount: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ความถี่ในการชำระ</Label>
            <Select value={form.paymentType} onValueChange={(v: any) => setForm({ ...form, paymentType: v })}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">รายวัน</SelectItem>
                <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                <SelectItem value="monthly">รายเดือน</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={form.isPrincipalInterestAtEnd ? "space-y-2 col-span-1" : "space-y-2 col-span-1 sm:col-span-2"}>
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">วันที่เริ่มสัญญา</Label>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="bg-muted/20" />
          </div>
          {form.isPrincipalInterestAtEnd && (
            <div className="space-y-2 col-span-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-primary">วันนัดจ่าย (วันครบกำหนด)</Label>
              <Input 
                type="date" 
                value={form.promiseDate || (calc.due ? calc.due.toISOString().split("T")[0] : "")} 
                onChange={(e) => setForm({ ...form, promiseDate: e.target.value })} 
                className="bg-primary/10 border-primary/30 font-bold" 
              />
            </div>
          )}
          <div className="flex items-center space-x-2 pt-2">
            <input 
              type="checkbox" 
              id="isInterestOnly" 
              checked={form.isInterestOnly} 
              disabled={form.isPrincipalInterestAtEnd}
              onChange={(e) => setForm({ ...form, isInterestOnly: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isInterestOnly" className="text-sm font-bold text-foreground cursor-pointer">เงินกู้แบบดอกลอย (เก็บแต่ดอกเบี้ย)</Label>
          </div>
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="isPrincipalInterestAtEnd"
              checked={form.isPrincipalInterestAtEnd}
              onChange={(e) => setForm({
                ...form,
                isPrincipalInterestAtEnd: e.target.checked,
                isInterestOnly: e.target.checked ? false : form.isInterestOnly,
                isIndefinite: false,
              })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isPrincipalInterestAtEnd" className="text-sm font-bold text-foreground cursor-pointer">จบต้นจบดอก (ชำระครั้งเดียววันครบกำหนด)</Label>
          </div>
          <div className="flex items-center space-x-2 pt-1">
            <input 
              type="checkbox" 
              id="isPawn" 
              checked={form.isPawn} 
              onChange={(e) => {
                const checked = e.target.checked;
                setForm({
                  ...form,
                  isPawn: checked,
                  paymentType: checked ? "monthly" : form.paymentType,
                  isInterestOnly: checked ? true : form.isInterestOnly,
                  isIndefinite: checked,
                  isPrincipalInterestAtEnd: checked ? false : form.isPrincipalInterestAtEnd,
                });
              }}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isPawn" className="text-sm font-bold text-foreground cursor-pointer">จำนำสิ่งของ</Label>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input 
              type="checkbox" 
              id="isZeroInterestDebt" 
              checked={isZeroInterestDebt} 
              onChange={(e) => {
                const checked = e.target.checked;
                setIsZeroInterestDebt(checked);
                if (checked) {
                  setForm({
                    ...form,
                    interestRate: 0,
                    installmentsCount: 1,
                    isInterestOnly: false,
                    isPrincipalInterestAtEnd: false,
                    isIndefinite: true,
                    isPawn: false,
                    notes: form.notes ? form.notes : "ยอดติดค้างชำระเดิม",
                  });
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isZeroInterestDebt" className="text-sm font-bold text-foreground cursor-pointer">
              ยอดติดค้างชำระเดิม (ดอกเบี้ย 0% / ทยอยชำระคืน)
            </Label>
          </div>

          {form.isPawn && (
            <div className="space-y-2 mt-2 p-3 bg-primary/5 rounded-xl border border-primary/20 animate-in slide-in-from-top-2 col-span-1 sm:col-span-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-primary">รายละเอียดสิ่งของที่จำนำ</Label>
              <Input
                value={form.pawnItem}
                onChange={(e) => setForm({ ...form, pawnItem: e.target.value })}
                placeholder="เช่น รถเก๋ง วีออส สีดำ, พระเลี่ยมทอง..."
                className="bg-background border-primary/30 focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                💡 สัญญารับจำนำจะตั้งค่าชำระรายเดือนและเก็บเฉพาะดอกเบี้ยให้อัตโนมัติ โดยวันที่ใน <strong>"วันที่เริ่มสัญญา"</strong> จะใช้เป็นวันที่ครบกำหนดเก็บดอกเบี้ยประจำทุกเดือน
              </p>
            </div>
          )}

          <div className={cn(
            "col-span-1 sm:col-span-2 grid gap-4 border-t border-border/50 pt-3 mt-1",
            form.isPawn ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
          )}>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="applyDocumentFee"
                  checked={applyDocumentFee}
                  onChange={(e) => setApplyDocumentFee(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="applyDocumentFee" className="text-sm font-bold text-foreground cursor-pointer">หักค่าเอกสาร</Label>
              </div>
              {applyDocumentFee && (
                <Input
                  type="number"
                  min={0}
                  value={documentFee ?? ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDocumentFee(e.target.value === "" ? "" as any : Number(e.target.value))}
                  className="bg-muted/20"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="applyAdvanceFee"
                  checked={applyAdvanceFee}
                  onChange={(e) => setApplyAdvanceFee(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="applyAdvanceFee" className="text-sm font-bold text-foreground cursor-pointer">หักค่าล่วงหน้า</Label>
              </div>
              {applyAdvanceFee && (
                <Input
                  type="number"
                  min={0}
                  value={advanceFee ?? ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setAdvanceFee(e.target.value === "" ? "" as any : Number(e.target.value))}
                  className="bg-muted/20"
                />
              )}
            </div>
            {form.isPawn && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="applyParkingFee"
                    checked={applyParkingFee}
                    onChange={(e) => setApplyParkingFee(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="applyParkingFee" className="text-sm font-bold text-foreground cursor-pointer">หักค่าฝากจอด</Label>
                </div>
                {applyParkingFee && (
                  <Input
                    type="number"
                    min={0}
                    value={parkingFee ?? ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setParkingFee(e.target.value === "" ? "" as any : Number(e.target.value))}
                    className="bg-muted/20"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 shadow-sm">
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-3">สรุปยอดเบื้องต้น</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">ดอกเบี้ย</p>
              <p className="text-sm font-bold text-primary">{formatTHB(calc.interest)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">ยอดรวมทั้งหมด</p>
              <p className="text-sm font-bold text-primary">{formatTHB(calc.total)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{form.isPrincipalInterestAtEnd ? 'ยอดปิด' : 'ต่องวด'}</p>
              <p className="text-sm font-bold text-primary">{formatTHB(calc.installment)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">กำหนดวันเก็บเงิน</p>
              <p className="text-sm font-bold text-primary">
                {form.paymentType === 'monthly' ? (
                  `ทุกวันที่ ${new Date(form.startDate).getDate() || 1} ของเดือน`
                ) : isZeroInterestDebt ? (
                  'ทยอยชำระคืน'
                ) : form.paymentType === 'weekly' ? (
                  'ทุกสัปดาห์'
                ) : (
                  'รายวัน'
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">สิ้นสุดวันที่</p>
              <p className="text-sm font-bold text-primary">
                {isIndefiniteLoan ? 'ไม่มีกำหนด' : (calc.due ? formatDate(calc.due) : 'ไม่มีกำหนด')}
              </p>
            </div>
          </div>
          {(applyDocumentFee || applyAdvanceFee || (form.isPawn && applyParkingFee)) && (
            <div className="mt-3 pt-3 border-t border-primary/20">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">ยอดที่จ่ายลูกค้าจริง (หักค่าธรรมเนียมแล้ว)</p>
              <p className="text-base font-black text-primary">{formatTHB(netDisbursement)}</p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "..." : "ยืนยันการสร้างสัญญาเงินกู้"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
