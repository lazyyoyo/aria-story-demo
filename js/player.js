// 악녀빙의 플레이어 (율리안 v2 엔진 포크): 클립 재생 → 자막 → 선택 → 사망 카드 → 되감기
// 율리안 대비: 타이머·미니게임 제거, 상태창 HUD, 도감(원작 소설·사망록), 세로 슬라이스 모드, 영어 검수 자막.
(() => {
  const { S, D, END, NOVEL = [], STATUS = [], start } = window.V2;
  const DEATH_TOTAL = Object.keys(D).length;
  const $ = (q) => document.querySelector(q);
  const params = new URLSearchParams(location.search);
  const SLICE = params.get('slice') === '1';
  const SHOW_EN = params.get('en') === '1';
  // 코믹스: 영상 없이 키프레임 스틸 + 탭으로 자막 한 줄씩. 클립 파일이 없을 때도 이 방식으로 떨어진다
  const COMIC = params.get('comic') === '1';
  const KEY_SAVE = 'aria.v1.save';
  const KEY_DEATH = 'aria.v1.deaths';
  // 복귀 지점별 사망 횟수 {backId: count}. 새 게임에도 유지해 힌트 노출 판단에 쓴다
  const KEY_DEATH_AT = 'aria.v1.deathsAt';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } },
  };
  const deaths = () => store.get(KEY_DEATH) || [];
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ── 세로 슬라이스: slice:true 장면만, sliceGo/sliceNext 우선. 엔딩은 항상 허용 ──
  // sliceOnly 장면(슬라이스 요약 등)은 전체 모드에선 갈 수 없는 곳으로 친다
  const inSlice = (id) => (SLICE ? !!END[id] || !!(S[id]?.slice || D[id]?.slice) : !S[id]?.sliceOnly);
  const optTarget = (o) => (SLICE && o.sliceGo) || o.go;
  const nextOf = (s) => (SLICE && s.sliceNext) || s.next;
  // 슬라이스 밖으로 가는 지연 게이트는 열리지 않은 것으로 친다(통과)
  const gateOpen = (g) => !!(g && G.flags[g.flag] && inSlice(g.go));

  // ── 상태창 값: STATUS 정의의 init에서 시작. 숫자 항목은 누적, fate는 장면이 덮어쓴다 ──
  const initSt = () => Object.fromEntries(STATUS.map((x) => [x.key, x.init]));
  let G = { at: start, flags: {}, st: initSt(), notes: [], snaps: {} };
  const state = () => ({ flags: { ...G.flags }, st: { ...G.st }, notes: [...G.notes] });
  const restore = (x) => {
    G.flags = { ...(x.flags || {}) };
    G.st = { ...initSt(), ...(x.st || {}) };
    G.notes = [...(x.notes || [])];
    renderHud();
  };
  const learn = (n) => { if (n && !G.notes.includes(n)) G.notes.push(n); };
  const el = {
    video: $('#clip'), still: $('#still'), sub: $('#sub'), who: $('#subWho'), text: $('#subText'), en: $('#subEn'),
    choice: $('#choice'), overlay: $('#overlay'), chapter: $('#chapter'), skip: $('#skip'),
    hud: $('#hud'), codexBtn: $('#codexBtn'), codex: $('#codex'), tdeath: $('#tdeath'), tap: $('#tap'), lineNo: $('#lineNo'),
  };

  // ── 상태창 HUD ──
  const fmt = (x, v) => (x.key === 'fate' || typeof v !== 'number' ? String(v) : v > 0 ? `+${v}` : String(v));
  function renderHud(changed = []) {
    el.hud.innerHTML = STATUS.map((x) => `<span data-k="${x.key}" class="${x.key === 'fate' ? 'fate' : ''}${changed.includes(x.key) ? ' hi' : ''}">${esc(x.label)}<b>${esc(fmt(x, G.st[x.key]))}</b></span>`).join('');
    if (changed.length) setTimeout(() => el.hud.querySelectorAll('.hi').forEach((n) => n.classList.remove('hi')), 600);
  }
  // 변화를 한 번에 적용하고 바뀐 항목만 하이라이트한다
  function applySt(delta) {
    const changed = [];
    for (const [k, v] of Object.entries(delta)) {
      if (v === undefined || v === null || !(k in G.st)) continue;
      const nv = k === 'fate' ? v : (Number(G.st[k]) || 0) + (Number(v) || 0);
      if (nv !== G.st[k]) { G.st[k] = nv; changed.push(k); }
    }
    if (changed.length) renderHud(changed);
  }
  const playing = (on) => { el.hud.hidden = !on; el.codexBtn.hidden = !on; };

  // ── 일시정지: 도감이 열려 있는 동안 영상·정지화면 시계·쪽지 타이머가 모두 멈춘다 ──
  let paused = false;
  let clipMode = null; // 재생 중인 클립의 모드('video' | 'still'), 없으면 null
  const wait = (ms) => new Promise((resolve) => {
    let left = ms; let last = performance.now();
    const iv = setInterval(() => {
      const n = performance.now();
      if (!paused) left -= n - last;
      last = n;
      if (left <= 0) { clearInterval(iv); resolve(); }
    }, 50);
  });

  // ── 키프레임 존재 확인(한 번만 요청해 캐시) ──
  const keyCache = new Map();
  const keyOk = (id) => {
    if (!id) return Promise.resolve(false);
    if (!keyCache.has(id)) {
      keyCache.set(id, new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(true); im.onerror = () => resolve(false);
        im.src = `keys/${id}.jpg`;
      }));
    }
    return keyCache.get(id);
  };
  // 정지화면: 키프레임이 있으면 그림, 없으면 어두운 배경에 장면 id·무대 텍스트
  let stillId = null;
  function setStill(id, stage) {
    stillId = id;
    el.still.style.backgroundImage = '';
    el.still.innerHTML = `<div class="noart"><b>${esc(id)}</b>${stage ? `<p>${esc(String(stage).slice(0, 220))}</p>` : ''}</div>`;
    keyOk(id).then((ok) => {
      if (!ok || stillId !== id) return;
      el.still.innerHTML = '';
      el.still.style.backgroundImage = `url(keys/${id}.jpg)`;
    });
  }

  // 텍스트 사망 동안엔 영상·정지화면을 숨기고 검정 막만 남긴다
  function showStage(on) {
    el.video.style.visibility = on ? '' : 'hidden';
    el.still.style.visibility = on ? '' : 'hidden';
    if (on) { el.tdeath.classList.remove('show', 'card'); el.tdeath.innerHTML = ''; el.tdeath.onclick = null; }
  }
  // 일시정지를 지키는 대기 + 탭하면 즉시 끝
  const waitOrTap = (ms) => new Promise((resolve) => {
    let done = false;
    const end = () => { if (done) return; done = true; el.tdeath.onclick = null; resolve(); };
    el.tdeath.onclick = end;
    wait(ms).then(end);
  });
  // 텍스트 사망: 줄당 2.2초(탭하면 바로 다음 줄), 마지막 줄 뒤 1.2초 멈춤
  async function textScene(lines) {
    el.video.pause();
    el.still.classList.remove('show', 'kb');
    showSub(null);
    showStage(false);
    el.tdeath.classList.add('show');
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      el.tdeath.appendChild(p);
      requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('in')));
      await waitOrTap(2200);
    }
    await wait(1200);
    // 사망 카드와 겹치지 않게 서술 줄은 걷고 검정 막만 남긴다
    el.tdeath.innerHTML = '';
    el.tdeath.classList.add('card');
  }

  // 서장 페이지(책 읽기): 한 페이지씩 통째로 페이드인, 자동 진행 없이 탭으로만 넘긴다. 자막·HUD는 숨김
  async function pageScene(pages) {
    el.video.pause();
    el.still.classList.remove('show', 'kb');
    showSub(null);
    showStage(false);
    el.hud.hidden = true;
    el.tdeath.classList.add('show', 'book');
    for (let i = 0; i < pages.length; i++) {
      el.tdeath.innerHTML = `<p class="page">${esc(pages[i])}</p><small class="pno">${i + 1} / ${pages.length}</small>`;
      const pg = el.tdeath.querySelector('.page');
      requestAnimationFrame(() => requestAnimationFrame(() => pg.classList.add('in')));
      await new Promise((resolve) => { el.tdeath.onclick = () => { el.tdeath.onclick = null; resolve(); }; });
    }
    el.tdeath.classList.remove('book');
    showStage(true);
    el.hud.hidden = false;
  }

  // ── 클립 재생 (영상이 없으면 키프레임 정지 화면으로 대신) ──
  // 코믹스 재생: 스틸을 띄우고 화면 탭마다 다음 줄, 넘기기 = 남은 줄 건너뛰기
  const noClip = new Set(); // 한 번 404가 난 클립은 다시 요청하지 않는다
  function playComic(id, subs = [], meta = {}, keepStill = false) {
    return new Promise((resolve) => {
      el.video.pause();
      showStage(true);
      if (!keepStill) setStill(id, meta.shot);
      el.still.classList.add('show', 'kb');
      const lines = subs.filter((x) => x && x[2]);
      let i = -1;
      const end = () => {
        el.tap.classList.remove('on'); el.tap.onclick = null; el.skip.onclick = null;
        el.lineNo.hidden = true;
        showSub(null);
        resolve();
      };
      const nextLine = () => {
        i += 1;
        if (i >= lines.length) { end(); return; }
        showSub(lines[i]);
        el.lineNo.textContent = `${i + 1} / ${lines.length}`;
        el.lineNo.hidden = false;
      };
      el.tap.classList.add('on');
      el.tap.onclick = nextLine;
      el.skip.onclick = end;
      nextLine();
    });
  }

  function playClip(id, subs = [], meta = {}) {
    if (COMIC || noClip.has(id)) return playComic(id, subs, meta);
    return new Promise((resolve) => {
      const v = el.video;
      showStage(true);
      setStill(id, meta.shot);
      el.still.classList.remove('kb');
      el.still.classList.add('show');
      let ended = false; let stillT = 0; let last = performance.now();
      let watchT = 0; let lastVT = -1; let stuck = 0;
      clipMode = 'video';
      const total = () => Math.max(5, meta.sec || 0, (subs.at(-1)?.[0] || 0) + 3);
      const toStill = (from) => {
        if (clipMode === 'still') return;
        clipMode = 'still'; v.pause();
        el.still.classList.add('show', 'kb');
        stillT = from;
      };
      const finish = () => {
        if (ended) return; ended = true;
        clearInterval(tick);
        v.onended = null; v.onerror = null; v.ontimeupdate = null; el.skip.onclick = null;
        clipMode = null;
        resolve();
      };
      const tick = setInterval(() => {
        const n = performance.now(); const dt = (n - last) / 1000; last = n;
        if (paused) return;
        if (clipMode === 'still') {
          stillT += dt;
          if (stillT >= total()) { finish(); return; }
        } else {
          // 감시: 자동 재생이 막히거나(저전력 모드·숨김 탭) 재생이 멈추면 키프레임과 시계로 이어 간다
          watchT += dt;
          if (watchT >= 0.8) {
            watchT = 0;
            if (v.currentTime - lastVT < 0.2) { stuck += 1; if (stuck === 1) v.play().catch(() => {}); } else stuck = 0;
            lastVT = v.currentTime;
            if (stuck >= 3) toStill(v.currentTime);
          }
        }
        const t = clipMode === 'video' ? v.currentTime : stillT;
        let cur = null;
        for (const s of subs) if (t >= s[0]) cur = s;
        showSub(cur);
      }, 100);
      // 클립 파일이 없다: 코믹스(스틸 + 탭 자막)로 이어 간다
      v.onerror = () => {
        if (ended) return;
        ended = true; noClip.add(id);
        clearInterval(tick);
        v.onended = null; v.onerror = null; v.ontimeupdate = null; el.skip.onclick = null;
        clipMode = null;
        v.removeAttribute('src'); v.load();
        playComic(id, subs, meta, true).then(resolve);
      };
      // 영상이 실제로 흐르기 시작해야 정지 화면을 걷는다
      v.ontimeupdate = () => { if (v.currentTime > 0.15 && clipMode === 'video') el.still.classList.remove('show', 'kb'); };
      v.onended = finish;
      v.src = `clips/${id}.mp4`;
      // 소리 있는 재생이 막히면 음소거로라도 이어 간다
      v.muted = false;
      v.play().catch(() => { if (clipMode !== 'video') return; v.muted = true; v.play().catch(() => {}); });
      el.skip.onclick = () => { if (clipMode === 'video') v.pause(); finish(); };
    });
  }
  function showSub(s) {
    if (!s || !s[2]) { el.sub.classList.remove('show'); return; }
    el.sub.classList.toggle('narr', !s[1]);
    el.who.textContent = s[1];
    el.who.hidden = !s[1];
    el.text.textContent = s[2];
    el.en.textContent = SHOW_EN ? (s[3] || '') : '';
    el.en.hidden = !SHOW_EN || !s[3];
    el.sub.classList.add('show');
  }

  // ── 선택: time이 없으면 타이머 없이 고를 때까지 기다린다 ──
  function choose(c) {
    return new Promise((resolve) => {
      const opts = c.options.map((o, i) => [o, i]).filter(([o]) => inSlice(optTarget(o)));
      const timed = Number(c.time) > 0;
      el.choice.innerHTML = `<p class="cPrompt">${esc(c.prompt)}</p>${timed ? '<div class="cTimer"><i></i></div>' : ''}`
        + opts.map(([o, i]) => `<button class="cOpt" data-i="${i}">${esc(o.t)}</button>`).join('');
      el.choice.classList.add('show');
      let timer = 0;
      const done = (o) => {
        clearTimeout(timer);
        el.choice.classList.remove('show');
        resolve(o || { ...c.timeout, timedOut: true });
      };
      if (timed) {
        const bar = el.choice.querySelector('.cTimer i');
        bar.style.transition = `width ${c.time}s linear`;
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '0%'; }));
        timer = setTimeout(() => done(null), c.time * 1000);
      }
      el.choice.querySelectorAll('.cOpt').forEach((b) => { b.onclick = () => done(c.options[+b.dataset.i]); });
    });
  }

  // ── 진행 ──
  const save = (id) => store.set(KEY_SAVE, { at: id, slice: SLICE, ...state(), snaps: G.snaps });
  async function go(id) {
    G.at = id;
    if (D[id]) { save(id); return death(id); }
    if (END[id]) { save(id); return endCard(END[id]); }
    const s = S[id];
    if (!s) { console.warn('[aria] 없는 장면', id); return endCard({ title: '길을 잃었다', lines: [`장면 ${id} 없음`] }); }
    if (s.fate || s.st) applySt({ ...(s.st || {}), fate: s.fate });
    // 되감기 지점: 선택이 있는 장면에 들어올 때 상태를 기억한다
    if (s.choice) G.snaps[id] = state();
    save(id);
    const isPages = !s.clip && Array.isArray(s.pages);
    // 서장 페이지에선 HUD를 숨긴다(상태창은 눈뜨는 장면부터)
    if (isPages) el.hud.hidden = true;
    if (s.chapter) await chapterCard(s.chapter);
    if (s.clip) await playClip(s.clip, s.subs, s);
    else if (isPages) await pageScene(s.pages);
    showSub(null);
    learn(s.learn);
    if (s.note) await note(s.note);
    if (s.choice) {
      const o = await choose(s.choice);
      if (o.flag) G.flags[o.flag] = true;
      applySt({ ...(o.st || {}), sus: o.sus });
      learn(o.learn);
      if (o.note) await note(o.note);
      if (gateOpen(s.gate)) return go(s.gate.go);
      return go(optTarget(o));
    }
    if (gateOpen(s.gate)) return go(s.gate.go);
    return go(nextOf(s));
  }

  async function note(text) {
    showSub(['', '', text]);
    await wait(2600);
    showSub(null);
  }

  async function chapterCard(title) {
    el.chapter.innerHTML = `<p>${esc(title)}</p>`;
    el.chapter.classList.add('show');
    await wait(1800);
    el.chapter.classList.remove('show');
    await wait(400);
  }

  async function death(id) {
    const d = D[id];
    const isText = !d.clip && Array.isArray(d.text);
    if (isText) await textScene(d.text);
    else await playClip(d.clip, d.subs, d);
    showSub(null);
    const got = deaths();
    const isNew = !got.includes(id);
    if (isNew) store.set(KEY_DEATH, [...got, id]);
    const atCount = { ...(store.get(KEY_DEATH_AT) || {}) };
    atCount[d.back] = (Number(atCount[d.back]) || 0) + 1;
    store.set(KEY_DEATH_AT, atCount);
    // 힌트(그때 들은 말)는 기본 숨김. 지연 사망이거나 같은 복귀 지점에서 두 번 이상 죽었을 때만 버튼을 준다
    const hintOk = !!d.clue && (!!d.delayed || atCount[d.back] >= 2);
    const backS = S[d.back] || {};
    const backWhere = [backS.chapter, backS.choice?.prompt].filter(Boolean).join(' · ');
    const hintLabel = d.delayed ? `힌트 보기 · 며칠 전의 선택으로${backWhere ? `<small class="hintWhere">${esc(backWhere)}</small>` : ''}` : '힌트 보기';
    const clueImg = hintOk && await keyOk(d.clue[2]);
    el.overlay.innerHTML = `<div class="deathCard">
        <p class="dNo">사망 ${String(d.no).padStart(2, '0')}${isNew ? ' · 새 기록' : ''}</p>
        <h2>「${esc(d.title)}」</h2>
        <p class="dCause">${d.delayed ? '며칠 전의 선택: ' : '원인: '}${esc(d.cause)}</p>
        ${hintOk ? `<button class="ghost hintBtn" id="hintBtn">${hintLabel}</button>` : ''}
        ${hintOk ? `<div class="clue" hidden>${clueImg ? `<img src="keys/${esc(d.clue[2])}.jpg" alt="">` : ''}<div><small>그때 들은 말</small><p>${d.clue[0] ? `<b>${esc(d.clue[0])}</b> ` : ''}“${esc(d.clue[1])}”</p></div></div>` : ''}
        ${G.notes.length ? `<details class="notes"><summary>아리아의 수첩 ${G.notes.length}</summary><ul>${G.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
        <div class="echo"><div><b>${esc(d.echo[0])}</b><p>${esc(d.echo[1])}</p></div></div>
        <p class="dCount">사망록 ${deaths().length} / ${DEATH_TOTAL}</p>
        <button class="primary" id="rewind">${d.delayed ? '며칠 전 그 선택으로 되돌아가기' : '직전 선택으로 되돌아가기'}</button>
        <button class="ghost" id="toTitle">타이틀로</button>
      </div>`;
    el.overlay.classList.add('show', 'dead');
    el.overlay.classList.toggle('plain', isText);
    window.SOUND.tone(110, 1.2, 'sawtooth', 0.06);
    if ($('#hintBtn')) $('#hintBtn').onclick = () => { $('#hintBtn').hidden = true; el.overlay.querySelector('.clue').hidden = false; };
    $('#rewind').onclick = () => {
      el.overlay.classList.remove('show', 'dead', 'plain'); el.overlay.innerHTML = '';
      showStage(true);
      restore(G.snaps[d.back] || {});
      go(d.back);
    };
    $('#toTitle').onclick = () => location.reload();
  }

  function endCard(e) {
    el.overlay.innerHTML = `<div class="deathCard end"><p class="dNo">${SLICE ? '세로 슬라이스 끝' : '1장 끝'}</p><h2>${esc(e.title)}</h2>
      ${e.lines.map((l) => `<p class="dCause">${esc(l)}</p>`).join('')}
      <p class="dCount">사망록 ${deaths().length} / ${DEATH_TOTAL}</p>
      <button class="primary" id="toTitle">타이틀로</button></div>`;
    el.overlay.classList.add('show', 'ended');
    $('#toTitle').onclick = () => location.reload();
  }

  // ── 도감: 원작 소설(읽기 전용 발췌) · 사망록. 열려 있는 동안 진행이 멈춘다 ──
  function bookHtml() {
    const got = deaths();
    const byNo = Object.entries(D).sort(([, a], [, b]) => a.no - b.no);
    return `<p class="note">잘못된 선택이 부른 죽음을 모은다. ${got.length} / ${DEATH_TOTAL}</p><ul class="book">${byNo.map(([id, d]) => {
      const has = got.includes(id);
      return `<li class="${has ? 'got' : ''}"><span>${String(d.no).padStart(2, '0')}</span>${has ? `「${esc(d.title)}」<small>${esc(d.cause)}</small>` : '???'}</li>`;
    }).join('')}</ul>`;
  }
  const novelHtml = () => `<p class="note">읽던 소설의 발췌. 앨리스의 눈으로 쓰인 이야기다.</p><ol class="novel">${NOVEL.map((t, i) => `<li><span>${i + 1}</span>${esc(t)}</li>`).join('')}</ol>`;
  function openCodex(tab = 'novel') {
    if (!el.codex.classList.contains('show')) {
      paused = true;
      if (clipMode === 'video') el.video.pause();
    }
    el.codex.innerHTML = `<div class="panel"><h2 class="gold">도감</h2>
      <div class="tabs"><button data-t="novel" class="${tab === 'novel' ? 'on' : ''}">원작 소설</button><button data-t="death" class="${tab === 'death' ? 'on' : ''}">사망록</button></div>
      <div class="tabBody">${tab === 'novel' ? novelHtml() : bookHtml()}</div>
      <button class="ghost" id="codexClose">닫기</button></div>`;
    el.codex.classList.add('show');
    el.codex.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => openCodex(b.dataset.t); });
    $('#codexClose').onclick = closeCodex;
  }
  function closeCodex() {
    el.codex.classList.remove('show'); el.codex.innerHTML = '';
    paused = false;
    if (clipMode === 'video') el.video.play().catch(() => {});
  }
  el.codexBtn.onclick = () => openCodex('novel');

  // ── 타이틀 ──
  function title() {
    playing(false);
    const saved0 = store.get(KEY_SAVE);
    const saved = saved0 && !!saved0.slice === SLICE && saved0.at !== start ? saved0 : null;
    const got = deaths();
    el.overlay.innerHTML = `<div class="title">
        <img class="cover" src="keys/a01.jpg" alt="">
        <div class="tText"><h1>악녀빙의</h1><p class="sub">수도원의 마차</p><p class="meta">${COMIC ? '코믹스 플레이테스트' : '인터랙티브 영상 스토리'} · ${SLICE ? '세로 슬라이스' : '1장 전체'}</p></div>
        <div class="tBtns">
          ${saved ? '<button class="primary" id="cont">이어하기</button>' : ''}
          <button class="${saved ? 'ghost' : 'primary'}" id="newGame">처음부터</button>
          <button class="ghost" id="book">📖 도감 · 사망록 ${got.length} / ${DEATH_TOTAL}</button>
        </div></div>`;
    el.overlay.classList.add('show');
    const begin = (s) => { el.overlay.classList.remove('show'); el.overlay.innerHTML = ''; playing(true); window.SOUND.tone(660, 0.1); go(s); };
    if ($('#cont')) $('#cont').onclick = () => { G.snaps = saved.snaps || {}; restore(saved); begin(saved.at); };
    $('#newGame').onclick = () => { G.snaps = {}; restore({}); begin(start); };
    $('#book').onclick = () => openCodex('novel');
  }

  // 효과음(타이틀 시작·사망)
  let actx = null;
  window.SOUND = {
    tone(freq, dur = 0.3, type = 'triangle', vol = 0.1) {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(); const g = actx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
        o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
      } catch { /* 소리 불가 */ }
    },
  };

  window.ARIA = { get state() { return G; }, go, SLICE };
  renderHud();
  title();
})();
