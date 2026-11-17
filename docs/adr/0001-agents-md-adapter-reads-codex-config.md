# ADR 0001: The AGENTS.md adapter reads Codex project config, so D1, D2, and E1 are supported for `agents-md`

- Status: Accepted
- Date: 2026-11-17
- Issue: #5

## Context

The spec's capped-check example assumed that a repository using only `AGENTS.md` has no way to declare hooks or a review step, so D1, D2, and E1 would be capped for `agents-md`. Issue #5 had to check whether OpenAI Codex, the agent behind `AGENTS.md`, supports repository-level hooks and review subagents.

The Codex documentation, checked on 2026-11-17, shows that it does:

- [Hooks](https://learn.chatgpt.com/codex/hooks): `<repo>/.codex/hooks.json` and `[hooks]` in `<repo>/.codex/config.toml`, loaded once the project is trusted.
- [Subagents](https://learn.chatgpt.com/codex/agent-configuration/subagents): project-scoped custom agents in `.codex/agents/`.
- [Build skills](https://learn.chatgpt.com/codex/build-skills): repository skills in `.agents/skills`.
- [Code review](https://learn.chatgpt.com/codex/code-review): a built-in `/review` command.

These are product reference pages, so they decide what the adapter can detect, not which checks enter the rubric ([source rules](../spec/SPEC.md#source-rules)).

## Decision

- The `agents-md` adapter also reads Codex project config: hooks, custom agents, and skills.
- The rubric lists `agents-md` in `supported_by` for D1, D2, and E1. A repository with `AGENTS.md` but none of this config fails them.
- The built-in `/review` command does not pass E1. It is part of the product, not something defined in the repository.
- Codex is not a separate agent; the `agents-md` adapter covers it.

## Rationale

[Capped](../spec/SPEC.md#capped-checks) is for checks the tool cannot evaluate. Codex has documented repository-level equivalents of Claude Code hooks, skills, and subagents, so these checks can be evaluated. Keeping them capped would hide a missing harness behind a tool limitation.

## Consequences

- SPEC § Scope links this ADR, and the § Capped checks example no longer uses an `AGENTS.md`-only repository.
