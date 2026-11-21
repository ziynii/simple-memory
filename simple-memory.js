// ==UserScript==
// @name         Zeta GPT Memory V4.2 - iframe bridge + 구간 선택
// @namespace    local.zeta.gptmemory.independent
// @version      4.2.0
// @description  제타의 화면 DOM 구간 선택(최대 20턴), GPT 방 관리, 목적별 프롬프트. 제타 내부 API 사용하지 않음.
// @match        https://zeta-ai.io/*
// @match        https://*.zeta-ai.io/*
// @match        https://frame.pingpong.ai/*
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @all-frames   true
// @grant        none
// ==/UserScript==
(() => {
  'use strict';
  if (window.__ZGM_V42__) return;
  window.__ZGM_V42__ = true;
  const host = location.hostname;
  const parentSite = /(^|\.)zeta-ai\.io$/.test(host) && window === window.top;
  const frameSite = host === 'frame.pingpong.ai';
  const gptSite = host === 'chatgpt.com' && window === window.top;
  if (!parentSite && !frameSite && !gptSite) return;

  const CHANNEL = 'zgm.v41.bridge';
  const BASE = 'zgm-independent-v4-'; // 기존 방 목록 키 유지
  const ROOM_KEY = BASE+'rooms', PENDING_KEY = BASE+'pending';
  const MAX_MESSAGES = 40, MAX_AGE = 15*60*1000;
  const clean = s => String(s ?? '').replace(/\u200b/g, '').trim();
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
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
    let picking=false, entries=[], first=null, bar=null;
    const log=()=>document.querySelector('[role="log"][aria-label="Chat messages"]')||document.querySelector('[role="log"]');
    function getEntries() {
      const root=log();if(!root)return [];
      const rows=[...root.querySelectorAll('div.flex.flex-row.items-start.py-2')].filter(r=>
        (r.classList.contains('ml-auto')||r.classList.contains('pr-[72px]')) &&
        (r.classList.contains('pl-2')||r.classList.contains('pl-[72px]')));
      const arr=[];
      for(const row of rows){
        const user=row.classList.contains('ml-auto')||row.classList.contains('pl-[72px]');
        const bubble=row.querySelector(user?'div.rounded-l-xl.rounded-br-xl':'div.rounded-r-xl.rounded-bl-xl');
        if(!bubble)continue;
        const clone=bubble.cloneNode(true);
        clone.querySelectorAll('button,svg,script,style,select,textarea,input,[aria-hidden="true"],.message-context-menu-trigger').forEach(e=>e.remove());
        const text=clean(clone.innerText||clone.textContent).replace(/\n{3,}/g,'\n\n');
        if(text && text.length<=24000)arr.push({row,bubble,role:user?'user':'character',text});
      }
      // DOM may be newest-first for flex-col-reverse; keep a stable chronological order.
      const stack = root.closest('.flex-col-reverse');
      if(stack)arr.reverse();
      return arr;
    }
    const clearMarks=()=>document.querySelectorAll('[data-zgm41-mark]').forEach(e=>e.removeAttribute('data-zgm41-mark'));
    function mark(a,b){clearMarks();const lo=Math.min(a,b),hi=Math.max(a,b);entries.slice(lo,hi+1).forEach((e,i)=>e.bubble.setAttribute('data-zgm41-mark',i===0?'start':i===hi-lo?'end':'between'));}
    const send=(kind,more={})=>{
      // Only post to a verified Zeta parent, never to an arbitrary embedding site.
      let origin='https://zeta-ai.io';
      try { if(document.referrer) origin=new URL(document.referrer).origin; } catch {}
      if(!/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(origin))return;
      window.parent.postMessage({channel:CHANNEL,kind,...more},origin);
    };
    function cancelSelection(notify=true){
      document.removeEventListener('click',onClick,true);picking=false;first=null;
      bar?.remove();bar=null;
      if(notify){clearMarks();send('cancel');}
    }
    function onClick(e){
      const row=e.target.closest?.('div.flex.flex-row.items-start.py-2');
      if(!row||!log()?.contains(row))return;
      const index=entries.findIndex(x=>x.row===row);
      if(index<0)return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      if(first==null){first=index;mark(index,index);bar.querySelector('[data-status]').textContent='끝 말풍선을 선택해 줘';return;}
      const lo=Math.min(first,index),hi=Math.max(first,index),slice=entries.slice(lo,hi+1);
      if(slice.length>MAX_MESSAGES){bar.querySelector('[data-status]').textContent=`${slice.length}개 메시지 — 최대 40개(20턴)까지`;return;}
      mark(lo,hi);
      cancelSelection(false);
      send('selected',{messages:slice.map(m=>({role:m.role,text:m.text})),count:Math.ceil(slice.length/2)});
    }
    function begin(){
      cancelSelection(false);clearMarks();entries=getEntries();first=null;
      if(!entries.length){send('error',{message:'iframe 내부에서 말풍선을 찾지 못했어. 채팅 화면이 열린 상태인지 확인해 줘.'});return;}
      picking=true;bar=create('div',document.body);bar.id='zgm41-pickbar';
      const status=create('span',bar,'시작 말풍선을 선택해 줘');status.dataset.status='1';
      const btn=create('button',bar,'선택 취소');btn.onclick=()=>cancelSelection(true);
      document.addEventListener('click',onClick,true);
      send('ready',{available:entries.length});
    }
    window.addEventListener('message',e=>{
      if(e.source!==window.parent || !/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(e.origin))return;
      if(e.data?.channel!==CHANNEL)return;
      if(e.data.kind==='begin')begin();
      if(e.data.kind==='clear'){cancelSelection(false);clearMarks();}
    });
    // Explicit handshake only. No polling, DOM observer, or request to Zeta APIs.
    send('frame-ready');
  }

  if(parentSite){
    let selected=null,activeTab='main',purpose='narrator',scope='withHistory',roomId='';
    let iframeOrigin='https://frame.pingpong.ai', waitingForFrame=false;
    function locateFrame(){
      const arr=[...document.querySelectorAll('iframe')];
      return arr.find(f=>{try{return new URL(f.src,location.href).hostname==='frame.pingpong.ai';}catch{return false;}})||null;
    }
    function toFrame(kind){
      const f=locateFrame();
      if(!f?.contentWindow){toast('채팅 iframe을 찾지 못했어. 제타 채팅방 화면에서 다시 시도해 줘.');return false;}
      if(kind==='begin'){
        waitingForFrame=true;
        setTimeout(()=>{if(waitingForFrame){waitingForFrame=false;toast('iframe에서 응답이 없어. Stay가 frame.pingpong.ai 안에서도 스크립트를 실행하는지 확인해 줘.');show('main');}},1700);
      }
      f.contentWindow.postMessage({channel:CHANNEL,kind},iframeOrigin);
      return true;
    }
    window.addEventListener('message',e=>{
      if(e.origin!==iframeOrigin || e.data?.channel!==CHANNEL)return;
      const f=locateFrame();if(!f||e.source!==f.contentWindow)return;
      if(e.data.kind==='ready'||e.data.kind==='error'||e.data.kind==='selected'||e.data.kind==='cancel')waitingForFrame=false;
      if(e.data.kind==='selected'){
        const arr=e.data.messages;
        if(!Array.isArray(arr)||!arr.length||arr.length>MAX_MESSAGES||!arr.every(m=>(m.role==='user'||m.role==='character')&&typeof m.text==='string'&&m.text.length<=24000))return;
        selected=arr.map(m=>({role:m.role,text:m.text}));
        show('main');toast(`${Math.ceil(arr.length/2)}턴 · 메시지 ${arr.length}개 선택했어.`);
      }
      if(e.data.kind==='error'){toast(String(e.data.message||'iframe 메시지 확인 실패'));show('main');}
      if(e.data.kind==='cancel'){show('main');}
    });
    const count=()=>Math.ceil((selected?.length||0)/2);
    function promptText(){
      if(!selected?.length)return '';
      const p=purpose==='narrator'
        ? '제타 AI 채팅 내레이터 덮어씌우기에 넣을 간결한 이어쓰기 메모로 정리해 줘. 현재 장면, 관계 변화, 감정선, 중요한 사건, 약속, 비밀, 이어질 장면의 필수 맥락을 우선해.'
        : '제타 유저 프로필에 넣을 서사 기록으로 정리해 줘. 장기적으로 유지해야 하는 관계, 실제 사건, 확정된 약속과 감정 변화를 간결하게 보존해.';
      const s=scope==='withHistory'
        ? '이 GPT 채팅방에 남아 있는 이전 서사 정리가 참고 가능하면 함께 반영해 통합 요약을 작성해 줘. 이전 기록이 확인되지 않으면 이번 발췌만 사용하고 모순을 임의로 해결하지 마.'
        : '이전 서사 기록을 사용하지 말고 이번 선택 대화만 근거로 정리해 줘.';
      return `[제타 서사 정리 요청]\n\n[사용 용도]\n${p}\n\n[정리 범위]\n${s}\n\n[공통 규칙]\n- 원문에 없는 이름, 사건, 설정, 감정을 새로 만들지 마.\n- 확인되지 않은 사실이나 화자는 추측하지 마.\n- 사건 순서와 관계 변화, 약속, 비밀 및 복선은 보존해.\n- 반복 농담과 수식은 줄여.\n- 최종 결과는 바로 복사할 수 있는 정리문만 작성해.\n\n[선택 구간: 약 ${count()}턴 / 메시지 ${selected.length}개]\n${selected.map((m,i)=>`\n[${i+1}. ${m.role==='user'?'유저':'캐릭터'}]\n${m.text}`).join('\n')}\n\n[선택 구간 끝]`;
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
        toast('시작 말풍선 → 끝 말풍선을 차례로 눌러 줘. 선택바가 안 뜨면 Stay의 iframe 실행 권한을 확인해야 해.');
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
        box.value=selected.map((m,i)=>`[${i+1}. ${m.role==='user'?'유저':'캐릭터'}]\n${m.text}`).join('\n\n');
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
        const text=promptText();
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          toast('복사 권한이 없어 이동하지 않았어. 먼저 복사 버튼을 눌러 줘.');
          return;
        }
        // Cross-origin localStorage is isolated; user pastes on ChatGPT.
        location.assign(target.url);
      },true);go.disabled=!selected;
      create('p',body,'제타에서는 선택 시 화면에 표시된 말풍선 DOM만 읽어. 이전 구간이 로드되지 않았다면 수동으로 스크롤해 줘. GPT에서 붙여넣기와 전송은 직접 해 줘.','font-size:11px;color:#777;margin-top:12px');
    }
    function mount(){
      if(document.getElementById('zgm41-trigger'))return;
      const b=create('button',document.body,'서사 정리');b.id='zgm41-trigger';b.type='button';b.onclick=()=>show('main');
    }
    mount();
  }
})();
