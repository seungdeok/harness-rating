# harness-rating

A deterministic CLI that statically scans a repository's AI coding agent harness and rates it L0–L4, with every check backed by a public primary source.

## Where things are

- Spec: `docs/spec/SPEC.md`. It changes only through an ADR: see `docs/adr/README.md`.
- Decisions: `docs/adr/`

## Commands

Node 24 or newer.

```sh
npm ci                        # install
npm run typecheck             # tsc
npm run lint                  # biome check
npm test                      # vitest
npm run build                 # compile to dist/
npm run validate:rubric       # validate rubric/*.yaml
npm run generate:rubric-docs  # regenerate docs/rubric.md and docs/levels.md after a rubric change
node dist/cli.js --min-level 4 .  # self-scan; CI requires L4
```

A Claude Code `Stop` hook runs `typecheck` and `lint` before a turn ends. For an independent review of a change, use the `reviewer` subagent (`.claude/agents/reviewer.md`).

## Working rules

- Everything committed or posted to GitHub (code, docs, issues, PRs, commits) is in English.
- One issue, one branch, one PR. Parallel work on separate issues uses separate git worktrees.
- Rubric changes follow the spec's [source rules](docs/spec/SPEC.md#source-rules).
