import { useEffect, type RefObject } from 'react';

export function useDialogFocus(ref:RefObject<HTMLElement|null>,onClose:()=>void){
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const frame=requestAnimationFrame(()=>ref.current?.querySelector<HTMLElement>('[autofocus],input,button')?.focus());
  const key=(event:KeyboardEvent)=>{
   if(event.isComposing)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
   if(event.key!=='Tab')return;
   const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0);
   const first=items[0],last=items.at(-1);if(!first)return;
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
}
