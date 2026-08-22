import type { CustomerCreditProfile } from "@/utils/creditScore";
import { cn } from "@/utils/utils";
import { ShieldCheck, ShieldAlert, Star, Sparkles, AlertTriangle, UserCheck } from "lucide-react";

interface CreditScoreBadgeProps {
  profile: CustomerCreditProfile;
  size?: "xs" | "sm" | "md" | "lg";
  showScore?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function CreditScoreBadge({
  profile,
  size = "sm",
  showScore = false,
  showLabel = true,
  className,
}: CreditScoreBadgeProps) {
  const getIcon = () => {
    switch (profile.grade) {
      case "A+":
        return <Star className="h-3 w-3 fill-amber-400 text-amber-400 animate-pulse" />;
      case "A":
        return <ShieldCheck className="h-3 w-3 text-emerald-500" />;
      case "B":
        return <UserCheck className="h-3 w-3 text-amber-500" />;
      case "C":
        return <AlertTriangle className="h-3 w-3 text-orange-500" />;
      case "D":
        return <ShieldAlert className="h-3 w-3 text-rose-500" />;
      case "NEW":
      default:
        return <Sparkles className="h-3 w-3 text-slate-400" />;
    }
  };

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.2 rounded-md gap-1",
    sm: "text-[11px] px-2 py-0.5 rounded-lg gap-1.5",
    md: "text-xs px-2.5 py-1 rounded-xl gap-2 font-bold",
    lg: "text-sm px-3.5 py-1.5 rounded-2xl gap-2.5 font-black",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center font-bold border transition-all select-none shadow-sm",
        profile.badgeBg,
        profile.badgeText,
        profile.badgeBorder,
        sizeClasses[size],
        className
      )}
      title={`${profile.gradeLabel} (คะแนนเครดิต: ${profile.score}/100 | จ่ายตรง: ${profile.onTimePaymentRate}%)`}
    >
      {getIcon()}
      <span className="tracking-tight font-black">เกรด {profile.grade}</span>
      {showScore && (
        <span className="opacity-75 text-[10px] font-mono">
          ({profile.score} คะแนน)
        </span>
      )}
      {showLabel && size !== "xs" && (
        <span className="opacity-80 text-[10px] hidden sm:inline">
          · {profile.gradeLabel}
        </span>
      )}
    </div>
  );
}
