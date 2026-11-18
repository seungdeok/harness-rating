# ADR 0004: Not-applicable checks drop out of level requirements

- Status: Accepted
- Date: 2026-11-18
- Issue: #16

## Context

[SPEC § Checks](../spec/SPEC.md#checks) reports a check that does not apply as not applicable, and [§ Reference score](../spec/SPEC.md#reference-score) removes it from the score. The spec does not say how a not-applicable check affects a level requirement. In rubric v0.1, C3 (type checking) is not applicable without a type-checkable language and sits in L2 as `any_of: [C2, C3]`; A2–A4 are not applicable without an instruction file.

## Decision

- A not-applicable check is removed from the group it belongs to: an `all_of` (including a level's top-level `requires`) no longer needs it, and an `any_of` is decided by its remaining members.
- A group whose members are all not applicable is satisfied.

## Rationale

Treating not applicable as a pass would let a repository meet `any_of: [C2, C3]` with no linter just because it has no typed code. Treating it as a fail would make L2 unreachable for a repository that cannot have a type checker. Removing the check keeps the requirement meaningful for what does apply, which matches how the score already handles it.

## Consequences

- SPEC § Levels states the rule.
- `src/level.ts` implements it, with tests for a not-applicable check inside `any_of` and as a direct requirement.
