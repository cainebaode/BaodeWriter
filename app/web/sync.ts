import { dirty, liveNotes, type Library, type Note, type Remote } from './model';
import { folderDescendants } from './tree';

export type SyncState='local'|'pending'|'synced'|'draft'|'remote'|'conflict'|'error'|'other-site';
export const syncLabels:Record<SyncState,string>={local:'仅在本机',pending:'待同步',synced:'已同步',draft:'网站草稿',remote:'网站有变化',conflict:'版本冲突',error:'同步失败','other-site':'关联其他网站'};
export function syncState(note:Note,site:string,remotes?:Remote[]):SyncState{
 if(note.siteURL&&note.siteURL!==site)return 'other-site';
 if(note.conflict)return 'conflict';
 if(remotes&&note.base){const remote=remotes.find(r=>r.id===note.id);if(!remote||remote.deleted||remote.version!==note.base.version)return dirty(note)?'conflict':'remote';}
 if(note.error)return 'error';
 if(!note.base)return 'local';
 if(dirty(note))return 'pending';
 return note.base.status==='PUBLISHED'?'synced':'draft';
}
export function syncScope(library:Library,scope='all'):Note[]{
 const notes=liveNotes(library.notes);
 if(scope==='all')return notes;
 if(scope==='root')return notes.filter(n=>!n.folderId);
 const ids=folderDescendants(library.folders||[],scope.slice(7));return notes.filter(n=>n.folderId&&ids.has(n.folderId));
}
export function canSync(note:Note,site:string,remotes?:Remote[]):boolean{
 return !note.trashedAt&&!note.archived&&!['other-site','conflict','remote'].includes(syncState(note,site,remotes));
}
export function needsSync(note:Note,site:string,remotes?:Remote[]):boolean{
 return canSync(note,site,remotes)&&(!note.base||dirty(note)||!!note.error||note.base.status!=='PUBLISHED');
}
export function importablePosts(library:Library,remotes:Remote[]):Remote[]{const trashed=new Set(library.notes.filter(n=>n.trashedAt).map(n=>n.id));return remotes.filter(r=>!r.deleted&&!trashed.has(r.id));}
