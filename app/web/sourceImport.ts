import { parse } from 'parse5';
import { emptyDocument, mediaURLs, replaceMedia, type Document } from './model';
import { fileImage, native } from './bridge';

export function articleHTML(html:string,url:string):{title:string;author:string;markdown:string}{
 const tree:any=parse(html),nodes:any[]=[];
 const visit=(node:any)=>{nodes.push(node);node.childNodes?.forEach(visit);};visit(tree);
 const attr=(node:any,name:string)=>node.attrs?.find((a:any)=>a.name===name)?.value||'';
 const text=(node:any):string=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
 const byID=(id:string)=>nodes.find(n=>attr(n,'id')===id);
 const meta=(name:string)=>attr(nodes.find(n=>n.tagName==='meta'&&(attr(n,'name')===name||attr(n,'property')===name))||{},'content');
 const root=byID('js_content')||nodes.find(n=>n.tagName==='article')||nodes.find(n=>n.tagName==='main')||nodes.find(n=>n.tagName==='body');
 const absolute=(value:string)=>{try{if(!url&&!/^https?:/i.test(value))return /^[./]/.test(value)?value:'';const u=new URL(value,url||undefined);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
 const render=(node:any):string=>{
  if(node.nodeName==='#text')return node.value.replace(/\s+/g,' ');
  const tag=node.tagName;if(['script','style','nav','footer','header','form','button','iframe','noscript','svg'].includes(tag)||attr(node,'aria-hidden')==='true'||attr(node,'hidden'))return '';
  if(tag==='pre')return '\n\n```\n'+text(node).trimEnd()+'\n```\n\n';
  const children=(node.childNodes||[]).map(render).join('');
  if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+children.trim()+'\n\n';
  if(tag==='img'){const src=absolute(attr(node,'data-src')||attr(node,'src'));return src?'!['+attr(node,'alt').replace(/[\[\]]/g,'')+']('+src.replace(/[()]/g,c=>encodeURIComponent(c))+')':'';}
  if(tag==='a'){const href=absolute(attr(node,'href'));return href&&children.trim()?'['+children.trim()+']('+href.replace(/[()]/g,c=>encodeURIComponent(c))+')':children;}
  if(tag==='strong'||tag==='b')return '**'+children+'**';if(tag==='em'||tag==='i')return '*'+children+'*';if(tag==='code')return '`'+children+'`';
  if(tag==='br')return '\n';if(tag==='blockquote')return '\n\n'+children.trim().split('\n').map((line:string)=>'> '+line).join('\n')+'\n\n';
  if(tag==='li'){const ordered=node.parentNode?.tagName==='ol';const index=(node.parentNode?.childNodes||[]).filter((n:any)=>n.tagName==='li').indexOf(node)+1;return '\n'+(ordered?index+'. ':'- ')+children.trim();}if(tag==='ul'||tag==='ol')return '\n'+children+'\n';
  if(tag==='table'){
   const rows:any[]=[];const collect=(n:any)=>{if(n.tagName==='tr')rows.push(n);else n.childNodes?.forEach(collect);};collect(node);
   const values=rows.map(row=>(row.childNodes||[]).filter((n:any)=>['td','th'].includes(n.tagName)).map((n:any)=>(n.childNodes||[]).map(render).join('').trim().replace(/\|/g,'\\|').replace(/\n/g,' ')));
   const width=Math.max(0,...values.map(row=>row.length));if(!width)return children;
   const lines=values.map(row=>'| '+Array.from({length:width},(_,i)=>row[i]||'').join(' | ')+' |');lines.splice(1,0,'| '+Array(width).fill('---').join(' | ')+' |');return '\n\n'+lines.join('\n')+'\n\n';
  }
  return ['p','div','section','figure','figcaption','hr'].includes(tag)?'\n\n'+children.trim()+'\n\n':children;
 };
 return {title:(meta('og:title')||text(byID('activity-name')||nodes.find(n=>n.tagName==='h1')||nodes.find(n=>n.tagName==='title')||{})).trim(),author:(meta('author')||text(byID('js_name')||{})).trim(),markdown:render(root||tree).replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()};
}

export async function localizeSourceImages(markdown:string,files:File[]=[]){
 let document:Document={...emptyDocument(),contentType:'markdown',content:markdown};const mapping:Record<string,string>={};let missing=0;
 const urls=mediaURLs(document);
 for(const url of urls){
  if(url.startsWith('writer-asset://'))continue;
  try{
   if(/^https:\/\//i.test(url))mapping[url]=(await native('fetchSourceImage',{url})).url;
   else{const name=decodeURIComponent(url.split('/').pop()||'');const file=files.find(f=>f.name===name);if(!file)throw new Error();mapping[url]=await fileImage(file);}
  }catch{missing++;}
 }
 document=replaceMedia(document,mapping);
 return {markdown:document.content,warning:missing?`${missing} 张图片尚未收存；原地址保留，可补入图片后保存新版本。`:undefined};
}
