import test from 'node:test';
import assert from 'node:assert/strict';
import {readAll,readByIds,checked} from '../../lib/phonesia/read-all.ts';
import {romeDate,romeDayStart,shiftDate,formatRomeTime} from '../../lib/phonesia/rome-time.ts';
import {isServizioAttivo,isServizioDaVerificare} from '../../lib/phonesia/service-state.ts';
import {signFeedbackToken,verifyFeedbackToken} from '../../lib/phonesia/feedback-token.ts';

test('only explicitly active services are represented as active',()=>{
  assert.equal(isServizioAttivo('ATTIVO'),true);
  for(const status of ['SCADUTO','SOSPESO','CESSATO','IN_ATTIVAZIONE','NON_DEFINITO',null]) assert.equal(isServizioAttivo(status),false);
  assert.equal(isServizioDaVerificare('NON_DEFINITO'),true);
  assert.equal(isServizioDaVerificare('IN_ATTIVAZIONE'),true);
  assert.equal(isServizioDaVerificare('CESSATO'),false);
});
test('feedback requires a valid, expiring signature bound to a customer',()=>{
  const secret='synthetic-test-secret-'.repeat(3), now=Date.UTC(2026,8,26);
  const token=signFeedbackToken(17,secret,now);
  const verified=verifyFeedbackToken(token,secret,now);
  assert.equal(verified.clienteId,17);assert.match(verified.hash,/^[a-f0-9]{64}$/);
  assert.equal(verifyFeedbackToken(token.replace(/^17\./,'18.'),secret,now),null);
  assert.equal(verifyFeedbackToken(token,secret+'other',now),null);
  assert.equal(verifyFeedbackToken(token,secret,now+30*86400000),null);
  for(const malformed of ['17',null,{},token+'.x','x'.repeat(9000)]) assert.equal(verifyFeedbackToken(malformed,secret,now),null);
  assert.notEqual(signFeedbackToken(17,secret,now),token);
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const alternate=token.slice(0,-1)+alphabet[alphabet.indexOf(token.at(-1))+1];
  assert.equal(verifyFeedbackToken(alternate,secret,now),null,'noncanonical signature must not bypass single-use hashing');
});

test('all pages are read beyond the API limit, including exact page multiples',async()=>{
  for(const count of [0,500,1000,1170,1576]){
    const expected=Array.from({length:count},(_,id)=>({id}));
    const ranges=[];const query={order(key){assert.equal(key,'id');return this},async range(a,b){ranges.push([a,b]);return {data:expected.slice(a,b+1),error:null}}};
    assert.deepEqual((await readAll(query)).data,expected);
    assert.equal(ranges.length,Math.floor(count/500)+1);
  }
});
test('a failed later page never returns partial statistics',async()=>{
  const query={order(){return this},async range(a){return a?{data:null,error:{message:'offline'}}:{data:Array(500).fill({id:1}),error:null}}};
  await assert.rejects(()=>readAll(query),/offline/);
  await assert.rejects(()=>checked(Promise.resolve({count:null,error:{message:'denied'}})),/denied/);
});
test('ID lookups deduplicate and split long URLs without losing results',async()=>{
  const ids=Array.from({length:721},(_,i)=>i);let calls=0;
  const {data}=await readByIds([...ids,1,2],chunk=>{assert(chunk.length<=200);calls++;return {order(){return this},async range(a,b){return {data:chunk.slice(a,b+1),error:null}}}});
  assert.deepEqual(data,ids);assert.equal(calls,4);
});
test('Rome timestamps are independent of the server timezone',()=>{
  assert.equal(formatRomeTime('2026-09-25T08:58:53Z'),'25/09/2026, 10:58');
  assert.equal(formatRomeTime('2026-09-26T10:42:23'),'26/09/2026, 12:42');
  assert.equal(romeDate('2026-09-25T22:30:00Z'),'2026-09-26');
});
test('Italian calendar-day boundaries handle both DST transitions',()=>{
  const iso=day=>romeDayStart(day).toISOString();
  assert.equal(iso('2026-03-29'),'2026-03-28T23:00:00.000Z');
  assert.equal(iso('2026-03-30'),'2026-03-29T22:00:00.000Z');
  assert.equal(iso('2026-10-25'),'2026-10-24T22:00:00.000Z');
  assert.equal(iso('2026-10-26'),'2026-10-25T23:00:00.000Z');
  assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
  assert.throws(()=>romeDayStart('2026-02-30'));
});
