import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProposal, blockSelection, buildRequest, continuedSelection, insertText, makeProposal, markdownSelection, proposalCopy, proposalUnits, textUnits } from '../web/ai';
import { emptyDocument, mediaURLs, noteKey, newNote } from '../web/model';

const markdown=(content:string)=>({...emptyDocument(),contentType:'markdown' as const,content,title:'测试文稿'});
const blocks=()=>({...emptyDocument(),title:'测试',content:JSON.stringify([
 {id:'p1',type:'paragraph',props:{textAlignment:'left'},content:[{type:'text',text:'我想写',styles:{}},{type:'text',text:'生活',styles:{bold:true}},{type:'text',text:'。',styles:{}}],children:[]},
 {id:'p2',type:'paragraph',props:{},content:[{type:'link',href:'https://example.com/original',content:[{type:'text',text:'原始链接',styles:{}}]}],children:[]},
 {id:'image',type:'image',props:{url:'writer-asset://local/picture.png',caption:'照片'},children:[]},
 {id:'code',type:'codeBlock',props:{language:'js'},content:[{type:'text',text:'const n = 1;',styles:{}}],children:[]}
])});
const output=(id:string,after:string)=>JSON.stringify({changes:[{id,after}]});

test('BlockNote proposals only change permitted text leaves and preserve link, marks, image, code and metadata',()=>{
 const doc=blocks(),units=proposalUnits(doc),proposal=makeProposal('one',doc,units,output(units[1].id,'日常生活'));
 const result=applyProposal(doc,'one',proposal,[units[1].id]);
 const expected=JSON.parse(doc.content);expected[0].content[1].text='日常生活';
 assert.deepEqual(JSON.parse(result.document.content),expected);
 assert.deepEqual(mediaURLs(result.document),mediaURLs(doc));assert.equal(result.document.title,doc.title);
 assert(!units.some(u=>u.text.includes('const n')));
});
test('partial selection in styled text cannot change the prefix, suffix or other runs',()=>{
 const doc=blocks(),all=textUnits(doc),nodes=all.map((u,i)=>({text:u.text,pos:10+i*20}));
 const selection=blockSelection('one',doc,nodes,31,32),units=proposalUnits(doc,selection);
 assert.equal(units[0].text,'活');
 const proposal=makeProposal('one',doc,units,output(units[0].id,'趣'));
 const changed=JSON.parse(applyProposal(doc,'one',proposal,[units[0].id]).document.content);
 assert.equal(changed[0].content[1].text,'生趣');assert.equal(changed[0].content[0].text,'我想写');assert.equal(changed[0].content[1].styles.bold,true);
});
test('ambiguous rich editor node mappings are rejected instead of guessing a selection',()=>{
 assert.throws(()=>blockSelection('one',blocks(),[{text:'不同内容',pos:0}],0,2),/暂不支持/);
});
test('Markdown polish preserves heading markers, emphasis, image, link targets, HTML and code',()=>{
 const doc=markdown('# 标题\n\n今天很开心，**粗体文字**和[这个链接](https://example.com/a "title")。\n\n![图片](writer-asset://local/p.png)\n\n`const a = 1`\n\n<div>HTML 原样</div>\n');
 const units=proposalUnits(doc),target=units.find(u=>u.text==='今天很开心，')!;
 const proposal=makeProposal('one',doc,units,output(target.id,'今天心情很好，'));
 assert.equal(applyProposal(doc,'one',proposal,[target.id]).document.content,doc.content.replace('今天很开心，','今天心情很好，'));
});
test('Markdown selection across styled text preserves every unselected character',()=>{
 const doc=markdown('之前的文字。\n\n这一段需要精简。\n\n之后的文字。');
 const start=doc.content.indexOf('需要'),selection=markdownSelection('one',doc,start,start+4),units=proposalUnits(doc,selection);
 const p=makeProposal('one',doc,units,output(units[0].id,'更简洁'));
 assert.equal(applyProposal(doc,'one',p,[units[0].id]).document.content,'之前的文字。\n\n这一段更简洁。\n\n之后的文字。');
});
test('model cannot add a link, delete a fragment, forge an ID or duplicate an edit',()=>{
 const doc=markdown('原始文字。'),units=proposalUnits(doc),id=units[0].id;
 assert.throws(()=>makeProposal('one',doc,units,output(id,'[文字](https://unwanted.example)')),/格式或链接/);
 assert.throws(()=>makeProposal('one',doc,units,output(id,'')),/不完整/);
 assert.throws(()=>makeProposal('one',doc,units,output('invented','修改')),/超出范围/);
 assert.throws(()=>makeProposal('one',doc,units,JSON.stringify({changes:[{id,after:'甲'},{id,after:'乙'}]})),/超出范围/);
});
test('rich text micro-edits cannot insert literal Markdown formatting instead of native structure',()=>{
 const doc=blocks(),units=proposalUnits(doc),id=units[0].id;
 for(const after of ['**我想写**','## 我想写','我想写\n\n另一个段落','[我想写](https://example.com)'])assert.throws(()=>makeProposal('one',doc,units,output(id,after)),/排版标记/);
 assert.equal(applyProposal(doc,'one',makeProposal('one',doc,units,output(id,'我想认真写')),[id]).document.content.includes('我想认真写'),true);
});
test('incremental acceptance remains valid after own edits, rejects repetition and supports a separate copy',()=>{
 const doc=markdown('第一段。\n\n第二段。'),units=proposalUnits(doc);
 const p=makeProposal('one',doc,units,JSON.stringify({changes:units.map((u,i)=>({id:u.id,after:`修改后的第${i+1}段。`}))}));
 const first=applyProposal(doc,'one',p,[units[0].id]);
 assert.throws(()=>applyProposal(first.document,'one',first.proposal,[units[0].id]),/重复/);
 const second=applyProposal(first.document,'one',first.proposal,[units[1].id]);
 assert.equal(second.document.content,'修改后的第1段。\n\n修改后的第2段。');
 assert.equal(proposalCopy(p).content,second.document.content);assert.equal(doc.content,'第一段。\n\n第二段。');
});
test('stale results and results for another document cannot overwrite text',()=>{
 const doc=markdown('原始段落。'),units=proposalUnits(doc),p=makeProposal('one',doc,units,output(units[0].id,'优化段落。'));
 assert.throws(()=>applyProposal({...doc,content:'用户新写的内容。'},'one',p,[units[0].id]),/原文已变化/);
 assert.throws(()=>applyProposal(doc,'two',p,[units[0].id]),/发起任务/);
});
test('apply-all is atomic and rejects a mix of pending and already accepted changes',()=>{
 const doc=markdown('甲。\n\n乙。'),units=proposalUnits(doc),p=makeProposal('one',doc,units,JSON.stringify({changes:units.map(u=>({id:u.id,after:'新'+u.text}))}));
 const first=applyProposal(doc,'one',p,[units[0].id]);
 assert.throws(()=>applyProposal(first.document,'one',first.proposal,units.map(u=>u.id)),/重复/);
 assert.equal(first.document.content,'新甲。\n\n乙。');
});
test('full-document reference does not expand selection edit permissions',()=>{
 const doc=markdown('第一段。\n\n第二段。'),selection=markdownSelection('one',doc,0,3);
 const request=buildRequest('selection','润色',doc,'full',selection,[]);
 assert(request.reference.includes('第二段'));assert.equal(request.units.length,1);assert.equal(request.units[0].text,'第一段');
 assert.throws(()=>makeProposal('one',doc,request.units,output('m6','改掉另一段')),/超出范围/);
});
test('free conversation sends no current document and long contexts are never silently truncated',()=>{
 const doc=markdown('只在本机的私密文字。');
 assert(!JSON.stringify(buildRequest('chat','讨论一个选题',doc,'chat',undefined,[]).messages).includes(doc.content));
 assert.throws(()=>buildRequest('polish','润色',markdown('长'.repeat(60001)),'full',undefined,[]),/不会截断/);
});
test('insertion preserves rich text and images and rejects a stale selected anchor',()=>{
 const doc=blocks(),result=insertText(doc,'新段落','end');
 const old=JSON.parse(doc.content),next=JSON.parse(result.content);assert.deepEqual(next.slice(0,old.length),old);assert.equal(next.at(-1).content[0].text,'新段落');
 const md=markdown('旧内容'),selection=markdownSelection('one',md,0,2);
 assert.throws(()=>insertText({...md,content:'用户新内容'},'插入',selection),/已变化/);
});
test('chat and revision records never change website publication fingerprints',()=>{
 const note=newNote(),before=noteKey(note);
 note.aiRevisions=[{id:'r',at:'now',label:'AI 润色',before:note.document,after:note.document}];
 assert.equal(noteKey(note),before);
});

