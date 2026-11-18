# Security policy

## Supported versions

Before 1.0, only the latest released version receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Report it privately through [GitHub private vulnerability reporting](https://github.com/seungdeok/harness-rating/security/advisories/new).

Include the affected version, the steps or a minimal repository layout that reproduces the problem, and the impact you expect. You will get an acknowledgement within 7 days.

## Scope

`harness-rating` scans repositories that may be untrusted. Its safety guarantees are listed in the spec's [principles](docs/spec/SPEC.md#principles). A way to break any of them counts as a vulnerability, including:

- reading files outside the scanned repository, for example through symbolic links or `..` paths
- executing code from the scanned repository
- making network requests or sending data anywhere during a scan
- reading the contents of files above the size cap, or exhausting memory or CPU on crafted input

A harness that games a check to reach a higher level is a known limitation (see [Limitations](docs/spec/SPEC.md#limitations)), not a vulnerability. Report it as a [false positive](https://github.com/seungdeok/harness-rating/issues/new?template=false-positive.yml).
