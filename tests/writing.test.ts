import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArticle, buildRequest, composeWriting, insertText, markdownSelection, parseArticle, parseWritingResponse, selectionAfterWriting, writingDocument, type AIMessage } from '../web/ai';
import { emptyDocument, type Document } from '../web/model';

const md=(content:string):Document=>({...emptyDocument(),title:'一次记录',contentType:'markdown',content});

test('selected writing receives surrounding context while keeping a narrow edit range',()=>{
 const doc=md('前文交代了出发原因。\n\n这一段需要展开。\n\n后文回到最初的疑问。');
 const from=doc.content.indexOf('这一段'),selection=markdownSelection('one',doc,from,from+8);
 const request=buildRequest('selection','让这段衔接自然',doc,'selection',selection,[]);
 assert(request.reference.includes('前文交代'));assert(request.reference.includes('后文回到'));
 assert.equal(request.units.length,1);assert.equal(request.units[0].text,'这一段需要展开。');
});

test('inserting after a selected word does not split a Markdown link or its paragraph',()=>{
 const doc=md('前文。\n\n阅读[这份资料](https://example.com)，然后继续。\n\n后文。');
 const from=doc.content.indexOf('这份资料'),selection=markdownSelection('one',doc,from,from+4);
 assert.equal(insertText(doc,'新增段落。',selection).content,'前文。\n\n阅读[这份资料](https://example.com)，然后继续。\n\n新增段落。\n\n后文。');
});

test('a distinct first section is not discarded as a duplicate document title',()=>{
 assert.equal(parseArticle({title:'一次记录',markdown:'# 出发之前\n\n清晨的街道。'}).markdown,'# 出发之前\n\n清晨的街道。');
});

