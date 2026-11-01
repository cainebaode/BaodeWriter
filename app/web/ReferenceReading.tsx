import { createContext, useContext, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { native } from './bridge';
import { annotationUpdate, sourceParts, sourceVersion, type Annotation, type Material, type ReferenceSnapshot, type Source, type SourceVersion } from './references';

export type ReferenceEnvironment={sources:Source[];drafts:Map<string,string>;onDraft:(key:string,value:string|undefined)=>void;onFull:(sourceID:string,versionID:string,parts:string[],snapshot?:ReferenceSnapshot)=>void;onAnnotation:(sourceID:string,annotation:Annotation)=>void;onAINote:(snapshot:ReferenceSnapshot,text:string)=>void;onAdopt:(material:Material,noteID?:string)=>void;onQuote:(material:Material,noteID?:string)=>void};
export const ReferenceContext=createContext<ReferenceEnvironment>({sources:[],drafts:new Map(),onDraft:()=>{},onFull:()=>{},onAnnotation:()=>{},onAINote:()=>{},onAdopt:()=>{},onQuote:()=>{}});
export function ReferenceMarkdown({text}:{text:string}){
 return <div className="reference-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url=>/^(?:https?:|writer-asset:|#)/.test(url)?url:''} components={{a:({href,children})=><a href={href} onClick={e=>{e.preventDefault();if(href&&/^https?:/.test(href))void native('openURL',{url:href});}}>{children}</a>,img:({src,alt})=>src?.startsWith('writer-asset:')?<img src={src} alt={alt||'资料图片'}/>:<span className="reference-image-missing">图片未收存{alt?' · '+alt:''}</span>}}>{text}</ReactMarkdown></div>;
}

export function ReadingBlock({material,snapshot,compact=false,round}:{material?:Material;snapshot?:ReferenceSnapshot;compact?:boolean;round?:number}){
 const env=useContext(ReferenceContext),source=env.sources.find(s=>s.id===(snapshot?.sourceID||material?.sourceID));
 const version=source&&sourceVersion(source,{versionID:snapshot?.versionID||material?.versionID||''});
 const parts=snapshot?.allParts.length?snapshot.allParts:version?sourceParts(version):snapshot?.parts||[],ids=material?.parts||[];
 const selected=new Set(snapshot?.selectedParts||ids);
 // The original excerpt is always kept even when a source cannot be positioned.
 const indices=parts.flatMap((part,i)=>selected.has(part.id)?[i]:[]);
 const draftKey=(material?.sourceID||'')+':'+(material?.annotationID||'');
 const [range,setRange]=useState({before:0,after:0}),draft=env.drafts.get(draftKey);
 const quote=snapshot?.quote||material?.quote||'',note=snapshot?.note??material?.text??'';
 const annotation=source?.annotations.find(a=>a.id===material?.annotationID),newer=source&&material&&annotationUpdate(source,material);
 const originalIndices=indices.length?indices:material?.parts.length?parts.flatMap((p,i)=>material.parts.includes(p.id)?[i]:[]):snapshot?.parts.length?parts.flatMap((p,i)=>snapshot.parts.some(s=>s.id===p.id)?[i]:[]):[];
 const first=originalIndices[0]??0,last=originalIndices.at(-1)??0,expanded=range.before>0||range.after>0;
 const context=parts.filter((_,i)=>i>=first-range.before&&i<=last+range.after);
 const annotationQuote=snapshot?.annotationQuote||material?.annotationQuote;
 const noteView=<div className="reference-note"><small>{snapshot?`第 ${round||1} 轮采用的批注`:material?.origin==='ai'?'AI 笔记':`本篇采用 · 批注 v${material?.annotationRevision||0}`}</small>{annotationQuote&&annotationQuote!==quote&&<><small>这条批注原先针对：</small><blockquote>{annotationQuote}</blockquote></>}{note?<p>{note}</p>:<p className="hint">仅高亮，尚未写批注。</p>}
  {material&&annotation&&<><details><summary>编辑原批注</summary><p className="hint">修改来源记录；更新本篇采用版本需另行选择。</p><textarea aria-label="编辑原批注" value={draft??annotation.text} onChange={e=>env.onDraft(draftKey,e.target.value)}/><button disabled={draft===undefined||draft===annotation.text} onClick={()=>{if(draft===undefined)return;env.onAnnotation(source!.id,{...annotation,text:draft,revision:annotation.revision+1,at:new Date().toISOString()});env.onDraft(draftKey,undefined);}}>保存原批注</button></details>{newer&&<button onClick={()=>env.onAdopt(material)}>原批注有更新 · 更新本篇采用版本</button>}</>}
 </div>;
 return <section className={`reference-reading ${compact?'compact':''}`} data-material-id={material?.id||snapshot?.id} contentEditable={false} onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing&&!e.defaultPrevented){if((e.target as HTMLElement).closest('textarea,input'))return;if(expanded){e.preventDefault();e.stopPropagation();setRange({before:0,after:0});}}}}>
  <header><strong>{snapshot?.title||version?.document.title||source?.title||'保存的引用'}</strong><small>{snapshot?.author||version?.author||source?.author}{source?.archived?' · 已归档':''}{round?` · 第 ${round} 轮参考`:''}</small></header>
  {quote?<blockquote>{quote}</blockquote>:<small>针对整篇的材料{!note?' · 展开全文阅读':''}</small>}
  <div className="reference-context" hidden={!expanded}>{context.map(p=><section key={p.id} className={selected.has(p.id)?'quoted-part':''}>{snapshot&&<small>{snapshot.parts.some(sent=>sent.id===p.id)?`第 ${round||1} 轮已发送`:`补充阅读 · 第 ${round||1} 轮未发送`}</small>}<ReferenceMarkdown text={p.markdown}/></section>)}</div>
  <div className="reference-reading-actions"><button aria-expanded={expanded} disabled={!parts.length} onClick={()=>setRange(expanded?{before:0,after:0}:{before:1,after:1})}>{expanded?'收起上下文':'展开上下文'}</button>{expanded&&first-range.before>0&&<button onClick={()=>setRange(r=>({...r,before:r.before+1}))}>前一段</button>}{expanded&&last+range.after<parts.length-1&&<button onClick={()=>setRange(r=>({...r,after:r.after+1}))}>后一段</button>}<button disabled={!version} onClick={()=>env.onFull(source?.id||snapshot!.sourceID,version?.id||snapshot!.versionID,material?.parts||snapshot?.selectedParts||[],snapshot)}>全文对照</button></div>
  {compact?<details><summary>批注与引用操作{newer?' · 原批注有更新':''}</summary>{noteView}{material?.quote&&<button onClick={()=>env.onQuote(material)}>插入原文引文</button>}</details>:<>{noteView}{material?.quote&&<button onClick={()=>env.onQuote(material)}>插入原文引文</button>}</>}
  {!version&&<small>引用位置无法定位，保留的摘录与批注仍可读。</small>}
 </section>;
}

