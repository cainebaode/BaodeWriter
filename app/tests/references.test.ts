import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, newNote, noteKey } from '../web/model';
import { articleHTML } from '../web/sourceImport';
import { adoptAnnotation, addMaterials, anchorPosition, citedSnapshot, generatedMaterials, materialFromSource, materialSnapshot, quoteMarkdown, referenceInput, replyMaterials, sourceParts, updateAdoption, validReferenceUses, type Source } from '../web/references';
import { buildRequest, type AIMessage } from '../web/ai';

const source=():Source=>({id:'s',title:'原文',author:'原作者',url:'https://example.com/article',at:'now',versions:[{id:'v1',at:'now',document:{...emptyDocument(),title:'原文',contentType:'markdown',content:'# 章节\n\n前文。\n\n相同的一句话。\n\n后文。\n\n不会附带的远处材料。\n\n相同的一句话。'}}],annotations:[{id:'a',versionID:'v1',parts:['p2'],quote:'相同的一句话。',text:'这是我的判断，不等同于原作者立场。',revision:1,at:'now'}]});

test('adopted annotations and old source versions remain isolated across manuscripts',()=>{
 const original=source(),one=adoptAnnotation(original,original.annotations[0]),two=structuredClone(one);
 const changed={...original,title:'改名',archived:true,annotations:[{...original.annotations[0],text:'新判断',revision:2}],versions:[...original.versions,{...original.versions[0],id:'v2',document:{...original.versions[0].document,content:'新版本全文。'}}]};
 const adopted=updateAdoption(changed,one);
 assert.equal(adopted.text,'新判断');assert.equal(adopted.versionID,'v1');assert.equal(two.text,original.annotations[0].text);
 const snap=materialSnapshot({...two,aiScope:'excerpt'},[changed])!;
 assert.equal(snap.title,'原文');assert(snap.parts.some(p=>p.markdown==='前文。'));assert(!snap.parts.some(p=>p.markdown.includes('新版本')));
 assert.equal(original.annotations[0].revision,1);
});

test('excerpt context uses exact paragraph positions even when text is repeated',()=>{
 const s=source(),m=adoptAnnotation(s,s.annotations[0]),snapshot=materialSnapshot({...m,aiScope:'excerpt'},[s])!;
 assert.deepEqual(snapshot.parts.map(p=>p.id),['p1','p2','p3']);assert.deepEqual(snapshot.selectedParts,['p2']);
 assert(!JSON.stringify(referenceInput([snapshot])).includes('远处材料'));
 assert.equal(materialSnapshot(m,[s]),undefined);
 const whole=materialSnapshot({...m,parts:[],quote:'',aiScope:'excerpt'},[s])!;assert.equal(whole.parts.length,0);assert.equal(whole.note,m.text);
 assert.throws(()=>materialSnapshot({...m,versionID:'missing',aiScope:'full'},[s]),/缺失/);
 assert.throws(()=>materialSnapshot({...m,parts:['p999'],aiScope:'excerpt'},[s]),/无法定位/);
});

test('material scope is explicitly selected and source bodies never become writable targets',()=>{
 const s=source(),m=adoptAnnotation(s,s.annotations[0]),snap=materialSnapshot({...m,aiScope:'excerpt'},[s])!;
 const doc={...emptyDocument(),contentType:'markdown' as const,content:'我的正文。'};
 const request=buildRequest('chat','基于我的批注讨论',doc,'full',undefined,[],'',{materials:[snap]});
 const input=JSON.parse(request.messages.at(-1)!.content);assert.equal(input.参考内容.title,'');assert.equal(input.只读附加材料[0].批注.内容,m.text);
 assert.deepEqual(input.允许整段修改,['p0']);assert(request.messages[0].content.includes('不是写入目标'));
 const plain=buildRequest('chat','本轮不使用资料',doc,'full',undefined,[]);assert(!JSON.stringify(plain.messages).includes(m.text));
});

test('without-history requests exclude old discussion, selected references and pending drafts',()=>{
 const doc={...emptyDocument(),title:'我的文章',contentType:'markdown' as const,content:'当前正文。'};
 const history:AIMessage[]=[{id:'old',at:'now',role:'user',text:'旧资料中的隐私判断。',context:'选中内容',reference:'旧资料摘录'}, {id:'reply',at:'now',role:'assistant',text:'旧的回答',article:{noteID:'n',base:doc,document:{...doc,content:'未接受的旧稿。'},markdown:'未接受的旧稿。',beforeMarkdown:doc.content,state:'pending'}}];
 const withHistory=buildRequest('chat','继续',doc,'full',undefined,history);
 assert(withHistory.messages.some(m=>m.content.includes('旧资料摘录')));
 const without=buildRequest('chat','重新讨论',doc,'full',undefined,history,'写作约定',{withoutHistory:true});
 const text=JSON.stringify(without.messages);assert(!text.includes('旧资料'));assert(!text.includes('未接受的旧稿'));assert(text.includes('当前正文'));assert(text.includes('写作约定'));
 assert.equal(without.workingDocument,doc);assert.equal(history.length,2);
});

