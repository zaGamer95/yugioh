#!/usr/bin/env python3
"""Master Duel Meta 상위 덱 리스트를 받아 테마별 채용 카드 통계를 만든다.

Usage: python3 scripts/fetch_meta.py [--days 30] [--pages 6]
Output: data/meta/snapshot-<date>.json, data/meta/latest.json

MDM API는 비공식(문서 없음)이므로 요청 간 간격을 두고, 결과는 캐시해서 재사용한다.
"""
import argparse
import collections
import datetime as dt
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://www.masterduelmeta.com/api/v1/top-decks?limit=500&page={page}&sort=-created"
# 이벤트(커스텀 룰) 포맷은 제외하고 랭크/DC 같은 일반 포맷만 집계
RANKED = {"Master I", "Duelist Cup DLv. Max", "Rating Duels", "Top 10 Rating", "Win Streaks"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "zaGamer95-yugioh-research/0.1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--pages", type=int, default=6)
    args = ap.parse_args()

    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days)).strftime("%Y-%m-%d")
    seen, decks = set(), []
    for page in range(1, args.pages + 1):
        batch = get(API.format(page=page))
        for d in batch:
            if d["_id"] not in seen:
                seen.add(d["_id"])
                decks.append(d)
        if not batch or batch[-1]["created"][:10] < since:
            break
        time.sleep(2)

    decks = [
        d for d in decks
        if d["created"][:10] >= since
        and isinstance(d.get("rankedType"), dict)
        and d["rankedType"]["name"] in RANKED
        and isinstance(d.get("deckType"), dict)
    ]

    themes = collections.defaultdict(list)
    for d in decks:
        themes[d["deckType"]["name"]].append(d)

    def usage(ds, part):
        inc, cnt = collections.Counter(), collections.Counter()
        for d in ds:
            seen_names = collections.Counter()
            for e in d.get(part) or []:
                seen_names[e["card"]["name"]] += e["amount"]
            for n, a in seen_names.items():
                inc[n] += 1
                cnt[n] += a
        return [
            {"name": n, "rate": round(k / len(ds), 3), "avg": round(cnt[n] / k, 2)}
            for n, k in inc.most_common()
        ]

    out = {
        "generated": dt.date.today().isoformat(),
        "window": {"since": since, "days": args.days},
        "formats": sorted(RANKED),
        "total_decks": len(decks),
        "overall_main": usage(decks, "main")[:120],
        "themes": {},
    }
    def samples(ds, main_u, extra_u, k=2):
        """테마 집계에 가장 가까운(채용률 높은 카드로 채워진) 실제 덱 k개. 대회형(DC) 덱을 조금 우대."""
        rate = {c["name"]: c["rate"] for c in main_u + extra_u}

        def score(d):
            cards = [(e["card"]["name"], e["amount"]) for e in (d.get("main") or []) + (d.get("extra") or [])]
            n = sum(a for _, a in cards) or 1
            bonus = 0.03 if "Duelist Cup" in d["rankedType"]["name"] else 0
            return sum(rate.get(c, 0) * a for c, a in cards) / n + bonus

        def pack(part):
            return [{"card": e["card"]["name"], "amount": e["amount"]} for e in part or []]

        best = sorted(ds, key=score, reverse=True)[:k]
        return [
            {
                "author": (d.get("author") or {}).get("username") if isinstance(d.get("author"), dict) else d.get("author"),
                "url": "https://www.masterduelmeta.com" + d["url"] if d.get("url") else None,
                "created": d["created"][:10],
                "format": d["rankedType"]["name"],
                "engines": [e["name"] for e in (d.get("engines") or [])],
                "main": pack(d.get("main")),
                "extra": pack(d.get("extra")),
                "side": pack(d.get("side")),
            }
            for d in best
        ]

    for name, ds in sorted(themes.items(), key=lambda kv: -len(kv[1])):
        main_u, extra_u = usage(ds, "main"), usage(ds, "extra")
        out["themes"][name] = {
            "decks": len(ds),
            "share": round(len(ds) / len(decks), 3),
            "main": main_u,
            "extra": extra_u,
            "samples": samples(ds, main_u, extra_u),
            "sample_urls": ["https://www.masterduelmeta.com" + d["url"] for d in ds[:5] if d.get("url")],
            # MDM 이 덱마다 붙이는 엔진 태그 (섞어 쓰는 엔진·테크 카드) 채용률
            "engines": [
                {"name": n, "rate": round(k / len(ds), 3)}
                for n, k in collections.Counter(e["name"] for d in ds for e in (d.get("engines") or [])).most_common()
            ],
        }

    meta_dir = ROOT / "data" / "meta"
    meta_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(out, ensure_ascii=False, indent=1)
    (meta_dir / f"snapshot-{out['generated']}.json").write_text(text, encoding="utf-8")
    (meta_dir / "latest.json").write_text(text, encoding="utf-8")
    print(f"{len(decks)} decks, {len(themes)} themes since {since}")
    for name, t in list(out["themes"].items())[:20]:
        print(f"{t['decks']:4d} {t['share'] * 100:5.1f}%  {name}")


if __name__ == "__main__":
    main()
