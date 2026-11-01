import { useRef, useState } from 'react';
import { Icon } from './Icons';
import { useDialogFocus } from './DialogFocus';
import { dateValue, plainText, searchable, type Library } from './model';
import { ancestors, folderEntries } from './tree';

export function SearchDialog({library,onOpen,onClose}:{library:Library;onOpen:(id:string)=>void;onClose:()=>void}){
 const [query,setQuery]=useState(''),[index,setIndex]=useState(0);const root=useRef<HTMLElement>(null);useDialogFocus(root,onClose);
 const notes=library.notes.filter(n=>!n.trashedAt&&(!query.trim()||searchable(n).includes(query.trim().toLocaleLowerCase()))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,40);
 function choose(id:string){onOpen(id);onClose();}
 return <div className="overlay search-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索文稿" ref={root}>
  <div className="search-input"><Icon name="search"/><input autoFocus role="combobox" aria-label="搜索文稿" aria-expanded="true" aria-controls="search-results" aria-activedescendant={notes[index]?`search-${notes[index].id}`:undefined} placeholder="搜索标题、正文、标签或日期" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=Math.max(0,Math.min(notes.length-1,index+(e.key==='ArrowDown'?1:-1)));setIndex(next);document.getElementById(`search-${notes[next]?.id}`)?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&notes[index]){e.preventDefault();choose(notes[index].id);}}}/><button aria-label="关闭搜索" onClick={onClose}><kbd>esc</kbd></button></div>
  <div className="search-caption">{query?'搜索结果':'最近修改'}</div><div id="search-results" role="listbox" aria-label="文稿结果" className="search-results">{notes.map((note,i)=><button role="option" id={`search-${note.id}`} aria-selected={index===i} key={note.id} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(note.id)}><Icon name="document"/><span><strong>{note.document.title||'无标题文稿'}</strong><small>{[folderEntries(library.folders||[]).find(f=>f.folder.id===note.folderId)?.path,...ancestors(library.notes,note.id).map(n=>n.document.title),note.archived?'已归档':dateValue(note.displayDate)].filter(Boolean).join(' / ')}</small>{query&&<p>{plainText(note.document).slice(Math.max(0,plainText(note.document).toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())-24)).slice(0,110)}</p>}</span></button>)}{!notes.length&&<p className="search-empty">没有找到相关文稿</p>}</div><footer><span>↑ ↓ 选择</span><span>↵ 打开文稿</span><span>esc 关闭</span></footer>
 </section></div>;
}
