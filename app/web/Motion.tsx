import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const motionTime={panel:280,popup:160,dialog:200};

// Keep closing surfaces alive until their exit finishes; reopening cancels removal.
export function usePresence(open:boolean,duration=motionTime.panel){
 const [mounted,setMounted]=useState(open),[visible,setVisible]=useState(open);
 const retained=useRef(open);
 useLayoutEffect(()=>{
  let first=0,second=0,timer=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(open){
   const entering=!retained.current;retained.current=true;setMounted(true);
   if(reduced||!entering)setVisible(true);
   else first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>setVisible(true));});
  }else{
   setVisible(false);
   timer=window.setTimeout(()=>{retained.current=false;setMounted(false);},reduced?0:duration);
  }
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);clearTimeout(timer);};
 },[open,duration]);
 return {mounted,visible};
}

export function Presence({show,children,className='',duration=motionTime.popup}:{show:boolean;children:ReactNode;className?:string;duration?:number}){
 const {mounted,visible}=usePresence(show,duration),last=useRef<ReactNode>(null);
 if(show)last.current=children;
 else if(!mounted)last.current=null;
 return mounted?<div className={`presence ${className}`} data-open={visible} inert={!show} aria-hidden={!show}>{show?children:last.current}</div>:null;
}

export function Collapse({open,children}:{open:boolean;children:ReactNode}){
 const {mounted,visible}=usePresence(open);
 return <div className="motion-collapse" data-open={visible} inert={!open} aria-hidden={!open}><div>{mounted&&children}</div></div>;
}

export function Disclosure({className='',label,title,summary,children,section=false,disabled=false}:{className?:string;label?:string;title?:string;summary:ReactNode;children:ReactNode;section?:boolean;disabled?:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDetailsElement>(null);
 const {mounted,visible}=usePresence(open,section?motionTime.panel:motionTime.popup);
 useEffect(()=>{
  if(!open||section)return;
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);root.current?.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,section]);
 return <details ref={root} className={`${className} motion-disclosure ${section?'section-disclosure':'menu-disclosure'}`} open={mounted} data-open={visible}>
  <summary aria-label={label} title={title} aria-expanded={open} aria-disabled={disabled} onClick={e=>{e.preventDefault();if(!disabled)setOpen(value=>!value);}}>{summary}</summary>
  <div className="disclosure-body" inert={!open} aria-hidden={!open} onClick={e=>{if(!section&&(e.target as HTMLElement).closest('button'))setOpen(false);}}><div>{mounted&&children}</div></div>
 </details>;
}
