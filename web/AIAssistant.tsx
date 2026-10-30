import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { native } from './bridge';
import { Disclosure, Presence, motionTime } from './Motion';
import { AIReview, MarkdownText } from './AIReview';
import { documentMarkdown, markdownBlocks } from './markdown';
import { emptyDocument, type Document, type Note } from './model';
import { applyArticle, applyProposal, buildRequest, composeWriting, continuedSelection, makeProposal, parseWritingResponse, proposalCopy, proposalLabel, providers, selectionAfterWriting, taskLabels, taskPrompts, type AIConfiguration, type AIMessage, type AISelection, type AISession, type AISettings, type AIScope, type AITask } from './ai';

const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const emptySettings:AISettings={configurations:[],defaultID:''};
export type AICommit=(id:string,expected:Document,next:Document,label:string,key:string,messageID:string,patch:Partial<AIMessage>)=>Promise<void>;

export function AISettingsDialog({onClose,onSaved}:{onClose:()=>void;onSaved:(settings:AISettings)=>void}){
 const [settings,setSettings]=useState<AISettings>(emptySettings),[form,setForm]=useState<AIConfiguration>(()=>fresh('deepseek')),[secret,setSecret]=useState('');
 const [working,setWorking]=useState(false),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false);
 const request=useRef('');
 function fresh(provider:string):AIConfiguration{const p=providers.find(p=>p.id===provider)!;return {id:crypto.randomUUID(),provider,name:p.name,baseURL:p.baseURL,model:p.model};}
 function receive(value:AISettings){setSettings(value);onSaved(value);}
 useEffect(()=>{void native<AISettings>('aiLoad').then(value=>{receive(value);if(value.configurations.length)setForm(value.configurations.find(c=>c.id===value.defaultID)||value.configurations[0]);setLoaded(true);}).catch(e=>setNotice(errorText(e)));return()=>{if(request.current)void native('aiCancel',{requestID:request.current}).catch(()=>{});};},[]);
 async function save(test=false){if(working)return;setWorking(true);setNotice('');try{receive(await native('aiSave',{configuration:form,apiKey:secret}));setSecret('');if(test){const id=crypto.randomUUID();request.current=id;await native('aiTest',{configurationID:form.id,requestID:id});setNotice('连接成功，模型已返回完整文字。');}else setNotice('已保存，密钥留在系统钥匙串。');}catch(e){setNotice(errorText(e));}finally{request.current='';setWorking(false);}}
 const preset=providers.find(p=>p.id===form.provider);
 return <div className="overlay"><section className="dialog ai-settings" role="dialog" aria-modal="true" aria-label="应用设置 · AI 服务"><header><h2>应用设置 · AI 服务</h2><button aria-label="关闭 AI 设置" onClick={onClose}>×</button></header>
 <p>配置你自己的服务与模型。发送时只使用当前选择的配置。</p>
 <div className="ai-config-list">{settings.configurations.map(c=><button disabled={working} className={form.id===c.id?'pressed':''} key={c.id} onClick={()=>{setForm(c);setSecret('');setNotice('');}}>{c.name}{settings.defaultID===c.id?' · 默认':''}</button>)}<button disabled={working||!loaded} onClick={()=>{setForm(fresh('deepseek'));setSecret('');setNotice('');}}>＋ 添加服务</button></div>
 <fieldset disabled={working||!loaded}><label>服务商<select value={form.provider} onChange={e=>{setForm(fresh(e.target.value));setSecret('');setNotice('');}}>{providers.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
 <label>配置名称<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
 <label>接口地址<input value={form.baseURL} placeholder="https://…/v1" onChange={e=>setForm({...form,baseURL:e.target.value})}/></label>
 <label>模型名称<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})} placeholder={form.provider==='doubao'?'填写已开通的模型 ID 或推理接入点 ID':'填写服务商提供的模型名称'}/></label>
 <label>API Key<input type="password" autoComplete="off" value={secret} placeholder={settings.configurations.some(c=>c.id===form.id)?'已保存；留空保留原密钥':'填写服务商 API Key'} onChange={e=>setSecret(e.target.value)}/></label>
 </fieldset>
 <p className="hint">模型须已在服务商处开通。通义千问请使用与密钥地域一致的地址；更换地址须重新填写密钥。{preset?.docs&&<button className="text-link" onClick={()=>void native('openURL',{url:preset.docs})}>查看官方文档 ↗</button>}</p>
 {notice&&<p className="ai-status" role="status">{notice}</p>}
 <div className="dialog-actions"><button disabled={working||!loaded} onClick={()=>void save()}>保存</button><button className="primary" disabled={working||!loaded} onClick={()=>void save(true)}>{working?'正在处理…':'保存并测试连接'}</button>
 {settings.configurations.some(c=>c.id===form.id)&&<><button disabled={working} onClick={async()=>{try{receive(await native('aiDefault',{id:form.id}));setNotice('已设为默认服务。');}catch(e){setNotice(errorText(e));}}}>设为默认</button><button disabled={working} onClick={async()=>{if(!window.confirm(`移除「${form.name}」的配置与密钥？文稿和聊天记录保留。`))return;try{receive(await native('aiRemove',{id:form.id}));setForm(fresh('deepseek'));setSecret('');setNotice('已移除配置与密钥。');}catch(e){setNotice(errorText(e));}}}>移除</button></>}
 {working&&request.current&&<button onClick={()=>void native('aiCancel',{requestID:request.current})}>停止测试</button>}</div></section></div>;
}

