# ADR 0008: Add a TOML parser as a runtime dependency to read Codex config

- Status: Accepted
- Date: 2026-11-19
- Issue: #46

## Context

[ADR 0001](0001-agents-md-adapter-reads-codex-config.md) makes the `agents-md` adapter read Codex project config. Two parts of that config are TOML, and the spec allowed only YAML and JSON parsing at runtime, so they were not read:

- Inline hooks in `.codex/config.toml`. The [Codex hooks docs](https://learn.chatgpt.com/docs/hooks), checked on 2026-11-19, say "In each directory, you can also declare hooks inline under `[hooks]` in `config.toml`", using the same event, matcher group, and handler levels as `hooks.json`. When a layer has both, "Codex loads both and warns at startup."
- Custom agents in `.codex/agents/*.toml`. The [subagents docs](https://learn.chatgpt.com/docs/agent-configuration/subagents) list `name`, `description`, and `developer_instructions` as required fields, and their examples write `developer_instructions` as a multi-line string.

A repository that declared its hooks only in `config.toml` failed D1 and D2, and E1 read agent TOML with a single-line regex.

## Decision

- Add [`smol-toml`](https://www.npmjs.com/package/smol-toml) as a runtime dependency. It has no dependencies of its own and parses TOML 1.0.
- The `agents-md` adapter reads hooks from both `.codex/hooks.json` and `[hooks]` in `.codex/config.toml`, and keeps the hooks from both.
- E1 reads `name` and `description` from parsed Codex agent TOML.
- Malformed `config.toml` is reported in the agent's errors, like malformed hooks JSON. A malformed agent file counts only by its file name.
- Other `config.toml` keys are not read.

## Rationale

Codex documents `config.toml` hooks as equal to `hooks.json`, so ignoring them marks a harness as missing when it is not. A regex over TOML misses multi-line strings and quoting rules; a parser does not. `smol-toml` adds no transitive dependencies, which keeps the install as small as the YAML-only one.

## Consequences

- SPEC § Technology allows TOML parsing as a runtime dependency.
- The `agents-md` adapter reads `.codex/config.toml`; a repository with only that file is detected as `agents-md`, as with `.codex/hooks.json`.
