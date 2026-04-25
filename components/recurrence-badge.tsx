function differenceInDays(dateLeft: Date, dateRight: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.trunc((dateLeft.getTime() - dateRight.getTime()) / MS_PER_DAY);
}

type RecurrenceBadgeProps = {
  interval: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  nextDueAt: Date;
  translations: {
    monthly: string;
    quarterly: string;
    semiAnnual: string;
    annual: string;
    daysUntilDue: string;
    daysOverdue: string;
  };
};

export function RecurrenceBadge({ interval, nextDueAt, translations }: RecurrenceBadgeProps) {
  const now = new Date();
  const daysUntilDue = differenceInDays(nextDueAt, now);
  const isOverdue = daysUntilDue < 0;
  const daysAbsolute = Math.abs(daysUntilDue);
  const isApproachingDue = daysUntilDue >= 0 && daysUntilDue < 7;

  const intervalLabel = {
    MONTHLY: translations.monthly,
    QUARTERLY: translations.quarterly,
    SEMI_ANNUAL: translations.semiAnnual,
    ANNUAL: translations.annual,
  }[interval];

  const statusText = isOverdue
    ? translations.daysOverdue.replace("{days}", String(daysAbsolute))
    : translations.daysUntilDue.replace("{days}", String(daysAbsolute));

  const ariaLabel = isOverdue
    ? `Recurrence: ${intervalLabel}, overdue by ${daysAbsolute} days`
    : `Recurrence: ${intervalLabel}, due in ${daysAbsolute} days`;

  const colorClasses = isOverdue
    ? "border-[var(--risk-high)] bg-[var(--risk-high)]/15 text-[var(--risk-high-fg)]"
    : isApproachingDue
      ? "border-[var(--risk-medium)] bg-[var(--risk-medium)]/15 text-[var(--risk-medium-fg)]"
      : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colorClasses}`}
    >
      {intervalLabel} · {statusText}
    </span>
  );
}
