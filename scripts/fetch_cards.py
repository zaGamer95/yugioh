#!/usr/bin/env python3
"""카드의 공식 영문/한국어/일본어 이름과 텍스트를 모아 data/cards/cards.json 에 캐시한다.

흐름: 영문명 -> Master Duel Meta 카드 API(gameId = KONAMI 카드 ID)
      -> KONAMI 공식 DB(Neuron)에서 ko/ja 이름과 텍스트.
마스터 듀얼 인게임 한국어명은 OCG 공식 한국어명과 같으므로 KONAMI DB 값을 그대로 쓴다.

Usage:
  python3 scripts/fetch_cards.py "Elfnote Tinia" "Ash Blossom & Joyous Spring"
  python3 scripts/fetch_cards.py --from-meta 0.3      # 메타 스냅샷에서 채용률 30% 이상 카드 전부
  python3 scripts/fetch_cards.py --from-themes        # data/themes/*.json 에 나온 카드 전부
  --ja 를 붙이면 일본어명도 받는다 (KONAMI DB 요청이 2배)
"""
import argparse
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "cards" / "cards.json"
MDM = "https://www.masterduelmeta.com/api/v1/cards?name={}"
KONAMI = "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid={}&request_locale={}"
WITH_JA = False
UA = {"User-Agent": "zaGamer95-yugioh-research/0.1"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", "replace")


def konami(cid, locale):
    page = fetch(KONAMI.format(cid, locale))
    # 카드명에 <P> 같은 꺾쇠가 그대로 들어간 경우가 있어 ' | ' 까지 읽는다
    title = re.search(r"<title>(.*?)\s\|\s", page, re.S)
    text = re.search(r'class="item_box_text">.*?class="text_linebreak">(.*?)</div>', page, re.S)
    name = html.unescape(title.group(1)).strip() if title else None
    body = html.unescape(re.sub(r"<[^>]+>", "\n", text.group(1))).strip() if text else None
    # 존재하지 않는 로케일이면 검색 페이지 제목이 돌아온다
    if name and ("카드 검색" in name or "Card Search" in name or "カード検索" in name):
        name = None
    return name, body


def lookup(name, cache):
    for c in cache.values():
        if c["en"] == name:
            return c
    found = json.loads(fetch(MDM.format(urllib.parse.quote(name))))
    exact = [x for x in found if x["name"] == name and not x.get("alternateArt")] or found[:1]
    if not exact:
        print(f"  ! not found on MDM: {name}", file=sys.stderr)
        return None
    m = exact[0]
    cid = str(m.get("gameId") or "")
    if not cid:
        print(f"  ! no KONAMI id: {name}", file=sys.stderr)
        return None
    time.sleep(0.5)
    ko, ko_text = konami(cid, "ko")
    time.sleep(0.5)
    ja = konami(cid, "ja")[0] if WITH_JA else None
    entry = {
        "cid": int(cid),
        "en": m["name"],
        "ko": ko,
        "ja": ja,
        "type": m.get("type"),
        "race": m.get("race"),
        "attribute": m.get("attribute"),
        "level": m.get("level"),
        "monster_type": m.get("monsterType"),
        "md_rarity": m.get("rarity"),
        "text_en": m.get("description"),
        "text_ko": ko_text,
    }
    cache[cid] = entry
    return entry


def names_from_meta(min_rate):
    meta = json.loads((ROOT / "data/meta/latest.json").read_text(encoding="utf-8"))
    names = {c["name"] for c in meta["overall_main"] if c["rate"] >= 0.05}
    for t in meta["themes"].values():
        if t["decks"] < 5:
            continue
        for part in ("main", "extra"):
            names |= {c["name"] for c in t[part] if c["rate"] >= min_rate}
    return sorted(names)


def names_from_themes():
    names = set()

    def walk(o, key=None):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, k)
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
        elif isinstance(o, str):
            if key in ("card", "target_card", "hand", "end_board"):
                names.add(o)
            names.update(re.findall(r"\[\[([^\]]+)\]\]", o))

    for f in (ROOT / "data/themes").glob("*.json"):
        walk(json.loads(f.read_text(encoding="utf-8")))
    ht = json.loads((ROOT / "data/handtraps.json").read_text(encoding="utf-8"))
    names.update(h["card"] for h in ht["handtraps"])
    return sorted(names)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--from-meta", type=float)
    ap.add_argument("--from-themes", action="store_true")
    ap.add_argument("--ja", action="store_true", help="일본어명도 받기 (요청 2배)")
    args = ap.parse_args()
    global WITH_JA
    WITH_JA = args.ja

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    names = list(args.names)
    if args.from_meta is not None:
        names += names_from_meta(args.from_meta)
    if args.from_themes:
        names += names_from_themes()

    todo = [n for n in dict.fromkeys(names) if not any(c["en"] == n for c in cache.values())]
    print(f"{len(todo)} new cards to fetch ({len(cache)} cached)")
    for i, n in enumerate(todo, 1):
        try:
            e = lookup(n, cache)
            if e:
                print(f"[{i}/{len(todo)}] {e['cid']} {e['en']} / {e['ko']}")
        except Exception as ex:  # 네트워크 오류는 건너뛰고 다음 실행 때 다시 시도
            print(f"  ! {n}: {ex}", file=sys.stderr)
        if i % 5 == 0:
            save(cache)
    save(cache)


def save(cache):
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    ordered = dict(sorted(cache.items(), key=lambda kv: int(kv[0])))
    CACHE.write_text(json.dumps(ordered, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
