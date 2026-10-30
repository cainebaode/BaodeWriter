export type DocumentWorkspace={tabs:string[];panes:string[];active:string};
export const emptyWorkspace=():DocumentWorkspace=>({tabs:[],panes:[],active:''});

export function openDocument(state:DocumentWorkspace,id:string):DocumentWorkspace{
 if(!id||id===state.active)return state;
 const tabs=state.tabs.includes(id)?state.tabs:[...state.tabs,id];
 if(state.panes.includes(id))return {...state,tabs,active:id};
 const panes=state.panes.length?state.panes.map(value=>value===state.active?id:value):[id];
 return {tabs,panes,active:id};
}
export function splitDocument(state:DocumentWorkspace,id:string):DocumentWorkspace{
 if(!state.active||id===state.active||!state.tabs.includes(id))return state;
 return {...state,panes:[state.active,id]};
}
export function endSplit(state:DocumentWorkspace):DocumentWorkspace{return {...state,panes:state.active?[state.active]:[]};}
export function closeDocument(state:DocumentWorkspace,id:string):DocumentWorkspace{
 const index=state.tabs.indexOf(id);if(index<0)return state;
 const tabs=state.tabs.filter(value=>value!==id);
 let panes=state.panes.filter(value=>value!==id);
 if(!panes.length&&tabs.length)panes=[tabs[Math.min(index,tabs.length-1)]];
 return {tabs,panes,active:panes.includes(state.active)?state.active:panes[0]||''};
}
export function restoreWorkspace(saved:unknown,ids:string[],fallback:string):DocumentWorkspace{
 const value=saved as Partial<DocumentWorkspace>|null;
 if(!value||!Array.isArray(value.tabs)||!Array.isArray(value.panes))return fallback?openDocument(emptyWorkspace(),fallback):emptyWorkspace();
 const tabs=[...new Set(value.tabs.filter(id=>typeof id==='string'&&ids.includes(id)))];
 const panes=[...new Set(value.panes.filter(id=>tabs.includes(id)))].slice(0,2);
 if(!panes.length&&tabs.length)panes.push(tabs[0]);
 return {tabs,panes,active:value.active&&panes.includes(value.active)?value.active:panes[0]||''};
}
