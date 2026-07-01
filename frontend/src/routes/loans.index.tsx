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
import { StatusBadge, loanStatusTone } from "@/components/StatusBadge";
import { Plus, Search, Calendar, User, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { calcLoan } from "@/utils/loanCalc";
import { formatTHB, formatDate, getThaiDateStr } from "@/utils/format";
import { getLoanCategory, LOAN_CATEGORY_OPTIONS } from "@/utils/loanType";

export const Route = createFileRoute("/loans/")({
  component: () => (<ProtectedRoute><AppLayout><Loans /></AppLayout></ProtectedRoute>),
});

function getEffectiveStatus(l: any): string {
  if (l.status === 'completed' || l.status === 'cancelled' || l.status === 'forfeited' || l.status === 'refinanced') return l.status;
  const todayStr = getThaiDateStr();
  const dueStr = l.dueDate ? l.dueDate.substring(0, 10) : '';
  if (dueStr < todayStr) return 'overdue';
  if (dueStr === todayStr) return 'due_today';
  return 'active';
}

function Loans() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const data = await getLoans();
      setRows(data ?? []);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };
  
  useEffect(() => { load(); }, []);

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
              <TableHead className="font-bold">เลขที่สัญญา</TableHead>
              <TableHead className="font-bold">ชื่อลูกค้า</TableHead>
              <TableHead className="font-bold">ประเภท</TableHead>
              <TableHead className="font-bold">เงินต้น</TableHead>
              <TableHead className="font-bold">ยอดรวม</TableHead>
              <TableHead className="font-bold">ครบกำหนด</TableHead>
              <TableHead className="font-bold text-center">สถานะ</TableHead>
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
                <TableCell className="text-muted-foreground text-xs">{formatDate(l.dueDate)}</TableCell>
                <TableCell className="text-center">
                  <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                    {getEffectiveStatus(l) === 'completed' && l.isPawn ? 'ไถ่ถอนแล้ว' : 
                     getEffectiveStatus(l) === 'forfeited' ? 'หลุดจำนำ' : 
                     getEffectiveStatus(l) === 'refinanced' ? 'ต่อดอกใหม่' :
                     t(`loans.status.${getEffectiveStatus(l)}`)}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
        {filtered.map((l) => (
          <Link 
            key={l.id} 
            to="/loans/$loanId" 
            params={{ loanId: l.id }}
            className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] active:scale-[0.98] transition-all block"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded mb-1 inline-flex items-center gap-1">
                  {l.loanNumber}
                  {l.isPawn && <span className="bg-primary text-white text-[10px] px-1 rounded ml-1">จำนำ</span>}
                </span>
                <h4 className="font-bold text-foreground text-lg flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> {l.customerName}
                </h4>
                <StatusBadge tone="info">{getLoanCategory(l)}</StatusBadge>
              </div>
              <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                {getEffectiveStatus(l) === 'completed' && l.isPawn ? 'ไถ่ถอนแล้ว' : 
                 getEffectiveStatus(l) === 'forfeited' ? 'หลุดจำนำ' : 
                 getEffectiveStatus(l) === 'refinanced' ? 'ต่อดอกใหม่' :
                 t(`loans.status.${getEffectiveStatus(l)}`)}
              </StatusBadge>
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
                <p className="text-xs font-bold text-foreground">{formatDate(l.dueDate)}</p>
              </div>
            </div>
          </Link>
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
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    principal: 10000,
    interestRate: 20,
    installmentsCount: 30,
    paymentType: "daily" as "daily" | "weekly" | "monthly",
    startDate: getThaiDateStr(),
    notes: "",
    isInterestOnly: false,
    isIndefinite: false,
    isPawn: false,
    pawnItem: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => { 
    getCustomers().then(data => setCustomers(data ?? []));
  }, []);
  
  const calc = calcLoan(form.principal, form.interestRate, form.installmentsCount, form.paymentType, new Date(form.startDate), form.isInterestOnly, form.isIndefinite);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return toast.error("กรุณาเลือกลูกค้า");
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
        dueDate: calc.due ? calc.due.toISOString().split("T")[0] : null, 
        notes: form.notes,
        isInterestOnly: form.isInterestOnly,
        isIndefinite: form.isIndefinite,
        isPawn: form.isPawn,
        pawnItem: form.isPawn ? form.pawnItem : null,
      });
      
      const loanId = (data as any)[0]?.id;
      if (loanId) {
        try {
          await logActivity({ action: "create_loan", entity_type: "loan", entity_id: loanId });
        } catch (logError) {
          console.error("Activity log failed:", logError);
        }
      }
      
      toast.success(t('common.save_success', 'บันทึกเรียบร้อยแล้ว'));
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-xl w-[95vw] sm:w-full">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">{t('loans.create_new')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">เลือกลูกค้า</Label>
          <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
            <SelectTrigger className="bg-muted/20"><SelectValue placeholder="ค้นหาหรือเลือกชื่อลูกค้า" /></SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ยอดเงินต้น (บาท)</Label>
            <Input type="number" min={1} value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">อัตราดอกเบี้ย (%)</Label>
            <Input type="number" min={0} step={0.1} value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">จำนวนงวด</Label>
            <Input type="number" min={1} disabled={form.isIndefinite} value={form.isIndefinite ? "" : form.installmentsCount} onChange={(e) => setForm({ ...form, installmentsCount: e.target.value === "" ? "" : Number(e.target.value) as any })} className="bg-muted/20" />
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
          <div className="space-y-2 col-span-1 sm:col-span-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">วันที่เริ่มสัญญา</Label>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="bg-muted/20" />
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <input 
              type="checkbox" 
              id="isInterestOnly" 
              checked={form.isInterestOnly} 
              onChange={(e) => setForm({ ...form, isInterestOnly: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isInterestOnly" className="text-sm font-bold text-foreground cursor-pointer">เงินกู้แบบดอกลอย (เก็บแต่ดอกเบี้ย)</Label>
          </div>
          <div className="flex items-center space-x-2 pt-1">
            <input 
              type="checkbox" 
              id="isIndefinite" 
              checked={form.isIndefinite} 
              onChange={(e) => setForm({ ...form, isIndefinite: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isIndefinite" className="text-sm font-bold text-foreground cursor-pointer">ไม่มีกำหนด (เก็บไปเรื่อยๆ)</Label>
          </div>
          <div className="flex items-center space-x-2 pt-1">
            <input 
              type="checkbox" 
              id="isPawn" 
              checked={form.isPawn} 
              onChange={(e) => setForm({ ...form, isPawn: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="isPawn" className="text-sm font-bold text-foreground cursor-pointer">จำนำสิ่งของ</Label>
          </div>

          {form.isPawn && (
            <div className="space-y-2 mt-2 animate-in slide-in-from-top-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-primary">รายละเอียดสิ่งของที่จำนำ</Label>
              <Input 
                value={form.pawnItem} 
                onChange={(e) => setForm({ ...form, pawnItem: e.target.value })} 
                placeholder="เช่น ทองคำหนัก 1 บาท, iPhone 15 Pro Max..." 
                className="bg-primary/5 border-primary/20 focus:border-primary"
              />
            </div>
          )}
        </div>

        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 shadow-sm">
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-3">สรุปยอดเบื้องต้น</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">ดอกเบี้ย</p>
              <p className="text-sm font-bold text-primary">{formatTHB(calc.interest)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">ยอดรวมทั้งหมด</p>
              <p className="text-sm font-bold text-primary">{formatTHB(calc.total)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">ต่องวด</p>
              <p className="text-sm font-bold text-primary">{formatTHB(calc.installment)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">สิ้นสุดวันที่</p>
              <p className="text-sm font-bold text-primary">{formatDate(calc.due)}</p>
            </div>
          </div>
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
