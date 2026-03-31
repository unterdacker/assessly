import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { prisma } from "@/lib/prisma";
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

export type DashboardRiskPostureOverview = {
  categoryMetrics: DashboardCategoryMetric[];
  riskBuckets: DashboardRiskBucket[];
  executiveSummary: DashboardExecutiveSummary;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toDashboardRiskLevel(level: string): DashboardRiskLevelKey {
  if (level === "LOW") return "low";
  if (level === "HIGH") return "high";
  return "medium";
}

export async function getDashboardRiskPostureOverview(
  locale: SupportedLocale,
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
    };
  }

  const [questions, assessments] = await prisma.$transaction([
    prisma.question.findMany({
      select: {
        id: true,
        category: true,
      },
    }),
    prisma.assessment.findMany({
      where: { companyId },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        riskLevel: true,
        complianceScore: true,
        vendor: {
          select: {
            name: true,
            serviceType: true,
          },
        },
        answers: {
          select: {
            questionId: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

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

  const executiveSummary = await generateDashboardExecutiveSummary({
    companyId,
    locale,
    categoryMetrics,
    vendorSummaries,
    riskBuckets,
    averageRemediationTimeDays,
  });

  return {
    categoryMetrics,
    riskBuckets,
    executiveSummary,
  };
}
