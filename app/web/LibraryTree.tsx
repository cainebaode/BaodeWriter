import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import { Collapse, Presence } from './Motion';
import { dateValue, type Library, type Note } from './model';
import { useTreeDrag } from './useTreeDrag';
import { ancestors, folderDescendants, folderEntries, noteTree, type TreeDragSource, type TreeDrop, type TreeNote } from './tree';

type Props={pinControl:ReactNode;tagControl:ReactNode;library:Library;notes:Note[];matches?:Set<string>;active:string;disabled:boolean;selected:Set<string>;onSelect:(id:string)=>void;onOpen:(id:string)=>void;onCreate:(parentId?:string,folderId?:string)=>void;onFolder:(id?:string,parentId?:string)=>void;onSyncManage:(scope?:string)=>void;onRename:(id:string)=>void;onMove:(ids:string[],target?:string)=>void;onDelete:(ids:string[])=>void;onTreeDrop:(source:TreeDragSource,target:TreeDrop)=>boolean;viewControls:ReactNode;viewActive:boolean;children:ReactNode};
export function LibraryTree({pinControl,tagControl,library,notes,matches,active,disabled,selected,onSelect,onOpen,onCreate,onFolder,onSyncManage,onRename,onMove,onDelete,onTreeDrop,viewControls,viewActive,children}:Props){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>{try{return new Set(JSON.parse(localStorage.getItem('baode-writer-tree')||'[]'));}catch{return new Set();}});
 const [bulk,setBulk]=useState(false),[menuPage,setMenuPage]=useState<'main'|'view'>('main');
 const [menu,setMenu]=useState<{target:string;x:number;y:number}|null>(null);const menuRef=useRef<HTMLDivElement>(null),treeRef=useRef<HTMLDivElement>(null);
 const drag=useTreeDrag({library,viewport:treeRef,disabled,onDrop:onTreeDrop,onExpand:key=>setCollapsed(old=>{if(!old.has(key))return old;const next=new Set(old);next.delete(key);return next;})});
 const roots=noteTree(notes,matches),folders=library.folders||[];
 const activeNote=notes.find(n=>n.id===active),activeParents=new Set(ancestors(notes,active).map(n=>n.id));
 const activeFolders=new Set(folders.filter(f=>activeNote?.folderId&&folderDescendants(folders,f.id).has(activeNote.folderId)).map(f=>f.id));
 const folderPaths=new Map(folderEntries(folders).map(({folder,path})=>[folder.id,path]));
 useEffect(()=>{try{localStorage.setItem('baode-writer-tree',JSON.stringify([...collapsed]));}catch{/* View preferences do not affect document storage. */}},[collapsed]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{const selected=treeRef.current?.querySelector('.tree-row.selected');if(!drag.isDragging()&&!selected?.closest('[inert]'))selected?.scrollIntoView({block:'nearest'});});return()=>cancelAnimationFrame(frame);},[active,collapsed]);
 useEffect(()=>{const path=ancestors(library.notes,active).map(n=>'note:'+n.id);const note=library.notes.find(n=>n.id===active);if(note?.folderId){const folder=folderEntries(folders).find(f=>f.folder.id===note.folderId);if(folder)for(const entry of folderEntries(folders))if(folderDescendants(folders,entry.folder.id).has(note.folderId))path.push('folder:'+entry.folder.id);}setCollapsed(old=>{if(!path.some(id=>old.has(id)))return old;const next=new Set(old);path.forEach(id=>next.delete(id));return next;});},[active,library.notes.map(n=>`${n.id}:${n.parentId}:${n.folderId}`).join('|'),folders]);
 useEffect(()=>{if(!menu)return;const close=(e:PointerEvent|KeyboardEvent)=>{if(e instanceof KeyboardEvent){if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();}else if(menuRef.current?.contains(e.target as Node))return;setMenu(null);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[menu]);
 function toggle(id:string){setCollapsed(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});}
 function showMenu(target:string,el:HTMLElement){const r=el.getBoundingClientRect();setMenuPage('main');setMenu({target,x:target==='root'?Math.max(8,r.right-232):Math.min(r.left,window.innerWidth-190),y:Math.min(r.bottom+4,window.innerHeight-330)});}
 function rows(items:TreeNote[],depth:number):ReactNode{return items.map(({note,children:childNotes,matches:matched})=>{
  const key='note:'+note.id,title=note.document.title||'无标题文稿',open=!!matches||!collapsed.has(key),published=note.base?.status==='PUBLISHED'&&!!note.base.publishedAt,date=dateValue(note.displayDate);
  return <li key={note.id} className={`tree-node tree-note-node ${active===note.id||activeParents.has(note.id)?'active-path':''}`} style={{'--depth':depth} as CSSProperties} role="treeitem" aria-selected={active===note.id} aria-expanded={childNotes.length?open:undefined} aria-label={title}>
   <div className={`tree-row note-row ${active===note.id?'selected':''} ${drag.rowClass(key)} ${matched?'':'tree-context'}`} data-tree-target={key} onContextMenu={e=>{e.preventDefault();showMenu(key,e.currentTarget);}}>
    {childNotes.length?<button className="tree-fold" aria-label={`${open?'折叠':'展开'} ${title}`} onClick={()=>toggle(key)}><Icon name="chevron"/></button>:<span className="tree-spacer"/>}
    {(bulk||selected.size>0)&&<input type="checkbox" aria-label={`选择 ${title}`} checked={selected.has(note.id)} onChange={()=>onSelect(note.id)}/>}
    <button className="tree-title" disabled={disabled} title={title} {...drag.bind({kind:'notes',ids:selected.has(note.id)?[...selected]:[note.id]},()=>onOpen(note.id))}><Icon name="document"/><span className="tree-note-label"><strong>{title}</strong><small className="tree-note-date" title={published?'博客发布日期，按文稿设置显示；修改后同步到网站生效':'计划发布日期，当前文稿尚未发布'}>{!published&&'待发布 · '}<time dateTime={date}>{date}</time></small></span>{(note.conflict||note.error)&&<span className="tree-warning" title="同步需要处理">•</span>}</button>
    <div className="tree-actions"><button disabled={disabled||!!note.archived} aria-label={`在 ${title} 下新建文稿`} title="新建子文稿" onClick={()=>onCreate(note.id)}><Icon name="plus"/></button><button disabled={disabled} aria-label={`更多 ${title}`} onClick={e=>showMenu(key,e.currentTarget)}><Icon name="more"/></button></div>
   </div>{childNotes.length>0&&<Collapse open={open}><ul role="group" className="tree-branch">{rows(childNotes,depth+1)}</ul></Collapse>}
  </li>;
 });}
 function folderRows(parentId?:string,depth=0):ReactNode{return folders.filter(f=>f.parentId===parentId&&(!matches||roots.some(n=>n.note.folderId&&folderDescendants(folders,f.id).has(n.note.folderId)))).map(f=>{
  const key='folder:'+f.id,open=!!matches||!collapsed.has(key),items=roots.filter(n=>n.note.folderId===f.id),hasChildren=folders.some(child=>child.parentId===f.id);
  return <li key={key} className={`tree-node tree-folder-node ${activeFolders.has(f.id)?'active-path':''}`} style={{'--depth':depth} as CSSProperties} role="treeitem" aria-label={f.name} aria-expanded={open}><div className={`tree-row folder-row ${drag.rowClass(key)}`} data-tree-target={key} onContextMenu={e=>{e.preventDefault();showMenu(key,e.currentTarget);}}><button className="tree-fold" aria-label={`${open?'折叠':'展开'}文件夹 ${f.name}`} onClick={()=>toggle(key)}><Icon name="chevron"/></button><button className="tree-title" disabled={disabled} title={folderPaths.get(f.id)} {...drag.bind({kind:'folder',id:f.id},()=>toggle(key))}><Icon name={open?'folderOpen':'folder'}/><strong>{f.name}</strong></button><div className="tree-actions"><button disabled={disabled} title="新建文稿" aria-label={`在文件夹 ${f.name} 下新建文稿`} onClick={()=>onCreate(undefined,f.id)}><Icon name="plus"/></button><button disabled={disabled} aria-label={`管理文件夹 ${f.name}`} onClick={e=>showMenu(key,e.currentTarget)}><Icon name="more"/></button></div></div><Collapse open={open}><ul role="group" className="tree-branch">{folderRows(f.id,depth+1)}{rows(items,depth+1)}{!items.length&&!hasChildren&&<li className="tree-empty">还没有文稿</li>}</ul></Collapse></li>;
 });}
 const targetNote=menu?.target.startsWith('note:')?library.notes.find(n=>n.id===menu.target.slice(5)):undefined;
 const act=(fn:()=>void)=>{setMenu(null);fn();};
 return <>
 {drag.preview}
 <header className="library-heading"><span className="library-heading-label">文稿</span><div>{tagControl}{pinControl}<button disabled={disabled} aria-label="新文稿" title="新建顶层文稿 ⌘N" onClick={()=>onCreate()}><Icon name="plus"/></button><button className={viewActive?'has-view-filter':''} title="文稿选项" aria-label="文稿库菜单" aria-expanded={menu?.target==='root'} onClick={e=>showMenu('root',e.currentTarget)}><Icon name="more"/></button></div></header>
 {children}
 <div ref={treeRef} className={`note-list tree-scroll ${drag.dragging?'is-dragging':''}`} onScroll={()=>setMenu(null)}>
  <ul className="document-tree" role="tree" aria-label="文稿树">
   {folderRows()}
   {folders.length>0&&roots.some(n=>!n.note.folderId)&&<li className="tree-root-label" role="presentation">未分类</li>}
   {rows(roots.filter(n=>!n.note.folderId),0)}
  </ul>
  {!roots.length&&(!folders.length||matches)&&<p className="tree-empty">{matches?'没有找到相关文稿':'还没有文稿，点击上方 ＋ 开始。'}</p>}
  <div className={`tree-root-drop ${drag.rowClass('root')}`} data-tree-target="root" hidden={!drag.canDropRoot}><Icon name="folder"/>移到文稿顶层</div>
 </div>
 {(bulk||selected.size>0)&&<div className="tree-bulk"><span>{selected.size?`已选 ${selected.size} 篇`:'勾选要整理的文稿'}</span><button onClick={()=>{setBulk(false);[...selected].forEach(onSelect);}}>完成</button></div>}
 {createPortal(<Presence show={!!menu} className="popover-presence">{menu&&<div ref={menuRef} className={`tree-menu ${menu.target==='root'?'tree-library-menu':''}`} role={menuPage==='view'?'dialog':'menu'} aria-label={menuPage==='view'?'范围与排序':'文稿菜单'} style={{left:menu.x,top:menu.y}}>
  {menu.target==='root'&&menuPage==='view'?<><header className="tree-menu-heading"><button aria-label="返回文稿菜单" onClick={()=>setMenuPage('main')}><Icon name="chevron"/></button><span>范围与排序</span></header>{viewControls}</>:targetNote?<><button role="menuitem" disabled={!!targetNote.archived} onClick={()=>act(()=>onCreate(targetNote.id))}>新建子文稿</button><button role="menuitem" onClick={()=>act(()=>onRename(targetNote.id))}>重命名</button><button role="menuitem" onClick={()=>act(()=>onMove([targetNote.id]))}>移动到…</button><button role="menuitem" onClick={()=>act(()=>{setBulk(true);onSelect(targetNote.id);})}>选择文稿</button><hr/><button role="menuitem" className="destructive" onClick={()=>act(()=>onDelete([targetNote.id]))}>移到废纸篓</button></>:menu.target.startsWith('folder:')?<><button role="menuitem" onClick={()=>act(()=>onCreate(undefined,menu.target.slice(7)))}>新建文稿</button><button role="menuitem" onClick={()=>act(()=>onFolder(undefined,menu.target.slice(7)))}>新建子文件夹</button><button role="menuitem" onClick={()=>act(()=>onSyncManage(menu.target))}>管理此文件夹同步…</button><button role="menuitem" onClick={()=>act(()=>onFolder(menu.target.slice(7)))}>管理文件夹…</button></>:<><button role="menuitem" onClick={()=>act(()=>onFolder())}>新建文件夹</button><button className="tree-view-entry" role="menuitem" onClick={()=>setMenuPage('view')}><span>范围与排序</span><Icon name="chevron"/></button><hr/><button role="menuitem" onClick={()=>act(()=>setBulk(true))}>批量选择</button><button role="menuitem" onClick={()=>act(()=>setCollapsed(new Set()))}>展开全部</button><button role="menuitem" onClick={()=>act(()=>setCollapsed(new Set([...notes.map(n=>'note:'+n.id),...folders.map(f=>'folder:'+f.id)])))}>折叠全部</button></>}
 </div>}</Presence>,document.body)}
 </>;
}
