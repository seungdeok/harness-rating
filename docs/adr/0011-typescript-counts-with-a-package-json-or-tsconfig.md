# ADR 0011: TypeScript makes C3 applicable only with a root package.json or a tsconfig

- Status: Accepted
- Date: 2026-11-28
- Issue: #83

## Context

[ADR 0010](0010-python-counts-with-a-root-manifest.md) requires a `tsconfig*.json` whenever any `.ts`, `.tsx`, `.mts`, or `.cts` file (other than `.d.ts`) is present. Rating the most-starred repository in more languages (#21) found a repository that fails C3 because of files that only have a TypeScript extension:

| Repository | Main language | TypeScript files | Root `package.json` | `tsconfig*.json` |
| --- | --- | --: | --- | --: |
| AlDanial/cloc | Perl | 5, all under `tests/inputs/` | no | 0 |

cloc counts lines of code, and these files are its test inputs. One of them, `i18n_de.ts`, is a Qt translation file, not TypeScript. cloc fails C3 with "TypeScript without tsconfig.json".

Every other repository in the sample with TypeScript has a root `package.json` or a `tsconfig*.json`:

| Repository | TypeScript files | Root `package.json` | `tsconfig*.json` |
| --- | --: | --- | --: |
| freeCodeCamp/freeCodeCamp | 1,006 | yes | 12 |
| facebook/react | 534 | yes | 16 |
| metabase/metabase | 12,905 | yes | 27 |
| plausible/analytics | 236 | no | 3 |
| NixOS/nixpkgs | 28 | no | 4 |

## Decision

This replaces ADR 0010. Only when TypeScript counts changes; the rest restates ADR 0010:

- **Gradually typed, checker configured separately:** TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`; not `.d.ts` alone) counts only when the repository root has a `package.json` or the repository has a `tsconfig*.json` at any depth; it then needs a `tsconfig*.json` at any depth. Python (`.py`, `.pyi`) counts only when the repository root has a Python manifest (`pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, or `Pipfile`) or a Python type checker configuration; it then needs mypy, pyright, basedpyright, or ty configuration.
- **Compiler-checked:** Go, Rust, Java, Kotlin, Scala, C#, F#, Swift, Haskell, Dart, Elm, PureScript, Crystal, Nim, and Zig pass without extra config.
- **Not applicable:** a repository with none of the above, including plain JavaScript, shell, Ruby, PHP, documentation-only repositories, repositories whose only Python files have no root manifest, and repositories whose only TypeScript files have neither a root `package.json` nor a `tsconfig*.json`.
- With several languages, every gradually typed language that counts must have its checker configured.

## Rationale

This applies ADR 0010's reasoning to TypeScript. A TypeScript project declares itself with a `package.json` at its root, where its dependencies, including `typescript`, and its scripts live. A `tsconfig*.json` anywhere also declares one, and already satisfies the check. TypeScript files with neither are not built or checked as TypeScript by the repository's own tooling, so asking for a `tsconfig.json` fails the repository for code it does not treat as part of its product.

The root `package.json` matches ADR 0010's root Python manifest and the scanner's other root-config checks (C1, C2). A TypeScript monorepo keeps a `package.json` at the root for its workspaces, so it still counts.

## Consequences

- ADR 0010 is superseded by this ADR.
- SPEC § Checks, C3 row, links this ADR.
- `src/checks/computational.ts` implements it. On the samples above, only AlDanial/cloc changes.
- A TypeScript project with no `package.json` at the root and no `tsconfig*.json`, such as a Deno project configured only with `deno.json`, is no longer asked for a `tsconfig.json`. Deno type-checks TypeScript without a `tsconfig.json`.
- AlDanial/cloc changes from fail to pass rather than to not applicable: its test inputs also include Go, Rust, and other compiler-checked files, and any such file passes C3. Compiler-checked files that are only test inputs are a separate question, left to a later issue.
