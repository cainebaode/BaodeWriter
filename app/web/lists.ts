type ListBlock={id:string;type:string;props?:{start?:number;[key:string]:unknown};children?:ListBlock[]};

// Display-only labels leave stored blocks, Markdown and publication fingerprints intact.
export function listNumbers(blocks:ListBlock[]):Map<string,string>{
 const labels=new Map<string,string>();
 function walk(items:ListBlock[],path:number[]){let index=0;for(const block of items){const ordered=block.type==='numberedListItem';index=ordered?(index?index+1:block.props?.start||1):0;const next=ordered?[...path,index]:path;if(ordered)labels.set(block.id,next.join('.'));if(block.children)walk(block.children,next);}}
 walk(blocks,[]);return labels;
}
export function hierarchicalMarkdownLists(){
 return (tree:any)=>{
  function walk(node:any,path:number[]){
   if(node.type==='list'&&node.ordered){node.children.forEach((item:any,index:number)=>{const next=[...path,(node.start??1)+index];item.data={...item.data,hProperties:{...item.data?.hProperties,'data-list-number':next.join('.')}};item.children?.forEach((child:any)=>walk(child,next));});}
   else node.children?.forEach((child:any)=>walk(child,path));
  }
  walk(tree,[]);
 };
}
