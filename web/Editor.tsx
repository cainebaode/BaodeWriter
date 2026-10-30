import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCreateBlockNote, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fileImage, native } from './bridge';
import type { Document } from './model';
import { blockSelection, markdownSelection, type AISelection } from './ai';
import '@blocknote/mantine/style.css';

function Blocks({doc,readOnly,onChange,onError,onMedia,noteID,onAI}:{doc:Document;readOnly:boolean;onChange:(content:string)=>void;onError:(error:string)=>void;onMedia:(pending:number)=>void;noteID:string;onAI:(selection:AISelection)=>void}) {
  const latest=useRef({onChange,onError,onMedia});latest.current={onChange,onError,onMedia};
  const ready=useRef(false);
  const [error,setError]=useState('');
  const editor=useCreateBlockNote({dictionary:zh,uploadFile:async(file)=>{latest.current.onMedia(1);try{return await fileImage(file);}catch(e){latest.current.onError(String(e));throw e;}finally{latest.current.onMedia(-1);}}});
  useEffect(()=>{try{const blocks=JSON.parse(doc.content||'[]');if(!Array.isArray(blocks))throw new Error();if(blocks.length)editor.replaceBlocks(editor.document,blocks);ready.current=true;}catch{setError('正文格式无法打开，原始内容仍保留。请导出备份后检查。');}return()=>{ready.current=false;};},[editor]);
  if(error)return <div className="notice error">{error}<pre>{doc.content}</pre></div>;
  function selectAI(){try{const state=editor._tiptapEditor.state;const nodes:{text:string;pos:number}[]=[];state.doc.descendants((node,pos)=>{if(node.isText)nodes.push({text:node.text!,pos});});onAI(blockSelection(noteID,doc,nodes,state.selection.from,state.selection.to));}catch(e){onError(e instanceof Error?e.message:String(e));}}
  return <BlockNoteView editor={editor} theme="light" editable={!readOnly} formattingToolbar={false} onChange={()=>{if(ready.current)latest.current.onChange(JSON.stringify(editor.document));}}><FormattingToolbarController formattingToolbar={()=><FormattingToolbar>{getFormattingToolbarItems()}<button className="ai-selection-button" disabled={readOnly} onMouseDown={e=>e.preventDefault()} onClick={selectAI}>✦ AI 润色</button></FormattingToolbar>}/></BlockNoteView>;
}

export default function Editor({doc,preview,onChange,onError,onMedia,onInsertImage,noteID,onAI}:{doc:Document;preview:boolean;onChange:(content:string)=>void;onError:(error:string)=>void;onMedia:(pending:number)=>void;onInsertImage:(url:string,position:number)=>void;noteID:string;onAI:(selection:AISelection)=>void}){
  const [range,setRange]=useState<{from:number;to:number}|null>(null);
  const source=useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(()=>{const el=source.current;if(!el)return;const fit=()=>{el.style.height='auto';el.style.height=`${el.scrollHeight}px`;};fit();const observer=new ResizeObserver(fit);if(el.parentElement)observer.observe(el.parentElement);return()=>observer.disconnect();},[doc.content,preview]);
  if(doc.contentType==='blocknote')return <Blocks doc={doc} readOnly={preview} onChange={onChange} onError={onError} onMedia={onMedia} noteID={noteID} onAI={onAI}/>;
  const heading=(level:number)=>({node,children}:any)=>{const Tag=`h${level}` as keyof React.JSX.IntrinsicElements;return <Tag data-outline-id={`md-${node?.position?.start?.offset}`}>{children}</Tag>;};
  if(preview)return <div className="markdown prose"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url=>/^(?:https?:|writer-asset:|\/|#)/.test(url)?url:''} components={{h1:heading(1),h2:heading(2),h3:heading(3),h4:heading(4),h5:heading(5),h6:heading(6),a:({href,children})=><a href={href} onClick={e=>{e.preventDefault();if(href)void native('openURL',{url:href});}}>{children}</a>}}>{doc.content}</ReactMarkdown></div>;
  return <div className="markdown-edit"><div className="format-hint">Markdown 原文 · 保留现有格式</div>{range&&<div className="markdown-ai-selection"><button className="ai-selection-button" onMouseDown={e=>e.preventDefault()} onClick={()=>{try{onAI(markdownSelection(noteID,doc,range.from,range.to));}catch(e){onError(e instanceof Error?e.message:String(e));}}}>✦ AI 润色选中文字</button></div>}<textarea ref={source} aria-label="Markdown 正文" value={doc.content} spellCheck={false} onSelect={e=>{const t=e.currentTarget;setRange(t.selectionEnd>t.selectionStart?{from:t.selectionStart,to:t.selectionEnd}:null);}} onChange={e=>{setRange(null);onChange(e.target.value);}} onPaste={async e=>{const file=Array.from(e.clipboardData.files).find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();const target=e.currentTarget;const at=target.selectionStart;onMedia(1);try{const url=await fileImage(file);onInsertImage(url,at);}catch(error){onError(String(error));}finally{onMedia(-1);}}}}/></div>;
}
