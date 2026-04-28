import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings")({
  component: () => (<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>),
});

function Settings() {
  const { user, roles, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd>{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Role</dt><dd className="capitalize">{roles[0] ?? "—"}</dd></div>
          </dl>
          <Button variant="outline" className="mt-4" onClick={signOut}>Sign out</Button>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Dark mode</span>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
        </div>
      </div>
    </div>
  );
}
