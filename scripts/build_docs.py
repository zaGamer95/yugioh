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
        return c["ko"]

    def __call__(self, en):
        ko = self.ko(en)
        return f"**{ko}** ({en})" if ko else f"**{en}** ⚠"

    def plain(self, en):
        ko = self.ko(en)
        return f"{ko} ({en})" if ko else f"{en} ⚠"


def link_names(obj, names):
    """설명문 안의 [[English Name]] 을 '한국어명 (English)' 으로 바꾼다."""
    if isinstance(obj, str):
        return re.sub(r"\[\[([^\]]+)\]\]", lambda m: names.plain(m.group(1)), obj)
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
        out.append("## 혈자리 (우선순위 순)\n")
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="한국어명이 없는 카드가 있으면 실패")
    args = ap.parse_args()

    names = Names()
    hdef = load_json(ROOT / "data/handtraps.json")
    ht, classes = hdef["handtraps"], hdef["effect_classes"]
    docs = ROOT / "docs"
    docs.mkdir(exist_ok=True)

    themes = []
    for f in sorted((ROOT / "data/themes").glob("*.json")):
        t = load_json(f)
        for line in t.get("lines", []):
            for s in line["steps"]:
                bad = set(s.get("class", [])) - set(classes)
                if bad:
                    sys.exit(f"{f.name}: unknown effect class {bad}")
        lines = {l["id"]: l for l in t.get("lines", [])}
        hits = {h["id"]: set(h["hits"]) for h in ht}
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
        (docs / f"{t['slug']}.md").write_text(build_theme(t, names, ht, classes), encoding="utf-8")
        themes.append(t)

    (docs / "handtraps.md").write_text(build_handtraps(ht, classes, names), encoding="utf-8")

    themes.sort(key=lambda t: -t.get("meta", {}).get("share", 0))
    idx = ["# 테마 목록\n", "| 테마 | 점유율 | 상태 | 가장 아픈 패트랩 |", "|---|---|---|---|"]
    ht_by_id = {h["id"]: h for h in ht}
    for t in themes:
        top = [c for c in t.get("chokepoints", []) if c["severity"] == "critical"][:3]
        top_txt = ", ".join(ht_by_id[c["handtrap"]]["short_ko"] for c in top if c["handtrap"] in ht_by_id)
        title = f"[{t['name'].get('ko') or t['name']['en']} ({t['name']['en']})]({t['slug']}.md)"
        idx.append(f"| {title} | {t.get('meta', {}).get('share', 0) * 100:.1f}% | {t.get('status', '')} | {top_txt} |")
    (docs / "README.md").write_text("\n".join(idx) + "\n\n[패트랩 사전](handtraps.md)\n", encoding="utf-8")

    if names.missing:
        print("한국어명 없음:", ", ".join(sorted(names.missing)))
        if args.check:
            sys.exit(1)
    print(f"built {len(themes)} themes")


if __name__ == "__main__":
    main()
