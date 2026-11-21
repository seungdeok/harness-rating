# harness-rating

[![CI](https://github.com/seungdeok/harness-rating/actions/workflows/ci.yml/badge.svg)](https://github.com/seungdeok/harness-rating/actions/workflows/ci.yml)
[![harness-rating: L4](https://img.shields.io/badge/harness--rating-L4-brightgreen)](#self-scan)

English | [한국어](README.ko.md)

A CLI that statically scans the AI coding agent harness committed to a repository and rates it from L0 to L4. Every check cites a public primary source.

**What it measures:** the harness committed to the repository: agent instruction files, hooks, skills, subagents, tests, linters, pre-commit, and CI. It does not read user-global config such as `~/.claude/`.

**Limitations:**

- **It checks configuration, not effectiveness.** A passing check means something is set up. It does not mean the setup works well.
- **It can be gamed.** A hook that runs an empty test suite passes the hook and test checks (D2, C1). If you use the level as a hiring or review bar, combine it with human review or execution-based evaluation.
- **No claim that higher levels give better results yet.** The [validation study](docs/validity.md) has not published results. Until it does, a level means only that the listed checks pass.

## Install

Node 24 or newer.

```sh
npx harness-rating
```

## Usage

```sh
npx harness-rating                  # scan the current directory
npx harness-rating ./path/to/repo   # scan another directory
npx harness-rating --json report.json   # also write a JSON report
npx harness-rating --min-level 3    # exit 1 below L3
npx harness-rating --explain A3     # a check's description and sources
```

Exit codes: `0` pass, `1` below `--min-level`, `2` usage or scan error.

Example output for a repository at L1 (shortened):

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

The scan is deterministic: no model calls, no network requests, no telemetry, and no code from the scanned repository is run. It does not follow symbolic links or read outside the repository.

## Levels

A level is reached when its requirements below are met, together with those of every lower level. A check that does not apply to the repository drops out.

| Level | Name | Requires |
| --- | --- | --- |
| L0 | Not configured | — |
| L1 | Guided | An instruction file (A1) that documents build and test commands (A3) |
| L2 | Checked | A test suite (C1), and a linter (C2) or type checking (C3) |
| L3 | Enforced | CI runs tests and lint (F2), and a hook runs a check (D1 and D2) or pre-commit (F1) |
| L4 | Sustained | A short instruction file (A2) whose links resolve (A4), a review skill or subagent (E1), and a drift sensor (F3) or scheduled cleanup (F4) |

The score is a reference only and is never used by the gate. Each check, its sources, and how to pass it are listed in [`docs/rubric.md`](docs/rubric.md). Agents supported in v0.1: Claude Code, and `AGENTS.md` including Codex project config.

## Gate in CI

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
      - run: npx harness-rating@0.1.1 --min-level 3
```

Pin the version: a new rubric version can change which checks pass.

## Evaluating someone's harness

The level comes from the repository alone, so anyone gets the same result. To rate a person's harness:

1. Provide an evaluation repository: a task repository with no harness (L0).
2. The candidate adds their harness to it and submits it.
3. Run `harness-rating` on the submitted repository.

## Self-scan

This repository's CI runs `harness-rating --min-level 4 .` on itself and fails below L4.

## Documentation

- [Specification](docs/spec/SPEC.md): rules, checks, levels, and scoring
- [Rubric](docs/rubric.md) and [levels](docs/levels.md): generated from [`rubric/v0.1.yaml`](rubric/v0.1.yaml)
- [Validation protocol](docs/validity.md)
- [Architecture decisions](docs/adr/)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)
