const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.$connect()
  .then(() => {
    console.log("DB_OK");
    return p.user.findFirst({ where: { email: "admin@venshield.local" }, select: { id: true, email: true, role: true, isActive: true, mfaEnabled: true } });
  })
  .then((user) => {
    console.log("USER:", JSON.stringify(user));
    return p.$disconnect();
  })
  .catch((e) => {
    console.log("DB_FAIL:", e.message);
    process.exit(1);
  });
