# ADR 0009: Skip gitignored files by reading .gitignore, not by running git

- Status: Proposed
- Date: 2026-11-21
- Issue: #57

## Context

Right now the walker lists every file on disk except `.git/`, `node_modules/`, and nested checkouts. Gitignored files get scanned too, so the result depends on whatever happens to be lying around locally:

- A gitignored `.verify/move.py` in a TS-only repo makes C3 treat the repo as Python and fail (#54).
- A `.venv/` holds Python packages, and their `test_*.py` files can make C1 pass and C3 fail.
- A doc link that points at a gitignored file passes A4, even though that file isn't in the repo.

The `--min-level` gate usually runs in CI on a fresh checkout, where none of these files exist. So the same commit can get one level on your machine and a different one in CI.

The obvious fix is to ask git: `git ls-files --cached --others --exclude-standard` lists exactly the right files. The problem is that git reads the scanned repo's `.git/config` while doing it. We tried it on git 2.41: put a shell command in `core.fsmonitor`, run `git ls-files --others`, and the command runs. Passing `-c core.fsmonitor=false` blocks that one setting, but then we're maintaining a list of every git setting that can run code and hoping it's complete. On top of that, git may not be installed, and inside CI containers it can refuse the repo with "dubious ownership".

The matching rules themselves are spelled out in the [gitignore docs](https://git-scm.com/docs/gitignore): negation, `**`, directory-only patterns, and the rule that you can't re-include a file once its parent directory is excluded.

## Decision

- The walker reads `.gitignore` files itself and skips what they match. It never runs `git`.
- It reads the root `.gitignore`, every nested `.gitignore` it reaches, and `.git/info/exclude` when it exists. Each file's patterns apply relative to its own directory, as in git.
- It does not read global excludes (`core.excludesFile`, `~/.config/git/ignore`) or any other git config.
- An ignored directory is not entered at all. This matches git, which can't re-include a file under an excluded directory.
- The rules apply whether or not the root has a `.git`.
- Matching uses [`ignore`](https://www.npmjs.com/package/ignore) (MIT, no dependencies of its own), added as a runtime dependency.

## Rationale

If we only read files, principle 1 holds without any extra effort: nothing from the scanned repo runs, and there's no list of risky git settings to keep current. The result depends only on the files under the root, so the same input still gives the same output.

Skipping ignored files makes a local scan look much more like what CI sees, and CI is where the gate actually runs. `.git/info/exclude` gets read for the same reason, since whatever it excludes never shows up in a CI checkout either. Global excludes are left out because they live outside the repo and change from machine to machine.

Gitignore rules are easy to get slightly wrong (negation order, `**`, trailing slashes, escaping), so we'd rather not write our own matcher. `ignore` is a widely used implementation, and like `smol-toml` in [ADR 0008](0008-toml-runtime-dependency.md) it pulls in nothing else.

Applying `.gitignore` even without a `.git` keeps a single code path, and a source archive of a repo scans the same as a checkout of it.

## Consequences

- SPEC principle 7 says the scanner skips files matched by the repository's `.gitignore` files.
- SPEC § Technology allows gitignore pattern matching as a runtime dependency.
- SPEC § Limitations lists what this does not cover:
  - A file force-added with `git add -f` under an ignored path is skipped, even though git tracks it. Covering it would mean parsing `.git/index`.
  - When scanning a subdirectory, `.gitignore` files above the root are not read, because the scanner doesn't read outside the root.
  - Files that only global excludes ignore are still scanned.
- Levels can change for repos that had ignored files affecting C1, C3, A4, or other checks. This is a CLI change; the rubric version does not change.
