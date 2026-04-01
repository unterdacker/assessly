import { Mistral } from "@mistralai/mistralai";
import { prisma } from "@/lib/prisma";
import {
  DASHBOARD_CATEGORY_ORDER,
  type DashboardCategoryKey,
  type DashboardRiskLevelKey,
} from "@/lib/dashboard-risk-posture";

type SupportedLocale = "en" | "de";

type CategoryMetricInput = {
  key: DashboardCategoryKey;
  averageScore: number;
  questionCount: number;
  openGapCount: number;
};

type VendorSummaryInput = {
  name: string;
  serviceType: string;
  riskLevel: DashboardRiskLevelKey;
  complianceScore: number;
  openGapCategories: DashboardCategoryKey[];
  remediationCycleDays: number;
};

type RiskBucketInput = {
  level: DashboardRiskLevelKey;
  count: number;
};

export type DashboardExecutiveSummaryResult = {
  systemicRisk: string;
  averageRemediationTimeDays: number;
  recommendedCategoryKey: DashboardCategoryKey | null;
  source: "ai" | "fallback";
};

type GenerateDashboardExecutiveSummaryArgs = {
  companyId: string;
  locale: SupportedLocale;
  categoryMetrics: CategoryMetricInput[];
  vendorSummaries: VendorSummaryInput[];
  riskBuckets: RiskBucketInput[];
  averageRemediationTimeDays: number;
};

function normalizeModelContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }

  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text.trim() : "";
  }

  return "";
}

function stripCodeFences(input: string): string {
  return input.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function extractBalancedJson(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index++) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) {
      return input.slice(start, index + 1).trim();
    }
  }

  return null;
}

function parseSummaryResponse(rawContent: unknown): {
  systemicRisk: string;
  averageRemediationTimeDays?: number;
  recommendedCategoryKey?: string | null;
} {
  const normalized = stripCodeFences(normalizeModelContent(rawContent));
  const candidate = extractBalancedJson(normalized) ?? normalized;
  const parsed = JSON.parse(candidate) as {
    systemicRisk?: unknown;
    averageRemediationTimeDays?: unknown;
    recommendedCategoryKey?: unknown;
  };

  if (typeof parsed.systemicRisk !== "string" || !parsed.systemicRisk.trim()) {
    throw new Error("Executive summary response did not include systemicRisk.");
  }

  return {
    systemicRisk: parsed.systemicRisk.trim(),
    averageRemediationTimeDays:
      typeof parsed.averageRemediationTimeDays === "number"
        ? parsed.averageRemediationTimeDays
        : undefined,
    recommendedCategoryKey:
      typeof parsed.recommendedCategoryKey === "string"
        ? parsed.recommendedCategoryKey
        : null,
  };
}

function getFallbackSummary(
  args: GenerateDashboardExecutiveSummaryArgs,
): DashboardExecutiveSummaryResult {
  const weakestCategory = [...args.categoryMetrics].sort(
    (left, right) => left.averageScore - right.averageScore,
  )[0];

  const weakestCategoryLabel = weakestCategory
    ? formatCategoryKey(weakestCategory.key, args.locale)
    : null;

  const systemicRisk =
    args.locale === "de"
      ? weakestCategoryLabel
        ? `Die auffaelligste systemische Schwaeche konzentriert sich aktuell auf ${weakestCategoryLabel} mit ueberdurchschnittlich vielen offenen Kontrollluecken.`
        : "Die Lieferkette zeigt aktuell keine einzelne, klar dominierende systemische Schwaeche."
      : weakestCategoryLabel
        ? `The clearest systemic weakness currently concentrates in ${weakestCategoryLabel}, where open control gaps outnumber the rest of the posture.`
        : "The current vendor set does not show a single dominant systemic weakness.";

  return {
    systemicRisk,
    averageRemediationTimeDays: args.averageRemediationTimeDays,
    recommendedCategoryKey: weakestCategory?.key ?? null,
    source: "fallback",
  };
}

function formatCategoryKey(
  key: DashboardCategoryKey,
  locale: SupportedLocale,
): string {
  const labels: Record<DashboardCategoryKey, { en: string; de: string }> = {
    governanceRisk: {
      en: "governance and risk management",
      de: "Governance und Risikomanagement",
    },
    accessIdentity: {
      en: "access and identity",
      de: "Zugriff und Identitaet",
    },
    dataProtectionPrivacy: {
      en: "data protection and privacy",
      de: "Datenschutz und Privatsphaere",
    },
    encryption: {
      en: "encryption and key management",
      de: "Verschluesselung und Schluesselmanagement",
    },
    operationsMonitoring: {
      en: "operations and monitoring",
      de: "Betrieb und Ueberwachung",
    },
    incidentManagement: {
      en: "incident management and continuity",
      de: "Incident-Management und Kontinuitaet",
    },
    supplyChainSecurity: {
      en: "supply chain security",
      de: "Lieferkettensicherheit",
    },
  };

  return labels[key][locale];
}

