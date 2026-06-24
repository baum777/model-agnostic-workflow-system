---
name: baum-frontend-design
description: Create or review distinctive, non-generic frontend UI for Baum-OS, MosaicStacked, dashboards, cockpit views, and operator consoles. Use when working on UI, UX, components, pages, dashboards, console layouts, screenshots, CTAs, or design reviews.
---

# Baum-Frontend-Design

Avoid generic AI design patterns. Every interface should have a clear point of view, serve a specific user, and pass a basic accessibility bar.

## Before Designing or Reviewing

Establish:

- **Purpose** — what problem does this interface solve and who uses it?
- **Aesthetic direction** — commit to one: brutally minimal, operator-utilitarian, editorial, retro-futuristic, etc. Avoid "clean and modern" as a direction — it means nothing.
- **Existing repo style** — read existing UI files first; respect the system unless the task asks for a redesign.
- **Constraints** — framework, performance targets, accessibility level, mobile requirement.

## Design Priorities

1. Clarity and hierarchy
2. CTA visibility — the most important action must be obvious
3. Responsive behavior — test mental model at 375px and 1280px
4. Accessibility — contrast ratio, focus states, keyboard nav
5. Meaningful motion only — no animation for its own sake
6. Evidence-friendly screenshots — design for legible captures

## For Reviews

Check and report on:

- Layout friction (things that fight each other)
- Typography issues (size, weight, spacing, contrast)
- CTA ambiguity (unclear primary action)
- Overflow and clipping risks
- Interaction risks (accidental triggers, missing affordances)
- Mobile issues

## For Implementation

- Keep changes scoped to the task
- Cover changes with existing tests where possible; note where new tests are needed
- List files likely affected before touching anything
- Do not modify runtime/product code outside the UI scope

## Required Output

```
Design intent:
Aesthetic direction:

UX risks:
  (layout, CTA, accessibility, mobile, overflow)

Implementation scope:
  (what will change, what won't)

Files likely affected:
  -

Verification plan:
  (how to confirm it works and looks right)

Screenshot/evidence recommendation:
  (what to capture and share)
```
