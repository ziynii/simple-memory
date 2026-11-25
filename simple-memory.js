(() => {
  'use strict';

  if (window.__ZGM_SIMPLE_V1_12__) return;
  window.__ZGM_SIMPLE_V1_12__ = true;

  const host = String(location.hostname || '').toLowerCase();
  const parentSite = /(^|\.)zeta-ai\.io$/.test(host) && window === window.top;
  const frameSite = host === 'frame.pingpong.ai';

  if (!parentSite && !frameSite) return;

  const CHANNEL = 'zgm.simple.v1.12';
  const BASE = 'zgm-simple-v1-';
  const ROOM_KEY = BASE + 'rooms';
  const FOLDER_KEY = BASE + 'folders';
  const TRIGGER_POSITION_KEY = BASE + 'trigger-position';
  const MAX_TURNS = 50;
  const MAX_MESSAGES = MAX_TURNS * 2;

  const clean = value => String(value ?? '').replace(/\u200b/g, '').trim();

  const create = (tag, root, text, css) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (css) el.style.cssText = css;
    if (root) root.appendChild(el);
    return el;
  };

  function toast(message) {
    document.getElementById('zgm-simple-toast')?.remove();

    const box = create(
      'div',
      document.body,
      message,
      'position:fixed;left:50%;bottom:82px;transform:translateX(-50%);z-index:2147483647;' +
      'max-width:90vw;padding:10px 13px;border-radius:11px;background:#27272a;color:#fff;' +
      'font:600 12px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 6px 24px #0004;text-align:center'
    );

    box.id = 'zgm-simple-toast';
    setTimeout(() => box.remove(), 3500);
  }

  const db = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }
  };

  function validURL(value) {
    try {
      const url = new URL(clean(value));
      if (url.origin !== 'https://chatgpt.com') return '';
      if (!/^\/c\/[^/]+\/?$/.test(url.pathname) &&
          !/^\/g\/[^/]+\/c\/[^/]+\/?$/.test(url.pathname)) return '';
      return url.origin + url.pathname.replace(/\/$/, '');
    } catch {
      return '';
    }
  }

  function browserOnlyGPTURL(value) {
    const safe = validURL(value);
    if (!safe) return '';

    try {
      const url = new URL(safe);
      url.searchParams.set('no_universal_links', '1');
      return url.toString();
    } catch {
      return safe;
    }
  }

  function folders() {
    const list = db.get(FOLDER_KEY, []);
    if (!Array.isArray(list)) return [];

    return list
      .filter(item => item && clean(item.name))
      .map(item => ({
        id: String(item.id),
        name: clean(item.name)
      }));
  }

  function rooms() {
    const list = db.get(ROOM_KEY, []);
    if (!Array.isArray(list)) return [];

    return list
      .filter(item => item && clean(item.name) && validURL(item.url))
      .map(item => ({
        id: String(item.id),
        name: clean(item.name),
        url: validURL(item.url),
        folderId: item.folderId ? String(item.folderId) : ''
      }));
  }

  const css = `
    #zgm-simple-trigger,
    #zgm-simple-overlay {
      font: 13px/1.5 system-ui,-apple-system,sans-serif;
      box-sizing: border-box;
    }

    #zgm-simple-overlay * {
      box-sizing: border-box;
    }

    #zgm-simple-trigger {
      position: fixed;
      right: 14px;
      bottom: 105px;
      z-index: 2147483600;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.18);
      background: linear-gradient(180deg, #323238 0%, #232329 100%);
      color: #fff;
      box-shadow: 0 8px 22px rgba(0,0,0,.28);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      cursor: grab;
    }

    #zgm-simple-trigger:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 26px rgba(0,0,0,.32);
    }

    #zgm-simple-trigger:active {
      transform: translateY(0);
    }

    #zgm-simple-trigger svg {
      width: 19px;
      height: 19px;
      display: block;
      pointer-events: none;
    }

    .zgm-room-picker-wrap {
      position: relative;
    }

    .zgm-room-picker-button {
      width: 100%;
      display: flex!important;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      text-align: left;
      font-weight: 500!important;
      padding: 10px 12px!important;
    }

    .zgm-room-picker-panel {
      margin-top: 7px;
      border: 1px solid #d7d7d7;
      border-radius: 11px;
      background: #fff;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,.08);
    }

    .zgm-room-picker-panel button {
      width: 100%;
      border: 0!important;
      border-radius: 0!important;
      border-bottom: 1px solid #eee!important;
      padding: 11px 12px!important;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      text-align: left;
      background: #fff!important;
      color: #222!important;
      font-weight: 500!important;
    }

    .zgm-room-picker-panel button:last-child {
      border-bottom: 0!important;
    }

    .zgm-room-picker-panel button:hover {
      background: #f6f6f6!important;
    }

    .zgm-folder-card {
      border: 1px solid #ddd;
      background: #f7f7f7;
      border-radius: 11px;
      padding: 11px;
      margin: 8px 0;
    }

    #zgm-simple-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483605;
      background: #0009;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
    }

    #zgm-simple-dialog {
      width: min(550px,100%);
      max-height: 90dvh;
      overflow: auto;
      background: #fafafa;
      color: #262626;
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 12px 38px #0006;
    }

    #zgm-simple-overlay button {
      border-radius: 10px;
      padding: 9px 12px;
      border: 1px solid #ccc;
      background: #fff;
      color: #222;
      font: 600 13px system-ui;
      cursor: pointer;
    }

    #zgm-simple-overlay button.primary {
      background: #292929;
      color: #fff;
      border-color: #292929;
    }

    #zgm-simple-overlay button:disabled {
      opacity: .42;
      cursor: default;
    }

    #zgm-simple-overlay input,
    #zgm-simple-overlay select,
    #zgm-simple-overlay textarea {
      width: 100%;
      min-width: 0;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 9px;
      background: #fff;
      color: #222;
      font: 13px/1.45 system-ui;
    }

    #zgm-simple-overlay label {
      display: block;
      font-weight: 700;
      margin: 12px 0 6px;
    }

    #zgm-simple-overlay textarea {
      resize: vertical;
    }
  `;

  create('style', document.head || document.documentElement, css);

  // ---------------------------------------------------------------------------
  // Zeta iframe: 버튼을 눌렀을 때만 현재 DOM에 렌더된 말풍선을 읽는다.
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
      const aligned =
        (c.contains('self-end') || c.contains('self-start')) &&
        (c.contains('w-fit') || c.contains('px-3') || c.contains('py-2'));

      return userShape || charShape || aligned;
    }

    function roleForBubble(el) {
      const c = el.classList;

      if (c.contains('self-end') || c.contains('rounded-l-xl')) return 'user';
      if (c.contains('self-start') || c.contains('rounded-r-xl')) return 'character';

      const row = el.closest('div.flex.flex-row.items-start');
      if (row?.classList.contains('ml-auto') || row?.classList.contains('pl-[72px]')) {
        return 'user';
      }

      return 'character';
    }

    function rowForBubble(el, root) {
      let row = el.parentElement;

      while (row && row !== root) {
        if (row.classList?.contains('flex-row') && row.classList?.contains('items-start')) {
          return row;
        }
        row = row.parentElement;
      }

      return el.parentElement || el;
    }

    function textFromBubble(bubble) {
      const clone = bubble.cloneNode(true);

      clone
        .querySelectorAll(
          'button,svg,script,style,select,textarea,input,[aria-hidden="true"],.message-context-menu-trigger'
        )
        .forEach(el => el.remove());

      return clean(clone.innerText || clone.textContent).replace(/\n{3,}/g, '\n\n');
    }

    function speakerFromBubble(bubble, text) {
      const clone = bubble.cloneNode(true);

      clone
        .querySelectorAll(
          'button,svg,script,style,select,textarea,input,[aria-hidden="true"],.message-context-menu-trigger'
        )
        .forEach(el => el.remove());

      const leaf = [...clone.querySelectorAll('*')].find(el => {
        const value = clean(el.textContent);

        return (
          el.children.length === 0 &&
          /^[가-힣A-Za-z][가-힣A-Za-z0-9 _.-]{0,19}$/.test(value) &&
          text.startsWith(value) &&
          text.length > value.length
        );
      });

      return leaf ? clean(leaf.textContent) : '';
    }

    function getEntries() {
      const root = log();
      if (!root) return [];

      const all = [...root.querySelectorAll('div')];

      const strong = all.filter(el => {
        const c = el.classList;
        return (
          (c.contains('rounded-l-xl') && c.contains('rounded-br-xl')) ||
          (c.contains('rounded-r-xl') && c.contains('rounded-bl-xl'))
        );
      });

      const weak = all.filter(
        el =>
          isBubbleShape(el) &&
          !strong.some(
            strongEl =>
              strongEl === el ||
              strongEl.contains(el) ||
              el.contains(strongEl)
          )
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

        entries.push({
          row,
          bubble,
          role,
          text,
          speaker: speakerFromBubble(bubble, text)
        });
      }

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

      window.parent.postMessage(
        {
          channel: CHANNEL,
          kind,
          ...extra
        },
        origin
      );
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    function simpleEntry(item) {
      return {
        role: item.role,
        text: item.text,
        speaker: item.speaker || ''
      };
    }

    function entryKey(item) {
      return `${item.role}\u241f${item.speaker || ''}\u241f${item.text}`;
    }

    function mergeOlder(current, olderSnapshot) {
      const older = olderSnapshot.map(simpleEntry);
      if (!current.length) return older;
      if (!older.length) return current;

      const olderKeys = older.map(entryKey);
      const currentKeys = current.map(entryKey);
      const maxOverlap = Math.min(older.length, current.length);

      for (let size = maxOverlap; size >= 1; size -= 1) {
        let matched = true;

        for (let i = 0; i < size; i += 1) {
          if (olderKeys[older.length - size + i] !== currentKeys[i]) {
            matched = false;
            break;
          }
        }

        if (matched) {
          return [...older, ...current.slice(size)];
        }
      }

      // 한 화면보다 조금씩만 이동하므로 보통 overlap이 생긴다.
      // 그래도 overlap을 못 찾았으면 중복을 최소화하면서 오래된 쪽을 앞에 붙인다.
      const currentSet = new Set(currentKeys);
      const uniqueOlder = older.filter(item => !currentSet.has(entryKey(item)));
      return [...uniqueOlder, ...current];
    }

    function findScrollContainer(root) {
      if (!root) return document.scrollingElement || null;

      const chain = [];
      let node = root;

      while (node && node instanceof Element) {
        chain.push(node);
        if (node === document.body || node === document.documentElement) break;
        node = node.parentElement;
      }

      const score = el => {
        if (!el) return -Infinity;

        let value = 0;

        try {
          const style = getComputedStyle(el);
          const overflowY = String(style.overflowY || '');

          if (/auto|scroll|overlay/i.test(overflowY)) value += 120;
          if (el.matches?.('[data-radix-scroll-area-viewport]')) value += 180;
          if (el.matches?.('[data-scroll-container],[data-virtuoso-scroller]')) value += 180;
          if (/overflow-y-(?:auto|scroll)/.test(String(el.className || ''))) value += 100;

          const range = el.scrollHeight - el.clientHeight;
          if (range > 8) value += 80;
          if (range > 500) value += 30;
          if (el.clientHeight > 250) value += 20;
        } catch {}

        // log에 가까운 조상일수록 우선한다.
        const index = chain.indexOf(el);
        if (index >= 0) value += Math.max(0, 80 - index * 8);

        return value;
      };

      const ancestorCandidates = chain
        .filter(el => {
          try {
            return el.scrollHeight > el.clientHeight + 8;
          } catch {
            return false;
          }
        })
        .sort((a, b) => score(b) - score(a));

      if (ancestorCandidates[0]) return ancestorCandidates[0];

      const preferred = [
        ...document.querySelectorAll(
          '[data-radix-scroll-area-viewport],[data-scroll-container],[data-virtuoso-scroller],[class*="overflow-y-auto"],[class*="overflow-y-scroll"]'
        )
      ]
        .filter(el => {
          try {
            return el.contains(root) &&
              el.scrollHeight > el.clientHeight + 8 &&
              el.clientHeight > 160;
          } catch {
            return false;
          }
        })
        .sort((a, b) => score(b) - score(a));

      if (preferred[0]) return preferred[0];

      const fallback = [...document.querySelectorAll('main,section,div')]
        .filter(el => {
          try {
            return el.contains(root) &&
              el.scrollHeight > el.clientHeight + 80 &&
              el.clientHeight > 180;
          } catch {
            return false;
          }
        })
        .sort((a, b) => score(b) - score(a));

      return fallback[0] || document.scrollingElement || null;
    }

    function snapshotSignature(entries) {
      return entries
        .map(item => entryKey(simpleEntry(item)))
        .join('\u241e');
    }

    async function waitForChangedSnapshot(previousSignature, timeout = 3200) {
      const deadline = Date.now() + timeout;
      let latest = getEntries();

      while (Date.now() < deadline) {
        const signature = snapshotSignature(latest);

        if (signature && signature !== previousSignature) {
          // 변화가 확인된 뒤에만 한 번 더 안정화된 DOM을 읽는다.
          await wait(120);
          return getEntries();
        }

        // 전체 말풍선 DOM 재스캔을 너무 자주 하지 않도록
        // 250ms 간격으로 제한한다.
        await wait(250);
        latest = getEntries();
      }

      return latest;
    }

    function scrollTowardOlder(scroller, entries) {
      if (!scroller) return false;

      const first = entries[0];
      const anchor = first?.row || first?.bubble || null;

      // 현재 DOM에서 가장 오래된 말풍선을 먼저 화면 위쪽으로 붙인다.
      if (anchor?.scrollIntoView) {
        try {
          anchor.scrollIntoView({
            block: 'start',
            inline: 'nearest',
            behavior: 'auto'
          });
        } catch {}
      }

      const beforeTop = Number(scroller.scrollTop || 0);
      const amount = Math.max(
        360,
        Math.floor((scroller.clientHeight || window.innerHeight || 600) * 0.9)
      );

      // 중요:
      // iOS Safari + column-reverse 계열 스크롤러는 과거 방향으로 갈수록
      // scrollTop이 음수가 될 수 있다. 따라서 0으로 강제 보정하면 안 된다.
      try {
        if (typeof scroller.scrollBy === 'function') {
          scroller.scrollBy({
            top: -amount,
            left: 0,
            behavior: 'auto'
          });
        } else {
          scroller.scrollTop = beforeTop - amount;
        }
      } catch {
        try {
          scroller.scrollTop = beforeTop - amount;
        } catch {}
      }

      return true;
    }

    async function scrollToLatest() {
      // 제타의 가상 스크롤은 맨 아래로 내리는 순간 DOM을 다시 구성할 수 있어서
      // 한 번만 scrollTop=scrollHeight를 주지 않고 최신 말풍선 기준 + scrollHeight 기준을 반복한다.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const liveRoot = log();
        const scroller = liveRoot ? findScrollContainer(liveRoot) : null;
        const entries = getEntries();
        const last = entries[entries.length - 1];
        const anchor = last?.row || last?.bubble || null;

        if (anchor?.scrollIntoView) {
          try {
            anchor.scrollIntoView({
              block: 'end',
              inline: 'nearest',
              behavior: 'auto'
            });
          } catch {}
        }

        if (scroller) {
          try {
            if (typeof scroller.scrollTo === 'function') {
              scroller.scrollTo({
                top: scroller.scrollHeight,
                left: 0,
                behavior: 'auto'
              });
            } else {
              scroller.scrollTop = scroller.scrollHeight;
            }
          } catch {
            try { scroller.scrollTop = scroller.scrollHeight; } catch {}
          }
        }

        await wait(attempt === 0 ? 180 : 120);
      }
    }

    async function collectRecent(turns) {
      const requested = Math.max(
        1,
        Math.min(MAX_TURNS, Number.parseInt(turns, 10) || 10)
      );
      const wantedMessages = requested * 2;

      const firstEntries = getEntries();

      if (!firstEntries.length) {
        send('error', {
          message:
            '현재 화면에서 말풍선 DOM을 찾지 못했어. 채팅 화면을 조금 움직인 뒤 다시 시도해 줘.'
        });
        return;
      }

      let collected = firstEntries.map(simpleEntry);

      let noProgressCount = 0;
      let stuckAtEdgeCount = 0;
      let steps = 0;

      // 50턴에서도 충분히 위로 올라갈 수 있게 넉넉히 허용하되 무한 루프는 막는다.
      const maxSteps = Math.max(
        18,
        Math.min(70, Math.ceil(requested * 1.25))
      );

      send('collect-progress', {
        requestedTurns: requested,
        loadedTurns: Math.min(requested, Math.ceil(collected.length / 2))
      });

      while (collected.length < wantedMessages && steps < maxSteps) {
        const liveRoot = log();
        const scroller = liveRoot ? findScrollContainer(liveRoot) : null;

        if (!scroller) break;

        const beforeEntries = getEntries();
        const beforeSignature = snapshotSignature(beforeEntries);
        const beforeLength = collected.length;
        const beforeTop = Number(scroller.scrollTop || 0);

        scrollTowardOlder(scroller, beforeEntries);

        // 스크롤 반영 + 과거 메시지 fetch/render 시간을 기다린다.
        await wait(260);
        const snapshot = await waitForChangedSnapshot(beforeSignature, 3200);

        collected = mergeOlder(collected, snapshot);
        steps += 1;

        const loadedTurns = Math.min(
          requested,
          Math.ceil(collected.length / 2)
        );

        send('collect-progress', {
          requestedTurns: requested,
          loadedTurns
        });

        const gained = collected.length - beforeLength;

        // React가 scroller 자체를 교체했을 수 있으므로 여기서 다시 찾는다.
        const currentRoot = log();
        const currentScroller = currentRoot
          ? findScrollContainer(currentRoot)
          : null;

        const afterTop = currentScroller
          ? Number(currentScroller.scrollTop || 0)
          : beforeTop;

        const moved = Math.abs(afterTop - beforeTop) >= 1;

        if (gained > 0) {
          noProgressCount = 0;
          stuckAtEdgeCount = 0;
        } else {
          noProgressCount += 1;

          // 정상 스크롤/역방향 스크롤 모두 "값이 거의 안 변함"을
          // 실제 끝에 닿은 신호로 사용한다. scrollTop의 부호는 보지 않는다.
          if (!moved) {
            stuckAtEdgeCount += 1;
          } else {
            stuckAtEdgeCount = 0;
          }
        }

        // 진짜 위 끝에 닿았는데 새 말풍선도 안 생기는 상태가
        // 3번 연속일 때만 "더 과거 대화 없음"으로 판단한다.
        // 이동은 되는데 로딩이 늦는 경우도 있으므로 전체 무진행은 더 넉넉히 본다.
        if (stuckAtEdgeCount >= 3) break;
        if (noProgressCount >= 8) break;
      }

      // 마지막 렌더 상태도 한 번 더 합친다.
      collected = mergeOlder(collected, getEntries());

      const slice = collected.slice(-wantedMessages);

      // 1) 먼저 부모에 결과를 보내 미리보기를 띄운다.
      send('collected', {
        requestedTurns: requested,
        availableTurns: Math.ceil(collected.length / 2),
        autoScrolled: steps > 0,
        scrollSteps: steps,
        messages: slice
      });

      // 2) 미리보기 렌더가 먼저 일어날 시간을 아주 조금 준 뒤,
      //    채팅 화면은 항상 '맨 아래 최신 메시지'로 되돌린다.
      await wait(220);
      await scrollToLatest();
    }

    window.addEventListener('message', event => {
      if (
        event.source !== window.parent ||
        !/^https:\/\/(?:[^/]+\.)?zeta-ai\.io$/.test(event.origin)
      ) return;

      if (event.data?.channel !== CHANNEL) return;

      if (event.data.kind === 'collect') {
        collectRecent(event.data.turns);
      }
    });

    send('frame-ready');
  }

  // ---------------------------------------------------------------------------
  // Zeta parent
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
        try {
          return new URL(frame.src, location.href).hostname === 'frame.pingpong.ai';
        } catch {
          return false;
        }
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
          toast('iframe 응답이 없어. Stay에서 frame.pingpong.ai가 허용되어 있는지 확인해 줘.');
        }, 90000);
      }

      frame.contentWindow.postMessage(
        {
          channel: CHANNEL,
          kind,
          ...extra
        },
        iframeOrigin
      );

      return true;
    }

    window.addEventListener('message', event => {
      if (event.origin !== iframeOrigin || event.data?.channel !== CHANNEL) return;

      const frame = locateFrame();
      if (!frame || event.source !== frame.contentWindow) return;

      if (event.data.kind === 'collected' || event.data.kind === 'error') {
        waitingForFrame = false;
      }

      if (event.data.kind === 'collect-progress') {
        const loaded = Number(event.data.loadedTurns || 0);
        const requested = Number(event.data.requestedTurns || requestedTurns);
        toast(`대화를 불러오는 중… ${loaded}/${requested}턴`);
      }

      if (event.data.kind === 'collected') {
        const messages = event.data.messages;

        if (
          !Array.isArray(messages) ||
          !messages.length ||
          messages.length > MAX_MESSAGES
        ) return;

        if (
          !messages.every(
            item =>
              (item.role === 'user' || item.role === 'character') &&
              typeof item.text === 'string' &&
              item.text.length <= 24000
          )
        ) return;

        selected = messages.map(item => ({
          role: item.role,
          text: item.text,
          speaker: typeof item.speaker === 'string' ? item.speaker : ''
        }));

        confirmedPrompt = '';
        show('main');

        const got = Math.ceil(selected.length / 2);
        const requested = Number(event.data.requestedTurns || requestedTurns);

        toast(
          got < requested
            ? `과거 대화를 자동으로 불러왔지만 ${got}턴까지만 찾았어.`
            : event.data.autoScrolled
              ? `자동으로 과거 대화를 불러와서 ${got}턴 가져왔어.`
              : `${got}턴 가져왔어.`
        );
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
        const explicit = group
          .map(message => clean(message.speaker))
          .filter(Boolean);

        if (explicit.length && explicit.every(name => name === explicit[0])) {
          names[role] = explicit[0];
          continue;
        }

        if (group.length >= 2) {
          let prefix = group[0].text;

          for (const message of group.slice(1)) {
            let index = 0;

            while (
              index < prefix.length &&
              index < message.text.length &&
              prefix[index] === message.text[index]
            ) {
              index += 1;
            }

            prefix = prefix.slice(0, index);
          }

          if (
            /^[가-힣]{2,8}$/.test(prefix) &&
            group.every(message => message.text.length > prefix.length)
          ) {
            names[role] = prefix;
          }
        }
      }

      return selected
        .map(message => {
          const speaker =
            names[message.role] ||
            (message.role === 'user' ? '유저' : '캐릭터');

          const body =
            names[message.role] && message.text.startsWith(names[message.role])
              ? clean(message.text.slice(names[message.role].length))
              : clean(message.text);

          return `${speaker}:\n${body}`;
        })
        .join('\n\n');
    }

    function promptOnlyText() {
      const range =
        scope === 'withHistory'
          ? '이 GPT 채팅방에 남아 있는 이전 서사 정리가 참고 가능하면 함께 반영해 통합 요약을 작성해 줘. 이전 기록이 확인되지 않으면 이번 발췌만 사용하고 모순을 임의로 해결하지 마.'
          : '이전 서사 기록을 사용하지 말고 이번에 가져온 대화만 근거로 정리해 줘.';

      if (purpose === 'profile') {
        return `[제타 서사 정리 요청]

[사용 용도]
제타 유저 프로필에 장기적으로 보존할 서사 기록으로 정리해 줘.

현재 장면의 세부 묘사보다는 앞으로 대화가 오래 이어져도 유지되어야 하는 관계, 실제로 일어난 중요한 사건, 확정된 약속, 서로 알고 있는 비밀, 관계에 영향을 준 감정 변화와 장기 설정을 중심으로 남겨 줘.

일시적인 기분이나 그 장면에서만 의미 있는 행동은 줄이고, 이후 대화에서도 캐릭터가 기억해야 할 사실을 우선해.

[정리 범위]
${range}

[분량]
최종 정리문은 600자 이내로 작성해 줘.

[공통 규칙]
- 원문에 없는 이름, 사건, 설정, 감정을 새로 만들지 마.
- 확인되지 않은 사실이나 화자는 추측하지 마.
- 실제로 일어난 사건과 확정된 정보만 기록해.
- 관계 변화, 약속, 비밀처럼 앞으로도 영향을 주는 정보는 우선해서 보존해.
- 이미 끝난 일회성 상황, 반복 농담, 세세한 행동 묘사는 과감히 줄여.
- 비슷한 내용은 합쳐서 간결하게 정리해.
- 최종 결과에는 설명, 머리말, 후기 없이 바로 프로필에 넣을 수 있는 정리문만 출력해.`;
      }

      if (purpose === 'lorebook') {
        return `[제타 서사 정리 요청]

[사용 용도]
제타 AI 채팅에서 키워드로 발동시키는 로어북 항목으로 정리해 줘.

로어북은 매 장면의 요약이 아니라, 특정 인물·장소·사건·관계·물건 등의 키워드가 다시 등장했을 때 불러와 이야기를 자연스럽게 이어가기 위한 장기 서사 기록이야.

앞으로 이야기 전개에 영향을 줄 가능성이 높은 장기 서사, 관계의 중요한 변화, 아직 회수되지 않은 복선, 비밀, 약속, 갈등, 특별한 사건이나 설정을 우선해서 추려 줘.

서로 관련 없는 내용은 억지로 하나의 항목에 합치지 말고, 필요하다면 각각 별도의 로어북 항목으로 나눠 줘.

[정리 범위]
${range}

[출력 형식]
각 로어북 항목은 반드시 아래 형식을 사용해.

제목:
키워드:
내용:

[키워드 규칙]
- 키워드는 해당 내용을 다시 불러와야 할 가능성이 높은 단어나 이름으로 최대 5개까지 작성해.
- 캐릭터명, 장소명, 사건명, 관계를 떠올릴 수 있는 핵심 표현을 우선해.
- 너무 일반적인 단어는 피하고 실제 발동에 도움이 되는 키워드를 선택해.
- 원문에 등장하지 않은 고유명사나 새로운 키워드를 임의로 만들지 마.

[내용 규칙]
- 해당 키워드가 다시 등장했을 때 캐릭터가 알아야 할 사실과 서사 맥락을 간결하게 기록해.
- 이미 해결되어 다시 기억할 필요가 없는 일회성 장면은 제외해.
- 아직 해결되지 않은 복선, 비밀, 약속, 갈등은 반드시 보존해.
- 관계 변화가 있다면 변화 전후가 이해되도록 기록해.
- 원문에 없는 사건이나 감정을 추측해서 추가하지 마.
- 설명이나 머리말 없이 완성된 로어북 항목만 출력해.`;
      }

      return `[제타 서사 정리 요청]

[사용 용도]
제타 AI 채팅의 나레이션 덮어씌우기에 넣을 이어쓰기 메모로 정리해 줘.

현재 장면에서 바로 이어서 이야기를 진행할 수 있도록 현재 상황, 인물 간 관계 변화, 감정선, 중요한 사건, 약속, 비밀, 복선과 다음 장면에 필요한 맥락을 우선해서 보존해.

과거의 모든 사건을 나열하기보다는 현재 서사에 영향을 주고 있거나 앞으로 이어질 가능성이 높은 정보에 집중해.

[정리 범위]
${range}

[분량]
최종 정리문은 2000자 이내로 작성해 줘.

[공통 규칙]
- 원문에 없는 이름, 사건, 설정, 감정을 새로 만들지 마.
- 확인되지 않은 사실이나 화자는 추측하지 마.
- 사건의 순서와 관계 변화는 보존해.
- 중요한 약속, 비밀, 복선, 갈등 요소는 빠뜨리지 마.
- 이미 해결되어 현재 서사에 영향이 없는 일회성 사건이나 반복 농담은 줄여.
- 인물의 감정을 단정해서 새로 해석하지 말고 대화에서 확인되는 변화만 기록해.
- 최종 결과에는 설명, 머리말, 후기 없이 바로 사용할 수 있는 정리문만 출력해.`;
    }

    function fullPromptText() {
      if (!selected?.length || !confirmedPrompt) return '';

      return `${confirmedPrompt}

[대화 기록: 최근 ${count()}턴 / 메시지 ${selected.length}개]
${dialogueText()}

[대화 기록 끝]`;
    }

    function newDialog() {
      document.getElementById('zgm-simple-overlay')?.remove();

      const overlay = create('div', document.body);
      overlay.id = 'zgm-simple-overlay';

      const dialog = create('div', overlay);
      dialog.id = 'zgm-simple-dialog';

      overlay.onclick = event => {
        if (event.target === overlay) overlay.remove();
      };

      const head = create(
        'div',
        dialog,
        null,
        'display:flex;justify-content:space-between;align-items:center;gap:8px'
      );

      create('strong', head, 'Zeta GPT Memory', 'font-size:17px');

      const close = create('button', head, '✕');
      close.onclick = () => overlay.remove();

      const tabs = create(
        'div',
        dialog,
        null,
        'display:flex;gap:8px;margin:15px 0 10px;padding-bottom:10px;border-bottom:1px solid #ddd'
      );

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
      return create(
        'div',
        root,
        null,
        'display:flex;flex-wrap:wrap;gap:7px;margin-top:12px'
      );
    }

    function radio(root, title, name, value, checked, onChange) {
      const line = create(
        'label',
        root,
        null,
        'display:flex;gap:8px;align-items:center;margin:6px 0!important;font-weight:500!important'
      );

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

    function show(tab = 'main') {
      activeTab = tab;

      const body = newDialog();

      if (tab === 'settings') {
        // ------------------------------
        // 폴더 관리
        // ------------------------------
        label(body, '폴더');

        const folderRow = create(
          'div',
          body,
          null,
          'display:flex;gap:7px;align-items:center'
        );

        const folderName = field(folderRow, '예: 권시현');
        folderName.style.flex = '1';

        const addFolder = btn(folderRow, '폴더 추가', () => {
          const value = clean(folderName.value);

          if (!value || value.length > 40) {
            toast('폴더 이름을 확인해 줘.');
            return;
          }

          const list = folders();
          if (list.some(item => item.name === value)) {
            toast('같은 이름의 폴더가 이미 있어.');
            return;
          }

          list.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: value
          });

          db.set(FOLDER_KEY, list);
          show('settings');
          toast('폴더를 만들었어.');
        });
        addFolder.style.flex = 'none';

        const folderList = folders();
        const roomListForFolders = rooms();

        if (folderList.length) {
          for (const folder of folderList) {
            const card = create('div', body, null, null);
            card.className = 'zgm-folder-card';

            const head = create(
              'div',
              card,
              null,
              'display:flex;align-items:center;justify-content:space-between;gap:8px'
            );

            create('strong', head, `📁 ${folder.name}`);

            const count = roomListForFolders.filter(room => room.folderId === folder.id).length;
            create('span', head, `${count}개`, 'font-size:11px;color:#888');

            const row = buttons(card);

            btn(row, '이름 변경', () => {
              const next = clean(prompt('새 폴더 이름을 입력해 줘.', folder.name) || '');
              if (!next || next.length > 40) return;

              const current = folders();
              const target = current.find(item => item.id === folder.id);
              if (!target) return;
              target.name = next;
              db.set(FOLDER_KEY, current);
              show('settings');
            });

            btn(row, '삭제', () => {
              if (!confirm(`“${folder.name}” 폴더를 삭제할까?\n안의 채팅방 주소는 삭제되지 않고 폴더 없음으로 이동해.`)) return;

              db.set(
                FOLDER_KEY,
                folders().filter(item => item.id !== folder.id)
              );

              db.set(
                ROOM_KEY,
                rooms().map(room =>
                  room.folderId === folder.id
                    ? { ...room, folderId: '' }
                    : room
                )
              );

              show('settings');
              toast('폴더만 삭제하고 안의 채팅방은 유지했어.');
            });
          }
        } else {
          create(
            'div',
            body,
            '폴더를 만들면 같은 캐릭터의 나레이션방·로어북방 등을 묶어둘 수 있어.',
            'font-size:12px;color:#777;margin-top:7px'
          );
        }

        // ------------------------------
        // 채팅방 저장 / 수정
        // ------------------------------
        label(body, '별칭');
        const name = field(body, '예: 권시현 나레 정리방');

        label(body, '폴더 선택');
        const folderSelect = create('select', body);
        const noFolder = create('option', folderSelect, '폴더 없음');
        noFolder.value = '';

        folders().forEach(folder => {
          const option = create('option', folderSelect, folder.name);
          option.value = folder.id;
        });

        label(body, 'GPT 채팅방 주소');
        const url = field(body, 'https://chatgpt.com/c/...');

        create(
          'div',
          body,
          '실제 개별 ChatGPT 대화 주소(/c/...)를 저장해 줘.',
          'font-size:12px;color:#666;margin-top:5px'
        );

        let editing = null;

        const control = buttons(body);

        btn(
          control,
          '저장',
          () => {
            const roomName = clean(name.value);
            const roomUrl = validURL(url.value);
            const targetFolderId = folderSelect.value || '';

            if (!roomName || roomName.length > 50 || !roomUrl) {
              toast('별칭과 GPT 개별 채팅 주소를 확인해 줘.');
              return;
            }

            const list = rooms();

            if (editing) {
              const target = list.find(item => item.id === editing);

              if (target) {
                target.name = roomName;
                target.url = roomUrl;
                target.folderId = targetFolderId;
              }
            } else {
              const entry = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                name: roomName,
                url: roomUrl,
                folderId: targetFolderId
              };

              list.push(entry);
              roomId = entry.id;
            }

            db.set(ROOM_KEY, list);
            show('settings');
            toast('채팅방 저장 완료');
          },
          true
        );

        btn(control, '입력 초기화', () => {
          editing = null;
          name.value = '';
          url.value = '';
          folderSelect.value = '';
        });

        label(body, '저장된 GPT 채팅방');

        const list = rooms();
        const folderMap = new Map(folders().map(folder => [folder.id, folder]));

        if (!list.length) {
          create('p', body, '저장된 채팅방이 없어.', 'color:#777');
        }

        const renderRoomCard = room => {
          const box = create(
            'div',
            body,
            null,
            'border:1px solid #ddd;background:#fff;border-radius:11px;padding:11px;margin:8px 0;overflow-wrap:anywhere'
          );

          const folder = room.folderId ? folderMap.get(room.folderId) : null;
          if (folder) {
            create('div', box, `📁 ${folder.name}`, 'font-size:11px;color:#777;margin-bottom:3px');
          }

          create('strong', box, room.name);
          create(
            'div',
            box,
            room.url,
            'font-size:11px;color:#777;margin-top:4px'
          );

          const row = buttons(box);

          btn(row, '수정', () => {
            editing = room.id;
            name.value = room.name;
            url.value = room.url;
            folderSelect.value = room.folderId || '';
            name.focus();
          });

          btn(row, '삭제', () => {
            if (!confirm(`“${room.name}”을 삭제할까?`)) return;

            db.set(
              ROOM_KEY,
              rooms().filter(item => item.id !== room.id)
            );

            if (roomId === room.id) roomId = '';

            show('settings');
          });
        };

        // 폴더 없는 방 먼저
        list.filter(room => !room.folderId || !folderMap.has(room.folderId)).forEach(renderRoomCard);

        // 폴더 순서대로 방 표시
        folders().forEach(folder => {
          list.filter(room => room.folderId === folder.id).forEach(renderRoomCard);
        });

        return;
      }

      const list = rooms();
      const folderList = folders();
      const folderMap = new Map(folderList.map(folder => [folder.id, folder]));

      label(body, 'GPT 채팅방');

      const pickerWrap = create('div', body);
      pickerWrap.className = 'zgm-room-picker-wrap';

      const pickerButton = create('button', pickerWrap);
      pickerButton.type = 'button';
      pickerButton.className = 'zgm-room-picker-button';

      const pickerLabel = create('span', pickerButton);
      const pickerArrow = create('span', pickerButton, '⌄', 'color:#888;font-size:14px');

      const selectedRoom = list.find(room => room.id === roomId);
      pickerLabel.textContent = selectedRoom ? selectedRoom.name : '채팅방 선택';

      let pickerPanel = null;

      function closePicker() {
        pickerPanel?.remove();
        pickerPanel = null;
        pickerArrow.textContent = '⌄';
      }

      function chooseRoom(room) {
        roomId = room.id;
        pickerLabel.textContent = room.name;
        closePicker();
      }

      function renderPickerFolder(folder) {
        if (!pickerPanel) return;
        pickerPanel.replaceChildren();

        const back = create('button', pickerPanel);
        back.type = 'button';
        create('span', back, '← 폴더 목록');
        back.onclick = () => renderPickerRoot();

        const inside = list.filter(room => room.folderId === folder.id);

        if (!inside.length) {
          create(
            'div',
            pickerPanel,
            '이 폴더에는 저장된 채팅방이 없어.',
            'padding:12px;color:#888;font-size:12px'
          );
          return;
        }

        inside.forEach(room => {
          const item = create('button', pickerPanel);
          item.type = 'button';
          create('span', item, room.name);
          if (room.id === roomId) create('span', item, '✓', 'color:#777');
          item.onclick = () => chooseRoom(room);
        });
      }

      function renderPickerRoot() {
        if (!pickerPanel) return;
        pickerPanel.replaceChildren();

        if (!list.length) {
          create(
            'div',
            pickerPanel,
            '설정에서 GPT 채팅방을 먼저 저장해 줘.',
            'padding:12px;color:#888;font-size:12px'
          );
          return;
        }

        const ungrouped = list.filter(room => !room.folderId || !folderMap.has(room.folderId));

        ungrouped.forEach(room => {
          const item = create('button', pickerPanel);
          item.type = 'button';
          create('span', item, room.name);
          if (room.id === roomId) create('span', item, '✓', 'color:#777');
          item.onclick = () => chooseRoom(room);
        });

        folderList.forEach(folder => {
          const count = list.filter(room => room.folderId === folder.id).length;
          const item = create('button', pickerPanel);
          item.type = 'button';
          create('span', item, `📁 ${folder.name}`);
          create('span', item, `${count}개  ›`, 'color:#888;font-size:11px');
          item.onclick = () => renderPickerFolder(folder);
        });
      }

      pickerButton.onclick = () => {
        if (pickerPanel) {
          closePicker();
          return;
        }

        pickerPanel = create('div', pickerWrap);
        pickerPanel.className = 'zgm-room-picker-panel';
        pickerArrow.textContent = '⌃';
        renderPickerRoot();
      };

      label(body, '최근 대화 가져오기');

      const fetchRow = create(
        'div',
        body,
        null,
        'display:flex;align-items:center;gap:8px'
      );

      const turnInput = create('input', fetchRow);

      turnInput.type = 'number';
      turnInput.min = '1';
      turnInput.max = String(MAX_TURNS);
      turnInput.step = '1';
      turnInput.inputMode = 'numeric';
      turnInput.value = String(requestedTurns);
      turnInput.style.cssText =
        'width:90px;flex:none;padding:10px;border:1px solid #ccc;border-radius:9px;background:#fff;color:#222;font:13px/1.45 system-ui';

      const fetchButton = btn(
        fetchRow,
        '가져오기',
        () => {
          let value = Number.parseInt(turnInput.value, 10);

          if (!Number.isFinite(value)) value = 10;

          value = Math.max(1, Math.min(MAX_TURNS, value));

          requestedTurns = value;
          turnInput.value = String(value);
          selected = null;
          confirmedPrompt = '';

          if (!toFrame('collect', { turns: value })) return;

          toast(`최근 ${value}턴을 확인하는 중…`);
        },
        true
      );

      fetchButton.style.flex = 'none';

      create(
        'div',
        body,
        `최대 ${MAX_TURNS}턴`,
        'font-size:11px;color:#999;margin-top:5px'
      );

      if (selected?.length) {
        create(
          'div',
          body,
          `최근 ${count()}턴 · 메시지 ${selected.length}개 가져옴`,
          'margin-top:10px;background:#eee;border-radius:9px;padding:9px 11px;font-weight:700'
        );

        label(body, '대화 미리보기');

        const preview = create('textarea', body);

        preview.readOnly = true;
        preview.rows = 7;
        preview.value = dialogueText();
        preview.style.maxHeight = '190px';
        preview.style.overflowY = 'auto';
      }

      label(body, '옵션 1 · 사용 용도');

      radio(
        body,
        '나레이션 덮어씌우기 용도',
        'zgm-simple-purpose',
        'narrator',
        purpose === 'narrator',
        value => {
          purpose = value;
        }
      );

      radio(
        body,
        '유저 프로필에 넣는 용도',
        'zgm-simple-purpose',
        'profile',
        purpose === 'profile',
        value => {
          purpose = value;
        }
      );

      radio(
        body,
        '로어북 용도 (키워드 발동)',
        'zgm-simple-purpose',
        'lorebook',
        purpose === 'lorebook',
        value => {
          purpose = value;
        }
      );

      label(body, '옵션 2 · 정리 범위');

      radio(
        body,
        '이전 서사와 함께 정리',
        'zgm-simple-scope',
        'withHistory',
        scope === 'withHistory',
        value => {
          scope = value;
        }
      );

      radio(
        body,
        '복사한 내용만 정리',
        'zgm-simple-scope',
        'only',
        scope === 'only',
        value => {
          scope = value;
        }
      );

      const confirmRow = buttons(body);

      const confirmButton = btn(
        confirmRow,
        '확인',
        () => {
          if (!selected?.length) {
            toast('먼저 대화를 가져와 줘.');
            return;
          }

          confirmedPrompt = promptOnlyText();
          show('main');
          toast('선택한 옵션으로 프롬프트를 만들었어.');
        },
        true
      );

      confirmButton.disabled = !selected?.length;

      label(body, '프롬프트 미리보기');

      const promptPreview = create('textarea', body);

      promptPreview.readOnly = true;
      promptPreview.rows = 8;
      promptPreview.placeholder =
        '대화를 가져오고 옵션을 선택한 뒤 확인을 누르면 여기에 프롬프트만 보여줘.';
      promptPreview.value = confirmedPrompt;
      promptPreview.style.maxHeight = '210px';
      promptPreview.style.overflowY = 'auto';

      const bottom = buttons(body);

      const copy = btn(
        bottom,
        '복사하기',
        async () => {
          const payload = fullPromptText();

          if (!payload) {
            toast('대화를 가져오고 확인을 먼저 눌러 줘.');
            return;
          }

          try {
            await navigator.clipboard.writeText(payload);
            toast('대화 + 프롬프트를 복사했어.');
          } catch {
            toast('클립보드 권한 때문에 복사에 실패했어.');
          }
        },
        true
      );

      copy.disabled = !selected?.length || !confirmedPrompt;

      const move = btn(
        bottom,
        '이동하기',
        () => {
          const targetRoom = list.find(room => room.id === roomId);

          if (!targetRoom) {
            toast('이동할 GPT 채팅방을 먼저 선택해 줘.');
            return;
          }

          const targetURL = browserOnlyGPTURL(targetRoom.url);

          if (!targetURL) {
            toast('저장된 GPT 채팅방 주소를 확인해 줘.');
            return;
          }

          // iPhone Safari에서 chatgpt.com 링크가 ChatGPT 앱으로 넘어가는 것을
          // 피하기 위해 클릭 순간 빈 탭을 먼저 만들고 브라우저용 URL로 이동한다.
          const popup = window.open('about:blank', '_blank');

          if (!popup) {
            toast('새 탭을 열 수 없었어. 브라우저의 새 탭 허용 설정을 확인해 줘.');
            return;
          }

          try {
            popup.location.href = targetURL;
            popup.focus();
          } catch {
            try {
              popup.location.replace(targetURL);
            } catch {
              toast('GPT 채팅방 이동에 실패했어. 다시 한 번 눌러 줘.');
            }
          }
        },
        false
      );

      create(
        'div',
        body,
        '복사하기를 누른 뒤 이동하기를 누르면 선택한 GPT 채팅방이 새 탭으로 열려요. 이동한 뒤 직접 붙여넣어 주세요.',
        'margin-top:10px;padding:10px 12px;border-radius:10px;background:#f0f0f0;color:#666;font-size:12px;line-height:1.5'
      );

      create(
        'p',
        body,
        '대화는 가져오기 버튼을 누른 순간 현재 DOM에 렌더된 말풍선만 읽어. 제타 내부 API는 사용하지 않아.',
        'font-size:11px;color:#888;margin-top:10px'
      );
    }

    function clampTriggerPosition(button, left, top) {
      const rect = button.getBoundingClientRect();
      const margin = 8;

      return {
        left: Math.min(
          Math.max(margin, left),
          Math.max(margin, window.innerWidth - rect.width - margin)
        ),
        top: Math.min(
          Math.max(margin, top),
          Math.max(margin, window.innerHeight - rect.height - margin)
        )
      };
    }

    function saveTriggerPosition(button) {
      try {
        const rect = button.getBoundingClientRect();

        db.set(TRIGGER_POSITION_KEY, {
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        });
      } catch {}
    }

    function restoreTriggerPosition(button) {
      const saved = db.get(TRIGGER_POSITION_KEY, null);

      if (
        !saved ||
        !Number.isFinite(saved.left) ||
        !Number.isFinite(saved.top)
      ) return;

      const pos = clampTriggerPosition(
        button,
        saved.left,
        saved.top
      );

      button.style.left = `${pos.left}px`;
      button.style.top = `${pos.top}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
    }

    function makeTriggerDraggable(button) {
      let dragging = false;
      let moved = false;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let blockClick = false;

      button.addEventListener('pointerdown', event => {
        if (event.button != null && event.button !== 0) return;

        const rect = button.getBoundingClientRect();

        dragging = true;
        moved = false;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        button.style.left = `${rect.left}px`;
        button.style.top = `${rect.top}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
        button.style.cursor = 'grabbing';

        try {
          button.setPointerCapture(pointerId);
        } catch {}
      });

      button.addEventListener(
        'pointermove',
        event => {
          if (!dragging || event.pointerId !== pointerId) return;

          const dx = event.clientX - startX;
          const dy = event.clientY - startY;

          if (!moved && Math.hypot(dx, dy) < 5) return;

          moved = true;
          event.preventDefault();

          const pos = clampTriggerPosition(
            button,
            startLeft + dx,
            startTop + dy
          );

          button.style.left = `${pos.left}px`;
          button.style.top = `${pos.top}px`;
        },
        { passive: false }
      );

      const finish = event => {
        if (
          !dragging ||
          (event.pointerId != null && event.pointerId !== pointerId)
        ) return;

        dragging = false;
        button.style.cursor = 'grab';

        try {
          button.releasePointerCapture(pointerId);
        } catch {}

        pointerId = null;

        if (moved) {
          blockClick = true;
          saveTriggerPosition(button);

          setTimeout(() => {
            blockClick = false;
          }, 0);
        }
      };

      button.addEventListener('pointerup', finish);
      button.addEventListener('pointercancel', finish);

      button.addEventListener('click', event => {
        if (blockClick || moved) {
          event.preventDefault();
          event.stopPropagation();
          moved = false;
          return;
        }

        show('main');
      });

      window.addEventListener('resize', () => {
        if (!button.isConnected) return;

        const rect = button.getBoundingClientRect();
        const pos = clampTriggerPosition(
          button,
          rect.left,
          rect.top
        );

        button.style.left = `${pos.left}px`;
        button.style.top = `${pos.top}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';

        saveTriggerPosition(button);
      });
    }

    function mount() {
      if (document.getElementById('zgm-simple-trigger')) return;

      const button = create('button', document.body);

      button.id = 'zgm-simple-trigger';
      button.type = 'button';
      button.title = '서사 정리';
      button.setAttribute('aria-label', '서사 정리');
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8 4.75h5.7l4.55 4.55V18a2.25 2.25 0 0 1-2.25 2.25H8A2.25 2.25 0 0 1 5.75 18V7A2.25 2.25 0 0 1 8 4.75Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M13.5 4.9V9.2h4.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9.2 12.2h5.7M9.2 15.5h5.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>`;

      restoreTriggerPosition(button);
      makeTriggerDraggable(button);
    }

    mount();
  }
})();
