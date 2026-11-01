import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Document, Note } from './model';
import type { AIMessage } from './ai';

export type SourceVersion={id:string;at:string;document:Document;author?:string;url?:string;originalDocument?:Document;warning?:string};
export type Annotation={id:string;versionID:string;parts:string[];quote:string;text:string;revision:number;at:string;origin?:'ai'};
export type Source={id:string;title:string;author:string;url:string;at:string;versions:SourceVersion[];annotations:Annotation[];archived?:boolean};
export type DraftAnchor={format:'blocknote';blockID:string}|{format:'markdown';text:string;start:number};
export type Material={id:string;sourceID:string;versionID:string;annotationID?:string;annotationRevision:number;quote:string;annotationQuote?:string;text:string;parts:string[];aiScope:'none'|'excerpt'|'full';anchor?:DraftAnchor;origin?:'ai'};
export type SourcePart={id:string;markdown:string;text:string;start:number;end:number;section:string};
export type ReferenceSnapshot={id:string;sourceID:string;title:string;author:string;url:string;versionID:string;at:string;quote:string;annotationQuote?:string;note:string;annotationRevision:number;origin?:'ai';scope:'excerpt'|'full';parts:SourcePart[];allParts:SourcePart[];selectedParts:string[];warning?:string;round?:number};
export type ReferenceUse={id:string;parts:string[];paragraph?:string};
export type QuoteRecord={id:string;anchor:DraftAnchor;original:string;citation:string};

