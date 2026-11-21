(() => {
  'use strict';
  if (window.__ZGM_V46__) return;
  window.__ZGM_V46__ = true;
  const host = location.hostname;
  const parentSite = /(^|\.)zeta-ai\.io$/.test(host) && window === window.top;
  const frameSite = host === 'frame.pingpong.ai';
  const gptSite = host === 'chatgpt.com' && window === window.top;
  if (!parentSite && !frameSite && !gptSite) return;

  const CHANNEL = 'zgm.v41.bridge';
  const HANDOFF_HASH = 'zgmjob';
  const BASE = 'zgm-independent-v4-'; // 기존 방 목록 키 유지
  const ROOM_KEY = BASE+'rooms', PENDING_KEY = BASE+'pending';
  const MAX_MESSAGES = 40, MAX_AGE = 15*60*1000;
  const clean = s => String(s ?? '').replace(/\u200b/g, '').trim();
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  function encodeTransfer(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  }
  function decodeTransfer(value) {
    try {
      const base64=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
      const binary=atob(base64+'='.repeat((4-base64.length%4)%4));
      const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }
  // External Netlify JS runs in page context: GM_* APIs are unavailable.
  // Store room settings in the Zeta page's localStorage.
  const db = {
    async get(k,d) { try { const v=localStorage.getItem(k);return v===null?d:JSON.parse(v); } catch {return d;} },
    async set(k,v) { localStorage.setItem(k,JSON.stringify(v)); },
    async del(k) { localStorage.removeItem(k); }
  };
  const create = (tag,root,txt,css) => {const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(css)e.style.cssText=css;if(root)root.appendChild(e);return e;};
  function toast(msg) {
    document.getElementById('zgm41-toast')?.remove();
    const t=create('div',document.body,msg,'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#27272a;color:#fff;border-radius:12px;padding:12px 16px;max-width:90vw;font:13px/1.5 system-ui;box-shadow:0 4px 20px #0005');
    t.id='zgm41-toast';setTimeout(()=>t.remove(),4400);
  }
  function validURL(value) {
    try {
      const u=new URL(clean(value));
      if(u.origin!=='https://chatgpt.com')return '';
      if(!/^\/c\/[^/]+\/?$/.test(u.pathname) && !/^\/g\/[^/]+\/c\/[^/]+\/?$/.test(u.pathname))return '';
      return u.origin+u.pathname.replace(/\/$/,'');
    } catch {return '';}
  }
  async function rooms() {
    let r=await db.get(ROOM_KEY,[]);
    if(typeof r==='string'){try{r=JSON.parse(r);}catch{r=[];}}
    return Array.isArray(r)?r.filter(x=>x&&clean(x.name)&&validURL(x.url)).map(x=>({id:String(x.id),name:clean(x.name),url:validURL(x.url)})):[];
  }
  const css=`
  #zgm41-trigger,#zgm41-overlay,#zgm41-pickbar{font:13px/1.5 system-ui,-apple-system,sans-serif;box-sizing:border-box}
  #zgm41-overlay *,#zgm41-pickbar *{box-sizing:border-box}
  #zgm41-trigger{position:fixed;right:14px;bottom:105px;z-index:2147483600;padding:10px 14px;border-radius:12px;border:1px solid #777;background:#292929;color:#fff;font-weight:700;box-shadow:0 4px 18px #0005}
  #zgm41-overlay{position:fixed;inset:0;z-index:2147483605;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px}
  #zgm41-dialog{width:min(550px,100%);max-height:90dvh;overflow:auto;background:#fafafa;color:#262626;border-radius:16px;padding:18px;box-shadow:0 12px 38px #0006}
  #zgm41-overlay button,#zgm41-pickbar button{border-radius:10px;padding:9px 12px;border:1px solid #ccc;background:#fff;color:#222;font:600 13px system-ui;cursor:pointer}
  #zgm41-overlay button.primary,#zgm41-pickbar button.primary{background:#292929;color:white;border-color:#292929}
  #zgm41-overlay button:disabled{opacity:.42;cursor:default}
  #zgm41-overlay input,#zgm41-overlay select,#zgm41-overlay textarea{width:100%;min-width:0;padding:10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#222;font:13px/1.45 system-ui}
  #zgm41-overlay label{display:block;font-weight:700;margin:12px 0 6px}
  #zgm41-pickbar{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2147483640;background:#282828;color:#fff;padding:10px;border-radius:14px;max-width:95vw;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;box-shadow:0 6px 24px #0008}
  [data-zgm41-mark='start']{outline:3px solid #5caafa!important;outline-offset:2px!important}
  [data-zgm41-mark='end']{outline:3px solid #f6ae53!important;outline-offset:2px!important}
  [data-zgm41-mark='between']{outline:2px solid #72c9a3!important;outline-offset:2px!important}
  `;
  create('style',document.head,css);

  // iframe: rendered message DOM only, and only during explicit selection.
  if(frameSite) {
    let picking=false, entries=[], first=null, bar=null, pointerStart=null, lastPointerHandled=0;
    const log=()=>document.querySelector('[role="log"][aria-label="Chat messages"]')||document.querySelector('[role="log"]');

    function isBubbleShape(el){
      if(!(el instanceof Element))return false;
      const c=el.classList;
      const userShape=c.contains('rounded-l-xl')&&c.contains('rounded-br-xl');
      const charShape=c.contains('rounded-r-xl')&&c.contains('rounded-bl-xl');
      const aligned=(c.contains('self-end')||c.contains('self-start')) &&
        (c.contains('w-fit')||c.contains('px-3')||c.contains('py-2'));
      return userShape||charShape||aligned;
    }
    function roleForBubble(el){
      const c=el.classList;
      if(c.contains('self-end')||c.contains('rounded-l-xl'))return 'user';
      if(c.contains('self-start')||c.contains('rounded-r-xl'))return 'character';
      const row=el.closest('div.flex.flex-row.items-start');
      if(row?.classList.contains('ml-auto')||row?.classList.contains('pl-[72px]'))return 'user';
      return 'character';
    }
    function rowForBubble(el,root){
      let row=el.parentElement;
      while(row&&row!==root){
        if(row.classList?.contains('flex-row')&&row.classList?.contains('items-start'))return row;
        row=row.parentElement;
      }
      return el.parentElement||el;
    }
    function textFromBubble(bubble){
      const clone=bubble.cloneNode(true);
      clone.querySelectorAll('button,svg,script,style,select,textarea,input,[aria-hidden="true"]').forEach(e=>e.remove());
      return clean(clone.innerText||clone.textContent).replace(/\n{3,}/g,'\n\n');
    }
    function speakerFromBubble(bubble,text){
      const clone=bubble.cloneNode(true);
      clone.querySelectorAll('button,svg,script,style,select,textarea,input,[aria-hidden="true"]').forEach(e=>e.remove());
      const leaf=[...clone.querySelectorAll('*')].find(el=>{
        const value=clean(el.textContent);
        return el.children.length===0 &&
          /^[가-힣A-Za-z][가-힣A-Za-z0-9 _.-]{0,19}$/.test(value) &&
          text.startsWith(value) && text.length>value.length;
      });
      return leaf?clean(leaf.textContent):'';
    }
    function getEntries(){
      const root=log();if(!root)return [];
      const all=[...root.querySelectorAll('div')];
      const strong=all.filter(el=>{
        const c=el.classList;
        return (c.contains('rounded-l-xl')&&c.contains('rounded-br-xl')) ||
          (c.contains('rounded-r-xl')&&c.contains('rounded-bl-xl'));
      });
      const weak=all.filter(el=>isBubbleShape(el) && !strong.some(s=>s===el||s.contains(el)||el.contains(s)));
      const bubbles=[...strong,...weak];
      const seen=new Set(), arr=[];
      for(const bubble of bubbles){
        if(seen.has(bubble))continue;
        const role=roleForBubble(bubble);
        const row=rowForBubble(bubble,root);
        const text=textFromBubble(bubble);
        if(!text||text.length>24000)continue;
        seen.add(bubble);
        arr.push({row,bubble,role,text,speaker:speakerFromBubble(bubble,text)});
      }
      // Keep DOM order, then compensate only when the scroll stack itself is flex-col-reverse.
      arr.sort((a,b)=>{
        if(a.bubble===b.bubble)return 0;
        const pos=a.bubble.compareDocumentPosition(b.bubble);
        return pos&Node.DOCUMENT_POSITION_FOLLOWING?-1:1;
      });
      const stack=root.parentElement?.closest?.('.flex-col-reverse')||root.closest?.('.flex-col-reverse');
      if(stack)arr.reverse();
      return arr;
    }
    function entryIndexFromEvent(event,current){
      const path=typeof event.composedPath==='function'?event.composedPath():[];
      const candidates=[...path,event.target].filter(x=>x instanceof Element);
      return current.findIndex(({row,bubble})=>candidates.some(x=>
        x===bubble||bubble.contains(x)||x===row||row.contains(x)
      ));
    }
    function findFirstIndex(current){
      if(!first)return -1;
      let i=current.findIndex(e=>e.bubble===first.bubble);
      if(i>=0)return i;
      const matches=[];
      current.forEach((e,index)=>{if(e.role===first.role&&e.text===first.text)matches.push(index);});
      return matches.length?matches[0]:-1;
    }
    const clearMarks=()=>document.querySelectorAll('[data-zgm41-mark]').forEach(e=>e.removeAttribute('data-zgm41-mark'));
    function mark(list,a,b){
      clearMarks();
      const lo=Math.min(a,b),hi=Math.max(a,b);
      list.slice(lo,hi+1).forEach((e,i)=>e.bubble.setAttribute('data-zgm41-mark',i===0?'start':i===hi-lo?'end':'between'));
    }
    const send=(kind,more={})=>{
      let origin='https://zeta-ai.io';
      try { if(document.referrer) origin=new URL(document.referrer).origin; } catch {}
      if(!/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(origin))return;
      window.parent.postMessage({channel:CHANNEL,kind,...more},origin);
    };
    function cancelSelection(notify=true){
      document.removeEventListener('pointerdown',onPointerDown,true);
      document.removeEventListener('pointerup',onPointerUp,true);
      document.removeEventListener('click',onClick,true);
      picking=false;first=null;pointerStart=null;
      bar?.remove();bar=null;
      if(notify){clearMarks();send('cancel');}
    }
    function handleTap(e){
      if(!picking)return false;
      const current=getEntries();
      const index=entryIndexFromEvent(e,current);
      if(index<0)return false;
      e.preventDefault?.();e.stopPropagation?.();e.stopImmediatePropagation?.();

      if(first==null){
        const picked=current[index];
        first={bubble:picked.bubble,role:picked.role,text:picked.text};
        entries=current;mark(current,index,index);
        const status=bar?.querySelector('[data-status]');
        if(status)status.textContent='끝 말풍선을 선택해 줘';
        return true;
      }

      const firstIndex=findFirstIndex(current);
      if(firstIndex<0){
        const status=bar?.querySelector('[data-status]');
        if(status)status.textContent='시작 말풍선이 현재 화면에서 벗어났어. 시작 지점이 보이게 한 뒤 다시 선택해 줘.';
        clearMarks();first=null;
        return true;
      }

      const lo=Math.min(firstIndex,index),hi=Math.max(firstIndex,index),slice=current.slice(lo,hi+1);
      if(slice.length>MAX_MESSAGES){
        const status=bar?.querySelector('[data-status]');
        if(status)status.textContent=`약 ${Math.ceil(slice.length/2)}턴 · 최대 20턴까지 선택할 수 있어`;
        return true;
      }
      entries=current;mark(current,lo,hi);
      cancelSelection(false);
      send('selected',{
        messages:slice.map(m=>({role:m.role,text:m.text,speaker:m.speaker})),
        count:Math.ceil(slice.length/2)
      });
      return true;
    }
    function onPointerDown(e){
      if(!picking||e.isPrimary===false)return;
      pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};
    }
    function onPointerUp(e){
      if(!picking||e.isPrimary===false||!pointerStart)return;
      const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;
      const moved=Math.hypot(dx,dy);
      pointerStart=null;
      if(moved>12)return; // scrolling/dragging: do not treat it as a selection tap.
      if(handleTap(e))lastPointerHandled=Date.now();
    }
    function onClick(e){
      if(Date.now()-lastPointerHandled<450)return;
      handleTap(e);
    }
    function begin(){
      cancelSelection(false);clearMarks();entries=getEntries();first=null;
      if(!entries.length){
        send('error',{message:'iframe은 연결됐지만 현재 화면의 말풍선 DOM을 찾지 못했어. 채팅 화면을 조금 움직인 뒤 다시 시도해 줘.'});
        return;
      }
      picking=true;bar=create('div',document.body);bar.id='zgm41-pickbar';
      const status=create('span',bar,`시작 말풍선을 선택해 줘 · 현재 인식 ${entries.length}개`);status.dataset.status='1';
      const btn=create('button',bar,'선택 취소');btn.onclick=()=>cancelSelection(true);
      document.addEventListener('pointerdown',onPointerDown,true);
      document.addEventListener('pointerup',onPointerUp,true);
      document.addEventListener('click',onClick,true);
      send('ready',{available:entries.length});
    }
    window.addEventListener('message',e=>{
      if(e.source!==window.parent || !/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(e.origin))return;
      if(e.data?.channel!==CHANNEL)return;
      if(e.data.kind==='begin')begin();
      if(e.data.kind==='clear'){cancelSelection(false);clearMarks();}
    });
    send('frame-ready');
  }

  if(gptSite){
    function visible(el){
      if(!el?.isConnected||el.disabled||el.getAttribute?.('aria-disabled')==='true'||el.getAttribute?.('contenteditable')==='false')return false;
      try{
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        if(s.display==='none'||s.visibility==='hidden'||Number.parseFloat(s.opacity||'1')===0)return false;
        if(r.width<2&&r.height<2)return false;
      }catch{}
      return true;
    }
    function scorePrompt(el){
      if(!visible(el))return -Infinity;
      if(el.closest?.('[data-writing-block="true"],[data-message-author-role],[data-turn]'))return -Infinity;
      let s=0;
      if(el.id==='prompt-textarea')s+=120;
      const tid=el.getAttribute?.('data-testid')||'';
      if(tid==='prompt-textarea')s+=115;
      if(/composer.*(?:input|text)|(?:input|text).*composer/i.test(tid))s+=100;
      if(el.matches?.('.ProseMirror[contenteditable="true"]'))s+=90;
      if(el.matches?.('[contenteditable="true"][role="textbox"]'))s+=85;
      if(el.matches?.('textarea[name="prompt-textarea"]'))s+=80;
      if(el.matches?.('textarea'))s+=35;
      if(el.closest?.('form'))s+=20;
      return s;
    }
    function findPrompt(){
      const selectors=[
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
        '[data-testid="composer-input"][contenteditable="true"]',
        '[data-testid="composer-text-input"][contenteditable="true"]',
        '.ProseMirror[contenteditable="true"][role="textbox"]',
        '.ProseMirror[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="plaintext-only"][role="textbox"]',
        'textarea[name="prompt-textarea"]'
      ];
      const seen=new Set(),all=[];
      for(const selector of selectors){
        try{
          document.querySelectorAll(selector).forEach(el=>{if(!seen.has(el)){seen.add(el);all.push(el);}});
        }catch{}
      }
      all.sort((a,b)=>scorePrompt(b)-scorePrompt(a));
      return all.find(el=>Number.isFinite(scorePrompt(el)))||null;
    }
    function editableText(el){
      if(!el)return '';
      if('value' in el&&typeof el.value==='string')return el.value;
      return el.innerText||el.textContent||'';
    }
    function dispatchInput(el,text){
      try{el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
      catch{el.dispatchEvent(new Event('input',{bubbles:true}));}
    }
    async function insertPrompt(el,text){
      el.focus();
      if('value' in el&&typeof el.value==='string'){
        const proto=Object.getPrototypeOf(el);
        const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
        if(setter)setter.call(el,text);else el.value=text;
        dispatchInput(el,text);
        el.dispatchEvent(new Event('change',{bubbles:true}));
        await sleep(100);
        return editableText(el).trim().length>0;
      }
      try{
        const sel=window.getSelection?.();
        if(sel){
          const range=document.createRange();
          range.selectNodeContents(el);range.collapse(false);
          sel.removeAllRanges();sel.addRange(range);
        }
        if(document.execCommand('insertText',false,text)){
          dispatchInput(el,text);await sleep(120);
          if(editableText(el).trim())return true;
        }
      }catch{}
      try{
        el.replaceChildren();
        String(text).split('\n').forEach(line=>{
          const p=document.createElement('p');
          if(line)p.textContent=line;else p.append(document.createElement('br'));
          el.append(p);
        });
        const sel=window.getSelection?.();
        if(sel&&el.lastChild){
          const range=document.createRange();
          range.selectNodeContents(el.lastChild);range.collapse(false);
          sel.removeAllRanges();sel.addRange(range);
        }
        dispatchInput(el,text);
        await sleep(150);
        return editableText(el).trim().length>0;
      }catch{return false;}
    }
    async function consumeHandoff(){
      const hash=String(location.hash||'').replace(/^#/,'');
      if(!hash)return;
      let raw='';
      try{raw=new URLSearchParams(hash).get(HANDOFF_HASH)||'';}catch{}
      if(!raw)return;
      const job=decodeTransfer(raw);
      // Remove the conversation text from the address bar/history as soon as it is read.
      try{history.replaceState(history.state,'',location.pathname+location.search);}catch{}
      if(!job||job.v!==1||typeof job.text!=='string'||!job.text||job.text.length>300000)return;
      if(!Number.isFinite(job.at)||Date.now()-job.at>MAX_AGE)return;
      const deadline=Date.now()+30000;
      let prompt=null;
      while(Date.now()<deadline){
        prompt=findPrompt();
        if(prompt)break;
        await sleep(200);
      }
      if(!prompt){toast('GPT 입력창을 찾지 못했어. 복사된 내용을 직접 붙여넣어 줘.');return;}
      const ok=await insertPrompt(prompt,job.text);
      if(ok){
        prompt.focus();
        toast('GPT 입력창에 자동으로 채웠어. 확인한 뒤 전송은 직접 눌러 줘.');
      }else toast('자동 입력에 실패했어. 복사된 내용을 직접 붙여넣어 줘.');
    }
    consumeHandoff();
  }

if(parentSite){
    let selected=null,activeTab='main',purpose='narrator',scope='withHistory',roomId='';
    let iframeOrigin='https://frame.pingpong.ai', waitingForFrame=false, frameResponded=false;
    function locateFrame(){
      const arr=[...document.querySelectorAll('iframe')];
      return arr.find(f=>{try{return new URL(f.src,location.href).hostname==='frame.pingpong.ai';}catch{return false;}})||null;
    }
    function toFrame(kind){
      const f=locateFrame();
      if(!f?.contentWindow){toast('채팅 iframe을 찾지 못했어. 제타 채팅방 화면에서 다시 시도해 줘.');return false;}
      if(kind==='begin'){
        waitingForFrame=true;
        setTimeout(()=>{if(waitingForFrame){waitingForFrame=false;toast('iframe 응답 없음: Stay 로더가 frame.pingpong.ai에서도 실행되도록 설정해 줘.');show('main');}},2500);
      }
      f.contentWindow.postMessage({channel:CHANNEL,kind},iframeOrigin);
      return true;
    }
    window.addEventListener('message',e=>{
      if(e.origin!==iframeOrigin || e.data?.channel!==CHANNEL)return;
      const f=locateFrame();if(!f||e.source!==f.contentWindow)return;
      if(e.data.kind==='frame-ready')frameResponded=true;
      if(e.data.kind==='ready'||e.data.kind==='error'||e.data.kind==='selected'||e.data.kind==='cancel'){waitingForFrame=false;frameResponded=true;}
      if(e.data.kind==='selected'){
        const arr=e.data.messages;
        if(!Array.isArray(arr)||!arr.length||arr.length>MAX_MESSAGES||!arr.every(m=>(m.role==='user'||m.role==='character')&&typeof m.text==='string'&&m.text.length<=24000))return;
        selected=arr.map(m=>({role:m.role,text:m.text,speaker:typeof m.speaker==='string'?m.speaker:''}));
        show('main');toast(`${Math.ceil(arr.length/2)}턴 · 메시지 ${arr.length}개 선택했어.`);
      }
      if(e.data.kind==='error'){toast(String(e.data.message||'iframe 메시지 확인 실패'));show('main');}
      if(e.data.kind==='cancel'){show('main');}
    });
    const count=()=>Math.ceil((selected?.length||0)/2);
    function dialogueText(){
      if(!selected?.length)return '';
      const names={};
      for(const role of ['character','user']){
        const group=selected.filter(m=>m.role===role);
        // Prefer a separate, already rendered DOM name; never request hidden user data.
        const explicit=group.map(m=>clean(m.speaker)).filter(Boolean);
        if(explicit.length && explicit.every(n=>n===explicit[0])){
          names[role]=explicit[0];continue;
        }
        // Some Zeta layouts concatenate the displayed name with the message.
        // Only recover a prefix repeatedly observed across different messages.
        if(group.length>=2){
          let prefix=group[0].text;
          for(const m of group.slice(1)){
            let i=0;while(i<prefix.length && i<m.text.length && prefix[i]===m.text[i])i++;
            prefix=prefix.slice(0,i);
          }
          if(/^[가-힣]{2,8}$/.test(prefix) && group.every(m=>m.text.length>prefix.length)){
            names[role]=prefix;
          }
        }
      }
      return selected.map(m=>{
        const speaker=names[m.role]||(m.role==='user'?'유저':'캐릭터');
        const body=names[m.role] && m.text.startsWith(names[m.role])
          ? clean(m.text.slice(names[m.role].length)) : clean(m.text);
        return `${speaker}:
${body}`;
      }).join('\n\n');
    }
    // Cross-site handoff uses the URL fragment, which is not sent as an HTTP request.
    // ChatGPT consumes it once, removes it from the address bar, and only fills the composer.
    function openGPT(url,payload){
      let target='';
      try{
        const u=new URL(url);
        u.searchParams.set('no_universal_links','1');
        u.hash=`${HANDOFF_HASH}=${encodeTransfer({v:1,text:payload,at:Date.now()})}`;
        target=u.toString();
      }catch{return false;}
      const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if(mobile){
        location.assign(target);
        return true;
      }
      const popup=window.open(target,'_blank');
      if(!popup)return false;
      try{popup.opener=null;}catch{}
      return true;
    }
    function promptText(){
      if(!selected?.length)return '';
      const p=purpose==='narrator'
        ? '제타 AI 채팅 내레이터 덮어씌우기에 넣을 간결한 이어쓰기 메모로 정리해 줘. 현재 장면, 관계 변화, 감정선, 중요한 사건, 약속, 비밀, 이어질 장면의 필수 맥락을 우선해.'
        : '제타 유저 프로필에 넣을 서사 기록으로 정리해 줘. 장기적으로 유지해야 하는 관계, 실제 사건, 확정된 약속과 감정 변화를 간결하게 보존해.';
      const s=scope==='withHistory'
        ? '이 GPT 채팅방에 남아 있는 이전 서사 정리가 참고 가능하면 함께 반영해 통합 요약을 작성해 줘. 이전 기록이 확인되지 않으면 이번 발췌만 사용하고 모순을 임의로 해결하지 마.'
        : '이전 서사 기록을 사용하지 말고 이번 선택 대화만 근거로 정리해 줘.';
      return `[제타 서사 정리 요청]\n\n[사용 용도]\n${p}\n\n[정리 범위]\n${s}\n\n[공통 규칙]\n- 원문에 없는 이름, 사건, 설정, 감정을 새로 만들지 마.\n- 확인되지 않은 사실이나 화자는 추측하지 마.\n- 사건 순서와 관계 변화, 약속, 비밀 및 복선은 보존해.\n- 반복 농담과 수식은 줄여.\n- 최종 결과는 바로 복사할 수 있는 정리문만 작성해.\n\n[선택 구간: 약 ${count()}턴 / 메시지 ${selected.length}개]\n${dialogueText()}\n\n[선택 구간 끝]`;
    }
    function newDialog(){
      document.getElementById('zgm41-overlay')?.remove();
      const back=create('div',document.body);back.id='zgm41-overlay';
      const dialog=create('div',back);dialog.id='zgm41-dialog';
      back.onclick=e=>{if(e.target===back)back.remove();};
      const head=create('div',dialog,null,'display:flex;justify-content:space-between;align-items:center;gap:8px');
      create('strong',head,'Zeta GPT Memory','font-size:17px');
      const close=create('button',head,'✕');close.onclick=()=>back.remove();
      const tabs=create('div',dialog,null,'display:flex;gap:8px;margin:15px 0 10px;padding-bottom:10px;border-bottom:1px solid #ddd');
      const a=create('button',tabs,'서사 정리'),b=create('button',tabs,'설정');
      a.onclick=()=>show('main');b.onclick=()=>show('settings');
      (activeTab==='main'?a:b).classList.add('primary');
      return create('div',dialog);
    }
    function label(root,t){return create('label',root,t);}
    function field(root,placeholder,value=''){const x=create('input',root);x.placeholder=placeholder;x.value=value;return x;}
    function btn(root,t,cb,primary=false){const x=create('button',root,t);x.type='button';x.onclick=cb;if(primary)x.classList.add('primary');return x;}
    function buttons(root){return create('div',root,null,'display:flex;flex-wrap:wrap;gap:7px;margin-top:12px');}
    function radio(root,title,name,value,checked,fn){
      const line=create('label',root,null,'display:flex;gap:8px;align-items:center;margin:6px 0!important;font-weight:500!important');
      const r=create('input',line);r.type='radio';r.name=name;r.value=value;r.checked=checked;r.style.cssText='width:auto!important;flex:none';
      r.onchange=()=>{if(r.checked)fn(value);};create('span',line,title);
    }
    async function show(tab='main'){
      activeTab=tab;const body=newDialog();
      if(tab==='settings'){
        label(body,'별칭');const name=field(body,'예: 이사랑 서사 정리');
        label(body,'GPT 채팅방 주소');const url=field(body,'https://chatgpt.com/c/...');
        create('div',body,'프로젝트 홈이나 공유 링크가 아닌 실제 개별 대화 주소(/c/...)를 저장해 줘.','font-size:12px;color:#666;margin-top:5px');
        let editing=null;const control=buttons(body);
        btn(control,'저장',async()=>{
          const n=clean(name.value),u=validURL(url.value);if(!n||n.length>50||!u){toast('별칭과 GPT 개별 채팅 주소를 확인해 줘.');return;}
          const list=await rooms();
          if(editing){const target=list.find(x=>x.id===editing);if(target){target.name=n;target.url=u;}}
          else{const entry={id:`${Date.now()}_${Math.random().toString(36).slice(2)}`,name:n,url:u};list.push(entry);roomId=entry.id;}
          await db.set(ROOM_KEY,list);show('settings');toast('채팅방 저장 완료');
        },true);
        btn(control,'입력 초기화',()=>{editing=null;name.value='';url.value='';});
        label(body,'저장된 GPT 채팅방');const list=await rooms();
        if(!list.length)create('p',body,'저장된 채팅방이 없어.','color:#777');
        for(const r of list){
          const box=create('div',body,null,'border:1px solid #ddd;background:#fff;border-radius:11px;padding:11px;margin:8px 0;overflow-wrap:anywhere');
          create('strong',box,r.name);create('div',box,r.url,'font-size:11px;color:#777;margin-top:4px');
          const row=buttons(box);btn(row,'수정',()=>{editing=r.id;name.value=r.name;url.value=r.url;name.focus();});
          btn(row,'삭제',async()=>{if(!confirm(`“${r.name}”을 삭제할까?`))return;await db.set(ROOM_KEY,(await rooms()).filter(x=>x.id!==r.id));if(roomId===r.id)roomId='';show('settings');});
        }
        return;
      }
      const list=await rooms();
      label(body,'GPT 채팅방');const select=create('select',body);
      const empty=create('option',select,list.length?'채팅방 선택':'설정에서 GPT 채팅방을 저장해 줘');empty.value='';
      list.forEach(r=>{const o=create('option',select,r.name);o.value=r.id;});
      if(list.some(r=>r.id===roomId))select.value=roomId;
      select.onchange=()=>roomId=select.value;
      label(body,'대화 구간');create('div',body,selected?`${count()} / 최대 20턴 · 메시지 ${selected.length}개`:'선택된 구간 없음 · 최대 20턴','background:#eee;border-radius:10px;padding:12px;font-weight:700');
      const row=buttons(body);
      btn(row,selected?'다시 선택':'구간 선택',()=>{
        if(!toFrame('begin'))return;
        document.getElementById('zgm41-overlay')?.remove();
        toast('시작 말풍선 → 끝 말풍선을 차례로 눌러 줘. 선택바가 나타나지 않으면 iframe 실행 설정을 확인해 줘.');
      },true);
      if(selected)btn(row,'선택 초기화',()=>{selected=null;toFrame('clear');show('main');});
      label(body,'옵션 1 · 사용 용도');
      radio(body,'나레이션 덮어씌우기 용도','zgm41-purpose','narrator',purpose==='narrator',v=>purpose=v);
      radio(body,'유저 프로필에 넣는 용도','zgm41-purpose','profile',purpose==='profile',v=>purpose=v);
      label(body,'옵션 2 · 정리 범위');
      radio(body,'이전 서사와 함께 정리','zgm41-scope','withHistory',scope==='withHistory',v=>scope=v);
      radio(body,'선택한 내용만 정리','zgm41-scope','only',scope==='only',v=>scope=v);
      if(selected){
        label(body,'선택한 대화 미리보기');const box=create('textarea',body);box.readOnly=true;box.rows=5;
        box.value=dialogueText();
      }
      const bottom=buttons(body);
      const copy=btn(bottom,'프롬프트 + 대화 복사',async()=>{
        if(!selected?.length)return;
        try{await navigator.clipboard.writeText(promptText());toast('대화와 프롬프트를 복사했어.');}
        catch{toast('클립보드 권한 때문에 복사에 실패했어.');}
      },true);copy.disabled=!selected;
      const go=btn(bottom,'GPT로 가져가기',async()=>{
        const target=list.find(r=>r.id===select.value);
        if(!target){toast('GPT 채팅방을 먼저 선택해 줘.');return;}
        if(!selected?.length){toast('구간을 먼저 선택해 줘.');return;}
        const payload=promptText();
        const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        // On mobile the current tab navigates away, so copy the manual fallback first.
        if(mobile){
          try{await navigator.clipboard.writeText(payload);}catch{}
          const opened=openGPT(target.url,payload);
          if(!opened)toast('GPT 채팅방으로 이동하지 못했어. 복사 버튼을 이용해 줘.');
          return;
        }

        // Desktop must open synchronously from the click to avoid popup blocking.
        const opened=openGPT(target.url,payload);
        try{await navigator.clipboard.writeText(payload);}catch{}
        if(!opened){
          toast('새 탭 열기가 차단됐어. 팝업 허용 후 다시 눌러 줘.');
          return;
        }
        toast('GPT 채팅방을 열었어. 입력창 자동 채우기를 시도해.');
      },true);go.disabled=!selected;
create('p',body,'제타에서는 선택 시 화면에 표시된 말풍선 DOM만 읽어. 이전 구간이 로드되지 않았다면 수동으로 스크롤해 줘. GPT에서는 입력창 자동 채우기만 시도하고 전송은 하지 않아. 자동 입력이 실패할 때를 대비해 같은 내용은 클립보드에도 복사해.','font-size:11px;color:#777;margin-top:12px');
    }
    function mount(){
      if(document.getElementById('zgm41-trigger'))return;
      const b=create('button',document.body,'서사 정리');b.id='zgm41-trigger';b.type='button';b.onclick=()=>show('main');
    }
    mount();
  }
})();
