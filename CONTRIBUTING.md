# Contributing

Thanks for helping. This project rates AI coding agent harnesses, so every rule it applies has to be traceable to a public source. Most of this guide is about keeping it that way.

Everything committed or posted to GitHub (code, docs, issues, PRs, commits) is in English.

## Development setup

Requires Node.js 24 or later (see `.nvmrc`).

```bash
npm ci
npm run typecheck        # tsc
npm run lint             # biome check
npm test                 # vitest
npm run validate:rubric  # validate rubric/*.yaml against rubric/schema.json
npm run build
```

## Branches and pull requests

- **One issue, one branch, one PR.** Open or pick an issue first. Name the branch `<type>/<issue>-<short-title>`, for example `feat/12-guide-checks`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles: `<type>(<area>): <summary>`. Types match the `type:*` labels (`feat`, `docs`, `test`, `ci`, `chore`, …).
- Write tests first for behavior changes. Fixture repositories live under `test/fixtures/`.
- Fill in the [pull request template](.github/pull_request_template.md) and link the issue with `Closes #N`.
- CI must pass on Node 24 and Node 26.

## Changing the spec

[`docs/spec/SPEC.md`](docs/spec/SPEC.md) is normative and changes only through an ADR. Follow [`docs/adr/README.md`](docs/adr/README.md): write the ADR first, in the same PR as the spec change.

## Changing the rubric

The rubric (`rubric/*.yaml`) and its source list (`rubric/sources.yaml`) decide what the tool rewards, so changes need evidence.

1. **Open a [rubric proposal](https://github.com/seungdeok/harness-rating/issues/new?template=rubric-proposal.yml).** It asks for a primary-source URL and the exact recommendation sentence.
2. **Check the source against the spec's [source rules](docs/spec/SPEC.md#source-rules).** They define which documents are accepted, which are not, and which sentences count as evidence. They are not repeated here, so read them there.
3. **Make the change in a PR:** update the rubric YAML and, if needed, `rubric/sources.yaml`. Do not set `tier` by hand to raise a weight; it must match the number of distinct organizations in `sources`.
4. **Add a fixture and a test** for the change.
5. **Bump the rubric version** according to the spec's [versioning table](docs/spec/SPEC.md#versioning).
6. Run `npm run validate:rubric` and `npm test`.

`docs/rubric.md` and `docs/levels.md` are generated from the rubric data. Do not edit them by hand.

## Reporting problems

- A check passed or failed when it should not have: [false positive / negative](https://github.com/seungdeok/harness-rating/issues/new?template=false-positive.yml).
- Support for another coding agent: [agent support](https://github.com/seungdeok/harness-rating/issues/new?template=agent-support.yml).
- A crash or wrong output: [bug report](https://github.com/seungdeok/harness-rating/issues/new?template=bug.yml).
- A security vulnerability: do not open a public issue; see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
