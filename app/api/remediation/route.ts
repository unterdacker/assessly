import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";
import { getAuthSessionFromRequest } from "@/lib/auth/server";

type SupportedLocale = "en" | "de";

type MessageCatalog = {
  externalAssessment?: {
    questions?: Record<string, { text?: string }>;
  };
};

type RemediationGap = {
  answerId: string;
  questionId: string;
  questionText: string;
  status: string;
  score: number;
  evidenceSnippet: string | null;
  findings: string | null;
  recommendedCorrection: string;
};

type GapResponse = {
  assessmentId: string;
  companyId: string;
  vendorName: string;
  securityContactEmail: string | null;
  gaps: RemediationGap[];
};

const QUESTION_TEXTS_BY_LOCALE: Record<SupportedLocale, Record<string, string | undefined>> = {
  en: ((enMessages as MessageCatalog).externalAssessment?.questions ?? {}) as Record<string, string | undefined>,
  de: ((deMessages as MessageCatalog).externalAssessment?.questions ?? {}) as Record<string, string | undefined>,
};

Object.keys(QUESTION_TEXTS_BY_LOCALE.en).forEach((key) => {
  const entry = (enMessages as MessageCatalog).externalAssessment?.questions?.[key];
  QUESTION_TEXTS_BY_LOCALE.en[key] = entry?.text;
});

Object.keys(QUESTION_TEXTS_BY_LOCALE.de).forEach((key) => {
  const entry = (deMessages as MessageCatalog).externalAssessment?.questions?.[key];
  QUESTION_TEXTS_BY_LOCALE.de[key] = entry?.text;
});

function normalizeLocale(raw: string | null | undefined): SupportedLocale {
  if (!raw) return "en";
  return raw.toLowerCase().startsWith("de") ? "de" : "en";
}

function getLocaleFromReferer(referer: string | null): SupportedLocale | null {
  if (!referer) return null;
  try {
    const pathname = new URL(referer).pathname;
    const segment = pathname.split("/").filter(Boolean)[0];
    if (!segment) return null;
    return normalizeLocale(segment);
  } catch {
    return null;
  }
}

function detectLocale(request: NextRequest, explicitLocale?: string): SupportedLocale {
  if (explicitLocale) {
    return normalizeLocale(explicitLocale);
  }

  const queryLocale = request.nextUrl.searchParams.get("locale");
  if (queryLocale) {
    return normalizeLocale(queryLocale);
  }

  const refererLocale = getLocaleFromReferer(request.headers.get("referer"));
  if (refererLocale) {
    return refererLocale;
  }

  const acceptLanguage = request.headers.get("accept-language");
  return normalizeLocale(acceptLanguage);
}

function getLocalizedQuestionText(args: {
  questionId: string;
  fallbackText: string;
  locale: SupportedLocale;
}): string {
  const candidate = QUESTION_TEXTS_BY_LOCALE[args.locale][args.questionId];
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate;
  }
  return args.fallbackText;
}

function scoreFromStatus(status: string): number {
  const normalized = status.trim().toUpperCase();
  if (normalized === "COMPLIANT") return 100;
  if (normalized === "PARTIALLY_COMPLIANT") return 60;
  if (normalized === "FLAGGED") return 40;
  return 35;
}

