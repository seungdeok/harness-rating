# ADR 0002: The scanner does not read files larger than 512 KiB

- Status: Accepted
- Date: 2026-11-17
- Issue: #10

## Context

[Principle 7](../spec/SPEC.md#principles) requires a size cap above which the scanner does not read file contents. The spec left the value open with 512 KiB proposed. No source gives a number.

## Decision

- Files larger than 512 KiB (524,288 bytes) are listed with their size, and their contents are never read.
- The cap is an engine constant, not a rubric parameter, because it protects the scanner and does not define a check.
- The value is proposed under [Principle 6](../spec/SPEC.md#principles) and is revisited during [validity checking](../spec/SPEC.md#validity) if a real harness file is above it.

## Rationale

The files checks read (instruction files, agent settings, manifests, linter and CI config) are a few KiB; Anthropic targets instruction files under 200 lines and OpenAI describes one of roughly 100 lines. 512 KiB leaves more than a hundredfold margin while keeping a hostile repository from making the scanner load large files. Lockfiles and generated files can exceed it, but no check needs their contents.

## Consequences

- [SPEC § Principles](../spec/SPEC.md#principles) links this ADR, and the open question is removed.
