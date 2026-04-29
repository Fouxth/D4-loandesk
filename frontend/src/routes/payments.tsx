import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, 
  Banknote, 
  Calendar, 
  CreditCard, 
  Filter, 
  History, 
  Smartphone, 
  TrendingUp 
} from "lucide-react";
import { formatTHB, formatDate } from "@/utils/format";
import { getPayments } from "@/lib/services";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

export const Route = createFileRoute("/payments")({
  component: () => (<ProtectedRoute><AppLayout><Payments /></AppLayout></ProtectedRoute>),
});

const METHOD_LABELS: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนผ่านธนาคาร",
  mobile: "โมบายแบงก์กิ้ง",
  other: "อื่นๆ",
};

const METHOD_ICONS: Record<string, any> = {
  cash: Banknote,
  bank_transfer: CreditCard,
  mobile: Smartphone,
  other: History,
};

import { format } from "date-fns";
import { th } from "date-fns/locale";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/utils/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Wallet, Landmark } from "lucide-react";

function Payments() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"day" | "month">("day");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  
  useEffect(() => {
    getPayments().then(data => setRows(data ?? []));
  }, []);

  // Generate last 12 months (Fixed UTC bug by using date-fns format)
  const monthOptions = useMemo(() => {
    const options = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const val = format(m, "yyyy-MM");
      const label = format(m, "MMMM yyyy", { locale: th });
      options.push({ val, label });
    }
    return options;
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || 
           (r.loanNumber && r.loanNumber.toLowerCase().includes(q)) || 
           (r.customerName && r.customerName.toLowerCase().includes(q));
    const matchesMethod = methodFilter === "all" || r.method === methodFilter;
    
    let matchesTime = true;
    if (viewMode === "day" && date) {
      matchesTime = r.paymentDate.startsWith(format(date, "yyyy-MM-dd"));
    } else if (viewMode === "month" && selectedMonth) {
      matchesTime = r.paymentDate.startsWith(selectedMonth);
    }
    
    return matchesSearch && matchesMethod && matchesTime;
  });

  const totalAmount = filtered.reduce((a, p) => a + Number(p.amount), 0);
  const cashTotal = filtered.filter(r => r.method === "cash").reduce((a, p) => a + Number(p.amount), 0);
  const bankTotal = filtered.filter(r => r.method === "bank_transfer").reduce((a, p) => a + Number(p.amount), 0);
  const mobileTotal = filtered.filter(r => r.method === "mobile").reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div className="animate-in fade-in duration-500 space-y-4 pb-20">
      <PageHeader 
        title="ประวัติการชำระเงิน" 
        description={`ตรวจสอบและจัดการรายการรับชำระเงิน`} 
      />

      <div className="flex flex-col xl:flex-row items-center gap-3">
        <div className="relative max-w-xs flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="ค้นหาลูกค้า/สัญญา..." 
            className="pl-9 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20" 
          />
        </div>

        <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50 h-11">
          <button 
            onClick={() => setViewMode("day")}
            className={cn("px-4 rounded-lg text-xs font-bold transition-all", viewMode === "day" ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
          >รายวัน</button>
          <button 
            onClick={() => setViewMode("month")}
            className={cn("px-4 rounded-lg text-xs font-bold transition-all", viewMode === "month" ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
          >รายเดือน</button>
        </div>
        
        {viewMode === "day" ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full lg:w-[200px] h-11 justify-start text-left font-medium rounded-xl bg-card border-border/50 shadow-sm",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                {date ? format(date, "d MMM yyyy", { locale: th }) : <span>เลือกวันที่</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl border-border" align="start">
              <CalendarComponent
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                locale={th}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full lg:w-48 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20 font-medium">
              <SelectValue placeholder="เลือกเดือน" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(opt => (
                <SelectItem key={opt.val} value={opt.val}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-full lg:w-40 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20 font-medium">
            <SelectValue placeholder="ทุกช่องทาง" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกช่องทาง</SelectItem>
            <SelectItem value="cash">เงินสด</SelectItem>
            <SelectItem value="bank_transfer">โอนเงิน</SelectItem>
            <SelectItem value="mobile">แอปฯ มือถือ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Breakdown Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest leading-none mb-1">
              ยอด{viewMode === "day" ? "รายวัน" : "รายเดือน"}
            </span>
            <span className="text-lg font-black text-primary">{formatTHB(totalAmount)}</span>
          </div>
        </div>

        <div className="p-4 bg-success/5 rounded-2xl border border-success/10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center text-success text-xs font-bold">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-success/60 uppercase tracking-widest leading-none mb-1">ยอดเงินสด</span>
            <span className="text-lg font-black text-success">{formatTHB(cashTotal)}</span>
          </div>
        </div>

        <div className="p-4 bg-info/5 rounded-2xl border border-info/10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-info/10 flex items-center justify-center text-info">
            <Landmark className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-info/60 uppercase tracking-widest leading-none mb-1">ยอดโอนเงิน</span>
            <span className="text-lg font-black text-info">{formatTHB(bankTotal)}</span>
          </div>
        </div>

        <div className="p-4 bg-warning/5 rounded-2xl border border-warning/10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-warning/60 uppercase tracking-widest leading-none mb-1">ยอดแอปฯ</span>
            <span className="text-lg font-black text-warning">{formatTHB(mobileTotal)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5 border-b border-border/50">
                <TableHead className="font-bold pl-6">วันที่ชำระ</TableHead>
                <TableHead className="font-bold">เลขที่สัญญา</TableHead>
                <TableHead className="font-bold">ชื่อลูกค้า</TableHead>
                <TableHead className="font-bold">ช่องทาง</TableHead>
                <TableHead className="text-right font-bold pr-6">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const Icon = METHOD_ICONS[p.method] || History;
                return (
                  <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="pl-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm text-foreground">{formatDate(p.paymentDate)}</span>
                        <span className="text-[10px] text-muted-foreground">งวดที่ #{p.installmentNumber ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link to="/loans/$loanId" params={{ loanId: p.loanId }} className="font-semibold text-primary hover:underline text-sm">
                        {p.loanNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-sm text-foreground">{p.customerName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{METHOD_LABELS[p.method] || p.method}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6 font-bold text-success text-sm">
                      {formatTHB(p.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-border/50">
          {filtered.map((p) => {
            const Icon = METHOD_ICONS[p.method] || History;
            return (
              <div key={p.id} className="p-5 flex items-center justify-between hover:bg-muted/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                       <span className="font-bold text-sm">{p.customerName}</span>
                       <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.loanNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                       <span className="text-[10px] font-medium text-muted-foreground">{formatDate(p.paymentDate)}</span>
                       <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                       <span className="text-[10px] font-medium text-muted-foreground uppercase">{METHOD_LABELS[p.method] || p.method}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-success">{formatTHB(p.amount)}</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase">งวด #{p.installmentNumber}</p>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
             <Filter className="h-10 w-10 mx-auto mb-3 opacity-20" />
             <p className="text-sm font-medium">ไม่พบรายการชำระเงินที่ค้นหา</p>
          </div>
        )}
      </div>
    </div>
  );
}