test('only actual sent positions can be used as AI citation identifiers',()=>{
 const s=source(),m=adoptAnnotation(s,s.annotations[0]),snapshot=materialSnapshot({...m,aiScope:'excerpt'},[s])!;
 const accepted=validReferenceUses([{id:m.id,parts:['p2'],paragraph:'新文章段落。'},{id:m.id,parts:['p5']},{id:'made-up',parts:['p2']},{id:m.id,parts:[]}],[snapshot]);
 assert.equal(accepted.length,1);assert.deepEqual(accepted[0].parts,['p2']);assert.deepEqual(validReferenceUses('wrong',[snapshot]),[]);
});

test('generated references attach only to a uniquely matched paragraph and remain private',()=>{
 const s=source(),m=adoptAnnotation(s,s.annotations[0]),n=newNote();n.document={...emptyDocument(),contentType:'blocknote',content:JSON.stringify([{id:'one',type:'paragraph',content:[{type:'text',text:'新文章段落。'}],children:[]}])};
 const before=noteKey(n),materials=generatedMaterials([m],n.document,[{id:m.id,parts:['p2'],paragraph:'新文章段落。'}]);
 assert.deepEqual(materials[0].anchor,{format:'blocknote',blockID:'one'});const withReferences={...n,materials};assert.equal(noteKey(withReferences),before);
 const duplicate={...n.document,content:JSON.stringify([{id:'one',content:[{text:'重复段落。'}]},{id:'two',content:[{text:'重复段落。'}]}])};
 assert.equal(generatedMaterials([m],duplicate,[{id:m.id,parts:['p2'],paragraph:'重复段落。'}])[0].anchor,undefined);
 const anchored=addMaterials(n,[m]);assert.equal(addMaterials(anchored,[structuredClone(m)]).materials!.length,1);
});

test('paragraph anchors survive movement and refuse ambiguous Markdown relocation',()=>{
 const doc={...emptyDocument(),contentType:'blocknote' as const,content:JSON.stringify([{id:'other'},{id:'parent',children:[{id:'selected'}]}])};
 assert.equal(anchorPosition(doc,{format:'blocknote',blockID:'selected'}),0);assert.equal(anchorPosition(doc,{format:'blocknote',blockID:'missing'}),undefined);
 const markdown={...emptyDocument(),contentType:'markdown' as const,content:'新开头。\n\n原来的段落。'};
 assert.equal(anchorPosition(markdown,{format:'markdown',text:'原来的段落。',start:0}),6);
 assert.equal(anchorPosition({...markdown,content:'重复。\n\n重复。'},{format:'markdown',text:'重复。',start:1}),undefined);
});

test('accepted old AI material snapshots do not silently adopt newer annotations',()=>{
 const s=source(),old=adoptAnnotation(s,s.annotations[0]),snap=materialSnapshot({...old,aiScope:'excerpt'},[s])!;
 const newer={...old,text:'已经更新的判断',annotationRevision:2};
 const reply:AIMessage={id:'r',role:'assistant',text:'',at:'now',materials:[snap],referenceUses:[{id:old.id,parts:['p2']}]};
 const result=replyMaterials([newer],reply,emptyDocument());assert.equal(result.length,2);assert(result.some(m=>m.text===old.text));assert.equal(newer.text,'已经更新的判断');
});

test('article import keeps readable headings, links, tables and lazy images without executing markup',()=>{
 const html='<html><head><meta property="og:title" content="文章标题"></head><body><nav>菜单</nav><div id="js_name">作者甲</div><div id="js_content"><h2>第一节</h2><p>原文<strong>重点</strong>与<a href="/path">链接</a></p><img data-src="https://cdn.example.com/a.png" alt="配图"><table><tr><th>名称</th><th>判断</th></tr><tr><td>甲</td><td>乙</td></tr></table><script>secret()</script></div></body></html>';
 const result=articleHTML(html,'https://example.com/post');assert.equal(result.title,'文章标题');assert.equal(result.author,'作者甲');
 assert(result.markdown.includes('## 第一节'));assert(result.markdown.includes('**重点**'));assert(result.markdown.includes('[链接](https://example.com/path)'));assert(result.markdown.includes('![配图](https://cdn.example.com/a.png)'));assert(result.markdown.includes('| 甲 | 乙 |'));assert(!result.markdown.includes('secret'));assert(!result.markdown.includes('菜单'));
 const quote=quoteMarkdown(adoptAnnotation(source(),source().annotations[0]),source());assert(quote.startsWith('> 相同的一句话。'));assert(quote.includes('https://example.com/article'));
 assert.equal(sourceParts(source().versions[0]).filter(p=>p.text==='相同的一句话。').length,2);
});

