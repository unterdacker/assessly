/**
 * One-time backfill: recalculate riskLevel for every Assessment
 * based on its current complianceScore.
 *
 * Run with: npx tsx scripts/backfill-risk-levels.ts
 */
import { PrismaClient, RiskLevel } from "@prisma/client";

const prisma = new PrismaClient();

function calculateRiskLevel(score: number): RiskLevel {
  if (score < 40) return "HIGH";
  if (score < 70) return "MEDIUM";
  return "LOW";
}

async function main() {
  const assessments = await prisma.assessment.findMany({
    select: { id: true, complianceScore: true, riskLevel: true },
  });

  console.log(`Found ${assessments.length} assessments to check.`);

  let updated = 0;
  for (const a of assessments) {
    const correct = calculateRiskLevel(a.complianceScore);
    if (a.riskLevel !== correct) {
      await prisma.assessment.update({
        where: { id: a.id },
        data: { riskLevel: correct },
      });
      console.log(
        `  Updated ${a.id}: score=${a.complianceScore} → ${a.riskLevel} ➜ ${correct}`,
      );
      updated++;
    }
  }

  console.log(`\nDone. ${updated} of ${assessments.length} records updated.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
