/* 자겜의 족보 — data/site.json 을 읽어 그리는 정적 페이지 (빌드: scripts/build_docs.py) */
(() => {
  "use strict";

  const SEV = ["critical", "strong", "ok", "weak", "bad"];
  const SEV_KO = { critical: "치명", strong: "아픔", ok: "할만함", weak: "약함", bad: "비추" };
  const SEV_G = { critical: "●", strong: "▲", ok: "◆", weak: "○", bad: "✕" };
  const KIND_ORDER = ["search", "negate", "draw", "gy", "destroy", "dominus", "going2nd", "engine", "dimension", "summon_lock", "not_handtrap"];

  let D = null;
  let HT = {};
  let BK = {};
  let RQ = {};
  const app = document.getElementById("app");
  const tip = document.getElementById("tip");

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ko = (en) => (D.cards[en] && D.cards[en].ko) || null;
  // 표기 모드: 즉석 족보는 선택한 언어 하나로(ko|en), 나머지 페이지는 한·영 병기(both)
  let MODE = "both";
  let LANG = "ko";
  try { LANG = localStorage.getItem("lang") === "en" ? "en" : "ko"; } catch (_) {}
  const nm = (en) => (MODE === "en" ? en : ko(en) || en);
  const card = (en, opts = {}) => {
    const k = ko(en);
    let label;
    if (MODE === "en") label = `<b>${esc(en)}</b>`;
    else if (MODE === "ko") label = `<b>${esc(k || en)}</b>`;
    else label = k ? `<b>${esc(k)}</b>${opts.noEn ? "" : ` <span class="en">${esc(en)}</span>`}` : `<b>${esc(en)}</b> <span class="en">공식 한국어명 미확인</span>`;
    return `<span class="card" tabindex="0" data-card="${esc(en)}">${label}</span>`;
  };
  // [[Card]] 뒤 조사를 공식 한국어명의 받침에 맞춘다 (을/를, 이/가, 은/는, 과/와, 으로/로)
  const JOSA = { "을": ["을", "를"], "를": ["을", "를"], "이": ["이", "가"], "가": ["이", "가"], "은": ["은", "는"], "는": ["은", "는"], "과": ["과", "와"], "와": ["과", "와"], "으로": ["으로", "로"], "로": ["으로", "로"] };
  const finalOf = (word) => {
    const ch = String(word).trim().slice(-1);
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) return code % 28; // 0 = 받침 없음, 8 = ㄹ
    return /[0-9a-zA-Z]/.test(ch) ? -1 : 0;
  };
  const fixJosa = (name, j) => {
    const pair = JOSA[j];
    const f = finalOf(name);
    if (!pair || f < 0) return j;
    if (j === "으로" || j === "로") return f === 0 || f === 8 ? "로" : "으로";
    return f ? pair[0] : pair[1];
  };
  const JOSA_RE = /\[\[([^\]]+)\]\](으로|을|를|이|가|은|는|과|와|로)?/g;
  const prose = (s) => {
    const str = String(s ?? "");
    const txt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    let out = "", last = 0;
    for (const m of str.matchAll(JOSA_RE)) {
      out += txt(str.slice(last, m.index)) + card(m[1], { noEn: true }) + (m[2] ? fixJosa(nm(m[1]), m[2]) : "");
      last = m.index + m[0].length;
    }
    return out + txt(str.slice(last));
  };
  const sevBadge = (sev, text) => `<span class="sev sev-${sev}" data-g="${SEV_G[sev]}">${esc(text || SEV_KO[sev])}</span>`;
  const sevRank = (s) => (SEV.indexOf(s) < 0 ? 99 : SEV.indexOf(s));
  const img = (en, kind) => {
    const c = D.cards[en];
    return c && c.pw ? `img/${kind}/${c.pw}.webp` : null;
  };
  const htName = (id) => (HT[id] ? (MODE === "en" ? HT[id].card : HT[id].short_ko) : id);

  function chokeMap(theme) {
    // lineId -> stepIndex -> [chokepoint]
    const map = {};
    theme.lines.forEach((l) => (map[l.id] = {}));
    theme.chokepoints.forEach((cp, rank) => {
      const c = { ...cp, rank: rank + 1 };
      const place = (lineId, idx, inferred) => {
        (map[lineId][idx] = map[lineId][idx] || []).push({ ...c, inferred });
      };
      const line = theme.lines.find((l) => l.id === cp.line);
      if (line && cp.step >= 1 && cp.step <= line.steps.length) return place(line.id, cp.step - 1, false);
      if (!cp.target_card) return;
      const hits = new Set((HT[cp.handtrap] || {}).hits || []);
      theme.lines.forEach((l) => {
        let idx = l.steps.findIndex((s) => s.card === cp.target_card && (s.class || []).some((x) => hits.has(x)));
        if (idx < 0) idx = l.steps.findIndex((s) => s.card === cp.target_card);
        if (idx >= 0) place(l.id, idx, true);
      });
    });
    return map;
  }
  const stepHits = (step) => D.handtraps.filter((h) => h.hits.some((c) => (step.class || []).includes(c))).map((h) => h.id);
  const worst = (cps) => cps.filter((c) => c.severity !== "bad").sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0];

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, query] = h.split("?");
    const params = new URLSearchParams(query || "");
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", (path === "/" && a.dataset.nav === "home") || path.startsWith("/" + a.dataset.nav)));
    MODE = path.startsWith("/p") ? LANG : "both";
    document.body.classList.toggle("play-mode", path.startsWith("/p"));
    const m = path.match(/^\/t\/([\w-]+)/);
    if (m) return renderTheme(m[1], params);
    if (path.startsWith("/h")) return renderHandtraps();
    if (path.startsWith("/p")) return renderPlay(params);
    if (path.startsWith("/r")) return renderRules(params);
    if (path.startsWith("/l")) return renderLearn(params);
    renderHome();
  }

  /* ---------- home ---------- */
  function renderHome() {
    const themes = [...D.themes];
    const maxShare = Math.max(...themes.map((t) => t.meta.share || 0));
    const tcards = themes
      .map((t) => {
        const top = t.chokepoints.filter((c) => c.severity === "critical").slice(0, 3);
        const cover = img(t.cover, "art");
        return `<a class="tcard${cover ? " has-cover" : ""}" href="#/t/${t.slug}"${cover ? ` style="--cover:url('${new URL(cover, location.href).href}')"` : ""}>
          <h3>${esc(t.name.ko)} <span class="en">${esc(t.name.en)}</span></h3>
          <div class="share"><span class="bar"><i style="width:${((t.meta.share / maxShare) * 100).toFixed(1)}%"></i></span>${(t.meta.share * 100).toFixed(1)}% · ${t.meta.decks}덱</div>
          <ul>${top.map((c) => `<li>${sevBadge("critical", htName(c.handtrap))}<span>→ ${esc(ko(c.target_card) || c.target_card || "")}</span></li>`).join("")}</ul>
        </a>`;
      })
      .join("");

    const top4 = [...themes].sort((a, b) => (b.meta.share || 0) - (a.meta.share || 0)).slice(0, 4);
    const sevRow = SEV.map((s) => `<li><span class="cell c-${s} g-sw">${SEV_G[s]}</span><b>${SEV_KO[s]}</b> ${esc(SEV_HELP[s])}</li>`).join("");
    const guideOpen = store.get("home.guide", true);
    const guide = `
      <nav class="quick" aria-label="바로가기">
        <a class="qk primary" href="#/p?s=1"><b>선공</b><span>상대 패트랩 피하기 / 내 전개 확인</span></a>
        <a class="qk primary" href="#/p?s=2"><b>후공</b><span>패트랩 타이밍 + 돌파 판정</span></a>
        <a class="qk" href="#/h"><b>패트랩 사전</b><span>카드별 맞는 효과·조건</span></a>
        <a class="qk" href="#/r"><b>룰·판정</b><span>공식 룰북·Q&amp;A 출처</span></a>
        <a class="qk" href="#/l"><b>배우기</b><span>공략·콤보 영상·학습 순서</span></a>
        <button type="button" class="qk" data-jump="themes"><b>테마 목록</b><span>전개 순서 전체 보기</span></button>
        <button type="button" class="qk" data-jump="decks"><b>덱 구성</b><span>예시 덱 · 엔진 · 채용률</span></button>
        <button type="button" class="qk" data-jump="heat"><b>상성표</b><span>패트랩 × 테마 한눈에</span></button>
      </nav>
      <div class="quick-themes"><span class="muted small">많이 보이는 상대 · 후공 바로가기</span>
        ${top4.map((t) => `<a class="chip" href="#/p?s=2&t=${t.slug}">${esc(t.name.ko)} <span class="muted">${(t.meta.share * 100).toFixed(1)}%</span></a>`).join("")}
      </div>
      <details class="guide" id="guide"${guideOpen ? " open" : ""}>
        <summary><h2>사용법</h2><span class="muted small">처음이라면 1분만 읽어 보세요 · 접어 두면 기억합니다</span></summary>
        <div class="guide-grid">
          <section class="gcard">
            <h3><span class="num">1</span> 즉석 족보 — 듀얼 중에 켜 두는 탭</h3>
            <ol>
              <li><b>선공/후공</b>을 고릅니다.</li>
              <li><b>상대 테마</b>를 고릅니다. 테마 이름을 몰라도 상대가 낸 <b>카드 이름</b>(한글·영문 일부)으로 검색됩니다.</li>
              <li><b>지금 내 패</b>에서 들고 있는 패트랩을 누릅니다. 자주 쓰는 카드는 <b>내 덱 편집</b>으로 위에 고정할 수 있습니다.</li>
              <li>위 <b>전개 스트립</b>을 읽습니다: 윗줄은 상대 전개 순서(카드 일러), 그 아래 붙은 작은 일러가 <b>내 패트랩을 던질 단계</b>, 맨 아래 글이 <b>정확한 타이밍</b>입니다.</li>
              <li><b>후공</b>이면 상대 엔드 필드를 골라 <b>돌파 판정</b>을 봅니다. 내 패로 견제를 몇 개 지울 수 있는지, 무엇을 먼저 써야 하는지 나옵니다.</li>
            </ol>
            <p class="muted small">선택 상태는 주소(URL)에 남아서 북마크·공유하면 그대로 열립니다. 오른쪽 위 <b>한글/EN</b>으로 카드명을 한 언어로 통일할 수 있습니다(인게임 검색용).</p>
          </section>
          <section class="gcard">
            <h3><span class="num">2</span> 테마 페이지 — 집에서 공부할 때</h3>
            <ul>
              <li><b>전개 라인 탭</b>: 초동 패별로 1턴 전개를 단계마다 펼칩니다.</li>
              <li><b>패트랩 타이밍표</b>: 가로 = 전개 단계, 세로 = 패트랩. 색이 진할수록 아픈 자리입니다. 칸을 누르면 그 단계로 이동합니다.</li>
              <li><b>패트랩 필터</b>: 종류(서치·무효·묘지·도미나스 등)나 카드 하나만 걸러 볼 수 있습니다.</li>
              <li>각 단계 아래에 <b>왜 아픈지</b>, <b>맞은 뒤 상대 루트</b>, 관련 <b>공식 판정</b>이 붙어 있습니다.</li>
            </ul>
          </section>
          <section class="gcard">
            <h3><span class="num">3</span> 색 읽는 법</h3>
            <ul class="sev-help">${sevRow}</ul>
            <p class="muted small">색 칸 없이 옅은 파랑은 “맞기는 하지만 추천 타이밍은 아님”입니다.</p>
          </section>
          <section class="gcard">
            <h3><span class="num">4</span> 작은 팁</h3>
            <ul>
              <li>카드 이름·칸에 <b>마우스를 올리면</b> 카드 일러와 효과가 뜹니다. <b>클릭하면 고정</b>, 다시 클릭하거나 Esc로 닫습니다.</li>
              <li>카드명은 모두 <b>마스터 듀얼 인게임 검색에 그대로 쓰는 공식 한국어명</b>입니다(영문 병기).</li>
              <li>판정 근거는 <a href="#/r">룰·판정</a>에 KONAMI 공식 Q&amp;A 링크로 모아 두었습니다.</li>
              <li>메타 통계는 Master Duel Meta 랭크·DC 상위 덱 기준 (${esc(D.themes[0]?.meta.window || "")}).</li>
            </ul>
          </section>
        </div>
      </details>`;

    app.innerHTML = `
      <h1>자겜의 족보 <span class="en">마스터 듀얼 패트랩 타이밍 노트</span></h1>
      <p class="lede">메타 테마별 1턴 전개를 단계별로 펼치고, 각 단계에서 어떤 패트랩이 맞는지와 어디가 <b>가장 아픈 타이밍</b>인지 표시했습니다.
      카드명은 모두 인게임 검색에 그대로 쓸 수 있는 <b>공식 한국어명</b>입니다. 집계 기간: ${esc(D.themes[0]?.meta.window || "")}.</p>
      ${guide}
      <h2 id="themes">테마별 전개 · 패트랩 타이밍</h2>
      <div class="theme-grid">${tcards}</div>

      <h2 id="decks">덱 구성 · 엔진 <span class="en">예시 덱 리스트</span></h2>
      <p class="muted small">Master Duel Meta 랭크·DC 상위 덱을 테마별로 합산했습니다. 카드에 마우스를 올리면 효과가 나옵니다.</p>
      <div class="chips wrap" id="deckPick" role="group" aria-label="테마">${themes.map((t) => `<button type="button" class="chip sub" data-deck="${t.slug}">${esc(t.name.ko)}</button>`).join("")}</div>
      <div id="deckView" class="deck-view"></div>

      <h2 id="heat">패트랩 × 테마 상성표</h2>
      <p class="muted small">칸을 누르면 그 테마 페이지에서 해당 패트랩만 걸러 보여 줍니다. 마우스를 올리면 사용 지점이 나옵니다.</p>
      ${legend(false)}
      <div class="scroll-x">${homeHeat(themes)}</div>`;
    const deckState = { slug: store.get("home.deck", themes[0]?.slug), sample: 0 };
    const drawDeck = () => {
      if (!themes.some((t) => t.slug === deckState.slug)) deckState.slug = themes[0]?.slug;
      app.querySelectorAll("[data-deck]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.deck === deckState.slug)));
      document.getElementById("deckView").innerHTML = deckView(themes.find((t) => t.slug === deckState.slug), deckState.sample);
    };
    drawDeck();
    app.onclick = (e) => {
      const j = e.target.closest("[data-jump]");
      const dk = e.target.closest("[data-deck]");
      const sm = e.target.closest("[data-sample]");
      if (j) document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (dk) { deckState.slug = dk.dataset.deck; deckState.sample = 0; store.set("home.deck", deckState.slug); drawDeck(); }
      else if (sm) { deckState.sample = +sm.dataset.sample; drawDeck(); }
    };
    app.oninput = null;
    document.getElementById("guide").addEventListener("toggle", (e) => store.set("home.guide", e.target.open));
  }
  // 개요: 테마별 덱 구성 (핵심·선택 카드, 엔진, 대표 덱 리스트)
  const TYPE_ORDER = { Monster: 0, Spell: 1, Trap: 2 };
  const dkTile = (en, top, sub) => {
    const src = img(en, "card") || img(en, "art");
    return `<span class="dk" data-card="${esc(en)}" tabindex="0">${src ? `<img src="${src}" alt="${esc(nm(en))}" loading="lazy">` : `<span class="dk-ph">${esc(nm(en))}</span>`}${top ? `<b class="dk-n">${top}</b>` : ""}${sub ? `<i class="dk-r">${sub}</i>` : ""}</span>`;
  };
  const byType = (list) => [...list].sort((a, b) => (TYPE_ORDER[D.cards[a.card]?.type] ?? 3) - (TYPE_ORDER[D.cards[b.card]?.type] ?? 3));
  const pct = (r) => `${Math.round(r * 100)}%`;
  function deckView(t, si) {
    if (!t) return "";
    const dl = t.decklist;
    if (!dl || !dl.decks) return `<p class="muted">최근 ${esc(String(dl?.window?.days || 30))}일 상위 덱 기록이 없습니다. 테마 페이지의 전개 라인을 참고하세요. <a href="#/t/${t.slug}">${esc(t.name.ko)} 보기 →</a></p>`;
    const usage = (list, n) => (list.length ? `<div class="dk-grid">${byType(list).map((c) => dkTile(c.card, `×${Math.round(c.avg * 10) / 10}`, pct(c.rate))).join("")}</div>` : `<p class="muted small">없음</p>`);
    const engRows = (dl.engines || [])
      .map((x) => {
        const e = x.slug && (D.engines || []).find((y) => y.slug === x.slug);
        // MDM 엔진 태그는 테마명 또는 카드명: 우리 테마/카드 한국어명으로 보여 준다
        const th = D.themes.find((y) => y.name.en === x.name || (y.variants || []).includes(x.name));
        const kn = e ? e.name.ko : th ? th.name.ko : D.cards[x.name]?.ko;
        const label = kn || x.name;
        return `<li><span class="eng-name">${esc(label)}${kn && !e ? ` <span class="en">${esc(x.name)}</span>` : ""}</span><span class="bar"><i style="width:${pct(x.rate)}"></i></span><span class="muted small">${pct(x.rate)}</span>${e ? `<a class="small" href="#/p?s=2&t=${t.slug}&e=${e.slug}">같이 보기 →</a>` : ""}</li>`;
      })
      .join("");
    const sm = dl.samples || [];
    const cur = sm[Math.min(si, sm.length - 1)];
    const list = (part) => {
      const rows = byType(part);
      return `<div class="dk-grid">${rows.map((c) => dkTile(c.card, c.amount > 1 ? `×${c.amount}` : "")).join("")}</div>`;
    };
    const count = (part) => part.reduce((n, c) => n + c.amount, 0);
    const sampleHTML = cur
      ? `<div class="chips wrap">${sm.map((d, i) => `<button type="button" class="chip sub" data-sample="${i}" aria-pressed="${d === cur}">${esc(d.author || "익명")} · ${esc(d.format.replace("Duelist Cup DLv. Max", "DC").replace("Master I", "마스터 I"))} · ${esc(d.created)}</button>`).join("")}</div>
         ${cur.engines?.length ? `<p class="small muted">MDM 엔진 태그: ${cur.engines.map(esc).join(", ")}</p>` : ""}
         <h4>메인 ${count(cur.main)}장</h4>${list(cur.main)}
         <h4>엑스트라 ${count(cur.extra)}장</h4>${list(cur.extra)}
         ${cur.side?.length ? `<h4>사이드 ${count(cur.side)}장</h4>${list(cur.side)}` : ""}
         ${cur.url ? `<p class="small"><a href="${esc(cur.url)}" target="_blank" rel="noopener">Master Duel Meta 원본 덱 ↗</a></p>` : ""}`
      : `<p class="muted small">예시 덱이 없습니다.</p>`;
    return `<div class="dv-head">${thumb(t.cover, "pt-art lg")}<div><h3>${esc(t.name.ko)} <span class="en">${esc(t.name.en)}</span></h3>
        <div class="muted small">최근 ${esc(String(dl.window?.days || 30))}일 ${dl.decks}덱${(dl.variants || []).length > 1 ? ` · ${dl.variants.map((v) => `${esc(v.name)} ${v.decks}`).join(" / ")}` : ""} · <a href="#/t/${t.slug}">전개·패트랩 타이밍 →</a> · <a href="#/p?s=2&t=${t.slug}">즉석 족보 →</a></div></div></div>
      <div class="dv-cols">
        <section><h4>섞어 쓰는 엔진·테크 <span class="muted small">덱 비율</span></h4>${engRows ? `<ul class="eng-list">${engRows}</ul>` : `<p class="muted small">순수 구축이 대부분입니다.</p>`}</section>
        <section><h4>핵심 카드 <span class="muted small">채용률 60%↑ · 평균 장수</span></h4>${usage(dl.core_main)}
          <h4>선택 카드 <span class="muted small">20~60%</span></h4>${usage(dl.flex_main)}
          <h4>엑스트라 핵심 <span class="muted small">50%↑</span></h4>${usage(dl.core_extra)}
          ${dl.flex_extra?.length ? `<h4>엑스트라 선택</h4>${usage(dl.flex_extra)}` : ""}</section>
      </div>
      <section class="dv-sample"><h4>예시 덱 <span class="muted small">집계에 가장 가까운 실제 상위 덱</span></h4>${sampleHTML}</section>`;
  }
  const SEV_HELP = {
    critical: "여기를 맞으면 전개가 끊기거나 견제가 1개 이하로 줄어드는 자리.",
    strong: "전개는 이어지지만 견제·다음 턴 자원이 크게 줄어드는 자리.",
    ok: "맞추면 이득. 다만 상대에게 대체 루트가 충분.",
    weak: "거의 영향 없음. 다른 데 아껴 두기.",
    bad: "쓰면 손해(대상 없음·역이용 당함).",
  };

  function legend(withHit) {
    const items = SEV.map((s) => `<span><span class="sw cell c-${s}" style="display:inline-block;min-width:0;width:14px;height:14px"></span>${SEV_G[s]} ${SEV_KO[s]}</span>`);
    if (withHit) items.push(`<span><span class="sw" style="background:var(--hit)"></span>쓸 수는 있음 (추천 타이밍 아님)</span>`);
    return `<div class="legend">${items.join("")}</div>`;
  }

  function homeHeat(themes) {
    const head = `<thead><tr><th class="rowh"></th>${themes.map((t) => `<th><a href="#/t/${t.slug}">${esc(t.name.ko)}</a></th>`).join("")}</tr></thead>`;
    const rows = KIND_ORDER.map((k) => {
      const hts = D.handtraps.filter((h) => h.kind === k);
      if (!hts.length) return "";
      const kindRow = `<tr class="kind"><th colspan="${themes.length + 1}">${esc(D.kinds[k]?.ko || k)}</th></tr>`;
      return (
        kindRow +
        hts
          .map((h) => {
            const cells = themes
              .map((t) => {
                const s = t.handtrap_summary[h.id];
                if (!s) return `<td><span class="cell c-none"></span></td>`;
                const tipText = `${t.name.ko} × ${h.short_ko}: ${SEV_KO[s.rating]}\n${stripBr(s.note_ko)}`;
                return `<td><a class="cell c-${s.rating}" href="#/t/${t.slug}?ht=${h.id}" data-tip="${esc(tipText)}" aria-label="${esc(tipText)}">${SEV_G[s.rating]}</a></td>`;
              })
              .join("");
            return `<tr><th class="rowh">${esc(h.short_ko)}</th>${cells}</tr>`;
          })
          .join("")
      );
    }).join("");
    return `<table class="heat">${head}<tbody>${rows}</tbody></table>`;
  }
  const stripBr = (s) => String(s || "").replace(JOSA_RE, (_, n, j) => nm(n) + (j ? fixJosa(nm(n), j) : ""));

  /* ---------- theme ---------- */
  function renderTheme(slug, params) {
    const t = D.themes.find((x) => x.slug === slug);
    if (!t) {
      app.innerHTML = `<p>테마를 찾을 수 없습니다. <a href="#/">처음으로</a></p>`;
      return;
    }
    const cmap = chokeMap(t);
    const state = {
      kind: params.get("kind") || "all",
      ht: params.get("ht") || null,
      line: params.get("line") || t.lines[0].id,
    };
    if (state.ht && HT[state.ht]) state.kind = HT[state.ht].kind;
    if (!t.lines.some((l) => l.id === state.line)) state.line = t.lines[0].id;

    const relevant = new Set(Object.keys(t.handtrap_summary));
    t.lines.forEach((l) => l.steps.forEach((s) => stepHits(s).forEach((id) => relevant.add(id))));
    const relevantHT = D.handtraps.filter((h) => relevant.has(h.id));

    app.innerHTML = `
      <div class="crumb"><a href="#/">개요</a> / ${esc(t.name.ko)}</div>
      <h1>${esc(t.name.ko)} <span class="en">${esc(t.name.en)}</span></h1>
      <div class="pills">
        <span class="pill">점유율 ${(t.meta.share * 100).toFixed(1)}% · ${t.meta.decks}덱</span>
        <span class="pill">${esc(t.meta.window)}</span>
        <span class="pill ${t.status}">${t.status === "draft" ? "초안 · 검증 필요" : "검토 완료"}</span>
        <span class="pill">갱신 ${esc(t.updated)}</span>
      </div>
      <p class="lede">${prose(t.overview_ko)}</p>
      ${t.my_notes_ko?.length ? `<section class="mine-notes"><h2><span class="mine-b">★ ${esc(t.mine)}</span> 직접 쓴 메모</h2><ul>${t.my_notes_ko.map((n) => `<li>${prose(n)}</li>`).join("")}</ul></section>` : ""}

      <div class="filters">
        <div class="chips" id="kindChips" role="group" aria-label="패트랩 종류"></div>
        <div class="chips" id="htChips" role="group" aria-label="패트랩"></div>
      </div>

      <div class="tabs" role="tablist" id="lineTabs">${t.lines
        .map((l) => `<button class="tab" role="tab" data-line="${esc(l.id)}">${l.mine ? `<span class="mine-b">★ 내 전개</span>` : ""}${esc(l.title_ko)}</button>`)
        .join("")}</div>

      <h2 style="margin-top:0">패트랩 타이밍표 <span class="muted small">패트랩 × 전개 단계</span></h2>
      ${legend(true)}
      <div class="scroll-x" id="grid"></div>

      <div class="cols" style="margin-top:20px">
        <section><h2 style="margin-top:0">전개 흐름</h2><div id="flow"></div></section>
        <aside class="panel"><h2 style="margin-top:0">패트랩 상성 요약</h2><div class="summary" id="summary"></div></aside>
      </div>

      ${(() => {
        const rs = rulingsFor({ theme: t.slug });
        return rs.length
          ? `<h2>관련 공식 판정 <span class="muted small">${rs.length}건</span></h2><div class="htlist">${rs.slice(0, 6).map(rulingCard).join("")}</div>${rs.length > 6 ? `<p><a href="#/r?tab=rulings&t=${t.slug}">판정 ${rs.length}건 모두 보기 →</a></p>` : ""}`
          : "";
      })()}
      ${learnBlock(t.slug)}
      ${t.notes_ko?.length ? `<h2>주의할 점</h2><ul class="notes">${t.notes_ko.map((n) => `<li>${prose(n)}</li>`).join("")}</ul>` : ""}
      ${t.sources?.length ? `<h2>출처</h2><ul class="sources">${t.sources.map((s) => `<li>${linkify(s)}</li>`).join("")}</ul>` : ""}
    `;

    const active = () => {
      if (state.ht) return new Set([state.ht]);
      return new Set(relevantHT.filter((h) => state.kind === "all" || h.kind === state.kind).map((h) => h.id));
    };

    const syncHash = () => {
      const q = new URLSearchParams();
      if (state.line !== t.lines[0].id) q.set("line", state.line);
      if (state.ht) q.set("ht", state.ht);
      else if (state.kind !== "all") q.set("kind", state.kind);
      const h = `#/t/${slug}${q.toString() ? "?" + q : ""}`;
      if (location.hash !== h) history.replaceState(null, "", h);
    };

    function drawChips() {
      const kinds = ["all", ...KIND_ORDER.filter((k) => relevantHT.some((h) => h.kind === k))];
      document.getElementById("kindChips").innerHTML = kinds
        .map((k) => `<button class="chip" data-kind="${k}" aria-pressed="${!state.ht && state.kind === k}">${k === "all" ? "전체" : esc(D.kinds[k].ko)}</button>`)
        .join("");
      const list = relevantHT.filter((h) => state.kind === "all" || h.kind === state.kind);
      document.getElementById("htChips").innerHTML = list
        .map((h) => `<button class="chip sub" data-ht="${h.id}" aria-pressed="${state.ht === h.id}">${esc(h.short_ko)}</button>`)
        .join("");
    }

    function drawTabs() {
      document.querySelectorAll("#lineTabs .tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.line === state.line));
    }

    function drawGrid() {
      const line = t.lines.find((l) => l.id === state.line);
      const act = active();
      const steps = line.steps;
      const head = `<thead><tr><th class="rowh">단계 →</th><th class="rowh" style="position:static">평가</th>${steps
        .map((s, i) => `<th><a class="stepno" href="#" data-goto="${i}" data-tip="${esc(`${i + 1}. ${ko(s.card) || s.card}\n${s.action_ko}`)}">${i + 1}</a></th>`)
        .join("")}</tr></thead>`;
      const rows = KIND_ORDER.map((k) => {
        const hts = relevantHT.filter((h) => h.kind === k && act.has(h.id));
        if (!hts.length) return "";
        return (
          `<tr class="kind"><th colspan="${steps.length + 2}">${esc(D.kinds[k].ko)}</th></tr>` +
          hts
            .map((h) => {
              const sum = t.handtrap_summary[h.id];
              const cells = steps
                .map((s, i) => {
                  const cps = (cmap[line.id][i] || []).filter((c) => c.handtrap === h.id);
                  const canHit = h.hits.some((c) => (s.class || []).includes(c));
                  const w = worst(cps) || (cps.length ? cps[0] : null);
                  let cls = "c-none", g = "", tipText = "";
                  const head = `${i + 1}. ${ko(s.card) || s.card} — ${s.action_ko}`;
                  if (w) {
                    cls = `c-${w.severity}`;
                    g = SEV_G[w.severity];
                    tipText = `${h.short_ko} · ${SEV_KO[w.severity]} (우선순위 ${w.rank})\n${head}\n${stripBr(w.why_ko)}`;
                  } else if (canHit) {
                    cls = "c-hit";
                    g = "·";
                    tipText = `${h.short_ko} 대응 가능\n${head}`;
                  }
                  return cls === "c-none"
                    ? `<td><span class="cell c-none"></span></td>`
                    : `<td><button class="cell ${cls}" data-goto="${i}" data-tip="${esc(tipText)}" aria-label="${esc(tipText)}">${g}</button></td>`;
                })
                .join("");
              return `<tr><th class="rowh"><button class="chip sub" style="padding:0 6px;border:0;background:none" data-ht="${h.id}">${esc(h.short_ko)}</button></th><td>${
                sum ? `<span class="cell c-${sum.rating}" data-tip="${esc(stripBr(sum.note_ko))}">${SEV_G[sum.rating]}</span>` : `<span class="cell c-none"></span>`
              }</td>${cells}</tr>`;
            })
            .join("")
        );
      }).join("");
      document.getElementById("grid").innerHTML = rows
        ? `<table class="heat">${head}<tbody>${rows}</tbody></table>`
        : `<p class="muted" style="padding:12px">이 루트에서 해당 패트랩이 맞는 단계가 없습니다.</p>`;
    }

    function drawFlow() {
      const line = t.lines.find((l) => l.id === state.line);
      const act = active();
      const filtering = state.ht || state.kind !== "all";
      const items = line.steps
        .map((s, i) => {
          const hits = stepHits(s).filter((id) => act.has(id));
          const cps = (cmap[line.id][i] || []).filter((c) => act.has(c.handtrap));
          const w = worst(cps);
          const nodeCls = w ? `n-${w.severity}` : hits.length ? "n-hit" : "";
          const cpByHt = {};
          cps.forEach((c) => (cpByHt[c.handtrap] = cpByHt[c.handtrap] && sevRank(cpByHt[c.handtrap]) < sevRank(c.severity) ? cpByHt[c.handtrap] : c.severity));
          const chipIds = [...new Set([...hits, ...Object.keys(cpByHt)])];
          const chips = chipIds
            .sort((a, b) => sevRank(cpByHt[a]) - sevRank(cpByHt[b]))
            .map((id) => `<span class="hit ${cpByHt[id] ? "h-" + cpByHt[id] : ""}" data-tip="${esc(HT[id]?.note_ko || "")}">${cpByHt[id] ? SEV_G[cpByHt[id]] + " " : ""}${esc(htName(id))}</span>`)
            .join("");
          const callouts = cps
            .sort((a, b) => a.rank - b.rank)
            .map(
              (c) => `<div class="cp sev-${c.severity}" style="--sev-c:var(--sev-${c.severity})">
                <p>${sevBadge(c.severity)} <b>${esc(htName(c.handtrap))}</b> <span class="muted small">우선순위 ${c.rank}${c.inferred ? " · 대상 카드 기준 배치" : ""}</span> ${rulingChips(c.rulings)}</p>
                ${c.timing_ko ? `<p><span class="lbl">타이밍</span>${prose(c.timing_ko)}</p>` : ""}
                <p><span class="lbl">이유</span>${prose(c.why_ko)}</p>
                ${c.fallback_ko ? `<p><span class="lbl">맞은 뒤</span>${prose(c.fallback_ko)}</p>` : ""}
              </div>`
            )
            .join("");
          const dim = filtering && !hits.length && !cps.length;
          return `<li id="step-${i}">
            <span class="node ${nodeCls}">${i + 1}</span>
            <div class="step ${dim ? "dim" : ""}">
              ${img(s.card, "art") ? `<img class="thumb" src="${img(s.card, "art")}" alt="" loading="lazy" width="64" height="64">` : ""}
              <div class="who">${card(s.card)}</div>
              <div class="act">${prose(s.action_ko)}</div>
              ${s.result_ko ? `<div class="res">${prose(s.result_ko)}</div>` : ""}
              ${chips ? `<div class="hits">${chips}</div>` : ""}
              ${callouts}
            </div>
          </li>`;
        })
        .join("");
      const hand = line.hand?.length ? `<div class="hand"><span class="muted">초동 패</span> ${line.hand.map((c) => card(c)).join(" + ")}</div>` : "";
      const note = line.note_ko ? `<p class="small muted">${prose(line.note_ko)}</p>` : "";
      const end = line.end_board?.length
        ? `<div class="endboard"><b>최종 필드</b> ${line.end_board.map((c) => card(c, { noEn: true })).join(", ")}${line.end_board_note_ko ? `<div class="small muted">${prose(line.end_board_note_ko)}</div>` : ""}</div>`
        : "";
      document.getElementById("flow").innerHTML = `${hand}${note}<ol class="flow">${items}</ol>${end}`;
    }

    function drawSummary() {
      const act = active();
      const rows = Object.entries(t.handtrap_summary).sort((a, b) => sevRank(a[1].rating) - sevRank(b[1].rating));
      document.getElementById("summary").innerHTML = rows
        .map(([id, s]) => `<div class="sumrow ${act.has(id) ? "" : "dim"}"><div><div class="nm">${esc(htName(id))}</div>${sevBadge(s.rating)}</div><div>${prose(s.note_ko)} ${rulingChips(s.rulings)}</div></div>`)
        .join("");
    }

    const redraw = () => {
      syncHash();
      drawChips();
      drawTabs();
      drawGrid();
      drawFlow();
      drawSummary();
    };

    app.onclick = (e) => {
      const kindBtn = e.target.closest("[data-kind]");
      const htBtn = e.target.closest("[data-ht]");
      const tab = e.target.closest("[data-line]");
      const go = e.target.closest("[data-goto]");
      if (kindBtn) {
        state.kind = kindBtn.dataset.kind;
        state.ht = null;
      } else if (htBtn) {
        state.ht = state.ht === htBtn.dataset.ht ? null : htBtn.dataset.ht;
        if (state.ht) state.kind = HT[state.ht].kind;
      } else if (tab) {
        state.line = tab.dataset.line;
      } else if (go) {
        e.preventDefault();
        const el = document.getElementById("step-" + go.dataset.goto);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const st = el.querySelector(".step");
          st.classList.add("flash");
          setTimeout(() => st.classList.remove("flash"), 1400);
        }
        return;
      } else return;
      redraw();
    };
    redraw();
    window.scrollTo(0, 0);
  }

  const linkify = (s) => {
    const m = String(s).match(/https?:\/\/\S+/);
    if (!m) return esc(s);
    const url = m[0].replace(/[),]+$/, "");
    const rest = String(s).replace(m[0], "").replace(/^[\s(—-]+|[\s)—-]+$/g, "");
    return `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(rest || url)}</a>${rest ? ` <span class="muted">${esc(new URL(url).hostname)}</span>` : ""}`;
  };

  /* ---------- play: 즉석 족보 ---------- */
  // 미리 준비가 필요한 카드: set = 내 턴에 세트해 둬야 함(속공 마법·함정), field = 내 필드에 있어야 함
  const setupOf = (id) => {
    const h = HT[id];
    if (!h) return "hand";
    if (h.setup) return h.setup;
    return (D.cards[h.card] || {}).type === "Spell" ? "set" : "hand";
  };
  const SETUP_BLOCK = { set: "후공이면 상대 1턴엔 못 씀 (내 턴에 세트해 둬야 함)", field: "후공이면 상대 1턴엔 못 씀 (내 필드에 미리 있어야 함)" };
  const SETUP_NOTE = { set: "※ 내 턴에 세트해 둔 경우에만 상대 턴에 쓸 수 있음", field: "※ 내 필드에 미리 세워 둔 경우에만 적용됨" };
  const NEEDS_EMPTY = new Set(["imperm", "fuwalos", "purulia", "meowls", "gamma"]); // gamma 는 '몬스터가 없을 때'
  const WIPE = new Set(["lightning_storm", "evenly_matched", "dark_ruler", "harpie", "heavy_storm", "raigeki", "dark_hole", "kaiju_slumber", "book_eclipse"]);
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    },
  };
  const anyCard = (id) => HT[id] || BK[id];
  const anyName = (id) => (anyCard(id) ? (MODE === "en" ? anyCard(id).card : anyCard(id).short_ko) : id);
  const thumb = (en, cls = "mini") => {
    const src = img(en, "art");
    return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : `<span class="${cls} ph"></span>`;
  };

  // 보유 카드 ↔ 견제 최대 매칭. 전체 제거 카드는 같은 보드의 여러 견제를 한 번에 해결한다.
  function solveBoard(board, held) {
    const res = board.interruptions.map((it) => ({ it, by: null, options: (it.answered_by || []).filter((a) => held.has(a.id)) }));
    const multi = new Set([...held].filter((id) => WIPE.has(id)));
    res.forEach((r) => {
      const w = r.options.find((o) => multi.has(o.id));
      if (w) r.by = w;
    });
    const owner = {}; // cardId -> index
    const tryAssign = (i, seen) => {
      for (const o of res[i].options) {
        if (multi.has(o.id) || seen.has(o.id)) continue;
        seen.add(o.id);
        if (owner[o.id] === undefined || tryAssign(owner[o.id], seen)) {
          owner[o.id] = i;
          res[i].by = o;
          return true;
        }
      }
      return false;
    };
    res.forEach((r, i) => { if (!r.by) tryAssign(i, new Set()); });
    // 다른 견제에 재배정되어 빠진 표시 정리
    res.forEach((r, i) => { if (r.by && !multi.has(r.by.id) && owner[r.by.id] !== i) r.by = null; });
    return res;
  }

  function verdict(res) {
    const total = res.length;
    const left = res.filter((r) => !r.by).length;
    if (!total) return { cls: "good", label: "견제 없음", text: "상대 보드에 막을 수단이 거의 없습니다. 그대로 전개하세요." };
    if (left === 0) return { cls: "good", label: "돌파 유력", text: `견제 ${total}개를 모두 처리할 카드가 있습니다. 아래 순서대로.` };
    if (left === 1) return { cls: "mid", label: "반반", text: `견제 ${left}개가 남습니다. 미끼로 소모시키거나 남은 견제를 맞고도 이길 수 있는지 계산하세요.` };
    return { cls: "bad", label: "어려움", text: `견제 ${left}개가 남습니다. 무리한 전개보다 자원을 아끼는 플레이를 고려하세요.` };
  }

  function renderPlay(params) {
    const ALL = [...D.handtraps.map((h) => ({ ...h, group: h.kind === "not_handtrap" ? "breaker" : h.kind })), ...D.breakers.map((b) => ({ ...b, group: "breaker" }))];
    const ENG = D.engines || [];
    // l: "t:slug=line,e:slug=line" (예전 주소의 l=line 은 메인 테마 라인으로 읽는다)
    const lines = {};
    (params.get("l") || "").split(",").filter(Boolean).forEach((x) => {
      const [k, v] = x.includes("=") ? x.split("=") : ["main", x];
      lines[k] = v;
    });
    const hereP = (params.get("w") || "").split("|");
    const state = {
      first: params.get("s") === "1" ? true : params.get("s") === "2" ? false : store.get("play.first", false),
      theme: params.get("t") || null,
      engines: new Set((params.get("e") || "").split(",").filter((s) => ENG.some((e) => e.slug === s))),
      held: new Set((params.get("h") || "").split(",").filter((x) => anyCard(x))),
      board: params.get("b") || null,
      lines,
      here: hereP.length === 3 ? { key: hereP[0], line: hereP[1], i: +hereP[2] } : null,
      q: "",
      editDeck: false,
      deck: new Set(store.get("play.deck", [])),
    };
    if (lines.main && state.theme) { lines["t:" + state.theme] = lines.main; delete lines.main; }

    app.onclick = null;
    app.oninput = null;
    app.innerHTML = `
      <h1>즉석 족보 <span class="en">플레이 중 바로 보기</span></h1>
      <div class="play-top">
        <div class="seg" role="group" aria-label="선공 후공">
          <button type="button" data-first="1">선공</button>
          <button type="button" data-first="0">후공</button>
        </div>
        <input id="themeSearch" class="search" type="search" placeholder="상대 테마 또는 상대가 낸 카드 이름 (한글·영문)" autocomplete="off">
      </div>
      <div id="cardFind"></div>
      <div id="themePick" class="pick"></div>
      <div id="enginePick"></div>
      <div id="strip"></div>
      <section class="hand-panel">
        <div class="hand-head">
          <h2>지금 내 패</h2>
          <button type="button" class="chip sub" id="deckEdit"></button>
          <button type="button" class="chip sub" id="clearHand">패 비우기</button>
        </div>
        <p class="muted small" id="deckHint"></p>
        <div id="handPick"></div>
      </section>
      <div id="playOut"></div>`;

    /* ----- 모듈: 메인 테마 1개 + 엔진 여러 개를 같은 모양으로 다룬다 ----- */
    const modName = (d) => (MODE === "en" ? d.name.en : d.name.ko);
    function modules() {
      const out = [];
      const t = D.themes.find((x) => x.slug === state.theme);
      if (t) out.push({ key: "t:" + t.slug, kind: "theme", d: t, cmap: chokeMap(t) });
      ENG.filter((e) => state.engines.has(e.slug)).forEach((e) => out.push({ key: "e:" + e.slug, kind: "engine", d: e, cmap: chokeMap(e) }));
      return out;
    }
    const hostOf = (e) => (e.hosts || []).find((h) => h.theme === state.theme);
    const engineRate = (e, t) => {
      const m = (t?.engines || []).find((x) => x.slug === e.slug);
      if (m) return m.rate;
      const h = t && (e.hosts || []).find((x) => x.theme === t.slug);
      return h?.rate ?? null;
    };
    const heldHT = () => [...state.held].filter((id) => HT[id] && HT[id].kind !== "not_handtrap");

    // 라인 고르기: 지정 > 다른 모듈과 합류하는 라인 > 내 패트랩이 많이 맞는 라인 > 첫 라인
    function lineOf(m) {
      const ls = m.d.lines || [];
      const fixed = ls.find((l) => l.id === state.lines[m.key]);
      if (fixed) return fixed;
      const held = heldHT();
      const joinIds = new Set();
      if (m.kind === "theme") ENG.filter((e) => state.engines.has(e.slug)).forEach((e) => (hostOf(e)?.joins || []).forEach((j) => joinIds.add(j.theme_line)));
      else (hostOf(m.d)?.joins || []).forEach((j) => joinIds.add(j.engine_line));
      const score = (l) => Object.values(m.cmap[l.id] || {}).flat().filter((c) => held.includes(c.handtrap) && c.severity !== "bad").length + (joinIds.has(l.id) ? 100 : 0);
      return [...ls].sort((a, b) => score(b) - score(a))[0];
    }

    // 합류 지점: 엔진 줄/메인 줄 각각의 (라인, 단계) → 표시 문구
    function joinMarks(mods) {
      const map = {};
      const t = mods.find((m) => m.kind === "theme");
      if (!t) return map;
      const put = (key, line, step, txt, note) => ((map[`${key}|${line}|${step - 1}`] = map[`${key}|${line}|${step - 1}`] || []).push({ txt, note }));
      mods.filter((m) => m.kind === "engine").forEach((m) => {
        (hostOf(m.d)?.joins || []).forEach((j) => {
          put(m.key, j.engine_line, j.engine_step, `→ 메인 ${j.theme_step}단계로 합류`, j.note_ko);
          put(t.key, j.theme_line, j.theme_step, `← ${modName(m.d)} ${j.engine_step}단계에서 합류`, j.note_ko);
        });
      });
      return map;
    }

    // "지금 여기": 상대가 진행 중인 단계. 그 모듈은 이 단계 이후 타이밍만 남긴다.
    const alive = (m, c) => {
      const h = state.here;
      if (!h || h.key !== m.key) return true;
      return c.line === h.line && c.step >= h.i + 1;
    };

    const sync = () => {
      const q = new URLSearchParams();
      q.set("s", state.first ? "1" : "2");
      if (state.theme) q.set("t", state.theme);
      if (state.engines.size) q.set("e", [...state.engines].join(","));
      if (state.held.size) q.set("h", [...state.held].join(","));
      if (state.board) q.set("b", state.board);
      const ls = Object.entries(state.lines).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
      if (ls.length) q.set("l", ls.join(","));
      if (state.here) q.set("w", `${state.here.key}|${state.here.line}|${state.here.i}`);
      history.replaceState(null, "", "#/p?" + q);
      store.set("play.first", state.first);
    };

    /* ----- 검색: 테마 이름 + 본 카드 역색인 ----- */
    const CARD_IDX = {};
    const addIdx = (en, mod) => { if (en) (CARD_IDX[en] = CARD_IDX[en] || new Set()).add(mod); };
    D.themes.forEach((t) => {
      (t.key_cards || []).forEach((k) => addIdx(k.card, "t:" + t.slug));
      (t.lines || []).forEach((l) => { l.steps.forEach((s) => addIdx(s.card, "t:" + t.slug)); (l.end_board || []).forEach((c) => addIdx(c, "t:" + t.slug)); });
    });
    ENG.forEach((e) => {
      [...(e.starters || []), ...(e.key_cards || []).map((k) => k.card), ...(e.restrictions || []).map((r) => r.card)].forEach((c) => addIdx(c, "e:" + e.slug));
      (e.lines || []).forEach((l) => { l.steps.forEach((s) => addIdx(s.card, "e:" + e.slug)); (l.end_board || []).forEach((c) => addIdx(c, "e:" + e.slug)); });
    });
    const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
    const themeMatches = (t, q) => {
      if (!q) return true;
      const hay = [t.name.ko, t.name.en, t.slug, ...(t.variants || []), ...(t.key_cards || []).flatMap((k) => [k.card, ko(k.card) || ""])].join(" ").toLowerCase();
      return words(q).every((w) => hay.includes(w));
    };
    const cardHits = (q) => {
      if (!q || q.length < 2) return [];
      const ws = words(q);
      return Object.keys(CARD_IDX)
        .filter((en) => { const hay = (en + " " + (ko(en) || "")).toLowerCase(); return ws.every((w) => hay.includes(w)); })
        .sort((a, b) => CARD_IDX[b].size - CARD_IDX[a].size || a.length - b.length)
        .slice(0, 6);
    };

    function drawSeg() {
      app.querySelectorAll("[data-first]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.first === "1") === String(state.first)));
    }

    function drawThemes() {
      const list = D.themes.filter((t) => themeMatches(t, state.q));
      const hits = cardHits(state.q);
      document.getElementById("themePick").innerHTML = list.length
        ? list
            .map((t) => `<button type="button" class="ptheme${state.theme === t.slug ? " on" : ""}" data-theme="${t.slug}">
              ${thumb(t.cover, "pt-art")}<span><b>${esc(modName(t))}</b>${MODE === "en" ? "" : `<span class="en">${esc(t.name.en)}</span>`}</span></button>`)
            .join("")
        : hits.length ? "" : `<p class="muted small">검색 결과가 없습니다.</p>`;
      // 본 카드로 찾기: 그 카드를 쓰는 테마·엔진을 보여 주고 바로 고르게 한다
      const share = (k) => {
        if (k.startsWith("t:")) return D.themes.find((t) => "t:" + t.slug === k)?.meta?.share || 0;
        return 0;
      };
      document.getElementById("cardFind").innerHTML = hits.length
        ? `<div class="cfind"><div class="hg-title">본 카드로 찾기</div>${hits
            .map((en) => {
              const mods = [...CARD_IDX[en]].sort((a, b) => share(b) - share(a));
              return `<div class="cf-row">${thumb(en)}<span class="cf-name">${card(en, { noEn: MODE !== "both" })}</span><span class="cf-mods">${mods
                .map((k) => {
                  const slug = k.slice(2);
                  if (k.startsWith("t:")) {
                    const t = D.themes.find((x) => x.slug === slug);
                    return `<button type="button" class="chip sub" data-theme="${slug}" aria-pressed="${state.theme === slug}">${esc(modName(t))} <span class="muted">${((t.meta?.share || 0) * 100).toFixed(1)}%</span></button>`;
                  }
                  const e = ENG.find((x) => x.slug === slug);
                  return `<button type="button" class="chip sub eng" data-engine="${slug}" aria-pressed="${state.engines.has(slug)}">＋ ${esc(modName(e))}</button>`;
                })
                .join("")}</span></div>`;
            })
            .join("")}</div>`
        : "";
    }

    function drawEngines() {
      const el = document.getElementById("enginePick");
      if (!ENG.length) { el.innerHTML = ""; return; }
      const t = D.themes.find((x) => x.slug === state.theme);
      const rows = ENG.map((e) => ({ e, rate: engineRate(e, t) })).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
      const sug = rows.filter((r) => r.rate);
      const rest = rows.filter((r) => !r.rate);
      const chip = (r) => `<button type="button" class="chip sub eng" data-engine="${r.e.slug}" aria-pressed="${state.engines.has(r.e.slug)}">${state.engines.has(r.e.slug) ? "✓" : "＋"} ${esc(modName(r.e))}${r.rate ? ` <span class="muted">${(r.rate * 100).toFixed(0)}%</span>` : ""}</button>`;
      el.innerHTML = `<div class="engine-pick">
        <div class="hg-title">섞어 쓰는 엔진 ${t ? `<span class="muted small">— ${esc(modName(t))} 덱에 함께 들어가는 비율</span>` : `<span class="muted small">— 엔진만 따로 볼 수도 있습니다</span>`}</div>
        <div class="chips wrap">${sug.map(chip).join("")}${sug.length && rest.length ? `<span class="chip-sep" aria-hidden="true"></span>` : ""}${rest.map(chip).join("")}</div>
      </div>`;
    }

    function drawHand() {
      const theme = D.themes.find((t) => t.slug === state.theme);
      const usage = {};
      (theme?.staples || []).forEach((s) => (usage[s.id] = s.rate));
      const showAll = state.editDeck || !state.deck.size;
      const groups = [...KIND_ORDER, "breaker"]
        .map((k) => {
          const items = ALL.filter((c) => c.group === k && (showAll || state.deck.has(c.id)));
          if (!items.length) return "";
          const title = k === "breaker" ? "후공 돌파 카드" : D.kinds[k].ko;
          return `<div class="hgroup"><div class="hg-title">${esc(title)}</div><div class="hcards">${items
            .map((c) => {
              const on = state.editDeck ? state.deck.has(c.id) : state.held.has(c.id);
              return `<button type="button" class="hcard${on ? " on" : ""}${state.editDeck ? " edit" : ""}" data-card-id="${c.id}" aria-pressed="${on}">
                ${thumb(c.card)}<span>${esc(MODE === "en" ? c.card : c.short_ko)}</span></button>`;
            })
            .join("")}</div></div>`;
        })
        .join("");
      document.getElementById("handPick").innerHTML = groups;
      document.getElementById("deckEdit").textContent = state.editDeck ? "덱 편집 완료" : state.deck.size ? `내 덱 카드만 표시 중 (${state.deck.size}) · 편집` : "내 덱 카드 지정";
      document.getElementById("deckHint").textContent = state.editDeck
        ? "덱에 넣은 패트랩·돌파 카드를 눌러 두면 다음부터 그 카드만 보입니다. (이 브라우저에 저장)"
        : "들고 있는 카드를 누르세요. 결과가 바로 아래에 바뀝니다.";
    }

    const stepOf = (m, c) => {
      const ls = m.d.lines || [];
      const line = ls.find((l) => l.id === c.line);
      if (line && c.step) return { line, s: line.steps[c.step - 1], i: c.step - 1 };
      for (const l of ls) {
        const i = l.steps.findIndex((s) => s.card === c.target_card);
        if (i >= 0) return { line: l, s: l.steps[i], i };
      }
      return null;
    };
    const modTag = (m, mods) => (mods.length > 1 ? `<span class="mod-tag ${m.kind}">${esc(m.kind === "engine" ? modName(m.d) : "메인")}</span>` : "");

    function drawOut() {
      const out = document.getElementById("playOut");
      const mods = modules();
      if (!mods.length) {
        out.innerHTML = `<p class="empty-hint">상대 테마를 고르면 족보가 나옵니다. 테마 이름을 모르면 위 검색칸에 상대가 낸 카드 이름을 쳐 보세요.</p>`;
        return;
      }
      const t = mods.find((m) => m.kind === "theme")?.d || null;
      const lead = mods[0];
      const held = state.held;
      const engMods = mods.filter((m) => m.kind === "engine");

      // A. 상대 턴: 패트랩 던질 곳 (모든 모듈의 타이밍을 합쳐 패트랩마다 가장 아픈 곳 1개)
      const plans = heldHT()
        .map((id) => {
          const cps = mods.flatMap((m) => m.d.chokepoints.map((c, i) => ({ ...c, rank: i + 1, m })).filter((c) => c.handtrap === id && alive(m, c)));
          const good = cps.filter((c) => c.severity !== "bad").sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.rank - b.rank);
          const bad = cps.filter((c) => c.severity === "bad");
          const sums = mods.map((m) => ({ m, s: m.d.handtrap_summary?.[id] })).filter((x) => x.s);
          const best = good[0];
          // 둘 이상 모듈에서 치명이면 어느 쪽에 쓸지 갈린다 → 엔진의 우선순위 메모를 붙인다
          const critMods = new Set(good.filter((c) => c.severity === "critical").map((c) => c.m.key));
          const conflict = critMods.size > 1 ? engMods.map((m) => hostOf(m.d)?.priority_ko).filter(Boolean) : [];
          const setup = setupOf(id);
          const isSpell = setup !== "hand";
          const blocked = (state.first && NEEDS_EMPTY.has(id)) || (!state.first && isSpell);
          const setNote = state.first && isSpell ? SETUP_NOTE[setup] : "";
          const sev = best ? best.severity : sums.length ? sums.map((x) => x.s.rating).sort((a, b) => sevRank(a) - sevRank(b))[0] : "weak";
          // 다른 지점: 같은 모듈 다음 순위 + 다른 모듈 최선
          const more = [];
          const seenMods = new Set(best ? [best.m.key] : []);
          good.slice(1).forEach((c) => {
            if (more.length >= 3) return;
            if (c.m.key === best.m.key ? more.filter((x) => x.m.key === c.m.key).length < 1 : !seenMods.has(c.m.key)) { more.push(c); seenMods.add(c.m.key); }
          });
          return { id, best, more, bad, sums, blocked, isSpell, setNote, sev, conflict };
        })
        .sort((a, b) => a.blocked - b.blocked || sevRank(a.sev) - sevRank(b.sev) || (a.best?.rank || 99) - (b.best?.rank || 99));

      const myTurn = (id) => {
        const r = mods.map((m) => ({ m, b: m.d.going_second?.breakers?.[id] })).filter((x) => x.b);
        return r.map(({ m, b }) => `<p class="small my-turn"><span class="lbl">내 턴(후공)</span>${modTag(m, mods)}${sevBadge(b.rating)} ${prose(b.note_ko)} ${rulingChips(b.rulings)}</p>`).join("");
      };
      const planHTML = plans.length
        ? `<ol class="plan">${plans
            .map((p, n) => {
              const c = p.best;
              const where = c ? stepOf(c.m, c) : null;
              return `<li class="pl sevb-${p.sev}${p.blocked ? " blocked" : ""}">
                <div class="pl-head"><span class="pl-n">${n + 1}</span>${thumb(HT[p.id].card)}<b>${esc(htName(p.id))}</b>${sevBadge(p.sev)}${c ? modTag(c.m, mods) : ""}${c?.mine ? `<span class="mine-b">★ ${esc(c.mine)}</span>` : ""}</div>
                ${
                  p.blocked
                    ? p.isSpell
                      ? `<p class="pl-bad small">⚠ ${esc(SETUP_BLOCK[setupOf(p.id)])}</p>`
                      : `<p class="pl-bad small">⚠ 내 필드에 ${p.id === "gamma" ? "몬스터" : "카드"}가 있으면 쓸 수 없음${p.id === "imperm" ? " (패에서 발동 불가 — 세트해 두었다면 가능)" : ""}</p>`
                    : ""
                }
                ${p.setNote ? `<p class="small muted">${esc(p.setNote)}</p>` : ""}
                ${
                  c
                    ? `<div class="pl-body">
                        ${where ? `<div class="pl-target">${thumb(where.s.card, "tgt")}<div><div>${card(c.target_card || where.s.card, { noEn: true })}</div><div class="muted small">${mods.length > 1 ? esc(modName(c.m.d)) + " · " : ""}${esc(stripBr(where.line.title_ko))} · ${where.i + 1}단계</div></div></div>` : ""}
                        ${c.timing_ko ? `<p><span class="lbl">타이밍</span>${prose(c.timing_ko)}</p>` : ""}
                        <p class="small">${prose(c.why_ko)} ${rulingChips([...(c.rulings || []), ...rulingsFor({ theme: c.m.kind === "theme" ? c.m.d.slug : undefined, handtrap: p.id }).filter(() => c.m.kind === "theme").map((q) => q.id)])}</p>
                        ${p.conflict.length ? `<p class="small conflict"><span class="lbl">어느 쪽에?</span>${p.conflict.map(prose).join("<br>")}</p>` : ""}
                        ${p.more.length ? `<p class="small muted">다른 지점: ${p.more.map((m) => `${SEV_G[m.severity]} ${mods.length > 1 ? esc(modName(m.m.d)) + " " : ""}${esc(m.target_card ? nm(m.target_card) : "")}`).join(" · ")}</p>` : ""}
                      </div>`
                    : `<div class="pl-body">${
                        p.sums.length
                          ? p.sums.map(({ m, s }) => `<p class="small"><span class="lbl">상대 턴</span>${modTag(m, mods)}${prose(s.note_ko)}</p>`).join("")
                          : `<p class="small"><span class="lbl">상대 턴</span>${state.here ? "지금 단계 이후로는 정리된 사용 지점이 없습니다." : "상대 1턴 전개 중에는 정리된 사용 지점이 없습니다."}</p>`
                      }${myTurn(p.id)}</div>`
                }
                ${p.bad.length ? `<p class="pl-bad small">✕ 쓰지 말 것: ${p.bad.map((b) => prose(b.why_ko)).join(" / ")}</p>` : ""}
              </li>`;
            })
            .join("")}</ol>`
        : `<p class="muted small">위에서 들고 있는 패트랩을 고르면 던질 순서가 나옵니다. 가장 아픈 타이밍:</p>
           <ol class="plan compact">${mods
             .flatMap((m) => m.d.chokepoints.map((c, i) => ({ ...c, rank: i + 1, m })).filter((c) => c.severity !== "bad" && alive(m, c)).slice(0, mods.length > 1 ? 2 : 3))
             .map((c) => `<li>${modTag(c.m, mods)}${sevBadge(c.severity, htName(c.handtrap))} → ${card(c.target_card, { noEn: true })} <span class="muted small">${prose(c.timing_ko || "")}</span></li>`)
             .join("")}</ol>`;

      // 섞였을 때 주의: 엔진 제약 + 우선순위
      const mixHTML = engMods.length
        ? `<div class="mix-notes">${engMods
            .map((m) => {
              const h = hostOf(m.d);
              const rs = (m.d.restrictions || []).map((r) => `<li>⛓ ${card(r.card, { noEn: true })}: ${prose(r.text_ko)}${t && r.hits_main_ko ? ` → <b>${prose(r.hits_main_ko)}</b>` : ""}</li>`).join("");
              return `<div class="mix"><div class="mix-h">${thumb(m.d.cover)}<b>${esc(modName(m.d))}</b>${t ? ` + ${esc(modName(t))}` : ""}</div>
                ${h?.priority_ko ? `<p class="small"><span class="lbl">우선순위</span>${prose(h.priority_ko)}</p>` : t ? `<p class="small muted">이 테마와 섞인 경우의 정리는 아직 없습니다. 엔진 단독 타이밍을 참고하세요.</p>` : ""}
                ${rs ? `<ul class="small">${rs}</ul>` : ""}</div>`;
            })
            .join("")}</div>`
        : "";

      // B. 후공 돌파: 모듈별 보드 + 메인 풀 보드에 엔진 견제를 얹은 합성 보드
      let breakHTML = "";
      if (!state.first) {
        const boards = [];
        mods.forEach((m) => (m.d.going_second?.boards || []).forEach((b) => boards.push({ ...b, id: `${m.key}#${b.id}`, m, title: mods.length > 1 ? `${modName(m.d)} · ${stripBr(b.title_ko)}` : stripBr(b.title_ko) })));
        const tm = mods.find((m) => m.kind === "theme");
        // 메인 테마에 이미 '엔진 혼합형' 보드(합류하는 라인의 보드)가 있으면 그걸 기본으로, 없을 때만 메인 첫 보드 + 엔진 견제를 합성
        const joinLines = new Set(engMods.flatMap((m) => (hostOf(m.d)?.joins || []).map((j) => j.theme_line)));
        const mixedIdx = tm ? boards.findIndex((b) => b.m === tm && joinLines.has(b.line)) : -1;
        const tb = tm?.d.going_second?.boards?.[0];
        if (mixedIdx > 0) {
          const [mb] = boards.splice(mixedIdx, 1);
          boards.unshift({ ...mb, title: `⧉ ${mb.title}` });
        } else if (mixedIdx < 0 && tb && engMods.length) {
          const eb = engMods.map((m) => ({ m, b: m.d.going_second?.boards?.[0] })).filter((x) => x.b);
          if (eb.length) {
            boards.unshift({
              id: "mix",
              title: `${modName(tm.d)} 풀 보드 + ${eb.map((x) => modName(x.m.d)).join(" + ")}`,
              interruptions: [...tb.interruptions.map((it) => ({ ...it, m: tm })), ...eb.flatMap((x) => x.b.interruptions.map((it) => ({ ...it, m: x.m })))],
              mixed: true,
            });
          }
        }
        if (!boards.length) {
          breakHTML = `<section class="panel"><h2>돌파 가능성</h2><p class="muted">이 테마의 후공 데이터는 준비 중입니다.</p></section>`;
        } else {
          let board = boards.find((b) => b.id === state.board) || boards.find((b) => b.id === `${lead.key}#${state.board}`) || boards[0];
          const res = solveBoard(board, held);
          const v = verdict(res);
          const gsMods = mods.filter((m) => m.d.going_second);
          const brk = (id) => gsMods.map((m) => ({ m, r: m.d.going_second.breakers?.[id] })).filter((x) => x.r);
          const heldBk = [...held].filter((id) => brk(id).length);
          const wishMap = {};
          gsMods.forEach((m) =>
            Object.entries(m.d.going_second.breakers || {}).forEach(([id, r]) => {
              if (held.has(id) || !anyCard(id) || !(r.rating === "critical" || r.rating === "strong")) return;
              if (!wishMap[id] || sevRank(r.rating) < sevRank(wishMap[id].r.rating)) wishMap[id] = { m, r };
            })
          );
          const wish = Object.entries(wishMap).sort((a, b) => sevRank(a[1].r.rating) - sevRank(b[1].r.rating)).slice(0, 6);
          const diff = { hard: "풀 보드 난이도 높음", medium: "풀 보드 난이도 보통", easy: "풀 보드 난이도 낮음" }[lead.d.going_second?.difficulty] || "";
          breakHTML = `<section class="panel break">
            <h2>돌파 가능성 <span class="muted small">후공 · ${esc(diff)}</span></h2>
            ${gsMods.map((m) => `<p class="small">${modTag(m, mods)}${prose(m.d.going_second.summary_ko)}</p>`).join("")}
            <div class="chips" role="group" aria-label="상대 보드">${boards
              .map((b) => `<button type="button" class="chip sub${b.mixed ? " eng" : ""}" data-board="${esc(b.id)}" aria-pressed="${b.id === board.id}">${b.mixed ? "⧉ " : ""}${esc(b.title)}</button>`)
              .join("")}</div>
            <div class="verdict v-${v.cls}"><b>${v.label}</b><span>${esc(v.text)}<br><span class="muted small">카드 1장 = 견제 1개로 센 단순 판정입니다. 상대 무효가 내 돌파 카드를 먼저 막을 수 있으니 '미끼'와 권장 순서를 함께 보세요.${board.mixed ? " 섞인 덱은 엔진 몫만큼 메인 견제가 줄 수 있어 실제보다 어렵게 나옵니다." : ""}</span></span>
              <span class="meter" aria-hidden="true">${res.map((r) => `<i class="${r.by ? "ok" : ""}"></i>`).join("")}</span></div>
            <ul class="ints">${res
              .map(
                (r) => `<li class="${r.by ? "solved" : "open"}">
                  ${thumb(r.it.card, "tgt")}
                  <div><div>${board.mixed ? modTag(r.it.m, mods) : ""}<b>${esc(nm(r.it.card))}</b> <span class="muted small">${prose(r.it.timing_ko || "")}</span></div>
                  ${
                    r.by
                      ? `<div class="small ans">✓ ${esc(anyName(r.by.id))} — ${prose(r.by.note_ko || "")} ${rulingChips(r.by.rulings)}</div>`
                      : `<div class="small miss">✗ 처리할 카드 없음${(r.it.answered_by || []).length ? ` · 해결 카드: ${r.it.answered_by.map((a) => esc(anyName(a.id))).join(", ")}` : ""}</div>`
                  }
                  ${r.it.bait_ko ? `<div class="small muted">미끼: ${prose(r.it.bait_ko)}</div>` : ""}${rulingChips(r.it.rulings)}</div>
                </li>`
              )
              .join("")}</ul>
            ${heldBk.length ? `<h3>내 카드 평가</h3><div class="sumlist">${heldBk.map((id) => brk(id).map(({ m, r }) => `<div>${sevBadge(r.rating, anyName(id))} ${modTag(m, mods)}<span class="small">${prose(r.note_ko)}</span></div>`).join("")).join("")}</div>` : ""}
            ${gsMods.some((m) => m.d.going_second.sequencing_ko?.length) ? `<h3>권장 순서</h3>${gsMods.filter((m) => m.d.going_second.sequencing_ko?.length).map((m) => `${mods.length > 1 ? `<div class="small">${modTag(m, mods)}</div>` : ""}<ol class="small">${m.d.going_second.sequencing_ko.map((s) => `<li>${prose(s)}</li>`).join("")}</ol>`).join("")}` : ""}
            ${wish.length ? `<h3>이 덱 상대로 좋은 돌파 카드</h3><div class="sumlist">${wish.map(([id, { m, r }]) => `<div>${sevBadge(r.rating, anyName(id))} ${modTag(m, mods)}<span class="small">${prose(r.note_ko)}</span></div>`).join("")}</div>` : ""}
          </section>`;
        }
      }

      // C. 상대가 들고 있을 카드 (메인 테마 기준)
      const st = (t?.staples || []).filter((s) => s.rate >= 0.2).slice(0, 10);
      const stHTML = st.length
        ? `<section class="panel"><h2>상대가 들고 있을 카드 <span class="muted small">최근 30일 채용률</span></h2>
            <ul class="staples">${st
              .map((s) => `<li>${thumb(anyCard(s.id).card)}<span>${esc(anyName(s.id))}</span><span class="bar"><i style="width:${(s.rate * 100).toFixed(0)}%"></i></span><span class="muted small">${(s.rate * 100).toFixed(0)}% · ${s.avg}장</span></li>`)
              .join("")}</ul></section>`
        : "";

      const hereM = state.here && mods.find((m) => m.key === state.here.key);
      const hereLine = hereM && (hereM.d.lines || []).find((l) => l.id === state.here.line);
      const hereStep = hereLine?.steps[state.here.i];
      out.innerHTML = `
        <div class="play-title">${thumb(lead.d.cover, "pt-art lg")}<div><h2 style="margin:0">${mods.map((m) => esc(modName(m.d))).join(" <span class='muted'>+</span> ")}</h2>
          ${t ? `<a class="small" href="#/t/${t.slug}">전개 흐름 전체 보기 →</a>` : ""}</div></div>
        ${mixHTML}
        <section class="panel">
          <h2>${state.first ? "상대 턴(후공 2턴)에 던질 곳" : "상대 1턴에 던질 곳"}</h2>
          ${hereStep ? `<p class="small here-note">📍 지금 여기: ${esc(modName(hereM.d))} ${state.here.i + 1}단계 ${card(hereStep.card, { noEn: true })} — 이 단계부터 남은 타이밍만 보여 줍니다. <button type="button" class="chip sub" data-here-clear>해제</button></p>` : ""}
          ${state.first ? `<p class="small muted">상대가 후공으로 전개할 때도 같은 루트를 탑니다. 다만 내 필드가 있으면 포영(패)·후와로스·푸루리아·냐루스·감마 같은 '필드가 비어 있어야' 쓰는 카드는 못 씁니다.</p>` : ""}
          ${planHTML}
        </section>
        ${breakHTML}
        ${stHTML}`;
    }

    // 전개 스트립: 모듈마다 한 줄. 상대 전개를 일러스트로 늘어놓고, 내 패트랩을 던질 단계 바로 아래에 표시
    const blockedNote = (id) => {
      const setup = setupOf(id);
      if (!state.first && setup !== "hand") return setup === "set" ? "후공이면 상대 1턴엔 못 씀(미리 세트 필요)" : "후공이면 상대 1턴엔 못 씀(미리 필드에 필요)";
      if (state.first && NEEDS_EMPTY.has(id)) return "내 필드가 비어 있어야 함";
      return "";
    };
    function stripOf(m, mods, joins) {
      const held = heldHT();
      const line = lineOf(m);
      if (!line) return "";
      const lineScore = (l) => Object.values(m.cmap[l.id] || {}).flat().filter((c) => held.includes(c.handtrap) && c.severity !== "bad").length;
      const here = state.here && state.here.key === m.key && state.here.line === line.id ? state.here.i : -1;
      const cols = line.steps
        .map((s, i) => {
          const cps = (m.cmap[line.id][i] || [])
            .filter((c) => held.includes(c.handtrap))
            .sort((a, b) => (a.severity === "bad") - (b.severity === "bad") || sevRank(a.severity) - sevRank(b.severity) || a.rank - b.rank);
          const seen = new Set();
          const past = here >= 0 && i < here;
          const marks = past
            ? ""
            : cps
                .filter((c) => (seen.has(c.handtrap) ? false : seen.add(c.handtrap)))
                .map((c) => {
                  const warn = c.severity === "bad" ? "" : blockedNote(c.handtrap);
                  const tipText = `${htName(c.handtrap)} · ${c.severity === "bad" ? "쓰지 말 것" : SEV_KO[c.severity] + " (우선순위 " + c.rank + ")"}\n${stripBr(c.timing_ko || "")}\n\n${stripBr(c.why_ko)}`;
                  return `<div class="mk mk-${c.severity}${warn ? " mk-blocked" : ""}" data-tip="${esc(tipText)}">
                    ${thumb(HT[c.handtrap].card, "mk-art")}
                    <div class="mk-name">${c.severity === "bad" ? "✕ " : SEV_G[c.severity] + " "}${esc(htName(c.handtrap))}</div>
                    <div class="mk-time">${c.severity === "bad" ? "쓰지 말 것" : prose(c.timing_ko || "")}</div>
                    ${warn ? `<div class="mk-warn">⚠ ${esc(warn)}</div>` : ""}
                  </div>`;
                })
                .join("");
          const jm = (joins[`${m.key}|${line.id}|${i}`] || []).map((j) => `<div class="jn" data-tip="${esc(stripBr(j.note_ko || ""))}">${esc(j.txt)}</div>`).join("");
          const top = past ? null : cps.find((c) => c.severity !== "bad");
          return `<div class="sc${marks ? " has" : ""}${top ? " sc-" + top.severity : ""}${past ? " past" : ""}${i === here ? " now" : ""}">
            <button type="button" class="sc-card" data-card="${esc(s.card)}" data-here="${esc(`${m.key}|${line.id}|${i}`)}" aria-label="${esc(`${i + 1}단계: 지금 여기로 표시`)}">
              ${thumb(s.card, "sc-art")}<span class="sc-n">${i + 1}</span>${i === here ? `<span class="sc-here">지금</span>` : ""}
            </button>
            <div class="sc-act" title="${esc(stripBr(s.action_ko))}">${esc(nm(s.card))}</div>
            ${jm}
            ${marks}
          </div>`;
        })
        .join('<div class="sc-arrow" aria-hidden="true">›</div>');
      const ls = m.d.lines || [];
      const tabs = ls.length > 1
        ? `<div class="chips">${ls.map((l) => `<button type="button" class="chip sub" data-line="${esc(l.id)}" data-mod="${m.key}" aria-pressed="${l.id === line.id}">${l.mine ? "★ " : ""}${esc(stripBr(l.title_ko))}${held.length ? ` · ${lineScore(l)}` : ""}</button>`).join("")}</div>`
        : "";
      const restr = m.kind === "engine" && (m.d.restrictions || []).length
        ? `<p class="small restr">⛓ ${m.d.restrictions.map((r) => `${card(r.card, { noEn: true })}: ${prose(r.text_ko)}`).join(" · ")}</p>`
        : "";
      const link = m.kind === "theme" ? `<a class="small" href="#/t/${m.d.slug}?line=${encodeURIComponent(line.id)}">자세히 →</a>` : "";
      return `<section class="strip-wrap ${m.kind}">
        <div class="strip-head"><h2>${mods.length > 1 ? `<span class="mod-tag ${m.kind}">${m.kind === "engine" ? "엔진" : "메인"}</span>` : ""}${esc(modName(m.d))} 전개 <span class="muted small">${esc(stripBr(line.title_ko))}</span></h2>${link}</div>
        ${restr}
        ${tabs}
        <div class="strip">${cols}</div>
      </section>`;
    }
    function drawStrip() {
      const el = document.getElementById("strip");
      const mods = modules();
      if (!mods.length) { el.innerHTML = ""; return; }
      const joins = joinMarks(mods);
      const tip = heldHT().length
        ? `<p class="small muted strip-tip">카드 일러를 누르면 상대가 지금 그 단계라고 표시하고, 남은 타이밍만 보여 줍니다.</p>`
        : `<p class="small muted strip-tip">아래에서 들고 있는 패트랩을 고르면, 던질 단계 아래에 표시됩니다. 카드 일러를 누르면 '지금 여기'로 표시됩니다.</p>`;
      el.innerHTML = tip + mods.map((m) => stripOf(m, mods, joins)).join("");
    }

    const redraw = () => { sync(); drawSeg(); drawThemes(); drawEngines(); drawStrip(); drawHand(); drawOut(); };

    app.onclick = (e) => {
      const f = e.target.closest("[data-first]");
      const th = e.target.closest("[data-theme]");
      const en = e.target.closest("[data-engine]");
      const hc = e.target.closest("[data-card-id]");
      const bd = e.target.closest("[data-board]");
      const hr = e.target.closest("[data-here]");
      const ln = e.target.closest("#strip [data-line]");
      if (f) state.first = f.dataset.first === "1";
      else if (th) {
        const slug = th.dataset.theme;
        state.theme = state.theme === slug ? null : slug;
        state.board = null;
        state.here = null;
        Object.keys(state.lines).filter((k) => k.startsWith("t:")).forEach((k) => delete state.lines[k]);
      } else if (en) {
        const s = en.dataset.engine;
        state.engines.has(s) ? state.engines.delete(s) : state.engines.add(s);
        state.board = null;
        if (state.here?.key === "e:" + s) state.here = null;
      } else if (hc) {
        const id = hc.dataset.cardId;
        const set = state.editDeck ? state.deck : state.held;
        set.has(id) ? set.delete(id) : set.add(id);
        if (state.editDeck) store.set("play.deck", [...state.deck]);
      } else if (bd) state.board = bd.dataset.board;
      else if (hr) {
        const [key, line, i] = hr.dataset.here.split("|");
        state.here = state.here && state.here.key === key && state.here.line === line && state.here.i === +i ? null : { key, line, i: +i };
      } else if (e.target.closest("[data-here-clear]")) state.here = null;
      else if (ln) {
        state.lines[ln.dataset.mod] = ln.dataset.line;
        if (state.here?.key === ln.dataset.mod) state.here = null;
      } else if (e.target.closest("#deckEdit")) state.editDeck = !state.editDeck;
      else if (e.target.closest("#clearHand")) state.held.clear();
      else return;
      const y = hr ? hr.getBoundingClientRect().top : null;
      redraw();
      if ((th && state.theme) || (en && !state.theme && state.engines.size)) document.getElementById("strip").scrollIntoView({ behavior: "smooth", block: "start" });
      // 스트립 안에서 누른 경우 화면이 튀지 않게 같은 위치 유지
      if (hr && y !== null) {
        const again = document.querySelector(`[data-here="${CSS.escape(hr.dataset.here)}"]`);
        if (again) window.scrollBy(0, again.getBoundingClientRect().top - y);
      }
    };
    app.oninput = (e) => {
      if (e.target.id === "themeSearch") { state.q = e.target.value.trim(); drawThemes(); }
    };
    document.getElementById("themeSearch").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const first = D.themes.find((t) => themeMatches(t, state.q));
      if (first) { state.theme = first.slug; state.board = null; state.here = null; redraw(); }
    });
    redraw();
    window.scrollTo(0, 0);
  }

  /* ---------- 배우기: 외부 학습 자료 ---------- */
  const LT = { video: "영상", article: "글", combo: "콤보", decklist: "덱 리스트", ruling: "판정", tool: "도구", community: "커뮤니티", replay: "리플레이" };
  const LANG_KO = { ko: "한국어", ja: "日本語", en: "English" };
  const LTOPIC = { handtrap: "패트랩", going_second: "후공·돌파", rules: "룰·체인", deckbuilding: "덱 구축·확률", meta: "메타", replay: "리플레이", community: "커뮤니티" };
  const resItem = (r) => `<li class="res">
      <div class="res-h"><span class="pill">${esc(LT[r.type] || r.type || "")}</span><span class="pill">${esc(LANG_KO[r.lang] || r.lang || "")}</span>${r.level ? `<span class="pill">${esc(r.level)}</span>` : ""}
        <a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.title)}</b> ↗</a></div>
      <div class="small muted">${[r.author, r.date].filter(Boolean).map(esc).join(" · ")}</div>
      ${r.summary_ko ? `<p class="small">${prose(r.summary_ko)}</p>` : ""}${r.why_ko ? `<p class="small muted">→ ${prose(r.why_ko)}</p>` : ""}
    </li>`;
  function learnBlock(slug) {
    const L = D.learn;
    const items = L?.themes?.[slug] || [];
    const path = L?.study_path_ko?.[slug] || [];
    if (!items.length && !path.length) return "";
    return `<h2>배우기 <span class="muted small">외부 학습 자료 ${items.length}건</span></h2>
      ${path.length ? `<ol class="study">${path.map((x) => `<li>${prose(x)}</li>`).join("")}</ol>` : ""}
      <ul class="reslist">${items.map(resItem).join("")}</ul>
      <p class="small"><a href="#/l">전체 학습 자료 →</a></p>`;
  }
  function renderLearn(params) {
    app.onclick = null;
    app.oninput = null;
    const L = D.learn;
    if (!L) { app.innerHTML = `<h1>배우기</h1><p class="muted">학습 자료를 준비 중입니다.</p>`; return; }
    const pick = params.get("t") || "";
    const slugs = Object.keys(L.themes || {}).filter((s) => (L.themes[s] || []).length);
    const tname = (s) => D.themes.find((t) => t.slug === s)?.name.ko || s;
    const byTopic = {};
    (L.general || []).forEach((r) => (byTopic[r.topic || "etc"] = byTopic[r.topic || "etc"] || []).push(r));
    app.innerHTML = `
      <h1>배우기 <span class="en">외부 학습 자료 모음</span></h1>
      <p class="lede">직접 열어 확인한 공략·콤보 영상·판정 자료만 모았습니다. 테마별 추천 학습 순서도 있습니다. 갱신 ${esc(L.updated || "")}.</p>
      <div class="chips wrap" role="group" aria-label="테마">${slugs.map((s) => `<a class="chip sub" href="#/l?t=${s}" aria-pressed="${s === pick}">${esc(tname(s))} ${(L.themes[s] || []).length}</a>`).join("")}</div>
      ${(pick ? [pick] : slugs.filter((s) => L.study_path_ko?.[s]))
        .map((s) => `<section class="panel learn-theme"><h2>${esc(tname(s))} <a class="small" href="#/t/${s}">테마 페이지 →</a></h2>
          ${(L.study_path_ko?.[s] || []).length ? `<h3>추천 학습 순서</h3><ol class="study">${L.study_path_ko[s].map((x) => `<li>${prose(x)}</li>`).join("")}</ol>` : ""}
          <ul class="reslist">${(L.themes[s] || []).map(resItem).join("")}</ul></section>`)
        .join("")}
      <h2>공통 실력 늘리기</h2>
      ${Object.entries(byTopic).map(([k, rs]) => `<h3>${esc(LTOPIC[k] || k)}</h3><ul class="reslist">${rs.map(resItem).join("")}</ul>`).join("")}`;
    window.scrollTo(0, 0);
  }

  /* ---------- 공식 룰·판정 ---------- */
  const RULE_CAT = { chain: "체인", spell_speed: "스펠 스피드", timing: "타이밍·유발", cost: "코스트", negate: "무효", summon: "소환", opt: "1턴에 1번", damage_step: "데미지 스텝", misc: "기타" };
  const rulingTip = (q) => `공식 판정 ${q.id}\nQ. ${stripBr(q.question_ko)}\nA. ${stripBr(q.answer_ko)}`;
  // ids: 명시된 판정 id 목록. 같은 판정을 여러 번 그리지 않도록 호출하는 쪽에서 모아 넘긴다.
  const rulingChips = (ids) => {
    const list = [...new Set(ids || [])].map((id) => RQ[id]).filter(Boolean);
    if (!list.length) return "";
    return `<span class="rqs">${list
      .map((q) => `<a class="rq" href="${esc(q.url)}" target="_blank" rel="noopener" data-tip="${esc(rulingTip(q))}">📘 ${q.official === false ? "비공식" : "공식 판정"}</a>`)
      .join("")}</span>`;
  };
  const rulingsFor = ({ theme, handtrap, card } = {}) =>
    (D.rulings || []).filter(
      (q) => (!theme || (q.themes || []).includes(theme)) && (!handtrap || (q.handtraps || []).includes(handtrap)) && (!card || (q.cards || []).includes(card))
    );
  const rulingCard = (q) => `<article class="ruling" id="r-${esc(q.id)}">
      <div class="r-head">${(q.cards || []).slice(0, 3).map((c) => thumb(c)).join("")}
        <span class="pill">${esc(RULE_CAT[q.topic] || q.topic || "판정")}</span>
        ${q.official === false ? `<span class="pill">비공식</span>` : ""}
        <a class="small" href="${esc(q.url)}" target="_blank" rel="noopener">KONAMI Q&amp;A ${q.fid ? "#" + q.fid : ""} ↗</a></div>
      <p class="q"><b>Q.</b> ${prose(q.question_ko)}</p>
      <p class="a"><b>A.</b> ${prose(q.answer_ko)}</p>
      ${q.quote_ja ? `<p class="ja small muted">「${esc(q.quote_ja)}」</p>` : ""}
      ${q.impact_ko ? `<p class="small impact">→ ${prose(q.impact_ko)}</p>` : ""}
      ${(q.themes || []).length ? `<div class="small muted">관련 테마: ${q.themes.map((s) => { const t = D.themes.find((x) => x.slug === s); return t ? `<a href="#/t/${s}">${esc(t.name.ko)}</a>` : esc(s); }).join(" · ")}</div>` : ""}
    </article>`;

  function renderRules(params) {
    app.onclick = null;
    app.oninput = null;
    const state = { q: params.get("q") || "", tab: params.get("tab") || "rules", ht: params.get("ht") || "", theme: params.get("t") || "" };
    const srcLink = (s) => {
      const src = D.rule_sources?.[s.id];
      return src ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title)}</a>${s.locator ? ` <span class="muted">· ${esc(s.locator)}</span>` : ""}` : esc(s.id);
    };
    app.innerHTML = `
      <h1>룰·판정 <span class="en">공식 룰북 · KONAMI 공식 Q&amp;A</span></h1>
      <p class="lede">패트랩 실전에 필요한 체인·타이밍 규칙과 카드별 공식 판정을 모았습니다. 모든 항목에 출처 링크가 있습니다.
      마스터 듀얼은 OCG 판정(KONAMI 공식 Q&amp;A)을 따릅니다. 판정 원문은 일본어이고, 여기 적힌 건 한국어 요약입니다.</p>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-rtab="rules">기본 룰 (${(D.rules || []).length})</button>
        <button class="tab" role="tab" data-rtab="rulings">카드 판정 (${(D.rulings || []).length})</button>
      </div>
      <div class="play-top"><input id="ruleSearch" class="search" type="search" placeholder="검색 (예: 체인, 우라라, 코스트, 엘펜노츠)" autocomplete="off" value="${esc(state.q)}"></div>
      <div id="ruleFilters"></div>
      <div id="ruleOut"></div>`;

    const match = (txt) => !state.q || state.q.toLowerCase().split(/\s+/).every((w) => txt.toLowerCase().includes(w));
    const draw = () => {
      app.querySelectorAll("[data-rtab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.rtab === state.tab));
      const q = new URLSearchParams();
      if (state.tab !== "rules") q.set("tab", state.tab);
      if (state.q) q.set("q", state.q);
      if (state.ht) q.set("ht", state.ht);
      if (state.theme) q.set("t", state.theme);
      history.replaceState(null, "", "#/r" + (q.toString() ? "?" + q : ""));
      const out = document.getElementById("ruleOut");
      const filt = document.getElementById("ruleFilters");
      if (state.tab === "rules") {
        filt.innerHTML = "";
        const groups = {};
        (D.rules || [])
          .filter((r) => match([r.title_ko, r.body_ko, r.handtrap_ko, RULE_CAT[r.category]].join(" ")))
          .forEach((r) => (groups[r.category] = groups[r.category] || []).push(r));
        out.innerHTML =
          Object.keys(RULE_CAT)
            .filter((c) => groups[c])
            .map(
              (c) => `<h2>${esc(RULE_CAT[c])}</h2><div class="htlist">${groups[c]
                .map(
                  (r) => `<article class="ht" id="rule-${esc(r.id)}"><h3>${esc(r.title_ko)}</h3>
                    <p class="small">${prose(r.body_ko)}</p>
                    ${r.handtrap_ko ? `<p class="small impact">패트랩 실전: ${prose(r.handtrap_ko)}</p>` : ""}
                    <div class="small muted">출처: ${(r.sources || []).map(srcLink).join(" / ")}</div></article>`
                )
                .join("")}</div>`
            )
            .join("") || `<p class="muted">${D.rules?.length ? "검색 결과가 없습니다." : "데이터 준비 중입니다."}</p>`;
      } else {
        const hts = [...new Set((D.rulings || []).flatMap((q) => q.handtraps || []))].filter((id) => anyCard(id));
        filt.innerHTML = `<div class="chips">${['<button class="chip sub" data-rht="" aria-pressed="' + !state.ht + '">전체</button>', ...hts.map((id) => `<button class="chip sub" data-rht="${id}" aria-pressed="${state.ht === id}">${esc(anyName(id))}</button>`)].join("")}</div>
          <div class="chips"><button class="chip sub" data-rth="" aria-pressed="${!state.theme}">모든 테마</button>${D.themes
            .filter((t) => (D.rulings || []).some((q) => (q.themes || []).includes(t.slug)))
            .map((t) => `<button class="chip sub" data-rth="${t.slug}" aria-pressed="${state.theme === t.slug}">${esc(t.name.ko)}</button>`)
            .join("")}</div>`;
        const list = (D.rulings || []).filter(
          (q) =>
            (!state.ht || (q.handtraps || []).includes(state.ht)) &&
            (!state.theme || (q.themes || []).includes(state.theme)) &&
            match([q.question_ko, q.answer_ko, q.impact_ko, ...(q.cards || []), ...(q.cards || []).map((c) => ko(c) || ""), ...(q.handtraps || []).map(anyName)].join(" "))
        );
        out.innerHTML = list.length ? `<div class="htlist">${list.map(rulingCard).join("")}</div>` : `<p class="muted">${D.rulings?.length ? "검색 결과가 없습니다." : "데이터 준비 중입니다."}</p>`;
      }
    };
    app.onclick = (e) => {
      const t = e.target.closest("[data-rtab]"), h = e.target.closest("[data-rht]"), th = e.target.closest("[data-rth]");
      if (t) state.tab = t.dataset.rtab;
      else if (h) state.ht = h.dataset.rht;
      else if (th) state.theme = th.dataset.rth;
      else return;
      draw();
    };
    app.oninput = (e) => {
      if (e.target.id === "ruleSearch") { state.q = e.target.value.trim(); draw(); }
    };
    draw();
    window.scrollTo(0, 0);
  }

  /* ---------- handtrap dictionary ---------- */
  function renderHandtraps() {
    app.onclick = null;
    const themes = D.themes;
    const groups = KIND_ORDER.map((k) => {
      const hts = D.handtraps.filter((h) => h.kind === k);
      if (!hts.length) return "";
      return `<h2>${esc(D.kinds[k].ko)}</h2><p class="muted small">${esc(D.kinds[k].desc_ko)}</p><div class="htlist">${hts
        .map((h) => {
          const rated = themes
            .filter((t) => t.handtrap_summary[h.id])
            .sort((a, b) => sevRank(a.handtrap_summary[h.id].rating) - sevRank(b.handtrap_summary[h.id].rating));
          return `<div class="ht">
            <h3>${card(h.card)} <span class="muted small">· ${esc(h.short_ko)}</span></h3>
            <div class="small">${prose(h.note_ko)}</div>
            ${h.hits.length ? `<div class="small muted" style="margin-top:4px">대응: ${h.hits.map((c) => esc(D.effect_classes[c])).join(" · ")}</div>` : ""}
            ${(() => { const n = rulingsFor({ handtrap: h.id }).length; return n ? `<div class="small" style="margin-top:4px"><a href="#/r?tab=rulings&ht=${h.id}">📘 공식 판정 ${n}건 →</a></div>` : ""; })()}
            <div class="row">${rated
              .map((t) => {
                const r = t.handtrap_summary[h.id].rating;
                return `<a class="sev sev-${r}" data-g="${SEV_G[r]}" href="#/t/${t.slug}?ht=${h.id}" data-tip="${esc(stripBr(t.handtrap_summary[h.id].note_ko))}">${esc(t.name.ko)}</a>`;
              })
              .join("")}</div>
          </div>`;
        })
        .join("")}</div>`;
    }).join("");
    app.innerHTML = `<h1>패트랩 사전</h1><p class="lede">종류별로 묶었습니다. 아래 테마 칩은 그 패트랩의 테마별 평가 순서이고, 누르면 해당 테마의 패트랩 타이밍만 보여 줍니다.</p>${legend(false)}${groups}`;
    window.scrollTo(0, 0);
  }

  /* ---------- tooltip ---------- */
  function showTip(el, x, y) {
    let html = "";
    if (el.dataset.card) {
      const en = el.dataset.card;
      const c = D.cards[en] || {};
      const pic = img(en, "card");
      let head, body;
      if (MODE === "en") { head = esc(en); body = c.te || c.text; }
      else if (MODE === "ko") { head = esc(c.ko || en) + (c.ko ? "" : "\n(공식 한국어명 미확인)"); body = c.text || (c.te ? "(한국어 텍스트 미발매)\n" + c.te : ""); }
      else { head = `${esc(c.ko || en)}\n${esc(en)}${c.ko ? "" : "\n(공식 한국어명 미확인)"}`; body = c.text || (c.te ? "(한국어 텍스트 미발매)\n" + c.te : ""); }
      html = `${pic ? `<img class="tip-card" src="${pic}" alt="" width="120" height="175">` : ""}<div class="tip-body"><b>${head}</b>${body ? "\n\n" + esc(body) : ""}</div>`;
    } else if (el.dataset.tip) {
      html = esc(el.dataset.tip);
    }
    if (!html) return;
    tip.innerHTML = html;
    tip.classList.toggle("with-card", !!tip.querySelector(".tip-card"));
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(8, x + 12), vw - r.width - 8);
    let top = y + 16;
    if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 12);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  // 호버: 올리면 표시, 떠나면 숨김. 클릭: 고정 ↔ 해제 (링크·버튼은 원래 동작 유지)
  const TIP_SEL = "[data-card],[data-tip]";
  let pinned = null;
  let hovered = null;
  const hideTip = () => {
    tip.hidden = true;
    hovered = null;
  };
  const unpin = () => {
    if (pinned) pinned.classList.remove("tip-pinned");
    pinned = null;
    tip.classList.remove("pinned");
    hideTip();
  };
  document.addEventListener("mouseover", (e) => {
    if (pinned) return;
    const el = e.target.closest(TIP_SEL);
    if (el === hovered) return;
    if (el) {
      hovered = el;
      showTip(el, e.clientX, e.clientY);
    } else hideTip();
  });
  document.addEventListener("mouseout", (e) => {
    if (pinned || !hovered) return;
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(TIP_SEL) : null;
    if (to !== hovered && !(e.relatedTarget && hovered.contains(e.relatedTarget))) hideTip();
  });
  document.documentElement.addEventListener("mouseleave", () => { if (!pinned) hideTip(); });
  document.addEventListener("click", (e) => {
    const el = e.target.closest(TIP_SEL);
    const interactive = el && el.closest("a,button,input");
    if (el && !interactive) {
      if (pinned === el) return unpin();
      if (pinned) pinned.classList.remove("tip-pinned");
      pinned = el;
      el.classList.add("tip-pinned");
      tip.classList.add("pinned");
      const r = el.getBoundingClientRect();
      showTip(el, r.left, r.bottom);
      return;
    }
    if (pinned) unpin();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") unpin(); });
  document.addEventListener("focusin", (e) => {
    if (pinned) return;
    const el = e.target.closest(TIP_SEL);
    if (el && el.matches(":focus-visible")) {
      const r = el.getBoundingClientRect();
      showTip(el, r.left, r.bottom);
    }
  });
  document.addEventListener("focusout", () => { if (!pinned) hideTip(); });
  // 페이지·스트립 안쪽 스크롤 모두에서 닫기 (scroll 은 버블링되지 않아 capture 로 받음)
  document.addEventListener("scroll", () => (pinned ? unpin() : hideTip()), { passive: true, capture: true });

  /* ---------- 카드명 언어 (즉석 족보 전용) ---------- */
  const langBtn = document.getElementById("langToggle");
  const drawLang = () => langBtn.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === LANG));
  langBtn.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b || b.dataset.lang === LANG) return;
    LANG = b.dataset.lang;
    try { localStorage.setItem("lang", LANG); } catch (_) {}
    drawLang();
    route();
  });
  drawLang();

  /* ---------- theme toggle ---------- */
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("theme");
    if (saved) root.dataset.theme = saved;
  } catch (_) {}
  document.getElementById("themeToggle").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (_) {}
  });

  /* ---------- boot ---------- */
  fetch("data/site.json")
    .then((r) => r.json())
    .then((data) => {
      D = data;
      D.themes.sort((a, b) => (b.meta.share || 0) - (a.meta.share || 0));
      D.handtraps.forEach((h) => (HT[h.id] = h));
      (D.breakers || []).forEach((b) => (BK[b.id] = b));
      (D.rulings || []).forEach((q) => (RQ[q.id] = q));
      window.addEventListener("hashchange", route);
      route();
    })
    .catch((err) => {
      app.innerHTML = `<p>데이터를 불러오지 못했습니다: ${esc(err.message)}</p>`;
    });
})();
