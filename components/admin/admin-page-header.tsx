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
  // Title-only header (no description, no actions) is fully redundant on mobile
  // because AdminMobileShell already shows the section label in the sticky bar.
  // We render nothing on mobile in that case so we don't ship an empty card.
  const hasMobileContent = Boolean(description || actions);

  return (
    <header
      className={[
        "surface-card premium-border rounded-2xl p-4",
        // On mobile: only show if description or actions exist; collapse to a
        // simple stacked layout. On sm+: full flex header with icon+title.
        hasMobileContent ? "flex flex-col gap-3" : "hidden",
        "sm:flex sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3"
      ].join(" ")}
    >
      {/* Title cluster — hidden on mobile (the sticky shell shows it) */}
      <div className="hidden items-start gap-3 sm:flex">
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

      {/* Mobile-only description block (sm+ description lives next to the title above) */}
      {description && (
        <p className="text-sm soft-text sm:hidden">{description}</p>
      )}

      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
