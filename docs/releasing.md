# npm releases

The release workflow is `.github/workflows/release.yml`. It runs on `v*` tag
pushes, using Node 24 and npm 11.20.0. It does not run on branches, pull requests,
or manual dispatch. The CLI version is independent of the rubric version.

## Tag policy

- A stable tag `v<package.json.version>` authorizes publication, for example
  `v0.1.0`. The tagged commit must be reachable from `origin/main`.
- A test tag `v<package.json.version>-dry-run.<numeric identifiers>` runs
  verification and dry-run only, for example `v0.0.0-dry-run.22.1`.
- Mismatched versions, malformed tags, and prerelease/build-metadata release tags
  fail before publication. Prerelease distribution tags are outside this workflow.

The verification job installs dependencies, runs typecheck, lint, tests, rubric
validation and generated-doc checks, then builds and packs once. It installs
that tarball in a temporary directory and smoke-tests the installed CLI against
the L4 fixture. `npm publish --dry-run --provenance --access public --ignore-scripts`
then checks the tarball without uploading it. Dry-run can read registry metadata;
it does not prove real authentication or provenance issuance.

Only a verified stable tag starts the publishing job. That job downloads the
same immutable Actions artifact, does not check out or rebuild repository code,
and publishes the tarball with `--provenance --access public --ignore-scripts`.
Only this job has `id-token: write`. The workflow uses no npm token or release
cache, and checkout does not persist Git credentials.

## One-time production setup

Before the first real release:

1. Confirm ownership and availability of the npm package name `harness-rating`.
   Account/package setup and any first-publication bootstrap are outside this
   workflow; do not assume that repository access grants npm ownership.
2. Configure the npm package's trusted publisher for GitHub Actions with owner
   `seungdeok`, repository `harness-rating`, workflow filename `release.yml`, and
   environment `npm`. Permit direct `npm publish` where required by npm's setup.
   Configure this near the actual release: newly configured publishers currently
   require a successful first publication within two days.
3. Configure the GitHub `npm` environment with required reviewers and tag
   deployment restrictions before using it for production. Protect release tags
   and restrict who may create or modify them. This document does not create
   those account/repository settings.
4. Keep `package.json.repository.url` matched to this public GitHub repository.
   Do not add a long-lived `NPM_TOKEN` secret; real releases use OIDC.

## Verify without publishing

Use a new reserved test tag; do not move a tag after verification:

```sh
version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')
git tag "v$version-dry-run.22.1"
git push origin "v$version-dry-run.22.1"
```

The workflow must show a successful `verify` job and a skipped `publish` job.
The dry-run needs no npm credential or production environment approval. A test
tag can point to the feature branch so the workflow can be verified before merge.
The final acceptance evidence belongs in the PR as a link to the Actions run.

## Publish a release

After all release prerequisites are complete, merge the version and changelog
updates (including `package-lock.json`) into main, then tag that commit with its
exact stable version, for example `v0.1.0`. Review and approve the `npm`
environment deployment. Do not reuse an already-published npm version.

## References

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance requirements](https://docs.npmjs.com/generating-provenance-statements/)
- [npm publish and dry-run](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
