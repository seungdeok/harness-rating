# ADR 0010: Python makes C3 applicable only with a root manifest or a configured checker

- Status: Superseded by 0011
- Date: 2026-11-25
- Issue: #74

## Context

[ADR 0005](0005-type-checkable-languages.md) requires a Python type checker whenever any `.py` or `.pyi` file is present. Rating the most-starred repository per language (#21) showed this fails repositories whose code is in another language and whose Python files are build or helper scripts:

| Repository | Main language | Python files | Root Python manifest |
| --- | --- | --: | --- |
| golang/go | Go | 2 of 16,642 | none |
| 2dust/v2rayN | C# | 3 of 626 | none |
| rustdesk/rustdesk | Rust | 20 of 1,113 | none |
| NationalSecurityAgency/ghidra | Java | 146 of 20,695 | none |
| flutter/flutter | Dart | 106 of 16,378 | none |
| swiftlang/swift | Swift | 293 of 34,427 | none |
| torvalds/linux | C | 455 of 97,393 | none |

All seven fail C3 with "Python without a mypy, pyright, or ty configuration". The one Python project in the sample, yt-dlp/yt-dlp, has a root `pyproject.toml`.

## Decision

This replaces ADR 0005. Only when Python counts changes; the rest restates ADR 0005:

- **Gradually typed, checker configured separately:** TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`; not `.d.ts` alone) needs a `tsconfig*.json` at any depth. Python (`.py`, `.pyi`) counts only when the repository root has a Python manifest (`pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, or `Pipfile`) or a Python type checker configuration; it then needs mypy, pyright, basedpyright, or ty configuration.
- **Compiler-checked:** Go, Rust, Java, Kotlin, Scala, C#, F#, Swift, Haskell, Dart, Elm, PureScript, Crystal, Nim, and Zig pass without extra config.
- **Not applicable:** a repository with none of the above, including plain JavaScript, shell, Ruby, PHP, documentation-only repositories, and repositories whose only Python files have no root manifest.
- With several languages, every gradually typed language that counts must have its checker configured.

## Rationale

The rest of ADR 0005's rationale holds: Böckeler notes that "a codebase written in a strongly typed language naturally has type-checking as a sensor", and the checkers for JavaScript, Ruby, and PHP are opt-in add-ons rather than the language's standard path.

A Python project declares itself with a manifest at its root; that is where its dependencies and tool configuration, including mypy and pyright sections, live. Python files without one are scripts that the repository's own language and tooling do not treat as a project, so asking for a Python type checker there fails the repository for code it does not consider part of its product. Reading manifests at the root only matches the scanner's other root-config checks (C1, C2).

A file-share threshold was considered and rejected: no source gives a value, and any value would be arbitrary.

## Consequences

- ADR 0005 is superseded by this ADR.
- SPEC § Checks, C3 row, links this ADR.
- `src/checks/computational.ts` implements it. On the repositories above, C3 changes from fail to pass; torvalds/linux passes through its Rust code.
- A Python-only repository without a root manifest, such as a collection of scripts, is no longer asked for a type checker.
- A large Python codebase whose packaging sits below the root is no longer asked for a type checker either. tensorflow/tensorflow (3,233 Python files, `setup.py` under `tensorflow/tools/pip_package/`) now passes C3 through its Go, Java, and Swift bindings. This is the same root-only limit as C1 and C2, and is revisited with per-package config.
