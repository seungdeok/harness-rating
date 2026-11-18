# ADR 0005: Which languages make C3 applicable, and how each passes

- Status: Accepted
- Date: 2026-11-18
- Issue: #13

## Context

SPEC C3 detects "type checker config" and is "not applicable without a type-checkable language", but does not say which languages are type-checkable. The answer decides L2 for many repositories, because L2 needs C1 and either C2 or C3, and a not-applicable C3 drops out ([ADR 0004](0004-not-applicable-checks-in-levels.md)).

## Decision

- **Gradually typed, checker configured separately:** TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`; not `.d.ts` alone) needs a `tsconfig*.json` at any depth. Python (`.py`, `.pyi`) needs mypy, pyright, basedpyright, or ty configuration.
- **Compiler-checked:** Go, Rust, Java, Kotlin, Scala, C#, F#, Swift, Haskell, Dart, Elm, PureScript, Crystal, Nim, and Zig pass without extra config.
- **Not applicable:** a repository with none of the above, including plain JavaScript, shell, Ruby, PHP, and documentation-only repositories.
- With several languages, every gradually typed language present must have its checker configured.

## Rationale

Böckeler notes that "a codebase written in a strongly typed language naturally has type-checking as a sensor", so asking compiler-checked languages for config would fail repositories that already have the sensor. TypeScript and Python have widely used checkers that must be set up to run. JavaScript, Ruby, and PHP checkers (JSDoc `checkJs`, Sorbet, PHPStan) exist but are opt-in add-ons rather than the language's standard path; treating those languages as not applicable keeps L2 decided by C1 and C2 for them instead of failing them.

## Consequences

- SPEC § Checks, C3 row, states the rule and links this ADR.
- `src/checks/computational.ts` implements it. Adding a language is a change to this ADR.
