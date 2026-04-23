import { scoreGaugeColor, scoreGaugeStroke } from "@/lib/score-colors";
import { cn } from "@/lib/utils";

type RiskGaugeProps = {
  value: number;
  label?: string;
  className?: string;
};

/** Semicircle gauge 0–100; color reflects health (green = stronger posture). */
export function RiskGauge({ value, label, className }: RiskGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = scoreGaugeStroke(clamped);
  const r = 52;
  const cx = 60;
  const cy = 56;
  const arcLen = Math.PI * r;
  const dashOffset = arcLen - (clamped / 100) * arcLen;

  return (
    <div
      className={cn("flex flex-col items-center", className)}
      role="img"
      aria-label={`Score ${clamped} out of 100${label ? `, ${label}` : ""}`}
    >
      <svg
        width="200"
        height="120"
        viewBox="0 0 120 72"
        className="overflow-visible"
        aria-hidden
      >
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-slate-200 dark:text-slate-800"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="-mt-8 text-center">
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums tracking-tight",
            scoreGaugeColor(clamped),
          )}
        >
          {clamped}
        </p>
        {label ? (
          <p className="text-xs text-muted-foreground">{label}</p>
        ) : null}
      </div>
    </div>
  );
}
