import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  getSettings, 
  updateSetting, 
  getLoans, 
  getPayments, 
  getCustomers,
  getExpenses,
  changePassword,
  testLineNotify
} from "@/lib/services";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  User, 
  Moon, 
  Sun, 
  LogOut, 
  Shield, 
  Building2, 
  Percent, 
  Bell, 
  Database,
  Smartphone,
  Users,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { cn } from "@/utils/utils";
import {
  DEFAULT_LENDING_CONFIG,
  LENDING_RATE_CATEGORIES,
  normalizeLendingConfig,
  type LendingConfig,
  type LendingRateKey,
} from "@/utils/lendingConfig";

export const Route = createFileRoute("/settings")({
  component: () => (<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>),
});

function Settings() {
  const { user, roles, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { refreshSettings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("profile");

  // Form States
  const [business, setBusiness] = useState({ nameTH: "", nameEN: "", phone: "", address: "" });
  const [lending, setLending] = useState<LendingConfig>(DEFAULT_LENDING_CONFIG);
  const [limits, setLimits] = useState<any[]>([]);
  const [lineUserIds, setLineUserIds] = useState("");
  const [lineEnabled, setLineEnabled] = useState(false);
  const [lineEvents, setLineEvents] = useState({
    payment: true,
    loan: true,
    expense: true,
    fraud: true,
    refinance: true,
    completed: true,
    pawn_forfeited: true,
    morning_digest: true,
    overdue_alert: true,
    late_fee: true,
  });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });

  useEffect(() => {
    (async () => {
      try {
        const data = await getSettings();
        if (data.business_profile) {
          setBusiness({
            nameTH: data.business_profile.nameTH || "",
            nameEN: data.business_profile.nameEN || "",
            phone: data.business_profile.phone || "",
            address: data.business_profile.address || ""
          });
        }
        if (data.lending_config) setLending(normalizeLendingConfig(data.lending_config));
        
        if (data.customer_limits && Array.isArray(data.customer_limits)) {
          setLimits(data.customer_limits);
        } else {
          setLimits([
            { id: 'new', label: 'ลูกค้าใหม่', min: 1000, max: 5000 },
            { id: 'regular', label: 'ลูกค้าประจำ', min: 3000, max: 20000 },
            { id: 'good', label: 'เครดิตดี', min: 5000, max: 50000 },
            { id: 'blocked', label: 'เครดิตไม่ผ่าน', min: 0, max: 0 }
          ]);
        }
        
        if (data.line_notify) {
          const ids: string[] = Array.isArray(data.line_notify.userIds) && data.line_notify.userIds.length
            ? data.line_notify.userIds
            : data.line_notify.userId
              ? [data.line_notify.userId]
              : [];
          setLineUserIds(ids.join("\n"));
          setLineEnabled(!!data.line_notify.enabled);
          if (data.line_notify.events) {
            setLineEvents({
              payment: data.line_notify.events.payment !== false,
              loan: data.line_notify.events.loan !== false,
              expense: data.line_notify.events.expense !== false,
              fraud: data.line_notify.events.fraud !== false,
              refinance: data.line_notify.events.refinance !== false,
              completed: data.line_notify.events.completed !== false,
              pawn_forfeited: data.line_notify.events.pawn_forfeited !== false,
              morning_digest: data.line_notify.events.morning_digest !== false,
              overdue_alert: data.line_notify.events.overdue_alert !== false,
              late_fee: data.line_notify.events.late_fee !== false,
            });
          }
        }
      } catch (e) {
        toast.error("ไม่สามารถโหลดข้อมูลการตั้งค่าได้");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const ids = ["profile", "account", "lending", "limits", "notifications", "display"];
    
    const handleScroll = () => {
      // Check if we are at the bottom of the page
      const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
      if (isAtBottom) {
        setActiveSection("display");
        return;
      }

      let currentSection = "profile";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 160) {
            currentSection = id;
          }
        }
      }
      setActiveSection(currentSection);
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSaveBusiness = async () => {
    setBusy("business");
    try {
      await updateSetting("business_profile", business);
      await refreshSettings();
      toast.success("บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว");
    } catch (e) {
      toast.error("บันทึกข้อมูลล้มเหลว");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveLending = async () => {
    setBusy("lending");
    try {
      await updateSetting("lending_config", lending);
      await refreshSettings();
      toast.success("บันทึกการตั้งค่าเงินกู้เรียบร้อยแล้ว");
    } catch (e) {
      toast.error("บันทึกการตั้งค่าล้มเหลว");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveLimits = async () => {
    setBusy("limits");
    try {
      await updateSetting("customer_limits", limits);
      toast.success("บันทึกวงเงินกลุ่มลูกค้าเรียบร้อยแล้ว");
    } catch (e) {
      toast.error("บันทึกวงเงินล้มเหลว");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveLineNotify = async () => {
    setBusy("line");
    try {
      const userIds = lineUserIds
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await updateSetting("line_notify", { 
        userIds,
        userId: userIds[0] || "",
        enabled: lineEnabled, 
        events: lineEvents
      });
      await refreshSettings();
      toast.success("บันทึกการตั้งค่า LINE Notify เรียบร้อยแล้ว");
    } catch (e) {
      toast.error("บันทึกข้อมูลล้มเหลว");
    } finally {
      setBusy(null);
    }
  };

  const handleTestLineNotify = async () => {
    setBusy("line-test");
    try {
      const userIds = lineUserIds
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await updateSetting("line_notify", {
        userIds,
        userId: userIds[0] || "",
        enabled: lineEnabled,
        events: lineEvents,
      });
      await testLineNotify();
      toast.success("ส่งข้อความทดสอบไปยัง LINE แล้ว");
    } catch (e: any) {
      toast.error(e.response?.data?.error || "ส่งข้อความทดสอบไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const handleChangePassword = async () => {
    if (passwords.new !== passwords.confirm) {
      return toast.error("รหัสผ่านใหม่ไม่ตรงกัน");
    }
    if (passwords.new.length < 4) {
      return toast.error("รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
    }

    setBusy("password");
    try {
      await changePassword({ 
        currentPassword: passwords.current, 
        newPassword: passwords.new 
      });
      toast.success("เปลี่ยนรหัสผ่านสำเร็จแล้ว");
      setPasswordOpen(false);
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (e: any) {
      toast.error(e.response?.data?.error || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
    } finally {
      setBusy(null);
    }
  };

  const handleExportExcel = async () => {
    setBusy("export");
    try {
      const { utils, writeFile } = await import("xlsx");
      const [loans, payments, customers] = await Promise.all([
        getLoans(),
        getPayments(),
        getCustomers()
      ]);

      const wb = utils.book_new();

      // 1. Process all loans with calculated data
      const processedLoans = loans.map((l: any) => {
        const loanPayments = payments.filter((p: any) => (p.loanId || p.loan_id) === l.id);
        const totalPaid = loanPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        const remaining = (Number(l.totalPayable || l.total_payable) || 0) - totalPaid;

        let typeStr = "";
        const period = l.installmentsCount || l.installments_count || 0;
        const pType = (l.paymentType || l.payment_type || '').toLowerCase();
        
        if (pType === 'daily') {
          if (period === 30) typeStr = "ราย 1 เดือน";
          else typeStr = `ราย ${period} วัน`;
        } else if (pType === 'weekly') {
          typeStr = `รายสัปดาห์ (${period} งวด)`;
        } else if (pType === 'monthly') {
          typeStr = `รายเดือน (${period} งวด)`;
        } else {
          typeStr = `${l.paymentType} (${period})`;
        }

        const formatD = (d: string) => {
          if (!d) return "";
          const date = new Date(d);
          if (isNaN(date.getTime())) return d;
          return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        };

        return {
          "เลขที่สัญญา": l.loanNumber || l.loan_number,
          "ชื่อลูกค้า": l.customerName || l.customer_name,
          "ประเภท": typeStr,
          "ยอดต้น": Number(l.principal),
          "ยอดกู้รวม": Number(l.totalPayable || l.total_payable),
          "ยอดที่ส่ง": totalPaid,
          "ยอดคงเหลือ": remaining > 0 ? remaining : 0,
          "สถานะ": l.status === 'active' ? '🟢 ปกติ' : l.status === 'overdue' ? '🔴 เกินกำหนด' : l.status === 'completed' ? '🔵 เสร็จสิ้น' : l.status === 'refinanced' ? '🟡 ต่อยอด/รีไฟแนนซ์' : '⚪️ ยกเลิก',
          "วันที่เริ่ม": formatD(l.startDate || l.start_date),
          "วันที่สิ้นสุด": formatD(l.dueDate || l.due_date),
          _rawType: typeStr // for grouping
        };
      });

      // 2. Create Summary Sheet (All Loans)
      const allLoansData = processedLoans.map(({ _rawType, ...rest }: any) => rest);
      allLoansData.sort((a: any, b: any) => a["ประเภท"].localeCompare(b["ประเภท"]));
      utils.book_append_sheet(wb, utils.json_to_sheet(allLoansData), "รวมทุกสัญญา");

      // 3. Create Separate Sheets for each Type
      const groups = processedLoans.reduce((acc: any, loan: any) => {
        const type = loan._rawType;
        if (!acc[type]) acc[type] = [];
        acc[type].push(loan);
        return acc;
      }, {});

      Object.keys(groups).forEach(type => {
        const groupData = groups[type].map(({ _rawType, ...rest }: any) => rest);
        
        // Add Total Row
        const totalPrincipal = groupData.reduce((sum: number, r: any) => sum + r["ยอดต้น"], 0);
        const totalPayable = groupData.reduce((sum: number, r: any) => sum + r["ยอดกู้รวม"], 0);
        const totalPaid = groupData.reduce((sum: number, r: any) => sum + r["ยอดที่ส่ง"], 0);
        const totalRemaining = groupData.reduce((sum: number, r: any) => sum + r["ยอดคงเหลือ"], 0);

        groupData.push({
          "เลขที่สัญญา": "รวมทั้งหมด",
          "ชื่อลูกค้า": `${groupData.length} สัญญา`,
          "ประเภท": "",
          "ยอดต้น": totalPrincipal,
          "ยอดกู้รวม": totalPayable,
          "ยอดที่ส่ง": totalPaid,
          "ยอดคงเหลือ": totalRemaining,
          "สถานะ": "",
          "วันที่เริ่ม": "",
          "วันที่สิ้นสุด": ""
        });

        const ws = utils.json_to_sheet(groupData);
        
        // Basic column width
        ws['!cols'] = [
          { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, 
          { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
        ];

        utils.book_append_sheet(wb, ws, type.substring(0, 31)); // Excel sheet name limit is 31 chars
      });

      // 4. Customers Sheet
      const custData = customers.map((c: any) => {
        let riskText = "";
        const risk = (c.riskLevel || c.risk_level || '').toLowerCase();
        if (risk === 'high') riskText = "🔴 สูง";
        else if (risk === 'medium') riskText = "🟡 ปานกลาง";
        else if (risk === 'low') riskText = "🟢 ต่ำ";
        else riskText = risk || "—";

        return {
          "ชื่อ-นามสกุล": c.fullName || c.full_name,
          "เบอร์โทร": c.phone,
          "เลขบัตร": c.idCard || c.id_card,
          "ความเสี่ยง": riskText,
          "ที่อยู่": c.address
        };
      });
      utils.book_append_sheet(wb, utils.json_to_sheet(custData), "รายชื่อลูกค้า");

      const fileName = `${business.nameEN || "DebtTracker"}_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      writeFile(wb, fileName);
      toast.success("ส่งออกรายงานแยกประเภทเรียบร้อยแล้ว");
    } catch (e) {
      console.error(e);
      toast.error("ไม่สามารถส่งออกข้อมูลได้");
    } finally {
      setBusy(null);
    }
  };

  const handleBackup = async () => {
    setBusy("backup");
    try {
      const data = await Promise.all([
        getLoans(),
        getPayments(),
        getCustomers(),
        getExpenses(),
        getSettings()
      ]);
      
      const backup = {
        loans: data[0],
        payments: data[1],
        customers: data[2],
        expenses: data[3],
        settings: data[4],
        timestamp: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${business.nameEN || "DebtTracker"}_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success("สำรองข้อมูลเรียบร้อยแล้ว");
    } catch (e) {
      toast.error("ไม่สามารถสำรองข้อมูลได้");
    } finally {
      setBusy(null);
    }
  };

  const navItems = [
    { id: "profile", label: "ข้อมูลร้านค้า", icon: Building2 },
    { id: "account", label: "บัญชีผู้ใช้", icon: User },
    { id: "lending", label: "ตั้งค่าเงินกู้", icon: Percent },
    { id: "limits", label: "วงเงินตามกลุ่มลูกค้า", icon: Users },
    { id: "notifications", label: "การแจ้งเตือน", icon: Bell },
    { id: "display", label: "การแสดงผล", icon: Moon },
  ];

  if (loading) return (
    <div className="flex h-[60vh] items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm font-medium">กำลังโหลดการตั้งค่า...</span>
    </div>
  );
  
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto pb-20 px-4 md:px-0">
      <PageHeader 
        title="ตั้งค่าระบบ" 
        description="จัดการข้อมูลร้านค้า บัญชีผู้ใช้ และการตั้งค่าทั่วไปของระบบ" 
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        {/* Left Sidebar Navigation */}
        <div className="space-y-2 hidden md:block">
          <nav className="flex flex-col gap-1 sticky top-8">
            {navItems.map((item) => (
              <a 
                key={item.id}
                href={`#${item.id}`} 
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group font-bold text-sm",
                  activeSection === item.id 
                    ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20" 
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                <item.icon className={cn(
                  "h-4 w-4 transition-transform",
                  activeSection === item.id ? "scale-110" : "group-hover:scale-110"
                )} /> 
                {item.label}
                {activeSection === item.id && <CheckCircle2 className="ml-auto h-3 w-3" />}
              </a>
            ))}
          </nav>
        </div>

        {/* Main Settings Content */}
        <div className="md:col-span-2 space-y-8">
          
          {/* Business Profile */}
          <section id="profile" className="scroll-mt-24 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <h3 className="font-black text-lg">ข้อมูลร้านค้า</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">ชื่อธุรกิจ (ภาษาไทย)</Label>
                  <Input 
                    value={business.nameTH} 
                    onChange={(e) => setBusiness({...business, nameTH: e.target.value})}
                    placeholder="เช่น มั่งมี การเงิน" 
                    className="h-11 rounded-xl bg-muted/20" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Business Name (English)</Label>
                  <Input 
                    value={business.nameEN} 
                    onChange={(e) => setBusiness({...business, nameEN: e.target.value})}
                    placeholder="e.g. D4-LoanDesk" 
                    className="h-11 rounded-xl bg-muted/20" 
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">เบอร์โทรศัพท์ติดต่อ</Label>
                  <Input 
                    value={business.phone} 
                    onChange={(e) => setBusiness({...business, phone: e.target.value})}
                    placeholder="08x-xxx-xxxx" 
                    className="h-11 rounded-xl bg-muted/20" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">ที่อยู่สำหรับออกใบเสร็จ / รายงาน</Label>
                <Textarea 
                  value={business.address} 
                  onChange={(e) => setBusiness({...business, address: e.target.value})}
                  placeholder="ระบุที่อยู่เต็มของคุณ..." 
                  className="rounded-xl bg-muted/20 min-h-[100px]" 
                />
              </div>
              <Button 
                onClick={handleSaveBusiness} 
                disabled={busy === "business"}
                className="rounded-xl px-8 font-bold h-11"
              >
                {busy === "business" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                บันทึกข้อมูลร้านค้า
              </Button>
            </div>
          </section>

          {/* Account Settings */}
          <section id="account" className="scroll-mt-24 space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-info/10 flex items-center justify-center text-info">
                <User className="h-4 w-4" />
              </div>
              <h3 className="font-black text-lg">บัญชีผู้ใช้</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-6 mb-8">
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary text-2xl md:text-3xl font-black border border-primary/10 shrink-0">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-lg md:text-xl text-foreground truncate">{user?.username}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Shield className="h-3 w-3 text-info" />
                    <span className="text-xs font-bold text-info uppercase tracking-wider">
                      {roles[0] === 'admin' ? 'ผู้ดูแลระบบ (Administrator)' : 'เจ้าหน้าที่ (Staff)'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button 
                  variant="outline" 
                  className="rounded-xl font-bold border-border/50 h-10 px-6"
                  onClick={() => setPasswordOpen(true)}
                >
                  เปลี่ยนรหัสผ่าน
                </Button>
                <Button variant="outline" className="rounded-xl font-bold text-destructive border-destructive/20 hover:bg-destructive/10 h-10 px-6" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> ออกจากระบบ
                </Button>
              </div>
            </div>
          </section>

          {/* Lending Settings */}
          <section id="lending" className="scroll-mt-24 space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success">
                <Percent className="h-4 w-4" />
              </div>
              <h3 className="font-black text-lg">ตั้งค่าเงินกู้</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
              <div className="space-y-3">
                <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  อัตราดอกเบี้ยตามประเภทสัญญา (%)
                </Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  {LENDING_RATE_CATEGORIES.map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <Label className="text-xs font-bold text-foreground">{label}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={lending.categoryRates[key as LendingRateKey]}
                          onChange={(e) =>
                            setLending({
                              ...lending,
                              categoryRates: {
                                ...lending.categoryRates,
                                [key]: Number(e.target.value),
                              },
                            })
                          }
                          className="h-11 rounded-xl bg-muted/20 pr-10 font-bold"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ใช้เป็นค่าเริ่มต้นเมื่อสร้างสัญญาแต่ละประเภท
                </p>
              </div>

              <div className="space-y-4 border-t border-border/50 pt-6">
                <div>
                  <span className="text-sm font-bold">สูตร ท+ป ต่อครั้ง</span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    ทบ + จ่าย + ปรับ = ยอดชำระ ท+ป (ใส่ 0 ที่ทบ/จ่าย = ใช้ยอดส่งรายวันของสัญญา)
                  </p>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">ทบ (บาท)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={lending.tpRollAmount}
                      onChange={(e) => setLending({ ...lending, tpRollAmount: Number(e.target.value) })}
                      className="h-11 rounded-xl bg-muted/20 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">จ่าย (บาท)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={lending.tpPayAmount}
                      onChange={(e) => setLending({ ...lending, tpPayAmount: Number(e.target.value) })}
                      className="h-11 rounded-xl bg-muted/20 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">ปรับ (บาท)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={lending.tpPenaltyAmount}
                      onChange={(e) => setLending({ ...lending, tpPenaltyAmount: Number(e.target.value) })}
                      className="h-11 rounded-xl bg-muted/20 font-bold"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ตัวอย่าง ส่งวันละ 200, ทบ 0 / จ่าย 0 / ปรับ 100 → ชำระ ท+ป = 500 บาท
                </p>
              </div>

              <div className="space-y-4 border-t border-border/50 pt-6">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
                  <div className="space-y-0.5">
                    <span className="text-sm font-bold">คิดค่าปรับล่าช้า</span>
                    <p className="text-[11px] text-muted-foreground">เปิดใช้กับทุกสัญญาในระบบ</p>
                  </div>
                  <Switch
                    checked={lending.applyLateFee}
                    onCheckedChange={(checked) => setLending({ ...lending, applyLateFee: checked })}
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">ค่าปรับจ่ายช้า (บาท/ชม.)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        disabled={!lending.applyLateFee}
                        value={lending.lateFeePerHour}
                        onChange={(e) => setLending({ ...lending, lateFeePerHour: Number(e.target.value) })}
                        className="h-11 rounded-xl bg-muted/20 pr-10 font-bold disabled:opacity-50"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">฿</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">จำกัดชั่วโมงคิดค่าปรับสูงสุด</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        disabled={!lending.applyLateFee}
                        value={lending.lateFeeMaxHours}
                        onChange={(e) => setLending({ ...lending, lateFeeMaxHours: Number(e.target.value) })}
                        className="h-11 rounded-xl bg-muted/20 pr-12 font-bold disabled:opacity-50"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">ชม.</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">ใส่ 0 = ไม่จำกัด</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
                <div className="space-y-0.5">
                  <span className="text-sm font-bold">หักดอกเบี้ยล่วงหน้า</span>
                  <p className="text-[11px] text-muted-foreground">หักดอกเบี้ยจากยอดเงินต้นทันทีเมื่อทำสัญญา</p>
                </div>
                <Switch 
                  checked={lending.deductInterestUpfront} 
                  onCheckedChange={(checked) => setLending({...lending, deductInterestUpfront: checked})}
                />
              </div>
              <Button 
                onClick={handleSaveLending} 
                disabled={busy === "lending"}
                className="rounded-xl px-8 font-bold h-11"
              >
                {busy === "lending" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                บันทึกการตั้งค่า
              </Button>
            </div>
          </section>

          {/* Customer Group Limits */}
          <section id="limits" className="scroll-mt-24 space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Users className="h-4 w-4" />
              </div>
              <h3 className="font-black text-lg">วงเงินตามกลุ่มลูกค้า</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              <div className="grid grid-cols-3 bg-muted/50 p-4 border-b border-border/50">
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">กลุ่มลูกค้า</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground text-center">เริ่มต้น (Min)</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground text-center">สูงสุด (Max)</div>
              </div>
              <div className="divide-y divide-border/50">
                {limits.map((group, idx) => (
                  <div key={group.id} className="grid grid-cols-3 p-4 items-center gap-2 md:gap-4 hover:bg-muted/20 transition-colors">
                    <span className="text-xs md:text-sm font-bold truncate">{group.label}</span>
                    <Input 
                      type="number" 
                      value={group.min} 
                      onChange={(e) => {
                        const newLimits = [...limits];
                        newLimits[idx].min = Number(e.target.value);
                        setLimits(newLimits);
                      }}
                      className="h-9 rounded-lg bg-muted/10 text-xs font-bold text-center" 
                    />
                    <Input 
                      type="number" 
                      value={group.max} 
                      onChange={(e) => {
                        const newLimits = [...limits];
                        newLimits[idx].max = Number(e.target.value);
                        setLimits(newLimits);
                      }}
                      className="h-9 rounded-lg bg-muted/10 text-xs font-bold text-center" 
                    />
                  </div>
                ))}
              </div>
              <div className="p-6 bg-muted/10">
                <Button 
                  onClick={handleSaveLimits} 
                  disabled={busy === "limits"}
                  className="rounded-xl px-8 font-bold h-11"
                >
                  {busy === "limits" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  บันทึกวงเงิน
                </Button>
              </div>
            </div>
          </section>

          {/* Notifications */}
          <section id="notifications" className="scroll-mt-24 space-y-4 pt-4 border-t border-border/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center text-warning">
                <Bell className="h-4 w-4" />
              </div>
              <h3 className="font-black text-lg">การแจ้งเตือน</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#06C755]/10 rounded-xl border border-[#06C755]/20 gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-[#06C755] flex items-center justify-center text-white shrink-0">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-sm font-bold text-[#06C755]">LINE Notify</span>
                    <p className="text-[11px] text-muted-foreground">แจ้งเตือนอัตโนมัติ + สรุปเช้า/ค้างชำระ ผ่าน LINE Bot</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">{lineEnabled ? 'เปิดใช้งาน' : 'ปิด'}</span>
                  <Switch checked={lineEnabled} onCheckedChange={setLineEnabled} />
                </div>
              </div>
              
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">LINE User ID (หลายคนได้ — บรรทัดละ 1 รหัส)</Label>
                    <Textarea 
                      placeholder={"U8189cf6745fc0d808977bdb0b9f22995\nUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                      value={lineUserIds}
                      onChange={(e) => setLineUserIds(e.target.value)}
                      className="bg-muted/20 font-mono min-h-[88px] text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground italic">
                      * พิมพ์คำว่า <strong>"token"</strong> ส่งหา Bot เพื่อรับรหัส User ID (เจ้าของ + ภรรยา/ลูก ใส่ได้หลายบรรทัด)
                    </p>

                    <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-5 space-y-4 text-xs md:text-sm text-left">
                      <div className="flex items-center gap-2 font-bold text-foreground">
                        <Smartphone className="h-4 w-4 text-[#06C755]" />
                        <span>วิธีการเชื่อมต่อและรับ LINE USER ID</span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4 items-center">
                        <div className="flex flex-col items-center gap-2 bg-card p-3 rounded-xl border border-border/50 shadow-sm shrink-0">
                          <img 
                            src={theme === "dark" 
                              ? "https://qr-official.line.me/gs/M_792nhdet_BW.png?oat_content=qr" 
                              : "https://qr-official.line.me/gs/M_792nhdet_GW.png?oat_content=qr"
                            } 
                            alt="LINE QR Code" 
                            className="w-24 h-24 object-contain rounded"
                          />
                          <span className="text-[10px] font-black text-[#06C755]">สแกนเพื่อเพิ่มเพื่อน</span>
                        </div>
                        
                        <div className="space-y-3">
                          <ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
                            <li>
                              เพิ่มเพื่อนกับ LINE Bot โดยการสแกน QR Code หรือเพิ่มเพื่อนด้วยไอดี <a href="https://line.me/R/ti/p/@792nhdet" target="_blank" rel="noreferrer" className="text-primary hover:underline font-bold">@792nhdet</a>
                            </li>
                            <li>
                              เปิดห้องแชทและพิมพ์คำว่า <code className="bg-muted px-1.5 py-0.5 rounded font-mono font-bold text-foreground">token</code> ส่งหา Bot
                            </li>
                            <li>
                              คัดลอกรหัส <code className="bg-muted px-1.5 py-0.5 rounded font-mono font-bold text-foreground">User ID</code> ที่ได้รับจาก Bot นำมาวางที่ช่องด้านบน (ใส่ได้หลายคน)
                            </li>
                            <li>
                              เลือกเหตุการณ์ที่ต้องการ แล้วกด <span className="font-bold text-foreground">"บันทึกการตั้งค่า LINE"</span> หรือทดสอบส่งข้อความ
                            </li>
                          </ol>
                        </div>
                      </div>


                    </div>
                  </div>
                </div>
              
              {lineEnabled && (
                <div className="space-y-4 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">เลือกเหตุการณ์ที่ต้องการแจ้งเตือน</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-violet-500/5 border-violet-500/20 sm:col-span-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer text-violet-700 dark:text-violet-300" onClick={() => setLineEvents(p => ({...p, morning_digest: !p.morning_digest}))}>สรุปเช้า (Morning Digest)</Label>
                        <p className="text-[11px] text-muted-foreground">ส่งทุก 07:00 — รายการเก็บวันนี้ + ครบกำหนด + ค้างชำระ</p>
                      </div>
                      <Switch checked={lineEvents.morning_digest} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, morning_digest: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-destructive/5 border-destructive/20 sm:col-span-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer text-destructive" onClick={() => setLineEvents(p => ({...p, overdue_alert: !p.overdue_alert}))}>แจ้งเตือนค้างชำระ (Overdue)</Label>
                        <p className="text-[11px] text-destructive/80">ส่งซ้ำ 18:00 ถ้ายังมีลูกค้าค้างชำระ + เมื่อสัญญาเปลี่ยนสถานะ</p>
                      </div>
                      <Switch checked={lineEvents.overdue_alert} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, overdue_alert: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, payment: !p.payment}))}>รับชำระเงิน (Payment)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเตือนเมื่อบันทึกรับเงิน</p>
                      </div>
                      <Switch checked={lineEvents.payment} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, payment: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, loan: !p.loan}))}>ปล่อยกู้ใหม่ (New Loan)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเตือนเมื่อสร้างสัญญาใหม่</p>
                      </div>
                      <Switch checked={lineEvents.loan} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, loan: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, refinance: !p.refinance}))}>รียอดใหม่ (Refinance)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเตือนเมื่อต่อยอดหรือรียอดสัญญาใหม่</p>
                      </div>
                      <Switch checked={lineEvents.refinance} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, refinance: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, completed: !p.completed}))}>ปิดยอดสัญญา (Completed)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเตือนเมื่อปิดยอดกู้หรือไถ่ถอนสำเร็จ</p>
                      </div>
                      <Switch checked={lineEvents.completed} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, completed: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, pawn_forfeited: !p.pawn_forfeited}))}>ทรัพย์สินหลุดจำนำ (Pawn Forfeited)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเตือนเมื่อทรัพย์สินหลุดจำนำเข้าร้าน</p>
                      </div>
                      <Switch checked={lineEvents.pawn_forfeited} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, pawn_forfeited: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, expense: !p.expense}))}>บันทึกรายจ่าย (Expense)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเตือนเมื่อมีการบันทึกรายจ่าย</p>
                      </div>
                      <Switch checked={lineEvents.expense} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, expense: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold cursor-pointer" onClick={() => setLineEvents(p => ({...p, late_fee: !p.late_fee}))}>ปรับค่าปรับ (Late Fee)</Label>
                        <p className="text-[11px] text-muted-foreground">แจ้งเมื่อมีการปรับ/ยกเว้นค่าปรับ</p>
                      </div>
                      <Switch checked={lineEvents.late_fee} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, late_fee: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border border-destructive/20 bg-destructive/5">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold text-destructive cursor-pointer" onClick={() => setLineEvents(p => ({...p, fraud: !p.fraud}))}>ยกเลิก/ลบ (Fraud Alert)</Label>
                        <p className="text-[11px] text-destructive/80">แจ้งเมื่อลบประวัติชำระ/รายจ่าย/ยกเลิกสัญญา</p>
                      </div>
                      <Switch checked={lineEvents.fraud} onCheckedChange={(v) => setLineEvents(prev => ({ ...prev, fraud: v }))} />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button 
                      onClick={handleSaveLineNotify} 
                      disabled={busy === "line" || busy === "line-test"}
                      className="flex-1 bg-[#06C755] hover:bg-[#06C755]/90 text-white font-black h-11 rounded-xl"
                    >
                      {busy === "line" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      บันทึกการตั้งค่า LINE
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestLineNotify}
                      disabled={!lineEnabled || busy === "line" || busy === "line-test"}
                      className="flex-1 font-bold h-11 rounded-xl border-[#06C755]/40 text-[#06C755] hover:bg-[#06C755]/10"
                    >
                      {busy === "line-test" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      ทดสอบส่งข้อความ
                    </Button>
                  </div>
                </div>
              )}

              {!lineEnabled && (
                <div className="pt-2">
                  <Button 
                    onClick={handleSaveLineNotify} 
                    disabled={busy === "line"}
                    className="w-full bg-[#06C755] hover:bg-[#06C755]/90 text-white font-black h-11 rounded-xl"
                  >
                    {busy === "line" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    บันทึกการตั้งค่า LINE
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Display Settings */}
          <section id="display" className="scroll-mt-24 space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </div>
              <h3 className="font-black text-lg">การแสดงผล</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-sm font-bold">โหมดมืด (Dark Mode)</span>
                  <p className="text-[11px] text-muted-foreground max-w-[280px]">ปรับเปลี่ยนสีของเว็บไซต์ให้เหมาะสมกับสภาพแสงเพื่อถนอมสายตา</p>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggle} />
              </div>
            </div>
          </section>

          {/* Backup & System */}
          <section id="system" className="scroll-mt-24 space-y-4 pt-4 border-t border-border/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Database className="h-4 w-4" />
              </div>
              <h3 className="font-black text-lg">ระบบและการสำรองข้อมูล</h3>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm">
               <div className="flex flex-wrap gap-3">
                  <Button 
                    variant="outline" 
                    onClick={handleExportExcel}
                    disabled={busy === "export"}
                    className="rounded-xl font-bold h-10 px-6"
                  >
                    {busy === "export" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    ส่งออกข้อมูลเป็น Excel
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleBackup}
                    disabled={busy === "backup"}
                    className="rounded-xl font-bold h-10 px-6"
                  >
                    {busy === "backup" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    สำรองข้อมูล (Backup)
                  </Button>
               </div>
               <p className="text-[11px] text-muted-foreground mt-4 italic">* แนะนำให้สำรองข้อมูลอย่างสม่ำเสมอเพื่อความปลอดภัยของข้อมูล</p>
            </div>
          </section>

        </div>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="rounded-2xl max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">เปลี่ยนรหัสผ่าน</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">
              กรุณากรอกรหัสผ่านเดิมและตั้งรหัสผ่านใหม่เพื่อความปลอดภัย
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase tracking-widest">รหัสผ่านปัจจุบัน</Label>
              <Input 
                type="password" 
                value={passwords.current}
                onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                className="rounded-xl h-11 bg-muted/20"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase tracking-widest">รหัสผ่านใหม่</Label>
              <Input 
                type="password" 
                value={passwords.new}
                onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                className="rounded-xl h-11 bg-muted/20"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase tracking-widest">ยืนยันรหัสผ่านใหม่</Label>
              <Input 
                type="password" 
                value={passwords.confirm}
                onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                className="rounded-xl h-11 bg-muted/20"
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="ghost" 
              className="rounded-xl font-bold h-11"
              onClick={() => setPasswordOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button 
              className="rounded-xl font-black h-11 px-8"
              onClick={handleChangePassword}
              disabled={busy === "password" || !passwords.current || !passwords.new}
            >
              {busy === "password" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ยืนยันการเปลี่ยนรหัส
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
