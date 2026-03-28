import type { RiskLevel } from "@/lib/vendor-assessment";
import { Badge } from "@/components/ui/badge";

const variantMap = {
  low: "low" as const,
  medium: "medium" as const,
  high: "high" as const,
};

const labelMap: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant={variantMap[level]} className="font-normal">
      {labelMap[level]}
    </Badge>
  );
}
