import { type ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl truncate">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}