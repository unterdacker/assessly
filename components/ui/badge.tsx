import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-badge)] px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--accent-foreground)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        outline: "border border-[var(--border)] bg-transparent text-[var(--foreground)]",
        low: "bg-[var(--risk-low)] text-[var(--risk-low-fg)]",
        medium:
          "bg-[var(--risk-medium)] text-[var(--risk-medium-fg)]",
        high: "bg-[var(--risk-high)] text-[var(--risk-high-fg)]",
        compliant:
          "bg-[var(--risk-low)] text-[var(--risk-low-fg)]",
        nonCompliant:
          "bg-[var(--risk-high)] text-[var(--risk-high-fg)]",
        destructive: "bg-[var(--destructive)] text-[var(--destructive-foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
