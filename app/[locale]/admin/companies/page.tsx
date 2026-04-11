import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CompanyPlanToggle } from "@/components/admin/company-plan-toggle";
import { Badge } from "@/components/ui/badge";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { withLocalePath } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AdminCompaniesPageProps = {
  params: Promise<{ locale: string }>;
};

function getSsoStatusKey(oidcConfig: { isEnabled: boolean } | null): "ssoEnabled" | "ssoConfigured" | "ssoNotConfigured" {
  if (oidcConfig?.isEnabled === true) {
    return "ssoEnabled";
  }

  if (oidcConfig && !oidcConfig.isEnabled) {
    return "ssoConfigured";
  }

  return "ssoNotConfigured";
}

export default async function AdminCompaniesPage({ params }: AdminCompaniesPageProps) {
  const { locale } = await params;
  const session = await getOptionalAuthSession();

  if (!session) {
    redirect(withLocalePath("/auth/sign-in", locale));
  }

  if (session.role !== "SUPER_ADMIN") {
    redirect(withLocalePath("/settings", locale));
  }

  const t = await getTranslations("AdminCompanies");

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      oidcConfig: { select: { isEnabled: true } },
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("pageTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("cardDescription")}</p>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold tracking-tight">{t("cardTitle")}</h2>
        </div>

        {companies.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">{t("emptyState")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("tableCompany")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("tableSlug")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("tablePlan")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("tableSSO")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const ssoStatusKey = getSsoStatusKey(company.oidcConfig);
                  const isPremium = company.plan === "PREMIUM";

                  return (
                    <tr key={company.id} className="border-b border-slate-100 align-middle last:border-0 dark:border-slate-900">
                      <td className="px-5 py-4 font-medium">{company.name}</td>
                      <td className="px-5 py-4 text-muted-foreground">{company.slug}</td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={isPremium ? "default" : "secondary"}
                          className={isPremium ? "bg-amber-600 text-white hover:bg-amber-600" : ""}
                        >
                          {company.plan}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{t(ssoStatusKey)}</td>
                      <td className="px-5 py-4">
                        <CompanyPlanToggle
                          companyId={company.id}
                          currentPlan={company.plan}
                          companyName={company.name}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}