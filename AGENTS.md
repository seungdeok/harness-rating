# harness-rating

A deterministic CLI that statically scans a repository's AI coding agent harness and rates it L0–L4, with every check backed by a public primary source.

## Where things are

- Spec: `docs/spec/SPEC.md`. It changes only through an ADR: see `docs/adr/README.md`.
- Decisions: `docs/adr/`
- Related tools and papers: `docs/related-work.md`

## Working rules

- Everything committed or posted to GitHub (code, docs, issues, PRs, commits) is in English.
- One issue, one branch, one PR. Parallel work on separate issues uses separate git worktrees.
- Rubric changes follow the spec's [source rules](docs/spec/SPEC.md#source-rules).