function normalizeRecommendedCategory(
  key: string | null | undefined,
): DashboardCategoryKey | null {
  if (!key) return null;

  return DASHBOARD_CATEGORY_ORDER.includes(key as DashboardCategoryKey)
    ? (key as DashboardCategoryKey)
    : null;
}

function buildPrompt(args: GenerateDashboardExecutiveSummaryArgs): string {
  const localeLabel = args.locale === "de" ? "German" : "English";
  const categoryLines = args.categoryMetrics
    .map(
      (metric) =>
        `- ${metric.key}: avg=${metric.averageScore}, questions=${metric.questionCount}, openGaps=${metric.openGapCount}`,
    )
    .join("\n");

  const riskLines = args.riskBuckets
    .map((bucket) => `- ${bucket.level}: ${bucket.count}`)
    .join("\n");

  const vendorLines = args.vendorSummaries
    .map(
      (vendor) =>
        `- ${vendor.name} | serviceType=${vendor.serviceType} | risk=${vendor.riskLevel} | score=${vendor.complianceScore} | remediationCycleDays=${vendor.remediationCycleDays} | gapCategories=${vendor.openGapCategories.join(", ") || "none"}`,
    )
    .join("\n");

  return [
    `You are the AVRA executive risk analyst. Respond entirely in ${localeLabel}.`,
    "Analyze the full vendor list and produce a concise executive summary for a supply-chain admin dashboard.",
    "Return JSON only with this exact schema:",
    '{"systemicRisk":"string","averageRemediationTimeDays":number,"recommendedCategoryKey":"governanceRisk|accessIdentity|dataProtectionPrivacy|encryption|operationsMonitoring|incidentManagement|supplyChainSecurity"}',
    "Rules:",
    "- systemicRisk must be one sentence, specific, and framed for an executive reader.",
    "- averageRemediationTimeDays must be an integer based on the supplied data; do not invent a different methodology.",
    "- recommendedCategoryKey must be one of the allowed keys above.",
    `Computed average remediation time from live assessment timestamps: ${args.averageRemediationTimeDays} days.`,
    "Category posture:",
    categoryLines,
    "Risk distribution:",
    riskLines,
    "Vendor list:",
    vendorLines || "- none",
  ].join("\n");
}

async function runProviderPrompt(args: {
  companyId: string;
  prompt: string;
}): Promise<unknown> {
  const config = await prisma.company.findUnique({
    where: { id: args.companyId },
    select: {
      aiProvider: true,
      mistralApiKey: true,
      localAiEndpoint: true,
      localAiModel: true,
    },
  });

  if (!config) {
    throw new Error("Company configuration not found.");
  }

  const provider = (process.env.AI_PROVIDER || config.aiProvider || "mistral").toLowerCase();

  if (provider === "mistral") {
    const apiKey = (process.env.MISTRAL_API_KEY || config.mistralApiKey || "").trim();
    if (!apiKey) {
      throw new Error("Mistral API key not configured.");
    }

    const client = new Mistral({ apiKey });
    const response = await client.chat.complete({
      model: "mistral-large-latest",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You produce structured executive risk summaries for AVRA dashboards.",
        },
        {
          role: "user",
          content: args.prompt,
        },
      ],
    });

    return response.choices?.[0]?.message?.content;
  }

  const rawEndpoint = (process.env.LOCAL_AI_ENDPOINT || config.localAiEndpoint || "http://localhost:11434").trim();
  // Normalize: strip trailing /v1 or slash so we always control the full path.
  const endpoint = rawEndpoint.replace(/\/v1\/?$/, "").replace(/\/$/, "");

  const modelId = (process.env.LOCAL_AI_MODEL || config.localAiModel?.trim() || "ministral-3:8b").trim();
  const fullUrl = `${endpoint}/v1/chat/completions`;
  console.log("[AI] Requesting executive summary from:", fullUrl, "model:", modelId);

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You produce structured executive risk summaries for AVRA dashboards.",
        },
        {
          role: "user",
          content: args.prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Local LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  return data.choices?.[0]?.message?.content;
}

export async function generateDashboardExecutiveSummary(
  args: GenerateDashboardExecutiveSummaryArgs,
): Promise<DashboardExecutiveSummaryResult> {
  try {
    const rawContent = await runProviderPrompt({
      companyId: args.companyId,
      prompt: buildPrompt(args),
    });
    const parsed = parseSummaryResponse(rawContent);

    return {
      systemicRisk: parsed.systemicRisk,
      averageRemediationTimeDays:
        typeof parsed.averageRemediationTimeDays === "number"
          ? Math.max(0, Math.round(parsed.averageRemediationTimeDays))
          : args.averageRemediationTimeDays,
      recommendedCategoryKey:
        normalizeRecommendedCategory(parsed.recommendedCategoryKey) ??
        getFallbackSummary(args).recommendedCategoryKey,
      source: "ai",
    };
  } catch (error) {
    console.warn("[dashboard-executive-summary] Falling back to deterministic summary.", error);
    return getFallbackSummary(args);
  }
}
