import type { CustomerCreditProfile } from "@/utils/creditScore";
import { cn } from "@/utils/utils";
import { Sparkles, Users, Gem, AlertTriangle, Ban } from "lucide-react";

interface CreditScoreBadgeProps {
  profile: CustomerCreditProfile;
  size?: "xs" | "sm" | "md" | "lg";
  showRate?: boolean;
  className?: string;
}

export function CreditScoreBadge({
  profile,
  size = "sm",
  showRate = false,
  className,
}: CreditScoreBadgeProps) {
  const getIcon = () => {
    switch (profile.category) {
      case "good":
        return <Gem className="h-3.5 w-3.5 text-emerald-500" />;
      case "regular":
        return <Users className="h-3.5 w-3.5 text-blue-500" />;
      case "watchlist":
        return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
      case "blocked":
        return <Ban className="h-3.5 w-3.5 text-rose-500" />;
      case "new":
      default:
        return <Sparkles className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  const sizeClasses = {
    xs: "text-[10px] px-2 py-0.5 rounded-md gap-1 font-bold",
    sm: "text-xs px-2.5 py-1 rounded-lg gap-1.5 font-bold",
    md: "text-sm px-3 py-1.5 rounded-xl gap-2 font-bold",
    lg: "text-base px-4 py-2 rounded-2xl gap-2.5 font-black",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center select-none border shadow-sm transition-all whitespace-nowrap",
        profile.badgeBg,
        profile.badgeText,
        profile.badgeBorder,
        sizeClasses[size],
        className
      )}
      title={`${profile.categoryLabel} (จ่ายตรงเวลา ${profile.onTimePaymentRate}%)`}
    >
      {getIcon()}
      <span>{profile.categoryLabel}</span>
      {showRate && profile.totalLoansCount > 0 && (
        <span className="opacity-75 text-[10px] font-mono ml-0.5">
          ({profile.onTimePaymentRate}%)
        </span>
      )}
    </div>
  );
}
