import { BlockNoteExtension } from '@blocknote/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { listNumbers } from './lists';

function blocks(node:Node):Parameters<typeof listNumbers>[0]{
 if(node.type.name==='blockContainer')return [{id:node.attrs.id,type:node.firstChild!.type.name,props:node.firstChild!.attrs,children:node.content.content.slice(1).flatMap(blocks)}];
 return node.content.content.flatMap(blocks);
}
// Decorations follow editor transactions, including indent, move, undo and preview.
export class ListNumbering extends BlockNoteExtension{
 static key(){return 'hierarchical-list-numbering';}
 constructor(){super();this.addProsemirrorPlugin(new Plugin({key:new PluginKey('hierarchical-list-numbering'),props:{decorations(state){
  const labels=listNumbers(blocks(state.doc)),decorations:Decoration[]=[];
  state.doc.descendants((node,pos)=>{if(node.type.name!=='blockContainer'||node.firstChild?.type.name!=='numberedListItem')return;const label=labels.get(node.attrs.id);if(label)decorations.push(Decoration.node(pos+1,pos+1+node.firstChild.nodeSize,{'data-list-number':label}));});
  return DecorationSet.create(state.doc,decorations);
 }} }));}
}
