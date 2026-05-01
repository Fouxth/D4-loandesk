import { Card, CardContent } from "@/components/ui/card";
import { formatTHB } from "@/utils/format";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "primary" | "warning" | "destructive" | "success" | "muted";
  description?: string;
}

const TONE_CLASSES = {
  primary: "text-primary bg-primary/15",
  warning: "text-warning bg-warning/15",
  destructive: "text-destructive bg-destructive/15",
  success: "text-success bg-success/15",
  muted: "text-muted-foreground bg-muted",
};

export function StatCard({ label, value, icon: Icon, tone, description }: StatCardProps) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {Icon && (
            <div className={`rounded-lg p-2 ${tone ? TONE_CLASSES[tone] : "bg-muted text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </h3>
        </div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}
