import { redirect } from "next/navigation";

interface AssessmentBasePageProps {
  params: Promise<{ locale: string }>;
}

export default async function AssessmentBasePage({ params }: AssessmentBasePageProps) {
  const { locale } = await params;
  redirect(`/${locale}/external/portal`);
}
