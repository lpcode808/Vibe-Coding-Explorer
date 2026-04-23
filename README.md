# Prompt Quest

Live site: [https://lpcode808.github.io/Vibe-Coding-Explorer/](https://lpcode808.github.io/Vibe-Coding-Explorer/)

`Prompt Quest` is a browser-based, RPG-style prompt delivery map for middle school students. Students move through a teacher-guided planning step and three prompt zones, open themed prompt drawers, copy prompts, and bring them into Gemini to build, understand, or debug web app ideas. The experience is designed for touch-first Chromebook use, with an added keyboard-play mode where a pixel panther can move around the map with `WASD` and activate zones with `Space`.

## What This Version Includes

- A single-screen overworld map with four zones:
  - `The Blueprint` — share Canva wireframes with teacher and watch them generate a PRD
  - `The Forge` — generator prompt + Gemini Canvas link for building
  - `The Library` — translator prompt for understanding code
  - `The Workshop` — evaluator prompt for debugging
- Labeled map handoffs that make the workflow visible:
  - Zone 0 emits a `WIREFRAME` token
  - Gemini transforms it into a `PRD`
  - Zone 1 emits a `FIRST PROTOTYPE` token toward Zone 2
- A full-height bottom sheet drawer with:
  - zone title
  - summary
  - step-by-step instructions
  - prompt preview (on zones with a prompt)
  - optional external link button (e.g. "Open Gemini Canvas" on Zone 1)
  - copy / got-it button
- Clipboard copy with fallback support
- Progress persistence using `localStorage`
- Touch-friendly interaction for Chromebook use
- Keyboard-play mode with a pixel panther avatar starting top-center
- Auto-hiding Panther Mode help panel, restored with `?` or the bottom-center help button
- Keyboard shortcuts in the drawer: `1` triggers the top action when present; `2` or Enter triggers the main action
- Low-key ambient background music (procedural Web Audio, **default OFF** — toggle in the HUD)
- Pixel-style SVG favicon and Gemini-inspired machine/transform visuals
- Full prompt content embedded directly in `prompts.js`
- Agent guidance in `AGENTS.md` for non-Claude coding harnesses

## Recent Development Update

Since the previous README update, Prompt Quest has become more of a visual learning flow instead of only a prompt copier:

- Zone 0 now works as a facilitation checkpoint: students confirm they understand the teacher's PRD walkthrough, then watch a `WIREFRAME` token travel to a Gemini machine.
- The Gemini machine uses a closer Gemini-style four-color sparkle mark, and the token changes into a labeled `PRD` before traveling to Zone 1.
- Zone 1 copy completion now produces a `FIRST PROTOTYPE` token, making the build step feel connected to the next understanding/debugging stages.
- The help HUD no longer stays permanently on screen; it auto-hides and can be restored with `?` or the bottom-center help button.
- A new SVG favicon gives the tab a readable pixel-style app identity.

## Runtime Files

The app runs from these runtime files:

- `favicon.svg`
- `index.html`
- `style.css`
- `app.js`
- `prompts.js`

## Build / Deploy

There is no build step and no framework setup.

To run locally:

1. Open `index.html` directly in a browser, or
2. Serve the folder with a simple static server such as `python3 -m http.server`

To deploy on GitHub Pages:

1. Push the repo to GitHub
2. Keep `index.html` at the repo root
3. Enable GitHub Pages for the repository root / default branch

Note:
This README assumes the GitHub repository stays at `lpcode808/Vibe-Coding-Explorer`. If the owner or repo name changes, update the Pages link above.

## Issues Faced So Far

These were the main problems encountered during the build so far:

- The original PRD only called for a preview in Zone 2, but later the app was updated so all three zones show previews.
- The first keyboard activation implementation was flaky after opening and closing a drawer with `Space`.
- Focus could remain on a hidden drawer button after closing, which caused later keyboard activation to feel broken even though mouse/touch still worked.
- The first panther avatar was too abstract and was updated into a more readable pixel panther face.
- The drawer started as a shorter sheet and was later expanded to full-height.
- Browser automation checks were inconsistent because the local Playwright/browser session in this environment sometimes dropped or failed to create its working directory.

## Fixes Already Made

- Added an activation latch so keyboard zone opening does not get stuck on repeat timing
- Returned focus to the map after drawer close so `Space` works again reliably
- Added `blur` handling so lost keyup events do not leave movement or activation in a stuck state
- Tightened zone collision sizing for keyboard-play activation
- Added full-height drawer behavior
- Added prompt previews for all three zones

## Current Rough Edges

- The keyboard-play mode works, but it is still lighter than a full game-style movement system.
- Touch users currently tap zones directly; there is not yet a touch joystick or D-pad for the avatar.
- The repository currently focuses on the live app, not a broader teacher or content management workflow.

## Suggested Upload Set

Recommended to upload:

- `favicon.svg`
- `index.html`
- `style.css`
- `app.js`
- `prompts.js`
- `README.md`
- `.gitignore`

Recommended to keep local unless you want the extra source/docs in the repo:

- `prompt-quest-PRD.md`
- `generator.md`
- `translator.md`
- `evaluator.md`
- `surveyor.md`

The app does not need those extra markdown files at runtime because the shipped prompt content already lives inside `prompts.js`.
