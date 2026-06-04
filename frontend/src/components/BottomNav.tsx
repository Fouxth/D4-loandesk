import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Users, Wallet, Receipt, Settings } from "lucide-react";
import { cn } from "@/utils/utils";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "หน้าหลัก", url: "/" },
  { icon: Users, label: "ลูกค้า", url: "/customers" },
  { icon: Wallet, label: "สัญญา", url: "/loans", isFab: true },
  { icon: Receipt, label: "ชำระเงิน", url: "/payments" },
  { icon: Settings, label: "ตั้งค่า", url: "/settings" },
];

export function BottomNav() {
  const location = useLocation();

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Blur background */}
      <div className="absolute inset-0 bg-background/85 backdrop-blur-xl border-t border-border/60" />

      <div className="relative flex items-end justify-around px-2 pt-2 pb-safe">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.url);

          if (item.isFab) {
            return (
              <Link
                key={item.url}
                to={item.url}
                className="flex flex-col items-center gap-1 -mt-5 relative"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {/* FAB Button */}
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all duration-200",
                    "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
                    "shadow-primary/30 ring-4 ring-primary/15",
                    active && "scale-95"
                  )}
                >
                  <item.icon className="h-6 w-6" strokeWidth={2.5} />
                </div>
                <span
                  className={cn(
                    "text-[11px] font-black uppercase tracking-wider mt-0.5 pb-1",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.url}
              to={item.url}
              className="flex flex-col items-center gap-1 px-3 py-1 min-w-[56px] relative"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Active indicator pill */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
              )}

              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
                  active
                    ? "bg-primary/12 text-primary scale-110"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "transition-all duration-200",
                    active ? "h-5 w-5" : "h-[18px] w-[18px]"
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
              </div>
              <span
                className={cn(
                  "text-[11px] font-bold uppercase tracking-wide pb-1",
                  active ? "text-primary font-black" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* iOS home indicator safe area */}
      <div className="h-safe bg-background/0" />
    </nav>
  );
}
