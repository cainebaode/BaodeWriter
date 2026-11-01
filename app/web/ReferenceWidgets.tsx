import { createRoot, type Root } from 'react-dom/client';
import { BlockNoteExtension } from '@blocknote/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ReadingBlock, ReferenceContext, type ReferenceEnvironment } from './ReferenceReading';
import type { Material } from './references';

// Private references are decorations, never part of the saved or published document.
export class ReferenceWidgets extends BlockNoteExtension{
 static key(){return 'writer-private-references';}
 roots=new Map<string,Root>();
 constructor(private get:()=>{materials:Material[];environment:ReferenceEnvironment}){
  super();const self=this;
  this.addProsemirrorPlugin(new Plugin({key:new PluginKey('writer-private-references'),props:{decorations(state){
   const data=self.get(),decorations:Decoration[]=[];
   state.doc.descendants((node,pos)=>{if(node.type.name!=='blockContainer')return;
    for(const material of data.materials){if(material.anchor?.format!=='blocknote'||material.anchor.blockID!==node.attrs.id)continue;
     let mounted:Root|undefined;
     decorations.push(Decoration.widget(pos+node.nodeSize,()=>{
      const host=document.createElement('div');host.className='inline-reference-widget';host.contentEditable='false';host.dataset.referenceId=material.id;
      const root=createRoot(host);mounted=root;self.roots.set(material.id,root);root.render(<ReferenceContext.Provider value={self.get().environment}><ReadingBlock material={material} compact/></ReferenceContext.Provider>);return host;
     },{key:material.id,side:-1,ignoreSelection:true,stopEvent:()=>true,destroy:()=>{const root=mounted;if(root){if(self.roots.get(material.id)===root)self.roots.delete(material.id);queueMicrotask(()=>root.unmount());}}}));
    }
   });return DecorationSet.create(state.doc,decorations);
  }}}));
 }
 refresh(){const data=this.get();for(const [id,root] of this.roots){const material=data.materials.find(m=>m.id===id);if(material)root.render(<ReferenceContext.Provider value={data.environment}><ReadingBlock material={material} compact/></ReferenceContext.Provider>);}}
}
