import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    const target = user.tenantId === 'system' ? '/super-admin' : '/';
    return <Navigate to={target} />;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error, user: signedInUser } = await signIn(username, password);
    setBusy(false);
    if (error) return toast.error(error === 'Invalid username or password' ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : error);
    toast.success("ยินดีต้อนรับกลับเข้าสู่ระบบ");
    
    if (signedInUser) {
      const target = signedInUser.tenantId === 'system' ? '/super-admin' : '/';
      navigate({ to: target });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 h-96 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      </div>
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-700">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] ring-4 ring-primary/10">
            <Banknote className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">D4-LoanDesk</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ระบบจัดการเงินกู้และติดตามหนี้สินมืออาชีพ (Multi-Tenant)
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] backdrop-blur-sm">
          <h2 className="text-xl font-bold text-center mb-6">เข้าสู่ระบบ</h2>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">ชื่อผู้ใช้ (Username) หรือ รหัสร้าน</Label>
              <Input id="username" placeholder="เช่น somsak-capital" required value={username} onChange={(e) => setUsername(e.target.value)} className="bg-muted/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input id="password" type="password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-muted/30" />
            </div>
            <Button type="submit" className="w-full py-6 text-base font-semibold shadow-[var(--shadow-elevated)]" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              เข้าสู่ระบบ
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
