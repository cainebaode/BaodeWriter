import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppearanceMode } from './appearance';
import { useCreateBlockNote, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hierarchicalMarkdownLists } from './lists';
import { ListNumbering } from './ListNumbering';
import { ReferenceWidgets } from './ReferenceWidgets';
import { ReadingBlock, ReferenceContext } from './ReferenceReading';
import { anchorPosition, type DraftAnchor, type Material } from './references';
import { fileImage, native } from './bridge';
import type { Document } from './model';
import { blockSelection, markdownSelection, writingParts, type AISelection } from './ai';
import '@blocknote/mantine/style.css';
import type { SelectionBookmark } from '@tiptap/pm/state';

export type EditorAPI={target:()=>DraftAnchor|undefined;focus:()=>void;reveal?:()=>void;insert:(markdown:string,anchor:DraftAnchor)=>Promise<{anchor:DraftAnchor;original:string}[]>};
function Blocks({doc,readOnly,onChange,onError,onMedia,noteID,onAI,materials=[],onAPI}:{doc:Document;readOnly:boolean;onChange:(content:string)=>void;onError:(error:string)=>void;onMedia:(pending:number)=>void;noteID:string;onAI:(selection:AISelection)=>void;materials?:Material[];onAPI?:(api:EditorAPI|undefined)=>void}) {
  const mode=useContext(AppearanceMode);
  const environment=useContext(ReferenceContext),references=useRef({materials,environment});references.current={materials,environment};
  const extension=useRef<ReferenceWidgets|null>(null);if(!extension.current)extension.current=new ReferenceWidgets(()=>references.current);
  const target=useRef<DraftAnchor|undefined>(undefined);
  const bookmark=useRef<SelectionBookmark|undefined>(undefined);
  const latest=useRef({onChange,onError,onMedia});latest.current={onChange,onError,onMedia};
  const ready=useRef(false);
  const [error,setError]=useState('');
  const editor=useCreateBlockNote({dictionary:zh,extensions:[new ListNumbering(),extension.current],uploadFile:async(file)=>{latest.current.onMedia(1);try{return await fileImage(file);}catch(e){latest.current.onError(String(e));throw e;}finally{latest.current.onMedia(-1);}}});
  useEffect(()=>{try{const blocks=JSON.parse(doc.content||'[]');if(!Array.isArray(blocks))throw new Error();if(blocks.length)editor.replaceBlocks(editor.document,blocks);ready.current=true;}catch{setError('正文格式无法打开，原始内容仍保留。请导出备份后检查。');}return()=>{ready.current=false;};},[editor]);
  useEffect(()=>{extension.current?.refresh();if(ready.current)editor._tiptapEditor.view?.dispatch(editor._tiptapEditor.state.tr.setMeta('writer-references',true));},[materials,environment]);
  useEffect(()=>{
   const capture=()=>{if(editor._tiptapEditor.isFocused){target.current={format:'blocknote',blockID:editor.getTextCursorPosition().block.id};bookmark.current=editor._tiptapEditor.state.selection.getBookmark();}};
   const map=({transaction}:{transaction:import('@tiptap/pm/state').Transaction})=>{if(!editor._tiptapEditor.isFocused&&bookmark.current)bookmark.current=bookmark.current.map(transaction.mapping);};
   editor._tiptapEditor.on('transaction',map);
   const off=editor.onSelectionChange(capture);
   const reveal=()=>{try{const state=editor._tiptapEditor.state;if(bookmark.current)editor._tiptapEditor.view?.dispatch(state.tr.setSelection(bookmark.current.resolve(state.doc)).scrollIntoView());}catch{/* A removed selection must not redirect a write. */}};
   onAPI?.({target:()=>target.current,reveal,focus:()=>{reveal();editor._tiptapEditor.view?.focus();},insert:async(markdown,anchor)=>{if(readOnly||anchor.format!=='blocknote'||!editor.getBlock(anchor.blockID))throw new Error('插入位置已变化，请先在正文选择位置。');const blocks=await editor.tryParseMarkdownToBlocks(markdown);const inserted=editor.insertBlocks(blocks,anchor.blockID,'after');return inserted.slice(0,-1).map(b=>({anchor:{format:'blocknote' as const,blockID:b.id},original:JSON.stringify(b.content)}));}});
   return()=>{off?.();editor._tiptapEditor.off('transaction',map);onAPI?.(undefined);};
  },[editor,readOnly]);
  if(error)return <div className="notice error">{error}<pre>{doc.content}</pre></div>;
  function selectAI(){try{const state=editor._tiptapEditor.state;const nodes:{text:string;pos:number}[]=[];state.doc.descendants((node,pos)=>{if(node.isText)nodes.push({text:node.text!,pos});});onAI(blockSelection(noteID,doc,nodes,state.selection.from,state.selection.to));}catch(e){onError(e instanceof Error?e.message:String(e));}}
  return <BlockNoteView editor={editor} theme={mode} editable={!readOnly} formattingToolbar={false} onChange={()=>{if(ready.current)latest.current.onChange(JSON.stringify(editor.document));}}><FormattingToolbarController formattingToolbar={()=><FormattingToolbar>{getFormattingToolbarItems()}<button className="ai-selection-button" disabled={readOnly} onMouseDown={e=>e.preventDefault()} onClick={selectAI}>✦ AI 润色</button></FormattingToolbar>}/></BlockNoteView>;
}

