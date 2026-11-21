# Changelog

All notable changes to `harness-rating` are recorded here.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The CLI version is independent of the rubric version.

## [0.1.1] - Unreleased

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
