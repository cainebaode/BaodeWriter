import { createContext, useEffect, useLayoutEffect, useState } from 'react';

export const themes = [{id:'graphite',name:'石墨',side:'#2c2e31'}, {id:'green',name:'深绿',side:'#233630'}, {id:'wine',name:'暗酒红',side:'#38272f'}, {id:'blue',name:'深蓝',side:'#203249'}] as const;
export type Appearance = {theme:typeof themes[number]['id'];mode:'light'|'dark'|'system';font:'system'|'serif';size:number;lineHeight:number;width:number};
export const defaultAppearance:Appearance = {theme:'graphite',mode:'light',font:'system',size:18,lineHeight:1.9,width:720};
export function readAppearance(raw:string|null):Appearance {
 try { const value=JSON.parse(raw||'{}'); return {
  theme:themes.some(t=>t.id===value?.theme)?value.theme:'graphite',
  mode:['light','dark','system'].includes(value?.mode)?value.mode:'light',
  font:value?.font==='serif'?'serif':'system',
  size:[16,17,18,19,20,21,22].includes(value?.size)?value.size:18,
  lineHeight:[1.7,1.9,2.1].includes(value?.lineHeight)?value.lineHeight:1.9,
  width:[640,720,800].includes(value?.width)?value.width:720,
 }; } catch { return {...defaultAppearance}; }
}
export const AppearanceMode = createContext<'light'|'dark'>('light');
export function useAppearance(){
 const [appearance,setAppearance]=useState(()=>{try{return readAppearance(localStorage.getItem('baode-writer-appearance'));}catch{return {...defaultAppearance};}});
 const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)'),update=()=>setSystemDark(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const mode=appearance.mode==='system'?(systemDark?'dark':'light'):appearance.mode;
 useLayoutEffect(()=>{
  const root=document.documentElement;root.dataset.theme=appearance.theme;root.dataset.mode=mode;
  root.style.setProperty('--reading-font',appearance.font==='serif'?'"Songti SC", "STSong", serif':'-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif');
  root.style.setProperty('--reading-size',appearance.size+'px');root.style.setProperty('--reading-line',String(appearance.lineHeight));root.style.setProperty('--reading-width',appearance.width+'px');
  try{localStorage.setItem('baode-writer-appearance',JSON.stringify(appearance));}catch{/* Appearance does not affect document saving. */}
 },[appearance,mode]);
 return {appearance,setAppearance,mode};
}
