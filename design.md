<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 -->
# Design — 東邦大学医学部 IT部

このサイトの共有デザインシステム。濃紺の面、読みやすい日本語組版、細い罫線を軸に、部の活動と制作物を簡潔に伝える。アクセントは明るいインディゴに固定し、写真や装飾イラストには頼らない。ブランドマークはヘッダー、フッター、ローディング表示に限って使う。

## System

- Genre: atmospheric
- Marketing: Typographic hero + Catalogue sections
- Utility/content: compact Catalogue rhythm
- Navigation: N1b public-only three-section; admin is a quiet footer utility
- Footer: Ft1 mast-headed
- Enrichment: none; typography and rules carry the hierarchy

## Theme

- Background: `#090b1c`
- Background secondary: `#171a3c`
- Surface: `#121630`
- Surface strong: `#1b2043`
- Ink: `#f7f7fb`
- Muted: `#a7abc3`
- Rule: `#30365e`
- Accent: `#a5b4fc`
- Accent strong: `#6366f1`
- Success: `#86efac`
- Warning: `#fcd34d`
- Danger: `#fca5a5`

## Typography

- Display: Zen Kaku Gothic New, 700, normal
- Body: Zen Kaku Gothic New, 400–700
- Outlier: Space Grotesk, loading status only
- Display tracking: `-0.045em`
- Display anchor: `clamp(3rem, 6.6vw, 6.25rem)`

## Spacing, motion, CTA

- 4px base; major sections use 72–160px vertical space
- Square cards and inputs; 4px radius only on compact controls
- Hero content gets a one-shot opacity reveal; controls use short transform feedback
- No pointer field, cursor effect, or scroll parallax
- Primary CTA uses the contrast-adjusted indigo fill `#5457d6` with light text; secondary CTA is a 1px outline
- Clickable labels stay on one line

## Shared requirements

- Accent stays below roughly 8% of each viewport
- All colours and fonts route through `tokens.css`
- `html` and `body` use `overflow-x: clip`
- No photographic or illustrative media is rendered; CMS image fields may remain for compatibility but are presentation-inert
- Brand SVGs may appear only in shared chrome and the loading screen
- Existing EmDash routes, schema, content ownership, and cache wiring stay intact

## Exports

### tokens.css

`tokens.css` at the project root is the canonical source.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: #090b1c;
  --color-paper-2: #121630;
  --color-ink: #f7f7fb;
  --color-muted: #a7abc3;
  --color-accent: #a5b4fc;
  --font-display: "Zen Kaku Gothic New", sans-serif;
  --font-body: "Zen Kaku Gothic New", sans-serif;
  --font-outlier: "Space Grotesk", sans-serif;
  --spacing-md: 1.5rem;
  --text-md: 1.125rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "#090b1c", "$type": "color" },
    "paper-2": { "$value": "#121630", "$type": "color" },
    "ink": { "$value": "#f7f7fb", "$type": "color" },
    "accent": { "$value": "#a5b4fc", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Zen Kaku Gothic New, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "Zen Kaku Gothic New, sans-serif", "$type": "fontFamily" },
    "outlier": { "$value": "Space Grotesk, sans-serif", "$type": "fontFamily" }
  },
  "space": { "md": { "$value": "1.5rem", "$type": "dimension" } }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: #090b1c;
  --foreground: #f7f7fb;
  --card: #121630;
  --card-foreground: #f7f7fb;
  --primary: #a5b4fc;
  --primary-foreground: #ffffff;
  --muted: #171a3c;
  --muted-foreground: #a7abc3;
  --border: #30365e;
  --input: #30365e;
  --ring: #a5b4fc;
  --radius: 0;
}
```

## Provenance

- Reference: the user-provided club palette and the current EmDash content model
- Adoption: typography, catalogue rhythm, and public-first navigation only
- Amended: 2026-09-22 — removed inactive kinetic-field specification, aligned palette and typography with production
