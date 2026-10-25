import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, publicationDocument, mediaURLs, replaceMedia, noteKey, chosenDate, dateValue, plainText } from '../web/model';
import { documentHeadings, moveNotes, removeFolder, dirty, type Library } from '../web/model';
test('nested BlockNote images and cover survive localization and publication roundtrip',()=>{const doc={...emptyDocument(),content:JSON.stringify([{type:'paragraph',content:[{type:'text',text:'正文'}],children:[{type:'image',props:{url:'/uploads/photo.png'}}]}]),coverImage:'/uploads/cover.jpg'};assert.deepEqual(mediaURLs(doc),['/uploads/cover.jpg','/uploads/photo.png']);const localized=replaceMedia(doc,{'/uploads/photo.png':'writer-asset://local/p.png','/uploads/cover.jpg':'writer-asset://local/c.jpg'});assert.equal(plainText(localized),'正文');assert.deepEqual(replaceMedia(localized,{'writer-asset://local/p.png':'/uploads/photo.png','writer-asset://local/c.jpg':'/uploads/cover.jpg'}),doc);});
test('Markdown source preserves HTML, footnotes, tables, links, and images around replacement',()=>{const source='# 原文\n\n![图](/uploads/a.png "标题")\n\n<img src="/uploads/b.jpg" width="20">\n\n[^x]: 脚注\n\n[链接](/uploads/a.png)\n|一|二|\n|-|-|';const doc={...emptyDocument(),contentType:'markdown' as const,content:source};assert.deepEqual(mediaURLs(doc),['/uploads/a.png','/uploads/b.jpg']);const localized=replaceMedia(doc,{'/uploads/a.png':'writer-asset://local/a.png'});assert.ok(localized.content.includes('[链接](/uploads/a.png)'));assert.equal(replaceMedia(localized,{'writer-asset://local/a.png':'/uploads/a.png'}).content,source);});
test('date selection stays on chosen calendar day and untouched ISO remains precise',()=>{assert.equal(dateValue(chosenDate('2026-10-25')),'2026-10-25');assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(chosenDate('2026-10-25'))),'2026-10-25');const a={document:emptyDocument(),displayDate:'2026-10-25T00:12:34.123Z'};assert.notEqual(noteKey(a),noteKey({...a,displayDate:chosenDate('2026-10-25')}));});
test('native JSON key sorting cannot make a synced document dirty after restart',()=>{const doc=emptyDocument();const reordered=Object.fromEntries(Object.entries(doc).sort(([a],[b])=>a.localeCompare(b))) as typeof doc;assert.equal(noteKey({document:doc,displayDate:'2026-10-25'}),noteKey({document:reordered,displayDate:'2026-10-25'}));});
test('reference-style and spaced Markdown images are backed up without rewriting surrounding syntax',()=>{const content='![照片][photo]\n\n[photo]: </uploads/a photo.jpg> "纪念"\n![图片](</uploads/b photo.jpg>)';const doc={...emptyDocument(),contentType:'markdown' as const,content};assert.deepEqual(new Set(mediaURLs(doc)),new Set(['/uploads/a photo.jpg','/uploads/b photo.jpg']));const local=replaceMedia(doc,{'/uploads/a photo.jpg':'writer-asset://local/a.jpg','/uploads/b photo.jpg':'writer-asset://local/b.jpg'});assert.ok(local.content.includes('[photo]: <writer-asset://local/a.jpg> "纪念"'));assert.deepEqual(replaceMedia(local,{'writer-asset://local/a.jpg':'/uploads/a photo.jpg','writer-asset://local/b.jpg':'/uploads/b photo.jpg'}),doc);});

test('legacy site image paths remain publishable after local image mapping',()=>{const doc={...emptyDocument(),contentType:'markdown' as const,content:'![旧图](writer-asset://local/p.png)\n![远图](https://cdn.example/a.jpg)',coverImage:'/images/cover.png'};const result=publicationDocument(doc,{'writer-asset://local/p.png':'/images/p.png'},'https://baode.life');assert.equal(result.coverImage,'https://baode.life/images/cover.png');assert.equal(result.content,'![旧图](https://baode.life/images/p.png)\n![远图](https://cdn.example/a.jpg)');assert.equal(publicationDocument({...doc,coverImage:'/uploads/cover.png'},{},'https://baode.life').coverImage,'/uploads/cover.png');});

