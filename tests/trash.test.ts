import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteTrashedNotes, newNote, noteKey, restoreTrashedNote, trashNotes, type Library } from '../web/model';

test('trash and recovery preserve the full document, images, dates, folder and publication state',()=>{
 const note=newNote();note.archived=true;note.folderId='writing';note.document.coverImage='writer-asset://local/shared.png';note.assets={'writer-asset://local/shared.png':'/uploads/shared.png'};note.syncedKey=noteKey(note);
 const library:Library={schema:1,notes:[note],folders:[{id:'writing',name:'写作'}],aiSessions:{[note.id]:{messages:[]}}};
 const saved=structuredClone(library),trashed=trashNotes(library,[note.id],'2026-10-25T12:00:00.000Z');
 assert.deepEqual(library,saved);assert.equal(noteKey(trashed.notes[0]),noteKey(note));
 assert.equal(trashed.notes[0].updatedAt,note.updatedAt);assert.equal(trashed.notes[0].trashedAt,'2026-10-25T12:00:00.000Z');
 assert.deepEqual(restoreTrashedNote(trashed,note.id),saved);
});
test('batch trash changes only selected notes and repeated trash preserves the original deletion time',()=>{
 const notes=[newNote(),newNote(),newNote()],library:Library={schema:1,notes};
 const ids=notes.slice(0,2).map(n=>n.id),trashed=trashNotes(library,ids,'2026-10-25T12:00:00.000Z');
 assert.ok(trashed.notes[0].trashedAt&&trashed.notes[1].trashedAt);assert.equal(trashed.notes[2],notes[2]);
 assert.deepEqual(trashNotes(trashed,ids,'2026-10-25T13:00:00.000Z'),trashed);
});
test('permanent deletion only removes trashed notes and their own AI conversation',()=>{
 const [a,b]=[newNote(),newNote()];a.document.coverImage=b.document.coverImage='writer-asset://local/shared.png';
 const library:Library={schema:1,notes:[a,b],aiSessions:{[a.id]:{messages:[]},[b.id]:{messages:[]},free:{messages:[]}}};
 const next=deleteTrashedNotes(trashNotes(library,[a.id],'2026-10-25T12:00:00.000Z'),[a.id]);
 assert.deepEqual(next.notes,[b]);assert.deepEqual(next.aiSessions,{[b.id]:{messages:[]},free:{messages:[]}});
});
test('permanent deletion rejects active notes and mixed selections without partial changes',()=>{
 const notes=[newNote(),newNote()],library=trashNotes({schema:1,notes},[notes[0].id],'2026-10-25T12:00:00.000Z'),before=structuredClone(library);
 assert.throws(()=>deleteTrashedNotes(library,notes.map(n=>n.id)),/废纸篓/);assert.deepEqual(library,before);
 assert.throws(()=>deleteTrashedNotes(library,['missing']),/废纸篓/);
});
