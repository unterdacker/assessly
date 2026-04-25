"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type PortfolioComplianceWidgetProps = {
  score: number;
  trend: "up" | "down" | "stable";
  vendorCount: number;
  translations: {
    title: string;
    trendUp: string;
    trendDown: string;
    trendStable: string;
    scoreLabel: string;
    riskLabel: string;
    vendors: string;
    noData: string;
    noDataCta?: string;
    noDataExplanation?: string;
    widgetTooltip?: string;
  };
};

export function PortfolioComplianceWidget({
  score,
  trend,
  vendorCount,
  translations,
}: PortfolioComplianceWidgetProps) {
  const locale = useLocale();

  const scoreColor =
    score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const trendIcon =
    trend === "up" ? (
      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
    ) : trend === "down" ? (
      <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
    ) : (
      <Minus className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden />
    );

  const trendLabel =
    trend === "up"
      ? translations.trendUp
      : trend === "down"
        ? translations.trendDown
        : translations.trendStable;

  const trendColorClass =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-slate-600 dark:text-slate-400";

  const widgetInfoTooltip = translations.widgetTooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label="More information about Overall Compliance Score"
          tabIndex={0}
          className="inline-flex cursor-help mt-0.5"
        >
          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px]">
        <p>{translations.widgetTooltip}</p>
      </TooltipContent>
    </Tooltip>
  ) : null;

  if (vendorCount === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{translations.title}</CardTitle>
            {widgetInfoTooltip}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <div className="text-center">
            <p>{translations.noData}</p>
            {translations.noDataExplanation && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{translations.noDataExplanation}</p>
            )}
            {translations.noDataCta && (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/${locale}/vendors`}>
                  {translations.noDataCta}
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{translations.title}</CardTitle>
          {widgetInfoTooltip}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3 pt-2 pb-4">
        {/* Large Score Display */}
        <div>
          <div className={`text-3xl font-semibold tabular-nums ${scoreColor}`}>
            <span className="sr-only">{score.toFixed(1)}% {translations.scoreLabel}</span>
            <span aria-hidden="true">{score.toFixed(1)}</span>
            <span className="text-3xl" aria-hidden="true">%</span>
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-1">
            {translations.riskLabel}
          </p>
        </div>

        {/* Trend Indicator */}
        <div className="flex gap-2" role="status" aria-live="polite">
          {trendIcon}
          <span className={`text-sm font-medium ${trendColorClass}`}>
            {trendLabel}
          </span>
        </div>

        {/* Vendor Count Footer */}
        <div className="mt-3 w-full border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {vendorCount} {translations.vendors}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
