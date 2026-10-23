#!/usr/bin/env python3
"""사이트에 나오는 카드의 일러스트/카드 이미지를 받아 WebP 로 줄여 docs/img/ 에 저장한다.

이미지 출처: YGOPRODeck (https://ygoprodeck.com/api-guide/). 정책상 직접 링크하지 말고
한 번 받아 직접 호스팅해야 하므로, 이미 받은 파일은 다시 받지 않는다.
카드 비밀번호(password)가 없는 카드는 Master Duel Meta 카드 API 의 konamiID 로 채운다.

Usage: python3 scripts/fetch_images.py      (scripts/build_docs.py 를 먼저 돌려 docs/data/site.json 을 만든 뒤)
Requires: Pillow
"""
import io
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "cards" / "cards.json"
OUT = ROOT / "docs" / "img"
UA = {"User-Agent": "zaGamer95-yugioh-research/0.1"}
SIZES = {
    "art": ("https://images.ygoprodeck.com/images/cards_cropped/{}.jpg", (240, 240)),
    "card": ("https://images.ygoprodeck.com/images/cards/{}.jpg", (240, 350)),
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    cards = json.loads(CACHE.read_text(encoding="utf-8"))
    site = json.loads((ROOT / "docs/data/site.json").read_text(encoding="utf-8"))
    wanted = set(site["cards"])
    by_en = {c["en"]: c for c in cards.values()}

    changed = False
    for en in sorted(wanted):
        c = by_en.get(en)
        if not c or c.get("password"):
            continue
        found = json.loads(get("https://www.masterduelmeta.com/api/v1/cards?name=" + urllib.parse.quote(en)))
        m = next((x for x in found if x["name"] == en and not x.get("alternateArt")), None)
        if m and str(m.get("konamiID") or "").isdigit():
            c["password"] = int(m["konamiID"])
            changed = True
        time.sleep(0.2)
    if changed:
        CACHE.write_text(json.dumps(cards, ensure_ascii=False, indent=1), encoding="utf-8")

    for kind in SIZES:
        (OUT / kind).mkdir(parents=True, exist_ok=True)
    done = failed = 0
    for en in sorted(wanted):
        pw = (by_en.get(en) or {}).get("password")
        if not pw:
            print(f"  ! no password: {en}", file=sys.stderr)
            continue
        for kind, (url, size) in SIZES.items():
            dest = OUT / kind / f"{pw}.webp"
            if dest.exists():
                continue
            try:
                im = Image.open(io.BytesIO(get(url.format(pw)))).convert("RGB")
                im.thumbnail(size, Image.LANCZOS)
                im.save(dest, "WEBP", quality=78, method=6)
                done += 1
            except Exception as ex:
                failed += 1
                print(f"  ! {kind} {pw} {en}: {ex}", file=sys.stderr)
            time.sleep(0.15)  # YGOPRODeck 제한(초당 20회)보다 훨씬 느리게
    print(f"saved {done} images, {failed} failed")


if __name__ == "__main__":
    main()
