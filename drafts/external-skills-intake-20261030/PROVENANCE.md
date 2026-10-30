# Frozen upstream provenance and license assessment

Class: draft / evidence locator, not admission evidence. Repository sources were read through the connected GitHub integration on 2026-10-30. Commit identifiers below identify immutable source snapshots; the blob SHA identifies source content as returned by GitHub. A Git blob SHA is **not** a SkillSpector report, SHA-256 content digest, package attestation or execution evidence.

| Source | Immutable repository commit | Inspected SKILL.md blob SHA | License at repository root |
| --- | --- | --- | --- |
| [Vercel Labs agent-browser](https://github.com/vercel-labs/agent-browser) | `550a59d92c6b66bce60b93ec90a9d7448206f3b8` | `67e8a49ad8d8e5874b9e3a5d802df68d5e5e7d76` | Apache-2.0; Copyright 2025 Vercel Inc. |
| [wshobson agents](https://github.com/wshobson/agents) / auth | `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | `e002769ebf44a7b3f135a57f72231666760ecf81` | MIT; Copyright (c) 2024 Seth Hobson |
| [wshobson agents](https://github.com/wshobson/agents) / API | `0874a27b17a22e2b7c2e2bcd725768e0803cad06` | `e914fb423af914a6213a72ea537df179a7768233` | MIT; Copyright (c) 2024 Seth Hobson |

## Exact source file paths

- `vercel-labs/agent-browser/skills/agent-browser/SKILL.md` ([pinned](https://github.com/vercel-labs/agent-browser/blob/550a59d92c6b66bce60b93ec90a9d7448206f3b8/skills/agent-browser/SKILL.md)); its documentation points at executable CLI-provided additional skill content. Do not treat that content as reviewed until separately pinned and screened.
- `wshobson/agents/plugins/developer-essentials/skills/auth-implementation-patterns/SKILL.md` ([pinned](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/developer-essentials/skills/auth-implementation-patterns/SKILL.md)), with `references/details.md` (further illustrative examples).
- `wshobson/agents/plugins/backend-development/skills/api-design-principles/SKILL.md` ([pinned](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/backend-development/skills/api-design-principles/SKILL.md)), with `references/details.md` and `assets/api-design-checklist.md` / `assets/rest-api-template.py`.

## Redistribution boundary

Only this independently authored assessment/plan is committed. No third-party skill source or example code is copied into this branch. Later redistribution or adaptation must preserve applicable source copyright and license notices, include the required license text, clearly mark Apache-licensed modifications when applicable, and verify any supporting file's license. No source license grants runtime permission or safe-install approval.
