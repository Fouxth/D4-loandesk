import { type ReactNode, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, Loader2 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "react-i18next";

export function AppLayout({ children }: { children?: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const { business } = useSettings();
  const { i18n } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);

  const businessName = i18n.language === "th" ? business.nameTH : business.nameEN;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        {/* Desktop Sidebar — hidden on mobile */}
        <AppSidebar />

        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 md:px-4 backdrop-blur-md">
            {/* Sidebar trigger for both mobile and desktop */}
            <div className="flex items-center">
              <SidebarTrigger className="text-foreground h-9 w-9" />
            </div>

            {/* Mobile: App name */}
            <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-black tracking-tight text-foreground truncate">
                {businessName || "D4-LoanDesk"}
              </span>
            </div>

            {/* Desktop: spacer */}
            <div className="hidden md:flex flex-1" />

            {/* Shared right-side actions */}
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="h-9 w-9">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Desktop & Mobile Logout + Language */}
            <div className="flex items-center gap-1">
              <div className="p-1">
                <LanguageSwitcher />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                disabled={signingOut}
                className="h-9 w-9 text-muted-foreground hover:text-destructive active:scale-95 transition-all cursor-pointer"
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                }}
              >
                {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              </Button>
            </div>
          </header>

          {/* Main content — extra bottom padding on mobile for BottomNav */}
          <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </SidebarProvider>
  );
}