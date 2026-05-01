import {
  LayoutDashboard,
  Users,
  Wallet,
  Receipt,
  TrendingDown,
  FileBarChart,
  Settings,
  Calendar,
  History,
  Languages,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "@tanstack/react-router";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AppSidebar() {
  const { t, i18n } = useTranslation();
  const { business } = useSettings();
  const location = useLocation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const businessName = i18n.language === 'th' ? business.nameTH : business.nameEN;
  const subName = i18n.language === 'th' ? business.nameEN : business.nameTH;

  const menuItems = [
    { title: t('menu.dashboard'), icon: LayoutDashboard, url: "/" },
    { title: t('menu.customers'), icon: Users, url: "/customers" },
    { title: t('menu.loans'), icon: Wallet, url: "/loans" },
  ];

  const financeItems = [
    { title: t('menu.payments'), icon: Receipt, url: "/payments" },
    { title: t('menu.expenses'), icon: TrendingDown, url: "/expenses" },
    { title: t('menu.reports'), icon: FileBarChart, url: "/reports" },
    { title: t('menu.calendar'), icon: Calendar, url: "/calendar" },
    { title: t('menu.activity'), icon: History, url: "/activity" },
    { title: t('menu.settings'), icon: Settings, url: "/settings" },
  ];

  return (
    <Sidebar className="border-r border-border bg-card shadow-sm transition-all duration-300">
      <SidebarHeader className="border-b border-border p-4 bg-card/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20 ring-4 ring-primary/10">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-tight text-foreground leading-tight truncate">{businessName}</h1>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5 opacity-70 truncate">
              {subName}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2 gap-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-2">
            {t('menu.main')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={location.pathname === item.url}>
                    <Link to={item.url} className="flex items-center gap-3 py-2.5">
                      <item.icon className="h-4 w-4" />
                      <span className="font-semibold">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-2">
            {t('menu.finance')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {financeItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={location.pathname === item.url}>
                    <Link to={item.url} className="flex items-center gap-3 py-2.5">
                      <item.icon className="h-4 w-4" />
                      <span className="font-semibold">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between w-full">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full flex justify-start gap-2 h-9">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase">{i18n.language}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => changeLanguage('th')} className="text-xs font-bold cursor-pointer">ภาษาไทย</DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('en')} className="text-xs font-bold cursor-pointer">English</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}