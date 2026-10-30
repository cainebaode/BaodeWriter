import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import { Presence } from './Motion';

type Props={query:string;tag:string;tags:string[];onQuery:(value:string)=>void;onTag:(value:string)=>void;compact?:boolean};
export function LibrarySearch({query,tag,tags,onQuery,onTag,compact=false}:Props){
 const [menu,setMenu]=useState<{left:number;top:number;width:number}|null>(null),[find,setFind]=useState('');
 const root=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!menu)return;
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))setMenu(null);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(null);trigger.current?.focus();}};
  const resize=()=>setMenu(null);
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',resize);
  const frame=requestAnimationFrame(()=>(popup.current?.querySelector('input, button[aria-pressed="true"]') as HTMLElement|null)?.focus());
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',resize);};
 },[menu]);
 function toggle(){if(menu){setMenu(null);return;}const r=trigger.current!.getBoundingClientRect(),width=compact?Math.min(260,window.innerWidth-24):root.current!.getBoundingClientRect().width;setFind('');setMenu({left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),top:r.bottom+6,width});}
 function choose(value:string){onTag(value);setMenu(null);trigger.current?.focus();}
 const visible=tags.filter(value=>value.toLocaleLowerCase().includes(find.trim().toLocaleLowerCase()));
 return <div ref={root} className={`library-search ${compact?'compact':''}`}>
  <div className="library-search-row">{!compact&&<input className="search" aria-label="搜索文稿" placeholder="搜索文稿" onFocus={()=>setMenu(null)} value={query} onChange={e=>onQuery(e.target.value)}/>}<button ref={trigger} className={`library-tag-toggle ${tag?'active':''}`} aria-label="标签筛选" title={tag?'标签：'+tag:'标签筛选'} aria-expanded={!!menu} aria-haspopup="dialog" onClick={toggle}><Icon name="tag"/>{!compact&&<span>标签</span>}</button></div>
  {tag&&!compact&&<div className="library-tag-chip"><button title={`切换标签：${tag}`} onClick={toggle}><Icon name="tag"/><span>{tag}</span></button><button aria-label="清除标签筛选" title="清除标签筛选" onClick={()=>choose('')}><Icon name="close"/></button></div>}
  {createPortal(<Presence show={!!menu} className="popover-presence">{menu&&<div ref={popup} className="library-tag-menu" role="dialog" aria-label="选择标签" style={{...menu,maxHeight:Math.min(340,window.innerHeight-menu.top-14)}}>
   {tags.length>8&&<input className="tag-find" aria-label="查找标签" placeholder="查找标签…" value={find} onChange={e=>setFind(e.target.value)}/>}
   <button className="tag-all" aria-pressed={!tag} onClick={()=>choose('')}><span>全部标签</span>{!tag&&<span className="tag-check">✓</span>}</button>
   <div className="library-tag-list">{visible.map(value=><button key={value} aria-pressed={tag===value} title={value} onClick={()=>choose(value)}><Icon name="tag"/><span>{value}</span>{tag===value&&<span className="tag-check">✓</span>}</button>)}{!visible.length&&<p>{tags.length?'没有匹配的标签':'还没有标签，可在文稿设置中添加。'}</p>}</div>
  </div>}</Presence>,document.body)}
 </div>;
}
