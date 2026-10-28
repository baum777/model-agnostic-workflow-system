# Input: marketing-site crawl export (fixture)

Source: `cases/search-discoverability-review/pos-standard/crawl-export.md` (fixture, self-contained)

```text
Crawl export supplied by owner. Collection date: 2026-10-20. Tool: internal crawler v1.4.

Site: quolin.dev (marketing site, 6 URLs in scope)

URL                          Title                                  Canonical declared?   Notes
/                            "Home"                                 yes -> /              meta description empty
/product                     "Product — Quolin"                     yes -> /product
/product?ref=newsletter      "Product — Quolin"                     NO                    200 status, same content as /product
/pricing                     "Pricing — Quolin"                     yes -> /pricing
/docs/getting-started        "Getting started"                      NO                    200 status, not listed in sitemap
/legal/imprint               "Imprint"                              yes -> /legal/imprint

robots.txt (fetched 2026-10-20):
  User-agent: *
  Disallow: /legal/imprint        # note: page IS linked in the footer

sitemap.xml (fetched 2026-10-20), 7 entries:
  /, /product, /pricing, /docs/getting-started, /legal/imprint,
  https://staging.quolin.dev/product, https://staging.quolin.dev/pricing

Structured data: JSON-LD Organization on / only. No structured data on /product, /pricing.
```

Content goals (owner): `/product` should answer "workflow automation for small teams"
searchers; `/docs/getting-started` should be findable as the onboarding entry point.
Constraint: the top navigation must not change.
