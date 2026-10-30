import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Collapse, usePresence } from './Motion';
import { documentHeadings, type Document, type Heading } from './model';

export const defaultLayout={list:true,listPinned:false,outline:false,settings:false,listWidth:260,outlineWidth:224,settingsWidth:264};
export type Layout=typeof defaultLayout;
export function useLayout(){
 const [layout,setLayout]=useState<Layout>(()=>{try{const saved=JSON.parse(localStorage.getItem('baode-writer-layout')||'{}');const value={...defaultLayout};for(const key of ['list','listPinned','outline','settings'] as const)if(typeof saved[key]==='boolean'&&saved.version===4)value[key]=saved[key];for(const [key,min,max] of [['listWidth',220,360],['outlineWidth',180,260],['settingsWidth',220,360]] as const)if(Number.isFinite(saved[key]))value[key]=Math.max(min,Math.min(max,saved[key]));return value;}catch{return {...defaultLayout};}});
 useEffect(()=>{try{localStorage.setItem('baode-writer-layout',JSON.stringify({...layout,version:4}));}catch{/* Layout preferences do not affect durable document storage. */}},[layout]);
 return [layout,setLayout] as const;
}
export function ResizeHandle({label,value,min,max,onChange,reverse=false,onReset,active=true}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void;reverse?:boolean;onReset:()=>void;active?:boolean}){
 const drag=useRef<{x:number;width:number}|null>(null);
 return <div className={`resize-handle ${active?'':'is-hidden'}`} inert={!active} aria-hidden={!active} role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max} tabIndex={active?0:-1} title="拖动调整宽度 · 双击恢复默认" onDoubleClick={onReset} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onChange(Math.max(min,Math.min(max,value+(e.key==='ArrowRight'?10:-10)*(reverse?-1:1))));}}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();drag.current={x:e.clientX,width:value};e.currentTarget.setPointerCapture(e.pointerId);document.body.classList.add('resizing');}} onPointerMove={e=>{if(drag.current)onChange(Math.max(min,Math.min(max,drag.current.width+(e.clientX-drag.current.x)*(reverse?-1:1))));}} onPointerUp={e=>{drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);document.body.classList.remove('resizing');}} onLostPointerCapture={()=>{drag.current=null;document.body.classList.remove('resizing');}}><i/></div>;
}
export function Outline({doc,paper,preview,width,expanded}:{expanded:boolean;doc:Document;paper:RefObject<HTMLElement|null>;preview:boolean;width:number}){
 const presence=usePresence(expanded);
 const headings=documentHeadings(doc);const [active,setActive]=useState('');const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const signature=headings.map(h=>h.id+':'+h.level).join('|');
 function target(h:Heading){return doc.contentType==='blocknote'?paper.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(h.id)}"]`):paper.current?.querySelector<HTMLElement>(`[data-outline-id="${h.id}"]`);}
 useEffect(()=>{setActive('');setCollapsed(new Set());},[doc.contentType]);
 const positions=useRef<Map<string,number>>(new Map());
 function measure(textarea:HTMLTextAreaElement){
  const style=getComputedStyle(textarea),mirror=document.createElement('div');
  Object.assign(mirror.style,{position:'absolute',visibility:'hidden',width:`${textarea.clientWidth}px`,font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,padding:style.padding,whiteSpace:'pre-wrap',overflowWrap:'break-word',boxSizing:'border-box'});
  const markers:HTMLElement[]=[];let offset=0;
  for(const h of headings){mirror.append(document.createTextNode(doc.content.slice(offset,h.offset)));const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker);markers.push(marker);offset=h.offset!;}
  document.body.append(mirror);positions.current=new Map(headings.map((h,i)=>[h.id,markers[i].offsetTop-mirror.offsetTop]));mirror.remove();
 }
 useEffect(()=>{
  const root=paper.current;if(!root)return;const textarea=root.querySelector<HTMLTextAreaElement>('.markdown-edit textarea');
  const update=()=>{let current='';const top=root.getBoundingClientRect().top+100;
   for(const h of headings){const y=textarea?textarea.getBoundingClientRect().top+(positions.current.get(h.id)||0):target(h)?.getBoundingClientRect().top;if(y!==undefined&&y<=top)current=h.id;}
   if(root.scrollHeight>root.clientHeight&&root.scrollHeight-root.scrollTop-root.clientHeight<3)current=headings.at(-1)?.id||current;setActive(current);
  };
  const cursor=()=>{let current='';for(const h of headings)if((h.offset||0)<=textarea!.selectionStart)current=h.id;setActive(current);};
  const resize=()=>{if(textarea)measure(textarea);update();};const observer=new ResizeObserver(resize);observer.observe(root);resize();
  root.addEventListener('scroll',update,{passive:true});textarea?.addEventListener('select',cursor);textarea?.addEventListener('keyup',cursor);
  return()=>{observer.disconnect();root.removeEventListener('scroll',update);textarea?.removeEventListener('select',cursor);textarea?.removeEventListener('keyup',cursor);};
 },[signature,preview,paper,doc.content]);
 function jump(h:Heading){setActive(h.id);const el=target(h);const root=paper.current!;
  if(el){root.scrollTo({top:root.scrollTop+el.getBoundingClientRect().top-root.getBoundingClientRect().top-54,behavior:'smooth'});return;}
  const textarea=root.querySelector<HTMLTextAreaElement>('.markdown-edit textarea');if(!textarea||h.offset===undefined)return;
  textarea.focus({preventScroll:true});textarea.setSelectionRange(h.offset,h.offset);
  root.scrollTo({top:root.scrollTop+textarea.getBoundingClientRect().top-root.getBoundingClientRect().top+(positions.current.get(h.id)||0)-54,behavior:'smooth'});
 }

 const hidden=new Set<string>();let hiddenBelow=0;
 for(const h of headings){if(hiddenBelow&&h.level>hiddenBelow){hidden.add(h.id);continue;}hiddenBelow=collapsed.has(h.id)?h.level:0;}
 return <aside className={`outline-panel ${presence.visible?'expanded':'is-collapsed'}`} aria-label="文章目录" hidden={!presence.mounted} data-open={presence.visible} inert={!expanded} aria-hidden={!expanded} style={{width:presence.visible?width:0}}><div className="outline-contents" inert={!expanded} aria-hidden={!expanded} style={{width:width-24}}><button className="outline-top" aria-current={!active?'location':undefined} title={doc.title||'无标题文稿'} onClick={()=>{paper.current?.scrollTo({top:0,behavior:'smooth'});setActive('');}}>{doc.title||'无标题文稿'}</button><nav aria-label="标题导航">{headings.map((h,i)=><Collapse key={h.id} open={!hidden.has(h.id)}><div className={`outline-row ${active===h.id?'active':''}`} style={{'--level':Math.max(0,h.level-Math.min(...headings.map(item=>item.level)))} as CSSProperties}>{headings[i+1]?.level>h.level?<button className="outline-fold" aria-label={`${collapsed.has(h.id)?'展开':'折叠'} ${h.text}`} aria-expanded={!collapsed.has(h.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);next.has(h.id)?next.delete(h.id):next.add(h.id);return next;})}>{collapsed.has(h.id)?'›':'⌄'}</button>:<span className="outline-spacer"/>}<button className="outline-link" aria-current={active===h.id?'location':undefined} title={h.text} onClick={()=>jump(h)}>{h.text}</button></div></Collapse>)}</nav>{!headings.length&&<p className="panel-empty">标题会自动出现在这里。<br/>在正文中输入 /，选择标题层级；Markdown 可使用 # 标题。</p>}</div></aside>;
}
