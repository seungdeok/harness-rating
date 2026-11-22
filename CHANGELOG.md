# Changelog

All notable changes to `harness-rating` are recorded here.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The CLI version is independent of the rubric version.

## [0.1.3] - Unreleased

One check fix. The rubric is still v0.1.0, but some monorepos may now get a
different level.

### Fixed

- F3 now finds Knip and NYC configuration inside workspace packages, not only at
  the repository root. Workspace packages come from `pnpm-workspace.yaml`
  `packages` or, without it, the root `package.json` `workspaces`. Before this,
  a pnpm monorepo with `web/app/knip.json` failed F3 (#64).

## [0.1.2] - 2026-11-21

One more scanner fix. The rubric is still v0.1.0, but some repositories may get
a different level.

### Fixed

- The scanner now skips files that the repository's `.gitignore` files or
  `.git/info/exclude` ignore, so a local scan matches what CI sees on a fresh
  checkout. Before this, something like a gitignored `.venv/` or a throwaway
  Python script could make C1 pass or C3 fail in a TypeScript repo. It reads
  the ignore files directly and never runs `git` (#57, #54).

## [0.1.1] - 2026-11-21

Two scanner fixes. The rubric is still v0.1.0, but some repositories may now
get a different level.

### Fixed

- F2 now counts a per-package test or lint step such as
  `pnpm --filter api test` or `npm test -w api`, as long as it names exactly
  one workspace package (#55).
- The scanner no longer reads nested repositories or linked git worktrees
  inside the target. Their files were being counted as part of the scanned
  repository (#54).

## [0.1.0] - 2026-11-20

The first public release of the deterministic, static harness-rating CLI.

### Added

- Scan Claude Code and `AGENTS.md` / Codex project harness configuration without
  executing repository code or following symbolic links.
- Report levels L0–L4 and a separate reference score, with evidence-backed
  checks for guides, computational sensors, enforcement, review, and timing.
- Provide terminal and deterministic JSON output, `--min-level` CI gating,
  `--explain`, and package-manager installation through npm.
- Validate the public rubric and generate its check and level documentation.
- Run CI on Node.js 24 and 26; add source-link monitoring, pre-commit checks,
  and a tag-based npm release workflow with OIDC provenance.

### Documentation

- Publish the specification, accepted-source rubric, validity protocol, and
  English and Korean project guides.
