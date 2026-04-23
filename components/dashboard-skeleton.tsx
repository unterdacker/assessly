import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading dashboard">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* Title Placeholder */}
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          {/* Subtitle Placeholder */}
          <div className="mt-2 h-5 w-64 animate-pulse rounded-md bg-muted" />
        </div>
        {/* Button Placeholder */}
        <div className="h-10 w-full animate-pulse rounded-md bg-muted sm:w-32" />
      </div>

      {/* Grid Row 1 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Risk Gauge Card Skeleton */}
        <Card className="lg:col-span-1">
          <CardHeader>
            {/* Card Title Placeholder */}
            <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
            {/* Card Description Placeholder */}
            <div className="mt-1 h-4 w-64 max-w-full animate-pulse rounded-md bg-muted" />
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-8">
            {/* Gauge SVG Circle Placeholder */}
            <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
            
            {/* Gauge Status Text Lines */}
            <div className="mt-4 flex w-full flex-col items-center gap-2">
              <div className="h-3 w-3/4 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" />
            </div>
          </CardContent>
        </Card>

        {/* 4 Metric Tiles Grid Skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                {/* Tile Title Placeholder */}
                <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
                {/* Tile Icon Placeholder */}
                <div className="h-4 w-4 animate-pulse rounded-md bg-muted" />
              </CardHeader>
              <CardContent>
                {/* Tile Value Placeholder */}
                <div className="h-8 w-12 animate-pulse rounded-md bg-muted" />
                {/* Tile Hint Placeholder */}
                <div className="mt-2 h-3 w-32 animate-pulse rounded-md bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