export function sourceParts(version:SourceVersion):SourcePart[]{
 let section='';
 const text=(node:any):string=>typeof node.value==='string'?node.value:(node.children||[]).map(text).join('');
 return fromMarkdown(version.document.content).children.map((node,i)=>{
  if(node.type==='heading')section=text(node);
  const start=node.position!.start.offset!,end=node.position!.end.offset!;
  return {id:'p'+i,markdown:version.document.content.slice(start,end),text:text(node),start,end,section};
 });
}
export function sourceVersion(source:Source,material?:Pick<Material,'versionID'>){return source.versions.find(v=>v.id===material?.versionID)||(!material?source.versions.at(-1):undefined);}
export function adoptAnnotation(source:Source,annotation:Annotation):Material{
 if(!sourceVersion(source,annotation))throw new Error('批注对应的资料版本不存在。');
 return {id:crypto.randomUUID(),sourceID:source.id,versionID:annotation.versionID,annotationID:annotation.id,annotationRevision:annotation.revision,quote:annotation.quote,text:annotation.text,parts:[...annotation.parts],aiScope:'none',origin:annotation.origin};
}
export function materialFromSource(source:Source,versionID?:string):Material{
 const version=sourceVersion(source,versionID?{versionID}:undefined);if(!version)throw new Error('资料没有可读版本。');
 return {id:crypto.randomUUID(),sourceID:source.id,versionID:version.id,annotationRevision:0,quote:'',text:'',parts:[],aiScope:'none'};
}
export function materialSnapshot(material:Material,sources:Source[],scope=material.aiScope):ReferenceSnapshot|undefined{
 if(scope==='none')return;
 const source=sources.find(s=>s.id===material.sourceID),version=source&&sourceVersion(source,material);
 if(!source||!version)throw new Error('引用资料的保存版本缺失，请先检查材料，不会改用其他版本。');
 const allParts=sourceParts(version),chosen=new Set(material.parts);
 const indices=allParts.flatMap((p,i)=>chosen.has(p.id)?[i]:[]);
 if(chosen.size&&indices.length!==chosen.size)throw new Error('引用位置无法定位，保留的摘录仍可读，请重新选择引用范围。');
 const parts=scope==='full'?allParts:indices.length?allParts.filter((_,i)=>indices.some(n=>Math.abs(n-i)<=1)):[];
 return {id:material.id,sourceID:source.id,title:version.document.title||source.title,author:version.author??source.author,url:version.url??source.url,versionID:version.id,at:version.at,quote:material.quote,annotationQuote:material.annotationQuote,note:material.text,annotationRevision:material.annotationRevision,origin:material.origin,scope,parts,allParts,selectedParts:[...material.parts],warning:version.warning||(/!\[|<img\b/i.test(version.document.content)?'本次模型仅接收文字与图片地址，不读取图片内容。':undefined)};
}
export function citedSnapshot(snapshot:ReferenceSnapshot,parts:string[]):ReferenceSnapshot{const chosen=(snapshot.allParts.length?snapshot.allParts:snapshot.parts).filter(p=>parts.includes(p.id));return {...snapshot,selectedParts:[...parts],quote:chosen.map(p=>p.text).join('\n\n'),annotationQuote:snapshot.annotationQuote||snapshot.quote};}
export function validReferenceUses(value:unknown,snapshots:ReferenceSnapshot[]):ReferenceUse[]{if(!Array.isArray(value))return [];return value.filter((v:any)=>v&&typeof v.id==='string'&&Array.isArray(v.parts)&&v.parts.length&&v.parts.every((p:unknown)=>typeof p==='string'&&snapshots.find(s=>s.id===v.id)?.parts.some(part=>part.id===p))&&(!v.paragraph||typeof v.paragraph==='string'&&v.paragraph.length<=2000)).map(v=>({id:v.id,parts:[...v.parts],paragraph:v.paragraph}));}
export function generatedMaterials(materials:Material[],doc:Document,uses:ReferenceUse[],snapshots:ReferenceSnapshot[]=[]){
 const normalize=(s:string)=>s.replace(/\s/g,'');
 let blocks:{anchor:DraftAnchor;text:string}[];
 if(doc.contentType==='blocknote'){const text=(n:any):string=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.text||text(n?.content||n?.children||[]);blocks=JSON.parse(doc.content||'[]').map((b:any)=>({anchor:{format:'blocknote',blockID:b.id},text:text(b)}));}
 else blocks=fromMarkdown(doc.content).children.map(n=>{const start=n.position!.start.offset!,end=n.position!.end.offset!;const raw=doc.content.slice(start,end);return {anchor:{format:'markdown' as const,text:raw,start},text:raw};});
 let result=[...materials];for(const use of uses){if(!use.paragraph)continue;const material=materials.find(m=>m.id===use.id),matches=blocks.filter(b=>normalize(b.text).includes(normalize(use.paragraph!)));if(!material||matches.length!==1)continue;const anchor=matches[0].anchor,snapshot=snapshots.find(s=>s.id===use.id);if(snapshot&&use.parts.some(id=>!snapshot.parts.some(p=>p.id===id)))continue;const derived=snapshot?citedSnapshot(snapshot,use.parts):undefined;const changed=use.parts.join(',')!==material.parts.join(',');if(changed&&!derived)continue;const item={...material,parts:[...use.parts],quote:derived?.quote||material.quote,annotationQuote:derived?.annotationQuote||material.annotationQuote,annotationID:changed?undefined:material.annotationID,anchor};if(!changed&&!result.some(m=>m.id===material.id&&m.anchor))result=result.map(m=>m.id===material.id?item:m);else if(!result.some(m=>m.sourceID===material.sourceID&&m.versionID===item.versionID&&m.annotationRevision===item.annotationRevision&&m.text===item.text&&m.quote===item.quote&&m.annotationQuote===item.annotationQuote&&m.parts.join(',')===use.parts.join(',')&&sameAnchor(m.anchor,anchor)))result.push({...item,id:crypto.randomUUID(),aiScope:'none'});}return result;
}
export function replyMaterials(existing:Material[],reply:AIMessage,doc:Document){const materials=[...existing],ids=new Map<string,string>();for(const snapshot of reply.materials||[]){const match=materials.find(m=>m.id===snapshot.id&&m.versionID===snapshot.versionID&&m.annotationRevision===snapshot.annotationRevision&&m.text===snapshot.note);if(match){ids.set(snapshot.id,match.id);continue;}const id=materials.some(m=>m.id===snapshot.id)?crypto.randomUUID():snapshot.id;ids.set(snapshot.id,id);materials.push({id,sourceID:snapshot.sourceID,versionID:snapshot.versionID,parts:[...snapshot.selectedParts],quote:snapshot.quote,annotationQuote:snapshot.annotationQuote,text:snapshot.note,annotationRevision:snapshot.annotationRevision,origin:snapshot.origin,aiScope:'none'});}return generatedMaterials(materials,doc,(reply.referenceUses||[]).map(use=>({...use,id:ids.get(use.id)||use.id})),(reply.materials||[]).map(s=>({...s,id:ids.get(s.id)||s.id})));}
export function referenceInput(snapshots:ReferenceSnapshot[]){return snapshots.map(s=>({资料编号:s.id,标题:s.title,作者:s.author,原链接:s.url,资料版本:s.versionID,收存时间:s.at,范围:s.scope==='full'?'全文':'所选摘录及前后各一段；整篇批注不自动附带全文',原文摘录:s.quote,批注:{来源:s.origin==='ai'?'AI 笔记':'作者自己的批注',对应原文:s.annotationQuote||s.quote,版本:s.annotationRevision,内容:s.note},原文:s.parts.map(p=>({位置:p.id,章节:p.section,正文:p.markdown})),...(s.warning?{未读取内容:s.warning}:{})}));}
export function annotationUpdate(source:Source,material:Material){return source.annotations.find(a=>a.id===material.annotationID&&a.revision>material.annotationRevision);}
export function updateAdoption(source:Source,material:Material):Material{const annotation=annotationUpdate(source,material);return annotation?{...adoptAnnotation(source,annotation),id:material.id,aiScope:material.aiScope,anchor:material.anchor}:material;}
export function anchorPosition(doc:Document,anchor:DraftAnchor):number|undefined{
 if(doc.contentType!==anchor.format)return;
 if(anchor.format==='blocknote'){const walk=(blocks:any[]):boolean=>blocks.some(b=>b.id===anchor.blockID||Array.isArray(b.children)&&walk(b.children));return walk(JSON.parse(doc.content||'[]'))?0:undefined;}
 if(doc.content.slice(anchor.start,anchor.start+anchor.text.length)===anchor.text)return anchor.start;
 const first=doc.content.indexOf(anchor.text);return first>=0&&doc.content.indexOf(anchor.text,first+1)<0?first:undefined;
}
export function sameAnchor(a:DraftAnchor|undefined,b:DraftAnchor|undefined){return !a&&!b||!!a&&!!b&&a.format===b.format&&(a.format==='blocknote'&&b.format==='blocknote'?a.blockID===b.blockID:a.format==='markdown'&&b.format==='markdown'&&a.text===b.text&&a.start===b.start);}
export function quotationChanged(doc:Document,record:QuoteRecord){if(record.anchor.format==='markdown')return anchorPosition(doc,record.anchor)===undefined;if(doc.contentType!=='blocknote')return true;let found:any;const find=(blocks:any[])=>blocks.forEach(b=>{if(b.id===(record.anchor as {blockID:string}).blockID)found=b;else if(b.children)find(b.children);});find(JSON.parse(doc.content||'[]'));return !found||JSON.stringify(found.content)!==record.original;}
export function publicCitation(source:Source,versionID?:string){const version=sourceVersion(source,versionID?{versionID}:undefined),label=[version?.author??source.author,version?.document.title||source.title].filter(Boolean).join(' · '),url=version?.url??source.url;return url?`[${label.replace(/[\[\]\\]/g,'')}](${encodeURI(url).replace(/[()]/g,c=>encodeURIComponent(c))})`:label;}
export function quoteMarkdown(material:Material,source:Source){if(!material.quote)throw new Error('请先选取要引用的原文。');return material.quote.split('\n').map(line=>'> '+line).join('\n')+'\n\n出处：'+publicCitation(source,material.versionID);}
export function addMaterials(note:Note,materials:Material[]):Note{return {...note,materials:[...(note.materials||[]),...materials.filter(m=>!(note.materials||[]).some(old=>old.sourceID===m.sourceID&&old.versionID===m.versionID&&old.annotationID===m.annotationID&&sameAnchor(old.anchor,m.anchor)))]};}
