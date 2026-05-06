# Style Selection Map

Use this file only when the request does not already name a concrete style.

## Selection Heuristic

1. Prefer exact style name if the user gives one.
2. Else match by domain.
3. If multiple domain matches exist, pick by tone.
4. If still tied, prefer the simpler style for readability-first outputs.

## Domain to Style Seeds

| Domain | Primary seeds | Tone notes |
| --- | --- | --- |
| AI tools | Linear, Claude, Cursor, Mistral | Minimal, technical, high signal |
| Developer tools | Vercel, Supabase, Resend, Raycast | Code-forward, sharp contrast |
| Fintech | Stripe, Revolut, Wise, Coinbase | Trust-first, clean hierarchy |
| Enterprise software | Notion, Airtable, Intercom | Structured and calm |
| Design/creative | Figma, Framer, Webflow | Expressive, color-forward |
| Media/editorial | The Verge, WIRED | Dense storytelling layouts |
| Commerce/lifestyle | Airbnb, Nike, Starbucks | Brand-forward, imagery-led |

## Tone Filter

- Use minimal/precise tone: Linear, Vercel, Notion.
- Use premium/editorial tone: Apple, Ferrari, WIRED.
- Use vibrant/energetic tone: Figma, Spotify, Renault.
- Use dark technical tone: Supabase, Sentry, Cursor.
- Use warm approachable tone: Airbnb, Mastercard, Wise.

## Token Translation Checklist

After selecting a style page, extract and apply:

1. color system (background, surface, text, accent, borders)
2. typography posture (headline/body weight and rhythm)
3. spacing scale (section, component, micro spacing)
4. component language (corner radius, borders, elevation)
5. interaction posture (hover, focus, motion speed where relevant)

If any item cannot be observed, mark it as inferred before applying.
