import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { native } from './bridge';
import { diffLines } from './diff';
import { Icon } from './Icons';
import Editor from './Editor';
import { proposalCopy, proposalLabel, type AIMessage } from './ai';

export function MarkdownText({text}:{text:string}){
 return <div className="ai-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url=>/^(?:https?:|writer-asset:|\/|#)/.test(url)?url:''} components={{a:({href,children})=><a href={href} onClick={e=>{e.preventDefault();if(href)void native('openURL',{url:href});}}>{children}</a>}}>{text}</ReactMarkdown></div>;
}

function ChangedText({text,other,kind}:{text:string;other:string;kind:'removed'|'added'}){
 let from=0,to=0;
 while(from<text.length&&from<other.length&&text[from]===other[from])from++;
 while(to<text.length-from&&to<other.length-from&&text[text.length-1-to]===other[other.length-1-to])to++;
 return <pre>{text.slice(0,from)}<mark className={kind}>{text.slice(from,text.length-to)}</mark>{text.slice(text.length-to)}</pre>;
}

export function AIReview({message,blocked,error,onApply,onReject,onCopy,onClose}:{message:AIMessage;blocked:boolean;error:string;onApply:(ids?:string[])=>void;onReject:(ids?:string[])=>void;onCopy:()=>void;onClose:()=>void}){
 const [view,setView]=useState<'diff'|'preview'>('diff');
 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[onClose]);
 const article=message.article,proposal=message.proposal;
 const previewDocument=useMemo(()=>proposal?proposalCopy(proposal):undefined,[proposal]);
 const pending=article?article.state==='pending':proposal?.changes.some(c=>c.state==='pending');
 const lines=useMemo(()=>article?diffLines(article.beforeMarkdown,article.markdown):[],[article?.beforeMarkdown,article?.markdown]);
 const title=article?.document.title||proposal?.base.title||'无标题文稿';
 const whole=article&&(!article.kind||article.kind==='article');
 return <section className="ai-review-space" aria-label="AI 修改审阅">
  <header className="review-heading"><div><small>{article?proposalLabel(article):'选段与表达修改'} · 先审阅，再写入</small><h2 title={title}>{title}</h2></div><button aria-label="关闭修改审阅" title="返回正文，保留建议" onClick={onClose}><Icon name="close"/></button></header>
  <div className="review-toolbar"><div role="group" aria-label="审阅视图"><button className={view==='diff'?'active':''} onClick={()=>setView('diff')}>修改对比</button><button className={view==='preview'?'active':''} onClick={()=>setView('preview')}>新版预览</button></div><span>{article?(article.state==='accepted'?'已接受':article.state==='skipped'?'已拒绝':'待审阅'):String(proposal?.changes.filter(c=>c.state==='pending').length||0)+' 处待审阅'}</span></div>
  <div className="review-scroll">
   {article?view==='preview'?<div className="review-article"><h1>{title}</h1><Editor key={message.id} noteID={article.noteID||message.id} doc={article.document} preview onChange={()=>{}} onError={()=>{}} onMedia={()=>{}} onInsertImage={()=>{}} onAI={()=>{}}/></div>:<>
    <div className="diff-columns diff-labels"><span>原文</span><span>建议版</span></div>
    <div className="diff-columns diff-titles"><span>{article.base?(article.base.title||'无标题文稿'):'空白文稿'}</span><span>{title}</span></div>
    <div className="line-diff">{lines.map((line,i)=><div className={`diff-columns diff-line ${line.kind}`} key={i}><pre>{line.kind!=='added'&&<><b>{line.kind==='removed'?'−':' '}</b>{line.text||' '}</>}</pre><pre>{line.kind!=='removed'&&<><b>{line.kind==='added'?'+':' '}</b>{line.text||' '}</>}</pre></div>)}</div>
   </>:view==='preview'&&previewDocument?<div className="review-article"><h1>{previewDocument.title||'无标题文稿'}</h1><p className="review-preview-hint">预览包含已接受与待审阅的修改，拒绝的内容保持原文。</p><Editor key={proposal!.changes.map(c=>c.state).join(',')} noteID={proposal!.noteID} doc={previewDocument} preview onChange={()=>{}} onError={()=>{}} onMedia={()=>{}} onInsertImage={()=>{}} onAI={()=>{}}/></div>:proposal?.changes.map((c,i)=><section className={`review-change ${c.state}`} key={c.id}>
    <header><span>修改 {i+1}</span><small>{c.state==='accepted'?'已接受':c.state==='skipped'?'已拒绝':'待审阅'}</small></header>
    <div className="diff-columns diff-labels"><span>原文</span><span>建议版</span></div><div className="diff-columns"><div><ChangedText text={c.before} other={c.after} kind="removed"/></div><div><ChangedText text={c.after} other={c.before} kind="added"/></div></div>
    {c.state==='pending'&&<div className="review-change-actions"><button disabled={blocked} onClick={()=>onReject([c.id])}>拒绝此处</button><button className="accept-change" disabled={blocked} onClick={()=>onApply([c.id])}>接受此处</button></div>}
   </section>)}
  </div>
  {error&&<div className="review-error" role="alert">{error}</div>}
  <footer className="review-footer"><small>{article?'接受后保留修改前版本，可在修改记录中撤销。':'只写入接受的修改，其余原文保留。'}</small><div><button disabled={blocked} onClick={onCopy}>另存新文稿</button><button disabled={blocked||!pending} onClick={()=>onReject()}>拒绝{whole?'整篇':article?'建议':'剩余'}</button><button className="primary" disabled={blocked||!pending||!!(article&&!article.noteID)} onClick={()=>onApply()}>{whole?'接受整篇':article?.kind==='insert'?'接受插入':article?'接受修改':'接受全部'}</button></div></footer>
 </section>;
}
