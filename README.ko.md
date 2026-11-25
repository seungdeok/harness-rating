# harness-rating

[![CI](https://github.com/seungdeok/harness-rating/actions/workflows/ci.yml/badge.svg)](https://github.com/seungdeok/harness-rating/actions/workflows/ci.yml)
[![harness-rating: L4](https://img.shields.io/badge/harness--rating-L4-brightgreen)](#셀프-스캔)

[English](README.md) | 한국어

저장소에 커밋된 AI 코딩 에이전트 하네스를 정적으로 스캔해 L0부터 L4까지 등급을 매기는 CLI예요. 모든 검사 항목은 공개된 1차 출처를 근거로 해요.

**무엇을 측정하나요:** 저장소에 커밋된 하네스예요. 에이전트 지침 파일, hooks, skills, 서브에이전트, 테스트, 린터, pre-commit, CI를 봐요. `~/.claude/` 같은 사용자 전역 설정은 읽지 않아요.

**한계:**

- **설정 여부를 볼 뿐, 효과는 보지 않아요.** 검사를 통과했다는 건 무언가 설정되어 있다는 뜻이지, 그 설정이 잘 작동한다는 뜻은 아니에요.
- **우회할 수 있어요.** 빈 테스트를 실행하는 hook도 hook·테스트 검사(D2, C1)를 통과해요. 등급을 채용이나 리뷰 기준으로 쓴다면 사람의 리뷰나 실제 실행 기반 평가와 함께 쓰세요.
- **등급이 높을수록 결과가 좋다고 아직 주장하지 않아요.** [검증 연구](docs/validity.md) 결과가 아직 공개되지 않았어요. 그때까지 등급은 나열된 검사를 통과했다는 의미만 가져요.

## 설치

Node 24 이상이 필요해요.

```sh
npx harness-rating
```

## 사용법

```sh
npx harness-rating                  # 현재 디렉터리 스캔
npx harness-rating ./path/to/repo   # 다른 디렉터리 스캔
npx harness-rating --json report.json   # JSON 보고서도 저장
npx harness-rating --min-level 3    # L3 미만이면 exit 1
npx harness-rating --explain A3     # 검사 항목의 설명과 출처
```

종료 코드: `0` 통과, `1` `--min-level` 미달, `2` 사용법 또는 스캔 오류.

L1 저장소의 출력 예시(일부 생략):

```
harness-rating v0.1.0 · rubric v0.1.0 · test/fixtures/levels/l1-guided
Detected: AGENTS.md

Level  L1 · Guided
Score  42 / 100 (reference)

To reach L2
  ✗ C1  A test suite and a command to run it exist
      → C1: Add a test suite and a script that runs it, such as `npm test`, `pytest`, `go test ./...`, or `cargo test`.
      → Sources: Anthropic, Google
  ✗ C2 or C3
      → C2: Add a linter configuration, such as Biome, ESLint, Ruff, golangci-lint, or Clippy.
      → Sources: Anthropic

Not passed (score only)
  ✗ D1  Agent hooks are configured (no agent hooks) · tier C · Anthropic
  ...
```

스캔 결과는 결정적이에요. 모델 호출, 네트워크 요청, 텔레메트리가 없고, 스캔하는 저장소의 코드를 실행하지 않아요. 심볼릭 링크를 따라가지 않고 저장소 밖은 읽지 않아요.

## 등급

아래 조건을 충족하고, 그 아래 모든 등급의 조건도 충족해야 도달해요. 저장소에 해당하지 않는 검사는 조건에서 빠져요.

| 등급 | 이름 | 조건 |
| --- | --- | --- |
| L0 | Not configured | — |
| L1 | Guided | 지침 파일(A1)에 빌드·테스트 명령이 적혀 있음(A3) |
| L2 | Checked | 테스트 스위트(C1), 그리고 린터(C2) 또는 타입 검사(C3) |
| L3 | Enforced | CI가 테스트와 린트를 실행(F2), 그리고 검사를 실행하는 hook(D1과 D2) 또는 pre-commit(F1) |
| L4 | Sustained | 짧은 지침 파일(A2)과 그 안의 링크가 유효함(A4), 리뷰 skill 또는 서브에이전트(E1), 드리프트 센서(F3) 또는 정기 정리 작업(F4) |

점수는 참고용이고 게이트에는 쓰이지 않아요. 각 검사 항목과 출처, 통과 방법은 [`docs/rubric.md`](docs/rubric.md)에 있어요. v0.1이 지원하는 에이전트는 Claude Code, 그리고 Codex 프로젝트 설정을 포함한 `AGENTS.md`예요.

## CI 게이트

```yaml
# .github/workflows/harness.yml
name: Harness
on: [pull_request]
permissions:
  contents: read
jobs:
  harness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npx harness-rating@0.1.4 --min-level 3
```

버전은 고정하세요. 루브릭 버전이 바뀌면 통과하는 검사가 달라질 수 있어요.

## 다른 사람의 하네스 평가하기

등급은 저장소만 보고 정해지므로 누가 돌려도 같은 결과가 나와요. 개인의 하네스를 평가하려면:

1. 하네스가 없는(L0) 과제 저장소를 평가용으로 제공해요.
2. 지원자가 거기에 자기 하네스를 추가해서 제출해요.
3. 제출된 저장소에 `harness-rating`을 실행해요.

## 셀프 스캔

이 저장소의 CI는 자기 자신에게 `harness-rating --min-level 4 .`를 실행하고, L4 미만이면 실패해요.

## 문서

- [명세](docs/spec/SPEC.md): 규칙, 검사 항목, 등급, 점수 (영문)
- [루브릭](docs/rubric.md)과 [등급](docs/levels.md): [`rubric/v0.1.yaml`](rubric/v0.1.yaml)에서 생성 (영문)
- [검증 프로토콜](docs/validity.md) (영문)
- [아키텍처 결정 기록](docs/adr/) (영문)
- [기여 안내](CONTRIBUTING.md) (영문)

## 라이선스

[MIT](LICENSE)
