import type { Library, Note } from './model';

export type TreeNote={note:Note;children:TreeNote[];matches:boolean};
export type TreeDragSource={kind:'notes';ids:string[]}|{kind:'folder';id:string};
export type TreeDrop={key:string;position:'before'|'inside'|'after'};
export function ancestors(notes:Note[],id:string):Note[]{
 const byID=new Map(notes.map(n=>[n.id,n])),result:Note[]=[],seen=new Set([id]);let parent=byID.get(id)?.parentId;
 while(parent&&!seen.has(parent)){seen.add(parent);const note=byID.get(parent);if(!note)break;result.unshift(note);parent=note.parentId;}
 return result;
}
export function descendants(notes:Note[],ids:string[]):Set<string>{
 const result=new Set(ids);let changed=true;
 while(changed){changed=false;for(const note of notes)if(note.parentId&&result.has(note.parentId)&&!result.has(note.id)){result.add(note.id);changed=true;}}
 return result;
}
export function noteTree(notes:Note[],matches?:Set<string>):TreeNote[]{
 const visible=new Set(matches?[...matches].flatMap(id=>[id,...ancestors(notes,id).map(n=>n.id)]):notes.map(n=>n.id));
 const nodes=new Map(notes.filter(n=>visible.has(n.id)).map(note=>[note.id,{note,children:[],matches:!matches||matches.has(note.id)} as TreeNote]));
 const roots:TreeNote[]=[];
 for(const node of nodes.values()){const parent=node.note.parentId?nodes.get(node.note.parentId):undefined;if(parent&&parent.note.folderId===node.note.folderId)parent.children.push(node);else roots.push(node);}
 return roots;
}
// Organization is local metadata: moving a branch must never dirty published content.
export function moveBranch(library:Library,ids:string[],target:string):Library{
 const parent=target.startsWith('note:')?library.notes.find(n=>n.id===target.slice(5)&&!n.trashedAt&&!n.archived):undefined;
 const folderId=parent?.folderId||(target.startsWith('folder:')?target.slice(7):'');
 if(target.startsWith('note:')&&!parent)throw new Error('目标文稿不存在或已归档。');
 if(folderId&&!library.folders?.some(f=>f.id===folderId))throw new Error('文件夹不存在。');
 const branch=descendants(library.notes,ids);
 if(parent&&branch.has(parent.id))throw new Error('不能把文稿移入自己或自己的子文稿。');
 const roots=new Set(ids.filter(id=>!ancestors(library.notes,id).some(n=>ids.includes(n.id))));
 return {...library,notes:library.notes.map(n=>branch.has(n.id)?{...n,folderId:folderId||undefined,...(roots.has(n.id)?{parentId:parent?.id}:{})}:n)};
}

export function treeDropError(library:Library,source:TreeDragSource,target:TreeDrop):string{
 if(source.kind==='folder'){
  if(!target.key.startsWith('folder:')||target.position==='inside')return '文件夹只能在文件夹之间调整顺序';
  if(target.key==='folder:'+source.id)return '保持原位置';
  return library.folders?.some(f=>'folder:'+f.id===target.key)?'':'目标文件夹已不存在';
 }
 if(target.key==='root')return '';
 if(target.key.startsWith('folder:'))return library.folders?.some(f=>'folder:'+f.id===target.key)?'':'目标文件夹已不存在';
 const note=library.notes.find(n=>'note:'+n.id===target.key&&!n.trashedAt);
 if(!note)return '目标文稿已不存在';
 if(descendants(library.notes,source.ids).has(note.id))return '不能移到自己或自己的子文稿';
 if(target.position==='inside'&&note.archived)return '不能移入已归档文稿';
 return '';
}

export function dropTreeItem(library:Library,source:TreeDragSource,target:TreeDrop):Library{
 const error=treeDropError(library,source,target);if(error)throw new Error(error);
 if(source.kind==='folder'){
  const folder=library.folders?.find(f=>f.id===source.id);if(!folder)throw new Error('文件夹已不存在');
  const folders=library.folders!.filter(f=>f.id!==source.id),index=folders.findIndex(f=>'folder:'+f.id===target.key);
  folders.splice(index+(target.position==='after'?1:0),0,folder);return {...library,folders};
 }
 if(target.position==='inside'||!target.key.startsWith('note:'))return moveBranch(library,source.ids,target.key);
 const sibling=library.notes.find(n=>'note:'+n.id===target.key)!;
 const parent=library.notes.find(n=>n.id===sibling.parentId&&!n.trashedAt&&!n.archived);
 const moved=moveBranch(library,source.ids,parent?'note:'+parent.id:sibling.folderId?'folder:'+sibling.folderId:'root');
 const branch=descendants(library.notes,source.ids),moving=moved.notes.filter(n=>branch.has(n.id)),notes=moved.notes.filter(n=>!branch.has(n.id));
 const index=notes.findIndex(n=>n.id===sibling.id);notes.splice(index+(target.position==='after'?1:0),0,...moving);
 return {...moved,notes};
}
