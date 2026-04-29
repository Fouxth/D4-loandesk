import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) return toast.error(error === 'Invalid email or password' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error);
    toast.success("ยินดีต้อนรับกลับเข้าสู่ระบบ");
    navigate({ to: "/" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signUp(email, password, fullName);
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("สร้างบัญชีเรียบร้อยแล้ว — กำลังเข้าสู่ระบบ...");
    await signIn(email, password);
    navigate({ to: "/" });
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
          <h1 className="text-3xl font-bold tracking-tight">LoanDesk</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ระบบจัดการเงินกู้และติดตามหนี้สินมืออาชีพ
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] backdrop-blur-sm">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">เข้าสู่ระบบ</TabsTrigger>
              <TabsTrigger value="signup">ลงทะเบียน</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="animate-in fade-in slide-in-from-left-4 duration-500">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">อีเมล</Label>
                  <Input id="email" type="email" placeholder="name@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-muted/30" />
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
            </TabsContent>

            <TabsContent value="signup" className="animate-in fade-in slide-in-from-right-4 duration-500">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">ชื่อ-นามสกุล</Label>
                  <Input id="su-name" placeholder="สมชาย ใจดี" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-muted/30" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">อีเมล</Label>
                  <Input id="su-email" type="email" placeholder="name@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-muted/30" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">รหัสผ่าน</Label>
                  <Input id="su-password" type="password" placeholder="อย่างน้อย 6 ตัวอักษร" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-muted/30" />
                </div>
                <Button type="submit" className="w-full py-6 text-base font-semibold shadow-[var(--shadow-elevated)]" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  สร้างบัญชีผู้ใช้
                </Button>
                <p className="text-center text-[10px] text-muted-foreground mt-4 px-4 leading-relaxed">
                  ผู้ที่ลงทะเบียนคนแรกจะได้รับสิทธิ์เป็น ผู้ดูแลระบบ (Admin) <br/>
                  ผู้ที่ลงทะเบียนคนถัดไปจะได้รับสิทธิ์เป็น เจ้าหน้าที่ (Staff)
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}