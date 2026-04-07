// OWASP CSV Injection prevention — https://owasp.org/www-community/attacks/CSV_Injection
// Steps: (1) strip non-printable control chars, (2) prefix formula triggers, (3) RFC-4180 quote.
export function escapeCsvValue(value: string): string {
  // Step 1 — strip control characters U+0000–U+001F except:
  //   TAB (0x09)  — preserved, neutralized by Step 2 when at position 0
  //   LF  (0x0A)  — preserved, RFC-4180 allows LF inside a quoted field
  //   CR  (0x0D)  — preserved, neutralized by Step 2 when at position 0;
  //                 Step 3 wraps field in double-quotes if CR appears anywhere
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // Step 2 — neutralize formula injection triggers at field start.
  // Excel, LibreOffice, and Google Sheets evaluate fields starting with
  // =, +, -, @, TAB, or CR as formulas.
  const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
  const safe = FORMULA_TRIGGERS.test(cleaned) ? `'${cleaned}` : cleaned;

  // Step 3 — RFC-4180 quoting: wrap field if it contains comma, LF, CR, or double-quote.
  if (safe.includes(",") || safe.includes("\n") || safe.includes("\r") || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCsvRows(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "id,timestamp,action,entityType,entityId,eventHash,previousLogHash";
  }

  const columns = Object.keys(rows[0]);
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return escapeCsvValue(value);
        return escapeCsvValue(JSON.stringify(value));
      })
      .join(","),
  );

  return [columns.join(","), ...lines].join("\n");
}
