import { type ReactNode } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppLayout({ children }: { children?: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md">
            <SidebarTrigger className="text-foreground" />
            <div className="flex-1" />
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <div className="flex justify-end p-2">
              <LanguageSwitcher />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children ?? <Outlet />}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}