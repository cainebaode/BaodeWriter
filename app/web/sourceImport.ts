import { parse } from 'parse5';
import { Readability } from '@mozilla/readability';
import { emptyDocument, mediaURLs, replaceMedia, type Document } from './model';
import { fileImage, native } from './bridge';

export function isWeChatArticleURL(value:string):boolean{try{return new URL(value).hostname==='mp.weixin.qq.com';}catch{return false;}}

export function articleHTML(html:string,url:string,requireArticle=true):{title:string;author:string;markdown:string}{
 const tree:any=parse(html),nodes:any[]=[];
 const visit=(node:any)=>{nodes.push(node);node.childNodes?.forEach(visit);};visit(tree);
 const attr=(node:any,name:string)=>node.attrs?.find((a:any)=>a.name===name)?.value||'';
 const text=(node:any):string=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
 const byID=(id:string)=>nodes.find(n=>attr(n,'id')===id);
 const meta=(name:string)=>attr(nodes.find(n=>n.tagName==='meta'&&(attr(n,'name')===name||attr(n,'property')===name))||{},'content');
 const root=byID('js_content')||nodes.find(n=>n.tagName==='article')||nodes.find(n=>n.tagName==='main')||nodes.find(n=>n.tagName==='body');
 const absolute=(value:string)=>{try{if(!url&&!/^https?:/i.test(value))return /^[./]/.test(value)?value:'';const u=new URL(value,url||undefined);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
 const render=(node:any):string=>{
  if(node.nodeName==='#text')return node.value.replace(/\s+/g,' ').replace(/([\\*])/g,'\\$1');
  const tag=node.tagName;if(['script','style','nav','footer','header','form','button','iframe','noscript','svg'].includes(tag)||attr(node,'aria-hidden')==='true'||attr(node,'hidden'))return '';
  if(tag==='pre')return '\n\n```\n'+text(node).trimEnd()+'\n```\n\n';
  const children=(node.childNodes||[]).map(render).reduce((value:string,part:string)=>value.endsWith('**')&&part.startsWith('**')?value.slice(0,-2)+part.slice(2):value+part,'');
  if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+children.trim()+'\n\n';
  if(tag==='img'){const src=absolute(attr(node,'data-src')||attr(node,'src'));return src?'!['+attr(node,'alt').replace(/[\[\]]/g,'')+']('+src.replace(/[()]/g,c=>encodeURIComponent(c))+')':'';}
  if(tag==='a'){const href=absolute(attr(node,'href'));return href&&children.trim()?'['+children.trim()+']('+href.replace(/[()]/g,c=>encodeURIComponent(c))+')':children;}
  if(['strong','b','em','i'].includes(tag)){
   const bold=tag==='strong'||tag==='b';let parent=node.parentNode;
   while(parent){if((bold?['strong','b']:['em','i']).includes(parent.tagName))return children;parent=parent.parentNode;}
   const marker=bold?'**':'*';return children.split(/(\n{2,})/).map((part:string)=>part.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_all:string,leading:string,value:string,trailing:string)=>value?leading+(/^[\p{P}\p{S}]/u.test(value)?' ':'')+marker+value+marker+(/[\p{P}\p{S}]$/u.test(value)?' ':'')+trailing:part)).join('');
  }
  if(tag==='code')return '`'+text(node)+'`';
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
 const title=(meta('og:title')||text(byID('activity-name')||nodes.find(n=>n.tagName==='h1')||nodes.find(n=>n.tagName==='title')||{})).trim(),markdown=render(root||tree).replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 if(requireArticle&&isWeChatArticleURL(url)&&(!byID('js_content')||!title||!markdown))throw new Error('尚未读到公众号正文，请在应用内打开文章并完成页面验证。');
 return {title,author:(meta('author')||text(byID('js_name')||{})).trim(),markdown};
}

export function readableArticle(html:string,url:string){
 if(isWeChatArticleURL(url))return articleHTML(html,url);
 const document=new DOMParser().parseFromString(html,'text/html'),base=document.createElement('base');base.href=url;document.head.prepend(base);
 const article=new Readability(document).parse();
 if(!article?.content)throw new Error('暂未提取到文章正文，请在原网页完成加载后重试。');
 return {...articleHTML(article.content,url,false),title:article.title||'',author:article.byline||''};
}

export async function localizeSourceImages(markdown:string,files:File[]=[],pageURL=''){
 let document:Document={...emptyDocument(),contentType:'markdown',content:markdown};const mapping:Record<string,string>={};let missing=0;
 const urls=mediaURLs(document);
 for(const url of urls){
  if(url.startsWith('writer-asset://'))continue;
  try{
   if(/^https:\/\//i.test(url))mapping[url]=(await native('fetchSourceImage',{url,pageURL})).url;
   else{const name=decodeURIComponent(url.split('/').pop()||'');const file=files.find(f=>f.name===name);if(!file)throw new Error();mapping[url]=await fileImage(file);}
  }catch{missing++;}
 }
 document=replaceMedia(document,mapping);
 return {markdown:document.content,warning:missing?`${missing} 张图片尚未收存；原地址保留，可补入图片后保存新版本。`:undefined};
}