export function SourceText({source,version,selected=[],snapshot,round,onSelect}:{source:Source;version:SourceVersion;selected?:string[];snapshot?:ReferenceSnapshot;round?:number;onSelect?:(parts:string[],quote:string)=>void}){
 const parts=sourceParts(version),chosen=new Set(selected);
 return <div className="source-text" data-source-version={version.id} onMouseUp={e=>{
  if(!onSelect)return;const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;const range=selection.getRangeAt(0),container=e.currentTarget;
  if(!container.contains(range.startContainer)||!container.contains(range.endContainer))return;
  const ids=Array.from(container.querySelectorAll<HTMLElement>('[data-source-part]')).filter(part=>range.intersectsNode(part)).map(part=>part.dataset.sourcePart!);
  if(ids.length)onSelect(ids,selection.toString());
 }}><h1>{version.document.title||source.title}</h1><div className="source-meta">{(version.author??source.author)||'作者未记录'} · {new Date(version.at).toLocaleDateString()} {source.archived?'· 已归档':''}</div>{version.warning&&<p className="hint">{version.warning}</p>}{parts.map(part=><section key={part.id} data-source-part={part.id} className={chosen.has(part.id)?'source-highlight':''}>{snapshot&&<small>{snapshot.parts.some(p=>p.id===part.id)?`第 ${round||1} 轮已发送`:`补充阅读 · 第 ${round||1} 轮未发送`}</small>}<ReferenceMarkdown text={part.markdown}/></section>)}</div>;
}
