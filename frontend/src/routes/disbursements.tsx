import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, 
  HandCoins, 
  Wallet,
  Users,
  FileText,
  Filter, 
  Calendar as CalendarIcon,
  Download,
  Percent
} from "lucide-react";
import { formatTHB, formatDate } from "@/utils/format";
import { getLoans } from "@/lib/services";
import { getLoanCategory, LOAN_CATEGORY_OPTIONS } from "@/utils/loanType";
import { StatusBadge, getEffectiveStatus, loanStatusTone, getLoanStatusLabel } from "@/components/StatusBadge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { useSessionState } from "@/hooks/useSessionState";

export const Route = createFileRoute("/disbursements")({
  component: () => (<ProtectedRoute><AppLayout><Disbursements /></AppLayout></ProtectedRoute>),
});

const CATEGORY_OPTIONS = ["ทั้งหมด", ...LOAN_CATEGORY_OPTIONS];

function Disbursements() {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("disbursements_search", "");
  const [categoryFilter, setCategoryFilter] = useSessionState("disbursements_cat_filter", "ทั้งหมด");
  const [viewMode, setViewMode] = useSessionState<"day" | "month" | "all">("disbursements_view_mode", "day");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedMonth, setSelectedMonth] = useSessionState("disbursements_month", format(new Date(), "yyyy-MM"));

  useEffect(() => {
    setLoading(true);
    getLoans()
      .then((data) => setLoans(data ?? []))
      .catch((err) => {
        console.error("Failed to load loans:", err);
        toast.error("ไม่สามารถโหลดข้อมูลยอดเงินออกได้");
      })
      .finally(() => setLoading(false));
  }, []);

  // Generate last 12 months for selector
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

  const filtered = useMemo(() => {
    return loans.filter((l) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (l.loanNumber && l.loanNumber.toLowerCase().includes(q)) ||
        (l.customerName && l.customerName.toLowerCase().includes(q)) ||
        (l.pawnItem && l.pawnItem.toLowerCase().includes(q));

      const category = getLoanCategory(l);
      const matchesCategory =
        categoryFilter === "ทั้งหมด" || category === categoryFilter;

      const startDateRaw = l.startDate || l.start_date || l.createdAt || l.created_at;
      const startDateStr = startDateRaw
        ? String(startDateRaw).substring(0, 10)
        : "";

      let matchesTime = true;
      if (viewMode === "day" && date) {
        matchesTime = startDateStr === format(date, "yyyy-MM-dd");
      } else if (viewMode === "month" && selectedMonth) {
        matchesTime = startDateStr.startsWith(selectedMonth);
      }

      return matchesSearch && matchesCategory && matchesTime;
    });
  }, [loans, search, categoryFilter, viewMode, date, selectedMonth]);

  // Aggregate statistics
  const totalPrincipal = useMemo(
    () => filtered.reduce((acc, l) => acc + Number(l.principal || 0), 0),
    [filtered]
  );

  const totalDeductions = useMemo(
    () =>
      filtered.reduce(
        (acc, l) =>
          acc +
          Number(l.documentFee || 0) +
          Number(l.advanceFee || 0) +
          Number(l.parkingFee || 0),
        0
      ),
    [filtered]
  );

  const totalNetDisbursed = useMemo(
    () => Math.max(totalPrincipal - totalDeductions, 0),
    [totalPrincipal, totalDeductions]
  );

  const uniqueCustomerCount = useMemo(() => {
    const set = new Set<string>();
    for (const l of filtered) {
      if (l.customerId) set.add(l.customerId);
      else if (l.customerName) set.add(l.customerName);
    }
    return set.size;
  }, [filtered]);

  const contractCount = filtered.length;

  const exportExcel = async () => {
    if (filtered.length === 0) {
      toast.error("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const data = filtered.map((l, index) => {
        const principal = Number(l.principal || 0);
        const docFee = Number(l.documentFee || 0);
        const advFee = Number(l.advanceFee || 0);
        const parkFee = Number(l.parkingFee || 0);
        const totalFees = docFee + advFee + parkFee;
        const net = Math.max(principal - totalFees, 0);

        return {
          ลำดับ: index + 1,
          วันที่ปล่อย: formatDate(l.startDate || l.start_date || l.createdAt),
          เลขที่สัญญา: l.loanNumber,
          ชื่อลูกค้า: l.customerName,
          ประเภทสัญญา: getLoanCategory(l),
          "วงเงินจัด (เงินต้น)": principal,
          ค่าเอกสาร: docFee,
          ค่าบริการล่วงหน้า: advFee,
          ค่าฝากจอด: parkFee,
          รวมค่าธรรมเนียมหัก: totalFees,
          "ยอดเงินออกสุทธิ (ที่ลูกค้าได้รับ)": net,
          อัตราดอกเบี้ย: `${l.interestRate || 0}%`,
          งวดชำระ: `${l.installmentsCount || 1} งวด`,
          ค่างวด: Number(l.installmentAmount || 0),
          สถานะสัญญา: l.status || "active",
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ยอดเงินออก");

      const timeLabel =
        viewMode === "day" && date
          ? format(date, "yyyy-MM-dd")
          : viewMode === "month"
          ? selectedMonth
          : "ทั้งหมด";

      XLSX.writeFile(workbook, `loan-disbursements-${timeLabel}.xlsx`);
      toast.success("ส่งออกไฟล์ Excel เรียบร้อยแล้ว");
    } catch (err: any) {
      console.error("Export Excel error:", err);
      toast.error("ส่งออกไฟล์ไม่สำเร็จ");
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-4 pb-20">
      <PageHeader 
        title="ยอดเงินออก (ปล่อยกู้)" 
        description="ตรวจสอบและติดตามยอดเงินที่ปล่อยออก สัญญาใหม่ และค่าธรรมเนียมหัก ณ ที่จ่าย"
        actions={
          <Button
            onClick={exportExcel}
            variant="outline"
            className="rounded-xl border-border/60 bg-card shadow-sm font-bold h-11"
          >
            <Download className="mr-2 h-4 w-4 text-primary" />
            ส่งออก Excel (.xlsx)
          </Button>
        }
      />

      {/* Filter Controls Bar */}
      <div className="flex flex-col xl:flex-row items-center gap-3">
        <div className="relative max-w-xs flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="ค้นหาลูกค้า/สัญญา/ทรัพย์สิน..." 
            className="pl-9 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20" 
          />
        </div>

        {/* View Mode Switcher */}
        <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50 h-11">
          <button 
            onClick={() => setViewMode("day")}
            className={cn("px-4 rounded-lg text-xs font-bold transition-all", viewMode === "day" ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
          >รายวัน</button>
          <button 
            onClick={() => setViewMode("month")}
            className={cn("px-4 rounded-lg text-xs font-bold transition-all", viewMode === "month" ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
          >รายเดือน</button>
          <button 
            onClick={() => setViewMode("all")}
            className={cn("px-4 rounded-lg text-xs font-bold transition-all", viewMode === "all" ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
          >ทั้งหมด</button>
        </div>
        
        {viewMode === "day" && (
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
        )}

        {viewMode === "month" && (
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

        {/* Category Filter */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full lg:w-44 bg-card border-border/50 h-11 rounded-xl shadow-sm focus:ring-primary/20 font-medium">
            <SelectValue placeholder="ประเภทสัญญา" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Principal Disbursed */}
        <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
            <HandCoins className="h-6 w-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold text-primary/80 uppercase tracking-widest leading-none mb-1">
              ยอดจัดปล่อยกู้รวม
            </span>
            <span className="text-xl font-black text-primary truncate">{formatTHB(totalPrincipal)}</span>
          </div>
        </div>

        {/* Net Disbursed (Actual Cash Out) */}
        <div className="p-4 bg-warning/10 rounded-2xl border border-warning/20 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-warning/15 flex items-center justify-center text-warning">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold text-warning/80 uppercase tracking-widest leading-none mb-1">
              เงินออกสุทธิ (หักธรรมเนียม)
            </span>
            <span className="text-xl font-black text-warning truncate">{formatTHB(totalNetDisbursed)}</span>
          </div>
        </div>

        {/* Customer & Contract Counts */}
        <div className="p-4 bg-info/10 rounded-2xl border border-info/20 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-info/15 flex items-center justify-center text-info">
            <Users className="h-6 w-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold text-info/80 uppercase tracking-widest leading-none mb-1">
              จำนวนลูกค้า / สัญญา
            </span>
            <span className="text-lg font-black text-info truncate">
              {uniqueCustomerCount} คน · {contractCount} สัญญา
            </span>
          </div>
        </div>

        {/* Total Fee Deductions */}
        <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Percent className="h-6 w-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-widest leading-none mb-1">
              ค่าธรรมเนียมหัก ณ ที่จ่าย
            </span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 truncate">
              {formatTHB(totalDeductions)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                <TableHead className="font-bold pl-6">วันที่ปล่อยกู้</TableHead>
                <TableHead className="font-bold">เลขที่สัญญา</TableHead>
                <TableHead className="font-bold">ชื่อลูกค้า</TableHead>
                <TableHead className="font-bold">ประเภทสัญญา</TableHead>
                <TableHead className="text-right font-bold">ยอดจัด (เงินต้น)</TableHead>
                <TableHead className="text-right font-bold">หักธรรมเนียม</TableHead>
                <TableHead className="text-right font-bold">เงินออกสุทธิ</TableHead>
                <TableHead className="text-center font-bold pr-6">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => {
                const principal = Number(l.principal || 0);
                const docFee = Number(l.documentFee || 0);
                const advFee = Number(l.advanceFee || 0);
                const parkFee = Number(l.parkingFee || 0);
                const totalFees = docFee + advFee + parkFee;
                const net = Math.max(principal - totalFees, 0);
                const category = getLoanCategory(l);

                return (
                  <TableRow key={l.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="pl-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm text-foreground">
                          {formatDate(l.startDate || l.start_date || l.createdAt)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          ครบกำหนด: {l.isIndefinite ? "ไม่มีกำหนด" : formatDate(l.dueDate || l.due_date)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link to="/loans/$loanId" params={{ loanId: l.id }} className="font-semibold text-primary hover:underline text-sm flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 opacity-70" />
                        {l.loanNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-sm text-foreground">
                      {l.customerName}
                      {l.pawnItem && (
                        <span className="block text-[11px] text-muted-foreground">
                          ทรัพย์สิน: {l.pawnItem}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-muted text-muted-foreground border border-border/50">
                        {category}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-foreground text-sm">
                      {formatTHB(principal)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {totalFees > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-destructive">-{formatTHB(totalFees)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {[
                              docFee > 0 ? `เอกสาร ${docFee}` : null,
                              advFee > 0 ? `บริการ ${advFee}` : null,
                              parkFee > 0 ? `จอด ${parkFee}` : null,
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-black text-warning text-sm">
                      {formatTHB(net)}
                    </TableCell>
                    <TableCell className="text-center pr-6">
                      <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                        {getLoanStatusLabel(l)}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-border/50">
          {filtered.map((l) => {
            const principal = Number(l.principal || 0);
            const docFee = Number(l.documentFee || 0);
            const advFee = Number(l.advanceFee || 0);
            const parkFee = Number(l.parkingFee || 0);
            const totalFees = docFee + advFee + parkFee;
            const net = Math.max(principal - totalFees, 0);
            const category = getLoanCategory(l);

            return (
              <div key={l.id} className="p-4 space-y-3 hover:bg-muted/10 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link to="/loans/$loanId" params={{ loanId: l.id }} className="font-bold text-sm text-primary hover:underline">
                        {l.loanNumber}
                      </Link>
                      <span className="text-[11px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {category}
                      </span>
                    </div>
                    <p className="font-bold text-foreground text-sm mt-0.5">{l.customerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      วันที่ปล่อย: {formatDate(l.startDate || l.start_date || l.createdAt)}
                    </p>
                  </div>
                  <StatusBadge tone={loanStatusTone(getEffectiveStatus(l))}>
                    {getLoanStatusLabel(l)}
                  </StatusBadge>
                </div>

                <div className="bg-muted/30 rounded-xl p-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">ยอดจัด (เงินต้น)</span>
                    <span className="font-bold text-foreground">{formatTHB(principal)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">หักธรรมเนียม</span>
                    <span className="font-bold text-destructive">
                      {totalFees > 0 ? `-${formatTHB(totalFees)}` : "—"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">เงินออกสุทธิ</span>
                    <span className="font-black text-warning">{formatTHB(net)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && !loading && (
          <div className="py-20 text-center text-muted-foreground">
             <Filter className="h-10 w-10 mx-auto mb-3 opacity-20" />
             <p className="text-sm font-medium">ไม่พบรายการเงินออกที่ค้นหา</p>
          </div>
        )}
      </div>
    </div>
  );
}
