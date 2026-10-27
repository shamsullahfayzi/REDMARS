import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { fiscalYearCalendar, shamsiMonthLength, utcToShamsi, moneyDecimal, roundMoney, formatMoney, parseMoneyInput, financeJournalLineInputSchema } = require('../dist/cjs/index.js')

test('the public ESM package exports the same fiscal calendar and exact money helpers', async () => {
  const esm = await import('../dist/esm/index.js')
  assert.equal(esm.fiscalYearCalendar(1404).periods[6].label, '1404-07')
  assert.equal(esm.moneyDecimal('0.1').add('0.2').toFixed(2), '0.30')
  assert.equal(esm.formatMoney('9999999999999999.99'), '9,999,999,999,999,999.99')
})

test('1404 has twelve contiguous half-open Kabul months with exact Mizan boundaries', () => {
  const year = fiscalYearCalendar(1404)
  assert.equal(year.periods.length, 12)
  assert.equal(year.startsOn.toISOString(), '2025-03-20T19:30:00.000Z')
  assert.equal(year.endsOn.toISOString(), '2026-03-20T19:30:00.000Z')
  const mizan = year.periods[6]
  assert.equal(mizan.label, '1404-07')
  assert.equal(mizan.startsOn.toISOString(), '2025-09-22T19:30:00.000Z')
  assert.equal(mizan.endsOn.toISOString(), '2025-10-22T19:30:00.000Z')
  for (const p of year.periods) {
    assert.equal((p.endsOn-p.startsOn)/86400000, shamsiMonthLength(1404,p.month))
    assert.equal(utcToShamsi(p.startsOn), `${p.label}-01`)
    if (p.month<12) assert.equal(+p.endsOn,+year.periods[p.month].startsOn)
  }
})

test('all supported fiscal years have complete month partitions, including both leap boundaries', () => {
  for(let year=1350;year<=1499;year++) {
    const calendar=fiscalYearCalendar(year)
    assert.equal(calendar.periods.reduce((sum,p)=>sum+(p.endsOn-p.startsOn)/86400000,0),(calendar.endsOn-calendar.startsOn)/86400000)
    assert.equal(calendar.periods[11].label,`${year}-12`)
  }
  assert.equal((fiscalYearCalendar(1403).endsOn-fiscalYearCalendar(1403).startsOn)/86400000,366)
  assert.throws(()=>fiscalYearCalendar(1500))
})

test('decimal arithmetic preserves cents beyond the safe JS integer range', () => {
  assert.equal(moneyDecimal('0.1').add('0.2').toFixed(2),'0.30')
  assert.equal(moneyDecimal('9999999999999999.99').sub('9999999999999999.98').toFixed(2),'0.01')
  assert.equal(formatMoney('9999999999999999.99'),'9,999,999,999,999,999.99')
  assert.equal(moneyDecimal('100.01').sub('33.33').sub('33.33').toFixed(2),'33.35')
  assert.equal(moneyDecimal('0.30').sub('0.10').eq('0.20'),true)
  assert.equal(moneyDecimal('0.30').sub('0.10').eq('0.204'),false)
})

test('calculated money rounds half away from zero; entered money never silently rounds', () => {
  assert.equal(roundMoney('1.005'),'1.01')
  assert.equal(roundMoney('-1.005'),'-1.01')
  assert.equal(roundMoney('1.0049'),'1.00')
  assert.equal(parseMoneyInput('1.005'),null)
  assert.equal(parseMoneyInput('1e3'),null)
  assert.equal(parseMoneyInput(''),null)
  assert.equal(parseMoneyInput(' 1.20 ').toFixed(2),'1.20')
  for (const value of [0.1, NaN, Infinity, 'NaN','Infinity','-Infinity']) assert.throws(()=>moneyDecimal(value))
  assert.equal(financeJournalLineInputSchema.safeParse({accountId:'89143033-edb6-4375-b011-55546985b0f7',debit:'1.005',credit:'0'}).success,false)
})
