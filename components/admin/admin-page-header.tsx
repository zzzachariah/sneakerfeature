import type { LucideIcon } from "lucide-react";

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  actions
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="surface-card premium-border flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm soft-text">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