test('image synchronization preserves fenced, inline, indented and escaped code examples exactly',()=>{
 const examples=['```md','![示例](/images/fenced.png)','```','','~~~html','<img src="/images/html-code.png">','~~~','','`![行内](/images/inline.png)`','','    ![缩进](/images/indent.png)','','\\![转义](/images/escaped.png)','','`![引用][code]`','[code]: /images/code-reference.png'].join('\n');
 const content=examples+'\n\n![真实](/images/real.png)\n\n![引用][photo]\n\n[photo]: /images/photo.png\n\n<img src="/images/html.png">';
 const doc={...emptyDocument(),contentType:'markdown' as const,content};
 assert.deepEqual(new Set(mediaURLs(doc)),new Set(['/images/real.png','/images/photo.png','/images/html.png']));
 const published=publicationDocument(doc,{},'https://baode.life');
 assert.ok(published.content.startsWith(examples+'\n\n'));
 assert.ok(published.content.includes('![真实](https://baode.life/images/real.png)'));
 assert.ok(published.content.includes('[photo]: https://baode.life/images/photo.png'));
});

test('HTML comments and script text stay unchanged while real HTML images synchronize',()=>{
 const examples='<!-- <img src="/images/comment.png"> -->\n\n<script>const example = \'<img src="/images/script.png">\';</script>';
 const doc={...emptyDocument(),contentType:'markdown' as const,content:examples+'\n\n<img src="/images/real.png" width="120">'};
 assert.deepEqual(mediaURLs(doc),['/images/real.png']);
 assert.equal(publicationDocument(doc,{},'https://baode.life').content,examples+'\n\n<img src="https://baode.life/images/real.png" width="120">');
});

test('only the effective first image reference definition is synchronized',()=>{
 const content='![图片][photo]\n\n[photo]: /images/used.png\n[photo]: /images/unused.png';
 const doc={...emptyDocument(),contentType:'markdown' as const,content};
 assert.deepEqual(mediaURLs(doc),['/images/used.png']);
 assert.equal(publicationDocument(doc,{},'https://baode.life').content,'![图片][photo]\n\n[photo]: https://baode.life/images/used.png\n[photo]: /images/unused.png');
});

test('outline keeps nested BlockNote heading IDs and formatted text in document order',()=>{
 const doc={...emptyDocument(),content:JSON.stringify([{id:'one',type:'heading',props:{level:1},content:[{type:'text',text:'第一章'}],children:[{id:'two',type:'heading',props:{level:3},content:[{type:'link',content:[{type:'text',text:'细节'}]}]}]},{id:'plain',type:'paragraph',content:[{type:'text',text:'# 这不是标题'}]}])};
 assert.deepEqual(documentHeadings(doc),[{id:'one',level:1,text:'第一章'},{id:'two',level:3,text:'细节'}]);
});
test('Markdown outline uses real heading positions while excluding code and escaped markers',()=>{
 const content='# 开始\n\n```md\n# 代码\n```\n\n\\# 转义\n\n小节\n---\n\n### **细节**与[链接](https://example.com)';
 const heads=documentHeadings({...emptyDocument(),contentType:'markdown',content});
 assert.deepEqual(heads.map(h=>[h.level,h.text]),[[1,'开始'],[2,'小节'],[3,'细节与链接']]);
 for(const h of heads)assert.equal(h.id,`md-${h.offset}`);
 assert.equal(content.slice(heads[2].offset).startsWith('### '),true);
});
test('moving and removing folders preserves article contents, timestamps and publication state',()=>{
 const n={id:'note',document:emptyDocument(),displayDate:'2026-10-25',createdAt:'a',updatedAt:'b',base:null,assets:{}};
 const library:Library={schema:1,folders:[{id:'folder',name:'日常'}],notes:[{...n,syncedKey:noteKey(n)}]};
 const moved=moveNotes(library,['note'],'folder');assert.equal(moved.notes[0].folderId,'folder');assert.equal(dirty(moved.notes[0]),false);assert.equal(moved.notes[0].updatedAt,'b');assert.equal(moved.notes[0].document,n.document);
 const removed=removeFolder(moved,'folder');assert.equal(removed.notes.length,1);assert.equal(removed.notes[0].folderId,undefined);assert.equal(removed.folders?.length,0);assert.equal(dirty(removed.notes[0]),false);
 assert.equal(library.notes[0].folderId,undefined);
});
test('moving into a missing folder is rejected before changing the library',()=>{
 const library:Library={schema:1,notes:[]};assert.throws(()=>moveNotes(library,[],'missing'),/文件夹不存在/);assert.deepEqual(library,{schema:1,notes:[]});
});
