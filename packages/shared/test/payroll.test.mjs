import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculatePayroll, AFGHAN_MONTHLY_TAX, payrollConfigInputSchema } from '../dist/esm/index.js'
const calc = (basic, extra={}) => calculatePayroll({basic,allowance:'0',overtimeRate:'0',periodDays:30,eligibleDays:30,absenceDays:'0',overtimeHours:'0',bonus:'0',otherDeduction:'0',loanDeduction:'0',taxBands:AFGHAN_MONTHLY_TAX,...extra})
test('Afghan monthly withholding thresholds and official 20,000 example',()=>{
  for(const [gross,tax] of [['5000','0.00'],['5001','0.02'],['12500','150.00'],['20000','900.00'],['100000','8900.00'],['100001','8900.20'],['150000','18900.00']]) assert.equal(calc(gross).tax,tax)
})
test('earnings, absence, loans, other deductions and taxable allowances',()=>{
  const r=calc('30000',{allowance:'3000',absenceDays:'2',overtimeRate:'100',overtimeHours:'5.5',bonus:'1000',loanDeduction:'2000',otherDeduction:'50'})
  assert.equal(r.gross,'32550.00');assert.equal(r.tax,'2155.00');assert.equal(r.net,'28345.00')
})
test('Shamsi month lengths and partial employment use decimal half-up proration',()=>{
  assert.equal(calc('10000',{periodDays:31,eligibleDays:1}).basic,'322.58')
  assert.equal(calc('10000',{periodDays:29,absenceDays:'1'}).absence,'344.83')
  assert.equal(calc('10000',{periodDays:30,eligibleDays:15,allowance:'1000'}).gross,'5500.00')
})
test('negative net and excessive absence are rejected',()=>{
  assert.throws(()=>calc('1000',{loanDeduction:'1001'}),/exceed/)
  assert.throws(()=>calc('1000',{absenceDays:'31'}),/Absence/)
})
test('tax configuration requires increasing thresholds and rates within 100%',()=>{
  const key='fa127ba2-f7c3-48b4-a3b2-09accc42600f'
  assert.equal(payrollConfigInputSchema.safeParse({taxName:'x',taxBands:AFGHAN_MONTHLY_TAX,idempotencyKey:key}).success,true)
  assert.equal(payrollConfigInputSchema.safeParse({taxName:'x',taxBands:[{from:'0',rate:'0'},{from:'0',rate:'20'}],idempotencyKey:key}).success,false)
})
