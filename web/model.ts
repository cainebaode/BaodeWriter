import { fromMarkdown } from 'mdast-util-from-markdown';
import { parseFragment } from 'parse5';
import type { AIRevision, AISession } from './ai';

export type Document = {title:string;slug:string;description:string;content:string;contentType:'markdown'|'blocknote';coverImage:string;tags:string[]};
export type Remote = {id:string;document:Document;version:string;revision:number;publishedRevision:number;status:string;publishedAt:string|null;updatedAt:string;createdAt:string;publicSlug:string;deleted?:boolean};
export type Note = {id:string;document:Document;displayDate:string;createdAt:string;updatedAt:string;base:Remote|null;syncedKey?:string;assets:Record<string,string>;conflict?:{remote:Remote|null;detectedAt:string};error?:string;archived?:boolean;trashedAt?:string;siteURL?:string;resourceWarning?:string;folderId?:string;parentId?:string;aiRevisions?:AIRevision[]};
export type Folder = {id:string;name:string};
export type Library = {schema:1;notes:Note[];folders?:Folder[];aiSessions?:Record<string,AISession>};
export type Heading = {id:string;level:number;text:string;offset?:number};
export function documentHeadings(doc:Document):Heading[]{
 const result:Heading[]=[];
 if(doc.contentType==='markdown'){
  const text=(node:any):string=>node.type==='text'||node.type==='inlineCode'?node.value:(node.children||[]).map(text).join('');
  const walk=(node:any)=>{if(node.type==='heading'){const title=text(node).trim();if(title)result.push({id:`md-${node.position.start.offset}`,level:node.depth,text:title,offset:node.position.start.offset});}node.children?.forEach(walk);};walk(fromMarkdown(doc.content));
 }else{try{const walk=(blocks:any[])=>blocks.forEach(block=>{if(block.type==='heading'){const text=plainText({...doc,content:JSON.stringify([{content:block.content}])}).trim();if(text)result.push({id:block.id,level:Number(block.props?.level)||1,text});}if(Array.isArray(block.children))walk(block.children);});walk(JSON.parse(doc.content||'[]'));}catch{/* Original content stays available in the editor. */}}
 return result;
}
export function removeFolder(library:Library,id:string):Library{return {...library,folders:(library.folders||[]).filter(f=>f.id!==id),notes:library.notes.map(n=>n.folderId===id?{...n,folderId:undefined}:n)};}
export function trashNotes(library:Library,ids:string[],at:string):Library{const selected=new Set(ids);return {...library,notes:library.notes.map(n=>selected.has(n.id)&&!n.trashedAt?{...n,trashedAt:at}:n)};}
export function restoreTrashedNote(library:Library,id:string):Library{return {...library,notes:library.notes.map(n=>{if(n.id!==id)return n;const {trashedAt,...rest}=n;return rest;})};}
export function deleteTrashedNotes(library:Library,ids:string[]):Library{
 if(ids.some(id=>!library.notes.find(n=>n.id===id)?.trashedAt))throw new Error('只能彻底删除废纸篓中的文稿。');
 const selected=new Set(ids);return {...library,notes:library.notes.filter(n=>!selected.has(n.id)).map(n=>n.parentId&&selected.has(n.parentId)?{...n,parentId:undefined}:n),...(library.aiSessions?{aiSessions:Object.fromEntries(Object.entries(library.aiSessions).filter(([id])=>!selected.has(id)))}:{})};
}
export const emptyDocument = ():Document => ({title:'',slug:'',description:'',content:'[]',contentType:'blocknote',coverImage:'',tags:[]});
export function dateValue(value:string) { return value.slice(0,10); }
export function chosenDate(value:string) { return `${value}T12:00:00.000Z`; }
export function newNote():Note { const now = new Date().toISOString(); const localDay = new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); return {id:crypto.randomUUID(),document:emptyDocument(),displayDate:chosenDate(localDay),createdAt:now,updatedAt:now,base:null,assets:{}}; }
export function noteKey(note:Pick<Note,'document'|'displayDate'>) { const d=note.document;return JSON.stringify([d.title,d.slug,d.description,d.content,d.contentType,d.coverImage,d.tags,note.displayDate]); }
export function dirty(note:Note) { return note.syncedKey !== noteKey(note); }
export function plainText(doc:Document):string { if(doc.contentType==='markdown') return doc.content; try {const walk=(x:unknown):string => typeof x==='string'?x:Array.isArray(x)?x.map(walk).join(' '):x&&typeof x==='object'?['text','content','children','rows','cells'].map(k=>walk((x as Record<string,unknown>)[k])).join(' '):'';return walk(JSON.parse(doc.content)).replace(/\s+/g,' ').trim();}catch{return doc.content;} }
function markdownMedia(source:string):{url:string;start:number;end:number}[]{
 const found:{url:string;start:number;end:number}[]=[];
 const refs=new Set<string>();const nodes:any[]=[];
 const walk=(node:any)=>{if(node.type==='imageReference')refs.add(node.identifier);if(['image','html','definition'].includes(node.type))nodes.push(node);node.children?.forEach(walk);};
 walk(fromMarkdown(source));
 const ranges:{type:string;start:number;end:number}[]=[];const definitions=new Set<string>();
 for(const node of nodes){
  if(node.type==='definition'){if(!refs.has(node.identifier)||definitions.has(node.identifier))continue;definitions.add(node.identifier);}
  if(node.type==='html'){const html=(element:any)=>{const location=element.tagName==='img'&&element.sourceCodeLocation?.attrs?.src;if(location)ranges.push({type:'html',start:node.position.start.offset+location.startOffset,end:node.position.start.offset+location.endOffset});element.childNodes?.forEach(html);};html(parseFragment(node.value,{sourceCodeLocationInfo:true}));}
  else ranges.push({type:node.type,start:node.position.start.offset,end:node.position.end.offset});
 }
 for(const [type,pattern] of [['image',/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g],['html',/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi],['definition',/^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm]] as const){
  for(const m of source.matchAll(pattern)){const url=type==='definition'?(m[2]||m[3]):(m[1]||m[2]);const start=m.index!+m[0].lastIndexOf(url);const end=start+url.length;if(ranges.some(r=>r.type===type&&start>=r.start&&end<=r.end))found.push({url,start,end});}
 }return found;
}
export function mediaURLs(doc:Document):string[] {const urls = new Set<string>(); if(doc.coverImage) urls.add(doc.coverImage); if(doc.contentType==='blocknote') {const walk=(value:any)=>{if(Array.isArray(value)) value.forEach(walk); else if(value&&typeof value==='object'){if(['image','video','audio','file'].includes(value.type)&&value.props?.url)urls.add(value.props.url); if(value.children)walk(value.children);}};walk(JSON.parse(doc.content||'[]'));}else{markdownMedia(doc.content).forEach(m=>urls.add(m.url));}return [...urls];}
export function replaceMedia(doc:Document, mapping:Record<string,string>):Document {let content=doc.content; if(doc.contentType==='blocknote'){const blocks=JSON.parse(content||'[]'); const walk=(value:any)=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){if(['image','video','audio','file'].includes(value.type)&&mapping[value.props?.url])value.props.url=mapping[value.props.url];if(value.children)walk(value.children);}};walk(blocks);content=JSON.stringify(blocks);}else{for(const m of markdownMedia(content).sort((a,b)=>b.start-a.start))if(mapping[m.url])content=content.slice(0,m.start)+mapping[m.url]+content.slice(m.end);}return {...doc,content,coverImage:mapping[doc.coverImage]||doc.coverImage};}
export function searchable(note:Note) { return [note.document.title,plainText(note.document),...note.document.tags,dateValue(note.displayDate)].join(' ').toLowerCase(); }
export function publicationDocument(doc:Document, mapping:Record<string,string>, site:string):Document {const published=replaceMedia(doc,mapping);const absolute:Record<string,string>={};for(const url of mediaURLs(published)){if(!url.startsWith('/uploads/'))absolute[url]=new URL(url,site+'/').href;}return replaceMedia(published,absolute);}

