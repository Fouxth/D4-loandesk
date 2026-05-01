import { logActivity, getCustomers, createCustomer, updateCustomer, deleteCustomer } from "@/lib/services";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search, Trash2, Pencil, Phone, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/utils/format";

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

function Customers() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = async () => {
    try {
      const data = await getCustomers();
      setRows((data ?? []) as Customer[]);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };
  
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || 
           r.fullName.toLowerCase().includes(q) || 
           (r.phone && r.phone.toLowerCase().includes(q)) || 
           (r.idCard && r.idCard.toLowerCase().includes(q));
  });

  const remove = async (id: string) => {
    if (!confirm(t('common.confirm_delete', 'ยืนยันการลบ?'))) return;
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
      if (editing) {
        await updateCustomer({ id: editing.id, ...formData });
      } else {
        await createCustomer(formData);
      }
      try {
        await logActivity({ 
          action: editing ? "update_customer" : "create_customer", 
          entity_type: "customer", 
          entity_id: editing?.id, 
          details: { name: formData.fullName } 
        });
      } catch (logError) {
        console.error("Activity log failed:", logError);
      }
      toast.success(t('common.save_success', 'บันทึกเรียบร้อยแล้ว'));
      setOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
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
            <CustomerForm editing={editing} onDone={() => { setOpen(false); load(); }} onSubmit={submit} />
          </Dialog>
        }
      />

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
              <TableHead className="font-bold">{t('customers.table.name')}</TableHead>
              <TableHead className="font-bold">{t('customers.table.phone')}</TableHead>
               <TableHead className="font-bold">{t('customers.table.id_card')}</TableHead>
              <TableHead className="font-bold">ระดับลูกค้า</TableHead>
              <TableHead className="font-bold">{t('customers.table.risk')}</TableHead>
              <TableHead className="font-bold">{t('customers.table.created_at')}</TableHead>
              <TableHead className="text-right font-bold">{t('customers.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/20 transition-colors">
                <TableCell>
                  <Link to="/customers/$id" params={{ id: c.id }} className="font-semibold text-primary hover:underline">
                    {c.fullName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                 <TableCell className="text-muted-foreground font-mono text-xs">{c.idCard || "—"}</TableCell>
                <TableCell>
                  <StatusBadge tone={c.category === "blocked" ? "destructive" : c.category === "good" ? "success" : c.category === "regular" ? "info" : "muted"}>
                    {t(`customers.category.${c.category}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={c.riskLevel === "high" ? "destructive" : c.riskLevel === "medium" ? "warning" : "success"}>
                    {t(`customers.risk.${c.riskLevel}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDate(c.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }} className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)} className="h-8 w-8 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] active:scale-[0.98] transition-all">
            <div className="flex justify-between items-start mb-2">
              <Link to="/customers/$id" params={{ id: c.id }} className="font-bold text-primary text-lg">
                {c.fullName}
              </Link>
               <div className="flex flex-col items-end gap-1">
                <StatusBadge tone={c.category === "blocked" ? "destructive" : c.category === "good" ? "success" : c.category === "regular" ? "info" : "muted"}>
                  {t(`customers.category.${c.category}`)}
                </StatusBadge>
                <StatusBadge tone={c.riskLevel === "high" ? "destructive" : c.riskLevel === "medium" ? "warning" : "success"}>
                  {t(`customers.risk.${c.riskLevel}`)}
                </StatusBadge>
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" />
                <span>{c.phone || "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5" />
                <span className="font-mono text-xs">{c.idCard || "—"}</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">{formatDate(c.createdAt)}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditing(c); setOpen(true); }} className="h-8 px-3">
                  <Pencil className="mr-1 h-3.5 w-3.5" />{t('actions.edit', 'แก้ไข')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(c.id)} className="h-8 px-3 text-destructive border-destructive/20 hover:bg-destructive/10">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />{t('actions.delete', 'ลบ')}
                </Button>
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

function CustomerForm({ editing, onDone, onSubmit }: { editing: Customer | null; onDone: () => void; onSubmit: (data: any) => Promise<void> }) {
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
    }
  }, [editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawIdCard = form.idCard.replace(/\D/g, '');
    if (rawIdCard.length > 0 && rawIdCard.length < 13) {
      toast.error("รหัสบัตรประชาชนต้องมี 13 หลัก");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(form);
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
    <DialogContent className="max-w-lg w-[95vw] sm:w-full">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">{editing ? t('customers.edit') : t('customers.add_new')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('customers.table.name')}</Label>
          <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="bg-muted/20" />
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
        <DialogFooter className="pt-4">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "..." : t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
