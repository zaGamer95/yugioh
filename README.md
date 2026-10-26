# 자겜의 족보 — Master Duel 패트랩 타이밍 노트 (Hand Trap Timing)

유희왕 마스터 듀얼 메타 테마별로 **전개 순서**와, 각 단계에서 **어떤 패트랩을 던지면 치명적인지**를 정리한 자료입니다.
카드명은 모두 **공식 한국어명 (공식 영문명)** 으로 적어서 인게임 검색에 그대로 쓸 수 있습니다.

- **웹 페이지 (시각화)**: https://wonbo.site/yugioh/ — 테마별 전개 흐름, 패트랩 타이밍표 (패트랩 × 전개 단계), 패트랩 × 테마 상성표
- 테마 목록 (Markdown): [docs/README.md](docs/README.md)
- 패트랩 사전: [docs/handtraps.md](docs/handtraps.md)

## 구조

```
data/
  themes/<slug>.json   테마별 전개·패트랩 타이밍 원본 데이터 (스키마: data/themes/SCHEMA.md)
  engines/<slug>.json  다른 테마에 섞여 들어가는 엔진 (낙인·죄보·감옥신 등), 합류 지점 포함
  my/<slug>.json       덱 주인이 직접 쓴 전개·판단 (빌드 때 테마 앞에 끼움, 사용법: data/my/README.md)
  learn/resources.json 외부 학습 자료 모음 (사이트 '배우기')
  handtraps.json       패트랩 정의와 "어떤 효과에 대응하는가" 분류
  cards/cards.json     KONAMI 카드 ID 기준 공식 영/한/일 이름·텍스트 캐시
  meta/latest.json     Master Duel Meta 상위 덱 집계 (테마 점유율, 채용률)
docs/                  data/ 에서 자동 생성되는 문서 (직접 고치지 말 것)
  index.html, assets/  GitHub Pages 페이지 (docs/data/site.json 을 읽어 그림)
scripts/
  fetch_meta.py        메타 스냅샷 갱신
  fetch_cards.py       공식 카드명 수집 (영문명 → KONAMI ID → 한국어명)
  build_docs.py        docs/ 생성
  fetch_images.py      카드 일러스트·카드 이미지 수집 (docs/img/, WebP)
```

## 갱신 방법

```bash
python3 scripts/fetch_meta.py --days 30          # 최근 30일 랭크·DC 상위 덱 집계
python3 scripts/fetch_cards.py --from-themes     # 테마 데이터에 나온 카드의 공식명 수집
python3 scripts/build_docs.py                    # 문서 + 페이지 데이터(docs/data/site.json) 생성
python3 scripts/fetch_images.py                  # 새로 나온 카드의 이미지만 받기 (Pillow 필요)
```

`fetch_images.py` 만 Pillow 가 필요하고, 나머지는 Python 3 표준 라이브러리만 사용합니다.

## 데이터 출처와 주의

- **카드명·텍스트**: [KONAMI 공식 카드 DB](https://www.db.yugioh-card.com/) (한국어/일본어), [Master Duel Meta](https://www.masterduelmeta.com/) (MD 영문명, KONAMI ID).
  마스터 듀얼 인게임 한국어명은 OCG 공식 한국어명과 같습니다.
- **카드 이미지**: [YGOPRODeck](https://ygoprodeck.com/api-guide/) 이미지를 한 번 받아 WebP 로 줄여 직접 호스팅합니다(직접 링크 금지 정책).
- **메타 통계**: Master Duel Meta의 공개 덱 리스트 집계입니다. 비공식 API라서 요청 간격을 두고 결과를 캐시합니다.
- **전개 루트**: 각 테마 파일의 `sources` 에 적힌 공략 자료를 바탕으로, 카드 텍스트와 대조해서 직접 정리했습니다.
  `status: draft` 인 테마는 아직 실전 검증 전이니 틀린 부분이 있으면 이슈로 알려 주세요.
- 비공식 팬 자료입니다. 카드 이름·텍스트·이미지의 권리는 KONAMI에 있습니다. Yu-Gi-Oh! © KONAMI
