---
name: Thoondil
description: A precise, local-first webhook viewer and technical manual.
colors:
  paper: "#f7f8fa"
  white: "#ffffff"
  sidebar: "#f0f2f5"
  ink: "#1c2530"
  secondary: "#536171"
  muted: "#5e6b79"
  rule: "#dce2e8"
  action: "#315ab7"
  action-hover: "#25488f"
  selected: "#edf2fc"
  dark-ground: "#121923"
  dark-sidebar: "#19222e"
  dark-card: "#1c2632"
  dark-subtle: "#26313e"
  dark-ink: "#e8edf3"
  dark-secondary: "#b6c3d0"
  dark-muted: "#aebdcb"
  dark-rule: "#374454"
  dark-action: "#a9c4ff"
typography:
  display:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "clamp(2.8rem, 4.4vw, 4.2rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
  code:
    fontFamily: "ui-monospace, Cascadia Code, Consolas, monospace"
    fontSize: "13px"
rounded:
  xs: "4px"
  sm: "6px"
  default: "8px"
  lg: "12px"
spacing:
  compact: "8px"
  medium: "16px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
  event-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
---

# Design System: Thoondil

## Overview

**Creative North Star: The Request Ledger.** Thoondil presents technical information with the discipline of a well-edited manual. Data leads; alignment, fine rules, and restrained color make the interface easy to scan. The small hook identity supports the work without competing with it.

## Colors

Action blue marks interactive controls and selection. Paper, white, sidebar gray, ink, and rules establish the light interface; the dark theme replaces these with dark ground and panels, pale ink, and a lighter action blue. HTTP status colors communicate meaning alongside text. Documentation uses the same ink and blue on paper with pale blue-gray section backgrounds.

## Typography

Self-hosted Ubuntu carries documentation display and section headings; system sans-serif carries interface labels and prose. Monospace distinguishes paths, code, IDs, and measured values. The viewer is dense at 13px, with event metadata and supporting labels at 12px; documentation uses 17px introductory prose and 12px step labels and table headers.

## Layout

The viewer uses a 244px sidebar, a 310–390px event stream, and a flexible inspector below a 64px top bar. At 960px the sidebar becomes a mobile menu and the workspace has two columns; at 680px it becomes one column and the top bar grows to 108px. The documentation wrapper is capped at 1320px; its hero and section headings use two columns until their responsive breakpoints.

## Elevation & Depth

The viewer is flat at rest, using tonal surfaces and dividers instead of floating cards. A mobile sidebar uses a shadow for separation. Documentation screenshots use soft shadows; the rest of the manual relies on surface color and rules.

## Shapes

Small radii keep controls and containers practical: 4px for compact elements, 6px for controls, 8px for larger elements, and 12px for modals. Event rows are square and separated by rules.

## Components

- **Buttons:** Primary actions use blue with white text, a darker hover, and a modest radius. In dark mode, primary button text is dark for contrast. Ghost actions remain visually quiet.
- **Search and fields:** Inputs have a bordered surface. Focus is visibly marked in blue; toggle focus has a 2px outline and 3px offset.
- **Event rows:** Full-width ledger rows use dividers; selection adds a pale wash and an inset blue marker.
- **Navigation:** The sidebar indexes endpoints and rules. The active item uses a selection wash. On narrower screens the menu opens as a fixed panel.
- **Inspector:** The selected request gets the flexible main area, with header, actions, tabs, and readable monospace body content.

## Do's and Don'ts

- **Do** keep method, path, time, body, and response more prominent than decoration.
- **Do** pair status color with text, preserve visible focus, and respect reduced-motion preferences.
- **Do** use monospace for technical values and sans-serif for prose and labels.
- **Don't** surround routine ledger content with floating cards.