export default function Editor({doc,preview,onChange,onError,onMedia,onInsertImage,noteID,onAI,materials=[],onAPI}:{doc:Document;preview:boolean;onChange:(content:string)=>void;onError:(error:string)=>void;onMedia:(pending:number)=>void;onInsertImage:(url:string,position:number)=>void;noteID:string;onAI:(selection:AISelection)=>void;materials?:Material[];onAPI?:(api:EditorAPI|undefined)=>void}){
  const [range,setRange]=useState<{from:number;to:number}|null>(null);
  const source=useRef<HTMLTextAreaElement>(null);
  const latest=useRef({doc,onChange});latest.current={doc,onChange};const anchor=useRef<DraftAnchor|undefined>(undefined);
  const markdownRange=useRef<{from:number;to:number}|undefined>(undefined);
  function revealMarkdown(){
   const field=source.current,paper=field?.closest<HTMLElement>('.paper'),range=markdownRange.current;if(!field||!paper||!range)return;
   const style=getComputedStyle(field),mirror=document.createElement('div');
   for(const key of ['font-family','font-size','font-weight','font-style','letter-spacing','line-height','text-align','tab-size','padding-top','padding-left','padding-right','box-sizing'])mirror.style.setProperty(key,style.getPropertyValue(key));
   Object.assign(mirror.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre-wrap',overflowWrap:'break-word',width:field.clientWidth+'px',left:'0',top:'0'});
   mirror.textContent=field.value.slice(0,range.to);const marker=document.createElement('span');marker.textContent=field.value.slice(range.to,range.to+1)||'\u200b';mirror.append(marker);field.parentElement!.append(mirror);
   const y=field.getBoundingClientRect().top+marker.offsetTop,height=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.9,bounds=paper.getBoundingClientRect();mirror.remove();
   if(y<bounds.top+18)paper.scrollTop+=y-bounds.top-18;else if(y+height>bounds.bottom-18)paper.scrollTop+=y+height-bounds.bottom+18;
  }
  useEffect(()=>{if(doc.contentType!=='markdown')return;onAPI?.({target:()=>anchor.current,reveal:revealMarkdown,focus:()=>{const field=source.current;if(field){field.focus();const range=markdownRange.current;if(range)field.setSelectionRange(range.from,range.to);revealMarkdown();}},insert:async(markdown,target)=>{const current=latest.current.doc;if(preview||target.format!=='markdown')throw new Error('请回到编辑视图指定插入位置。');const at=anchorPosition(current,target);if(at===undefined)throw new Error('插入位置已变化，请在正文重新选择位置。');const pos=at+target.text.length;latest.current.onChange(current.content.slice(0,pos)+'\n\n'+markdown+'\n\n'+current.content.slice(pos));return [{anchor:{format:'markdown',text:markdown,start:pos+2},original:markdown}];}});return()=>onAPI?.(undefined);},[doc.contentType,preview]);
  useLayoutEffect(()=>{const el=source.current;if(!el)return;const fit=()=>{el.style.height='auto';el.style.height=`${el.scrollHeight}px`;};fit();const observer=new ResizeObserver(fit);if(el.parentElement)observer.observe(el.parentElement);return()=>observer.disconnect();},[doc.content,preview]);
  if(doc.contentType==='blocknote')return <Blocks doc={doc} readOnly={preview} onChange={onChange} onError={onError} onMedia={onMedia} noteID={noteID} onAI={onAI} materials={materials} onAPI={onAPI}/>;
  const heading=(level:number)=>({node,children}:any)=>{const Tag=`h${level}` as keyof React.JSX.IntrinsicElements;return <Tag data-outline-id={`md-${node?.position?.start?.offset}`}>{children}</Tag>;};
  if(preview)return <div className="markdown prose"><ReactMarkdown remarkPlugins={[remarkGfm,hierarchicalMarkdownLists]} urlTransform={url=>/^(?:https?:|writer-asset:|\/|#)/.test(url)?url:''} components={{h1:heading(1),h2:heading(2),h3:heading(3),h4:heading(4),h5:heading(5),h6:heading(6),p:({node,children})=><div className="markdown-paragraph"><p>{children}</p>{materials.filter(m=>m.anchor?.format==='markdown'&&anchorPosition(doc,m.anchor)===node?.position?.start.offset).map(m=><ReadingBlock key={m.id} material={m} compact/>)}</div>,li:({node,children,...props})=>{const label=String(node?.properties?.['data-list-number']||'');return <li {...props} data-list-number={label||undefined} style={label?{paddingLeft:`${label.length*.62+1}em`}:undefined}>{children}</li>;},a:({href,children})=><a href={href} onClick={e=>{e.preventDefault();if(href)void native('openURL',{url:href});}}>{children}</a>}}>{doc.content}</ReactMarkdown></div>;
  return <div className="markdown-edit"><div className="format-hint">Markdown 原文 · 保留现有格式{materials.some(m=>m.anchor)&&' · 段内参考在阅读视图显示'}</div>{range&&<div className="markdown-ai-selection"><button className="ai-selection-button" onMouseDown={e=>e.preventDefault()} onClick={()=>{try{onAI(markdownSelection(noteID,doc,range.from,range.to));}catch(e){onError(e instanceof Error?e.message:String(e));}}}>✦ AI 润色选中文字</button></div>}<textarea ref={source} aria-label="Markdown 正文" value={doc.content} spellCheck={false} onSelect={e=>{const t=e.currentTarget;markdownRange.current={from:t.selectionStart,to:t.selectionEnd};setRange(t.selectionEnd>t.selectionStart?{from:t.selectionStart,to:t.selectionEnd}:null);const p=writingParts(doc).find(p=>p.start!<=t.selectionStart&&p.end!>=t.selectionStart);if(p)anchor.current={format:'markdown',text:doc.content.slice(p.start,p.end),start:p.start!};}} onChange={e=>{setRange(null);onChange(e.target.value);}} onPaste={async e=>{const file=Array.from(e.clipboardData.files).find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();const target=e.currentTarget;const at=target.selectionStart;onMedia(1);try{const url=await fileImage(file);onInsertImage(url,at);}catch(error){onError(String(error));}finally{onMedia(-1);}}}}/></div>;
}
