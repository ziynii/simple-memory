(() => {
  'use strict';
  if (window.__ZGM_V49__) return;
  window.__ZGM_V49__ = true;

  const host = location.hostname;
  const parentSite = /(^|\.)zeta-ai\.io$/.test(host) && window === window.top;
  const frameSite = host === 'frame.pingpong.ai';
  const gptSite = /(^|\.)chatgpt\.com$/.test(host) && window === window.top;
  if (!parentSite && !frameSite && !gptSite) return;

  const CHANNEL = 'zgm.v49.bridge';
  const HANDOFF_HASH = 'zgmjob';
  const HANDOFF_NAME_PREFIX = '__ZGM_JOB_ID_V2__:';
  const STORAGE_REQUEST_EVENT = '__ZGM_GM_REQUEST_V1__';
  const STORAGE_RESPONSE_EVENT = '__ZGM_GM_RESPONSE_V1__';
  const BASE = 'zgm-independent-v4-';
  const ROOM_KEY = BASE + 'rooms';
  const HANDOFF_KEY = BASE + 'handoff-v2';
  const GPT_SESSION_KEY = BASE + 'gpt-session-v2';
  const MAX_TURNS = 20;
  const MAX_MESSAGES = MAX_TURNS * 2;
  const MAX_AGE = 15 * 60 * 1000;

  const clean = s => String(s ?? '').replace(/\u200b/g, '').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function storageBridgeRequest(operation, key, value, fallback) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        document.removeEventListener(STORAGE_RESPONSE_EVENT, receive);
        reject(new Error('공용 저장소 연결 시간 초과'));
      }, 5000);

      const receive = event => {
        let response = null;
        try { response = JSON.parse(String(event.detail || '')); } catch {}
        if (!response || response.id !== id) return;
        clearTimeout(timer);
        document.removeEventListener(STORAGE_RESPONSE_EVENT, receive);
        if (response.ok) resolve(response.value);
        else reject(new Error(response.error || '공용 저장소 연결 실패'));
      };

      document.addEventListener(STORAGE_RESPONSE_EVENT, receive);
      document.dispatchEvent(new CustomEvent(STORAGE_REQUEST_EVENT, {
        detail: JSON.stringify({ id, operation, key, value, fallback })
      }));
    });
  }

  const sharedStorage = {
    set: (key, value) => storageBridgeRequest('set', key, value, null),
    get: (key, fallback) => storageBridgeRequest('get', key, null, fallback),
    del: key => storageBridgeRequest('delete', key, null, null)
  };

  // GPT가 열리지 못한 채 남은 전달 데이터도 다음 실행 때 15분이 지났으면 정리한다.
  if (parentSite || gptSite) {
    setTimeout(async () => {
      try {
        const stale = await sharedStorage.get(HANDOFF_KEY, null);
        if (stale?.at && Date.now() - Number(stale.at) > MAX_AGE) {
          await sharedStorage.del(HANDOFF_KEY);
        }
      } catch {}
    }, 0);
  }

  // Netlify 외부 JS는 페이지 컨텍스트에서 실행된다.
  // 방 설정만 각 사이트의 localStorage에 저장하고, 대화 원문은 저장하지 않는다.
  const db = {
    async get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    async set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    async del(key) {
      localStorage.removeItem(key);
    }
  };

  const create = (tag, root, text, css) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (css) el.style.cssText = css;
    if (root) root.appendChild(el);
    return el;
  };

  function toast(message) {
    document.getElementById('zgm49-toast')?.remove();
    const el = create(
      'div',
      document.body,
      message,
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#27272a;color:#fff;border-radius:12px;padding:12px 16px;max-width:90vw;font:13px/1.5 system-ui;box-shadow:0 4px 20px #0005'
    );
    el.id = 'zgm49-toast';
    setTimeout(() => el.remove(), 4400);
  }

  function validURL(value) {
    try {
      const url = new URL(clean(value));
      if (url.origin !== 'https://chatgpt.com') return '';
      if (!/^\/c\/[^/]+\/?$/.test(url.pathname) && !/^\/g\/[^/]+\/c\/[^/]+\/?$/.test(url.pathname)) return '';
      return url.origin + url.pathname.replace(/\/$/, '');
    } catch {
      return '';
    }
  }

  async function rooms() {
    let list = await db.get(ROOM_KEY, []);
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    return Array.isArray(list)
      ? list
          .filter(item => item && clean(item.name) && validURL(item.url))
          .map(item => ({ id: String(item.id), name: clean(item.name), url: validURL(item.url) }))
      : [];
  }

  const css = `
    #zgm49-trigger,#zgm49-overlay{font:13px/1.5 system-ui,-apple-system,sans-serif;box-sizing:border-box}
    #zgm49-overlay *{box-sizing:border-box}
    #zgm49-trigger{position:fixed;right:14px;bottom:105px;z-index:2147483600;padding:10px 14px;border-radius:12px;border:1px solid #777;background:#292929;color:#fff;font-weight:700;box-shadow:0 4px 18px #0005}
    #zgm49-overlay{position:fixed;inset:0;z-index:2147483605;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px}
    #zgm49-dialog{width:min(550px,100%);max-height:90dvh;overflow:auto;background:#fafafa;color:#262626;border-radius:16px;padding:18px;box-shadow:0 12px 38px #0006}
    #zgm49-overlay button{border-radius:10px;padding:9px 12px;border:1px solid #ccc;background:#fff;color:#222;font:600 13px system-ui;cursor:pointer}
    #zgm49-overlay button.primary{background:#292929;color:white;border-color:#292929}
    #zgm49-overlay button:disabled{opacity:.42;cursor:default}
    #zgm49-overlay input,#zgm49-overlay select,#zgm49-overlay textarea{width:100%;min-width:0;padding:10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#222;font:13px/1.45 system-ui}
    #zgm49-overlay label{display:block;font-weight:700;margin:12px 0 6px}
    #zgm49-overlay textarea{resize:vertical}
  `;
  create('style', document.head || document.documentElement, css);

  // ---------------------------------------------------------------------------
  // Zeta iframe: 사용자가 '가져오기'를 눌렀을 때만 현재 렌더된 말풍선 DOM을 읽는다.
  // ---------------------------------------------------------------------------
  if (frameSite) {
    const log = () =>
      document.querySelector('[role="log"][aria-label="Chat messages"]') ||
      document.querySelector('[role="log"]');

    function isBubbleShape(el) {
      if (!(el instanceof Element)) return false;
      const c = el.classList;
      const userShape = c.contains('rounded-l-xl') && c.contains('rounded-br-xl');
      const charShape = c.contains('rounded-r-xl') && c.contains('rounded-bl-xl');
      const aligned = (c.contains('self-end') || c.contains('self-start')) &&
        (c.contains('w-fit') || c.contains('px-3') || c.contains('py-2'));
      return userShape || charShape || aligned;
    }

    function roleForBubble(el) {
      const c = el.classList;
      if (c.contains('self-end') || c.contains('rounded-l-xl')) return 'user';
      if (c.contains('self-start') || c.contains('rounded-r-xl')) return 'character';
      const row = el.closest('div.flex.flex-row.items-start');
      if (row?.classList.contains('ml-auto') || row?.classList.contains('pl-[72px]')) return 'user';
      return 'character';
    }

    function rowForBubble(el, root) {
      let row = el.parentElement;
      while (row && row !== root) {
        if (row.classList?.contains('flex-row') && row.classList?.contains('items-start')) return row;
        row = row.parentElement;
      }
      return el.parentElement || el;
    }

    function textFromBubble(bubble) {
      const clone = bubble.cloneNode(true);
      clone.querySelectorAll('button,svg,script,style,select,textarea,input,[aria-hidden="true"],.message-context-menu-trigger').forEach(el => el.remove());
      return clean(clone.innerText || clone.textContent).replace(/\n{3,}/g, '\n\n');
    }

    function speakerFromBubble(bubble, text) {
      const clone = bubble.cloneNode(true);
      clone.querySelectorAll('button,svg,script,style,select,textarea,input,[aria-hidden="true"],.message-context-menu-trigger').forEach(el => el.remove());
      const leaf = [...clone.querySelectorAll('*')].find(el => {
        const value = clean(el.textContent);
        return el.children.length === 0 &&
          /^[가-힣A-Za-z][가-힣A-Za-z0-9 _.-]{0,19}$/.test(value) &&
          text.startsWith(value) && text.length > value.length;
      });
      return leaf ? clean(leaf.textContent) : '';
    }

    function getEntries() {
      const root = log();
      if (!root) return [];

      const all = [...root.querySelectorAll('div')];
      const strong = all.filter(el => {
        const c = el.classList;
        return (c.contains('rounded-l-xl') && c.contains('rounded-br-xl')) ||
          (c.contains('rounded-r-xl') && c.contains('rounded-bl-xl'));
      });
      const weak = all.filter(el =>
        isBubbleShape(el) && !strong.some(strongEl => strongEl === el || strongEl.contains(el) || el.contains(strongEl))
      );

      const bubbles = [...strong, ...weak];
      const seen = new Set();
      const entries = [];

      for (const bubble of bubbles) {
        if (seen.has(bubble)) continue;
        const role = roleForBubble(bubble);
        const row = rowForBubble(bubble, root);
        const text = textFromBubble(bubble);
        if (!text || text.length > 24000) continue;
        seen.add(bubble);
        entries.push({ row, bubble, role, text, speaker: speakerFromBubble(bubble, text) });
      }

      // 실제 화면에서 위 -> 아래 순서로 정렬한다.
      entries.sort((a, b) => {
        const ar = a.row?.getBoundingClientRect?.() || a.bubble.getBoundingClientRect();
        const br = b.row?.getBoundingClientRect?.() || b.bubble.getBoundingClientRect();
        const dy = (ar?.top || 0) - (br?.top || 0);
        if (Math.abs(dy) > 1) return dy;
        const pos = a.bubble.compareDocumentPosition(b.bubble);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      return entries;
    }

    function send(kind, extra = {}) {
      let origin = 'https://zeta-ai.io';
      try {
        if (document.referrer) origin = new URL(document.referrer).origin;
      } catch {}
      if (!/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(origin)) return;
      window.parent.postMessage({ channel: CHANNEL, kind, ...extra }, origin);
    }

    function collectRecent(turns) {
      const requested = Math.max(1, Math.min(MAX_TURNS, Number.parseInt(turns, 10) || 10));
      const entries = getEntries();
      if (!entries.length) {
        send('error', { message: '현재 화면에서 말풍선 DOM을 찾지 못했어. 채팅 화면을 조금 움직인 뒤 다시 시도해 줘.' });
        return;
      }

      const wantedMessages = requested * 2;
      const slice = entries.slice(-wantedMessages);
      send('collected', {
        requestedTurns: requested,
        availableTurns: Math.ceil(entries.length / 2),
        messages: slice.map(item => ({ role: item.role, text: item.text, speaker: item.speaker }))
      });
    }

    window.addEventListener('message', event => {
      if (event.source !== window.parent || !/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(event.origin)) return;
      if (event.data?.channel !== CHANNEL) return;
      if (event.data.kind === 'collect') collectRecent(event.data.turns);
    });

    send('frame-ready');
  }

  // ---------------------------------------------------------------------------
  // ChatGPT: 전달받은 프롬프트를 입력창에 채우기만 한다. 자동 전송은 하지 않는다.
  // 현재 로더 구조에서는 ChatGPT 측 Netlify JS 실행 여부에 따라 자동입력이 실패할 수 있다.
  // ---------------------------------------------------------------------------
  if (gptSite) {
    function visible(el) {
      if (!el?.isConnected || el.disabled || el.getAttribute?.('aria-disabled') === 'true' || el.getAttribute?.('contenteditable') === 'false') return false;
      try {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') === 0) return false;
        if (rect.width < 2 && rect.height < 2) return false;
      } catch {}
      return true;
    }

    function scorePrompt(el) {
      if (!visible(el)) return -Infinity;
      if (el.closest?.('[data-writing-block="true"],[data-message-author-role],[data-turn]')) return -Infinity;
      let score = 0;
      if (el.id === 'prompt-textarea') score += 120;
      const testId = el.getAttribute?.('data-testid') || '';
      if (testId === 'prompt-textarea') score += 115;
      if (/composer.*(?:input|text)|(?:input|text).*composer/i.test(testId)) score += 100;
      if (el.matches?.('.ProseMirror[contenteditable="true"]')) score += 90;
      if (el.matches?.('[contenteditable="true"][role="textbox"]')) score += 85;
      if (el.matches?.('textarea[name="prompt-textarea"]')) score += 80;
      if (el.matches?.('textarea')) score += 35;
      if (el.closest?.('form')) score += 20;
      return score;
    }

    function findPrompt() {
      const selectors = [
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
      const seen = new Set();
      const candidates = [];
      for (const selector of selectors) {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (!seen.has(el)) {
              seen.add(el);
              candidates.push(el);
            }
          });
        } catch {}
      }
      candidates.sort((a, b) => scorePrompt(b) - scorePrompt(a));
      return candidates.find(el => Number.isFinite(scorePrompt(el))) || null;
    }

    function editableText(el) {
      if (!el) return '';
      if ('value' in el && typeof el.value === 'string') return el.value;
      return el.innerText || el.textContent || '';
    }

    function dispatchInput(el, text) {
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    async function insertPrompt(el, text) {
      el.focus();

      if ('value' in el && typeof el.value === 'string') {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
        if (setter) setter.call(el, text);
        else el.value = text;
        dispatchInput(el, text);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(100);
        return editableText(el).trim().length > 0;
      }

      try {
        const selection = window.getSelection?.();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        if (document.execCommand('insertText', false, text)) {
          dispatchInput(el, text);
          await sleep(120);
          if (editableText(el).trim()) return true;
        }
      } catch {}

      try {
        el.replaceChildren();
        String(text).split('\n').forEach(line => {
          const p = document.createElement('p');
          if (line) p.textContent = line;
          else p.append(document.createElement('br'));
          el.append(p);
        });
        const selection = window.getSelection?.();
        if (selection && el.lastChild) {
          const range = document.createRange();
          range.selectNodeContents(el.lastChild);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        dispatchInput(el, text);
        await sleep(150);
        return editableText(el).trim().length > 0;
      } catch {
        return false;
      }
    }

    let handoffConsumed = false;

    function handoffIdFromPage() {
      let id = '';
      try {
        const hash = String(location.hash || '').replace(/^#/, '');
        id = new URLSearchParams(hash).get(HANDOFF_HASH) || '';
      } catch {}
      if (!id) {
        try {
          const name = String(window.name || '');
          if (name.startsWith(HANDOFF_NAME_PREFIX)) id = name.slice(HANDOFF_NAME_PREFIX.length);
        } catch {}
      }
      return clean(id);
    }

    function clearHandoffMarkers() {
      try {
        if (String(window.name || '').startsWith(HANDOFF_NAME_PREFIX)) window.name = '';
      } catch {}
      try {
        if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
      } catch {}
    }

    async function loadHandoffJob() {
      const expectedId = handoffIdFromPage();

      let sessionJob = null;
      try { sessionJob = JSON.parse(sessionStorage.getItem(GPT_SESSION_KEY) || 'null'); } catch {}
      if (sessionJob && (!expectedId || sessionJob.id === expectedId)) return sessionJob;

      if (!expectedId) return null;

      let job = null;
      try {
        job = await sharedStorage.get(HANDOFF_KEY, null);
      } catch (error) {
        toast('GPT 전달 저장소에 연결하지 못했어. Stay 로더를 새 버전으로 바꿨는지 확인해 줘.');
        return null;
      }

      if (!job || job.id !== expectedId) return null;
      try { sessionStorage.setItem(GPT_SESSION_KEY, JSON.stringify(job)); } catch {}

      // 제타↔GPT 공용 저장소에는 필요한 순간까지만 보관한다.
      try { await sharedStorage.del(HANDOFF_KEY); } catch {}
      return job;
    }

    async function consumeHandoff() {
      if (handoffConsumed) return false;
      const expectedId = handoffIdFromPage();

      const job = await loadHandoffJob();
      if (!job) {
        if (expectedId) clearHandoffMarkers();
        return false;
      }

      if (job.v !== 2 || typeof job.text !== 'string' || !job.text || job.text.length > 300000) {
        try { sessionStorage.removeItem(GPT_SESSION_KEY); } catch {}
        clearHandoffMarkers();
        return false;
      }
      if (!Number.isFinite(job.at) || Date.now() - job.at > MAX_AGE) {
        try { sessionStorage.removeItem(GPT_SESSION_KEY); } catch {}
        try { await sharedStorage.del(HANDOFF_KEY); } catch {}
        clearHandoffMarkers();
        return false;
      }

      handoffConsumed = true;
      clearHandoffMarkers();
      toast('서사 정리 내용을 받았어. GPT 입력창을 찾는 중…');

      const deadline = Date.now() + 30000;
      let prompt = null;
      while (Date.now() < deadline) {
        prompt = findPrompt();
        if (prompt) break;
        await sleep(200);
      }

      if (!prompt) {
        try { sessionStorage.removeItem(GPT_SESSION_KEY); } catch {}
        toast('GPT 입력창을 찾지 못했어. 복사된 내용을 직접 붙여넣어 줘.');
        return true;
      }

      const ok = await insertPrompt(prompt, job.text);
      try { sessionStorage.removeItem(GPT_SESSION_KEY); } catch {}
      try { await sharedStorage.del(HANDOFF_KEY); } catch {}

      if (ok) {
        prompt.focus();
        toast('GPT 입력창에 자동으로 채웠어. 확인한 뒤 전송은 직접 눌러 줘.');
      } else {
        toast('자동 입력에 실패했어. 복사된 내용을 직접 붙여넣어 줘.');
      }
      return true;
    }


    const startHandoffConsumer = async () => {
      while (!document.body) await sleep(50);
      await consumeHandoff();
      setTimeout(consumeHandoff, 500);
      setTimeout(consumeHandoff, 1400);
    };
    startHandoffConsumer();
    window.addEventListener('pageshow', () => setTimeout(consumeHandoff, 100), { once: true });
  }

  // ---------------------------------------------------------------------------
  // Zeta parent page UI
  // ---------------------------------------------------------------------------
  if (parentSite) {
    let selected = null;
    let activeTab = 'main';
    let purpose = 'narrator';
    let scope = 'withHistory';
    let roomId = '';
    let requestedTurns = 10;
    let confirmedPrompt = '';
    let waitingForFrame = false;
    const iframeOrigin = 'https://frame.pingpong.ai';

    function locateFrame() {
      return [...document.querySelectorAll('iframe')].find(frame => {
        try { return new URL(frame.src, location.href).hostname === 'frame.pingpong.ai'; }
        catch { return false; }
      }) || null;
    }

    function toFrame(kind, extra = {}) {
      const frame = locateFrame();
      if (!frame?.contentWindow) {
        toast('채팅 iframe을 찾지 못했어. 제타 채팅방 화면에서 다시 시도해 줘.');
        return false;
      }
      if (kind === 'collect') {
        waitingForFrame = true;
        setTimeout(() => {
          if (!waitingForFrame) return;
          waitingForFrame = false;
          toast('iframe 응답이 없어. Stay 로더가 frame.pingpong.ai에서도 실행되는지 확인해 줘.');
        }, 2500);
      }
      frame.contentWindow.postMessage({ channel: CHANNEL, kind, ...extra }, iframeOrigin);
      return true;
    }

    window.addEventListener('message', event => {
      if (event.origin !== iframeOrigin || event.data?.channel !== CHANNEL) return;
      const frame = locateFrame();
      if (!frame || event.source !== frame.contentWindow) return;

      if (event.data.kind === 'collected' || event.data.kind === 'error') waitingForFrame = false;

      if (event.data.kind === 'collected') {
        const messages = event.data.messages;
        if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return;
        if (!messages.every(item =>
          (item.role === 'user' || item.role === 'character') &&
          typeof item.text === 'string' && item.text.length <= 24000
        )) return;

        selected = messages.map(item => ({
          role: item.role,
          text: item.text,
          speaker: typeof item.speaker === 'string' ? item.speaker : ''
        }));
        confirmedPrompt = '';

        const got = Math.ceil(selected.length / 2);
        const requested = Number(event.data.requestedTurns || requestedTurns);
        show('main');
        if (got < requested) toast(`현재 로드된 대화에서 ${got}턴만 가져왔어.`);
        else toast(`${got}턴 가져왔어.`);
      }

      if (event.data.kind === 'error') {
        toast(String(event.data.message || '대화 가져오기에 실패했어.'));
      }
    });

    const count = () => Math.ceil((selected?.length || 0) / 2);

    function dialogueText() {
      if (!selected?.length) return '';
      const names = {};

      for (const role of ['character', 'user']) {
        const group = selected.filter(message => message.role === role);
        const explicit = group.map(message => clean(message.speaker)).filter(Boolean);
        if (explicit.length && explicit.every(name => name === explicit[0])) {
          names[role] = explicit[0];
          continue;
        }

        if (group.length >= 2) {
          let prefix = group[0].text;
          for (const message of group.slice(1)) {
            let index = 0;
            while (index < prefix.length && index < message.text.length && prefix[index] === message.text[index]) index += 1;
            prefix = prefix.slice(0, index);
          }
          if (/^[가-힣]{2,8}$/.test(prefix) && group.every(message => message.text.length > prefix.length)) {
            names[role] = prefix;
          }
        }
      }

      return selected.map(message => {
        const speaker = names[message.role] || (message.role === 'user' ? '유저' : '캐릭터');
        const body = names[message.role] && message.text.startsWith(names[message.role])
          ? clean(message.text.slice(names[message.role].length))
          : clean(message.text);
        return `${speaker}:\n${body}`;
      }).join('\n\n');
    }

    function promptOnlyText() {
      const usage = purpose === 'narrator'
        ? '제타 AI 채팅 내레이터 덮어씌우기에 넣을 간결한 이어쓰기 메모로 정리해 줘. 현재 장면, 관계 변화, 감정선, 중요한 사건, 약속, 비밀, 이어질 장면의 필수 맥락을 우선해.'
        : '제타 유저 프로필에 넣을 서사 기록으로 정리해 줘. 장기적으로 유지해야 하는 관계, 실제 사건, 확정된 약속과 감정 변화를 간결하게 보존해.';

      const range = scope === 'withHistory'
        ? '이 GPT 채팅방에 남아 있는 이전 서사 정리가 참고 가능하면 함께 반영해 통합 요약을 작성해 줘. 이전 기록이 확인되지 않으면 이번 발췌만 사용하고 모순을 임의로 해결하지 마.'
        : '이전 서사 기록을 사용하지 말고 이번에 가져온 대화만 근거로 정리해 줘.';

      return `[제타 서사 정리 요청]\n\n[사용 용도]\n${usage}\n\n[정리 범위]\n${range}\n\n[공통 규칙]\n- 원문에 없는 이름, 사건, 설정, 감정을 새로 만들지 마.\n- 확인되지 않은 사실이나 화자는 추측하지 마.\n- 사건 순서와 관계 변화, 약속, 비밀 및 복선은 보존해.\n- 반복 농담과 수식은 줄여.\n- 최종 결과는 바로 복사할 수 있는 정리문만 작성해.`;
    }

    function fullPromptText() {
      if (!selected?.length || !confirmedPrompt) return '';
      return `${confirmedPrompt}\n\n[대화 기록: 최근 ${count()}턴 / 메시지 ${selected.length}개]\n${dialogueText()}\n\n[대화 기록 끝]`;
    }

    function clearTransient() {
      selected = null;
      confirmedPrompt = '';
    }

    function buildGPTTarget(url, jobId) {
      try {
        const target = new URL(url);
        target.searchParams.set('no_universal_links', '1');
        target.hash = `${HANDOFF_HASH}=${encodeURIComponent(jobId)}`;
        return target.toString();
      } catch {
        return '';
      }
    }

    function prepareGPTWindow() {
      try {
        const popup = window.open('about:blank', '_blank');
        if (!popup || popup.closed) return null;
        return popup;
      } catch {
        return null;
      }
    }

    function navigateGPTWindow(popup, url, jobId) {
      const target = buildGPTTarget(url, jobId);
      if (!popup || !target) return false;
      try { popup.name = HANDOFF_NAME_PREFIX + jobId; } catch {}
      try {
        popup.location.replace(target);
        popup.focus?.();
        return true;
      } catch {
        try {
          popup.location.href = target;
          popup.focus?.();
          return true;
        } catch {
          return false;
        }
      }
    }

    function newDialog() {
      document.getElementById('zgm49-overlay')?.remove();
      const overlay = create('div', document.body);
      overlay.id = 'zgm49-overlay';
      const dialog = create('div', overlay);
      dialog.id = 'zgm49-dialog';
      overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };

      const head = create('div', dialog, null, 'display:flex;justify-content:space-between;align-items:center;gap:8px');
      create('strong', head, 'Zeta GPT Memory', 'font-size:17px');
      const close = create('button', head, '✕');
      close.onclick = () => overlay.remove();

      const tabs = create('div', dialog, null, 'display:flex;gap:8px;margin:15px 0 10px;padding-bottom:10px;border-bottom:1px solid #ddd');
      const main = create('button', tabs, '서사 정리');
      const settings = create('button', tabs, '설정');
      main.onclick = () => show('main');
      settings.onclick = () => show('settings');
      (activeTab === 'main' ? main : settings).classList.add('primary');

      return create('div', dialog);
    }

    function label(root, text) {
      return create('label', root, text);
    }

    function field(root, placeholder, value = '') {
      const input = create('input', root);
      input.placeholder = placeholder;
      input.value = value;
      return input;
    }

    function btn(root, text, handler, primary = false) {
      const button = create('button', root, text);
      button.type = 'button';
      button.onclick = handler;
      if (primary) button.classList.add('primary');
      return button;
    }

    function buttons(root) {
      return create('div', root, null, 'display:flex;flex-wrap:wrap;gap:7px;margin-top:12px');
    }

    function radio(root, title, name, value, checked, onChange) {
      const line = create('label', root, null, 'display:flex;gap:8px;align-items:center;margin:6px 0!important;font-weight:500!important');
      const input = create('input', line);
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = checked;
      input.style.cssText = 'width:auto!important;flex:none';
      input.onchange = () => {
        if (!input.checked) return;
        onChange(value);
        confirmedPrompt = '';
        show('main');
      };
      create('span', line, title);
    }

    async function show(tab = 'main') {
      activeTab = tab;
      const body = newDialog();

      if (tab === 'settings') {
        label(body, '별칭');
        const name = field(body, '예: 이사랑 서사 정리');
        label(body, 'GPT 채팅방 주소');
        const url = field(body, 'https://chatgpt.com/c/...');
        create('div', body, '프로젝트 홈이나 공유 링크가 아닌 실제 개별 대화 주소(/c/...)를 저장해 줘.', 'font-size:12px;color:#666;margin-top:5px');

        let editing = null;
        const control = buttons(body);
        btn(control, '저장', async () => {
          const roomName = clean(name.value);
          const roomUrl = validURL(url.value);
          if (!roomName || roomName.length > 50 || !roomUrl) {
            toast('별칭과 GPT 개별 채팅 주소를 확인해 줘.');
            return;
          }
          const list = await rooms();
          if (editing) {
            const target = list.find(item => item.id === editing);
            if (target) {
              target.name = roomName;
              target.url = roomUrl;
            }
          } else {
            const entry = {
              id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: roomName,
              url: roomUrl
            };
            list.push(entry);
            roomId = entry.id;
          }
          await db.set(ROOM_KEY, list);
          show('settings');
          toast('채팅방 저장 완료');
        }, true);

        btn(control, '입력 초기화', () => {
          editing = null;
          name.value = '';
          url.value = '';
        });

        label(body, '저장된 GPT 채팅방');
        const list = await rooms();
        if (!list.length) create('p', body, '저장된 채팅방이 없어.', 'color:#777');
        for (const room of list) {
          const box = create('div', body, null, 'border:1px solid #ddd;background:#fff;border-radius:11px;padding:11px;margin:8px 0;overflow-wrap:anywhere');
          create('strong', box, room.name);
          create('div', box, room.url, 'font-size:11px;color:#777;margin-top:4px');
          const row = buttons(box);
          btn(row, '수정', () => {
            editing = room.id;
            name.value = room.name;
            url.value = room.url;
            name.focus();
          });
          btn(row, '삭제', async () => {
            if (!confirm(`“${room.name}”을 삭제할까?`)) return;
            await db.set(ROOM_KEY, (await rooms()).filter(item => item.id !== room.id));
            if (roomId === room.id) roomId = '';
            show('settings');
          });
        }
        return;
      }

      const list = await rooms();

      label(body, 'GPT 채팅방');
      const select = create('select', body);
      const empty = create('option', select, list.length ? '채팅방 선택' : '설정에서 GPT 채팅방을 저장해 줘');
      empty.value = '';
      list.forEach(room => {
        const option = create('option', select, room.name);
        option.value = room.id;
      });
      if (list.some(room => room.id === roomId)) select.value = roomId;
      select.onchange = () => { roomId = select.value; };

      label(body, '최근 대화 가져오기');
      const fetchRow = create('div', body, null, 'display:flex;align-items:center;gap:8px');
      const turnInput = create('input', fetchRow);
      turnInput.type = 'number';
      turnInput.min = '1';
      turnInput.max = String(MAX_TURNS);
      turnInput.step = '1';
      turnInput.inputMode = 'numeric';
      turnInput.value = String(requestedTurns);
      turnInput.style.cssText = 'width:90px;flex:none;padding:10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#222;font:13px/1.45 system-ui';
      const fetchButton = btn(fetchRow, '가져오기', () => {
        let value = Number.parseInt(turnInput.value, 10);
        if (!Number.isFinite(value)) value = 10;
        value = Math.max(1, Math.min(MAX_TURNS, value));
        requestedTurns = value;
        turnInput.value = String(value);
        selected = null;
        confirmedPrompt = '';
        if (!toFrame('collect', { turns: value })) return;
        toast(`최근 ${value}턴을 확인하는 중…`);
      }, true);
      fetchButton.style.flex = 'none';
      create('div', body, `최대 ${MAX_TURNS}턴`, 'font-size:11px;color:#999;margin-top:5px');

      if (selected?.length) {
        create('div', body, `최근 ${count()}턴 · 메시지 ${selected.length}개 가져옴`, 'margin-top:10px;background:#eee;border-radius:9px;padding:9px 11px;font-weight:700');
        label(body, '대화 미리보기');
        const preview = create('textarea', body);
        preview.readOnly = true;
        preview.rows = 7;
        preview.value = dialogueText();
        preview.style.maxHeight = '190px';
        preview.style.overflowY = 'auto';
      }

      label(body, '옵션 1 · 사용 용도');
      radio(body, '나레이션 덮어씌우기 용도', 'zgm49-purpose', 'narrator', purpose === 'narrator', value => { purpose = value; });
      radio(body, '유저 프로필에 넣는 용도', 'zgm49-purpose', 'profile', purpose === 'profile', value => { purpose = value; });

      label(body, '옵션 2 · 정리 범위');
      radio(body, '이전 서사와 함께 정리', 'zgm49-scope', 'withHistory', scope === 'withHistory', value => { scope = value; });
      radio(body, '복사한 내용만 정리', 'zgm49-scope', 'only', scope === 'only', value => { scope = value; });

      const confirmRow = buttons(body);
      const confirmButton = btn(confirmRow, '확인', () => {
        if (!selected?.length) {
          toast('먼저 대화를 가져와 줘.');
          return;
        }
        confirmedPrompt = promptOnlyText();
        show('main');
        toast('선택한 옵션으로 프롬프트를 만들었어.');
      }, true);
      confirmButton.disabled = !selected?.length;

      label(body, '프롬프트 미리보기');
      const promptPreview = create('textarea', body);
      promptPreview.readOnly = true;
      promptPreview.rows = 8;
      promptPreview.placeholder = '대화를 가져오고 옵션을 선택한 뒤 확인을 누르면 여기에 프롬프트만 보여줘.';
      promptPreview.value = confirmedPrompt;
      promptPreview.style.maxHeight = '210px';
      promptPreview.style.overflowY = 'auto';

      const bottom = buttons(body);
      const copy = btn(bottom, '대화 + 프롬프트 복사', async () => {
        const payload = fullPromptText();
        if (!payload) {
          toast('대화를 가져오고 확인을 먼저 눌러 줘.');
          return;
        }
        try {
          await navigator.clipboard.writeText(payload);
          clearTransient();
          show('main');
          toast('대화와 프롬프트를 복사했고 임시 대화 데이터도 정리했어.');
        } catch {
          toast('클립보드 권한 때문에 복사에 실패했어.');
        }
      }, true);
      copy.disabled = !selected?.length || !confirmedPrompt;

      const go = btn(bottom, 'GPT로 가져가기', async () => {
        const targetRoom = list.find(room => room.id === select.value);
        if (!targetRoom) {
          toast('GPT 채팅방을 먼저 선택해 줘.');
          return;
        }
        const payload = fullPromptText();
        if (!payload) {
          toast('대화를 가져오고 확인을 먼저 눌러 줘.');
          return;
        }

        // iOS Safari 팝업 차단을 피하려고 사용자 클릭 동기 구간에서 빈 새 탭을 먼저 연다.
        const popup = prepareGPTWindow();
        if (!popup) {
          try { await navigator.clipboard.writeText(payload); } catch {}
          toast('새 탭이 차단됐어. Safari의 팝업 차단 설정을 확인해 줘. 내용은 복사를 시도했어.');
          return;
        }

        try { await navigator.clipboard.writeText(payload); } catch {}

        const job = {
          v: 2,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: payload,
          at: Date.now()
        };

        try {
          await sharedStorage.set(HANDOFF_KEY, job);
          const verify = await sharedStorage.get(HANDOFF_KEY, null);
          if (!verify || verify.id !== job.id || verify.text !== job.text) {
            throw new Error('공용 저장소 확인 실패');
          }
        } catch (error) {
          try { popup.close(); } catch {}
          toast('GPT 전달 저장소에 연결하지 못했어. 이번 한 번만 Stay 로더를 새 버전으로 바꿔 줘. 내용은 복사를 시도했어.');
          return;
        }

        if (!navigateGPTWindow(popup, targetRoom.url, job.id)) {
          try { await sharedStorage.del(HANDOFF_KEY); } catch {}
          try { popup.close(); } catch {}
          toast('GPT 채팅방으로 이동하지 못했어. 복사된 내용을 직접 붙여넣어 줘.');
          return;
        }

        clearTransient();
        show('main');
        toast('GPT 채팅방을 새 탭으로 열었어. GPT가 받으면 전달용 임시 데이터도 바로 지워져.');
      }, true);
      go.disabled = !selected?.length || !confirmedPrompt;

      create(
        'p',
        body,
        '대화는 가져오기 버튼을 누른 순간 화면에 렌더된 말풍선 DOM만 읽어. 제타 내부 API는 사용하지 않아. GPT 가져가기는 Stay 로더의 공용 임시 저장소를 거쳐 입력창까지만 자동으로 채우고 전송은 하지 않아. 전달 데이터는 GPT가 받는 즉시 공용 저장소에서 지워져.',
        'font-size:11px;color:#777;margin-top:12px'
      );
    }

    function mount() {
      if (document.getElementById('zgm49-trigger')) return;
      const button = create('button', document.body, '서사 정리');
      button.id = 'zgm49-trigger';
      button.type = 'button';
      button.onclick = () => show('main');
    }

    mount();
  }
})();
