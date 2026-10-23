/* 자겜의 족보 — data/site.json 을 읽어 그리는 정적 페이지 (빌드: scripts/build_docs.py) */
(() => {
  "use strict";

  const SEV = ["critical", "strong", "ok", "weak", "bad"];
  const SEV_KO = { critical: "치명", strong: "아픔", ok: "할만함", weak: "약함", bad: "비추" };
  const SEV_G = { critical: "●", strong: "▲", ok: "◆", weak: "○", bad: "✕" };
  const KIND_ORDER = ["search", "negate", "draw", "gy", "destroy", "dominus", "going2nd", "engine", "not_handtrap"];

  let D = null;
  let HT = {};
  let BK = {};
  let RQ = {};
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
      out += txt(str.slice(last, m.index)) + card(m[1], { noEn: true }) + (m[2] ? fixJosa(ko(m[1]) || m[1], m[2]) : "");
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
    if (path.startsWith("/p")) return renderPlay(params);
    if (path.startsWith("/r")) return renderRules(params);
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
  const stripBr = (s) => String(s || "").replace(JOSA_RE, (_, n, j) => (ko(n) || n) + (j ? fixJosa(ko(n) || n, j) : ""));

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

      ${(() => {
        const rs = rulingsFor({ theme: t.slug });
        return rs.length
          ? `<h2>관련 공식 판정 <span class="muted small">${rs.length}건</span></h2><div class="htlist">${rs.slice(0, 6).map(rulingCard).join("")}</div>${rs.length > 6 ? `<p><a href="#/r?tab=rulings&t=${t.slug}">판정 ${rs.length}건 모두 보기 →</a></p>` : ""}`
          : "";
      })()}
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
                <p>${sevBadge(c.severity)} <b>${esc(htName(c.handtrap))}</b> <span class="muted small">혈자리 ${c.rank}순위${c.inferred ? " · 대상 카드 기준 배치" : ""}</span> ${rulingChips(c.rulings)}</p>
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
  const anyName = (id) => (anyCard(id) ? anyCard(id).short_ko : id);
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
    const state = {
      first: params.get("s") === "1" ? true : params.get("s") === "2" ? false : store.get("play.first", false),
      theme: params.get("t") || null,
      held: new Set((params.get("h") || "").split(",").filter((x) => anyCard(x))),
      board: params.get("b") || null,
      q: "",
      editDeck: false,
      deck: new Set(store.get("play.deck", [])),
    };

    app.onclick = null;
    app.oninput = null;
    app.innerHTML = `
      <h1>즉석 족보 <span class="en">플레이 중 바로 보기</span></h1>
      <div class="play-top">
        <div class="seg" role="group" aria-label="선공 후공">
          <button type="button" data-first="1">선공</button>
          <button type="button" data-first="0">후공</button>
        </div>
        <input id="themeSearch" class="search" type="search" placeholder="상대 테마 검색 (한글·영문·카드명)" autocomplete="off">
      </div>
      <div id="themePick" class="pick"></div>
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

    const sync = () => {
      const q = new URLSearchParams();
      q.set("s", state.first ? "1" : "2");
      if (state.theme) q.set("t", state.theme);
      if (state.held.size) q.set("h", [...state.held].join(","));
      if (state.board) q.set("b", state.board);
      history.replaceState(null, "", "#/p?" + q);
      store.set("play.first", state.first);
    };

    const themeMatches = (t, q) => {
      if (!q) return true;
      const hay = [t.name.ko, t.name.en, t.slug, ...(t.variants || []), ...(t.key_cards || []).flatMap((k) => [k.card, ko(k.card) || ""])].join(" ").toLowerCase();
      return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
    };

    function drawSeg() {
      app.querySelectorAll("[data-first]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.first === "1") === String(state.first)));
    }

    function drawThemes() {
      const list = D.themes.filter((t) => themeMatches(t, state.q));
      document.getElementById("themePick").innerHTML = list.length
        ? list
            .map((t) => `<button type="button" class="ptheme${state.theme === t.slug ? " on" : ""}" data-theme="${t.slug}">
              ${thumb(t.cover, "pt-art")}<span><b>${esc(t.name.ko)}</b><span class="en">${esc(t.name.en)}</span></span></button>`)
            .join("")
        : `<p class="muted small">검색 결과가 없습니다.</p>`;
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
                ${thumb(c.card)}<span>${esc(c.short_ko)}</span></button>`;
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

    function drawOut() {
      const out = document.getElementById("playOut");
      const t = D.themes.find((x) => x.slug === state.theme);
      if (!t) {
        out.innerHTML = `<p class="empty-hint">상대 테마를 고르면 족보가 나옵니다.</p>`;
        return;
      }
      const cmap = chokeMap(t);
      const held = state.held;
      const heldHT = [...held].filter((id) => HT[id] && HT[id].kind !== "not_handtrap");

      // A. 상대 턴: 패트랩 던질 곳
      const plans = heldHT
        .map((id) => {
          const cps = t.chokepoints.map((c, i) => ({ ...c, rank: i + 1 })).filter((c) => c.handtrap === id);
          const good = cps.filter((c) => c.severity !== "bad").sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.rank - b.rank);
          const bad = cps.filter((c) => c.severity === "bad");
          const sum = t.handtrap_summary[id];
          const best = good[0];
          const blocked = state.first && NEEDS_EMPTY.has(id);
          return { id, best, more: good.slice(1, 3), bad, sum, blocked, sev: best ? best.severity : sum ? sum.rating : "weak" };
        })
        .sort((a, b) => a.blocked - b.blocked || sevRank(a.sev) - sevRank(b.sev) || (a.best?.rank || 99) - (b.best?.rank || 99));

      const stepOf = (c) => {
        const line = t.lines.find((l) => l.id === c.line);
        if (line && c.step) return { line, s: line.steps[c.step - 1], i: c.step - 1 };
        for (const l of t.lines) {
          const i = l.steps.findIndex((s) => s.card === c.target_card);
          if (i >= 0) return { line: l, s: l.steps[i], i };
        }
        return null;
      };
      const planHTML = plans.length
        ? `<ol class="plan">${plans
            .map((p, n) => {
              const c = p.best;
              const where = c ? stepOf(c) : null;
              return `<li class="pl sevb-${p.sev}${p.blocked ? " blocked" : ""}">
                <div class="pl-head"><span class="pl-n">${n + 1}</span>${thumb(HT[p.id].card)}<b>${esc(HT[p.id].short_ko)}</b>${sevBadge(p.sev)}</div>
                ${p.blocked ? `<p class="pl-bad small">⚠ 내 필드에 ${p.id === "gamma" ? "몬스터" : "카드"}가 있으면 쓸 수 없음${p.id === "imperm" ? " (패에서 발동 불가 — 세트해 두었다면 가능)" : ""}</p>` : ""}
                ${
                  c
                    ? `<div class="pl-body">
                        ${where ? `<div class="pl-target">${thumb(where.s.card, "tgt")}<div><div>${card(c.target_card || where.s.card, { noEn: true })}</div><div class="muted small">${esc(where.line.title_ko)} · ${where.i + 1}단계</div></div></div>` : ""}
                        ${c.timing_ko ? `<p><span class="lbl">타이밍</span>${prose(c.timing_ko)}</p>` : ""}
                        <p class="small">${prose(c.why_ko)} ${rulingChips([...(c.rulings || []), ...rulingsFor({ theme: t.slug, handtrap: p.id }).map((q) => q.id)])}</p>
                        ${p.more.length ? `<p class="small muted">다른 지점: ${p.more.map((m) => `${SEV_G[m.severity]} ${esc(ko(m.target_card) || m.target_card || "")}`).join(" · ")}</p>` : ""}
                      </div>`
                    : `<div class="pl-body"><p class="small">${p.sum ? prose(p.sum.note_ko) : "이 테마 상대로 정리된 사용 지점이 없습니다."}</p></div>`
                }
                ${p.bad.length ? `<p class="pl-bad small">✕ 쓰지 말 것: ${p.bad.map((b) => prose(b.why_ko)).join(" / ")}</p>` : ""}
              </li>`;
            })
            .join("")}</ol>`
        : `<p class="muted small">위에서 들고 있는 패트랩을 고르면 던질 순서가 나옵니다. 이 테마 기준 혈자리 1~3순위:</p>
           <ol class="plan compact">${t.chokepoints
             .filter((c) => c.severity !== "bad")
             .slice(0, 3)
             .map((c) => `<li>${sevBadge(c.severity, htName(c.handtrap))} → ${card(c.target_card, { noEn: true })} <span class="muted small">${prose(c.timing_ko || "")}</span></li>`)
             .join("")}</ol>`;

      // B. 후공 돌파
      let breakHTML = "";
      const gs = t.going_second;
      if (!state.first) {
        if (!gs) {
          breakHTML = `<section class="panel"><h2>돌파 가능성</h2><p class="muted">이 테마의 후공 데이터는 준비 중입니다.</p></section>`;
        } else {
          const boards = gs.boards || [];
          let bid = state.board && boards.some((b) => b.id === state.board) ? state.board : boards[0]?.id;
          const board = boards.find((b) => b.id === bid);
          const res = board ? solveBoard(board, held) : [];
          const v = verdict(res);
          const heldBk = [...held].filter((id) => gs.breakers?.[id]);
          const wish = Object.entries(gs.breakers || {})
            .filter(([id, r]) => !held.has(id) && (r.rating === "critical" || r.rating === "strong") && anyCard(id))
            .sort((a, b) => sevRank(a[1].rating) - sevRank(b[1].rating))
            .slice(0, 6);
          breakHTML = `<section class="panel break">
            <h2>돌파 가능성 <span class="muted small">후공 · ${esc({ hard: "풀 보드 난이도 높음", medium: "풀 보드 난이도 보통", easy: "풀 보드 난이도 낮음" }[gs.difficulty] || "")}</span></h2>
            <p class="small">${prose(gs.summary_ko)}</p>
            <div class="chips" role="group" aria-label="상대 보드">${boards
              .map((b) => `<button type="button" class="chip sub" data-board="${b.id}" aria-pressed="${b.id === bid}">${esc(stripBr(b.title_ko))}</button>`)
              .join("")}</div>
            <div class="verdict v-${v.cls}"><b>${v.label}</b><span>${esc(v.text)}<br><span class="muted small">카드 1장 = 견제 1개로 센 단순 판정입니다. 상대 무효가 내 돌파 카드를 먼저 막을 수 있으니 '미끼'와 권장 순서를 함께 보세요.</span></span>
              <span class="meter" aria-hidden="true">${res.map((r) => `<i class="${r.by ? "ok" : ""}"></i>`).join("")}</span></div>
            <ul class="ints">${res
              .map(
                (r) => `<li class="${r.by ? "solved" : "open"}">
                  ${thumb(r.it.card, "tgt")}
                  <div><div><b>${esc(ko(r.it.card) || r.it.card)}</b> <span class="muted small">${prose(r.it.timing_ko || "")}</span></div>
                  ${
                    r.by
                      ? `<div class="small ans">✓ ${esc(anyName(r.by.id))} — ${prose(r.by.note_ko || "")} ${rulingChips(r.by.rulings)}</div>`
                      : `<div class="small miss">✗ 처리할 카드 없음${(r.it.answered_by || []).length ? ` · 해결 카드: ${r.it.answered_by.map((a) => esc(anyName(a.id))).join(", ")}` : ""}</div>`
                  }
                  ${r.it.bait_ko ? `<div class="small muted">미끼: ${prose(r.it.bait_ko)}</div>` : ""}${rulingChips(r.it.rulings)}</div>
                </li>`
              )
              .join("")}</ul>
            ${heldBk.length ? `<h3>내 카드 평가</h3><div class="sumlist">${heldBk.map((id) => `<div>${sevBadge(gs.breakers[id].rating, anyName(id))} <span class="small">${prose(gs.breakers[id].note_ko)}</span></div>`).join("")}</div>` : ""}
            ${gs.sequencing_ko?.length ? `<h3>권장 순서</h3><ol class="small">${gs.sequencing_ko.map((s) => `<li>${prose(s)}</li>`).join("")}</ol>` : ""}
            ${wish.length ? `<h3>이 덱 상대로 좋은 돌파 카드</h3><div class="sumlist">${wish.map(([id, r]) => `<div>${sevBadge(r.rating, anyName(id))} <span class="small">${prose(r.note_ko)}</span></div>`).join("")}</div>` : ""}
          </section>`;
        }
      }

      // C. 상대가 들고 있을 카드
      const st = (t.staples || []).filter((s) => s.rate >= 0.2).slice(0, 10);
      const stHTML = st.length
        ? `<section class="panel"><h2>상대가 들고 있을 카드 <span class="muted small">최근 30일 채용률</span></h2>
            <ul class="staples">${st
              .map((s) => `<li>${thumb(anyCard(s.id).card)}<span>${esc(anyName(s.id))}</span><span class="bar"><i style="width:${(s.rate * 100).toFixed(0)}%"></i></span><span class="muted small">${(s.rate * 100).toFixed(0)}% · ${s.avg}장</span></li>`)
              .join("")}</ul></section>`
        : "";

      out.innerHTML = `
        <div class="play-title">${thumb(t.cover, "pt-art lg")}<div><h2 style="margin:0">${esc(t.name.ko)} <span class="en">${esc(t.name.en)}</span></h2>
          <a class="small" href="#/t/${t.slug}">전개 흐름 전체 보기 →</a></div></div>
        <section class="panel">
          <h2>${state.first ? "상대 턴(후공 2턴)에 던질 곳" : "상대 1턴에 던질 곳"}</h2>
          ${state.first ? `<p class="small muted">상대가 후공으로 전개할 때도 같은 루트를 탑니다. 다만 내 필드가 있으면 포영(패)·후와로스·푸루리아·냐루스·감마 같은 '필드가 비어 있어야' 쓰는 카드는 못 씁니다.</p>` : ""}
          ${planHTML}
        </section>
        ${breakHTML}
        ${stHTML}`;
    }

    const redraw = () => { sync(); drawSeg(); drawThemes(); drawHand(); drawOut(); };

    app.onclick = (e) => {
      const f = e.target.closest("[data-first]");
      const th = e.target.closest("[data-theme]");
      const hc = e.target.closest("[data-card-id]");
      const bd = e.target.closest("[data-board]");
      if (f) state.first = f.dataset.first === "1";
      else if (th) { state.theme = state.theme === th.dataset.theme ? null : th.dataset.theme; state.board = null; }
      else if (hc) {
        const id = hc.dataset.cardId;
        const set = state.editDeck ? state.deck : state.held;
        set.has(id) ? set.delete(id) : set.add(id);
        if (state.editDeck) store.set("play.deck", [...state.deck]);
      } else if (bd) state.board = bd.dataset.board;
      else if (e.target.closest("#deckEdit")) state.editDeck = !state.editDeck;
      else if (e.target.closest("#clearHand")) state.held.clear();
      else return;
      redraw();
      if (th && state.theme) document.getElementById("playOut").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    app.oninput = (e) => {
      if (e.target.id === "themeSearch") { state.q = e.target.value.trim(); drawThemes(); }
    };
    document.getElementById("themeSearch").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const first = D.themes.find((t) => themeMatches(t, state.q));
      if (first) { state.theme = first.slug; state.board = null; redraw(); }
    });
    redraw();
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
    app.innerHTML = `<h1>패트랩 사전</h1><p class="lede">종류별로 묶었습니다. 아래 테마 칩은 그 패트랩의 테마별 평가 순서이고, 누르면 해당 테마의 혈자리만 보여 줍니다.</p>${legend(false)}${groups}`;
    window.scrollTo(0, 0);
  }

  /* ---------- tooltip ---------- */
  function showTip(el, x, y) {
    let html = "";
    if (el.dataset.card) {
      const en = el.dataset.card;
      const c = D.cards[en] || {};
      const pic = img(en, "card");
      html = `${pic ? `<img class="tip-card" src="${pic}" alt="" width="120" height="175">` : ""}<div class="tip-body"><b>${esc(c.ko || en)}</b>\n${esc(en)}${c.text ? "\n\n" + esc(c.text) : ""}</div>`;
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
      (D.breakers || []).forEach((b) => (BK[b.id] = b));
      (D.rulings || []).forEach((q) => (RQ[q.id] = q));
      window.addEventListener("hashchange", route);
      route();
    })
    .catch((err) => {
      app.innerHTML = `<p>데이터를 불러오지 못했습니다: ${esc(err.message)}</p>`;
    });
})();
