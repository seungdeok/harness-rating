# harness-rating specification

- Status: Draft
- Version: 0.1
- Last updated: 2026-11-17

This is the normative spec for `harness-rating`. It changes only through an ADR; see [`docs/adr/README.md`](../adr/README.md).

The spec owns rules and the meaning of each check. The rubric data (`rubric/*.yaml`) owns sources, evidence tiers, detection parameters, and agent support. `docs/rubric.md` is generated from the rubric data.

## Summary

`harness-rating` is an open-source CLI that statically reads the AI coding agent harness in a repository (instruction files, skills, hooks, tests, CI, and so on) and assigns a level from L0 to L4.

- Every check is backed by an explicit recommendation in a public primary source.
- Individuals and organizations can use the level as a pass/fail gate in CI.

## Motivation

- Organizations increasingly measure the harnesses their engineers build and use the result as a bar, but those criteria are mostly internal.
- Existing public tools do not let you trace **why** a check counts back to a primary source.
- Tying criteria to public sources lets companies layer their own criteria on top, and lets individuals check themselves in advance.

## Measurement target

**The official level is determined from the repository alone.**

| Criterion | Repository | User-global config (e.g. `~/.claude/`) |
| --- | --- | --- |
| Reproducibility | Committed; anyone gets the same result | Exists only on one machine |
| Verifiability | A reviewer can inspect it | Cannot be inspected; can be staged right before evaluation |
| Fit with sources | The sources describe harnesses built into the codebase and committed to git | Not covered by the sources |
| Privacy | Meant to be shared | May contain personal data or secrets |

To evaluate an individual's harness:

1. The company provides an **evaluation repository**: a task repository with no harness (L0).
2. The candidate adds their harness to it and submits it.
3. `harness-rating` scans the submitted repository and reports the level.

From v0.2, `--include-user` also reads known global paths and reports a separate **reference level**. The reference level is never used by the gate, and the report shows only paths and results for global files, never their contents.

## Principles

