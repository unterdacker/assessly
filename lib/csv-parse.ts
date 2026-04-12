/**
 * RFC 4180 CSV parser — character-by-character state machine.
 * SECURITY: No regular expression may be applied to field body content.
 * This prevents Regular Expression Denial of Service (ReDoS).
 * See Gate 1 finding C1.
 */

type CsvParseState =
  | "FIELD_START"
  | "UNQUOTED"
  | "QUOTED"
  | "QUOTE_IN_QUOTED"
  | "POST_RECORD";

function isRecordTerminator(ch: string): boolean {
  return ch === "\r" || ch === "\n";
}

export function parseRfc4180(content: string): string[][] {
  if (!content) {
    return [];
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: CsvParseState = "FIELD_START";
  let fieldWasQuoted = false;
  let previousTerminatorWasCr = false;
  let index = 0;

  const commitField = () => {
    const value = fieldWasQuoted ? field : field.trim();
    row.push(value);
    field = "";
    fieldWasQuoted = false;
  };

  const commitRow = (terminator: "cr" | "lf") => {
    rows.push(row);
    row = [];
    previousTerminatorWasCr = terminator === "cr";
  };

  while (index < content.length) {
    const ch = content[index];

    if (state === "POST_RECORD") {
      if (previousTerminatorWasCr && ch === "\n") {
        previousTerminatorWasCr = false;
        index += 1;
        continue;
      }
      previousTerminatorWasCr = false;
      state = "FIELD_START";
      continue;
    }

    if (state === "FIELD_START") {
      if (ch === ",") {
        commitField();
        index += 1;
        continue;
      }
      if (ch === '"') {
        fieldWasQuoted = true;
        state = "QUOTED";
        index += 1;
        continue;
      }
      if (isRecordTerminator(ch)) {
        commitField();
        commitRow(ch === "\r" ? "cr" : "lf");
        state = "POST_RECORD";
        index += 1;
        continue;
      }

      field += ch;
      state = "UNQUOTED";
      index += 1;
      continue;
    }

    if (state === "UNQUOTED") {
      if (ch === ",") {
        commitField();
        state = "FIELD_START";
        index += 1;
        continue;
      }
      if (isRecordTerminator(ch)) {
        commitField();
        commitRow(ch === "\r" ? "cr" : "lf");
        state = "POST_RECORD";
        index += 1;
        continue;
      }

      field += ch;
      index += 1;
      continue;
    }

    if (state === "QUOTED") {
      if (ch === '"') {
        state = "QUOTE_IN_QUOTED";
        index += 1;
        continue;
      }

      field += ch;
      index += 1;
      continue;
    }

    if (state === "QUOTE_IN_QUOTED") {
      if (ch === '"') {
        field += '"';
        state = "QUOTED";
        index += 1;
        continue;
      }
      if (ch === ",") {
        commitField();
        state = "FIELD_START";
        index += 1;
        continue;
      }
      if (isRecordTerminator(ch)) {
        commitField();
        commitRow(ch === "\r" ? "cr" : "lf");
        state = "POST_RECORD";
        index += 1;
        continue;
      }

      throw new Error("Invalid CSV: unexpected character after closing quote.");
    }
  }

  if (state === "QUOTED") {
    throw new Error("Invalid CSV: unterminated quoted field.");
  }

  if (state === "QUOTE_IN_QUOTED") {
    commitField();
    rows.push(row);
    state = "POST_RECORD";
  }

  if (state !== "POST_RECORD") {
    if (state === "FIELD_START" && row.length === 0 && field.length === 0) {
      return rows;
    }
    commitField();
    rows.push(row);
  }

  return rows;
}
