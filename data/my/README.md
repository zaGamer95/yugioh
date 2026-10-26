# 내 전개법 넣기 (`data/my/<테마 slug>.json`)

여기 있는 파일은 **덱 주인이 직접 쓴 전개·판단**입니다. 빌드할 때 `data/themes/<slug>.json` 앞에 끼워 넣습니다.
테마 파일은 자료 조사로 다시 만들어질 수 있지만, 이 폴더의 파일은 건드리지 않습니다.

사이트에서는 이렇게 보입니다.
- 내 라인이 **첫 번째 탭**이 되고 `★ 내 전개` 표시가 붙습니다(테마 페이지·즉석 족보 모두).
- 내가 쓴 패트랩 타이밍은 우선순위 맨 앞에 들어가고, 즉석 족보 계획에 `★ 자겜` 표시가 붙습니다.
- `notes_ko` 는 테마 페이지 맨 위에 "직접 쓴 메모"로 나옵니다.

## 가장 쉬운 방법
Claude 에게 채팅으로 이렇게 알려 주면 이 파일로 옮겨 적습니다.

```
킬러튠 내 전개: 레코 + 아무 튜너
1. 킬러튠 레코 일반 소환 → 덱에서 킬러튠 큐 서치
2. 큐 패에서 특소 (튜너만 특소 가능 제약 시작)
...
엔드 보드: ...
우라라 맞으면: ...
이 덱 상대로 패트랩은 ... 가 제일 아프다
```
카드명은 인게임 한국어명이나 영문 아무거나 괜찮습니다. 저장할 때는 공식 영문명으로 바꿔 둡니다.

## 직접 쓰는 경우 형식
테마 파일과 같은 형식입니다(`data/themes/SCHEMA.md`). 넣고 싶은 항목만 쓰면 됩니다.

```jsonc
{
 "author": "자겜",                       // 사이트에 표시할 이름
 "lines": [                              // 테마 파일의 라인 id 와 겹치면 안 됨 (예: "my_reco")
  {"id": "my_reco", "title_ko": "레코 + 튜너 (내 기본 전개)", "hand": ["Kewl Tune Reco"],
   "steps": [
    {"card": "Kewl Tune Reco", "action_ko": "일반 소환", "class": ["normal_summon"], "result_ko": ""},
    {"card": "Kewl Tune Reco", "action_ko": "소환 성공 유발: 킬러튠 몬스터 서치", "class": ["monster_effect_field", "search"], "result_ko": "[[Kewl Tune Cue]] 서치"}
   ],
   "end_board": ["Baronne de Fleur"], "end_board_note_ko": "견제 수, 상대 턴 효과"}
 ],
 "chokepoints": [                        // 이 덱을 상대할 때 패트랩 타이밍 (내 판단)
  {"handtrap": "ash", "severity": "critical", "line": "my_reco", "step": 2,
   "target_card": "Kewl Tune Reco", "timing_ko": "레코 서치 발동에 체인", "why_ko": "…", "fallback_ko": "…"}
 ],
 "handtrap_summary": {"ash": {"rating": "critical", "note_ko": "내 경험상 …"}},   // 기존 평가를 덮어씀
 "going_second": {"sequencing_ko": ["후공일 때 내가 실제로 하는 순서"]},
 "notes_ko": ["실전 팁, 자주 하는 실수"]
}
```

- `class` 값은 `data/handtraps.json` 의 `effect_classes` 키만 씁니다.
- 패트랩 id 도 같은 파일의 `id` 만 씁니다 (`ash`, `imperm`, `veiler`, `droll`, `maxxc` …).
- 다 쓰면 `python3 scripts/build_docs.py` 를 돌려 `경고` 가 없는지 확인합니다.
