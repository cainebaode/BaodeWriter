import test from 'node:test';
import assert from 'node:assert/strict';
import { closeDocument, emptyWorkspace, endSplit, openDocument, restoreWorkspace, splitDocument } from '../web/workspace';

test('opening documents keeps ordered unique tabs and one active paper',()=>{
 let state=openDocument(emptyWorkspace(),'a');state=openDocument(state,'b');state=openDocument(state,'a');
 assert.deepEqual(state,{tabs:['a','b'],panes:['a'],active:'a'});
 assert.equal(openDocument(state,'a'),state);
});
test('comparison contains two different documents and keeps the current paper on the left',()=>{
 let state=openDocument(openDocument(emptyWorkspace(),'a'),'b');state=splitDocument(state,'a');
 assert.deepEqual(state,{tabs:['a','b'],panes:['b','a'],active:'b'});
 assert.equal(splitDocument(state,'b'),state);assert.equal(splitDocument(state,'missing'),state);
});
test('focusing either visible document leaves both positions intact',()=>{
 const state=splitDocument(openDocument(openDocument(emptyWorkspace(),'a'),'b'),'a');
 assert.deepEqual(openDocument(state,'a'),{...state,active:'a'});
});
test('opening a third document replaces only the focused pane',()=>{
 let state=splitDocument(openDocument(openDocument(emptyWorkspace(),'a'),'b'),'a');
 state=openDocument(state,'c');assert.deepEqual(state.panes,['c','a']);
 state=openDocument(state,'a');state=openDocument(state,'b');assert.deepEqual(state.panes,['c','b']);
 assert.deepEqual(state.tabs,['a','b','c']);
});
test('closing a hidden tab keeps both papers; closing a visible one ends comparison',()=>{
 let state=splitDocument(openDocument(openDocument(openDocument(emptyWorkspace(),'a'),'b'),'c'),'a');
 state=closeDocument(state,'b');assert.deepEqual(state.panes,['c','a']);
 state=closeDocument(state,'c');assert.deepEqual(state,{tabs:['a'],panes:['a'],active:'a'});
 assert.deepEqual(closeDocument(state,'a'),emptyWorkspace());
});
test('ending comparison retains the focused document and closing it selects a nearby tab',()=>{
 let state=splitDocument(openDocument(openDocument(emptyWorkspace(),'a'),'b'),'a');
 state=endSplit(openDocument(state,'a'));assert.deepEqual(state,{tabs:['a','b'],panes:['a'],active:'a'});
 assert.deepEqual(closeDocument(state,'a'),{tabs:['b'],panes:['b'],active:'b'});
});
test('restored views reject missing IDs and duplicates and never create a third pane',()=>{
 assert.deepEqual(restoreWorkspace({tabs:['a','missing','a','b','c'],panes:['a','a','b','c'],active:'missing'},['a','b','c'],'a'),{tabs:['a','b','c'],panes:['a','b'],active:'a'});
 assert.deepEqual(restoreWorkspace(emptyWorkspace(),['a'],'a'),emptyWorkspace());
 assert.deepEqual(restoreWorkspace(null,['a'],'a'),{tabs:['a'],panes:['a'],active:'a'});
});