test('WeChat verification and unavailable pages cannot be imported as articles',()=>{
 const url='https://mp.weixin.qq.com/s/example';
 assert.throws(()=>articleHTML('<html><body><h2>环境异常</h2><p>当前环境异常，完成验证后即可继续访问。</p><a href="/verify">去验证</a></body></html>',url),/尚未读到公众号正文/);
 assert.throws(()=>articleHTML('<title>微信公众平台</title><p>该内容已被发布者删除</p>',url),/尚未读到公众号正文/);
 assert.throws(()=>articleHTML('<h1 id="activity-name">文章标题</h1><div id="js_content"></div>',url),/尚未读到公众号正文/);
 const article=articleHTML('<h1 id="activity-name">环境异常如何影响阅读</h1><div id="js_name">作者甲</div><div id="js_content"><p>正常文章可以讨论环境异常与去验证。</p><section><img data-src="https://cdn.example.com/picture.jpg"></section></div>',url);
 assert.equal(article.title,'环境异常如何影响阅读');assert.equal(article.author,'作者甲');assert(article.markdown.includes('正常文章'));assert(article.markdown.includes('picture.jpg'));
 assert.equal(articleHTML('<p>手动粘贴的选段仍可读取。</p>',url,false).markdown,'手动粘贴的选段仍可读取。');
});

test('nested and empty article emphasis remains readable without extra Markdown markers',()=>{
 const result=articleHTML('<article><p>作者：甲<strong><br></strong></p><p><strong> 联合<strong>甲</strong></strong><strong>、乙 </strong></p><p><strong><p>第一段。</p><p>第二段。</p></strong></p><p>字面 * 星号与 <code>a*b</code>。</p></article>','https://example.com/article');
 assert(!result.markdown.includes('****'));assert(result.markdown.includes('**联合甲**'));assert(!result.markdown.includes('**\n**'));assert(result.markdown.includes('字面 \\* 星号'));assert(result.markdown.includes('`a*b`'));
 const punctuation=articleHTML('<p><strong>完整句子。</strong>下一句。前文<strong>“重点”</strong>结束。</p>','https://example.com/article');
 const rendered=sourceParts({id:'v',at:'now',document:{...emptyDocument(),contentType:'markdown',content:punctuation.markdown}}).map(p=>p.text).join('');assert(!rendered.includes('**'));assert(rendered.includes('完整句子。'));assert(rendered.includes('“重点”'));
});

test('AI references to a neighbouring paragraph preserve the actual cited position and the annotation subject',()=>{
 const s=source(),m=adoptAnnotation(s,s.annotations[0]),snapshot=materialSnapshot({...m,aiScope:'full'},[s])!;
 const derived=citedSnapshot(snapshot,['p4']);assert.equal(derived.quote,'不会附带的远处材料。');assert.equal(derived.annotationQuote,m.quote);assert.equal(citedSnapshot({...snapshot,allParts:[]},['p4']).quote,derived.quote);
 const doc={...emptyDocument(),contentType:'blocknote' as const,content:JSON.stringify([{id:'body',content:[{text:'我的新段落。'}]}])};
 const reply:AIMessage={id:'reply',role:'assistant',text:'',at:'now',materials:[snapshot],referenceUses:[{id:m.id,parts:['p4'],paragraph:'我的新段落。'}]};
 const result=replyMaterials([m],reply,doc),attached=result.find(m=>m.anchor)!;
 assert.deepEqual(attached.parts,['p4']);assert.equal(attached.quote,derived.quote);assert.equal(attached.annotationQuote,m.quote);
 const newer={...attached,id:'newer',versionID:'v2',text:'新版批注'};
 const both=replyMaterials([m,newer],reply,doc);assert(both.some(m=>m.anchor&&m.versionID==='v1'&&m.parts[0]==='p4'));assert(both.some(m=>m.versionID==='v2'));
});

test('history source selection and public attribution use the chosen immutable version',()=>{
 const s=source();s.versions[0].author='旧作者';s.versions[0].url='https://example.com/old';
 s.versions.push({...s.versions[0],id:'v2',author:'新作者',url:'https://example.com/new',document:{...s.versions[0].document,title:'新标题'}});s.title='新标题';s.author='新作者';s.url='https://example.com/new';
 assert.equal(materialFromSource(s,'v1').versionID,'v1');const old=adoptAnnotation(s,s.annotations[0]);const citation=quoteMarkdown(old,s);assert(citation.includes('旧作者'));assert(citation.includes('/old'));assert(!citation.includes('新作者'));assert(!citation.includes('/new'));
 assert.equal(materialSnapshot({...old,aiScope:'excerpt'},[s])!.author,'旧作者');
});

test('normal micro edits share their base while pending draft requests expose both sent versions',()=>{
 const base={...emptyDocument(),contentType:'markdown' as const,content:'保存原稿。'};
 assert.equal(buildRequest('chat','改一个词',base,'full',undefined,[]).workingDocument,base);
 const pending={...base,content:'未接受的新版。'},history:AIMessage[]=[{id:'r',role:'assistant',text:'',at:'now',article:{base,noteID:'n',document:pending,markdown:pending.content,beforeMarkdown:base.content,state:'pending'}}];
 const request=buildRequest('chat','继续修改',base,'full',undefined,history);
 assert.equal(request.workingDocument,pending);assert(request.originalReference!.content.join('').includes('保存原稿'));assert(request.reference.includes('未接受的新版'));
});
