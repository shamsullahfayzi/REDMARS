/**
 * A small RFC-4180-ish CSV parser. Deliberately hand-rolled and dependency-free:
 * the app is offline-capable and this is the only CSV we parse.
 *
 * Handles the parts that a naive `split(',')` gets wrong and that matter for real
 * drug data: quoted fields containing commas ("Co-amoxiclav, 625mg"), escaped
 * quotes inside quotes (""), and both \n and \r\n line endings. Returns rows of
 * raw string cells — validation is the caller's job, not the parser's.
 *
 * Fully blank lines are dropped so a stray trailing newline is not a phantom row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalise CRLF/CR to LF so the state machine only handles one line ending.
  const input = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush the last field/row if the text did not end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty (e.g. a blank line between records).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