const noBlocks=async()=>{throw new Error('Markdown edits must not convert the original');};
test('expanding one section preserves the other sections, images and exact Markdown',async()=>{
 const doc=md('## 第一节\n\n原样保留 **重点**。\n\n## 第二节\n\n要展开的想法。\n\n## 第三节\n\n![图](writer-asset://local/photo.png)\n\n结尾。');
 const next=await composeWriting(doc,{reply:'展开第二节',edits:[{from:'p3',to:'p3',markdown:'先把具体问题说清楚。\n\n再补充一层解释。'}]},undefined,noBlocks);
 assert.equal(next.content,doc.content.replace('要展开的想法。','先把具体问题说清楚。\n\n再补充一层解释。'));
 assert.equal(next.title,doc.title);
});
test('native block edits keep untouched blocks, formatting and metadata byte-for-byte',async()=>{
 const before=[{id:'a',type:'paragraph',props:{textAlignment:'center'},content:[{type:'text',text:'前文',styles:{bold:true}}],children:[]},{id:'b',type:'paragraph',content:[{type:'text',text:'待扩写'}]},{id:'pic',type:'image',props:{url:'writer-asset://local/a.png',caption:'照片'}},{id:'z',type:'paragraph',content:[{type:'text',text:'结尾'}]}];
 const doc={...emptyDocument(),tags:['记录'],content:JSON.stringify(before)};
 const additions=[{id:'new1',type:'paragraph',content:[{type:'text',text:'第一层'}]},{id:'new2',type:'paragraph',content:[{type:'text',text:'第二层'}]}];
 const next=await composeWriting(doc,{reply:'',edits:[{from:'p1',to:'p1',markdown:'第一层\n\n第二层'}]},undefined,async()=>additions);
 assert.deepEqual(JSON.parse(next.content),[before[0],...additions,before[2],before[3]]);assert.deepEqual(next.tags,['记录']);
 assert.deepEqual(JSON.parse(doc.content),before);
});
test('edit positions reject overlapping ranges, fabricated IDs and unselected blocks',async()=>{
 const doc=md('第一段。\n\n第二段。\n\n第三段。'),selection=markdownSelection('one',doc,6,10);
 for(const edits of [[{from:'p99',to:'p99',markdown:'错位'}],[{from:'p0',to:'p1',markdown:'甲'},{from:'p1',to:'p2',markdown:'乙'}],[{from:'p0',to:'p0',markdown:'越界'}]])await assert.rejects(composeWriting(doc,{reply:'',edits},selection,noBlocks),/未选中|无效位置/);
 const partial=markdownSelection('one',doc,7,9);
 await assert.rejects(composeWriting(doc,{reply:'',edits:[{from:'p1',to:'p1',markdown:'扩大范围'}]},partial,noBlocks),/未选中/);
});
test('insertion targets the paragraph boundary and selection cannot insert elsewhere',async()=>{
 const doc=md('第一段。\n\n第二段。'),selection=markdownSelection('one',doc,1,3);
 const next=await composeWriting(doc,{reply:'修改说明不进正文',insertion:{after:'selection',markdown:'## 新内容\n\n可用段落。'}},selection,noBlocks);
 assert.equal(next.content,'第一段。\n\n## 新内容\n\n可用段落。\n\n第二段。');assert(!next.content.includes('修改说明'));
 await assert.rejects(composeWriting(doc,{reply:'',insertion:{after:'end',markdown:'越界'}},selection,noBlocks),/允许范围/);
 await assert.rejects(composeWriting(doc,{reply:'',insertion:{after:'p99',markdown:'错位'}},undefined,noBlocks),/允许范围/);
});
test('accepted structured selection can continue on the newly expanded paragraphs',async()=>{
 const doc=md('第一段。\n\n第二段。\n\n第三段。'),selection=markdownSelection('one',doc,6,10);
 const next=await composeWriting(doc,{reply:'',edits:[{from:'p1',to:'p1',markdown:'第二段扩写。\n\n补充的解释。'}]},selection,noBlocks);
 const mapped=selectionAfterWriting(selection,next,'edit')!;
 assert.equal(mapped.text,'第二段扩写。\n补充的解释。');
 const request=buildRequest('chat','再简洁一点',next,'selection',{...mapped,document:next},[]);
 assert.deepEqual(request.units.map(u=>u.text),['第二段扩写。','补充的解释。']);
 assert.deepEqual(JSON.parse(request.messages.at(-1)!.content).允许整段修改,['p1','p2']);
});
test('follow-up edits use a pending draft but apply against its saved original',async()=>{
 const original=md('原稿。'),pending=md('新的开头。\n\n第二节。');
 const article={noteID:'one',base:original,document:pending,markdown:pending.content,beforeMarkdown:original.content,state:'pending' as const};
 const history:AIMessage[]=[{id:'draft',role:'assistant',at:'now',text:'已成稿',article}];
 const request=buildRequest('chat','把第二节展开',original,'full',undefined,history,'写给初学者，朴素，不虚构经历');
 assert.equal(request.workingDocument,pending);assert(JSON.parse(request.messages.at(-1)!.content).写作约定.includes('初学者'));
 assert.deepEqual(JSON.parse(request.messages.at(-1)!.content).作者原稿.content,['原稿。']);
 const next=await composeWriting(request.workingDocument!,{reply:'',edits:[{from:'p1',to:'p1',markdown:'第二节展开后的具体内容。'}]},undefined,noBlocks);
 assert.equal(applyArticle(original,'one',{...article,document:next}).content,'新的开头。\n\n第二节展开后的具体内容。');
 assert.equal(writingDocument({...original,content:'手动新写。'},'full',history)?.content,'手动新写。');
 assert.equal(writingDocument(original,'full',[{...history[0],article:{...article,state:'skipped'}}]),original);
 assert.equal(writingDocument(original,'full',[{...history[0],article:{...article,state:'accepted'}}]),original);
});
test('a pending selected expansion remains the basis for the next narrow revision',async()=>{
 const doc=md('前文。\n\n短段。\n\n后文。'),selection=markdownSelection('one',doc,5,8);
 const document=await composeWriting(doc,{reply:'',edits:[{from:'p1',to:'p1',markdown:'展开后的第一段。\n\n展开后的第二段。'}]},selection,noBlocks);
 const mapped=selectionAfterWriting(selection,document,'edit')!;
 const history:AIMessage[]=[{id:'draft',role:'assistant',at:'now',text:'',article:{noteID:'one',base:doc,document,markdown:document.content,beforeMarkdown:doc.content,kind:'edit',selection:mapped,state:'pending'}}];
 const request=buildRequest('chat','再朴素一点',doc,'selection',selection,history);
 assert.deepEqual(request.units.map(u=>u.text),['展开后的第一段。','展开后的第二段。']);
 assert.equal(request.workingSelection?.text,mapped.text);
 await assert.rejects(composeWriting(request.workingDocument!,{reply:'',edits:[{from:'p0',to:'p0',markdown:'越界'}]},request.workingSelection,noBlocks),/未选中/);
});
test('output separates discussion from usable writing and rejects mixed write modes',()=>{
 const result=parseWritingResponse(JSON.stringify({reply:'这里补上结尾。',brief:'写给初学者',insertion:{after:'end',markdown:'今天先记下一件小事。'}}));
 assert.equal(result.insertion?.markdown,'今天先记下一件小事。');assert.equal(result.brief,'写给初学者');
 for(const value of [{reply:[]},{reply:''},{reply:'',insertion:{after:'end',markdown:''}},{reply:'',edits:[{from:'p1'}]},{reply:'',article:{title:'题',markdown:'正文'},insertion:{after:'end',markdown:'追加'}},{reply:'说明',brief:'长'.repeat(3001)}])assert.throws(()=>parseWritingResponse(JSON.stringify(value)),/AI/);
 assert.deepEqual(parseWritingResponse('{"reply":"这个观点需要一个反例。"}'),{reply:'这个观点需要一个反例。',brief:undefined});
});
test('selection on a long document sends a clearly bounded neighborhood',()=>{
 const doc=md('长段落。\n\n'.repeat(12000)+'最后一段。'),from=doc.content.lastIndexOf('最后');
 const request=buildRequest('selection','改得自然一些',doc,'selection',markdownSelection('one',doc,from,from+5),[]);
 const reference=JSON.parse(request.reference);
 assert.equal(reference.content.length,3);assert(reference.阅读范围.includes('其余全文未发送'));assert(request.reference.length<1000);
});
