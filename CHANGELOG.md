# Changelog

All notable changes to the CLI are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the CLI follows [Semantic Versioning](https://semver.org/).

The CLI and the rubric are versioned separately (see the spec's [versioning](docs/spec/SPEC.md#versioning)). Rubric changes are listed with their rubric version.

## [Unreleased]

### Added

- Rubric v0.1.0 with 14 level checks, its JSON schema, and a validator.
- Fixed source list `rubric/sources.yaml`.
- Safe repository walker that does not follow symbolic links, stays inside the repository, and caps file size.
- Detection of Claude Code and `AGENTS.md` (including Codex project config) and reading of their project config.
