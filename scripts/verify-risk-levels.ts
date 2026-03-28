import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.assessment.findMany({ select: { complianceScore: true, riskLevel: true } })
  .then(rows => rows.forEach(r => console.log(`score: ${r.complianceScore} → ${r.riskLevel}`)))
  .finally(() => p.$disconnect());
