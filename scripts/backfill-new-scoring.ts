import { PrismaClient } from "@prisma/client";
import { strictComplianceFromAnswers } from "../lib/assessment-compliance";

const prisma = new PrismaClient();

async function main() {
  const totalQuestions = await prisma.question.count();

  const assessments = await prisma.assessment.findMany({
    include: { answers: { select: { status: true } } },
  });

  console.log(`Found ${assessments.length} assessments. Total questions: ${totalQuestions}`);

  let updated = 0;
  for (const a of assessments) {
    const { score, riskLevel } = strictComplianceFromAnswers(a.answers, totalQuestions);
    if (a.complianceScore !== score || a.riskLevel !== riskLevel) {
      await prisma.assessment.update({
        where: { id: a.id },
        data: { complianceScore: score, riskLevel },
      });
      console.log(`Updated ${a.id}: score ${a.complianceScore} -> ${score}, risk ${a.riskLevel} -> ${riskLevel}`);
      updated++;
    }
  }

  console.log(`\nDone. ${updated} assessments updated.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());