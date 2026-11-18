# Validity

Does a higher `harness-rating` level go with agents completing more real tasks? This document is the protocol for answering that question ([ADR 0006](adr/0006-validity-protocol.md)) and, once it has been run, the results.

- Protocol: defined (this document)
- Results: not yet published (#21)

## What a study measures

A **study** runs one **configuration** (an agent version and a model ID) on every task below, 3 times each. It reports, per repository, the **completion rate** (successful runs out of 15) and, across repositories, the **Spearman rank correlation** between level and completion rate.

The official study runs two configurations:

| Configuration | Agent | Model |
| --- | --- | --- |
| A | Claude Code, version recorded at start | `claude-sonnet-5-5` |
| B | Codex CLI, version recorded at start | Model ID chosen and recorded at start |

Anyone can rerun the protocol with another configuration. Results from different configurations are reported side by side and never pooled.

## 1. Record the study parameters

Before selecting anything, write `docs/validity/<study>/study.json`:

```json
{
  "study": "2026-12-official-a",
  "agent": "claude-code",
  "agent_version": "output of `claude --version`",
  "model": "claude-sonnet-5-5",
  "harness_rating_version": "the release used, e.g. 0.1.0",
  "rubric_version": "0.1.0",
  "node_version": "output of `node --version`",
  "started": "YYYY-MM-DD"
}
```

Every number later in the study refers to these values. Changing any of them starts a new study. All times are UTC, and every command below runs from the root of the repository or task repository it names.

## 2. Select repositories

A repository qualifies when all of these hold at a chosen commit, its **snapshot**:

1. Public on GitHub under an OSI-approved license.
2. TypeScript or JavaScript is at least 80% of the code by GitHub's language breakdown.
3. One package: no npm, pnpm, or Yarn workspaces, because v0.1 scans root config only.
4. `npm ci && npm test` (or the repository's documented equivalents) succeeds in the container from [step 4](#4-run) with no network access after installation and no secrets or external services.
5. At least five merged pull requests that qualify as tasks ([step 3](#3-build-tasks)), one for each task type.

To select:

1. Gather candidates with the GitHub search `language:TypeScript stars:>=500 pushed:>=<start date minus 90 days>` and the same with `language:JavaScript`, keeping the first 300 results of each, sorted by stars.
2. Pick each candidate's snapshot: the last commit on the default branch before 00:00 UTC on the study's start date.
3. Run `npx harness-rating@<harness_rating_version> . --json level.json` at the snapshot and keep the level and reference score.
4. Group candidates by level. Within each level, go down the list in order of stars and check criteria 1–5 until 2 repositories qualify. If a level runs out with fewer than 2, take what qualified; if fewer than 8 qualify in total, stop and report that instead of running the study.
5. Commit `docs/validity/<study>/repos.json` (name, URL, snapshot SHA, level, reference score, which agents' harness files exist) **before running any task**, so the selection cannot be adjusted after seeing results.

## 3. Build tasks

Each repository gets one task of each type. A task comes from a pull request merged before the snapshot, with the newest qualifying PR chosen for each type.

Definitions used below:

- A **test file** is a file matching `**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}` or any file under a `test/`, `tests/`, or `__tests__/` directory. Every other non-config file under the repository's source directories is a **source file**; lockfiles, generated files, docs, and config are neither.
- A **test** is one test case as reported by the repository's test runner. Run the test command with the runner's JSON reporter (for example `vitest --reporter=json`, `jest --json`, `node --test --test-reporter=tap`) so results can be compared per case.
- The **PR diff** is `git diff <merge-commit>^1 <merge-commit>`, which works the same for merge, squash, and rebase merges.
- **Bug labels** are `bug`, `type: bug`, `kind/bug`, and `type/bug`, compared case-insensitively. **Feature labels** are `feature`, `enhancement`, `type: feature`, `kind/feature`, and `type/feature`. A **feat title** matches `^feat(\(.*\))?!?:`. A PR **closes an issue** when GitHub lists the issue as linked (closing keyword or manual link).

| Type | The PR | What the agent is given |
| --- | --- | --- |
| T1 Fix a failing test | Changes source and adds or changes a test that fails without the source change | The failing test's name and its failure output |
| T2 Fix a reported bug | Closes an issue labeled as a bug | The issue title and body |
| T3 Add a feature | Closes an issue labeled as a feature or enhancement, or has a `feat` title | The issue title and body, or the PR title and description |
| T4 Refactor | Labeled or titled as a refactor, and its tests call the new structure (renamed or moved functions, changed signatures) | The PR title and description |
| T5 Multi-file change | Changes at least three non-test source files | The PR title and description |

A PR qualifies only if:

- Its diff to source files is at most 300 changed lines (additions plus deletions).
- Its tests fail on the task repository and pass on the snapshot (checked in step 3.3).
- Its title and description, with every fenced code block removed, still describe the change. Remove fenced code blocks from every given text.
- One PR fills at most one type. When a PR qualifies for several, it is assigned to the first type in the order T1 to T5 that still needs a task.

To build each task:

1. Copy the snapshot's working tree, without `.git`.
2. Reverse-apply the PR diff's changes to source files (`git apply -R`). If the reverse patch does not apply cleanly, the PR does not qualify; take the next one.
3. For each test file the PR added, remove it; for each test file the PR changed, restore its version from before the PR. Keep the snapshot's versions of those files as the **hidden test files**, and the test cases the PR added or changed as the **hidden tests**. For T1, leave the failing test file in place instead, as the visible failing test. Run the hidden tests on the task repository and on the snapshot: they must fail and pass respectively.
4. Run the full test command on the snapshot 3 times. Tests that fail in any of those runs are **flaky** and excluded from grading.
5. Initialize a new git repository in the task tree with one commit, so the agent cannot read the solution from history.
6. Write the task text to `task.md` using this template, filling only `<given text>` from the table above:

   ```text
   Complete the following task in this repository. There is no one to answer questions, so make reasonable decisions and finish the task.

   <given text>
   ```

7. Commit the task manifest, `docs/validity/<study>/tasks.json` (repository, type, PR URL, hidden test files, excluded flaky tests).

## 4. Run

Every run happens in a disposable container (Node version from `study.json`) with dependencies installed before the agent starts. The container is the sandbox, so the agent runs with permission prompts bypassed.

Each run:

1. Starts from a fresh copy of the task repository.
2. Uses an empty user-level config directory, so only the repository's committed harness is visible. Credentials come from environment variables or a copied auth file and nothing else.
3. Has network egress only to the model provider's API hosts, so the agent cannot fetch the original PR or install new packages.
4. Stops after 30 minutes of wall-clock time (`timeout 30m`); a run that hits it fails. There is no turn limit, because Codex has none to set; turns are recorded instead.

Configuration A (Claude Code):

```sh
CLAUDE_CONFIG_DIR="$(mktemp -d)" timeout 30m claude -p "$(cat task.md)" \
  --model claude-sonnet-5-5 \
  --setting-sources project,local \
  --permission-mode bypassPermissions \
  --output-format json > run.json
```

Configuration B (Codex CLI), with `CODEX_HOME` holding only the copied `auth.json`:

```sh
export CODEX_HOME="$(mktemp -d)"
cp /path/to/auth.json "$CODEX_HOME/"
MODEL="$(jq -r .model study.json)"
timeout 30m codex exec "$(cat task.md)" \
  -m "$MODEL" \
  --trust \
  --dangerously-bypass-hook-trust \
  --dangerously-bypass-approvals-and-sandbox \
  --json > run.jsonl
```

Turns are `num_turns` in `run.json` for Claude Code and the number of `turn.completed` events in `run.jsonl` for Codex. `--trust` is needed because Codex skips a repository's `.codex/` config and hooks unless the project is trusted; with a fresh `CODEX_HOME`, that trust is discarded with the directory.

### Preflight

Before the tasks, run each repository once per configuration with this prompt and save the output:

```text
Without using any tools, list every instruction file, skill, subagent, and hook you were given for this repository, and quote the first line of each instruction file.
```

Record in `docs/validity/<study>/preflight.json` which of the repository's harness files the agent reported. A repository is **not visible** to a configuration when any instruction file, skill, subagent, or hooks file the agent is documented to read was not reported. L0 repositories have no harness to see and are never marked. The results table marks the repositories that are not visible, and the correlation is also reported without them.

## 5. Grade

After a run:

1. Copy the hidden tests back into the task repository, overwriting any changes the agent made to those paths. For T1, also restore the visible failing test to its original content.
2. Run the full test command once.

The run **succeeds** when every hidden test passes and every test that passed on the snapshot (excluding flaky ones) still passes. Nothing else counts: no partial credit and no judgment of code quality.

A run that ends in an infrastructure error (the model API returning 5xx or 429, or the container failing) is rerun, up to 2 times; if it still fails it is recorded as an infrastructure error and left out of the completion rate's numerator and denominator. Every other ending, including the agent giving up or erroring on its own output, counts as a failure.

Record per run: study, repository, level, reference score, task type, run number, success, failure reason (test failure, timeout, agent error, infrastructure error), turns, duration, and cost when the agent reports it.

## 6. Analyze

1. Completion rate per repository: successful runs out of 15 (5 tasks × 3 runs), less any runs left out for infrastructure errors.
2. Spearman ρ between level (0–4) and completion rate across repositories, using average ranks for ties.
3. A two-sided p-value by exact permutation: the share of all orderings of the completion rates (at most 10! = 3,628,800) whose |ρ| is at least the observed |ρ|. Do not use the t approximation, which is poor at this sample size.
4. The same with the reference score in place of the level, as a secondary result. Repositories whose score is null (no check counted) are left out of this step.
5. Steps 2–4 again without repositories whose harness the preflight showed the agent could not see.

With 8–10 repositories only large correlations are distinguishable from chance. The results state this and do not claim more than the numbers show.

If no correlation appears, a follow-up issue revisits checks and level placement before release ([SPEC § Validity](spec/SPEC.md#validity)). Changes to thresholds or detection parameters go through an ADR.

## 7. Publish

Add to this document, per configuration:

- The study parameters and the repository table (level, score, completion rate).
- ρ and p for level and for reference score, with and without preflight exclusions.
- A link to `docs/validity/<study>/results.csv` holding every run from step 5.

## Threats to validity

- **Task difficulty differs between repositories**, and difficulty may itself relate to how carefully a repository is maintained, which also raises its level. Taking every task from real PRs with the maintainers' tests keeps difficulty out of this project's hands, but does not remove the confound.
- **Contamination.** A model may have seen a PR during training. Record each PR's merge date against the model's published training cutoff when one is available.
- **Harness visibility.** Codex does not read `CLAUDE.md` or `.claude/`; Claude Code ignores `AGENTS.md` when a `CLAUDE.md` exists. A level can therefore count files the running agent never sees. The preflight records this, and the analysis reports results with and without those repositories.
- **Hidden tests may under-specify the task**, so a run can pass without the intended change, or fail on a correct change the tests did not anticipate.
- **One snapshot per repository.** The level is measured at the snapshot, while the reverted PRs were written under whatever harness existed at the time.
