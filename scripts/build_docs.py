#!/usr/bin/env python3
"""data/themes/*.json 을 사람이 읽는 Markdown(docs/)으로 만든다.

카드는 데이터에 영문 공식명으로만 적고, 여기서 data/cards/cards.json 을 보고
'공식 한국어명 (English)' 형태로 바꿔 쓴다. 한국어명이 없는 카드는 ⚠ 표시.
각 전개 단계의 effect class 로 '대응 가능한 패트랩'을 자동으로 채운다.

Usage: python3 scripts/build_docs.py [--check]
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEVERITY = {
    "critical": "🔴 치명",
    "strong": "🟠 아픔",
    "ok": "🟡 할만함",
    "weak": "⚪ 약함",
    "bad": "⛔ 비추",
}
SEVERITY_ORDER = list(SEVERITY)


def load_json(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))


class Names:
    def __init__(self):
        p = ROOT / "data/cards/cards.json"
        cards = load_json(p) if p.exists() else {}
        self.by_en = {c["en"]: c for c in cards.values()}
        self.missing = set()

    def ko(self, en):
        c = self.by_en.get(en)
        if not c or not c.get("ko"):
            self.missing.add(en)
            return None
        # M∀LICE<P>Dormouse 처럼 꺾쇠가 든 이름이 HTML 태그로 먹히지 않게
        return c["ko"].replace("<", "&lt;").replace(">", "&gt;")

    def __call__(self, en):
        ko = self.ko(en)
        return f"**{ko}** ({en})" if ko else f"**{en}** ⚠"

    def plain(self, en):
        ko = self.ko(en)
        return f"{ko} ({en})" if ko else f"{en} ⚠"


JOSA = {"을": "을를", "를": "을를", "이": "이가", "가": "이가", "은": "은는", "는": "은는", "과": "과와", "와": "과와"}


def fix_josa(word, j):
    """공식 한국어명 받침에 맞춰 조사를 고른다. 영문으로 끝나면 그대로."""
    ch = word.strip()[-1:] if word else ""
    code = ord(ch) - 0xAC00 if ch else -1
    if not 0 <= code <= 11171:
        return j
    final = code % 28
    if j in ("으로", "로"):
        return "로" if final in (0, 8) else "으로"
    pair = JOSA.get(j)
    return (pair[0] if final else pair[1]) if pair else j


def link_names(obj, names):
    """설명문 안의 [[English Name]] 을 '한국어명 (English)' 으로 바꾸고 뒤 조사를 맞춘다."""
    if isinstance(obj, str):
        def sub(m):
            en, j = m.group(1), m.group(2) or ""
            return names.plain(en) + (fix_josa(names.ko(en) or en, j) if j else "")
        return re.sub(r"\[\[([^\]]+)\]\](으로|을|를|이|가|은|는|과|와|로)?", sub, obj)
    if isinstance(obj, list):
        return [link_names(x, names) for x in obj]
    if isinstance(obj, dict):
        return {k: link_names(v, names) for k, v in obj.items()}
    return obj


def build_theme(t, names, ht, classes):
    t = link_names(t, names)
    ht_by_id = {h["id"]: h for h in ht}
    out = []
    title_ko = t["name"].get("ko") or t["name"]["en"]
    out.append(f"# {title_ko} ({t['name']['en']})\n")
    meta = t.get("meta", {})
    status = {"draft": "초안 · 검증 필요", "reviewed": "검토 완료"}.get(t.get("status"), t.get("status", ""))
    out.append(
        f"> 상태: {status} · 갱신: {t.get('updated', '')} · "
        f"메타 점유율: {meta.get('share', 0) * 100:.1f}% ({meta.get('decks', 0)}덱, {meta.get('window', '')})\n"
    )
    if t.get("variants"):
        out.append(f"> 포함 변형: {', '.join(t['variants'])}\n")

    out.append("## 한눈에 보기\n")
    out.append(t.get("overview_ko", "").strip() + "\n")

    if t.get("handtrap_summary"):
        out.append("### 패트랩 상성 요약\n")
        out.append("| 패트랩 | 평가 | 언제 / 어디에 |")
        out.append("|---|---|---|")
        rows = sorted(t["handtrap_summary"].items(), key=lambda kv: SEVERITY_ORDER.index(kv[1]["rating"]))
        for hid, s in rows:
            h = ht_by_id.get(hid)
            label = names.plain(h["card"]) if h else hid
            out.append(f"| {label} | {SEVERITY[s['rating']]} | {s.get('note_ko', '')} |")
        out.append("")

    if t.get("chokepoints"):
        out.append("## 패트랩 타이밍 (우선순위 순)\n")
        for i, c in enumerate(t["chokepoints"], 1):
            h = ht_by_id.get(c["handtrap"])
            hname = names(h["card"]) if h else c["handtrap"]
            target = names(c["target_card"]) if c.get("target_card") else ""
            where = f" — {c['line']} {c['step']}단계" if c.get("line") and c.get("step") else ""
            out.append(f"{i}. {SEVERITY[c['severity']]} {hname} → {target}{where}")
            if c.get("timing_ko"):
                out.append(f"   - 타이밍: {c['timing_ko']}")
            out.append(f"   - 이유: {c['why_ko']}")
            if c.get("fallback_ko"):
                out.append(f"   - 맞은 뒤 상대 루트: {c['fallback_ko']}")
        out.append("")

    if t.get("key_cards"):
        out.append("## 핵심 카드\n")
        out.append("| 카드 | 역할 |")
        out.append("|---|---|")
        for k in t["key_cards"]:
            out.append(f"| {names.plain(k['card'])} | {k['role_ko']} |")
        out.append("")

    for line in t.get("lines", []):
        out.append(f"## 전개: {line['title_ko']} (`{line['id']}`)\n")
        if line.get("hand"):
            out.append("초동 패: " + " + ".join(names(c) for c in line["hand"]) + "\n")
        if line.get("note_ko"):
            out.append(line["note_ko"].strip() + "\n")
        out.append("| # | 카드 | 행동 | 결과 | 대응 가능한 패트랩 |")
        out.append("|---|---|---|---|---|")
        for n, s in enumerate(line["steps"], 1):
            hit = [h["short_ko"] for h in ht if set(h["hits"]) & set(s.get("class", []))]
            hit_text = ", ".join(hit) if hit else "–"
            out.append(
                f"| {n} | {names.plain(s['card'])} | {s['action_ko']} | {s.get('result_ko', '')} | {hit_text} |"
            )
        out.append("")
        if line.get("end_board"):
            out.append("**최종 필드 / 견제**: " + ", ".join(names.plain(c) for c in line["end_board"]))
            if line.get("end_board_note_ko"):
                out.append(f"\n{line['end_board_note_ko']}")
            out.append("")

    if t.get("notes_ko"):
        out.append("## 주의할 점\n")
        out.extend(f"- {n}" for n in t["notes_ko"])
        out.append("")

    if t.get("sources"):
        out.append("## 출처\n")
        out.extend(f"- {s}" for s in t["sources"])
        out.append("")

    return "\n".join(out)


def build_handtraps(ht, classes, names):
    out = ["# 패트랩 / 견제 카드 사전\n", "| 카드 | 줄임말 | 대응하는 효과 | 메모 |", "|---|---|---|---|"]
    for h in ht:
        hits = ", ".join(classes[c] for c in h["hits"])
        out.append(f"| {names.plain(h['card'])} | {h['short_ko']} | {hits} | {h.get('note_ko', '')} |")
    return "\n".join(out) + "\n"


def attach_decklists(themes, engines):
    """개요의 '예시 덱' 영역: MDM 상위 덱 집계(변형 deckType 합산)에서 핵심·선택 카드, 엔진, 대표 덱 리스트."""
    meta_p = ROOT / "data/meta/latest.json"
    if not meta_p.exists():
        return
    meta = load_json(meta_p)
    eng_by_mdm = {n: e["slug"] for e in engines for n in e.get("mdm_names", [])}
    for t in themes:
        rows = [(v, meta["themes"][v]) for v in t.get("variants", []) if v in meta["themes"]]
        total = sum(r["decks"] for _, r in rows)
        if not total:
            t["decklist"] = {"decks": 0, "window": meta.get("window")}
            continue

        def agg(part):
            acc = {}
            for _, r in rows:
                for c in r[part]:
                    a = acc.setdefault(c["name"], [0.0, 0.0])
                    a[0] += c["rate"] * r["decks"]
                    a[1] += c["rate"] * r["decks"] * c["avg"]
            return sorted(
                ({"card": n, "rate": round(v[0] / total, 3), "avg": round(v[1] / v[0], 2)} for n, v in acc.items() if v[0]),
                key=lambda x: (-x["rate"], -x["avg"]),
            )

        main, extra = agg("main"), agg("extra")
        eng = {}
        for _, r in rows:
            for x in r.get("engines", []):
                eng[x["name"]] = eng.get(x["name"], 0) + x["rate"] * r["decks"]
        samples = [dict(d, variant=v) for v, r in rows for d in r.get("samples", [])]
        samples.sort(key=lambda d: -next(r["decks"] for v, r in rows if v == d["variant"]))
        t["decklist"] = {
            "decks": total,
            "window": meta.get("window"),
            "variants": [{"name": v, "decks": r["decks"]} for v, r in rows],
            "core_main": [c for c in main if c["rate"] >= 0.6],
            "flex_main": [c for c in main if 0.2 <= c["rate"] < 0.6][:24],
            "core_extra": [c for c in extra if c["rate"] >= 0.5],
            "flex_extra": [c for c in extra if 0.2 <= c["rate"] < 0.5][:12],
            "engines": sorted(
                ({"name": n, "rate": round(k / total, 3), "slug": eng_by_mdm.get(n)} for n, k in eng.items()),
                key=lambda x: -x["rate"],
            )[:10],
            "samples": samples[:3],
        }


def write_site_data(themes, engines, hdef, names):
    """GitHub Pages(docs/index.html)가 읽는 데이터 한 덩어리. 카드는 테마에 나온 것만 담는다."""
    used = set()

    def walk(o, key=None):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, k)
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
        elif isinstance(o, str):
            if key in ("card", "target_card", "hand", "end_board"):
                used.add(o)
            used.update(re.findall(r"\[\[([^\]]+)\]\]", o))

    bdef = load_json(ROOT / "data/breakers.json")
    attach_decklists(themes, engines)
    walk(themes)
    walk(engines)
    walk(hdef["handtraps"])
    walk(bdef["breakers"])
    # 공식 룰·판정 (data/rules/rules.json + data/rules/rulings/*.json), id 기준 병합
    rules_dir = ROOT / "data" / "rules"
    rsources, rules, rulings = {}, [], {}
    for f in [rules_dir / "rules.json", *sorted((rules_dir / "rulings").glob("*.json"))]:
        if not f.exists():
            continue
        r = load_json(f)
        rsources.update(r.get("sources", {}))
        rules.extend(r.get("rules", []))
        for q in r.get("rulings", []):
            prev = rulings.get(q["id"])
            if prev:  # 같은 판정을 여러 파일이 가져왔으면 연결 정보만 합친다
                for k in ("cards", "handtraps", "themes"):
                    prev[k] = sorted(set(prev.get(k, [])) | set(q.get(k, [])))
            else:
                rulings[q["id"]] = q
    walk(rules)
    walk(list(rulings.values()))
    cards = {}
    for en in sorted(used):
        c = names.by_en.get(en)
        if c:
            cards[en] = {"ko": c.get("ko"), "cid": c.get("cid"), "pw": c.get("password"), "type": c.get("type"), "text": c.get("text_ko"), "te": c.get("text_en")}
    for t in themes:
        # 개요 카드 배경용 대표 카드: 지정이 없으면 핵심 카드 첫 장
        t.setdefault("cover", (t.get("key_cards") or [{}])[0].get("card"))
    # 상대 테마가 실제로 넣는 패트랩·돌파 카드 채용률 (메타 스냅샷, 변형 deckType 합산)
    meta_p = ROOT / "data/meta/latest.json"
    staples_by_card = {h["card"]: h["id"] for h in hdef["handtraps"]}
    staples_by_card.update({b["card"]: b["id"] for b in bdef["breakers"]})
    if meta_p.exists():
        meta = load_json(meta_p)
        for t in themes:
            rows = [meta["themes"][v] for v in t.get("variants", []) if v in meta["themes"]]
            total = sum(r["decks"] for r in rows)
            usage = {}
            for r in rows:
                for c in r["main"]:
                    sid = staples_by_card.get(c["name"])
                    if sid:
                        u = usage.setdefault(sid, [0.0, 0.0])
                        u[0] += c["rate"] * r["decks"]
                        u[1] += c["rate"] * r["decks"] * c["avg"]
            # MDM 이 이 테마 덱에서 찾아낸 엔진 채용률 → 우리 엔진 모듈 slug 로 연결
            erate = {}
            for r in rows:
                for x in r.get("engines", []):
                    erate[x["name"]] = erate.get(x["name"], 0) + x["rate"] * r["decks"]
            t["engines"] = sorted(
                (
                    {"slug": e["slug"], "rate": round(max(erate.get(n, 0) for n in e.get("mdm_names", [e["name"]["en"]])) / total, 3)}
                    for e in engines
                    if total and any(erate.get(n) for n in e.get("mdm_names", [e["name"]["en"]]))
                ),
                key=lambda x: -x["rate"],
            )
            t["staples"] = sorted(
                ({"id": k, "rate": round(v[0] / total, 3), "avg": round(v[1] / v[0], 2)} for k, v in usage.items() if total and v[0]),
                key=lambda x: -x["rate"],
            )
    data = {
        "generated": max((t.get("updated", "") for t in themes), default=""),
        "kinds": hdef.get("kinds", {}),
        "effect_classes": hdef["effect_classes"],
        "handtraps": hdef["handtraps"],
        "breakers": bdef["breakers"],
        "answer_tags": bdef["answer_tags"],
        "rule_sources": rsources,
        "rules": rules,
        "rulings": sorted(rulings.values(), key=lambda q: q["id"]),
        "themes": themes,
        "engines": engines,
        "cards": cards,
    }
    out = ROOT / "docs" / "data" / "site.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="한국어명이 없는 카드가 있으면 실패")
    args = ap.parse_args()

    names = Names()
    hdef = load_json(ROOT / "data/handtraps.json")
    ht, classes = hdef["handtraps"], hdef["effect_classes"]
    docs = ROOT / "docs"
    docs.mkdir(exist_ok=True)

    def lint(f, t):
        for line in t.get("lines", []):
            for s in line["steps"]:
                bad = set(s.get("class", [])) - set(classes)
                if bad:
                    sys.exit(f"{f.name}: unknown effect class {bad}")
        lines = {l["id"]: l for l in t.get("lines", [])}
        # 지속형 봉쇄(차원계·소환 제한)와 아무 때나 미리 던지는 증G류는 '그 단계 효과를 맞히는' 카드가 아니라 검사하지 않는다
        free = {"maxxc", "fuwalos", "purulia", "meowls"}
        hits = {h["id"]: set(h["hits"]) for h in ht if h["kind"] not in ("dimension", "summon_lock") and h["id"] not in free}
        for c in t.get("chokepoints", []):
            line, step = lines.get(c.get("line")), c.get("step")
            if c["severity"] == "bad" or not line or not step:
                continue
            if not 1 <= step <= len(line["steps"]):
                print(f"경고 {f.name}: {c['line']} {step}단계가 없음")
                continue
            cls = set(line["steps"][step - 1].get("class", []))
            if hits.get(c["handtrap"]) is not None and hits[c["handtrap"]] and not hits[c["handtrap"]] & cls:
                print(f"경고 {f.name}: {c['handtrap']} 는 {c['line']} {step}단계 {sorted(cls)} 에 대응 못 함")

    themes = []
    for f in sorted((ROOT / "data/themes").glob("*.json")):
        t = load_json(f)
        lint(f, t)
        (docs / f"{t['slug']}.md").write_text(build_theme(t, names, ht, classes), encoding="utf-8")
        themes.append(t)

    # 엔진 모듈 (data/engines/*.json): 다른 테마에 섞여 들어가는 카드 묶음. 사이트에서 메인 테마와 겹쳐 본다.
    engines = []
    slugs = {t["slug"] for t in themes}
    for f in sorted((ROOT / "data/engines").glob("*.json")):
        e = load_json(f)
        lint(f, e)
        for h in e.get("hosts", []):
            if h.get("theme") not in slugs:
                print(f"경고 {f.name}: hosts 의 테마 {h.get('theme')} 가 data/themes 에 없음")
            for j in h.get("joins", []):
                el = next((l for l in e.get("lines", []) if l["id"] == j.get("engine_line")), None)
                if not el or not 1 <= j.get("engine_step", 0) <= len(el["steps"]):
                    print(f"경고 {f.name}: {h.get('theme')} 합류 지점 {j.get('engine_line')} {j.get('engine_step')} 가 없음")
        engines.append(e)

    (docs / "handtraps.md").write_text(build_handtraps(ht, classes, names), encoding="utf-8")

    themes.sort(key=lambda t: -t.get("meta", {}).get("share", 0))
    idx = ["# 테마 목록\n", "| 테마 | 점유율 | 상태 | 가장 아픈 타이밍 (패트랩 → 대상) |", "|---|---|---|---|"]
    ht_by_id = {h["id"]: h for h in ht}
    for t in themes:
        top = [c for c in t.get("chokepoints", []) if c["severity"] == "critical" and c["handtrap"] in ht_by_id][:3]
        top_txt = "<br>".join(
            f"{ht_by_id[c['handtrap']]['short_ko']} → {names.ko(c['target_card']) or c['target_card']}"
            if c.get("target_card") else ht_by_id[c["handtrap"]]["short_ko"]
            for c in top
        )
        title = f"[{t['name'].get('ko') or t['name']['en']} ({t['name']['en']})]({t['slug']}.md)"
        status = {"draft": "초안", "reviewed": "검토 완료"}.get(t.get("status"), t.get("status", ""))
        idx.append(f"| {title} | {t.get('meta', {}).get('share', 0) * 100:.1f}% | {status} | {top_txt} |")
    (docs / "README.md").write_text("\n".join(idx) + "\n\n[패트랩 사전](handtraps.md)\n", encoding="utf-8")

    write_site_data(themes, engines, hdef, names)

    if names.missing:
        print("한국어명 없음:", ", ".join(sorted(names.missing)))
        if args.check:
            sys.exit(1)
    print(f"built {len(themes)} themes, {len(engines)} engines")


if __name__ == "__main__":
    main()
