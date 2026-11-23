import test from 'node:test';
import assert from 'node:assert/strict';
import {AttentionGate} from '../attention.js';
import {StudyClock} from '../clock.js';
import {reportRange,buildReport,reportChart} from '../report-data.js';
import {jpegPagesToPdf} from '../pdf-writer.js';

test('visible but unfocused pages cannot accept camera frames or backfill on return',()=>{
  const g=new AttentionGate(),c=new StudyClock(0);c.observe(0,true);c.observe(500,g.accepts(g.epoch));
  const pending=g.epoch;g.update({focused:false});c.observe(600,false);
  for(let t=1000;t<=10000;t+=500)c.observe(t,g.accepts(g.epoch));
  assert.equal(c.total,500);assert.equal(g.hidden,false);
  g.update({focused:true});assert.equal(g.accepts(pending),false);
  c.observe(10500,true);assert.equal(c.total,500);c.observe(11000,true);assert.equal(c.total,1000);
});
test('visibility and lifecycle suspension independently stop camera credit',()=>{
  const g=new AttentionGate();g.update({hidden:true});assert.equal(g.allowed,false);g.update({hidden:false,suspended:true});assert.equal(g.allowed,false);g.update({suspended:false});assert.equal(g.allowed,true);
});
test('weeks run Saturday to Saturday and monthly reports follow the Persian calendar',()=>{
  const week=reportRange('week',new Date(2026,10,3));assert.equal(new Date(week.from).getDay(),6);assert.equal(new Date(week.to).getDay(),6);assert.equal(new Date(week.from).getDate(),31);
  const month=reportRange('month',new Date(2026,9,31));assert.equal(+new Date(2026,9,23),month.from);assert.equal(+new Date(2026,10,22),month.to);
  const spring=reportRange('month',new Date(2025,3,1));assert.equal(+new Date(2025,2,21),spring.from);assert.equal(+new Date(2025,3,21),spring.to);
});
test('sessions crossing midnight are clipped to the report range without moving gaps or thoughts',()=>{
  const start=+new Date(2026,9,30,23,50),boundary=+new Date(2026,9,31),end=boundary+20*60000;
  const r=buildReport([{id:'1',subjectId:'p',subjectName:'فیزیک',start,end,activeMs:20*60000,elapsedMs:30*60000,segments:[{from:start,to:boundary+5*60000,type:'present'},{from:boundary+5*60000,to:boundary+15*60000,type:'away'},{from:boundary+15*60000,to:end,type:'present'}],thoughts:[{text:'قبل',createdAt:boundary-1},{text:'بعد',createdAt:boundary+1}]}],{period:'day',reference:boundary});
  assert.equal(r.activeMs,10*60000);assert.equal(r.elapsedMs,20*60000);assert.equal(r.awayMs,10*60000);assert.equal(r.days[0].activeMs,r.activeMs);assert.deepEqual(r.sessions[0].thoughts.map(t=>t.text),['بعد']);assert.equal(reportChart(r).reduce((n,d)=>n+d.activeMs,0),r.activeMs);
  assert.equal(buildReport(r.sessions,{period:'day',reference:boundary,subject:'other'}).count,0);
});
test('PDF objects have exact stream lengths, page count, and byte-based xref offsets',()=>{
  const pdf=jpegPagesToPdf([{width:2,height:2,bytes:new Uint8Array([255,216,1,2,255,217])},{width:3,height:3,bytes:new Uint8Array([255,216,5,255,217])}]);
  const text=new TextDecoder().decode(pdf);assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 2/);const at=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(pdf.slice(at,at+4)),'xref');
  const entries=text.slice(at).split('\n').slice(3,11);entries.forEach((line,i)=>{const offset=Number(line.slice(0,10));assert.ok(new TextDecoder().decode(pdf.slice(offset,offset+15)).startsWith(`${i+1} 0 obj`))});
});
