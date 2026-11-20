# Changelog

All notable changes to `harness-rating` are recorded here.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The CLI version is independent of the rubric version.

## [0.1.0] - Unreleased

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
