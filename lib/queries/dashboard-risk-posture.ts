import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import {
  DASHBOARD_CATEGORY_ORDER,
  isOpenGapStatus,
  normalizeDashboardCategory,
  scoreAnswerStatus,
  type DashboardCategoryKey,
  type DashboardRiskLevelKey,
} from "@/lib/dashboard-risk-posture";
import {
  generateDashboardExecutiveSummary,
  type DashboardExecutiveSummaryResult,
} from "@/lib/ai/dashboard-executive-summary";

export const RISK_POSTURE_CACHE_TAG = "risk-posture";

type SupportedLocale = "en" | "de";

export type DashboardCategoryMetric = {
  key: DashboardCategoryKey;
  averageScore: number;
  questionCount: number;
  openGapCount: number;
};

export type DashboardRiskBucket = {
  level: DashboardRiskLevelKey;
  count: number;
};

export type DashboardExecutiveSummary = DashboardExecutiveSummaryResult;

export type ComplianceTrustMetrics = {
  aiGenerationCount: number;
  humanOversightRate: number;
  editedByHumanCount: number;
  finalizedSuggestionCount: number;
  systemIntegrityPercent: 100;
  systemIntegrityVerified: boolean;
  recordedAuditEntries: number;
};

export type DashboardRiskPostureOverview = {
  categoryMetrics: DashboardCategoryMetric[];
  riskBuckets: DashboardRiskBucket[];
  executiveSummary: DashboardExecutiveSummary;
  complianceTrust: ComplianceTrustMetrics;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toDashboardRiskLevel(level: string): DashboardRiskLevelKey {
  if (level === "LOW") return "low";
  if (level === "HIGH") return "high";
  return "medium";
}

const AI_SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedSummary = DashboardExecutiveSummaryResult & { cachedAt: string };

function parseCachedSummary(raw: string): DashboardExecutiveSummaryResult | null {
  try {
    const parsed = JSON.parse(raw) as CachedSummary;
    if (typeof parsed.systemicRisk !== "string") return null;
    return {
      systemicRisk: parsed.systemicRisk,
      averageRemediationTimeDays: parsed.averageRemediationTimeDays ?? 0,
      recommendedCategoryKey: parsed.recommendedCategoryKey ?? null,
      source: parsed.source ?? "ai",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Serializable raw data type — Dates are stored as ISO strings so the result
// is safe to pass through Next.js unstable_cache JSON serialization.
// ---------------------------------------------------------------------------
type SerializableAssessment = {
  id: string;
  createdAt: string;
  updatedAt: string;
  riskLevel: string;
  complianceScore: number;
  vendor: { name: string; serviceType: string };
  answers: Array<{ questionId: string; status: string }>;
};

type RiskPostureRawData = {
  questions: Array<{ id: string; category: string }>;
  assessments: SerializableAssessment[];
  aiAuditEvents: Array<{ action: string; metadata: unknown; hitlVerifiedBy: string | null }>;
  totalAuditCount: number;
  lastAiSummary: string | null;
  aiDisabled: boolean;
  aiSummaryUpdatedAt: string | null; // ISO string
};

/**
 * Inner fetcher — runs the 5-query Prisma transaction.
 * Wrapped by unstable_cache so repeated dashboard renders within the TTL
 * window skip the database entirely.
 */
async function fetchRiskPostureRawData(companyId: string): Promise<RiskPostureRawData> {
  const [questions, assessments, aiAuditEvents, totalAuditCount, companyCache] =
    await prisma.$transaction([
      prisma.question.findMany({ select: { id: true, category: true } }),
      prisma.assessment.findMany({
        where: { companyId },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          riskLevel: true,
          complianceScore: true,
          vendor: { select: { name: true, serviceType: true } },
          answers: { select: { questionId: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: { companyId, action: { in: ["AI_GENERATION", "AI_REMEDIATION_SENT", "EXTERNAL_ASSESSMENT_UPDATED"] } },
        select: { action: true, metadata: true, hitlVerifiedBy: true },
      }),
      prisma.auditLog.count({ where: { companyId } }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { lastAiSummary: true, aiSummaryUpdatedAt: true, aiDisabled: true },
      }),
    ]);

  return {
    questions,
    assessments: assessments.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      riskLevel: a.riskLevel as string,
    })),
    aiAuditEvents,
    totalAuditCount,
    lastAiSummary: companyCache?.lastAiSummary ?? null,
    aiDisabled: companyCache?.aiDisabled ?? true,
    aiSummaryUpdatedAt: companyCache?.aiSummaryUpdatedAt?.toISOString() ?? null,
  };
}

/**
 * Cached Prisma aggregation — revalidated via revalidateTag(RISK_POSTURE_CACHE_TAG)
 * whenever a vendor or assessment changes (vendor create/delete, answer submit, etc.).
 * TTL acts as a safety net: max 5 minutes of staleness even without an explicit tag bust.
 */
const getCachedRiskPostureRawData = unstable_cache(
  fetchRiskPostureRawData,
  [RISK_POSTURE_CACHE_TAG],
  { revalidate: 300, tags: [RISK_POSTURE_CACHE_TAG] },
);

export async function getDashboardRiskPostureOverview(
  locale: SupportedLocale,
  bypassCache = false,
): Promise<DashboardRiskPostureOverview> {
  const companyId = await getDefaultCompanyId();

  const emptyMetrics = DASHBOARD_CATEGORY_ORDER.map((key) => ({
    key,
    averageScore: 0,
    questionCount: 0,
    openGapCount: 0,
  }));

  const emptyBuckets: DashboardRiskBucket[] = [
    { level: "low", count: 0 },
    { level: "medium", count: 0 },
    { level: "high", count: 0 },
  ];

  if (!companyId) {
    return {
      categoryMetrics: emptyMetrics,
      riskBuckets: emptyBuckets,
      executiveSummary: {
        systemicRisk:
          locale === "de"
            ? "Es liegen noch keine Anbieterbewertungen fuer eine belastbare Lieferkettenanalyse vor."
            : "No vendor assessments are available yet for a reliable supply-chain analysis.",
        averageRemediationTimeDays: 0,
        recommendedCategoryKey: null,
        source: "fallback",
      },
      complianceTrust: {
        aiGenerationCount: 0,
        humanOversightRate: 0,
        editedByHumanCount: 0,
        finalizedSuggestionCount: 0,
        systemIntegrityPercent: 100,
        systemIntegrityVerified: true,
        recordedAuditEntries: 0,
      },
    };
  }

  // Use the cached fetcher — skips all 5 Prisma queries on repeated page loads
  // within the TTL window or until revalidateTag(RISK_POSTURE_CACHE_TAG) is called.
  const raw = await getCachedRiskPostureRawData(companyId);

  const questions = raw.questions;
  // Re-hydrate ISO date strings back to Date objects after cache deserialization.
  const assessments = raw.assessments.map((a) => ({
    ...a,
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.updatedAt),
  }));
  const aiAuditEvents = raw.aiAuditEvents;
  const totalAuditCount = raw.totalAuditCount;
  const companyCache =
    raw.lastAiSummary !== null || raw.aiSummaryUpdatedAt !== null
      ? {
          lastAiSummary: raw.lastAiSummary,
          aiSummaryUpdatedAt: raw.aiSummaryUpdatedAt
            ? new Date(raw.aiSummaryUpdatedAt)
            : null,
        }
      : null;

  const questionToCategory = new Map<string, DashboardCategoryKey>();
  const questionCounts = new Map<DashboardCategoryKey, number>();

  for (const key of DASHBOARD_CATEGORY_ORDER) {
    questionCounts.set(key, 0);
  }

  for (const question of questions) {
    const categoryKey = normalizeDashboardCategory(question.category);
    questionToCategory.set(question.id, categoryKey);
    questionCounts.set(categoryKey, (questionCounts.get(categoryKey) ?? 0) + 1);
  }

  const categoryScoreTotals = new Map<DashboardCategoryKey, number>();
  const categoryOpenGapTotals = new Map<DashboardCategoryKey, number>();

  for (const key of DASHBOARD_CATEGORY_ORDER) {
    categoryScoreTotals.set(key, 0);
    categoryOpenGapTotals.set(key, 0);
  }

  const riskCounts = new Map<DashboardRiskLevelKey, number>([
    ["low", 0],
    ["medium", 0],
    ["high", 0],
  ]);

  const remediationCycleDays: number[] = [];
  const vendorSummaries = assessments.map((assessment) => {
    const gapCategorySet = new Set<DashboardCategoryKey>();
    let hasOpenGap = false;

    for (const answer of assessment.answers) {
      const categoryKey = questionToCategory.get(answer.questionId);
      if (!categoryKey) {
        continue;
      }

      categoryScoreTotals.set(
        categoryKey,
        (categoryScoreTotals.get(categoryKey) ?? 0) + scoreAnswerStatus(answer.status),
      );

      if (isOpenGapStatus(answer.status)) {
        gapCategorySet.add(categoryKey);
        categoryOpenGapTotals.set(
          categoryKey,
          (categoryOpenGapTotals.get(categoryKey) ?? 0) + 1,
        );
        hasOpenGap = true;
      }
    }

    const cycleDays = Math.max(
      1,
      Math.ceil((assessment.updatedAt.getTime() - assessment.createdAt.getTime()) / MS_PER_DAY),
    );

    if (hasOpenGap) {
      remediationCycleDays.push(cycleDays);
    }

    const riskLevel = toDashboardRiskLevel(assessment.riskLevel);
    riskCounts.set(riskLevel, (riskCounts.get(riskLevel) ?? 0) + 1);

    return {
      name: assessment.vendor.name,
      serviceType: assessment.vendor.serviceType,
      riskLevel,
      complianceScore: assessment.complianceScore,
      openGapCategories: [...gapCategorySet],
      remediationCycleDays: cycleDays,
    };
  });

  const assessmentCount = assessments.length;
  const categoryMetrics: DashboardCategoryMetric[] = DASHBOARD_CATEGORY_ORDER.map((key) => {
    const questionCount = questionCounts.get(key) ?? 0;
    const denominator = assessmentCount * questionCount;
    const averageScore =
      denominator > 0
        ? Math.round((categoryScoreTotals.get(key) ?? 0) / denominator)
        : 0;

    return {
      key,
      averageScore,
      questionCount,
      openGapCount: categoryOpenGapTotals.get(key) ?? 0,
    };
  });

  const riskBuckets: DashboardRiskBucket[] = [
    { level: "low", count: riskCounts.get("low") ?? 0 },
    { level: "medium", count: riskCounts.get("medium") ?? 0 },
    { level: "high", count: riskCounts.get("high") ?? 0 },
  ];

  const averageRemediationTimeDays = remediationCycleDays.length
    ? Math.round(
        remediationCycleDays.reduce((sum, value) => sum + value, 0) /
          remediationCycleDays.length,
      )
    : 0;

  // Check cache before calling the LLM
  let executiveSummary: DashboardExecutiveSummaryResult;

  if (raw.aiDisabled) {
    executiveSummary = {
      systemicRisk:
        locale === "de"
          ? "KI-Modus ist deaktiviert. Aktivieren Sie einen KI-Anbieter in den Einstellungen."
          : "AI mode is disabled. Enable an AI provider in Settings.",
      averageRemediationTimeDays,
      recommendedCategoryKey: null,
      source: "fallback",
    };
  } else {
    const cachedAt = companyCache?.aiSummaryUpdatedAt;
    const cacheAge = cachedAt ? Date.now() - cachedAt.getTime() : Infinity;
    const cacheHit =
      !bypassCache &&
      companyCache?.lastAiSummary &&
      cacheAge < AI_SUMMARY_CACHE_TTL_MS;

    if (cacheHit) {
      const cached = parseCachedSummary(companyCache.lastAiSummary!);
      if (cached) {
        executiveSummary = cached;
      } else {
        executiveSummary = await generateDashboardExecutiveSummary({
          companyId,
          locale,
          categoryMetrics,
          vendorSummaries,
          riskBuckets,
          averageRemediationTimeDays,
        });
      }
    } else {
      executiveSummary = await generateDashboardExecutiveSummary({
        companyId,
        locale,
        categoryMetrics,
        vendorSummaries,
        riskBuckets,
        averageRemediationTimeDays,
      });
      // Persist to cache (fire-and-forget — don't block the response)
      prisma.company.update({
        where: { id: companyId },
        data: {
          lastAiSummary: JSON.stringify({ ...executiveSummary, cachedAt: new Date().toISOString() }),
          aiSummaryUpdatedAt: new Date(),
        },
      }).catch((err: unknown) => {
        console.warn("[dashboard-risk-posture] Failed to persist AI summary cache:", err);
      });
    }
  }

  const aiGenerationCount = aiAuditEvents.filter(
    (entry) => entry.action === "AI_GENERATION",
  ).length;

  let editedByHumanCount = 0;
  let finalizedSuggestionCount = 0;

  for (const event of aiAuditEvents) {
    if (event.action === "AI_REMEDIATION_SENT") {
      finalizedSuggestionCount += 1;
      if (event.hitlVerifiedBy) editedByHumanCount += 1;
      continue;
    }

    if (event.action === "EXTERNAL_ASSESSMENT_UPDATED") {
      const metadata =
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : null;
      const newValue =
        metadata?.newValue && typeof metadata.newValue === "object"
          ? (metadata.newValue as Record<string, unknown>)
          : null;
      if (newValue?.aiSuggestionUsed === true) {
        finalizedSuggestionCount += 1;
        if (event.hitlVerifiedBy) editedByHumanCount += 1;
      }
    }
  }

  const humanOversightRate =
    finalizedSuggestionCount > 0
      ? Math.round((editedByHumanCount / finalizedSuggestionCount) * 100)
      : 0;

  const complianceTrust: ComplianceTrustMetrics = {
    aiGenerationCount,
    humanOversightRate,
    editedByHumanCount,
    finalizedSuggestionCount,
    systemIntegrityPercent: 100,
    systemIntegrityVerified: true,
    recordedAuditEntries: totalAuditCount,
  };

  return {
    categoryMetrics,
    riskBuckets,
    executiveSummary,
    complianceTrust,
  };
}
