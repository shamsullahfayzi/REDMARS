import { BadRequestException } from '@nestjs/common';

/** Strict Excel CSV reader. Quoted fields, escaped quotes, CRLF and BOM are accepted. */
export function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const push = () => {
    row.push(field.trim());
    field = '';
    closed = false;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"') {
      if (field.length || closed) throw new BadRequestException('Malformed CSV quote.');
      quoted = true;
    } else if (c === ',') push();
    else if (c === '\n') {
      push();
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else if (c === '\r') throw new BadRequestException('Use UTF-8 CSV with normal line endings.');
    else {
      if (closed && c.trim())
        throw new BadRequestException('Unexpected text after a quoted field.');
      field += c;
    }
  }
  if (quoted) throw new BadRequestException('Unclosed CSV quote.');
  push();
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function openingCsv(text: string) {
  const rows = csvRows(text);
  if (rows.shift()?.join(',') !== 'accountCode,debit,credit,description')
    throw new BadRequestException('CSV headings must be accountCode,debit,credit,description.');
  if (rows.length < 2 || rows.length > 1000)
    throw new BadRequestException('Opening balances require 2–1,000 rows.');
  const codes = new Set<string>();
  return rows.map((r, i) => {
    if (r.length !== 4)
      throw new BadRequestException(`CSV row ${i + 2} must contain four columns.`);
    const [accountCode, debit, credit, description] = r;
    if (!accountCode || codes.has(accountCode))
      throw new BadRequestException(`CSV row ${i + 2}: missing or repeated account code.`);
    codes.add(accountCode);
    if (
      description.length > 240 ||
      ![debit, credit].every((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v || '0'))
    )
      throw new BadRequestException(
        `CSV row ${i + 2}: use plain decimal amounts and a description of at most 240 characters.`,
      );
    return { accountCode, debit: debit || '0', credit: credit || '0', description };
  });
}
