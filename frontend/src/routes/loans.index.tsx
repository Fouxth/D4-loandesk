import { logActivity, getLoans, createLoan, getCustomers } from "@/lib/services";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Plus, Search, Calendar, User, DollarSign, Pencil } from "lucide-react";
import { toast } from "sonner";
import { calcLoan } from "@/utils/loanCalc";
import { formatTHB, formatDate, getThaiDateStr } from "@/utils/format";
import { getLoanCategory, LOAN_CATEGORY_OPTIONS } from "@/utils/loanType";
import { useSettings } from "@/contexts/SettingsContext";
import { CustomerSelect } from "@/components/CustomerSelect";
import { EditLoanModal } from "@/components/EditLoanModal";
import { RecordPaymentModal } from "@/components/RecordPaymentModal";
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
      if (document.visibilityState === 'visible') {
        load();
      }
    }, 10000);

    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
                        r.loanNumber.toLowerCase().includes(q) ||
                        r.customerName.toLowerCase().includes(q);
    const matchStatus = filter === "all" || getEffectiveStatus(r) === filter || (filter === "active" && getEffectiveStatus(r) === "due_today");
    const matchType = typeFilter === "all" || getLoanCategory(r) === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <div className="animate-in fade-in duration-500">
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
            <NewLoanForm onDone={() => { setOpen(false); load(); }} />
          </Dialog>
        }
      />

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
            <SelectItem value="active">{t('loans.status.active')}</SelectItem>
            <SelectItem value="due_today">{t('loans.status.due_today')}</SelectItem>
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
              <TableHead className="font-bold">{t('loans.table.loan_number', 'เลขที่สัญญา')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.customer', 'ชื่อลูกค้า')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.type', 'ประเภท')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.principal', 'เงินต้น')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.total', 'ยอดรวม')}</TableHead>
              <TableHead className="font-bold">{t('loans.table.due_date', 'ครบกำหนด')}</TableHead>
              <TableHead className="font-bold text-center">{t('loans.table.status', 'สถานะ')}</TableHead>
              <TableHead className="font-bold text-center pr-6">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => (
              <TableRow key={l.id} className="hover:bg-muted/20 transition-colors">
                <TableCell>
                  <Link to="/loans/$loanId" params={{ loanId: l.id }} className="font-bold text-primary hover:underline flex items-center gap-2">
                    {l.loanNumber}
                    {l.isPawn && <span className="bg-primary/20 text-primary text-[11px] px-1 rounded">จำนำ</span>}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">{l.customerName}</TableCell>
                <TableCell>
                  <StatusBadge tone="info">{getLoanCategory(l)}</StatusBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatTHB(l.principal)}</TableCell>
                <TableCell className="font-bold">{formatTHB(l.totalPayable)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDate(getLoanNextDueDate(l) || l.dueDate)}</TableCell>
                <TableCell className="text-center">
                  <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                    {getLoanStatusLabel(l, t)}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-center pr-6">
                  <div className="flex items-center justify-center gap-1.5">
                    <RecordPaymentModal
                      loan={l}
                      onDone={load}
                      trigger={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10 font-bold text-xs gap-1"
                          title="บันทึกการชำระเงิน"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          <span>รับชำระ</span>
                        </Button>
                      }
                    />
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
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
        {filtered.map((l) => (
          <div
            key={l.id} 
            className="group rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] active:scale-[0.99] transition-all block relative cursor-pointer"
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
                <div className="flex items-center gap-1.5 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                  <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                    {getLoanStatusLabel(l, t)}
                  </StatusBadge>
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
              
              <div className="grid grid-cols-2 gap-4 mt-2">
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
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground bg-card rounded-xl border border-dashed border-border mt-4">
          {t('messages.no_data')}
        </div>
      )}
    </div>
  );
}

function NewLoanForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { lending } = useSettings();
  const [customers, setCustomers] = useState<any[]>([]);
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
  }, []);
  
  const isIndefiniteLoan = Boolean(form.isPawn || isZeroInterestDebt);

  const calc = calcLoan(
    form.principal,
    form.interestRate,
    form.installmentsCount,
    form.paymentType,
    new Date(form.startDate),
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
        dueDate: isIndefiniteLoan ? null : (calc.due ? calc.due.toISOString().split("T")[0] : null),
        promiseDate: form.promiseDate || (form.isPrincipalInterestAtEnd && calc.due ? calc.due.toISOString().split("T")[0] : null),
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
