import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert, KeyRound, Loader2 } from "lucide-react";

export function ForceChangePasswordModal() {
  const { user, refreshUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user || !user.mustChangePassword) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      return toast.error("รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน");
    }

    setBusy(true);
    try {
      const res = await changePassword({ currentPassword: "", newPassword });
      if (res.token) {
        localStorage.setItem("auth_token", res.token);
      }
      toast.success("ตั้งค่ารหัสผ่านใหม่เรียบร้อยแล้ว!");
      await refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-lg select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-3xl border border-primary/20 bg-card p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden animate-in zoom-in-95 fade-in duration-300">
        {/* Top accent border */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-primary to-indigo-600" />

        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <div className="h-16 w-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner">
            <KeyRound className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">บังคับเปลี่ยนรหัสผ่าน</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              เนื่องจากเป็นการเปิดใช้งานร้านใหม่หรือล็อกอินครั้งแรก กรุณาตั้งรหัสผ่านใหม่ส่วนตัวเพื่อความปลอดภัย
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              รหัสผ่านใหม่
            </Label>
            <Input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-xl h-11 bg-muted/20 font-mono text-sm"
              placeholder="อย่างน้อย 4 ตัวอักษร"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              ยืนยันรหัสผ่านใหม่
            </Label>
            <Input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-xl h-11 bg-muted/20 font-mono text-sm"
              placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            disabled={busy || !newPassword || !confirmPassword}
            className="w-full h-12 rounded-xl font-black text-sm bg-gradient-to-r from-amber-500 via-primary to-indigo-600 hover:opacity-95 text-white shadow-lg shadow-primary/20 gap-2 mt-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            {busy ? "กำลังบันทึกรหัสผ่านใหม่..." : "บันทึกรหัสผ่านใหม่และเริ่มใช้งาน"}
          </Button>
        </form>
      </div>
    </div>
  );
}
