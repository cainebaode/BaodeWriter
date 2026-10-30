import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyArticle, buildRequest, parseArticle, type ArticleProposal, type AIMessage } from '../web/ai';
import { emptyDocument, type Document } from '../web/model';
import { diffLines } from '../web/diff';

const md=(content:string):Document=>({...emptyDocument(),title:'原题',contentType:'markdown',content});
const draft=(base:Document,content:string):ArticleProposal=>({noteID:'one',base,document:{...base,title:'新题',content},markdown:content,beforeMarkdown:base.content,state:'pending'});

test('complete writing receives document structure, links and code instead of flattened text',()=>{
 const doc=md('## 第一个章节\n\n[材料](https://example.com)\n\n```js\nconst x=1\n```');
 const request=buildRequest('write','围绕这个主题写一篇完整文章',doc,'full',undefined,[]);
 assert.equal(JSON.parse(request.reference).content.map((p:any)=>p.content).join('\n\n'),doc.content);
 assert(request.messages[0].content.includes('完整文章'));
 assert(request.messages[0].content.includes('段落衔接'));
 assert(request.messages[0].content.includes('## 章节'));
 assert(request.messages[0].content.includes('article'));
 const rich={...emptyDocument(),content:JSON.stringify([{id:'h',type:'heading',props:{level:2},content:[{type:'text',text:'主旨'}]}])};
 assert.equal(JSON.parse(buildRequest('rewrite','重新组织章节',rich,'full',undefined,[]).reference).content[0].content.props.level,2);
});
test('article parsing keeps Markdown structure and removes a duplicate document heading',()=>{
 assert.deepEqual(parseArticle({title:' 慢慢写下来 ',markdown:'```markdown\n# 慢慢写下来\n\n导语。\n\n## 找到主线\n\n- 一个想法\n```'}),{title:'慢慢写下来',markdown:'导语。\n\n## 找到主线\n\n- 一个想法'});
 for(const value of [null,{title:'标题',markdown:'# 标题'},{title:'标题'},{title:'坏\n标题',markdown:'正文'}])assert.throws(()=>parseArticle(value),/完整|正文/);
});
test('article acceptance changes the whole structure once, retains current metadata and rejects stale results',()=>{
 const base=md('导语。\n\n## 旧结构\n\n旧正文。'),proposal=draft(base,'新导语。\n\n## 论点\n\n论据。\n\n## 回到主旨\n\n结尾。');
 const doc=applyArticle({...base,tags:['新标签'],description:'新的摘要'},'one',proposal);
 assert.equal(doc.content,proposal.document.content);assert.equal(doc.title,'新题');assert.deepEqual(doc.tags,['新标签']);assert.equal(doc.description,'新的摘要');
 assert.equal(base.content.includes('旧正文'),true);
 assert.throws(()=>applyArticle(base,'other',proposal),/发起任务/);
 assert.throws(()=>applyArticle({...base,title:'用户的新标题'},'one',proposal),/原文已变化/);
 assert.throws(()=>applyArticle({...base,content:'新写的正文'},'one',proposal),/原文已变化/);
 assert.throws(()=>applyArticle(base,'one',{...proposal,state:'accepted'}),/重复/);
 assert.throws(()=>applyArticle(base,'one',{...proposal,state:'skipped'}),/已经处理/);
});
test('a rewrite cannot silently drop existing media, links or code',()=>{
 const base=md('旧文字。\n\n![图](writer-asset://local/a.png)\n\n[出处](https://example.com/source)\n\n```js\nconst x=1;\n```');
 const proposal=draft(base,base.content.replace('旧文字。','## 新章节\n\n新文字。'));
 assert.equal(applyArticle(base,'one',proposal).content,proposal.document.content);
 for(const remove of ['![图](writer-asset://local/a.png)','[出处](https://example.com/source)','```js\nconst x=1;\n```'])assert.throws(()=>applyArticle(base,'one',draft(base,proposal.document.content.replace(remove,''))),/遗漏/);
});
test('follow-up context includes the complete pending draft and its acceptance state',()=>{
 const base=md('旧文'),article=draft(base,'## 新结构\n\n完整新稿。');
 const history:AIMessage[]=[{id:'a',role:'assistant',text:'建议版',at:'now',article}];
 const request=buildRequest('chat','把第二节写得更具体',base,'full',undefined,history);
 assert(request.messages[1].content.includes('完整新稿。'));assert(request.messages[1].content.includes('pending'));
 const free=buildRequest('write','写一篇完整文章',base,'chat',undefined,[]);
 assert.equal(free.reference,'');assert.equal(free.units.length,0);assert(!JSON.stringify(free.messages).includes('旧文'));
});
test('diffs reconstruct both documents, including empty drafts and long rewrites',()=>{
 for(const [before,after] of [['','新稿'],['旧文',''],['标题\n\n甲\n乙','标题\n\n甲修改\n乙'],['不变','不变'],['甲\n乙\n丙','丙\n甲\n丁'],['旧\n'.repeat(600),'新\n'.repeat(600)]]){
  const lines=diffLines(before,after);
  assert.equal(lines.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),before);
  assert.equal(lines.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),after);
 }
});
