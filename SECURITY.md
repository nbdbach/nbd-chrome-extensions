# Security Policy

## Reporting a vulnerability

Please report security issues privately using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, rather than opening a public issue.

Expect an acknowledgement within a few days.

## Scope

These extensions request minimal permissions, make no network requests, and
collect no data. The most likely security-relevant issues are:

- an extension requesting more permission than its manifest test allows
- a dependency introducing network access or remote code
- a published build that does not match the source at its tag

All three are treated as security issues, not bugs.

## Verifying a published build

Each release tag has a GitHub Release with the exact zip submitted to the
Chrome Web Store. You can rebuild from the tag and compare.
