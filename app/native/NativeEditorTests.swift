import Foundation

enum NativeEditorTests {
    static func seed(_ store: WriterStore) throws {
        let blocks: [[String: Any]] = [
            ["id":"p1","type":"paragraph","props":[:],"content":[["type":"text","text":"第一段正文写下我的想法。","styles":[:]]],"children":[]],
            ["id":"p2","type":"paragraph","props":[:],"content":[["type":"text","text":"第二段正文保持独立。","styles":["bold":true]]],"children":[]]
        ]
        let content = String(data: try JSONSerialization.data(withJSONObject: blocks), encoding: .utf8)!
        func note(_ id: String, _ title: String, _ content: String, _ type: String) -> [String: Any] {
            ["id":id,"document":["title":title,"content":content,"contentType":type,"slug":"","description":"","tags":[],"coverImage":""],"base":NSNull(),"assets":[:],"createdAt":"2026-10-25T12:00:00.000Z","updatedAt":"2026-10-25T12:00:00.000Z","displayDate":"2026-10-25T12:00:00.000Z"]
        }
        _ = try store.save(["schema":1,"notes":[note("fixture-block","富文本验证",content,"blocknote"),note("fixture-md","Markdown 验证","前面的内容。\n\n需要润色的段落。\n\n后面的内容。","markdown")]])
    }

