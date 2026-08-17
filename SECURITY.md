# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 2.0.x | Yes |

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report them privately by email to the maintainer (<297761464@qq.com>) or via a
[GitHub Security Advisory](https://github.com/linuxlemon256/dsh-desktop/security/advisories)
(private vulnerability report).

Include:

- Affected version(s)
- Steps to reproduce
- Impact description
- Any suggested fix (optional)

You should receive a reply within 5 business days. Please give the maintainer
time to fix the issue before disclosing it publicly.

## Security notes

- `dsh-desktop` only talks to `127.0.0.1` on a fixed port (default `3080`).
  The `dsh web` server itself is upstream software; security issues in it should
  be reported to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
- Never run `npm start` with an untrusted `dsh` on `PATH`.
