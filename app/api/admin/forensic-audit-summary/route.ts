import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSessionFromRequest } from "@/lib/auth/server";

type ForensicSummaryRow = {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  modelProvider: string | null;
  modelId: string | null;
  wasEditedByHuman: boolean | null;
  linkedGenerationEventId: string | null;
};

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: ForensicSummaryRow[]): string {
  const header = [
    "id",
    "timestamp",
    "action",
    "entityType",
    "entityId",
    "modelProvider",
    "modelId",
    "wasEditedByHuman",
    "linkedGenerationEventId",
  ];

  const lines = rows.map((row) =>
    [
      row.id,
      row.timestamp,
      row.action,
      row.entityType,
      row.entityId,
      row.modelProvider || "",
      row.modelId || "",
      row.wasEditedByHuman === null ? "" : String(row.wasEditedByHuman),
      row.linkedGenerationEventId || "",
    ]
      .map((value) => escapeCsvValue(value))
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSessionFromRequest(request);
    if (!session || (session.role !== "ADMIN" && session.role !== "AUDITOR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const companyId = session.companyId;
    if (!companyId) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        companyId: null,
        totalEvents: 0,
        events: [],
      });
    }

    const format = request.nextUrl.searchParams.get("format")?.toLowerCase() || "json";

    const events = await prisma.auditLog.findMany({
      where: {
        companyId,
        action: {
          in: ["AI_GENERATION", "AI_REMEDIATION_SENT"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
      },
    });

    const summaryRows: ForensicSummaryRow[] = events.map((event) => {
      const metadata =
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : null;

      const newValue =
        metadata?.newValue && typeof metadata.newValue === "object"
          ? (metadata.newValue as Record<string, unknown>)
          : null;

      const modelInfo =
        newValue?.model_info && typeof newValue.model_info === "object"
          ? (newValue.model_info as Record<string, unknown>)
          : null;

      return {
        id: event.id,
        timestamp: event.createdAt.toISOString(),
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        modelProvider:
          modelInfo && typeof modelInfo.provider === "string" ? modelInfo.provider : null,
        modelId: modelInfo && typeof modelInfo.modelId === "string" ? modelInfo.modelId : null,
        wasEditedByHuman:
          newValue && typeof newValue.was_edited_by_human === "boolean"
            ? newValue.was_edited_by_human
            : null,
        linkedGenerationEventId:
          newValue && typeof newValue.ai_generation_event_id === "string"
            ? newValue.ai_generation_event_id
            : null,
      };
    });

    if (format === "csv") {
      const csv = toCsv(summaryRows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=forensic-audit-summary-${Date.now()}.csv`,
        },
      });
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      companyId,
      totalEvents: summaryRows.length,
      events: summaryRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
