import test from 'node:test';
import assert from 'node:assert/strict';
import { ancestors, descendants, dropTreeItem, moveBranch, noteTree } from '../web/tree';
import { deleteTrashedNotes, dirty, newNote, noteKey, restoreTrashedNote, trashNotes, type Library, type Note } from '../web/model';
function note(id:string,parentId?:string,folderId?:string):Note{const n={...newNote(),id,parentId,folderId};return {...n,syncedKey:noteKey(n)};}
const fixture=():Library=>({schema:1,folders:[{id:'f',name:'随笔'}],notes:[note('root'),note('child','root'),note('grandchild','child'),note('other')]});
test('search reveals matching descendants with the complete parent path',()=>{
 const library=fixture(),tree=noteTree(library.notes,new Set(['grandchild']));
 assert.deepEqual(tree.map(n=>n.note.id),['root']);assert.equal(tree[0].matches,false);
 assert.equal(tree[0].children[0].children[0].note.id,'grandchild');assert.equal(tree[0].children[0].children[0].matches,true);
 assert.deepEqual(ancestors(library.notes,'grandchild').map(n=>n.id),['root','child']);
});
test('moving a branch preserves content, sync baselines and the descendants parent links',()=>{
 const original=fixture(),moved=moveBranch(original,['child'],'folder:f');
 assert.equal(moved.notes[1].parentId,undefined);assert.equal(moved.notes[2].parentId,'child');
 for(const n of moved.notes){assert.deepEqual(n.document,original.notes.find(old=>old.id===n.id)!.document);assert.equal(dirty(n),false);}
 assert.equal(moved.notes[1].folderId,'f');assert.equal(moved.notes[2].folderId,'f');assert.equal(moved.notes[0].folderId,undefined);
 const nested=moveBranch(moved,['child'],'note:other');assert.equal(nested.notes[1].parentId,'other');assert.equal(nested.notes[2].folderId,undefined);
});
test('cycles and invalid move destinations are refused without changing the library',()=>{
 const library=fixture(),before=JSON.stringify(library);
 for(const target of ['note:root','note:child','note:grandchild','note:missing','folder:missing'])assert.throws(()=>moveBranch(library,['root'],target));
 assert.equal(JSON.stringify(library),before);
});
test('selecting a parent and child moves the branch once, preserving inner hierarchy',()=>{
 const moved=moveBranch(fixture(),['root','child'],'note:other');
 assert.equal(moved.notes[0].parentId,'other');assert.equal(moved.notes[1].parentId,'root');assert.equal(moved.notes[2].parentId,'child');
 assert.deepEqual([...descendants(moved.notes,['child'])],['child','grandchild']);
});
test('deleting only a parent leaves children visible and restore reconnects them',()=>{
 const library=fixture(),trashed=trashNotes(library,['root'],new Date().toISOString());
 assert.equal(noteTree(trashed.notes.filter(n=>!n.trashedAt))[0].note.id,'child');
 assert.deepEqual(restoreTrashedNote(trashed,'root'),library);
 const removed=deleteTrashedNotes(trashed,['root']);assert.equal(removed.notes[0].id,'child');assert.equal(removed.notes[0].parentId,undefined);assert.equal(removed.notes[1].parentId,'child');
});
test('old flat libraries and archived parents do not hide visible documents',()=>{
 assert.equal(noteTree([note('a'),note('b')]).length,2);
 const library=fixture();library.notes[0].archived=true;
 assert.equal(noteTree(library.notes.filter(n=>!n.archived))[0].note.id,'child');
});

test('dropping between rows reorders siblings without changing text or sync state',()=>{
 const library=fixture(),before=JSON.stringify(library);
 const moved=dropTreeItem(library,{kind:'notes',ids:['other']},{key:'note:child',position:'before'});
 assert.deepEqual(noteTree(moved.notes)[0].children.map(n=>n.note.id),['other','child']);
 assert.equal(moved.notes.find(n=>n.id==='other')!.parentId,'root');
 for(const note of moved.notes)assert.equal(dirty(note),false);
 assert.equal(JSON.stringify(library),before);
});
test('moving a parent and its descendants after another root preserves the branch',()=>{
 const moved=dropTreeItem(fixture(),{kind:'notes',ids:['root']},{key:'note:other',position:'after'});
 assert.deepEqual(noteTree(moved.notes).map(n=>n.note.id),['other','root']);
 assert.equal(moved.notes.find(n=>n.id==='grandchild')!.parentId,'child');
});
test('folder drag reorders folders while preserving every document and membership',()=>{
 const library=fixture();library.folders!.push({id:'second',name:'工作'});
 const moved=dropTreeItem(library,{kind:'folder',id:'second'},{key:'folder:f',position:'before'});
 assert.deepEqual(moved.folders!.map(f=>f.id),['second','f']);assert.equal(moved.notes,library.notes);
 assert.throws(()=>dropTreeItem(library,{kind:'folder',id:'second'},{key:'note:root',position:'inside'}));
});
test('dragging into a descendant or a missing target cannot mutate the library',()=>{
 const library=fixture(),before=JSON.stringify(library);
 for(const key of ['note:grandchild','note:missing'])assert.throws(()=>dropTreeItem(library,{kind:'notes',ids:['root']},{key,position:'inside'}));
 assert.equal(JSON.stringify(library),before);
});