function deriveRecommendedCorrection(
  questionText: string,
  status: string,
  locale: SupportedLocale,
): string {
  const q = questionText.toLowerCase();

  const correction = {
    password:
      locale === "de"
        ? "Aktualisieren Sie Ihre Passwortrichtlinie auf mindestens 16 Zeichen, sperren Sie bekannte kompromittierte Passwoerter und erzwingen Sie MFA fuer privilegierte Konten."
        : "Update your Password Policy to require at least 16 characters, ban breached passwords, and enforce MFA for privileged users.",
    mfa:
      locale === "de"
        ? "Erzwingen Sie Multi-Faktor-Authentifizierung fuer alle Remote- und Administrationszugaenge und dokumentieren Sie Ausnahmen mit kompensierenden Kontrollen."
        : "Enforce multi-factor authentication for all remote and administrative access and document exceptions with compensating controls.",
    incident:
      locale === "de"
        ? "Finalisieren und genehmigen Sie einen Incident-Response-Plan mit benannten Rollen, Eskalationsschwellen und Fristen zur Kundenbenachrichtigung."
        : "Finalize and approve an incident response plan with named roles, escalation thresholds, and customer notification timelines.",
    patching:
      locale === "de"
        ? "Definieren und implementieren Sie Patch-SLAs nach Kritikalitaet (z. B. kritisch innerhalb von 7 Tagen) und dokumentieren Sie den Abschluss nachvollziehbar."
        : "Define and implement patch SLAs by severity (for example, critical within 7 days) and retain evidence of closure.",
    crypto:
      locale === "de"
        ? "Implementieren Sie dokumentierte Verfahren fuer Verschluesselung und Schluessel-Lebenszyklus (Erzeugung, Rotation, Sperrung und sichere Speicherung)."
        : "Implement documented encryption and key lifecycle procedures for key generation, rotation, revocation, and secure storage.",
    logging:
      locale === "de"
        ? "Aktivieren Sie eine zentrale, manipulationsgeschuetzte Protokollierung mit Alarmierung und Aufbewahrung gemaess regulatorischer Anforderungen."
        : "Enable centralized log collection with tamper protection, alerting, and retention aligned to regulatory obligations.",
    access:
      locale === "de"
        ? "Dokumentieren Sie rollenbasierte Zugriffssteuerung und fuehren Sie quartalsweise Zugriffspruefungen mit sofortigem Entzug bei Austritt durch."
        : "Document role-based access controls and perform quarterly access reviews, including immediate revocation for leavers.",
    continuity:
      locale === "de"
        ? "Testen Sie Business-Continuity- und Disaster-Recovery-Plaene mit definierten RTO/RPO und dokumentieren Sie abgeleitete Verbesserungsmassnahmen."
        : "Test business continuity and disaster recovery plans with defined RTO/RPO and record remediation actions from test findings.",
    flagged:
      locale === "de"
        ? "Legen Sie formale Korrektur-Nachweise fuer diese markierte Kontrolle vor, inklusive Richtlinienupdate, Verantwortlichkeit und Umsetzungstermin."
        : "Provide formal corrective evidence for this flagged control, including policy updates, ownership, and implementation dates.",
    fallback:
      locale === "de"
        ? "Legen Sie aktualisierte Richtliniennachweise und einen Umsetzungsplan mit klarer Verantwortung, Meilensteinen und Verifikationskriterien vor."
        : "Provide updated policy evidence and an implementation record with clear ownership, milestones, and verification criteria.",
  };

  if (q.includes("password")) {
    return correction.password;
  }
  if (q.includes("multi-factor") || q.includes("mfa")) {
    return correction.mfa;
  }
  if (q.includes("incident")) {
    return correction.incident;
  }
  if (q.includes("patch") || q.includes("vulnerability")) {
    return correction.patching;
  }
  if (q.includes("encrypt") || q.includes("crypt") || q.includes("key")) {
    return correction.crypto;
  }
  if (q.includes("log") || q.includes("monitor")) {
    return correction.logging;
  }
  if (q.includes("access") || q.includes("privilege")) {
    return correction.access;
  }
  if (q.includes("business continuity") || q.includes("disaster")) {
    return correction.continuity;
  }

  if (status.toUpperCase() === "FLAGGED") {
    return correction.flagged;
  }

  return correction.fallback;
}

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
  return "";
}

async function getVendorGaps(
  vendorId: string,
  locale: SupportedLocale,
  companyId: string,
): Promise<GapResponse | null> {
  const assessment = await prisma.assessment.findUnique({
    where: { vendorId },
    select: {
      id: true,
      companyId: true,
      vendor: {
        select: {
          name: true,
          securityOfficerEmail: true,
        },
      },
      answers: {
        select: {
          id: true,
          questionId: true,
          status: true,
          findings: true,
          evidenceSnippet: true,
        },
      },
    },
  });

  if (!assessment) {
    return null;
  }

  if (assessment.companyId !== companyId) {
    return null;
  }

  const questionIds = assessment.answers.map((a) => a.questionId);
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      text: true,
    },
  });
  const questionById = new Map(questions.map((q) => [q.id, q.text]));

  const gaps = assessment.answers
    .map((answer) => {
      const score = scoreFromStatus(answer.status);
      const fallbackText =
        questionById.get(answer.questionId) || `Control ${answer.questionId}`;
      const questionText = getLocalizedQuestionText({
        questionId: answer.questionId,
        fallbackText,
        locale,
      });

      return {
        answerId: answer.id,
        questionId: answer.questionId,
        questionText,
        status: answer.status,
        score,
        evidenceSnippet: answer.evidenceSnippet,
        findings: answer.findings,
        recommendedCorrection: deriveRecommendedCorrection(
          questionText,
          answer.status,
          locale,
        ),
      };
    })
    .filter((gap) => gap.score < 60 || gap.status.toUpperCase() === "FLAGGED")
    .sort((a, b) => a.score - b.score);

  return {
    assessmentId: assessment.id,
    companyId: assessment.companyId,
    vendorName: assessment.vendor.name,
    securityContactEmail: assessment.vendor.securityOfficerEmail ?? null,
    gaps,
  };
}

