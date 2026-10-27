import test from 'node:test'
import assert from 'node:assert/strict'
import {straightLineAmount, moneyDecimal} from '../dist/esm/index.js'
test('depreciation absorbs rounding in the final installment',()=>{
 assert.deepEqual([0,1,2].map(i=>straightLineAmount('100','0',3,i)),['33.33','33.33','33.34'])
 assert.deepEqual([0,1,2].map(i=>straightLineAmount('0.01','0',3,i)),['0.00','0.00','0.01'])
 assert.deepEqual([0,1,2].map(i=>straightLineAmount('0.02','0',3,i)),['0.01','0.01','0.00'])
})
test('all installments sum exactly to depreciable cost and stop at residual',()=>{
 for(const [cost,residual,life] of [['999999999999.99','100.01',1200],['12.34','1.11',7],['1','0',1]]){
  const sum=Array.from({length:life},(_,i)=>straightLineAmount(cost,residual,life,i)).reduce((s,v)=>s.plus(v),moneyDecimal('0'))
  assert.equal(sum.toFixed(2),moneyDecimal(cost).minus(residual).toFixed(2));assert.equal(straightLineAmount(cost,residual,life,life),'0.00')
 }
})

