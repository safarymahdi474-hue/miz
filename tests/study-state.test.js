import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStudyState,readStudyState,formatStudyDate} from '../study-state.js';
test('new users and saved empty lists have no generated subjects',()=>{
  assert.deepEqual(emptyStudyState().subjects,[]);
  assert.deepEqual(readStudyState(null).state.subjects,[]);
  const saved={subjects:[],sessions:[],goal:60,schemaVersion:2};
  assert.deepEqual(readStudyState(saved).state,saved);
});
test('migration removes legacy defaults while preserving custom subjects and every session',()=>{
  const custom={id:'custom-physics',name:'فیزیک',color:'#abc'},session={id:'past',subjectId:'physics',subjectName:'فیزیک',activeMs:12000};
  const old={subjects:[{id:'physics',name:'فیزیک'},{id:'math',name:'ریاضی'},{id:'chemistry',name:'شیمی'},custom],sessions:[session],goal:90};
  const result=readStudyState(old);
  assert.equal(result.migrated,true);assert.deepEqual(result.state.subjects,[custom]);assert.deepEqual(result.state.sessions,[session]);assert.equal(result.state.goal,90);
  assert.equal(old.subjects.length,4);assert.equal(readStudyState(result.state).migrated,false);
});
test('an empty legacy list stays empty, and explicit subjects in the current schema are retained',()=>{
  assert.deepEqual(readStudyState({subjects:[],sessions:[]}).state.subjects,[]);
  const saved={subjects:[{id:'physics',name:'فیزیک'}],sessions:[],schemaVersion:2};
  assert.deepEqual(readStudyState(saved).state.subjects,saved.subjects);
});

test('incomplete legacy dates cannot crash the workspace while records stay available',()=>{for(const value of [undefined,null,NaN,Infinity,'bad-date',''])assert.equal(formatStudyDate(value,{hour:'2-digit'}),'—');assert.notEqual(formatStudyDate(1794919000000,{hour:'2-digit'}),'—')});
