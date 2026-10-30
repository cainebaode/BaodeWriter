import { useEffect, useLayoutEffect, useRef, type RefObject, type ReactNode } from 'react';
import Editor from './Editor';
import { Disclosure } from './Motion';
import { native } from './bridge';
import { dateValue, plainText, type Document, type Note } from './model';
import type { AISelection } from './ai';
import type { DocumentWorkspace } from './workspace';

export function DocumentTabs({state,notes,disabled,onOpen,onClose,onSplit,onEndSplit,actions}:{state:DocumentWorkspace;notes:Note[];disabled:boolean;onOpen:(id:string)=>void;onClose:(id:string)=>void;onSplit:(id:string)=>void;onEndSplit:()=>void;actions:ReactNode}){
 const strip=useRef<HTMLDivElement>(null);
 const opened=state.tabs.map(id=>notes.find(n=>n.id===id)).filter((n):n is Note=>!!n);
 useEffect(()=>{strip.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[state.active]);
 return <div className="document-tabs toolbar"><div className="document-tab-strip" role="tablist" aria-label="已打开文稿" ref={strip}>{opened.map((note,index)=>{
  const title=note.document.title||'无标题文稿',side=state.panes.indexOf(note.id);
  return <div className={`document-tab ${state.active===note.id?'active':''}`} key={note.id}>
   <button role="tab" aria-selected={state.active===note.id} aria-controls={`document-${note.id}`} disabled={disabled} title={title} onClick={()=>onOpen(note.id)} onKeyDown={e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%opened.length;else if(e.key==='ArrowLeft')next=(index+opened.length-1)%opened.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=opened.length-1;else return;e.preventDefault();onOpen(opened[next].id);strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}><span>{title}</span>{state.panes.length===2&&side>=0&&<small>{side===0?'左':'右'}</small>}</button>
   <button className="tab-close" aria-label={`关闭标签 ${title}`} title="关闭标签，保留文稿" disabled={disabled} onClick={()=>onClose(note.id)}>×</button>
  </div>;
 })}</div><div className="document-tab-actions">{state.panes.length===2?<button disabled={disabled} onClick={onEndSplit}>结束分栏</button>:opened.length<2?null:<Disclosure disabled={disabled} summary="分栏对照"><div className="split-menu"><small>在右侧打开</small>{opened.filter(n=>n.id!==state.active).map(n=><button key={n.id} disabled={disabled} title={n.document.title||'无标题文稿'} onClick={()=>onSplit(n.id)}>{n.document.title||'无标题文稿'}</button>)}</div></Disclosure>}{actions}</div></div>;
}

export function DocumentPane({note,active,side,preview,generation,paper,site,status,onActivate,onEdit,onAI,onError,onMedia,onInsertImage}:{note:Note;active:boolean;side?:number;preview:boolean;generation:number;paper:RefObject<HTMLElement|null>;site:string;status:string;onActivate:()=>void;onEdit:(patch:Partial<Document>)=>void;onAI:(selection:AISelection)=>void;onError:(error:string)=>void;onMedia:(delta:number)=>void;onInsertImage:(url:string,at:number)=>void}){
 const title=useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(()=>{const el=title.current;if(!el)return;const fit=()=>{el.style.height='auto';el.style.height=`${el.scrollHeight}px`;};fit();const observer=new ResizeObserver(fit);if(paper.current)observer.observe(paper.current);return()=>observer.disconnect();},[note.document.title,paper]);
 return <section className={`document-pane ${active?'active':''}`} id={`document-${note.id}`} data-note-id={note.id} onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
 {side!==undefined&&<header className="document-pane-heading"><span>{side===0?'左侧':'右侧'}</span><strong title={note.document.title||'无标题文稿'}>{note.document.title||'无标题文稿'}</strong><small>{active?'当前编辑':''}</small></header>}
 <article className="paper" ref={paper}><div className="paper-inner"><div className="paper-meta"><span>{dateValue(note.displayDate).replaceAll('-',' / ')}</span><span>{preview?'阅读预览':note.document.tags.filter(Boolean).join(' · ')}</span></div><textarea className="title" ref={title} autoFocus={!note.document.title&&!preview} rows={1} aria-label="文稿标题" placeholder="无标题文稿" value={note.document.title} readOnly={preview} onChange={e=>onEdit({title:e.target.value.replaceAll('\n','')})}/>{note.document.coverImage&&<img className="cover" src={note.document.coverImage} alt="文章封面"/>}<Editor key={`${note.id}-${generation}`} noteID={note.id} onAI={onAI} doc={note.document} preview={preview} onChange={content=>onEdit({content})} onError={onError} onMedia={onMedia} onInsertImage={onInsertImage}/><div className="paper-bottom">{plainText(note.document).replace(/\s/g,'').length} 字 · {status}{note.base?.status==='PUBLISHED'&&<button onClick={()=>void native('openURL',{url:`${note.siteURL||site}/blog/${encodeURIComponent(note.base!.publicSlug)}`})}>在网站查看 ↗</button>}</div></div></article>
 </section>;
}
