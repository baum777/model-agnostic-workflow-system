# Search Discoverability Review — quolin.dev crawl export

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/search-discoverability-review` ·
Input: `cases/search-discoverability-review/pos-standard/crawl-export.md` ·
No crawler was run in this review; every statement below comes from the supplied 2026-10-20 export.

## EVIDENCE

- Crawl export, collection date **2026-10-20**, internal crawler v1.4, 6 in-scope URLs on `quolin.dev`.
- `robots.txt` and `sitemap.xml` fetched 2026-10-20 (same export).
- No server logs, no search-console-class data, no referrer or query data supplied — flagged as limits, not guessed at (see LIMITS).

## INDEXABILITY

- **Staging host in the production sitemap:** `https://staging.quolin.dev/product` and `https://staging.quolin.dev/pricing` are declared in `sitemap.xml`. Unless staging is intentionally public and canonicalized, this advertises a duplicate host to every crawler that reads the sitemap.
- **Parameter duplicate without canonical:** `/product?ref=newsletter` returns 200 with the same content as `/product` and declares no canonical — the export shows two indexable variants of one page.
- **Internally blocked page:** `robots.txt` disallows `/legal/imprint` while the footer links to it. Disallowed-but-linked pages can still be indexed without content; usually not the intent for an imprint.
- **Sitemap/orphan mismatch:** `/docs/getting-started` IS in the sitemap but `robots.txt` does not disallow it — consistent; however the empty meta description on `/` and missing structured data on `/product` and `/pricing` reduce what machines can extract (observed directly in the export).

## CONTENT

- Stated goal for `/product`: answer "workflow automation for small teams". Observed title `Product — Quolin` names the site, not the task; the export carries no description or structured data stating the audience. Reviewer inference (distinct from the evidence): the intent mapping is plausible but the page's machine-readable surface does not carry it.
- Stated goal for `/docs/getting-started`: findable onboarding entry. The title `Getting started` is generic; without a description, the export gives a crawler little to rank it for onboarding queries. This is an observation from the export, not a ranking prediction.

## ACTIONS

All actions are crawl-verifiable — each can be confirmed or refuted by re-crawl after the change; none is a traffic or ranking claim:

1. Remove the two `staging.quolin.dev` entries from `sitemap.xml` (verifiable: re-crawl of the sitemap shows ≤ 5 production entries).
2. Declare `canonical -> /product` on `/product?ref=newsletter` or 301-redirect it (verifiable: re-crawl shows one canonical variant).
3. Decide the imprint policy: if it should be indexed, drop the `Disallow: /legal/imprint` line; if not, remove the footer link (verifiable: robots + link re-check).
4. Write a meta description for `/` and add JSON-LD (`SoftwareApplication` or `Organization`) to `/product` and `/pricing` (verifiable: re-crawl sees non-empty description and parsed structured data).
5. Titles stay within the constraint — the top navigation is untouched by all actions above.

## LIMITS

- Rankings, traffic, and AI-answer citation are outcomes of external systems; this review makes no prediction about them — improvements are stated only as crawl-verifiable changes.
- The export is a single 2026-10-20 snapshot; whether the staging entries or the newsletter variant are already indexed is unknown without search-console-class data the repository does not hold.
- Crawl frequency, server-side redirects behind the scenes, and query-level intent match remain unknown without fresh crawls or log data.