type Props={note?:Note;selection:AISelection|null;open:boolean;width:number;disabled:boolean;sessions:Record<string,AISession>;settingsVersion:number;onSession:(key:string,update:(session:AISession)=>AISession)=>void;onCommit:AICommit;onNew:(doc:Document,brief?:string)=>Promise<void>;onUndo:(id:string,revisionID:string)=>Promise<void>;onClose:()=>void;onSettings:()=>void};
export function AIAssistant({note,selection,open,width,disabled,sessions,settingsVersion,onSession,onCommit,onNew,onUndo,onClose,onSettings}:Props){
 const [settings,setSettings]=useState<AISettings>(emptySettings),[free,setFree]=useState(false),[error,setError]=useState(''),[historyOpen,setHistoryOpen]=useState(false);
 const [running,setRunning]=useState<{id:string;key:string;label:string;model:string}|null>(null),runningRef=useRef<typeof running>(null);
 const [committing,setCommitting]=useState(false),commitLock=useRef(false),scroll=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const [reviewID,setReviewID]=useState('');
 const key=free||!note?'free':note.id,session=sessions[key]||{messages:[]},task=session.task||'chat',scope=session.scope||(note&&!free?'full':'chat');
 const activeKey=useRef(key);activeKey.current=key;
 const review=session.messages.find(m=>m.id===reviewID);
 const reviewHost=document.getElementById('ai-review-space');
 const config=settings.configurations.find(c=>c.id===settings.defaultID);
 const previousSelectionProposal=[...session.messages].reverse().find(m=>m.proposal?.selection?.id===selection?.id&&m.proposal?.selection)?.proposal;
 const selectionSource=previousSelectionProposal?.selection?{...previousSelectionProposal.selection,noteID:previousSelectionProposal.noteID,document:previousSelectionProposal.base}:selection;
 const selectionArticle=[...session.messages].reverse().find(m=>m.article?.selection?.id===selection?.id&&m.article?.state==='accepted')?.article;
 const availableSelection=selectionArticle?.selection&&note&&selectionArticle.noteID===note.id&&selectionArticle.document.content===note.document.content&&selectionArticle.document.contentType===note.document.contentType?{...selectionArticle.selection,document:note.document}:selectionSource&&note&&selectionSource.noteID===note.id?continuedSelection(selectionSource,note.document,previousSelectionProposal):undefined;
 const setComposer=(patch:Partial<AISession>)=>onSession(key,s=>({...s,...patch}));
 const blocked=disabled||committing;
 useEffect(()=>{void native<AISettings>('aiLoad').then(setSettings).catch(e=>setError(errorText(e)));},[settingsVersion]);
 useEffect(()=>{if(selection){setFree(false);onSession(selection.noteID,s=>({...s,task:'selection',scope:'selection',draft:taskPrompts.selection}));setError('');requestAnimationFrame(()=>input.current?.focus());}},[selection]);
 useEffect(()=>{setError('');setReviewID('');},[key]);
 useEffect(()=>{if(!open){setReviewID('');setHistoryOpen(false);}},[open]);
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[open]);
 useEffect(()=>{if(!historyOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setHistoryOpen(false);}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[historyOpen]);
 useEffect(()=>{if(disabled)stop();},[disabled]);
 useEffect(()=>{scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'});},[key,session.messages.length,running]);
 function choose(next:AITask){const documentTask=!!note&&(!['write','outline'].includes(next)||!free);if(documentTask)setFree(false);onSession(documentTask?note!.id:key,s=>({...s,task:next,scope:documentTask?'full':'chat',draft:taskPrompts[next]}));setError('');requestAnimationFrame(()=>input.current?.focus());}
 function stop(){const current=runningRef.current;if(!current)return;runningRef.current=null;setRunning(null);void native('aiCancel',{requestID:current.id}).catch(e=>setError(errorText(e)));}
 async function send(){
  if(runningRef.current||blocked)return;
  if(!config){onSettings();return;}
  const prompt=(session.draft||'').trim();if(!prompt)return;
  let sentID='';
  try{
   if((task==='polish'||task==='selection'||scope==='full')&&(!note||free))throw new Error('请切换到当前文稿后使用此功能。');
   if(scope==='selection'&&!availableSelection)throw new Error('请先选择正文文字，再点「AI 润色」。');
   if(task==='selection'&&!availableSelection)throw new Error('请重新选择需要修改的文字。');
   const base=note?structuredClone(note.document):undefined;
   const request=buildRequest(task,prompt,base,scope,availableSelection,session.messages,session.brief);
   const id=crypto.randomUUID(),state={id,key,label:free?'独立构思':note?.document.title||'无标题文稿',model:config.name+' · '+config.model};
   sentID=id;runningRef.current=state;setRunning(state);setError('');
   onSession(key,s=>({...s,messages:[...s.messages,{id:crypto.randomUUID(),role:'user',text:prompt,at:new Date().toISOString(),context:scope==='full'?'当前全文':scope==='selection'?'选中内容':'仅聊天',reference:request.reference}]}));
   const result=await native<{content:string}>('aiRequest',{requestID:id,configurationID:config.id,messages:request.messages});
   if(runningRef.current?.id!==id)return;
   const reply:AIMessage={id:crypto.randomUUID(),role:'assistant',text:result.content,at:new Date().toISOString(),model:state.model};
   const value=parseWritingResponse(result.content),limited=scope==='selection'||task==='selection';
   reply.text=value.reply;
   if(value.article||value.edits?.length||value.insertion){
    if(value.article&&limited)throw new Error('本次只允许修改选段，AI 返回了全文。请取消选段后发起完整写作。');
    if(value.edits?.length&&!request.workingDocument)throw new Error('请先打开要修改的文稿。');
    const target=!free&&scope!=='chat'?base:undefined;
    let document:Document;
    if(value.article){
     document={...(request.workingDocument||emptyDocument()),title:value.article.title,content:value.article.markdown,contentType:'markdown'};
     if(target?.contentType==='blocknote'){document.content=JSON.stringify(await markdownBlocks(value.article.markdown));document.contentType='blocknote';}
    }else{
     const source=request.workingDocument||{...emptyDocument(),title:value.insertion?.title||'写作草稿',contentType:'markdown' as const,content:''};
     document=await composeWriting(source,value,limited?request.workingSelection:undefined,markdownBlocks);
    }
    reply.article={noteID:target?note!.id:undefined,base:target,document,markdown:await documentMarkdown(document),beforeMarkdown:target?await documentMarkdown(target):'',kind:value.article?'article':value.edits?.length?'edit':'insert',...(limited&&request.workingSelection?{selection:selectionAfterWriting(request.workingSelection,document,value.edits?.length?'edit':'insert')} :{}),state:'pending'};
   }
   if(value.changes?.length){
    if(!note||!request.units.length||!request.workingDocument)throw new Error('请先打开要修改的文稿或选择正文。');
    const proposal=makeProposal(note.id,request.workingDocument,request.units,JSON.stringify(value),limited?request.workingSelection:undefined);
    if(request.workingDocument!==base){
     const document=proposalCopy(proposal);
     const mapped=limited&&request.workingSelection?continuedSelection(request.workingSelection,document,{...proposal,changes:proposal.changes.map(c=>({...c,state:'accepted'}))}):undefined;
     reply.article={noteID:note.id,base,document,markdown:await documentMarkdown(document),beforeMarkdown:await documentMarkdown(base!),kind:'edit',...(mapped?{selection:{id:mapped.id,noteID:mapped.noteID,ranges:mapped.ranges,text:mapped.text}}:{}),state:'pending'};
    }else reply.proposal=proposal;
   }
   if(value.titles?.length){reply.titles=value.titles;reply.titleBase=base?.title||'';}
   if(!reply.text)reply.text=reply.article?'已整理好，可以在正文中预览。':reply.proposal?'已整理好修改建议。':reply.titles?'这几个标题可以参考。':'这部分暂时不需要调整。';
   if(runningRef.current?.id!==id)return;
   onSession(key,s=>({...s,brief:s.brief===session.brief?(value.brief??s.brief):s.brief,task:'chat',scope:limited?'selection':note&&!free?'full':'chat',draft:s.draft===session.draft?'':s.draft,messages:[...s.messages,reply]}));
   if(activeKey.current===key&&(reply.article||reply.proposal?.changes.length)){setReviewID(reply.id);}
  }catch(e){if(!sentID||runningRef.current?.id===sentID)setError(errorText(e));}finally{if(sentID&&runningRef.current?.id===sentID){runningRef.current=null;setRunning(null);}}
 }
 async function action(work:()=>Promise<void>){if(commitLock.current||disabled)return;commitLock.current=true;setCommitting(true);setError('');try{await work();}catch(e){setError(errorText(e));}finally{commitLock.current=false;setCommitting(false);}}
 function updateMessage(id:string,patch:Partial<AIMessage>){onSession(key,s=>({...s,messages:s.messages.map(m=>m.id===id?{...m,...patch}:m)}));}
 function apply(message:AIMessage,ids:string[]){void action(async()=>{if(!note||free)throw new Error('请回到对应文稿再采纳。');const result=applyProposal(note.document,note.id,message.proposal!,ids);await onCommit(note.id,note.document,result.document,'AI 润色',key,message.id,{proposal:result.proposal});});}

 const reference=scope==='selection'?'只修改选中文字；会参考所在段落与前后各两段。':note&&!free?'参考当前文章与本篇写作约定；生成后先审阅，再写入。':'独立构思会话，不读取当前文稿。';
 return <><aside className="ai-panel glass-panel" aria-hidden={!open} inert={!open} style={{width}} aria-label="AI 写作助手">
 <header className="ai-header"><span>写作助手</span><div><Disclosure className="ai-more" label="助手更多选项" title={config?config.name+' · '+config.model:'AI 设置'} summary="···"><div className="ai-more-menu"><small>{config?config.name+' · '+config.model:'尚未配置 AI'}</small><button onClick={onSettings}>AI 服务设置</button><button disabled={blocked||!!running} onClick={()=>{if(window.confirm('清空本会话记录，开始新对话？正文与写作约定保留。'))onSession(key,s=>({messages:[],brief:s.brief}));}}>新对话</button><button disabled={blocked} onClick={()=>setFree(!free)}>{free?'回到当前文稿':'独立构思'}</button><button disabled={!note} onClick={()=>setHistoryOpen(true)}>修改记录与恢复</button>{(['polish','title'] as AITask[]).map(t=><button key={t} disabled={blocked||!!running||!note} onClick={()=>choose(t)}>{taskLabels[t]}</button>)}</div></Disclosure><button className="ai-close" aria-label="收起 AI 助手" onClick={onClose}>×</button></div></header>
 <div className="ai-tools">{(['write','rewrite','structure','outline'] as AITask[]).map(t=><button key={t} disabled={blocked||!!running||(!note&&!['write','outline'].includes(t))} onClick={()=>choose(t)}>{taskLabels[t]}</button>)}</div>
 <div className="ai-conversation" ref={scroll}>
 {!session.messages.length&&<div className="ai-welcome"><p>从一个想法，写成一篇文章。</p><small>可以聊一个想法，也可以直接让我写。<br/>说“展开这一节”“接着写”或“再朴素一点”。</small></div>}
 {session.messages.map(m=><section className={`ai-message ${m.role}`} key={m.id}>
 {m.role==='user'?<><pre className="ai-text">{m.text}</pre>{m.context==='选中内容'&&<small>针对选中文字</small>}</>:<>
 <MarkdownText text={m.text}/>
 {(m.proposal?.changes.length||m.article)&&<button className="ai-review-card" onClick={()=>{setError('');setReviewID(m.id);}}><span>{m.article?m.article.document.title:`${m.proposal!.changes.length} 处修改建议`}</span><small>{m.article?(m.article.state==='accepted'?'已接受':m.article.state==='skipped'?'已拒绝':proposalLabel(m.article)+' · 待审阅'):`${m.proposal!.changes.filter(c=>c.state==='pending').length} 处待审阅`} · 在正文区查看 →</small></button>}

 {m.titles&&<div className="ai-title-list">{m.titles.map((title,i)=><div key={i}><p>{title}</p><button disabled={blocked||m.titleApplied||!note||free} onClick={()=>void action(async()=>{if(note!.document.title!==m.titleBase)throw new Error('标题已变化，请让我重新拟一版。');await onCommit(note!.id,note!.document,{...note!.document,title},'AI 标题',key,m.id,{titleApplied:true});})}>{m.titleApplied?'已采用':'采用标题'}</button></div>)}</div>}
 </>}
 </section>)}
 {running&&<p className="ai-generating" role="status">正在想…<button onClick={stop}>停止</button></p>}
 {error&&<div className="ai-error" role="alert">{error}<button aria-label="关闭 AI 提示" onClick={()=>setError('')}>×</button></div>}

 </div>
 <div className="ai-composer">
 <div className="ai-context" title={reference}>{scope==='selection'?<><span>↳ {availableSelection?.text||'选段已变化，请重新选择或取消引用'}</span><button aria-label="取消选段引用" disabled={!!running} onClick={()=>setComposer({task:'chat',scope:note&&!free?'full':'chat'})}>×</button></>:<span>{free||!note?'独立构思':scope==='chat'?'聊想法':note.document.title||'当前文稿'}</span>}</div>
 <Disclosure section className="ai-brief" key={key} summary={session.brief?'本篇写作约定':'写作约定 · 可选'}><textarea aria-label="本篇写作约定" rows={4} maxLength={3000} disabled={blocked||!!running} value={session.brief||''} placeholder="交流中逐步记住主题、读者与风格，也可以在这里直接修改。" onChange={e=>setComposer({brief:e.target.value})}/><small>只记录这次创作的要求；新对话继续保留，可随时清空。</small></Disclosure>
 <div className="ai-input-box"><textarea ref={input} aria-label="AI 写作要求" rows={2} disabled={!!running||blocked} placeholder="写什么、写给谁，或希望怎样修改…" value={session.draft||''} onChange={e=>setComposer({draft:e.target.value})} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();void send();}}}/><button className="ai-send" aria-label={running?'停止生成':'发送'} title="⌘ Enter 发送" disabled={blocked||(!running&&!(session.draft||'').trim())} onClick={()=>running?stop():void send()}>{running?'□':'↑'}</button></div></div>
 {createPortal(<Presence show={historyOpen} className="modal-presence" duration={motionTime.dialog}><div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryOpen(false);}}><section className="dialog" role="dialog" aria-modal="true" aria-label="AI 修改记录"><header><h2>修改记录与恢复</h2><button aria-label="关闭修改记录" onClick={()=>setHistoryOpen(false)}>×</button></header><div className="ai-revisions">{!note?.aiRevisions?.length&&<p>采纳修改后，会在这里保留修改前的版本。</p>}{[...(note?.aiRevisions||[])].reverse().map(r=><div key={r.id}><small>{r.label} · {new Date(r.at).toLocaleString()}{r.undone?' · 已撤销':''}</small><div className="ai-actions"><button disabled={blocked||r.undone} onClick={()=>void action(()=>onUndo(note!.id,r.id))}>撤销这次修改</button><button disabled={blocked} onClick={()=>void action(()=>onNew({...r.before,title:r.before.title+' · 修改前保留版'}))}>恢复为新文稿</button></div></div>)}</div></section></div></Presence>,document.body)}
 </aside>
 {reviewHost&&createPortal(<Presence show={!!(open&&review)} className="review-presence" duration={motionTime.dialog}>{review&&<AIReview key={review.id} message={review} blocked={blocked} error={error} onClose={()=>setReviewID('')} onApply={ids=>{
  if(review.article)void action(async()=>{if(!note||free)throw new Error('请另存为新文稿，或回到原文稿再接受。');const next=applyArticle(note.document,note.id,review.article!);await onCommit(note.id,note.document,next,'AI '+proposalLabel(review.article!),key,review.id,{article:{...review.article!,state:'accepted'}});});
  else apply(review,ids||review.proposal!.changes.filter(c=>c.state==='pending').map(c=>c.id));
 }} onReject={ids=>{if(review.article)updateMessage(review.id,{article:{...review.article,state:'skipped'}});else updateMessage(review.id,{proposal:{...review.proposal!,changes:review.proposal!.changes.map(c=>c.state==='pending'&&(!ids||ids.includes(c.id))?{...c,state:'skipped'}:c)}});}} onCopy={()=>void action(()=>onNew(review.article?review.article.document:{...proposalCopy(review.proposal!),title:review.proposal!.base.title+' · AI 建议版'},session.brief))}/>}</Presence>,reviewHost)}

 </>;
}