test('continued chat rebases an accepted selection without expanding the edit range',()=>{
 for(const doc of [markdown('一段需要改的文字。'),blocks()]){
  const all=textUnits(doc),selection=doc.contentType==='markdown'?markdownSelection('one',doc,2,5):blockSelection('one',doc,all.map((u,i)=>({text:u.text,pos:i*30})),1,3);
  const units=proposalUnits(doc,selection),p=makeProposal('one',doc,units,output(units[0].id,'新表达'));
  const applied=applyProposal(doc,'one',p,[units[0].id]);
  const continued=continuedSelection(selection,applied.document,applied.proposal)!;
  assert.equal(continued.text,'新表达');assert.equal(proposalUnits(applied.document,continued)[0].text,'新表达');
  const request=buildRequest('chat','再调整得自然一点',applied.document,'selection',continued,[]);
  assert.equal(request.units.length,1);assert.equal(request.units[0].text,'新表达');
  assert.equal(continuedSelection(selection,{...applied.document,content:applied.document.content+' '},applied.proposal),undefined);
 }
});

test('saved proposal paths are re-derived and cannot redirect writes into another field',()=>{
 const doc=blocks(),units=proposalUnits(doc),p=makeProposal('one',doc,units,output(units[0].id,'安全改写'));
 p.units[0].path=['__proto__','polluted'];
 const result=applyProposal(doc,'one',p,[units[0].id]);
 assert.equal(JSON.parse(result.document.content)[0].content[0].text,'安全改写');
 assert.equal(({} as any).polluted,undefined);
});