    static let trashScript = #"""
    const bridge=args=>window.webkit.messageHandlers.native.postMessage(args);
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const checks=[];
    const encode=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
    const assert=(value,label)=>{if(!value)throw new Error(label+'; passed: '+checks.join(', '));checks.push(label);};
    const wait=async(fn,label)=>{for(let i=0;i<100;i++){const value=fn();if(value)return value;await pause(70);}throw new Error('Timeout: '+label+'; passed: '+checks.join(', '));};
    const button=(label,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>(b.textContent.trim()===label||b.getAttribute('aria-label')===label)&&!b.disabled&&b.getClientRects().length);
    const click=async(label,root=document)=>{(await wait(()=>button(label,root),label)).click();await pause(120);};
    const load=async()=>{await window.flushAll();return (await bridge({action:'load'})).library;};
    const dialog=()=>document.querySelector('[role="dialog"]');
    const fromList=async title=>{Array.from(document.querySelectorAll('.note-row>.tree-title')).find(b=>b.textContent.includes(title)).click();await pause(120);};
    const confirmTrash=async()=>{await click('删除文稿');await click('移到废纸篓',dialog());await wait(()=>!dialog(),'trash save');};
    const trashRow=title=>Array.from(document.querySelectorAll('.trash-row')).find(el=>el.querySelector('strong').textContent===title);
    await wait(()=>document.querySelector('.paper'),'editor ready');
    const originals=(await load()).notes;
    await click('新文稿');const blank=(await load()).notes.find(n=>!n.id.startsWith('fixture'));
    assert(!!button('删除文稿'),'new blank document has a visible delete action');
    await click('删除文稿');assert(dialog().textContent.includes('无标题文稿')&&dialog().textContent.includes('网站上的文章不会被删除'),'deletion dialog identifies document and local-only scope');
    await click('取消',dialog());assert(!(await load()).notes.find(n=>n.id===blank.id).trashedAt,'cancel leaves the document unchanged');
    await confirmTrash();
    assert(!!(await load()).notes.find(n=>n.id===blank.id).trashedAt,'trash keeps the blank document recoverable');
    assert(!document.querySelector('[aria-controls="document-'+blank.id+'"]')&&!Array.from(document.querySelectorAll('.note-row strong')).some(el=>el.textContent==='无标题文稿'),'trash closes its tab and removes it from normal list');
    await click('废纸篓');assert(!!trashRow('无标题文稿'),'trash is discoverable from the document list footer');
    await click('恢复',trashRow('无标题文稿'));await wait(()=>!dialog(),'restore save');
    const recovered=(await load()).notes.find(n=>n.id===blank.id);
    assert(encode(recovered)===encode(blank),'restore preserves the entire original note');
    assert(document.querySelector('.document-pane').dataset.noteId===blank.id,'restored document opens for writing');
    await confirmTrash();await click('废纸篓');await click('彻底删除…',trashRow('无标题文稿'));
    assert(dialog().textContent.includes('无法从废纸篓恢复'),'permanent deletion explains irreversibility');
    await click('取消',dialog());assert(!!(await load()).notes.find(n=>n.id===blank.id),'cancel permanent deletion retains the note');
    await click('彻底删除…',trashRow('无标题文稿'));await click('确认彻底删除',dialog());await wait(()=>dialog()?.getAttribute('aria-label')==='废纸篓','permanent deletion save');
    assert(!(await load()).notes.some(n=>n.id===blank.id),'confirmed permanent deletion removes only the target note');
    assert(encode((await load()).notes)===encode(originals),'other original documents remain unchanged');
    await click('关闭',dialog());await fromList('Markdown 验证');document.querySelector('.document-tab-actions summary').click();await click('富文本验证',document.querySelector('.split-menu'));
    assert(document.querySelectorAll('.document-pane').length===2,'comparison is open before deletion');
    await confirmTrash();assert(document.querySelectorAll('.document-pane').length===1&&document.querySelector('.document-pane').dataset.noteId==='fixture-block','deleting one split document keeps the other paper');
    await click('新文稿');const title=document.querySelector('.document-pane .title');title.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(title,'一次临时记录');title.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);
    await click('文稿库菜单');await click('批量选择');
    document.querySelector('[aria-label="选择 富文本验证"]').click();document.querySelector('[aria-label="选择 一次临时记录"]').click();await pause(100);
    await click('删除',document.querySelector('.selection'));assert(dialog().querySelectorAll('.removal-list li').length===2,'batch deletion lists both selected documents');
    await click('移到废纸篓',dialog());await wait(()=>!dialog(),'batch trash save');
    assert(!document.querySelector('.document-pane')&&document.querySelectorAll('.note-row').length===0,'trashing remaining open documents leaves a clean empty workspace');
    assert((await load()).notes.filter(n=>n.trashedAt).length===3,'all three trashed notes remain in local storage');
    await click('废纸篓');await click('恢复',trashRow('Markdown 验证'));await wait(()=>!dialog(),'restore original');
    assert(encode((await load()).notes.find(n=>n.id==='fixture-md'))===encode(originals.find(n=>n.id==='fixture-md')),'restored original retains exact content and metadata');
    await click('废纸篓');await window.flushAll();return checks;
    """#

    static let workspaceScript = #"""
    const bridge=args=>window.webkit.messageHandlers.native.postMessage(args);
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const checks=[];
    const assert=(value,label)=>{if(!value)throw new Error(label+'; passed: '+checks.join(', '));checks.push(label);};
    const wait=async(fn,label)=>{for(let i=0;i<100;i++){const value=fn();if(value)return value;await pause(70);}throw new Error('Timeout: '+label+'; passed: '+checks.join(', '));};
    const button=(label,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>(b.textContent.trim()===label||b.getAttribute('aria-label')===label)&&!b.disabled&&b.getClientRects().length);
    const click=async(label,root=document)=>{(await wait(()=>button(label,root),label)).click();await pause(100);};
    const setValue=(el,value)=>{el.focus();const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const load=async()=>{await window.flushAll();return (await bridge({action:'load'})).library;};
    const pane=id=>document.querySelector('.document-pane[data-note-id="'+id+'"]');
    const tab=id=>document.querySelector('[role="tab"][aria-controls="document-'+id+'"]');
    const visible=()=>Array.from(document.querySelectorAll('.document-pane')).map(el=>el.dataset.noteId);
    const openTab=async id=>{tab(id).click();await pause(100);};
    const fromList=async title=>{const b=Array.from(document.querySelectorAll('.note-row>.tree-title')).find(b=>b.textContent.includes(title));b.click();await pause(120);};
    const compare=async title=>{document.querySelector('.document-tab-actions summary').click();await click(title,document.querySelector('.split-menu'));};
    const closeTab=async id=>{tab(id).parentElement.querySelector('.tab-close').click();await pause(100);};
    await wait(()=>pane('fixture-block'),'first paper');
    assert(document.querySelectorAll('.sidebar').length===1&&!document.querySelector('.organizer')&&document.querySelector('.sidebar [aria-label="文稿树"]')&&document.querySelector('.sidebar .note-list'),'folders and documents share one sidebar');
    const navIcon=document.querySelector('.tree-title .icon'),navButton=navIcon.closest('button');
    assert(Math.abs(navIcon.getBoundingClientRect().top+navIcon.getBoundingClientRect().height/2-navButton.getBoundingClientRect().top-navButton.getBoundingClientRect().height/2)<1,'navigation icons align with their text rows');

    const moveTo=async(title,target)=>{await click('更多 '+title);await click('移动到…',document.querySelector('[role="menu"]'));const select=document.querySelector('select[aria-label="目标位置"]');select.value=target;select.dispatchEvent(new Event('change',{bubbles:true}));await pause(80);await click('确认移动',document.querySelector('[role="dialog"]'));await pause(100);};
    await moveTo('Markdown 验证','note:fixture-block');
    assert((await load()).notes.find(n=>n.id==='fixture-md').parentId==='fixture-block','moving a document under another persists its parent');
    assert(document.querySelector('[data-tree-target="note:fixture-md"]').closest('ul').getAttribute('role')==='group','child document appears in its parent branch');
    await click('折叠 富文本验证');assert(!document.querySelector('[data-tree-target="note:fixture-md"]')&&pane('fixture-block'),'folding a branch leaves the open paper unchanged');
    setValue(document.querySelector('[aria-label="搜索文稿"]'),'Markdown 验证');await pause(120);
    assert(document.querySelector('[data-tree-target="note:fixture-md"]')&&document.querySelector('[data-tree-target="note:fixture-block"]').classList.contains('tree-context'),'search shows the matching child with parent context');
    setValue(document.querySelector('[aria-label="搜索文稿"]'),'');await pause(100);await click('展开 富文本验证');
    await click('在 富文本验证 下新建文稿');const child=(await load()).notes.find(n=>!n.id.startsWith('fixture'));
    assert(child.parentId==='fixture-block','row plus creates a child of that row');
    setValue(document.querySelector('.document-pane .title'),'子文稿交互验证');await pause(100);
    assert(document.querySelector('.document-location').textContent.includes('富文本验证'),'child breadcrumb shows its editable parent');
    await click('更多 富文本验证');await click('移动到…',document.querySelector('[role="menu"]'));
    const destinations=Array.from(document.querySelector('[aria-label="目标位置"]').options).map(o=>o.value);
    assert(!destinations.includes('note:'+child.id)&&!destinations.includes('note:fixture-md')&&!destinations.includes('note:fixture-block'),'move picker excludes the entire source branch');
    await click('取消',document.querySelector('[role="dialog"]'));
    await click('删除文稿');await click('移到废纸篓',document.querySelector('[role="dialog"]'));await pause(120);
    await click('废纸篓');const trashRow=Array.from(document.querySelectorAll('.trash-row')).find(r=>r.querySelector('strong').textContent==='子文稿交互验证');await click('恢复',trashRow);await pause(120);
    assert((await load()).notes.find(n=>n.id===child.id).parentId==='fixture-block','restoring a child reconnects it to its original parent');
    await click('删除文稿');await click('移到废纸篓',document.querySelector('[role="dialog"]'));await pause(120);await click('废纸篓');await click('彻底删除…',document.querySelector('.trash-row'));await click('确认彻底删除',document.querySelector('[role="dialog"]'));await pause(120);await click('关闭',document.querySelector('[role="dialog"]'));
    await moveTo('Markdown 验证','root');
    assert(!(await load()).notes.find(n=>n.id==='fixture-md').parentId,'a child can move back to the library root');
    assert(document.querySelectorAll('[role="tab"]').length===1,'first document has one tab');
    const original=(await load()).notes.find(n=>n.id==='fixture-block').document.content;
    await fromList('Markdown 验证');await fromList('富文本验证');
    assert(document.querySelectorAll('[role="tab"]').length===2,'reopening an existing document does not duplicate tabs');
    await click('新文稿');
    const third=(await load()).notes.find(n=>!n.id.startsWith('fixture')).id;
    const longTitle='关于日常写作的一篇很长很长的文稿标题，用来检查标签不会撑开布局';
    setValue(pane(third).querySelector('.title'),longTitle);await pause(100);
    const widths=Array.from(document.querySelectorAll('.document-tab')).map(el=>el.getBoundingClientRect().width);
    assert(widths.every(w=>Math.abs(w-156)<1),'short and long document titles have the same fixed tab width');
    assert(tab(third).title===longTitle&&getComputedStyle(tab(third).querySelector('span')).textOverflow==='ellipsis','long title is truncated with full title on hover');
    await openTab('fixture-block');await compare('Markdown 验证');
    assert(JSON.stringify(visible())===JSON.stringify(['fixture-block','fixture-md']),'comparison opens exactly two different documents');
    const leftEditor=pane('fixture-block').querySelector('.bn-editor');
    const md=pane('fixture-md').querySelector('[aria-label="Markdown 正文"]');
    setValue(md,'# 右侧的写作提纲\n\n从一个具体的生活片段开始。\n\n## 留下想法\n\n记录当时的感受，再写下现在的理解。');await pause(150);
    assert(tab('fixture-md').getAttribute('aria-selected')==='true','editing the right paper updates the active tab');
    assert((await load()).notes.find(n=>n.id==='fixture-block').document.content===original,'right Markdown edit leaves left document untouched');
    const rich=leftEditor.matches('[contenteditable="true"]')?leftEditor:leftEditor.querySelector('[contenteditable="true"]');
    rich.focus();const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let textNode;while((textNode=walker.nextNode())&&!textNode.textContent.includes('第一段正文')){}
    const range=document.createRange();range.selectNodeContents(textNode);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,' 左侧继续写下新的想法。');await pause(150);
    assert((await load()).notes.find(n=>n.id==='fixture-block').document.content.includes('左侧继续写下新的想法'),'left rich text saves to its own document');
    assert((await load()).notes.find(n=>n.id==='fixture-md').document.content.startsWith('# 右侧的写作提纲'),'left rich edit leaves right Markdown untouched');
    assert(pane('fixture-block').querySelector('.bn-editor')===leftEditor,'switching focus keeps the rich editor mounted');
    await click('设置');setValue(document.querySelector('.settings textarea'),'左侧的摘要');await pause(100);
    md.focus();await pause(100);assert(document.querySelector('.settings textarea').value==='','inspector follows the focused right document');
    setValue(document.querySelector('.settings textarea'),'右侧的摘要');await pause(100);
    const library=await load();assert(library.notes.find(n=>n.id==='fixture-block').document.description==='左侧的摘要'&&library.notes.find(n=>n.id==='fixture-md').document.description==='右侧的摘要','inspector changes are isolated by document');
    if(!document.querySelector('.outline-panel.expanded'))await click('展开目录');await wait(()=>document.querySelector('.outline-link')?.textContent.includes('右侧'),'right outline');assert(document.querySelector('.outline-link').textContent==='右侧的写作提纲','outline follows the active paper');
    await click('AI 助手');assert(document.querySelector('.ai-context').textContent==='Markdown 验证','AI context follows right document');
    rich.focus();await pause(100);assert(document.querySelector('.ai-context').textContent==='富文本验证','AI context follows left document');await click('收起 AI 助手');
    md.focus();await pause(100);await click('预览');assert(!pane('fixture-md').querySelector('[aria-label="Markdown 正文"]')&&pane('fixture-block').querySelector('[contenteditable="true"]'),'preview applies only to the active document');
    await click('继续编辑');await openTab(third);
    assert(JSON.stringify(visible())===JSON.stringify(['fixture-block',third]),'a third tab replaces only the focused right pane');
    await closeTab('fixture-md');assert(visible().length===2,'closing a hidden tab preserves both visible papers');
    await closeTab(third);assert(JSON.stringify(visible())===JSON.stringify(['fixture-block']),'closing one comparison tab returns to a single paper');
    await fromList('Markdown 验证');await compare('富文本验证');await openTab('fixture-block');await click('结束分栏');
    assert(JSON.stringify(visible())===JSON.stringify(['fixture-block']),'ending comparison retains the focused document');
    await closeTab('fixture-block');await closeTab('fixture-md');
    assert(visible().length===0&&(await load()).notes.length===3,'closing every tab leaves all saved documents intact');
    await fromList(longTitle);await fromList('富文本验证');await fromList('Markdown 验证');
    for(let i=1;i<=6;i++){await click('新文稿');setValue(document.querySelector('.document-pane .title'),'对照写作草稿 '+i);await pause(70);}
    await openTab('fixture-block');await compare('Markdown 验证');
    const strip=document.querySelector('.document-tab-strip');assert(strip.scrollWidth>strip.clientWidth,'many tabs scroll horizontally without widening the workspace');
    const stored=JSON.parse(localStorage.getItem('baode-writer-documents'));assert(stored.tabs.length===9&&stored.panes.join(',')==='fixture-block,fixture-md','open tabs and comparison are saved as view preferences');
    const longMarkdown='# 文章开头\n\n'+('这是用来验证滚动定位的正文段落。\n\n'.repeat(28))+'## 中间章节\n\n'+('继续写一段有主线的内容。\n\n'.repeat(28))+'## 最后章节\n\n最后的结尾。';
    setValue(pane('fixture-md').querySelector('[aria-label="Markdown 正文"]'),longMarkdown);await pause(150);
    if(!document.querySelector('.outline-panel.expanded'))await click('展开目录');await pause(120);
    if(!document.querySelector('.outline-link'))await click('展开目录');
    Array.from(document.querySelectorAll('.outline-link')).at(-1).click();await pause(700);
    assert(pane('fixture-md').querySelector('.paper').scrollTop>200,'Markdown outline scrolls the writing paper to its heading');
    const mdSource=pane('fixture-md').querySelector('[aria-label="Markdown 正文"]');
    assert(mdSource.selectionStart===longMarkdown.indexOf('## 最后章节'),'Markdown outline also places the cursor at the selected heading');
    assert(document.querySelector('.outline-link[aria-current="location"]').textContent==='最后章节','outline highlights the visible chapter');
    await click('预览');await pause(100);Array.from(document.querySelectorAll('.outline-link')).at(1).click();await pause(700);
    assert(pane('fixture-md').querySelector('.paper').scrollTop>200,'preview outline navigates rendered Markdown headings');
    await click('收起目录');
    assert(!document.querySelector('.outline-panel.expanded'),'explicit close hides the outline');
    document.querySelector('.writing-surface').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await pause(120);
    assert(!document.querySelector('.outline-panel.expanded'),'pointer movement cannot reopen the outline');
    await window.flushAll();return checks;
    """#

    static let navigationScript = #"""
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const button=(label,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>(b.textContent.trim()===label||b.getAttribute('aria-label')===label)&&!b.disabled&&b.getClientRects().length);
    const click=async(label,root=document)=>{const b=button(label,root);if(!b)throw new Error('Missing navigation action: '+label);b.click();await pause(90);};
    const setValue=(el,value)=>{el.focus();Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const fromTree=async title=>{const b=Array.from(document.querySelectorAll('.tree-title')).find(b=>b.textContent===title);if(!b)throw new Error('Missing tree document '+title);b.click();await pause(100);};
    const title=async value=>{setValue(document.querySelector('.document-pane .title'),value);await pause(100);};
    await click('结束分栏');
    await click('文稿库菜单');await click('批量选择');
    Array.from(document.querySelectorAll('.note-row input')).filter(input=>!/富文本验证|Markdown 验证/.test(input.getAttribute('aria-label'))).forEach(input=>input.click());await pause(100);
    await click('删除',document.querySelector('.selection'));await click('移到废纸篓',document.querySelector('[role="dialog"]'));await pause(200);
    if(button('完成',document.querySelector('.tree-bulk')))await click('完成',document.querySelector('.tree-bulk'));
    await fromTree('富文本验证');await title('生活与思考');
    await fromTree('Markdown 验证');if(button('继续编辑'))await click('继续编辑');await title('把日子写下来');
    setValue(document.querySelector('[aria-label="Markdown 正文"]'),'有些日子，看上去没有发生什么。\n\n直到回头翻一翻，才发现走过的路、遇见的人，以及那些不曾留意的变化，都值得记下来。\n\n## 为什么开始记录\n\n写作不必等到有一个漂亮的答案。把今天的一个片段说清楚，就是很好的开始。\n\n### 留住具体的瞬间\n\n路上的光、一句话、一个突然冒出的念头。比起抽象的结论，这些具体的细节更接近生活本来的样子。\n\n### 给想法一点时间\n\n落到纸上的想法，会慢慢显出它自己的形状。不急着修改，先把它放在这里。\n\n## 建立自己的写作节奏\n\n每天不必写得很多。一段完整的观察，胜过给自己设定一个遥远的目标。\n\n### 从一段话开始\n\n先写发生了什么，再写自己的感受。最后问一句：这件事为什么让我记到现在？\n\n### 每周回看一次\n\n把散落的记录重新读一遍，让有关联的想法慢慢靠近。\n\n## 让记录长成文章\n\n当几个片段开始指向同一个问题，一篇文章也就有了主线。调整章节，补上背景，删去重复的话。\n\n## 留一点空白\n\n有些问题暂时没有答案。记下来，继续生活，下一次再来读。');await pause(100);
    await click('更多 把日子写下来');await click('移动到…',document.querySelector('[role="menu"]'));
    const destination=document.querySelector('[aria-label="目标位置"]');destination.value='note:fixture-block';destination.dispatchEvent(new Event('change',{bubbles:true}));await pause(100);await click('确认移动');await window.flushAll();
    const saved=(await window.webkit.messageHandlers.native.postMessage({action:'load'})).library;
    if(saved.notes.find(n=>n.id==='fixture-md').parentId!=='fixture-block')throw new Error('Moving a document did not persist the hierarchy');
    await click('在 生活与思考 下新建文稿');await title('每周复盘');await click('在 每周复盘 下新建文稿');await title('十月的最后一周');
    await click('新文稿');await title('产品与创作');await click('在 产品与创作 下新建文稿');await title('饱得写作的下一步');
    await click('新文稿');await title('阅读笔记');
    await fromTree('把日子写下来');await click('预览');if(!document.querySelector('.outline-panel.expanded'))await click('展开目录');
    const tree=document.querySelector('[aria-label="文稿树"]'),outline=document.querySelector('.outline-panel.expanded'),paper=document.querySelector('.paper');
    if(!tree.querySelector('ul[role="group"] ul[role="group"]')||outline.getBoundingClientRect().right>paper.getBoundingClientRect().left+1)throw new Error('Navigation tree or outline geometry is incorrect');
    const iconLeft=title=>Array.from(document.querySelectorAll('.tree-title')).find(b=>b.textContent===title).querySelector('.icon').getBoundingClientRect().left;
    if(Math.abs(iconLeft('把日子写下来')-iconLeft('生活与思考')-18)>1||Math.abs(iconLeft('十月的最后一周')-iconLeft('每周复盘')-18)>1)throw new Error('Parent and child indentation must increase by exactly one level');
    document.querySelector('.outline-panel.expanded').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));await pause(100);
    if(!document.querySelector('.outline-panel.expanded'))throw new Error('Persistent outline disappeared on pointer leave');
    const tabs=Array.from(document.querySelectorAll('.document-tab'));for(const tab of tabs)if(tab.querySelector('[role="tab"]').getAttribute('aria-selected')!=='true')tab.querySelector('.tab-close').click();
    if(button('关闭提示'))await click('关闭提示');
    paper.scrollTop=0;document.querySelector('.tree-scroll').scrollTop=0;await window.flushAll();await pause(250);return 'Three-level document tree, reparenting, persistent outline, and a full writing preview verified.';
    """#

    static let narrowWorkspaceScript = #"""
    await new Promise(resolve=>setTimeout(resolve,300));
    const papers=Array.from(document.querySelectorAll('.document-pane .paper')).map(el=>el.getBoundingClientRect());
    if(papers.length!==2||papers.some(r=>r.width<280||r.right>window.innerWidth+1)||papers[1].left<papers[0].right)throw new Error('Narrow comparison papers overlap or leave the viewport');
    if(Array.from(document.querySelectorAll('.document-tab')).some(el=>Math.abs(el.getBoundingClientRect().width-156)>1))throw new Error('Narrow tabs changed width');
    const toggle=document.querySelector('[aria-label="切换文稿栏"]');toggle.click();await new Promise(resolve=>setTimeout(resolve,100));
    if(!document.querySelector('.sidebar').getClientRects().length)throw new Error('Narrow navigation cannot be reopened');
    document.querySelector('.navigation-backdrop').click();await new Promise(resolve=>setTimeout(resolve,100));
    if(document.querySelector('.sidebar').getClientRects().length)throw new Error('Narrow navigation did not close');

    return true;
    """#

    static let narrowAIScript = #"""
    await new Promise(resolve=>setTimeout(resolve,350));
    const panel=document.querySelector('.ai-panel').getBoundingClientRect();
    const review=document.querySelector('[aria-label="AI 修改审阅"]').getBoundingClientRect();
    if(review.width<320||panel.left<review.right-1||panel.right>window.innerWidth+1)throw new Error('Narrow review overlaps the conversation or leaves the viewport');
    const handle=document.querySelector('.writing-surface>.resize-handle');
    if(handle){const r=handle.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,review.top+30);if(!hit?.closest('[aria-label="AI 修改审阅"]'))throw new Error('Outline resize handle covers the AI review');}

    const accept=document.querySelector('.review-footer button.primary').getBoundingClientRect();
    if(accept.bottom>window.innerHeight||accept.right>review.right)throw new Error('Narrow acceptance action is outside the review surface');
    const toolbar=document.querySelector('.toolbar');
    if(Array.from(toolbar.querySelectorAll('button')).some(b=>{const r=b.getBoundingClientRect();return r.width&&r.right>window.innerWidth+1;}))throw new Error('Toolbar action overflows narrow window');
    return true;
    """#

    static let script = #"""
    const bridge = args => window.webkit.messageHandlers.native.postMessage(args);
    const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
    const checks=[];
    const assert=(value,label)=>{if(!value)throw new Error(label+'; passed: '+checks.join(', '));checks.push(label);};
    const wait=async(fn,label)=>{for(let i=0;i<100;i++){const value=fn();if(value)return value;await pause(80);}throw new Error('Timeout: '+label+'; passed: '+checks.join(', '));};
    const button=(text,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>(b.textContent.trim()===text||b.getAttribute('aria-label')===text)&&!b.disabled&&b.getClientRects().length>0);
    const click=async(text,root=document)=>{if(['通篇优化','标题建议'].includes(text)){const menu=document.querySelector('.ai-more');if(menu)menu.open=true;}const b=await wait(()=>button(text,root),text);b.click();await pause(100);};
    const setValue=(el,value)=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const load=async()=>{await window.flushAll();return (await bridge({action:'load'})).library;};
    const content=async id=>(await load()).notes.find(n=>n.id===id).document.content;
    const latestProposal=()=>document.querySelector('[aria-label="AI 修改审阅"]');
    const closeReview=async()=>{if(latestProposal())await click('关闭修改审阅');};
    let configID='';
    try {
      await wait(()=>document.querySelector('.paper'),'editor ready');
      await click('应用设置');
      const dialog=await wait(()=>document.querySelector('.ai-settings'),'settings');
      await wait(()=>!dialog.querySelector('fieldset').disabled,'settings loaded');
      setValue(dialog.querySelector('select'),'custom');await pause(100);
      const inputs=dialog.querySelectorAll('fieldset input');
      setValue(inputs[0],'本机 AI 验证');setValue(inputs[1],site+'/ai/custom');setValue(inputs[2],'fixture');setValue(inputs[3],'isolated-fixture-key');
      await click('保存并测试连接',dialog);
      await wait(()=>dialog.textContent.includes('连接成功'),'connection result');
      configID=(await bridge({action:'aiLoad'})).defaultID;
      assert(!!configID,'settings save and real native connection test');
      dialog.querySelector('[aria-label="关闭 AI 设置"]').click();await pause(100);
      await click('AI 助手');
      const panel=document.querySelector('.ai-panel');
      assert(panel.querySelectorAll('.ai-tools button').length===4,'four persistent toolbar actions');
      assert(!panel.querySelector('.ai-scope')&&!panel.querySelector('.ai-session-tabs')&&!panel.querySelector('.ai-revisions'),'chat surface has no advanced control panels');
      const original=await content('fixture-block');
      await click('通篇优化',panel);await click('发送',panel);
      await wait(()=>latestProposal()&&!document.querySelector('.ai-generating'),'polish proposal');
      assert(await content('fixture-block')===original,'generation leaves original unchanged');
      assert(!panel.contains(latestProposal())&&document.querySelector('#ai-review-space').contains(latestProposal()),'diff opens on the writing surface while chat stays available');
      await click('新版预览',latestProposal());await wait(()=>latestProposal().querySelector('.bn-editor')?.textContent.includes('第一段正文写下我的想法。 更自然'),'rich proposal reading preview');
      assert(latestProposal().querySelector('.bn-editor').textContent.includes('第二段正文保持独立。 更自然'),'partial edits preview the assembled article in its original rich format');
      assert(await content('fixture-block')===original,'reading the assembled preview does not write to the original');await click('修改对比',latestProposal());
      await click('接受此处',latestProposal());
      await wait(()=>latestProposal().querySelector('.review-change.accepted'),'first acceptance');
      const first=JSON.parse(await content('fixture-block'));
      assert(first[0].content[0].text.endsWith('更自然')&&first[1].content[0].text==='第二段正文保持独立。','single acceptance changes one paragraph');
      await click('接受全部',latestProposal());await pause(150);
      assert(JSON.parse(await content('fixture-block'))[1].content[0].text.endsWith('更自然'),'remaining acceptance after own edit');
      panel.querySelector('.ai-more').open=true;await click('修改记录与恢复',panel);const history=await wait(()=>document.querySelector('[aria-label="AI 修改记录"]'),'history dialog');
      await click('撤销这次修改',history.querySelector('.ai-revisions'));await pause(100);
      await click('撤销这次修改',history.querySelector('.ai-revisions'));await pause(100);
      assert(await content('fixture-block')===original,'AI revision undo restores original');history.querySelector('[aria-label="关闭修改记录"]').click();panel.querySelector('.ai-more').open=false;

      await closeReview();
      const rich=document.querySelector('.bn-editor [contenteditable="true"]')||document.querySelector('.bn-editor[contenteditable="true"]');
      rich.focus();
      const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())&&!node.textContent.includes('第一段正文')){}
      const range=document.createRange();range.setStart(node,0);range.setEnd(node,3);const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);document.dispatchEvent(new Event('selectionchange'));rich.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      const selectionAction=await wait(()=>Array.from(document.querySelectorAll('.ai-selection-button')).find(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden'),'rich selection toolbar');
      selectionAction.click();await wait(()=>panel.querySelector('.ai-context')?.textContent.includes('第一段'),'rich selection context');
      assert(panel.querySelector('.ai-context')?.textContent.includes('第一段'),'rich selection mapped exactly');
      await click('发送',panel);await wait(()=>!document.querySelector('.ai-generating')&&latestProposal()?.textContent.includes('第一段 更自然'),'rich selection proposal');
      await click('接受此处',latestProposal());await pause(100);
      assert(JSON.parse(await content('fixture-block'))[0].content[0].text==='第一段 更自然正文写下我的想法。','rich selection leaves suffix intact');

      for (let turn=0;turn<2;turn++) {
        const count=panel.querySelectorAll('.ai-review-card').length;await closeReview();
        setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'继续调整得自然一点');await pause(100);await click('发送',panel);
        await wait(()=>!document.querySelector('.ai-generating')&&panel.querySelectorAll('.ai-review-card').length>count,'chat-driven selection revision');
        assert(Array.from(panel.querySelectorAll('.ai-message.assistant')).at(-1).textContent.includes('具体场景'),'chat explanation stays visible with edits '+turn);
        await click('接受此处',latestProposal());await pause(100);
        assert(JSON.parse(await content('fixture-block'))[0].content[0].text==='第一段'+' 更自然'.repeat(turn+2)+'正文写下我的想法。','continued selection chat '+turn);
      }

      await closeReview();
      const mdButton=Array.from(document.querySelectorAll('.note-row>.tree-title')).find(b=>b.textContent.includes('Markdown 验证'));mdButton.click();
      let area=await wait(()=>document.querySelector('textarea[aria-label="Markdown 正文"]'),'markdown editor');
      const mdBefore=area.value,start=mdBefore.indexOf('需要润色');area.focus();area.setSelectionRange(start,start+4);document.dispatchEvent(new Event('selectionchange'));area.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));
      await wait(()=>document.querySelector('.markdown-ai-selection button'),'markdown selection');document.querySelector('.markdown-ai-selection button').click();await pause(100);
      assert(panel.querySelector('.ai-context')?.textContent.includes('需要润色'),'Markdown selection bound');
      await click('发送',panel);await wait(()=>latestProposal()&&!document.querySelector('.ai-generating'),'Markdown proposal');
      assert(await content('fixture-md')===mdBefore,'Markdown preview leaves original intact');
      await click('接受此处',latestProposal());await pause(100);
      assert(await content('fixture-md')===mdBefore.replace('需要润色','需要润色 更自然'),'Markdown selection only');
      await click('通篇优化',panel);await click('发送',panel);
      await wait(()=>!document.querySelector('.ai-generating')&&latestProposal().querySelectorAll('.review-change').length===3,'full Markdown proposal');
      await closeReview();area=document.querySelector('textarea[aria-label="Markdown 正文"]');const manuallyEdited=area.value+'\n\n我刚刚新写的内容。';setValue(area,manuallyEdited);await pause(150);
      Array.from(panel.querySelectorAll('.ai-review-card')).at(-1).click();await pause(100);await click('接受全部',latestProposal());
      await wait(()=>panel.querySelector('.ai-error')?.textContent.includes('原文已变化'),'stale protection notice');
      assert(await content('fixture-md')===manuallyEdited,'stale proposal cannot overwrite new content');
      await closeReview();await click('标题建议',panel);await click('发送',panel);await wait(()=>panel.querySelector('.ai-title-list'),'titles');
      await click('采用标题',panel.querySelector('.ai-title-list'));await pause(100);
      assert((await load()).notes.find(n=>n.id==='fixture-md').document.title==='在日常里找到写作','title adoption is explicit');
      await click('生成提纲',panel);setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'给我一个写生活记录的提纲');await pause(100);await click('发送',panel);
      await wait(()=>!document.querySelector('.ai-generating')&&button('接受插入',latestProposal()),'outline response in document');
      assert(await content('fixture-md')===manuallyEdited,'insertion preview does not write');
      await click('接受插入',latestProposal());await pause(100);
      assert((await content('fixture-md')).includes('从具体场景开始'),'confirmed insertion writes');

      await click('新文稿');await pause(150);
      const newID=(await load()).notes.find(n=>!n.id.startsWith('fixture')).id;
      const blank=await content(newID);
      await click('写完整文章',panel);setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'写一篇关于坚持记录的完整文章，给刚开始写作的人');await pause(100);await click('发送',panel);
      await wait(()=>latestProposal()?.textContent.includes('接受整篇')&&!document.querySelector('.ai-generating'),'complete article proposal');
      assert(await content(newID)===blank,'complete draft stays separate until accepted');
      await click('新版预览',latestProposal());
      await wait(()=>latestProposal().querySelectorAll('[data-content-type=heading]').length>=3,'native heading preview');assert(latestProposal().querySelectorAll('[data-content-type=bulletListItem]').length>=2,'draft preview renders editable heading and list structures');
      assert(!panel.querySelector('.review-change')&&!panel.querySelector('.line-diff'),'conversation contains no embedded diff controls');
      await click('拒绝整篇',latestProposal());assert(await content(newID)===blank,'rejecting an article leaves the original intact');
      setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'根据上一版完整文章，把结尾写得更具体，保留章节');await pause(100);await click('发送',panel);
      await wait(()=>latestProposal()?.textContent.includes('接受整篇')&&!document.querySelector('.ai-generating')&&button('接受整篇',latestProposal()),'follow-up complete article');
      await click('接受整篇',latestProposal());await pause(150);
      const written=(await load()).notes.find(n=>n.id===newID);
      const writtenBlocks=JSON.parse(written.document.content);
      assert(written.document.contentType==='blocknote'&&writtenBlocks.filter(b=>b.type==='heading').length>=2,'accepted Markdown becomes editable rich headings');
      assert(writtenBlocks.some(b=>b.type==='bulletListItem'),'accepted Markdown list remains a list');
      assert(written.document.title==='把生活写下来','full article title is applied with the body');
      assert(!button('接受整篇',latestProposal()),'accepted article cannot be applied twice');
      panel.querySelector('.ai-more').open=true;await click('修改记录与恢复',panel);await click('撤销这次修改',document.querySelector('.ai-revisions'));await pause(100);
      assert(await content(newID)===blank,'whole-article undo restores the exact original');
      document.querySelector('[aria-label="关闭修改记录"]').click();panel.querySelector('.ai-more').open=false;await closeReview();
      await click('生成提纲',panel);setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'给我一个写生活记录的提纲');await pause(100);await click('发送',panel);
      await wait(()=>!document.querySelector('.ai-generating')&&button('接受插入',latestProposal()),'rich outline');
      await click('接受插入',latestProposal());await pause(100);
      const inserted=JSON.parse(await content(newID));assert(inserted.some(b=>b.type==='heading')&&inserted.some(b=>b.type==='bulletListItem'),'outline insertion into rich text preserves headings and lists');
      if(!document.querySelector('.outline-panel.expanded'))await click('展开目录');await wait(()=>document.querySelector('.outline-link'),'outline with assistant');
      assert(document.querySelector('.outline-panel.expanded')&&panel.getClientRects().length>0,'outline and assistant are simultaneously available');
      assert(JSON.parse(localStorage.getItem('baode-writer-layout')).outline===true,'explicit outline visibility is persisted');
      panel.querySelector('.ai-more').open=true;await click('独立构思',panel);panel.querySelector('.ai-more').open=false;assert(!panel.querySelector('.ai-conversation').textContent.includes('片段 1'),'free conversation is isolated');
      setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'我想写一篇关于重新开始的文章，先从哪里说起？');await pause(100);await click('发送',panel);await wait(()=>!document.querySelector('.ai-generating')&&panel.querySelector('.ai-message.assistant'),'chat-only response');assert(panel.querySelector('.ai-message.assistant').textContent.includes('具体场景'),'natural chat response');
      await click('回到当前文稿',panel);panel.querySelector('.ai-more').open=false;
      setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'写一篇完整文章，谈谈日常记录');await pause(100);await click('发送',panel);
      await wait(()=>latestProposal()&&!document.querySelector('.ai-generating'),'ordinary chat can create a full article');
      assert(latestProposal().textContent.includes('接受整篇'),'ordinary chat routes complete writing into article review');
      await click('接受整篇',latestProposal());await closeReview();
      const beforeSection=JSON.parse(await content(newID));
      setValue(panel.querySelector('textarea[aria-label="AI 写作要求"]'),'把第一段扩成两段');await pause(100);await click('发送',panel);
      await wait(()=>!document.querySelector('.ai-generating')&&button('接受修改',latestProposal()),'section replacement preview');
      assert(JSON.stringify(JSON.parse(await content(newID)))===JSON.stringify(beforeSection),'section proposal does not modify saved content');
      await click('新版预览',latestProposal());await wait(()=>latestProposal().querySelector('.bn-editor')?.textContent.includes('随后补上具体的观察'),'structured section preview');
      await click('接受修改',latestProposal());await pause(100);
      const afterSection=JSON.parse(await content(newID));
      assert(afterSection[0].content.map(c=>c.text||'').join('')==='第一段展开，写清最初的想法。'&&afterSection[1].content[0].text==='随后补上具体的观察。','section expansion creates separate editable paragraphs');
      assert(JSON.stringify(afterSection.slice(2))===JSON.stringify(beforeSection.slice(1)),'section expansion preserves every untouched native block');
      assert(afterSection[0].content.some(c=>c.styles?.bold)&&!JSON.stringify(afterSection[0]).includes('**'),'generated emphasis becomes a native bold mark');
      const savedSession=(await load()).aiSessions[newID];
      assert(savedSession.brief.includes('生活记录')&&panel.querySelector('[aria-label="本篇写作约定"]').value===savedSession.brief,'writing brief is persisted and editable per document');
      assert(!panel.querySelector('.ai-message-options'),'discussion is not offered as document content');
      panel.querySelector('.ai-brief').open=true;setValue(panel.querySelector('[aria-label="本篇写作约定"]'),'主题：生活记录；读者：初学者；风格：朴素，不说教。');await pause(100);
      const sourceNote=(await load()).notes.find(n=>n.id===newID),sourceBrief=(await load()).aiSessions[newID].brief;
      assert(sourceBrief.includes('不说教'),'manually edited writing brief is persisted');
      await click('另存新文稿',latestProposal());await pause(150);
      const copied=(await load()).notes.find(n=>!n.id.startsWith('fixture')&&n.id!==newID);
      assert(copied.document.contentType==='blocknote'&&copied.document.content===sourceNote.document.content,'saving a generated copy retains native document format');
      assert((await load()).aiSessions[copied.id].brief===sourceBrief,'generated copy carries its writing brief');
      document.querySelector('[aria-controls="document-'+newID+'"]').click();await pause(100);Array.from(panel.querySelectorAll('.ai-review-card')).at(-1).click();await pause(100);panel.querySelector('.ai-brief').open=true;
      await window.flushAll();return checks;
    } finally {
      const configurations=(await bridge({action:'aiLoad'})).configurations;
      for(const c of configurations)await bridge({action:'aiRemove',id:c.id});
    }
    """#
}
