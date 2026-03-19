# Double Yummy — Design System

## Brand Identity

Double Yummy is a baby weaning recipe blog by Rach, a UK registered dietitian and mum of twins. The design should feel warm, personal, and trustworthy — like getting advice from a knowledgeable friend, not a corporate nutrition site.

## Color Palette

| Token          | Value     | Usage                                      |
|----------------|-----------|---------------------------------------------|
| Accent         | `#d4764e` | Links, headings, CTAs, brand color (warm terracotta) |
| Accent hover   | `#b85a34` | Link/button hover states                    |
| Text primary   | `#333`    | Body text                                   |
| Text heading   | `#2c2c2c` | Headings                                    |
| Text muted     | `#666`    | Secondary text, excerpts                    |
| Text light     | `#888`    | Meta info, dates, pagination                |
| Text faint     | `#999`    | Timestamps, nav labels                      |
| Background     | `#fafaf8` | Page background (warm off-white)            |
| Surface        | `#fff`    | Cards, header, inputs                       |
| Border         | `#e8e8e4` | Dividers, card borders                      |
| Tag background | `#f0ebe6` | Tag badge background                        |
| Tag text       | `#8b6f5a` | Tag badge text                              |
| Footer bg      | `#2c2c2c` | Footer background                           |
| Footer text    | `#ccc`    | Footer primary text                         |
| Footer muted   | `#888`    | Footer secondary text                       |

## Typography

- **Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- **Base size:** 16px
- **Line height:** 1.6 (body), 1.3 (headings), 1.7 (post content)
- **No custom web fonts** — system stack keeps it fast and native-feeling

## Spacing & Layout

- **Container max-width:** 960px
- **Container padding:** 0 1.25rem
- **Card border-radius:** 8px
- **Image/nav border-radius:** 6px
- **Button/tag cloud border-radius:** 4px
- **Tag badge border-radius:** 3px
- **Card shadow:** `0 1px 3px rgba(0, 0, 0, 0.08)`
- **Card hover shadow:** `0 4px 12px rgba(0, 0, 0, 0.12)`

## Responsive Breakpoints

| Breakpoint | Columns | Layout changes                    |
|------------|---------|-----------------------------------|
| < 600px    | 1       | Stacked cards, hamburger nav      |
| 600–899px  | 2       | Two-column grid, hero side-by-side |
| 900px+     | 3       | Three-column grid, full hero      |
| 768px+     | —       | Desktop nav (inline, no hamburger) |

## Component Patterns

### Post Cards
White background, 8px radius, subtle shadow. Image at top (4:3 aspect, object-fit cover), content below with title → date → excerpt → tag badges.

### Tag Badges
Inline-block, warm beige background (#f0ebe6), brown text (#8b6f5a). Hover: accent background, white text. Small variant for card context.

### Header
Sticky, white background, 3px accent bottom border. Logo left, nav right. Hamburger on mobile.

### Hero (Start Here)
Blog-card aesthetic, NOT a marketing banner. Two-column on desktop (image left 40%, content right 60%). Stacked on mobile (image above). Same white surface, subtle shadow. Contains embedded Pagefind search.

## Accessibility

- All text/background combinations pass WCAG AA contrast
- Touch targets: minimum 44px
- Keyboard navigation: full tab support
- ARIA landmarks on major sections
- Lazy loading on images with `loading="lazy" decoding="async"`
- Print stylesheet hides nav, footer, pagination

## Anti-Patterns (Do Not)

- No gradients or gradient overlays
- No full-bleed hero images with text overlay
- No centered marketing-style headlines
- No animations beyond subtle hover transitions (0.2s ease)
- No custom fonts or icon libraries
- No framework CSS (Bootstrap, Tailwind, etc.)
