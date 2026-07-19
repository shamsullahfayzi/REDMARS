import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drugFieldsSchema } from '@redmars/shared';
import { parseCsv } from './../src/modules/drug/csv';

/**
 * Task 2.5 — the seeded formulary. No database: this validates the checked-in CSV
 * itself, so a typo in the data file fails CI rather than surfacing at seed time on
 * someone's install.
 *
 * The done-when ("the drugs Dr. H prescribes exist") is encoded as a presence check
 * for the core psychiatric medicines, plus proof that controlled substances are
 * flagged — the one field where a data error has clinical weight.
 */
const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);

function loadRows() {
  const csv = readFileSync(
    join(__dirname, '..', 'prisma', 'data', 'essential-medicines.csv'),
    'utf8',
  );
  const rows = parseCsv(csv);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    code: header.indexOf('code'),
    genericName: header.indexOf('genericname'),
    strength: header.indexOf('strength'),
    form: header.indexOf('form'),
    defaultRoute: header.indexOf('defaultroute'),
    defaultFreq: header.indexOf('defaultfreq'),
    defaultDuration: header.indexOf('defaultduration'),
    isControlled: header.indexOf('iscontrolled'),
  };
  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
  const data = rows.slice(1).map((cells, r) => ({
    line: r + 2,
    code: at(cells, idx.code),
    genericName: at(cells, idx.genericName),
    strength: at(cells, idx.strength),
    form: at(cells, idx.form),
    defaultRoute: at(cells, idx.defaultRoute),
    defaultFreq: at(cells, idx.defaultFreq),
    defaultDuration: at(cells, idx.defaultDuration),
    isControlled: TRUE_VALUES.has(at(cells, idx.isControlled).toLowerCase()),
  }));
  return { header, data };
}

describe('Essential medicines seed data (2.5)', () => {
  const { header, data } = loadRows();

  it('has the required columns and a healthy number of rows', () => {
    expect(header).toContain('code');
    expect(header).toContain('genericname');
    expect(data.length).toBeGreaterThanOrEqual(50);
  });

  it('every row validates against the drug contract', () => {
    const failures: string[] = [];
    for (const row of data) {
      const result = drugFieldsSchema.safeParse(row);
      if (!result.success) {
        failures.push(`line ${row.line} (${row.code}): ${result.error.issues[0]?.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('has no duplicate codes', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const row of data) {
      if (seen.has(row.code)) dupes.push(row.code);
      seen.add(row.code);
    }
    expect(dupes).toEqual([]);
  });

  it('the done-when: the core drugs Dr. H prescribes exist', () => {
    const generics = new Set(data.map((r) => r.genericName.toLowerCase()));
    const mustHave = [
      'duloxetine',
      'sertraline',
      'fluoxetine',
      'amitriptyline',
      'risperidone',
      'olanzapine',
      'haloperidol',
      'diazepam',
      'lithium carbonate',
    ];
    for (const drug of mustHave) {
      expect(generics.has(drug)).toBe(true);
    }
  });

  it('flags controlled substances — diazepam is controlled, paracetamol is not', () => {
    const diazepam = data.find((r) => r.genericName.toLowerCase() === 'diazepam');
    const paracetamol = data.find((r) => r.genericName.toLowerCase() === 'paracetamol');
    expect(diazepam?.isControlled).toBe(true);
    expect(paracetamol?.isControlled).toBe(false);
  });

  it('the done-when (2.6): duloxetine carries prescribing defaults, a benzo does not', () => {
    // The named example: duloxetine autofills oral / OD / 1 month.
    const duloxetine = data.find((r) => r.code === 'DULOX30');
    expect(duloxetine?.defaultRoute).toBe('oral');
    expect(duloxetine?.defaultFreq).toBe('OD');
    expect(duloxetine?.defaultDuration).toBe('1 month');

    // Controlled / acute drugs are left blank on purpose — no guessed benzo regimen.
    const diazepam = data.find((r) => r.code === 'DIAZ5');
    expect(diazepam?.defaultRoute).toBe('');
    expect(diazepam?.defaultFreq).toBe('');
    expect(diazepam?.defaultDuration).toBe('');
  });
});
