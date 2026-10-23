# 테마 데이터 스키마 (`data/themes/<slug>.json`)

- 카드는 **항상 Master Duel 영문 공식명**(Master Duel Meta 표기와 같은 철자)으로만 적는다. `scripts/build_docs.py` 가 `data/cards/cards.json` 을 보고 `공식 한국어명 (English)` 으로 바꿔 쓴다. 한국어명을 직접 지어내지 않는다.
- 설명문(`*_ko`)은 한국어. 카드명을 문장 안에 쓸 때도 영문 공식명을 `[[Card Name]]` 형태로 감싸면 빌드 때 한국어명으로 치환된다.
- 패트랩 id 는 `data/handtraps.json` 의 `id`, effect class 는 같은 파일의 `effect_classes` 키만 쓴다.

```jsonc
{
  "slug": "elfnote",
  "name": {"en": "Elfnote", "ko": "엘펜노츠"},          // ko 는 공식 카드명에 들어 있는 테마명
  "status": "draft",                                    // draft | reviewed
  "updated": "2026-10-22",
  "meta": {"decks": 72, "share": 0.099, "window": "2026-09-22~10-22 랭크·DC"},
  "variants": ["Elfnote", "Elfnote Kewl Tune"],          // 집계에 포함한 MDM deckType 이름
  "cover": "Elfnote Lucina",                            // 선택: 사이트 개요 카드 배경 일러스트 (없으면 key_cards 첫 장)
  "overview_ko": "덱의 승리 플랜, 초동 수, 약점 3~6문장",
  "key_cards": [{"card": "Elfnote Lucina", "role_ko": "1장 초동. 메인 페이즈에 엘펜노츠 몬스터 서치"}],
  "lines": [
    {
      "id": "main",                                      // chokepoints(패트랩 타이밍)에서 참조
      "title_ko": "루키나 1장 초동",
      "hand": ["Elfnote Lucina"],
      "note_ko": "선택: 전제 조건, 소환권 사용 여부 등",
      "steps": [
        {"card": "Elfnote Lucina", "action_ko": "패에서 중앙 메인 몬스터 존에 특소", "class": ["ss_from_hand"], "result_ko": ""},
        {"card": "Elfnote Lucina", "action_ko": "메인 페이즈 효과: 덱에서 엘펜노츠 몬스터 서치", "class": ["monster_effect_field", "search"], "result_ko": "[[Elfnote Regina]] 서치"}
      ],
      "end_board": ["Baronne de Fleur", "Elfnote Fortuna"],
      "end_board_note_ko": "견제 수, 상대 턴에 쓰는 효과"
    }
  ],
  "chokepoints": [                                       // 우선순위 순서대로
    {
      "handtrap": "ash",
      "severity": "critical",                            // critical | strong | ok | weak | bad
      "line": "main", "step": 2,
      "target_card": "Elfnote Lucina",
      "timing_ko": "루키나의 서치 효과 발동에 체인",
      "why_ko": "왜 여기가 치명적인지",
      "fallback_ko": "맞은 뒤 상대가 갈 수 있는 루트 / 남는 필드"
    }
  ],
  "handtrap_summary": {
    "ash":    {"rating": "critical", "note_ko": "어디에 던지는지 한 줄"},
    "maxxc":  {"rating": "strong",   "note_ko": "..."}
  },
  "notes_ko": ["던지면 안 되는 타이밍, 체인 주의점, 흔한 실수"],
  "sources": ["https://... (자료 제목)"]
}
```

## severity 기준
- `critical`: 이 지점을 맞으면 전개가 끊기거나 최종 견제가 1개 이하로 줄어든다.
- `strong`: 전개는 이어지지만 견제가 크게 줄거나 다음 턴 자원이 없어진다.
- `ok`: 맞추면 이득이지만 상대에게 대체 루트가 충분하다.
- `weak`: 거의 영향이 없다.
- `bad`: 쓰면 손해(대상 없음, 상대가 오히려 이득, 체인으로 역이용).
