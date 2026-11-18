# Changelog

All notable changes to the CLI are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the CLI follows [Semantic Versioning](https://semver.org/).

The CLI and the rubric are versioned separately (see the spec's [versioning](docs/spec/SPEC.md#versioning)). Rubric changes are listed with their rubric version.

## [Unreleased]

### Added

- Rubric v0.1.0: the 14 checks that decide levels L1–L4, with a schema that rejects malformed rubric files.
- `rubric/sources.yaml`: the list of public documents the checks cite.
- Repository scanning that never follows symbolic links, never reads outside the repository, and skips files larger than 512 KB.
- Detection of Claude Code and `AGENTS.md` (including Codex's `.codex/config.toml`) and reading of their settings committed to the repository.
