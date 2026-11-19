# ADR 0007: D2 counts a hook only when it runs a check entry point defined in the repository

- Status: Accepted
- Date: 2026-11-18
- Issue: #14

## Context

D2 passes when "a hook command invokes a test or lint script **that exists in the repository**, not merely a command containing a keyword" ([SPEC § Level checks](../spec/SPEC.md#level-checks)). The spec left open which scripts count. The rubric's source for D2 is Anthropic's recommendation to enforce a passing typecheck with a `Stop` hook, which runs the repository's own check.

## Decision

A hook passes D2 when it is a `command` hook and one of its simple commands (the command split on `&&`, `||`, `;`, `|`, and newlines, with leading `NAME=value` assignments removed) invokes a **check entry point**:

1. A script in the root `package.json`, run through `npm test`, `npm t`, `npm run <name>`, `pnpm <name>`, `yarn <name>`, or `bun run <name>`, where the script is defined with a non-empty command.
2. A target in the root `Makefile` (`make <name>`) or `justfile` (`just <name>`) that is defined there.
3. A file in the repository, run directly or through `sh`, `bash`, `zsh`, `node`, or `python`, given as a relative path or under `$CLAUDE_PROJECT_DIR/`, whose own lines contain an invocation of type 1 or 2. Only one file is followed; a script called from that script is not.

For types 1 and 2, the name must be `test`, `tests`, `lint`, `typecheck`, `type-check`, `check`, or `verify`, alone or joined to other words by `:`, `-`, or `_` (`test:unit`, `lint-ci`).

These do not count:

- Commands that only contain a keyword, such as `echo test`.
- Test or lint tools called directly, such as `pytest`, `go test ./...`, or `npx eslint .`. Repositories without a `package.json` wrap them in a `Makefile`, `justfile`, or script file.
- Hooks of other types (`prompt`, `agent`, `http`), and paths outside the repository.

## Rationale

The spec requires the script to exist in the repository, so the check resolves the name the hook calls to a definition the scanner can read. A direct tool call has no such definition: it runs whatever the tool finds, and the scanner cannot tell whether the repository configured it. Checking the entry point's name keeps builds and formatters out without guessing what an arbitrary command does. Following one script file covers the common `.claude/hooks/*.sh` pattern while keeping the scan bounded.

As [§ Limitations](../spec/SPEC.md#limitations) states, a defined script with empty tests still passes.

## Consequences

- SPEC § Level checks links this ADR from D2, and the D2 row leaves § Open questions.
- `src/checks/enforcement.ts` implements the rule, with tests for each entry-point type and for `echo test`.
- Repositories that call tools directly from hooks fail D2 until they add an entry point.
