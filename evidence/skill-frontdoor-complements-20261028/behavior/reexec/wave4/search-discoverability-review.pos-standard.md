# Search Discoverability Review — quolin.dev crawl export (fresh re-execution)

Invocation record: agent re-execution, 2026-10-29 · Model: zai-individual-coding-plan/GLM-5.3 (ZCode session agent) · Skill: `core/skills/search-discoverability-review`, content digest `sha256:16f7fc3f73e30fde32c950a709b3975ba071d783a159eb7be55069acd8e787e0` · Input: `cases/search-discoverability-review/pos-standard/crawl-export.md` · This file is committed verbatim as produced; it supersedes nothing and is not edited after the run (see `execution-record.json` for why this re-execution exists).
No crawler was run for this review; every statement below works only from the supplied 2026-10-20 export.

## EVIDENCE

- Scope: quolin.dev marketing site, 6 URLs in scope, per the owner-supplied crawl export (internal crawler v1.4, collected 2026-10-20).
- URL table with per-URL canonical declarations, statuses, and notes — collection date 2026-10-20.
- robots.txt snapshot, fetched 2026-10-20: `User-agent: * / Disallow: /legal/imprint`, with the export's own note that the page is linked in the footer.
- sitemap.xml snapshot, fetched 2026-10-20: 7 entries — /, /product, /pricing, /docs/getting-started, /legal/imprint, https://staging.quolin.dev/product, https://staging.quolin.dev/pricing.
- Structured data snapshot: JSON-LD Organization on / only; none observed on /product or /pricing.
- Content goals (owner statement): /product should answer "workflow automation for small teams" searchers; /docs/getting-started should be findable as the onboarding entry point. Constraint: top navigation must not change.

## INDEXABILITY

- One staging-host leak into the production sitemap: both `https://staging.quolin.dev/product` and `https://staging.quolin.dev/pricing` are submitted alongside production URLs (sitemap snapshot 2026-10-20). Submitted staging URLs are a duplicate-surface and wrong-surface risk.
- One parameter duplicate without a canonical declaration: `/product?ref=newsletter` returns 200 with the same content as `/product` and the export records no canonical for it. As supplied, the two are indistinguishable to a crawler.
- One canonical gap: `/docs/getting-started` has no canonical declaration (table, 2026-10-20).
- One robots/sitemap/linkage conflict: robots.txt disallows `/legal/imprint` while the page is footer-linked AND listed in sitemap.xml. Disallow blocks crawling; it does not by itself remove a URL from an index, and listing it in the sitemap contradicts the disallow intent. The export does not say which behavior is intended — that is an owner decision, reported not resolved.
- Metadata gaps: meta description empty on /; structured data (JSON-LD) present only on /.
- Evidence conflict to reconcile, not paper over: the URL table notes `/docs/getting-started` as "not listed in sitemap", but the sitemap snapshot lists it. The two supplied artifacts disagree; this review treats the conflict itself as a finding and does not assume either side is current.

## CONTENT

- /product vs. the stated goal "workflow automation for small teams": the export shows title "Product — Quolin" and a declared canonical, but contains no page body, headings, or query data. Observed: metadata and canonical state only. Whether the content answers that intent cannot be established from this export (see LIMITS) — this is an evidence boundary, not a verdict.
- /docs/getting-started as onboarding entry point: findability is currently contradicted by the supplied evidence itself (table note vs. sitemap listing, no canonical). Before content-fit can be judged, the indexation surface has to be made internally consistent.
- Constraint respected: every action below leaves the top navigation unchanged.

## ACTIONS

All actions are crawl- or fetch-verifiable on the next dated collection; none is an outcome promise.

1. Remove both staging.quolin.dev URLs from production sitemap.xml and serve a noindex/X-Robots-Tag response on the staging host. Verify: next sitemap fetch contains no staging hostnames; staging responses carry the noindex header.
2. Declare a self-canonical on /product and let `/product?ref=newsletter` resolve to it (link element or equivalent). Verify: next crawl shows the parameter variant carrying a canonical pointing to /product.
3. Add a canonical declaration to /docs/getting-started and reconcile the table-vs-sitemap contradiction by re-crawling both sources and recording which is current. Verify: next export has one consistent answer for sitemap membership.
4. Decide and document the intended index status of /legal/imprint, then align robots.txt and sitemap.xml with that decision. Verify: next fetch of both files shows one coherent rule set.
5. Write a meta description for /. Verify: next crawl shows a non-empty description.
6. Extend JSON-LD to /product and /pricing at whatever type the owner selects. Verify: next crawl parses structured data on those URLs.

## LIMITS

- Single snapshot, 2026-10-20: no trend, no log-file, and no search-console-class data is in the repository; nothing can be said about crawl frequency, indexing events, or queries.
- The export carries no page body content: intent-fit for /product and /docs/getting-started is judged from metadata and structure only; headings, copy, and extractability for AI-answer systems were not observed.
- staging.quolin.dev itself was not crawled — its exclusion is observed only in the sitemap listing; whether staging pages are otherwise reachable or indexed is unknown.
- The robots/sitemap conflict for /legal/imprint is reported as an owner decision; this review does not guess the intended legal-page visibility.
- No ranking, traffic, or AI-answer-inclusion outcome is projected anywhere in this review; search engines and answer systems are external systems outside this repository's control.
