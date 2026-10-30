import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import type { Library } from './model';
import { ancestors, descendants, treeDropError, type TreeDragSource, type TreeDrop } from './tree';

type Drag={source:TreeDragSource;handle:HTMLElement;pointer:number;startX:number;startY:number;x:number;y:number;active:boolean;target:TreeDrop|null;hint:string;valid:boolean};
type Feedback={x:number;y:number;title:string;hint:string;kind:'document'|'folder';count:number;phase:'drag'|'drop'|'cancel';valid:boolean};
export function useTreeDrag({library,viewport,disabled,onDrop,onExpand}:{library:Library;viewport:RefObject<HTMLDivElement|null>;disabled:boolean;onDrop:(source:TreeDragSource,target:TreeDrop)=>boolean;onExpand:(key:string)=>void}){
 const drag=useRef<Drag|null>(null),frame=useRef(0),expandTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),finishTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),suppressClick=useRef(false),hoverKey=useRef('');
 const [feedback,setFeedback]=useState<Feedback|null>(null),[over,setOver]=useState<TreeDrop|null>(null),[source,setSource]=useState<TreeDragSource|null>(null),[landed,setLanded]=useState('');
 function identify(source:TreeDragSource){return source.kind==='folder'?{title:library.folders?.find(f=>f.id===source.id)?.name||'文件夹',kind:'folder' as const,count:1}:{title:library.notes.find(n=>n.id===source.ids[0])?.document.title||'无标题文稿',kind:'document' as const,count:source.ids.length};}
 function locate(d:Drag){
  const element=document.elementFromPoint(d.x,d.y)?.closest<HTMLElement>('[data-tree-target]');
  let target:TreeDrop|null=null,hint='移到目标文稿或文件夹上，Esc 取消',valid=false;
  if(element&&viewport.current?.contains(element)){
   const key=element.dataset.treeTarget!,rect=element.getBoundingClientRect();let position:TreeDrop['position']='inside';
   if(d.source.kind==='folder')position=d.y<rect.top+rect.height/2?'before':'after';
   else if(key.startsWith('note:'))position=d.y<rect.top+9?'before':d.y>rect.bottom-9?'after':'inside';
   target={key,position};const error=treeDropError(library,d.source,target);valid=!error;
   const title=key==='root'?'文稿顶层':key.startsWith('folder:')?library.folders?.find(f=>'folder:'+f.id===key)?.name:library.notes.find(n=>'note:'+n.id===key)?.document.title||'无标题文稿';
   const note=library.notes.find(n=>'note:'+n.id===key),path=note?[...ancestors(library.notes,note.id),note].map(n=>n.document.title||'无标题文稿').join(' / '):title;
   hint=error||(position==='inside'?`移入：${path}`:`放在「${title}」${position==='before'?'上方':'下方'}`);
  }
  d.target=target;d.valid=valid;d.hint=hint;setOver(valid?target:null);
  const key=valid&&target?.position==='inside'?target.key:'';
  if(key!==hoverKey.current){clearTimeout(expandTimer.current);hoverKey.current=key;if(key)expandTimer.current=setTimeout(()=>{if(drag.current?.active&&hoverKey.current===key)onExpand(key);},650);}
  setFeedback({...identify(d.source),x:Math.min(d.x+16,window.innerWidth-276),y:Math.min(d.y+18,window.innerHeight-78),hint,phase:'drag',valid});
 }
 function scroll(){const d=drag.current,el=viewport.current;if(!d?.active||!el)return;const r=el.getBoundingClientRect();if(d.x>=r.left&&d.x<=r.right&&d.y>=r.top&&d.y<=r.bottom){const delta=d.y<r.top+32?-7:d.y>r.bottom-32?7:0;if(delta){el.scrollTop+=delta;locate(d);}}frame.current=requestAnimationFrame(scroll);}
 function finish(commit:boolean){
  const d=drag.current;if(!d)return;drag.current=null;cancelAnimationFrame(frame.current);clearTimeout(expandTimer.current);hoverKey.current='';document.body.classList.remove('tree-dragging');
  if(d.handle.hasPointerCapture(d.pointer))d.handle.releasePointerCapture(d.pointer);
  setSource(null);setOver(null);if(!d.active)return;suppressClick.current=true;
  const destination=d.target?viewport.current?.querySelector<HTMLElement>(`[data-tree-target="${CSS.escape(d.target.key)}"]`):null;
  const accepted=commit&&d.valid&&!!d.target&&onDrop(d.source,d.target);
  const rect=(accepted?destination:d.handle)?.getBoundingClientRect();
  setFeedback(previous=>previous?{...previous,x:rect?.left??d.startX,y:rect?.top??d.startY,phase:accepted?'drop':'cancel',hint:accepted?'已移动':'已取消',valid:!!accepted}:null);
  if(accepted){setLanded(d.source.kind==='folder'?'folder:'+d.source.id:'note:'+d.source.ids[0]);}
  clearTimeout(finishTimer.current);finishTimer.current=setTimeout(()=>{setFeedback(null);setLanded('');},650);
 }
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();finish(false);}};const cancel=()=>finish(false);window.addEventListener('keydown',escape);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);};});
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);clearTimeout(expandTimer.current);clearTimeout(finishTimer.current);document.body.classList.remove('tree-dragging');},[]);
 const branch=source?.kind==='notes'?descendants(library.notes,source.ids):new Set<string>();
 function rowClass(key:string){return [source&&(source.kind==='folder'?key==='folder:'+source.id:branch.has(key.slice(5)))?'drag-source':'',over?.key===key?'drop-'+over.position:'',landed===key?'drop-landed':''].join(' ');}
 function bind(source:TreeDragSource,click:()=>void){return {
  draggable:false,
  onDragStart:(e:React.DragEvent)=>e.preventDefault(),
  onClick:()=>{if(suppressClick.current){suppressClick.current=false;return;}click();},
  onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>{if(e.button!==0||disabled)return;suppressClick.current=false;clearTimeout(finishTimer.current);setFeedback(null);setLanded('');drag.current={source,handle:e.currentTarget,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,target:null,hint:'',valid:false};e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:(e:PointerEvent<HTMLButtonElement>)=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;d.x=e.clientX;d.y=e.clientY;if(!d.active){if(Math.hypot(d.x-d.startX,d.y-d.startY)<6)return;d.active=true;setSource(d.source);document.body.classList.add('tree-dragging');frame.current=requestAnimationFrame(scroll);}e.preventDefault();locate(d);},
  onPointerUp:(e:PointerEvent<HTMLButtonElement>)=>{if(drag.current?.active){e.preventDefault();drag.current.x=e.clientX;drag.current.y=e.clientY;locate(drag.current);}finish(true);},
  onPointerCancel:()=>finish(false),onLostPointerCapture:()=>finish(false),
 };}
 const preview=feedback&&createPortal(<div className={`tree-drag-preview ${feedback.phase} ${feedback.valid?'valid':'invalid'}`} style={{transform:`translate3d(${feedback.x}px,${feedback.y}px,0)`}}><div><Icon name={feedback.kind}/><strong>{feedback.title}</strong>{feedback.count>1&&<b>{feedback.count} 篇</b>}</div><p>{feedback.hint}</p></div>,document.body);
 return {bind,rowClass,preview,dragging:!!source,canDropRoot:source?.kind==='notes',isDragging:()=>!!drag.current?.active};
}
