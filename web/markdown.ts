import { BlockNoteEditor } from '@blocknote/core';
import type { Document } from './model';

// Conversion is used for generated text and review only, never to round-trip a saved original.
export async function markdownBlocks(markdown:string){
 const editor=BlockNoteEditor.create();
 try{return await editor.tryParseMarkdownToBlocks(markdown);}
 finally{editor._tiptapEditor.destroy();}
}
export async function documentMarkdown(doc:Document){
 if(doc.contentType==='markdown')return doc.content;
 const editor=BlockNoteEditor.create();
 try{return await editor.blocksToMarkdownLossy(JSON.parse(doc.content||'[]'));}
 finally{editor._tiptapEditor.destroy();}
}