function buildRemediationPrompt(args: {
  locale: "en" | "de";
  vendorName: string;
  deadlineDate: string;
  gaps: RemediationGap[];
}): string {
  const { locale, vendorName, deadlineDate, gaps } = args;
  const localeLabel = locale === "de" ? "German" : "English";
  const evidenceFallback =
    locale === "de" ? "Kein expliziter Nachweis angegeben." : "No explicit evidence provided.";

  const gapBlock = gaps
    .slice(0, 12)
    .map((gap, index) => {
      return [
        `Question ID: ${gap.questionId}`,
        `${index + 1}. Control Gap: ${gap.questionText}`,
        `Status: ${gap.status}`,
        `Score: ${gap.score}`,
        `Evidence Hint: ${gap.evidenceSnippet || gap.findings || evidenceFallback}`,
        `Recommended Correction: ${gap.recommendedCorrection}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `You are a Senior GRC Officer for AVRA. The current user interface is set to ${locale}. You MUST generate the remediation plan and the email draft entirely in ${localeLabel}.`,
    "When raw question IDs or control categories appear in source data, map them to professional, localized NIS2 control terminology in the output.",
    "Tone requirements: professional, polite, and firm.",
    "Required structure:",
    "- Subject line",
    "- Greeting",
    "- Short context paragraph referencing NIS2 obligations",
    "- A numbered list of specific control gaps from the evidence",
    "- For each gap include: issue, impact, and the provided Recommended Correction",
    "- A deadline paragraph with the exact date",
    "- Closing paragraph with next steps",
    "Do not use markdown, code fences, or placeholders.",
    `Vendor name: ${vendorName}`,
    `Deadline date: ${deadlineDate}`,
    "Gaps:",
    gapBlock,
  ].join("\n");
}

async function generateRemediationDraft(args: {
  companyId: string;
  prompt: string;
  locale: SupportedLocale;
}): Promise<{
  draft: string;
  modelInfo: {
    provider: string;
    modelId: string;
    endpoint?: string;
  };
  rawAiOutput: string;
}> {
  const config = await prisma.company.findUnique({
    where: { id: args.companyId },
    select: {
      aiProvider: true,
      mistralApiKey: true,
      localAiEndpoint: true,
    },
  });

  if (!config) {
    throw new Error("Company configuration not found.");
  }

  const provider = (process.env.AI_PROVIDER || config.aiProvider || "mistral").toLowerCase();

  const localeLabel = args.locale === "de" ? "German" : "English";
  const localeSystemPrompt = `You are a Senior GRC Officer for AVRA. The current user interface is set to ${args.locale}. You MUST generate the remediation plan and the email draft entirely in ${localeLabel}. Ensure NIS2 terminology is professionally translated.`;

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
          content: localeSystemPrompt,
        },
        {
          role: "user",
          content: args.prompt,
        },
      ],
    });

    const content = normalizeModelContent(response.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error("Received empty response from Mistral.");
    }
    return {
      draft: content,
      modelInfo: {
        provider: "mistral",
        modelId: "mistral-large-latest",
      },
      rawAiOutput: content,
    };
  }

  const endpoint =
    (process.env.LOCAL_AI_ENDPOINT || config.localAiEndpoint || "http://localhost:11434/v1").trim();

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.LOCAL_AI_MODEL || "mistral",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: localeSystemPrompt,
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

  const data = await response.json();
  const content = normalizeModelContent(data?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("Received empty response from local LLM.");
  }

  return {
    draft: content,
    modelInfo: {
      provider: "local",
      modelId: process.env.LOCAL_AI_MODEL || "mistral",
      endpoint,
    },
    rawAiOutput: content,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSessionFromRequest(request);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const locale = detectLocale(request);
    const vendorId = request.nextUrl.searchParams.get("vendorId")?.trim();
    if (!vendorId) {
      return NextResponse.json(
        { ok: false, error: "Missing vendorId query parameter." },
        { status: 400 },
      );
    }

    const result = await getVendorGaps(vendorId, locale, session.companyId ?? "");
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Vendor assessment not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      vendorName: result.vendorName,
      securityContactEmail: result.securityContactEmail,
      vendorEmail: result.securityContactEmail,
      gaps: result.gaps,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSessionFromRequest(request);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = (await request.json()) as {
      vendorId?: string;
      locale?: string;
      deadlineDays?: number;
    };

    const locale = detectLocale(request, body.locale);
    const vendorId = body.vendorId?.trim();
    if (!vendorId) {
      return NextResponse.json(
        { ok: false, error: "vendorId is required." },
        { status: 400 },
      );
    }

    const result = await getVendorGaps(vendorId, locale, session.companyId ?? "");
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Vendor assessment not found." },
        { status: 404 },
      );
    }

    const deadlineDays =
      typeof body.deadlineDays === "number" && body.deadlineDays > 0
        ? body.deadlineDays
        : 14;
    const deadlineDateObj = new Date();
    deadlineDateObj.setDate(deadlineDateObj.getDate() + deadlineDays);
    const deadlineDate = deadlineDateObj.toISOString().slice(0, 10);

    if (result.gaps.length === 0) {
      const fallback =
        locale === "de"
          ? [
              "Betreff: AVRA NIS2 Pruefung - Bestaetigung der Kontrollabdeckung",
              "",
              `Sehr geehrtes ${result.vendorName}-Sicherheitsteam,`,
              "",
              "vielen Dank fuer Ihr aktuelles Nachweispaket. In der aktuellen Pruefung wurden keine kritischen Remediation-Punkte mit unmittelbarem Handlungsbedarf festgestellt.",
              "",
              `Bitte halten Sie Ihre Kontrollen weiterhin aufrecht und melden Sie wesentliche Aenderungen bis ${deadlineDate}, damit die NIS2-Nachweisfuehrung vollstaendig bleibt.`,
              "",
              "Mit freundlichen Gruessen",
              "AVRA GRC Team",
            ].join("\n")
          : [
              "Subject: AVRA NIS2 Review - Confirmation of Control Coverage",
              "",
              `Dear ${result.vendorName} Security Team,`,
              "",
              "Thank you for the latest evidence package. Our current review did not identify critical remediation items requiring immediate correction.",
              "",
              `Please continue maintaining your controls and provide any major control updates by ${deadlineDate} so the record remains complete for NIS2 oversight.`,
              "",
              "Kind regards,",
              "AVRA GRC Team",
            ].join("\n");

      return NextResponse.json({
        ok: true,
        deadlineDate,
        gaps: [],
        draft: fallback,
        vendorName: result.vendorName,
        securityContactEmail: result.securityContactEmail,
        vendorEmail: result.securityContactEmail,
      });
    }

    const prompt = buildRemediationPrompt({
      locale,
      vendorName: result.vendorName,
      deadlineDate,
      gaps: result.gaps,
    });

    const generated = await generateRemediationDraft({
      companyId: result.companyId,
      prompt,
      locale,
    });

    let aiGenerationEventId: string | null = null;
    try {
      const auditRow = await logAuditEvent(
        {
          companyId: result.companyId,
          userId: "ai-system",
          action: "AI_GENERATION",
          entityType: "remediation_plan",
          entityId: result.assessmentId,
          previousValue: null,
          newValue: {
            source: "remediation_plan",
            vendorId,
            prompt_snapshot: prompt,
            model_info: generated.modelInfo,
            raw_ai_output: generated.rawAiOutput,
          },
        },
        { captureHeaders: false },
      );
      aiGenerationEventId = auditRow?.id ?? null;
    } catch {
      aiGenerationEventId = null;
    }

    return NextResponse.json({
      ok: true,
      draft: generated.draft,
      deadlineDate,
      gaps: result.gaps,
      vendorName: result.vendorName,
      securityContactEmail: result.securityContactEmail,
      vendorEmail: result.securityContactEmail,
      aiGenerationEventId,
      originalAiOutput: generated.rawAiOutput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}