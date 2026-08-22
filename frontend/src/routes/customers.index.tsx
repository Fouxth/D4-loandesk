import { logActivity, getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerAttachments, uploadCustomerAttachment, deleteCustomerAttachment, getLoans, getPayments } from "@/lib/services";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Trash2, Pencil, Phone, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/utils/format";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { calcCustomerCreditProfile, type CustomerCreditProfile } from "@/utils/creditScore";
import { CreditScoreBadge } from "@/components/CreditScoreBadge";
import { cn } from "@/utils/utils";

function resolveFileUrl(filePath?: string | null) {
  if (!filePath) return "";
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '').replace(/\/api$/, '') ?? '';
  return `${apiBase}/${filePath}`;
}

function isImageFileName(name: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(name);
}

export const Route = createFileRoute("/customers/")({
  component: () => (
    <ProtectedRoute><AppLayout><Customers /></AppLayout></ProtectedRoute>
  ),
});

type Customer = { 
  id: string; 
  fullName: string; 
  phone: string | null; 
  idCard: string | null; 
  address: string | null; 
  notes: string | null; 
  riskLevel: string;
  category: string;
  createdAt: string
};

import { useSessionState } from "@/hooks/useSessionState";

function Customers() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Customer[]>([]);
  const [allLoans, setAllLoans] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [search, setSearch] = useSessionState("customers_search", "");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = async () => {
    try {
      const [custData, loansData, paymentsData] = await Promise.all([
        getCustomers(),
        getLoans().catch(() => []),
        getPayments().catch(() => []),
      ]);
      setRows((custData ?? []) as Customer[]);
      setAllLoans(loansData ?? []);
      setAllPayments(paymentsData ?? []);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };
  
  useEffect(() => { load(); }, []);

  // Compute credit profiles for all customers
  const profilesMap = useMemo(() => {
    const map: Record<string, CustomerCreditProfile> = {};
    rows.forEach((c) => {
      const cLoans = allLoans.filter((l) => (l.customerId || l.customer_id) === c.id);
      const cPayments = allPayments.filter((p) => cLoans.some((l) => l.id === p.loanId));
      map[c.id] = calcCustomerCreditProfile(c, cLoans, cPayments);
    });
    return map;
  }, [rows, allLoans, allPayments]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || 
                        r.fullName.toLowerCase().includes(q) || 
                        (r.phone && r.phone.toLowerCase().includes(q)) || 
                        (r.idCard && r.idCard.toLowerCase().includes(q));
    
    const prof = profilesMap[r.id];
    const matchCategory = categoryFilter === "all" || (prof && prof.category === categoryFilter);
    return matchSearch && matchCategory;
  });

  // Category Counts for filter tabs
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length, good: 0, regular: 0, new: 0, watchlist: 0, blocked: 0 };
    rows.forEach((r) => {
      const cat = profilesMap[r.id]?.category || "new";
      if (counts[cat] !== undefined) counts[cat]++;
    });
    return counts;
  }, [rows, profilesMap]);

  const remove = async (id: string) => {
    try {
      await deleteCustomer(id);
      try {
        await logActivity({ action: "delete_customer", entity_type: "customer", entity_id: id });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success(t('common.delete_success', 'ลบเรียบร้อยแล้ว'));
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const submit = async (formData: any) => {
    try {
      const result = editing
        ? await updateCustomer({ id: editing.id, ...formData })
        : await createCustomer(formData);
      const customer = Array.isArray(result) ? result[0] : result;
      try {
        await logActivity({
          action: editing ? "update_customer" : "create_customer",
          entity_type: "customer",
          entity_id: editing?.id ?? customer?.id,
          details: { name: formData.fullName }
        });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success(t('common.save_success', 'บันทึกเรียบร้อยแล้ว'));
      return customer;
    } catch (error: any) {
      toast.error(error.message);
      return undefined;
    }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-16">
      <PageHeader
        title={t('customers.title')}
        description={`${t('common.total', 'ทั้งหมด')} ${rows.length} ${t('common.items', 'รายการ')}`}
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)} className="shadow-[var(--shadow-elevated)] w-full sm:w-auto h-11 px-6 rounded-xl font-bold">
                <Plus className="mr-2 h-5 w-5" />{t('customers.add_new')}
              </Button>
            </DialogTrigger>
            <CustomerForm editing={editing} existingCustomers={rows} onDone={() => { setOpen(false); load(); }} onSubmit={submit} />
          </Dialog>
        }
      />

      {/* Customer Category Filter Chips */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 pr-1">
          <span>กลุ่มลูกค้า:</span>
        </div>
        <button
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap",
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-card border-border hover:bg-muted text-muted-foreground"
          )}
        >
          ทั้งหมด ({categoryCounts.all})
        </button>
        <button
          onClick={() => setCategoryFilter("good")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            categoryFilter === "good"
              ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
              : "bg-card border-border hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          )}
        >
          <span>💎 เครดิตดี</span>
          <span className="opacity-80 text-[10px]">({categoryCounts.good})</span>
        </button>
        <button
          onClick={() => setCategoryFilter("regular")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            categoryFilter === "regular"
              ? "bg-blue-600 text-white border-blue-700 shadow-sm"
              : "bg-card border-border hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
          )}
        >
          <span>👥 ลูกค้าประจำ</span>
          <span className="opacity-80 text-[10px]">({categoryCounts.regular})</span>
        </button>
        <button
          onClick={() => setCategoryFilter("new")}
          className={cn(
            "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
            categoryFilter === "new"
              ? "bg-slate-600 text-white border-slate-700 shadow-sm"
              : "bg-card border-border hover:bg-muted text-muted-foreground"
          )}
        >
          <span>⚪ ลูกค้าใหม่</span>
          <span className="opacity-80 text-[10px]">({categoryCounts.new})</span>
        </button>
        {categoryCounts.watchlist > 0 && (
          <button
            onClick={() => setCategoryFilter("watchlist")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
              categoryFilter === "watchlist"
                ? "bg-orange-600 text-white border-orange-700 shadow-sm"
                : "bg-card border-border hover:bg-orange-500/10 text-orange-600 dark:text-orange-400"
            )}
          >
            <span>⚠️ เฝ้าระวัง</span>
            <span className="opacity-80 text-[10px]">({categoryCounts.watchlist})</span>
          </button>
        )}
        {categoryCounts.blocked > 0 && (
          <button
            onClick={() => setCategoryFilter("blocked")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl border transition-all whitespace-nowrap flex items-center gap-1.5",
              categoryFilter === "blocked"
                ? "bg-rose-600 text-white border-rose-700 shadow-sm"
                : "bg-card border-border hover:bg-rose-500/10 text-rose-600 dark:text-rose-400"
            )}
          >
            <span>🚫 เครดิตไม่ผ่าน</span>
            <span className="opacity-80 text-[10px]">({categoryCounts.blocked})</span>
          </button>
        )}
      </div>

      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('customers.search_placeholder')} 
            className="pl-9 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20" 
          />
        </div>
      </div>

      <div className="hidden md:block rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
              <TableHead className="font-bold">{t('customers.table.name', 'ชื่อ-นามสกุล')}</TableHead>
              <TableHead className="font-bold">กลุ่มลูกค้า / เครดิต</TableHead>
              <TableHead className="font-bold">ประวัติการผ่อนชำระ</TableHead>
              <TableHead className="font-bold">{t('customers.table.phone', 'เบอร์โทรศัพท์')}</TableHead>
              <TableHead className="font-bold">{t('customers.table.id_card', 'เลขบัตรประชาชน')}</TableHead>
              <TableHead className="font-bold">{t('customers.table.created_at', 'วันที่เพิ่ม')}</TableHead>
              <TableHead className="text-right font-bold">{t('customers.table.actions', 'จัดการ')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const prof = profilesMap[c.id] || calcCustomerCreditProfile(c, [], []);
              return (
                <TableRow key={c.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell>
                    <Link to="/customers/$id" params={{ id: c.id }} className="font-bold text-foreground hover:text-primary hover:underline flex items-center gap-1.5">
                      {c.fullName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CreditScoreBadge profile={prof} size="sm" showRate />
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-foreground">
                        {prof.totalLoansCount === 0 ? (
                          <span className="text-muted-foreground">ยังไม่มีสัญญา</span>
                        ) : (
                          <span>กู้ {prof.totalLoansCount} สัญญา <span className="text-emerald-600 dark:text-emerald-400 font-black">(ปิด {prof.completedLoansCount})</span></span>
                        )}
                      </p>
                      {prof.totalLoansCount > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          จ่ายตรง <span className="font-bold text-foreground">{prof.onTimePaymentRate}%</span>
                          {prof.rollPenaltyCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">· ท+ป {prof.rollPenaltyCount} ครั้ง</span>}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{c.idCard || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }} className="h-8 w-8">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        onConfirm={() => remove(c.id)}
                        title="ยืนยันการลบลูกค้า"
                        description={`คุณแน่ใจหรือไม่ว่าต้องการลบลูกค้ารายนี้?\nข้อมูลสัญญาที่เกี่ยวข้องทั้งหมดจะยังคงอยู่ แต่ลูกค้านี้จะถูกลบออกจากรายชื่อ`}
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </ConfirmDelete>
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
        {filtered.map((c) => {
          const prof = profilesMap[c.id] || calcCustomerCreditProfile(c, [], []);
          return (
            <div key={c.id} className="group rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-elevated)] active:scale-[0.98] transition-all relative cursor-pointer">
              {/* Full card clickable link overlay */}
              <Link
                to="/customers/$id"
                params={{ id: c.id }}
                className="absolute inset-0 z-0 rounded-2xl"
                aria-label={`ข้อมูลลูกค้า ${c.fullName}`}
              />

              <div className="relative z-10 pointer-events-none">
                <div className="flex justify-between items-start mb-2.5">
                  <div>
                    <div className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">
                      {c.fullName}
                    </div>
                    <div className="mt-1">
                      <CreditScoreBadge profile={prof} size="xs" showRate />
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-black text-foreground">{prof.totalLoansCount} สัญญา</span>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">ปิดแล้ว {prof.completedLoansCount}</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-xl border border-border/50">
                  <div className="flex justify-between items-center">
                    <span>จ่ายตรงเวลา:</span>
                    <span className="font-bold text-foreground">{prof.onTimePaymentRate}%</span>
                  </div>
                  {prof.rollPenaltyCount > 0 && (
                    <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-bold">
                      <span>ประวัติทบดอก (ท+ป):</span>
                      <span>{prof.rollPenaltyCount} ครั้ง</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{c.phone || "—"}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-border flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                  <div className="flex gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => { setEditing(c); setOpen(true); }} className="h-8 px-3">
                      <Pencil className="mr-1 h-3.5 w-3.5" />{t('actions.edit', 'แก้ไข')}
                    </Button>
                    <ConfirmDelete
                      onConfirm={() => remove(c.id)}
                      title="ยืนยันการลบลูกค้า"
                      description="คุณแน่ใจหรือไม่ว่าต้องการลบลูกค้ารายนี้?"
                    >
                      <Button variant="outline" size="sm" className="h-8 px-3 text-destructive border-destructive/20 hover:bg-destructive/10">
                        <Trash2 className="mr-1 h-3.5 w-3.5" />{t('actions.delete', 'ลบ')}
                      </Button>
                    </ConfirmDelete>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground bg-card rounded-xl border border-dashed border-border mt-4">
          {t('messages.no_data')}
        </div>
      )}
    </div>
  );
}

function CustomerForm({ editing, existingCustomers = [], onDone, onSubmit }: { editing: Customer | null; existingCustomers?: Customer[]; onDone: () => void; onSubmit: (data: any) => Promise<any> }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    fullName: editing?.fullName ?? "",
    phone: editing?.phone ?? "",
    idCard: editing?.idCard ?? "",
    address: editing?.address ?? "",
    notes: editing?.notes ?? "",
    riskLevel: editing?.riskLevel ?? "low",
    category: editing?.category ?? "new",
  });
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isDuplicateName = useMemo(() => {
    const name = form.fullName.trim().toLowerCase();
    if (!name) return false;
    return existingCustomers.some(
      (c) => c.id !== editing?.id && c.fullName.trim().toLowerCase() === name
    );
  }, [form.fullName, existingCustomers, editing]);

  useEffect(() => {
    setNewFiles([]);
    if (editing) {
      setForm({
        fullName: editing.fullName ?? "",
        phone: editing.phone ?? "",
        idCard: editing.idCard ?? "",
        address: editing.address ?? "",
        notes: editing.notes ?? "",
        riskLevel: editing.riskLevel ?? "low",
        category: editing.category ?? "new",
      });
      getCustomerAttachments(editing.id).then(setAttachments).catch(() => setAttachments([]));
    } else {
      setForm({
        fullName: "",
        phone: "",
        idCard: "",
        address: "",
        notes: "",
        riskLevel: "low",
        category: "new",
      });
      setAttachments([]);
    }
  }, [editing]);

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setNewFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  };

  const removeNewFile = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = async (id: string) => {
    try {
      await deleteCustomerAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      toast.success("ลบไฟล์แนบเรียบร้อยแล้ว");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDuplicateName) {
      toast.error(`พบรายชื่อลูกค้า "${form.fullName.trim()}" มีอยู่ในระบบแล้ว`);
      return;
    }
    const rawIdCard = form.idCard.replace(/\D/g, '');
    if (rawIdCard.length > 0 && rawIdCard.length < 13) {
      toast.error("รหัสบัตรประชาชนต้องมี 13 หลัก");
      return;
    }
    setBusy(true);
    try {
      const customer = await onSubmit(form);
      if (customer?.id && newFiles.length > 0) {
        setUploading(true);
        for (const file of newFiles) {
          try {
            await uploadCustomerAttachment(customer.id, file);
          } catch (error: any) {
            toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${error.message}`);
          }
        }
        setUploading(false);
      }
      if (!editing) {
        setForm({
          fullName: "",
          phone: "",
          idCard: "",
          address: "",
          notes: "",
          riskLevel: "low",
          category: "new",
        });
        setNewFiles([]);
        setAttachments([]);
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 10) val = val.slice(0, 10);
    
    let formatted = val;
    if (val.length > 6) {
      formatted = `${val.slice(0, 3)}-${val.slice(3, 6)}-${val.slice(6)}`;
    } else if (val.length > 3) {
      formatted = `${val.slice(0, 3)}-${val.slice(3)}`;
    }
    
    setForm({ ...form, phone: formatted });
  };

  const handleIdCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 13) val = val.slice(0, 13);
    
    let formatted = val;
    if (val.length > 12) {
      formatted = `${val.slice(0, 1)}-${val.slice(1, 5)}-${val.slice(5, 10)}-${val.slice(10, 12)}-${val.slice(12)}`;
    } else if (val.length > 10) {
      formatted = `${val.slice(0, 1)}-${val.slice(1, 5)}-${val.slice(5, 10)}-${val.slice(10)}`;
    } else if (val.length > 5) {
      formatted = `${val.slice(0, 1)}-${val.slice(1, 5)}-${val.slice(5)}`;
    } else if (val.length > 1) {
      formatted = `${val.slice(0, 1)}-${val.slice(1)}`;
    }
    
    setForm({ ...form, idCard: formatted });
  };

  return (
    <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">{editing ? t('customers.edit') : t('customers.add_new')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('customers.table.name')}</Label>
          <Input 
            required 
            value={form.fullName} 
            onChange={(e) => setForm({ ...form, fullName: e.target.value })} 
            className={`bg-muted/20 ${isDuplicateName ? "border-destructive focus-visible:ring-destructive" : ""}`} 
          />
          {isDuplicateName && (
            <p className="text-xs font-bold text-destructive flex items-center gap-1 mt-1">
              ⚠️ พบรายชื่อลูกค้านี้มีอยู่ในระบบแล้ว (ไม่สามารถสร้างชื่อซ้ำกันได้)
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('customers.table.phone')}</Label>
            <Input value={form.phone} onChange={handlePhoneChange} placeholder="081-234-5678" className="bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('customers.table.id_card')}</Label>
            <Input value={form.idCard} onChange={handleIdCardChange} placeholder="1-2345-67890-12-3" className="bg-muted/20 font-mono text-xs" />
          </div>
        </div>
         <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ระดับความเสี่ยง</Label>
            <Select value={form.riskLevel} onValueChange={(v) => setForm({ ...form, riskLevel: v })}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('customers.risk.low')}</SelectItem>
                <SelectItem value="medium">{t('customers.risk.medium')}</SelectItem>
                <SelectItem value="high">{t('customers.risk.high')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">กลุ่มลูกค้า</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">ลูกค้าใหม่</SelectItem>
                <SelectItem value="regular">ลูกค้าประจำ</SelectItem>
                <SelectItem value="good">เครดิตดี</SelectItem>
                <SelectItem value="blocked">เครดิตไม่ผ่าน</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ที่อยู่</Label>
          <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-muted/20" placeholder="ระบุที่อยู่ปัจจุบัน..." />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">หมายเหตุ</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-muted/20" placeholder="ระบุข้อมูลเพิ่มเติม..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-attachments" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            เอกสารแนบ (ไม่บังคับ) — สัญญา, บัตรประชาชน, รูปคู่บัตร ฯลฯ แนบได้หลายไฟล์
          </Label>
          <Input
            id="customer-attachments"
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleFilesChange}
            className="bg-muted/20 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-primary-foreground file:transition-colors hover:file:bg-primary/90"
          />

          {newFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {newFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px]">
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button type="button" onClick={() => removeNewFile(i)} title="ลบไฟล์นี้ออกจากรายการ">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pt-1">
              {attachments.map((att) => {
                const url = resolveFileUrl(att.filePath);
                const isImage = isImageFileName(att.fileName ?? "");
                return (
                  <div key={att.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                    <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
                      {isImage ? (
                        <img src={url} alt={att.fileName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted/50">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(att.id)}
                      title="ลบไฟล์นี้"
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="pt-4">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (uploading ? "กำลังอัปโหลดไฟล์แนบ..." : "...") : t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
