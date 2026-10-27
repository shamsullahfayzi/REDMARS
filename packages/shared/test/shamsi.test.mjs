import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import * as esm from '../dist/esm/shamsi.js'

const require = createRequire(import.meta.url)
const cjs = require('../dist/cjs/shamsi.js')
const DAY = 86_400_000

// Fixed regression fixtures. Provenance and independent verification are documented
// in docs/finance-shamsi-engine.md; expected values are not computed with the library.
const dates = [
  ['1391-01-01', '2012-03-20'],
  ['1394-12-29', '2016-03-19'],
  ['1395-01-01', '2016-03-20'],
  ['1395-01-23', '2016-04-11'],
  ['1395-12-30', '2017-03-20'],
  ['1396-01-01', '2017-03-21'],
  ['1399-01-01', '2020-03-20'],
  ['1399-12-30', '2021-03-20'],
  ['1400-01-01', '2021-03-21'],
  ['1403-01-01', '2024-03-20'],
  ['1403-12-30', '2025-03-20'],
  ['1404-01-01', '2025-03-21'],
  ['1404-06-31', '2025-09-22'],
  ['1404-07-01', '2025-09-23'],
  ['1404-07-05', '2025-09-27'],
  ['1404-12-29', '2026-03-20'],
  ['1405-01-01', '2026-03-21'],
]

for (const [build, calendar] of [
  ['ESM', esm],
  ['CommonJS', cjs],
]) {
  test(`${build}: known date pairs in both directions`, () => {
    for (const [shamsi, gregorian] of dates) {
      assert.equal(calendar.shamsiToGregorian(shamsi), gregorian, shamsi)
      assert.equal(calendar.gregorianToShamsi(gregorian), shamsi, gregorian)
    }
  })

  test(`${build}: known leap years and month lengths`, () => {
    for (const year of [1391, 1395, 1399, 1403, 1408]) {
      assert.equal(calendar.isShamsiLeapYear(year), true, String(year))
      assert.equal(calendar.shamsiMonthLength(year, 12), 30)
    }
    for (const year of [1394, 1396, 1400, 1404, 1407]) {
      assert.equal(calendar.isShamsiLeapYear(year), false, String(year))
      assert.equal(calendar.shamsiMonthLength(year, 12), 29)
    }
    for (let month = 1; month <= 11; month++)
      assert.equal(calendar.shamsiMonthLength(1404, month), month <= 6 ? 31 : 30)
  })

  test(`${build}: Kabul midnight and exclusive day boundaries`, () => {
    const start = calendar.shamsiToUtc('1404-01-01')
    assert.equal(start.toISOString(), '2025-03-20T19:30:00.000Z')
    assert.equal(calendar.utcToShamsi(start), '1404-01-01')
    assert.equal(calendar.utcToShamsi(new Date(start.getTime() - 1)), '1403-12-30')
    assert.equal(calendar.utcToShamsi(new Date('2025-03-21T00:00:00+04:30')), '1404-01-01')
    const bounds = calendar.shamsiDayBounds('1404-06-31')
    assert.equal(bounds.start.toISOString(), '2025-09-21T19:30:00.000Z')
    assert.equal(bounds.endExclusive.toISOString(), '2025-09-22T19:30:00.000Z')
    assert.equal(calendar.utcToShamsi(new Date(bounds.endExclusive.getTime() - 1)), '1404-06-31')
    assert.equal(calendar.utcToShamsi(bounds.endExclusive), '1404-07-01')
  })

  test(`${build}: reject invalid or unsupported dates instead of normalizing them`, () => {
    for (const value of [
      '1404-12-30',
      '1404-07-31',
      '1404-00-01',
      '1404-13-01',
      '1404-01-00',
      '1404-01-32',
      '1404-1-1',
      '1404-01-01T00:00:00Z',
      '',
      '1349-12-29',
      '1500-01-01',
      'NaN',
      null,
      undefined,
      14040101,
    ])
      assert.throws(() => calendar.shamsiToGregorian(value), RangeError, String(value))
    for (const value of [
      '2025-02-29',
      '2024-02-30',
      '2025-04-31',
      '2025-13-01',
      '2025-00-01',
      '2025-01-00',
      '2025-3-21',
      '2025-03-21Z',
      '1900-01-01',
      '2200-01-01',
    ])
      assert.throws(() => calendar.gregorianToShamsi(value), RangeError, value)
    assert.equal(calendar.shamsiToGregorian(calendar.gregorianToShamsi('2024-02-29')), '2024-02-29')
    for (const year of [NaN, Infinity, 1404.5, 1349, 1500])
      assert.throws(() => calendar.isShamsiLeapYear(year), RangeError)
    for (const month of [NaN, 0, 13, 1.5])
      assert.throws(() => calendar.shamsiMonthLength(1404, month), RangeError)
    for (const instant of [new Date(NaN), new Date(0), '2025-03-21', null])
      assert.throws(() => calendar.utcToShamsi(instant), RangeError)
  })

  test(`${build}: Afghan month names`, () => {
    assert.equal(calendar.formatShamsiDate('1404-01-01'), '1 Hamal 1404')
    assert.equal(calendar.formatShamsiDate('1404-07-05'), '5 Mizan 1404')
    assert.equal(calendar.formatShamsiDate('1404-12-29', 'prs'), '29 حوت 1404')
    assert.equal(calendar.formatShamsiDate('1404-01-01', 'ps'), '1 وری 1404')
  })
}

