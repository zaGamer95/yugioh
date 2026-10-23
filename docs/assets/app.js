/* 자겜의 족보 — data/site.json 을 읽어 그리는 정적 페이지 (빌드: scripts/build_docs.py) */
(() => {
  "use strict";

  const SEV = ["critical", "strong", "ok", "weak", "bad"];
  const SEV_KO = { critical: "치명", strong: "아픔", ok: "할만함", weak: "약함", bad: "비추" };
  const SEV_G = { critical: "●", strong: "▲", ok: "◆", weak: "○", bad: "✕" };
  const KIND_ORDER = ["search", "negate", "draw", "gy", "destroy", "dominus", "going2nd"];

  let D = null;
  let HT = {};
  const app = document.getElementById("app");
  const tip = document.getElementById("tip");

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ko = (en) => (D.cards[en] && D.cards[en].ko) || null;
  const card = (en, opts = {}) => {
    const k = ko(en);
    const label = k ? `<b>${esc(k)}</b>${opts.noEn ? "" : ` <span class="en">${esc(en)}</span>`}` : `<b>${esc(en)}</b>`;
    return `<span class="card" tabindex="0" data-card="${esc(en)}">${label}</span>`;
  };
  const prose = (s) =>
    String(s ?? "")
      .split(/\[\[([^\]]+)\]\]/)
      .map((part, i) => (i % 2 ? card(part, { noEn: true }) : esc(part).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")))
      .join("");
  const sevBadge = (sev, text) => `<span class="sev sev-${sev}" data-g="${SEV_G[sev]}">${esc(text || SEV_KO[sev])}</span>`;
  const sevRank = (s) => (SEV.indexOf(s) < 0 ? 99 : SEV.indexOf(s));
  const htName = (id) => (HT[id] ? HT[id].short_ko : id);

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
    const m = path.match(/^\/t\/([\w-]+)/);
    if (m) return renderTheme(m[1], params);
    if (path.startsWith("/h")) return renderHandtraps();
    renderHome();
  }

  /* ---------- home ---------- */
  function renderHome() {
    const themes = [...D.themes];
    const maxShare = Math.max(...themes.map((t) => t.meta.share || 0));
    const tcards = themes
      .map((t) => {
        const top = t.chokepoints.filter((c) => c.severity === "critical").slice(0, 3);
        return `<a class="tcard" href="#/t/${t.slug}">
          <h3>${esc(t.name.ko)} <span class="en">${esc(t.name.en)}</span></h3>
          <div class="share"><span class="bar"><i style="width:${((t.meta.share / maxShare) * 100).toFixed(1)}%"></i></span>${(t.meta.share * 100).toFixed(1)}% · ${t.meta.decks}덱</div>
          <ul>${top.map((c) => `<li>${sevBadge("critical", htName(c.handtrap))}<span>→ ${esc(ko(c.target_card) || c.target_card || "")}</span></li>`).join("")}</ul>
        </a>`;
      })
      .join("");

    app.innerHTML = `
      <h1>자겜의 족보 <span class="en">마스터 듀얼 혈자리 노트</span></h1>
      <p class="lede">메타 테마별 1턴 전개를 단계별로 펼치고, 각 단계에서 어떤 패트랩이 맞는지와 어디가 <b>치명적인 위치(혈자리)</b>인지 표시했습니다.
      카드명은 모두 인게임 검색에 그대로 쓸 수 있는 <b>공식 한국어명</b>입니다. 집계 기간: ${esc(D.themes[0]?.meta.window || "")}.</p>
      <div class="theme-grid">${tcards}</div>

      <h2>패트랩 × 테마 상성표</h2>
      <p class="muted small">칸을 누르면 그 테마 페이지에서 해당 패트랩만 걸러 보여 줍니다. 마우스를 올리면 사용 지점이 나옵니다.</p>
      ${legend(false)}
      <div class="scroll-x">${homeHeat(themes)}</div>`;
  }

  function legend(withHit) {
    const items = SEV.map((s) => `<span><span class="sw cell c-${s}" style="display:inline-block;min-width:0;width:14px;height:14px"></span>${SEV_G[s]} ${SEV_KO[s]}</span>`);
    if (withHit) items.push(`<span><span class="sw" style="background:var(--hit)"></span>대응 가능(혈자리 아님)</span>`);
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
  const stripBr = (s) => String(s || "").replace(/\[\[([^\]]+)\]\]/g, (_, n) => ko(n) || n);

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

      <div class="filters">
        <div class="chips" id="kindChips" role="group" aria-label="패트랩 종류"></div>
        <div class="chips" id="htChips" role="group" aria-label="패트랩"></div>
      </div>

      <div class="tabs" role="tablist" id="lineTabs">${t.lines
        .map((l) => `<button class="tab" role="tab" data-line="${esc(l.id)}">${esc(l.title_ko)}</button>`)
        .join("")}</div>

      <h2 style="margin-top:0">혈자리 지도 <span class="muted small">패트랩 × 전개 단계</span></h2>
      ${legend(true)}
      <div class="scroll-x" id="grid"></div>

      <div class="cols" style="margin-top:20px">
        <section><h2 style="margin-top:0">전개 흐름</h2><div id="flow"></div></section>
        <aside class="panel"><h2 style="margin-top:0">패트랩 상성 요약</h2><div class="summary" id="summary"></div></aside>
      </div>

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
                    tipText = `${h.short_ko} · ${SEV_KO[w.severity]} (혈자리 ${w.rank}순위)\n${head}\n${stripBr(w.why_ko)}`;
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
                <p>${sevBadge(c.severity)} <b>${esc(htName(c.handtrap))}</b> <span class="muted small">혈자리 ${c.rank}순위${c.inferred ? " · 대상 카드 기준 배치" : ""}</span></p>
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
        .map(([id, s]) => `<div class="sumrow ${act.has(id) ? "" : "dim"}"><div><div class="nm">${esc(htName(id))}</div>${sevBadge(s.rating)}</div><div>${prose(s.note_ko)}</div></div>`)
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
    app.innerHTML = `<h1>패트랩 사전</h1><p class="lede">종류별로 묶었습니다. 아래 테마 칩은 그 패트랩의 테마별 평가 순서이고, 누르면 해당 테마의 혈자리만 보여 줍니다.</p>${legend(false)}${groups}`;
    window.scrollTo(0, 0);
  }

  /* ---------- tooltip ---------- */
  function showTip(el, x, y) {
    let html = "";
    if (el.dataset.card) {
      const en = el.dataset.card;
      const c = D.cards[en] || {};
      html = `<b>${esc(c.ko || en)}</b>\n${esc(en)}${c.text ? "\n\n" + esc(c.text) : ""}`;
    } else if (el.dataset.tip) {
      html = esc(el.dataset.tip);
    }
    if (!html) return;
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(8, x + 12), vw - r.width - 8);
    let top = y + 16;
    if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 12);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  const hideTip = () => (tip.hidden = true);
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-card],[data-tip]");
    if (el) showTip(el, e.clientX, e.clientY);
    else hideTip();
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-card],[data-tip]");
    if (el) {
      const r = el.getBoundingClientRect();
      showTip(el, r.left, r.bottom);
    }
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("scroll", hideTip, { passive: true });
  document.addEventListener("touchstart", (e) => {
    const el = e.target.closest("[data-card]");
    if (el) {
      const r = el.getBoundingClientRect();
      showTip(el, r.left, r.bottom);
    } else hideTip();
  }, { passive: true });

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
      window.addEventListener("hashchange", route);
      route();
    })
    .catch((err) => {
      app.innerHTML = `<p>데이터를 불러오지 못했습니다: ${esc(err.message)}</p>`;
    });
})();
