/** Score 0–100: higher = healthier / lower risk posture for the gauge. */
export function scoreBand(score: number): "low" | "medium" | "high" {
  if (score < 40) return "high";
  if (score <= 70) return "medium";
  return "low";
}

export function scoreGaugeColor(score: number): string {
  const band = scoreBand(score);
  if (band === "high")
    return "text-red-600 dark:text-red-400";
  if (band === "medium")
    return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

export function scoreGaugeStroke(score: number): string {
  const band = scoreBand(score);
  if (band === "high") return "#dc2626";
  if (band === "medium") return "#d97706";
  return "#059669";
}