test('every supported day agrees with independent ICU Persian calendar and round-trips', () => {
  const persian = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  assert.equal(persian.resolvedOptions().calendar, 'persian')
  const start = esm.shamsiToUtc(`${esm.SHAMSI_MIN_YEAR}-01-01`).getTime()
  const final = esm
    .shamsiDayBounds(`${esm.SHAMSI_MAX_YEAR}-12-${esm.shamsiMonthLength(esm.SHAMSI_MAX_YEAR, 12)}`)
    .endExclusive.getTime()
  for (let time = start; time < final; time += DAY) {
    const instant = new Date(time)
    const parts = Object.fromEntries(persian.formatToParts(instant).map((p) => [p.type, p.value]))
    const expected = `${parts.year}-${parts.month}-${parts.day}`
    const actual = esm.utcToShamsi(instant)
    assert.equal(actual, expected, instant.toISOString())
    assert.equal(esm.shamsiToUtc(actual).getTime(), time, actual)
    assert.equal(esm.gregorianToShamsi(esm.shamsiToGregorian(actual)), actual)
  }
  assert.throws(() => esm.utcToShamsi(new Date(start - 1)), RangeError)
  assert.throws(() => esm.utcToShamsi(new Date(final)), RangeError)
})

test('calendar dependency stays behind the shared wrapper', () => {
  const roots = ['../src/', '../../../apps/api/src/', '../../../apps/web/src/']
  for (const root of roots) {
    const base = new URL(root, import.meta.url)
    for (const file of readdirSync(base, { recursive: true })) {
      if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue
      if (root === '../src/' && file === 'shamsi.ts') continue
      const source = readFileSync(new URL(file.replaceAll('\\', '/'), base), 'utf8')
      assert.doesNotMatch(
        source,
        /(?:from\s*|require\s*\(|import\s*\()\s*['"]jalaali-js(?:\/[^'"]*)?['"]/,
        file,
      )
    }
  }
})

test('UTC boundaries are independent of the server timezone', () => {
  const modulePath = require.resolve('../dist/cjs/shamsi.js')
  const script = `const c = require(${JSON.stringify(modulePath)});
    process.stdout.write(c.shamsiToUtc('1404-01-01').toISOString() + '|' +
      c.utcToShamsi(new Date('2025-03-20T19:29:59.999Z')));`
  for (const TZ of ['UTC', 'Asia/Kabul', 'America/New_York']) {
    const output = execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, TZ },
      encoding: 'utf8',
    })
    assert.equal(output, '2025-03-20T19:30:00.000Z|1403-12-30', TZ)
  }
})
