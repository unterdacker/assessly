import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PortfolioComplianceWidgetProps = {
  score: number;
  trend: "up" | "down" | "stable";
  vendorCount: number;
  translations: {
    title: string;
    trendUp: string;
    trendDown: string;
    trendStable: string;
    vendors: string;
    noData: string;
  };
};

export function PortfolioComplianceWidget({
  score,
  trend,
  vendorCount,
  translations,
}: PortfolioComplianceWidgetProps) {
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

  if (vendorCount === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">{translations.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {translations.noData}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">{translations.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center space-y-4 py-8">
        {/* Large Score Display */}
        <div className="text-center">
          <div
            className={`text-6xl font-bold tabular-nums ${scoreColor}`}
            aria-label={`Compliance score: ${score.toFixed(1)} percent`}
          >
            {score.toFixed(1)}
            <span className="text-3xl">%</span>
          </div>
        </div>

        {/* Trend Indicator */}
        <div className="flex items-center gap-2">
          {trendIcon}
          <span className={`text-sm font-medium ${trendColorClass}`}>
            {trendLabel}
          </span>
        </div>

        {/* Vendor Count Footer */}
        <div className="mt-6 w-full border-t border-border pt-4 text-center">
          <p className="text-sm text-muted-foreground">
            {vendorCount} {translations.vendors}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
