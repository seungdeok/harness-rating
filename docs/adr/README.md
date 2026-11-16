# Architecture decision records

The spec in [`docs/spec/`](../spec/SPEC.md) changes only through an ADR.

1. Write the ADR first, in the same PR as the spec change.
2. Update the spec to reflect only what the ADR decided.
3. When an open question in the spec is decided, record it in an ADR, update the spec, and remove it from the open questions table.

## Files

- Name: `NNNN-short-title.md`, numbered in order (`0001-...`, `0002-...`).
- An accepted ADR is not edited. To change a decision, write a new ADR and set the old one's status to `Superseded by NNNN`.

## Template

```markdown
# ADR NNNN: <decision in one sentence>

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Issue: #N

## Context

What forces the decision. Facts only.

## Decision

What we will do.

## Rationale

Why this option, citing sources where they exist.

## Consequences

What changes in the spec, code, or process as a result.
```
