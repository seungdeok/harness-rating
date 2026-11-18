# ADR 0006: Validity checking runs reverted-PR tasks on TypeScript and JavaScript repositories, with the agent and model as recorded parameters

- Status: Accepted
- Date: 2026-11-18
- Issue: #20

## Context

[SPEC § Validity](../spec/SPEC.md#validity) fixes the shape of validity checking: 8–10 public repositories spread across levels, 5 tasks per repository, 3 runs per task with the same model and agent, and a Spearman correlation between level and completion rate. It left the model, agent, repository selection, and tasks open.

Two facts shape the choice:

- Completion rates depend on the model and agent as much as on the harness, and anyone rerunning the protocol will use whatever model they have. A protocol tied to one model cannot be rerun.
- Each agent sees a different part of a harness. Codex reads `AGENTS.md` and `.codex/`; Claude Code reads `CLAUDE.md` and `.claude/`, and reads `AGENTS.md` only when no `CLAUDE.md` exists ([Claude Code memory docs](https://code.claude.com/docs/en/memory)).

## Decision

- **Agent and model are parameters.** One study uses one agent version and one model ID for every run, and records both. Results from different configurations are reported separately and never pooled.
- **The official study (#21) runs two configurations:** Claude Code with `claude-sonnet-5-5`, and Codex CLI with the model ID chosen and recorded when the study starts.
- **Repositories:** public, TypeScript or JavaScript, single-package, with a test command that runs offline. The list is chosen by the criteria in [`docs/validity.md`](../validity.md) and committed before any task runs.
- **Tasks:** five types built from merged pull requests by reverting the PR's source changes on a pinned snapshot, and graded by the PR's own tests. History is removed from the task repository so the solution cannot be read back.
- **Each run** starts from a fresh copy of the task repository and an empty user-level config directory, so only the committed harness is visible. A preflight canary run per repository and configuration records which parts of the harness the agent actually loaded.
- **Analysis:** completion rate per repository and configuration (successes out of 15), Spearman ρ against level per configuration with an exact permutation p-value, and raw per-run results published alongside.

## Rationale

Making the model a parameter turns "the model differs" from a reason the result cannot be reproduced into a variable that is recorded and compared. Two official configurations show whether a correlation survives a change of agent and model, and they cover both instruction-file conventions the v0.1 adapters read.

Reverted PRs give tasks that real maintainers needed, with tests the maintainers wrote, so neither task difficulty nor grading is set by this project. Limiting the sample to one language family and to single-package repositories keeps language and monorepo effects out of a sample too small to separate them, and matches the v0.1 scanner, which reads root config only.

## Consequences

- `docs/validity.md` holds the protocol, specific enough to rerun from the document alone; #21 adds results to it.
- SPEC § Validity links this ADR, and the validity row leaves § Open questions. With no open questions left, that section is removed.
- Claims from the study are limited to the configurations run; the spec's [limitation](../spec/SPEC.md#limitations) on validity claims is unchanged.
