---
name: Thoondil
description: A precise, local-first webhook viewer and technical manual.
colors:
  paper: "#f8f8f8"
  white: "#ffffff"
  sidebar: "#f7f7f7"
  ink: "#262626"
  secondary: "#555555"
  muted: "#626262"
  rule: "#dedede"
  action: "#b54010"
  action-hover: "#96340d"
  selected: "#fff3ec"
  code-surface: "#fafafa"
  docs-action: "#315ab7"
  dark-ground: "#1b1b1b"
  dark-sidebar: "#202020"
  dark-card: "#252525"
  dark-subtle: "#303030"
  dark-ink: "#eeeeee"
  dark-secondary: "#c6c6c6"
  dark-muted: "#bdbdbd"
  dark-rule: "#454545"
  dark-action: "#ffad85"
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

**Creative North Star: The Webhook Workbench.** Thoondil uses familiar API client conventions to keep the request stream and inspector easy to navigate. Neutral surfaces, compact controls, and clear dividers put the request data first; the hook identity remains distinct.

## Colors

Burnt orange marks viewer actions and active navigation, while a pale warm selection wash identifies the current request. Neutral gray surfaces and rules structure the workspace. The dark theme uses charcoal panels and a lighter orange action. HTTP methods and status use color alongside text. Documentation retains its separate blue accent and blue-gray surfaces.

## Typography

Self-hosted Ubuntu carries documentation display and section headings; system sans-serif carries interface labels and prose. Monospace distinguishes paths, code, IDs, and measured values. The viewer is dense at 13px, with event metadata and supporting labels at 12px; documentation uses 17px introductory prose and 12px step labels and table headers.

## Layout

The viewer uses a 240px sidebar, a 280–340px event stream, and a flexible inspector below a 64px top bar. The inspector has a workbench header, request details, replay controls, and content tabs. At 960px the sidebar becomes a mobile menu and the workspace has two columns; at 680px it becomes one column and the top bar grows to 108px. The documentation wrapper is capped at 1320px; its hero and section headings use two columns until their responsive breakpoints.

## Elevation & Depth

The viewer is flat at rest, using tonal surfaces and dividers instead of floating cards. A mobile sidebar uses a shadow for separation. Documentation screenshots use soft shadows; the rest of the manual relies on surface color and rules.

## Shapes

Small radii keep controls and containers practical: 4px for compact elements, 6px for controls, 8px for larger elements, and 12px for modals. Event rows are square and separated by rules.

## Components

- **Buttons:** Primary actions use orange with white text, a darker hover, and a modest radius. In dark mode, primary button text is dark for contrast. Ghost actions remain visually quiet.
- **Search and fields:** Inputs have a bordered surface. Focus is visibly marked with the action color; toggle focus has a 2px outline and 3px offset.
- **Event rows:** Full-width request rows use dividers; selection adds a pale warm wash.
- **Navigation:** The sidebar indexes endpoints and rules. The active item uses a selection wash. On narrower screens the menu opens as a fixed panel.
- **Inspector:** The selected request gets the flexible main area, with a workbench header, replay bar, tabs, and a light monospace body viewer in the light theme.

## Do's and Don'ts

- **Do** keep method, path, time, body, and response more prominent than decoration.
- **Do** pair status color with text, preserve visible focus, and respect reduced-motion preferences.
- **Do** use monospace for technical values and sans-serif for prose and labels.
- **Don't** surround routine ledger content with floating cards.
