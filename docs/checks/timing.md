# Timing checks (F1–F4)

The rules are defined in [SPEC.md](../spec/SPEC.md#level-checks). The implementations
in `src/checks/timing.ts` use the rubric's check names, like the guide checks. CLI
dispatch is not part of this module.

All checks read repository files through the safe scanner. Missing, oversized,
malformed, or unsupported configuration does not supply passing evidence. These
checks apply independently of the detected agent and return pass/fail (the engine
owns agent-support capping). No configuration, hook, script, or remote action is
executed or fetched. Configuration is evidence of setup, not effectiveness.

## Supported detection

- **F1 `pre-commit`:** a non-comment command in `.husky/pre-commit` (ignoring
  shell headers and sourced Husky bootstrap lines); Lefthook `pre-commit.commands`
  or `pre-commit.jobs` with a nonempty `run`, or `pre-commit.scripts` with a runner
  and an existing nonempty script under `.lefthook/pre-commit/`; or pre-commit
  framework `repos[].hooks[]` with a repository and hook ID enabled for the
  pre-commit stage. Local framework hooks also need an `entry`. Lefthook YAML/JSON
  files at the root or in `.config/`, with or without a leading dot, are read.
  Framework hook `stages` override `default_stages`; pre-push-only hooks and
  Lefthook entries with `skip: true` do not count.
- **F2 `ci-tests-and-lint`:** at least one `.github/workflows/*.yml` or `*.yaml`
  invokes both test and lint package scripts through `jobs.*.steps[].run`.
  Different jobs in the same workflow may supply each script; different workflow
  files cannot be combined. Direct `npm`, `pnpm`, `yarn`, and `bun` invocations
  are recognized. npm requires `run`/`run-script` for custom scripts, with bare
  `npm test` also accepted. pnpm supports `run`, `run-script`, and bare script
  names; Yarn supports `run` and bare script names. Bun requires `run` because
  its bare `test` and `lint` are built-ins. Names are `test`, `lint`, or
  colon/hyphen variants such as `test:unit` and `lint:ci`. Both invoked scripts
  must have nonempty definitions in the selected `package.json`.
  Literal `working-directory` settings follow step → job → workflow precedence;
  literal `cd` changes apply only within the current run step. The nearest parent
  manifest inside the repository is used. Directory components must be backed
  by files in the safe inventory before resolving `..`; trailing slashes and
  `.` have equivalent canonical identities. Explicitly false job/step conditions
  are ignored. Other conditions are not evaluated.
- **F3 `drift-sensor`:** Dependabot YAML with version 2 and an update entry
  containing an ecosystem, directory/directories, and schedule interval;
  Renovate JSON with `extends`, `packageRules`, or `enabled` (unless disabled);
  Knip JSON with `entry`, `project`, `workspaces`, or `include`; NYC JSON/YAML
  with a recognized nonempty coverage setting; or `.coveragerc` with an option
  in a coverage section. Root `package.json` fields `renovate`, `knip`, and `nyc`
  are also read. Knip and NYC configuration (files and `package.json` fields) is
  also read in each workspace package: a directory with a `package.json` that
  matches `pnpm-workspace.yaml` `packages` or, without it, the root
  `package.json` `workspaces`. Dependabot, Renovate, and Coverage.py are read at
  the root only. Recognized file paths are listed directly in the implementation.
  An empty object, empty list, or dependency declaration alone does not count.
- **F4 `scheduled-workflow`:** a GitHub Actions workflow with a jobs mapping and
  `on.schedule[]` containing a five-field cron expression (including month/day
  names). The scanner
  does not judge whether a scheduled command performs useful cleanup.

## Deliberate v0.1 boundaries

YAML uses YAML 1.2 (so an unquoted `on` is a string key), rejects malformed and
duplicate-key documents, and keeps the parser's alias-expansion limit. JSON is
strict JSON, including extensionless JSON configuration files.

F2 recognizes literal shell commands, not an arbitrary shell program. Quoted
messages and comments do not count. Heredocs, subshells, command substitutions,
package/workspace selectors, dynamic directories, non-POSIX explicit shells,
script aliases, external shell files, reusable actions/workflows, and non-Node
check runners are not resolved. F1 uses the same bounded shell lexer for command
presence. Custom Husky directories, Lefthook TOML, JSONC/JSON5, executable JS/TS
configuration, and other drift tools are not supported in this slice.

## Configuration references

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Husky how-to](https://typicode.github.io/husky/how-to.html)
- [Lefthook configuration](https://lefthook.dev/configuration/)
- [pre-commit configuration](https://pre-commit.com/#adding-pre-commit-plugins-to-your-project)
- [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [Renovate configuration](https://docs.renovatebot.com/configuration-options/)
- [Knip configuration](https://knip.dev/overview/configuration)
- [NYC configuration](https://github.com/istanbuljs/nyc#configuration-files)
- [Coverage.py configuration](https://coverage.readthedocs.io/en/latest/config.html)
- [npm run](https://docs.npmjs.com/cli/v11/commands/npm-run/)
- [pnpm run](https://pnpm.io/cli/run)
- [Yarn run](https://yarnpkg.com/cli/run)
- [Bun package scripts](https://bun.sh/docs/runtime#run-a-package-json-script)
