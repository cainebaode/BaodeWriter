import test from 'node:test';
import assert from 'node:assert/strict';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { folderDescendants, folderEntries, saveFolder, dropTreeItem, noteTree } from '../web/tree';
import { dirty, liveNotes, newNote, noteKey, removeFolder, trashNotes, type Library, type Remote } from '../web/model';
import { canSync, importablePosts, needsSync, syncScope, syncState } from '../web/sync';
import { hierarchicalMarkdownLists, listNumbers } from '../web/lists';
const site='https://baode.life';
function fixture():Library{const notes=['root','child','deep','trash','archive'].map(id=>({...newNote(),id,folderId:id==='root'?undefined:id==='child'?'a':'b'}));notes[3].trashedAt=new Date().toISOString();notes[4].archived=true;return {schema:1,folders:[{id:'a',name:'工作'},{id:'b',name:'项目',parentId:'a'},{id:'c',name:'其他'}],notes};}
function remote(id:string,version='v1'):Remote{return {id,version,revision:1,publishedRevision:1,status:'PUBLISHED',publishedAt:'2026-10-30T12:00:00.000Z',updatedAt:'2026-10-30T12:00:00.000Z',createdAt:'2026-10-30T12:00:00.000Z',publicSlug:id,document:newNote().document};}

test('nested folders preserve order, paths and original flat libraries',()=>{
 const library=fixture(),updated=saveFolder(library,{id:'d',name:'细节',parentId:'b'});
 assert.deepEqual(folderEntries(updated.folders!).map(f=>[f.folder.id,f.depth,f.path]),[['a',0,'工作'],['b',1,'工作 / 项目'],['d',2,'工作 / 项目 / 细节'],['c',0,'其他']]);
 assert.deepEqual([...folderDescendants(updated.folders!,'a')],['a','b','d']);assert.equal(updated.notes,library.notes);
 assert.deepEqual(folderEntries([{id:'old',name:'旧文件夹'}]).map(f=>f.depth),[0]);
});
test('folders refuse cycles, missing parents and sibling duplicate names without mutation',()=>{
 const library=fixture(),before=structuredClone(library);
 for(const folder of [{id:'a',name:'工作',parentId:'b'},{id:'b',name:'项目',parentId:'b'},{id:'new',name:'工作'},{id:'new',name:'新建',parentId:'missing'}])assert.throws(()=>saveFolder(library,folder));
 assert.equal(saveFolder(library,{id:'new',name:'工作',parentId:'b'}).folders!.length,4);assert.deepEqual(library,before);
});
test('folder moves carry their subtree and notes without changing publication fingerprints',()=>{
 const library=fixture();for(const n of library.notes)n.syncedKey=noteKey(n);
 const moved=dropTreeItem(library,{kind:'folder',id:'a'},{key:'folder:c',position:'inside'});
 assert.equal(moved.folders!.find(f=>f.id==='a')!.parentId,'c');assert.equal(moved.folders!.find(f=>f.id==='b')!.parentId,'a');assert.equal(moved.notes,library.notes);assert.ok(moved.notes.every(n=>!dirty(n)));
 assert.throws(()=>dropTreeItem(library,{kind:'folder',id:'a'},{key:'folder:b',position:'inside'}));
 const root=dropTreeItem(moved,{kind:'folder',id:'a'},{key:'root',position:'inside'});assert.equal(root.folders!.find(f=>f.id==='a')!.parentId,undefined);
});
test('removing a folder preserves its child folders and reparents only its own notes',()=>{
 const library=saveFolder(fixture(),{id:'d',name:'下一级',parentId:'b'}),next=removeFolder(library,'b');
 assert.equal(next.folders!.find(f=>f.id==='d')!.parentId,'a');assert.equal(next.notes.find(n=>n.id==='deep')!.folderId,'a');assert.equal(next.notes.find(n=>n.id==='child'),library.notes.find(n=>n.id==='child'));
 assert.equal(removeFolder(next,'a').folders!.find(f=>f.id==='d')!.parentId,undefined);
});
test('trash is absent from normal trees, search context, folder sync and website import',()=>{
 const library=fixture(),trashed=trashNotes(library,['child'],new Date().toISOString());trashed.notes.find(n=>n.id==='deep')!.parentId='child';
 assert.ok(!liveNotes(trashed.notes).some(n=>n.trashedAt));assert.deepEqual(noteTree(trashed.notes,new Set(['child'])),[]);
 assert.equal(noteTree(trashed.notes,new Set(['deep']))[0].note.id,'deep');
 assert.deepEqual(syncScope(trashed,'folder:a').map(n=>n.id),['deep','archive']);assert.deepEqual(syncScope(trashed,'root').map(n=>n.id),['root']);
 assert.deepEqual(importablePosts(trashed,[remote('child'),remote('trash'),remote('new')]).map(r=>r.id),['new']);
});
test('sync states distinguish pending, website changes, deletion, conflicts and other sites',()=>{
 const note=newNote();assert.equal(syncState(note,site),'local');assert.equal(needsSync(note,site),true);
 note.base=remote(note.id);note.siteURL=site;note.syncedKey=noteKey(note);assert.equal(syncState(note,site,[note.base]),'synced');assert.equal(needsSync(note,site,[note.base]),false);
 const changed=remote(note.id,'v2');assert.equal(syncState(note,site,[changed]),'remote');assert.equal(canSync(note,site,[changed]),false);assert.equal(syncState(note,site,[]),'remote');
 note.document.title='本机修改';assert.equal(syncState(note,site),'pending');assert.equal(syncState(note,site,[changed]),'conflict');assert.equal(canSync(note,site,[changed]),false);
 note.error='离线';assert.equal(syncState(note,site),'error');assert.equal(needsSync(note,site),true);
 assert.equal(syncState(note,'https://another.example'),'other-site');assert.equal(canSync(note,'https://another.example'),false);
 note.archived=true;assert.equal(canSync(note,site),false);note.archived=false;note.trashedAt=new Date().toISOString();assert.equal(canSync(note,site),false);
});
test('five-level numbering tracks parent paths, sibling increments, restarts and custom starts',()=>{
 const item=(id:string,children:any[]=[],start?:number)=>({id,type:'numberedListItem',props:{start},children});
 const blocks=[item('a',[item('b',[item('c',[item('d',[item('e'),item('f')])])]),item('sibling')]),item('next'),{id:'p',type:'paragraph'},item('restart',[],4),item('five')];const before=JSON.stringify(blocks);
 assert.deepEqual(Object.fromEntries(listNumbers(blocks)),{a:'1',b:'1.1',c:'1.1.1',d:'1.1.1.1',e:'1.1.1.1.1',f:'1.1.1.1.2',sibling:'1.2',next:'2',restart:'4',five:'5'});assert.equal(JSON.stringify(blocks),before);
 assert.equal(listNumbers([blocks[1],blocks[0]]).get('b'),'2.1');
});
test('Markdown preview labels preserve source and follow nested ordered lists',()=>{
 const source='3. 第一项\n   1. 子项\n      1. 孙项\n   2. 第二子项\n4. 下一项\n\n段落\n\n1. 重新开始';const tree=fromMarkdown(source);
 hierarchicalMarkdownLists()(tree);const labels:string[]=[];const walk=(node:any)=>{if(node.data?.hProperties?.['data-list-number'])labels.push(node.data.hProperties['data-list-number']);node.children?.forEach(walk);};walk(tree);
 assert.deepEqual(labels,['3','3.1','3.1.1','3.2','4','1']);assert.equal(source.includes('3. 第一项'),true);
});

