import test from 'node:test';
import assert from 'node:assert/strict';
import {roomView,memberCardsHTML,roomClock} from '../room-view.js';

test('every present member has a visible individual time; self uses the current local study clock',()=>{
 const source={members:[{userId:'other',name:'سارا',online:true,studying:true,activeMs:127000},{userId:'self',name:'رضا',isSelf:true,isOwner:true,online:true,studying:false,activeMs:0},{userId:'away',name:'غایب',online:false,studying:true,activeMs:900000}]};
 const view=roomView(source,66000);assert.equal(view.online.length,2);assert.equal(view.online[0].userId,'self');assert.equal(view.totalMs,193000);assert.equal(view.studying,1);assert.equal(view.offline.length,1);
 const html=memberCardsHTML(view.online);assert.ok(html.includes('00:01:06'));assert.ok(html.includes('00:02:07'));assert.ok(html.includes('سارا'));assert.ok(html.includes('data-own-room-time'));assert.ok(!html.includes('غایب'));assert.equal(source.members[1].activeMs,0);
});
test('focus companion cards preserve exact server values, escape names and omit administrative actions',()=>{
 const member={userId:'x',name:'<img onerror="bad">',online:true,studying:false,activeMs:5000};
 const compact=memberCardsHTML([member],{compact:true});assert.ok(compact.includes('00:00:05'));assert.ok(compact.includes('&lt;img'));assert.ok(!compact.includes('<img'));assert.ok(!compact.includes('data-group-action'));
 assert.ok(memberCardsHTML([member],{admin:true}).includes('data-group-action="kick"'));assert.equal(roomClock(360000000),'100:00:00');
});
test('leaving clears presence and the next visit is displayed from zero',()=>{
 const before=roomView({members:[{name:'سارا',online:true,activeMs:60000}]});assert.equal(before.totalMs,60000);
 const left=roomView({members:[{name:'سارا',online:false,activeMs:0}]});assert.equal(left.totalMs,0);assert.equal(left.online.length,0);
 const returned=roomView({members:[{name:'سارا',online:true,activeMs:0}]});assert.equal(returned.totalMs,0);assert.ok(memberCardsHTML(returned.online).includes('00:00:00'));
});
