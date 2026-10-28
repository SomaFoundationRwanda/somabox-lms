# SOMABOX design tokens

Colour and type come from one place: the tokens in `app/globals.css` (`:root` for light,
`.dark` for dark). Screens use the token classes below, never raw palette colours
(`text-slate-500`, `bg-emerald-50`, `#0F172A`) or pixel sizes (`text-[11px]`, `text-xs`).
`pnpm test` (scripts/check-design-tokens.mjs) fails on anything else.

A school sets two colours (School page); every brand role is computed from them. Status
colours follow the usual convention and don't change with the school.

## Text

| Role | Class | Size / line | Use |
|---|---|---|---|
| Display | `text-display` + `font-extrabold` | 30 / 36 | Big numbers, the sign-in title |
| Page title | `text-title` + `font-bold` | 24 / 32 | One per page (`<Heading level={1}>`, PageHeader) |
| Section title | `text-section` + `font-semibold` | 18 / 28 | Sections of a page |
| Item title | `text-item` + `font-semibold` | 16 / 24 | Cards, list items, dialogs |
| Body | `text-body` | 16 / 26 | Reading: lessons, instructions, messages |
| UI | `text-ui` | 14 / 20 | Most interface text: tables, buttons, menus |
| Small | `text-small` | 13 / 20 | Help and secondary lines |
| Caption | `text-caption` + `font-medium` | 12 / 16 | Times, counts, badges. The smallest size there is |
| Eyebrow | `<Eyebrow>` (`text-caption font-semibold text-brand-fg`) | 12 / 16 | The line above a title. Sentence case, no uppercase |

Components: `Heading` (`level` for structure, `variant`: display/title/section/item for the
look), `Text` (`variant`: body/ui/small/caption/eyebrow, `tone`), `Eyebrow` — in
`components/typography`.

Weights: `font-normal`, `font-medium`, `font-semibold`, `font-bold`, and `font-extrabold`
for display only. No `font-black` (the box doesn't load it). No `uppercase` or `tracking-*`
except codes (the form kit's `variant="code"`).

### Replacing old sizes

| Was | Now |
|---|---|
| `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-xs` | `text-caption` |
| `text-[13px]` | `text-small` |
| `text-sm`, `text-[14px]` | `text-ui` |
| `text-base`, `text-[15px]`, `text-[16px]` | `text-body` (reading) or `text-item` (a title) |
| `text-lg`, `text-[17px]`, `text-[18px]` | `text-section` |
| `text-xl`, `text-[20px]` | `text-section` (section heading) or `text-title` (page title) |
| `text-2xl`, `text-[26px]`, `text-[28px]` | `text-title` |
| `text-3xl` and up, `text-[30px]`, `text-[32px]` | `text-display` |
| `font-black` | `font-extrabold` (display) or `font-bold` |
| `uppercase tracking-*` labels | `<Eyebrow>` or a plain label (sentence case) |

## Colour

| Role | Classes | Light / dark |
|---|---|---|
| Page | `bg-surface` | white / near-black |
| Raised (dialogs, menus, popovers) | `bg-surface-raised` | white / a step lighter |
| Inset (wells, table heads, quiet areas) | `bg-surface-sunken` | slate-50 / darker |
| Hover | `hover:bg-surface-hover` | slate-100 / white 6% |
| Text | `text-fg` | slate-900 / near-white |
| Secondary text | `text-fg-muted` | slate-600 / light grey |
| Faint text (still readable, ≥ 4.5:1) | `text-fg-subtle` | slate-500 / grey |
| Lines | `border-line`, `divide-line` | slate-200 / white 8% |
| Strong lines (inputs, outlines) | `border-line-strong` | slate-300 / white 16% |
| Backdrop | `bg-scrim` | |
| School colour | `bg-brand`, `border-brand`, `ring-brand` | `--brand-secondary` |
| School colour, strong (buttons, active nav) | `bg-brand-strong` | `--brand-primary` |
| School colour, soft (selected rows, chips) | `bg-brand-soft` | tint of the school colour |
| School colour, deep (panels with white text: sign-in side, dialog headers, menus) | `bg-brand-deep` | `--brand-primary`, darkened until white reads at 7:1 |
| School colour as text on surfaces | `text-brand-fg` | darkened (light) or lightened (dark) until it reads at 4.5:1 |
| Text on `bg-brand` | `text-on-brand` | white, or near-black on a light school colour |
| Text on `bg-brand-strong` | `text-on-brand-strong` | white, or near-black on a light school colour |
| Status | `bg-{success,warning,danger,info}` (fill), `-soft` (tinted background), `text-…-fg` (text and icons on surfaces), `text-on-…` (text on the fill), `border-…` | green / amber / red / blue |

`dark:` colour variants aren't needed: every role already has its dark value.

### Replacing old colours

| Was | Now |
|---|---|
| `text-slate-900`, `-800`, `-950`, `text-black`, `dark:text-white`, `dark:text-slate-100` | `text-fg` |
| `text-slate-700`, `text-slate-600` | `text-fg-muted` |
| `text-slate-500`, `text-slate-400`, `placeholder:text-slate-*` | `text-fg-subtle` |
| `bg-white`, `dark:bg-slate-900/950`, `bg-[#0f1318]` | `bg-surface` (`bg-surface-raised` for dialogs/menus) |
| `bg-slate-50`, `bg-slate-100` | `bg-surface-sunken` |
| `hover:bg-slate-50`, `hover:bg-slate-100` | `hover:bg-surface-hover` |
| `border-slate-100`, `-200`, `divide-slate-*` | `border-line`, `divide-line` |
| `border-slate-300`, `-400` | `border-line-strong` |
| `teal-*`, `primary-*`, `accent-*`, `[var(--brand-secondary)]` | `brand` roles (`bg-brand`, `text-brand-fg`, `bg-brand-soft`…) |
| `[var(--brand-primary)]`, `bg-accent-dark` | `bg-brand-strong` |

The readable shades are worked out from the school's two colours in `lib/brandColors.js` (set by SchoolContext), so any colour a school picks keeps text readable. `pnpm test` fails when a fill gets the wrong text token.
| `emerald-*`, `green-*` | `success` roles |
| `amber-*`, `yellow-*`, `orange-*` | `warning` roles |
| `rose-*`, `red-*` | `danger` roles |
| `sky-*`, `blue-*`, `indigo-*`, `violet-*`, `purple-*`, `cyan-*` | `info` roles |
| `bg-black/40` and the like behind dialogs | `bg-scrim` |
| hex colours in `style={{…}}` chosen by `isDark` | the matching token class (drop the ternary) |

Allowed as they are: `white` and `black` only on media (text over video or images); chart
series colours via `var(--chart-1)` … `var(--chart-5)`.
