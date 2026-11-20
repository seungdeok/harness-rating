# Contributing

Thanks for helping. This project rates a repository's AI coding agent harness, the setup that guides and checks agents such as instruction files, hooks, tests, and CI. Every rule it applies has to be traceable to a public source.

## Development setup

Requires Node.js 24 or later (see `.nvmrc`).

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run validate:rubric
npm run build
```

`npm ci` also installs a [lefthook](https://lefthook.dev/) pre-commit hook that runs `typecheck` and `lint`.

## Branches and pull requests

- Follow the [working rules](AGENTS.md#working-rules). Open or pick an issue first, and name the branch `<type>/<issue>-<short-title>`, for example `feat/12-guide-checks`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles: `<type>(<area>): <summary>`. Types match the `type:*` labels (`feat`, `docs`, `test`, `ci`, `chore`, …).
- Write tests first for behavior changes. Small sample repositories used by tests live under `test/fixtures/`.
- Fill in the [pull request template](.github/pull_request_template.md) and link the issue with `Closes #N`. CI must pass.
- Changes to [`docs/spec/SPEC.md`](docs/spec/SPEC.md) need an ADR; see [`docs/adr/README.md`](docs/adr/README.md).

## Changing the rubric

The rubric (`rubric/*.yaml`, the list of checks and levels) and its source list (`rubric/sources.yaml`) decide what the tool rewards, so changes need evidence.

1. Open a [rubric proposal](https://github.com/seungdeok/harness-rating/issues/new?template=rubric-proposal.yml).
2. Check the source against the spec's [source rules](docs/spec/SPEC.md#source-rules). They define which documents are accepted or rejected and which sentences count as evidence.
3. In a PR, update the rubric YAML and, if needed, `rubric/sources.yaml`.
4. Add a sample repository under `test/fixtures/` and a test for the change.
5. Bump the rubric version according to the spec's [versioning table](docs/spec/SPEC.md#versioning).

`docs/rubric.md` and `docs/levels.md` are generated from the rubric data. Do not edit them by hand.

## Reporting problems

- A check passed or failed when it should not have: [false positive / negative](https://github.com/seungdeok/harness-rating/issues/new?template=false-positive.yml).
- Support for another coding agent: [agent support](https://github.com/seungdeok/harness-rating/issues/new?template=agent-support.yml).
- A crash or wrong output: [bug report](https://github.com/seungdeok/harness-rating/issues/new?template=bug.yml).
- A security vulnerability: do not open a public issue; see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