test('editor decorations recompute numbering after a structural transaction without changing stored attributes',async()=>{
 const {Schema}=await import('@tiptap/pm/model');const {EditorState}=await import('@tiptap/pm/state');const {ListNumbering}=await import('../web/ListNumbering');
 const schema=new Schema({nodes:{doc:{content:'blockGroup'},blockGroup:{content:'blockContainer+'},blockContainer:{attrs:{id:{default:''}},content:'(numberedListItem|paragraph) blockGroup?'},numberedListItem:{attrs:{start:{default:null}},content:'text*'},paragraph:{content:'text*'},text:{}}});
 const item=(id:string,children:any[]=[])=>schema.node('blockContainer',{id},[schema.node('numberedListItem',null,schema.text(id)),...(children.length?[schema.node('blockGroup',null,children)]:[])]);
 const extension=new ListNumbering(),plugin=extension.plugins[0];let state=EditorState.create({schema,doc:schema.node('doc',null,schema.node('blockGroup',null,[item('a',[item('b')]),item('c')])),plugins:extension.plugins});
 const labels=()=>{const decorations=plugin.props.decorations!.call(plugin,state) as any;return decorations.find().map((d:any)=>d.type.attrs['data-list-number']);};
 assert.deepEqual(labels(),['1','1.1','2']);state=state.apply(state.tr.insert(1,item('new')));assert.deepEqual(labels(),['1','2','2.1','3']);assert.ok(!JSON.stringify(state.doc.toJSON()).includes('data-list-number'));
});