1. **Deterministic.** The tool only reads files and parses config. It makes no model calls, no network requests, sends no telemetry, and never executes code from the scanned repository. The same input and the same rubric version always produce the same result.
2. **Traceable to sources.** Every check carries a primary-source URL, a summary of the recommendation, and the date it was checked. A check without a source cannot enter the rubric.
3. **Rubric separate from engine.** The rubric is a versioned data file; the engine only executes it. Organizations can override the rubric and keep their own criteria private.
4. **Independent implementation.** Ideas from existing tools (maturity levels, CI gates) may inform the design, but code, check lists, level names, and wording are not copied.
5. **Resist common workarounds.** Checks look at content, not just file existence, so trivial workarounds such as empty files fail. Static scanning cannot stop deliberate gaming (see [Limitations](#limitations)).
6. **No unsupported numbers.** Levels are lists of required checks, structured like [SLSA levels](https://slsa.dev/spec/v1.0/levels). Weights come from source counts, using [OpenSSF Scorecard](https://scorecard.dev/)'s values. There are no percentage thresholds. A detection parameter uses the source's number when the source gives one; otherwise it is marked as proposed and calibrated during [validity checking](#validity).
7. **Safe scanning.** The scanner does not follow symbolic links, does not read paths outside the repository, and does not read the contents of files above a size cap (proposed; see [ADR 0002](../adr/0002-file-size-cap.md)).

## Scope

### v0.1 (MVP)

- Static scan CLI (`npx harness-rating`)
- The 14 [level checks](#level-checks)
- Output: terminal summary and JSON
- Gate: `--min-level` only
- Agents: Claude Code and `AGENTS.md` (including Codex project config; see [ADR 0001](../adr/0001-agents-md-adapter-reads-codex-config.md))

### Later versions

- v0.2: [score-only checks](#score-only-checks), Markdown report, GitHub Action, `--include-user`, `--rubric`
- v0.3: Gemini CLI and Grok Build adapters, organization rubric inheritance (`extends`)

### Out of scope

- **Execution-based evaluation** (running real tasks and grading the result) is not a product feature. A reduced form is used only for [validity checking](#validity).
- LLM-based grading of harness quality.
- Web dashboards and organization-level aggregation.

## Source rules

The fixed list of source documents lives in `rubric/sources.yaml`. Evidence tiers are computed only from that list.

What counts as evidence:

- **Only explicit recommendations count.** A sentence counts only if it says what to do ("do X", "we recommend X", "X is followed more reliably"). A sentence that only describes a feature ("X is supported") does not count. The same rule applies to product docs.
- **Count per organization.** Several documents from one organization count as one.
- **Derived support does not count.** Support for another organization's convention for compatibility (for example, reading another vendor's instruction file) is not independent evidence.
- **Silence is not opposition.** A low tier means less agreement, not less importance. That is why levels do not depend on tiers.

Which documents are accepted:

- Accepted: official documentation or engineering blogs of each company, articles on martinfowler.com, peer-reviewed papers.
- Not accepted: personal blogs, summaries, other tools' check lists.

## Checks

Dimensions follow Böckeler's framework in [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html): guides and sensors, computational and inferential, timing. Dimensions only group the report.

Check selection rules:

- **Do not rely on file existence alone.** Include checks that inspect content, such as A3, A4, and D2.
- **Exclude non-applicable checks.** A check that does not apply to a repository (for example, C3 in a repository with no type-checkable language) is reported as not applicable.
- **Leave out what cannot be judged statically.** For example, "lint error messages should explain how to fix the problem" stays a candidate because files alone cannot show it.

### Level checks

| ID | Dimension | Check | Detection |
| --- | --- | --- | --- |
| A1 | guides | An agent instruction file exists | At least one of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` |
| A2 | guides | The instruction file is short | Line count at or below a cap |
| A3 | guides | Build and test commands are documented | Code blocks or command patterns in the instruction file |
| A4 | guides | Referenced files exist | Markdown links and `@` import paths resolve inside the repository |
| C1 | computational sensors | A test suite and a command to run it exist | Test config and scripts |
| C2 | computational sensors | A linter is configured | Linter config files |
| C3 | computational sensors | Type checking is configured | Type checker config; not applicable without a type-checkable language |
| D1 | enforcement | Agent hooks are configured | `hooks` entries in agent settings |
| D2 | enforcement | A hook runs a check | A hook command invokes a test or lint script **that exists in the repository**, not merely a command containing a keyword |
| E1 | inferential sensors | An independent review step exists | A skill or subagent defined for review |
| F1 | timing | A pre-commit check exists | Pre-commit configuration |
| F2 | timing | CI runs tests and lint | Workflow files that run both |
| F3 | timing | A drift sensor exists | Dependency scanner, dead-code detection, or coverage config |
| F4 | timing | A scheduled cleanup job exists | A scheduled workflow |

### Score-only checks

Planned for v0.2. They affect the reference score only, never the level. A check with no explicit recommendation is dropped.

| ID | Dimension | Check |
| --- | --- | --- |
| A5 | guides | Separate instruction files in sub-packages (monorepos only) |
| A6 | guides | Occasionally needed knowledge is split into skills |
| B1 | knowledge structure | Architecture document |
| B2 | knowledge structure | `docs/` index |
| B3 | knowledge structure | Execution plans recorded in the repository |
| B4 | knowledge structure | CI check for documentation freshness |
| C4 | computational sensors | Structural tests or dependency rules |
| D3 | enforcement | Permission allow/deny rules |
| D4 | enforcement | Sandbox configuration |
| E2 | inferential sensors | Each skill states when to use it |

## Levels

A level is reached when **all of its required checks pass**, together with those of every lower level. The order follows Böckeler's framework: guidance first, then sensors the agent can run, then enforcement, then upkeep.

| Level | Name | Also requires | Rationale |
| --- | --- | --- | --- |
| L0 | Not configured | — | — |
| L1 | Guided | A1, A3 | Anthropic: the instruction file should hold commands the agent cannot guess. Böckeler: guides |
| L2 | Checked | C1, and C2 or C3 | Anthropic: give the agent checks it can run itself. Böckeler: computational sensors |
| L3 | Enforced | F2, and (D1 and D2) or F1 | Anthropic: use hooks for things that must happen every time. Böckeler: run fast checks before commit |
| L4 | Sustained | A2, A4, E1, and F3 or F4 | Anthropic: prune the instruction file regularly and use independent review. Böckeler: continuous drift sensors. OpenAI: recurring cleanup jobs |

- **The gate is the level alone**, through `--min-level`. Letting each organization use different thresholds would make results incomparable.
- **These levels are defined by this tool.** They are not an industry standard. They are a different axis from autonomy models such as Dan Shapiro's Five Levels.

### Capped checks

A check whose rubric `supported_by` does not include the detected agent is reported as **capped**, not failed. This separates "the harness is missing something" from "the tool does not support this agent yet". A level whose requirements cannot be met only because of capped checks is shown as capped, naming the check. For example, a repository whose only agent has no adapter support for E1 can reach L3 through F1, and shows L4 as "capped: E1 cannot be evaluated for this agent".

## Reference score

The score shows progress separately from the level. It is informational and never used by the gate.

| Evidence tier | Explicit recommendations from | Weight |
| --- | --- | --- |
| A | 3 or more independent organizations | 10 |
| B | 2 organizations | 7.5 |
| C | 1 organization | 5 |

```math
\text{Score} = 100 \times \frac{\sum_{i \in \text{applicable}} w_i \, x_i}{\sum_{i \in \text{applicable}} w_i}, \qquad x_i \in \{0, 1\}
```

- Checks that are not applicable or capped are removed from both numerator and denominator.
- Dimensions have no weights.
- Scorecard calls these "risk levels", which has been criticized as confusing ([ossf/scorecard#3990](https://github.com/ossf/scorecard/issues/3990)). This project calls them **evidence tiers**.

## Limitations

- **It checks configuration, not effectiveness.** How to measure a harness's coverage is an open question that Böckeler also leaves unresolved.
- **It cannot stop deliberate gaming.** For example, a hook that calls a test script with empty tests passes D2 and C1. Organizations using the level as a bar should combine it with human review or execution-based evaluation. The README states this on its first screen.
- **Validity claims are limited to measured results.** Until the relationship between level and outcome is measured, the project does not claim that higher levels produce better results.

## Validity

Validity checking tests whether levels relate to real agent performance, so the rubric is not validated only by the judgment of the people who wrote it.

- Pick 8–10 public repositories spread across levels.
- Define 5 tasks of the same kinds per repository (fix a failing test, add a feature, refactor, and so on).
- Run each task 3 times with the same model and agent, and measure completion rate.
- Compute the rank correlation (Spearman) between level and completion rate.
- Publish the results as they are, noting that the sample is too small for strong statistical conclusions. If no correlation appears, revisit checks and level placement before release.

Results are published in `docs/validity.md`.

## Rubric data format

The rubric is a YAML file validated against `rubric/schema.json`. The example below shows the shape only; values are placeholders.

```yaml
version: 0.1.0
sources_version: 2026-11-16          # version of rubric/sources.yaml

evidence_tiers:
  A: { min_orgs: 3, weight: 10 }
  B: { min_orgs: 2, weight: 7.5 }
  C: { min_orgs: 1, weight: 5 }

levels:                              # cumulative required checks
  L2: { requires: [C1, { any_of: [C2, C3] }] }

checks:
  - id: A2
    dimension: guides
    title: The instruction file is short
    tier: B                          # must equal the number of distinct orgs below
    check: instruction-file-length
    params: { max_lines: 100 }
    applies_when: has-instruction-file
    supported_by: [claude-code, agents-md]
    sources:
      - org: Example Org
        url: https://example.com/guide
        recommendation: One-sentence summary of the explicit recommendation
        checked: 2026-11-16
      - org: Another Org
        url: https://example.org/docs
        recommendation: One-sentence summary of the explicit recommendation
        checked: 2026-11-16
    fix_hint: What to change to pass
```

- Validation fails if `sources` is empty or a source lacks `recommendation` or `checked`.
- `tier` must match the number of distinct `org` values in `sources`. Weights cannot be raised by hand.
- Organizations can override checks, levels, and parameters with `--rubric ./company-rubric.yaml`. The report then says the rubric is not the public one.

## CLI

```bash
npx harness-rating                         # scan the current directory, terminal summary
npx harness-rating ./path/to/repo
npx harness-rating --json report.json
npx harness-rating --min-level 3           # exit 1 below L3
npx harness-rating --explain A2            # print a check's description and sources
npx harness-rating --rubric ./custom.yaml  # organization rubric (v0.2)
npx harness-rating --include-user          # reference level including global config (v0.2, not used by the gate)
```

Example terminal output (values are illustrative):

```
harness-rating v0.1.0 · rubric v0.1.0 · /work/my-app
Detected: Claude Code, AGENTS.md

Level  L2 · Checked
Score  64 / 100 (reference)

To reach L3
  ✓ F2  CI runs tests and lint
  ✗ (D1+D2 hook checks) or F1 pre-commit
      → Add a hook in .claude/settings.json that calls your test script, or set up pre-commit
      → Sources: Anthropic, Fowler

Not passed (score only)
  ✗ A2  The instruction file is short (148 lines > 100) · tier A · OpenAI, Anthropic, xAI
```

## Technology

- **Language:** TypeScript on Node.js. Supported versions are the LTS lines: Node 24 and Node 26.
- **Dependencies:** no runtime dependencies other than YAML and JSON parsing.
- **Tests:** snapshot tests over fixture repositories. Same input, same output is locked in as a regression test.
- **Distribution:** npm, released from GitHub Actions on tags.
- **License:** MIT, so companies can adopt it as an internal gate.

## Versioning

- The **CLI** and the **rubric** are versioned separately. Reports record both.
- Organizations using the level as a bar should pin the rubric version.

| Rubric change | Version bump |
| --- | --- |
| Typo, or a broken link replaced with the new URL of the same document (no tier change) | patch |
| Source added or removed, `sources.yaml` changed (tiers may change) | minor |
| Score-only check added, detection parameter changed | minor |
| Level requirements changed, check removed, tier weight values changed | major |

Rubric changes are proposed through the rubric proposal issue form, which requires a primary-source URL and the recommendation. Each change needs a fixture and a test.

A monthly scheduled workflow checks that every source URL is reachable and opens an issue when one breaks.

## Open questions

| Question | Decided in |
| --- | --- |
| D2: which scripts count as "check scripts" | #14 |
| Validity checking: model, agent, repositories, tasks | #20 |
