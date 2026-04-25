# AGENTS.md — Prompt Quest

Conventions for AI coding assistants (Claude Code, Cursor, Windsurf, Cody, Copilot, Aider, etc.) working in this repo. Keep edits aligned with these rules unless the user explicitly overrides them.

## What This Project Is

`Prompt Quest` is a single-page, vanilla JS overworld map that middle schoolers (ages 11–13) use to copy three "Super Prompts" into Gemini, plus a Zone 0 teacher-facilitation step. No build step, no framework, no backend. Designed for touchscreen Chromebooks.

See `prompt-quest-PRD.md` for the full product spec.

## Runtime Files (don't rename without updating `index.html`)

- `favicon.svg` — pixel favicon for browser tabs/bookmarks
- `index.html` — semantic shell, zone cards, drawer markup, HUD
- `style.css` — overworld visuals, drawer animation, pixel-panther, music button
- `app.js` — tap/keyboard logic, drawer open/close, clipboard, localStorage, panther movement, ambient music
- `prompts.js` — **the content file.** All zone data (emoji, name, tagline, summary, instructions, full prompt text) lives here

## Source Prompt Files (not loaded at runtime)

These markdown files are the canonical source for the prompt content. Their text is inlined into `prompts.js` as template literals.

- `generator.md` → Zone 1 (Forge) `promptText`
- `translator.md` → Zone 2 (Library) `promptText`
- `evaluator.md` → Zone 3 (Workshop) `promptText`
- `surveyor.md` → reserved for Phase 2 (not currently wired up)

**If you edit any of these `.md` files, you MUST also update the matching `promptText` in `prompts.js`** — they will drift otherwise. `prompts.js` is what ships; the markdown files are the readable source of truth.

## Zone Model

```js
// prompts.js shape
{
  id: 'blueprint' | 'forge' | 'library' | 'workshop',
  emoji: '📋',
  name: 'The Blueprint',
  tagline: 'Plan It',
  summary: 'short plain-language description',
  instructions: ['step 1', 'step 2', ...],
  showPreview: true | false,      // show prompt preview block in drawer
  previewLines: 5,                 // if showPreview
  promptText: `full prompt — template literal, escape backticks with \\\``,
  externalLink?: 'https://...',    // optional; renders "Open X" button
  externalLinkLabel?: 'Open Gemini Canvas',
  copyEnabled: true | false,       // false → button acts as "Got It!" (no clipboard)
  doneLabel?: '✅ GOT IT!'
}
```

Zone IDs are stable — `app.js` and CSS reference them, and `localStorage` persists visited IDs under key `promptquest_visited`.

## Architectural Rules

- **No frameworks, no build step.** Vanilla HTML/CSS/JS only. CDN fonts are fine.
- **No backend, no analytics, no telemetry.** Everything client-side.
- **Touch targets ≥ 48×48 px** (Google Material baseline for Chromebooks).
- **Clipboard:** always fall back to `document.execCommand('copy')` if `navigator.clipboard` is missing — older Chromebook browsers need this.
- **localStorage only for progress** (`promptquest_visited`, `promptquest_music`). Don't add other keys without documenting them here.
- **Ambient music defaults to OFF.** Must be explicitly toggled on. Use Web Audio API (no audio files). Keep master gain low (~0.2) and avoid autoplay — Chrome will block it anyway.
- **Respect `prefers-reduced-motion`** (already wired in `style.css`).

## Layout Invariants

- Zones stack vertically in a single column, connected by a dashed path.
- Map fits 1366×768 without horizontal scroll.
- Drawer is a full-height bottom sheet that slides up.
- Panther avatar starts **top-center of the map** and moves with WASD / arrow keys; SPACE activates the nearest touching zone.

## When Adding a New Zone

1. Add an entry to `ZONES` in `prompts.js` (pick a unique `id`).
2. Add a `<button class="zone-card" data-zone-id="newId">…</button>` in `index.html`.
3. No `app.js` changes needed — it wires up every `.zone-card` it finds.
4. Update `prompt-quest-PRD.md` if the change is structural.

## When Adding a Handoff Animation Between Zones

The animation infrastructure is data-driven. To add a new zone-to-zone Gemini handoff:

1. Write an `async function runXHandoff(zone)` (copy the shape of `runBlueprintHandoff` or `runForgePrototypeHandoff`).
2. Call `playMachineHandoffAnimation(config)` inside it with the config fields:
   - `getPoints` — `() => getMachineHandoffPoints(startZoneId, endZoneId)`
   - `initialMode` — `'wireframe'` | `'prototype'`
   - `initialLabel` / `transformedLabel` — the token labels shown during the animation
   - `readingStatus` / `transformedStatus` / `deliveringStatus` — status bar strings
   - `destinationZoneId` — the zone to flash/pulse at the end
3. Set `state.handoff.getActivePoints` to the same getter at the start of the run function, and `null` it in the `finally` block (needed for resize handling).
4. Wire the run function into `handleCopyClick` via a zone-id check (or extract a dispatch map if there are many).

No new geometry function or animation loop needed.

## When Editing Prompt Content

1. Edit the source `.md` file.
2. Copy the full content into `prompts.js` as the matching zone's `promptText` (backtick-wrapped).
3. Escape any backticks inside the prompt with `\``.
4. Do **not** remove existing instructional scaffolding without user confirmation — students rely on the multi-part structure.

## Testing Checklist

Before declaring changes done:

- [ ] Open `index.html` directly in a browser (no server) — nothing should 404.
- [ ] Every zone card opens the drawer with correct content.
- [ ] Copy button writes the right `promptText` to clipboard.
- [ ] `✅` badge appears after copy and survives page reload.
- [ ] WASD moves the panther; SPACE on a touching zone opens the drawer.
- [ ] Zone 0 handoff: token labeled `WIREFRAME` travels to the Gemini machine, machine pulses, token becomes `PRD`, then travels to Zone 1.
- [ ] Zone 1 handoff: token labeled `PROTOTYPE` travels to the Gemini machine, machine pulses, token becomes `CODE GUIDE`, then travels to Zone 2.
- [ ] Drawer keyboard shortcuts work: `1` triggers the top action when present, `2` or Enter triggers the main action.
- [ ] Panther Mode help auto-hides after ~3 seconds; `?` and the bottom-center `?` button show it again.
- [ ] Music toggle defaults to OFF on fresh load; toggling on produces audible sound; toggling off silences it.
- [ ] No horizontal scroll at 1366×768.
- [ ] Drawer closes on ✕, scrim tap, and Escape key.

## Deployment

GitHub Pages at `lpcode808.github.io/Vibe-Coding-Explorer/`. All paths relative, no server-side anything. The runtime files are `favicon.svg`, `index.html`, `style.css`, `app.js`, and `prompts.js` (plus any fonts via CDN).
