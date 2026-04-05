import { redirect } from "next/navigation";

type PortalAliasPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PortalAliasPage({ params }: PortalAliasPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/external/portal`);
}
