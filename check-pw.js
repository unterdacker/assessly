const bcrypt = require('bcryptjs');
const adminHash = '$2b$12$7ify4PSLtu39emm2Y/Gmg./o9Oc4ZoCEBQe25OTioQB4dYPQ.BPG6';
const auditorHash = '$2b$12$Bzy1z31Fkxov43riIw5BEeDoJ32qKgce9Uo66vhsEzsaIEtv59Ndu';

const candidates = [
  'change-me-strong-password',
  'admin123',
  'auditor123',
  'Admin1234!',
];

(async () => {
  for (const p of candidates) {
    const adminMatch = await bcrypt.compare(p, adminHash);
    const auditorMatch = await bcrypt.compare(p, auditorHash);
    console.log(`"${p}" -> admin:${adminMatch} auditor:${auditorMatch}`);
  }
})();
