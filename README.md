# Puxin Video Studio

Production/operator documentation: [`docs/production-runbook.md`](docs/production-runbook.md) and [`docs/puxin-studio-v1.md`](docs/puxin-studio-v1.md).

This repository is a Puxin-focused fork of Abekyo Editor. The original upstream README is retained below for the underlying editor/rendering architecture.

# Abekyo Editor

[日本語版 / Japanese](./README.ja.md)

[![CI](https://github.com/abekyo/abekyo-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/abekyo/abekyo-editor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

An open-source, self-hosted video editor **and scriptable rendering pipeline** built on top of [Remotion](https://www.remotion.dev/) and Next.js. Edit in the browser — timeline, subtitles, BGM, export to MP4 — or skip the UI entirely: every project is a plain JSON document with a published schema, so a script, a CI job, or an AI agent can generate the timeline and POST it to your server for an MP4. Either way, rendering happens on hardware you control and media never leaves it.

AI tools are getting good at deciding *what* a video should be. Abekyo is the layer that deterministically *executes* that decision — and the human touch-up editor for the last 10% a model gets wrong.

## Highlights

- **JSON-native projects, AI-ready** — the whole timeline is one JSON document with a published schema ([`/schema/project.schema.json`](public/schema/project.schema.json)). Dry-run it against `POST /api/project/validate`, render it with `POST /api/render`, and let AI agents drive the whole pipeline through the bundled zero-dependency MCP server (`npm run mcp`). See [docs/headless.md](docs/headless.md).
- **Image / video timeline** — drop in any number of images or video clips (MP4, MOV, WebM), rearrange, and trim. Clicking **+ Add scene** in the editor opens a media picker and uploads in one step.
- **Per-clip narration** — attach an audio file to any clip; clip duration auto-fits the audio length.
- **BGM track** — upload once, reuse across projects. Trim start/end, adjust volume, fade in/out.
- **Subtitle editor** — typography presets (fonts, shadows, outlines), per-subtitle timing, drag-able on-screen position.
- **Transitions and motion** — fade, crossfade, slide, wipe, zoom, plus per-clip Ken Burns / pan / pulse effects.
- **Server-side render to MP4** — the `/api/render` route uses `@remotion/renderer` on your machine. NDJSON streaming progress, per-IP rate limiting, concurrency cap, and `cancelSignal` propagation when a client disconnects. No third-party rendering service, no API keys.
- **Magic-byte upload validation** — `/api/upload` ignores the client-declared MIME and verifies the file signature before saving, so a `.html` renamed to `.png` gets rejected.
- **Bilingual UI** — English by default, Japanese switchable from the toggle on the landing page. Add more locales by dropping a new `messages/<locale>.json`. CI parity check provided via `npm run i18n:check`.
- **Zero external dependencies at runtime** — no DB, no auth provider, no payment gateway. `.env.example` is entirely optional overrides.

## Requirements

- **Node.js 20 or later**
- **~700 MB disk** for dependencies
- **First export downloads ~90 MB** of Chrome Headless Shell (Remotion manages this automatically; one-time cost)

## Quick start

```bash
git clone https://github.com/<your-fork>/Abekyo-editor.git
cd Abekyo-editor
npm install
npm run dev
```

Open http://localhost:3000, upload some images, click **Start Editing**, then **Export**. The rendered MP4 appears in `public/uploads/output/` and is downloaded automatically.

## Headless & AI pipelines

You don't need the UI to make a video — the server renders any conforming project JSON:

```bash
curl -F "file=@./intro.png" http://localhost:3000/api/upload            # → /uploads/image/...
curl -X POST -H 'content-type: application/json' --data @project.json \
  http://localhost:3000/api/project/validate                            # free dry-run
curl -sN -X POST -H 'content-type: application/json' --data @project.json \
  http://localhost:3000/api/render                                      # NDJSON progress → MP4
```

The project format is published as a JSON Schema at [`/schema/project.schema.json`](public/schema/project.schema.json) — hand it to an LLM and ask for a conforming timeline. A zero-dependency MCP server (`npm run mcp`) exposes the same pipeline as tools (`get_project_schema`, `upload_media`, `validate_project`, `render_video`) so agents like Claude can upload media, build a project, and render it end-to-end, with the browser editor as the human touch-up step.

Full walkthrough: [docs/headless.md](docs/headless.md).

## Project layout

```
Abekyo-editor/
├── app/
│   ├── page.tsx                 # Home — upload UI
│   ├── video-edit/page.tsx      # Editor shell (reads clips from store)
│   ├── api/upload/route.ts      # Accepts multipart files → public/uploads/
│   ├── api/render/route.ts      # Remotion bundle + renderMedia → MP4
│   └── api/project/validate/route.ts # Dry-run project validation (shared rules with /api/render)
├── components/
│   ├── VideoEditor.tsx          # Editor shell — orchestrates timeline, side panels, preview, and export
│   ├── Onboarding.tsx           # First-visit guided tour (DOM target lookup via lib/onboardingTargets.ts)
│   ├── LanguageSwitcher.tsx     # EN/JA toggle (cookie-based)
│   ├── PlotEditor.tsx           # Standalone plot text editor
│   ├── VideoThumbnail.tsx       # Static clip thumbnail
│   └── editor/                  # Sub-components extracted from VideoEditor.tsx (Phases 1–3)
│       ├── EditorToolbar.tsx        # Top bar (undo/redo, play, save, export)
│       ├── SidePanelsContainer.tsx  # Mutually-exclusive Properties / Subtitle / BGM slide-ins
│       ├── ModernTimeline.tsx       # Multi-track timeline (clips / subtitles / BGM)
│       ├── ClipProperties.tsx       # Per-clip Properties panel body
│       ├── SubtitleEditor.tsx       # Per-subtitle editor panel body
│       ├── SubtitlePreviewOverlay.tsx # Drag-to-position subtitle overlay on the preview
│       ├── BgmSettings.tsx          # BGM library + upload + trim controls
│       ├── MediaUploadButton.tsx    # Per-clip image/video swap button
│       ├── ToolButton.tsx           # Side toolbar icon-with-label button
│       ├── dialogs/
│       │   ├── ExportDialog.tsx     # Export resolution picker
│       │   ├── ExitConfirmDialog.tsx# "Save before leaving?" prompt
│       │   └── ShortcutsOverlay.tsx # Keyboard shortcut cheat sheet
│       └── hooks/
│           ├── useKeyboardShortcuts.ts # All keydown bindings in one place
│           ├── useDragSession.ts       # Shared pointer-drag session primitive
│           ├── useClipHandlers.ts      # Clip CRUD: delete / reorder / extend / copy / paste
│           └── useSubtitleHandlers.ts  # Subtitle CRUD: add / edit / delete / copy / paste
├── src/                         # Remotion compositions (ProductVideo, Transitions, Subtitle, …)
├── lib/
│   ├── store.ts                 # Zustand — long-lived project data (clips, BGM, video settings)
│   ├── editorStore.ts           # Zustand — transient editor state (selection, currentTime, undo stack, panel toggles)
│   ├── project/                 # project-format rules shared by /api/render and /api/project/validate
│   │   ├── validate.ts          #   structural validation + resource ceilings
│   │   └── media.ts             #   media-URL origin policy
│   ├── subtitlePresets.ts       # typography presets
│   ├── bgmLibrary.ts            # type defs + client-side helpers (runtime data lives in localStorage)
│   ├── onboardingTargets.ts     # type-safe registry of DOM ids the onboarding tour points at
│   ├── hooks/useUrlConverter.ts # passthrough URL helper for Remotion player
│   └── utils/                   # logger, retention sweep, clip/BGM maths, shared upload client, metadata
├── messages/
│   ├── en.json                  # English translations (default)
│   └── ja.json                  # Japanese translations
├── i18n/                        # next-intl request/locale plumbing
├── scripts/
│   ├── check-i18n.mjs           # parity check across messages/*.json (used in CI)
│   └── mcp-server.mjs           # zero-dependency MCP server for AI-agent-driven editing (npm run mcp)
├── tests/
│   ├── upload-detect.test.ts    # magic-byte classification (unit)
│   ├── upload-route.test.ts     # POST /api/upload integration (fs mocked)
│   ├── render-rate-limit.test.ts # sliding-window limiter, IP extraction (unit)
│   ├── render-route.test.ts     # POST /api/render integration (Remotion mocked)
│   ├── project-validate.test.ts # project validator rules + schema↔validator sync
│   ├── project-validate-route.test.ts # POST /api/project/validate integration (incl. media policy)
│   ├── timeline.test.ts         # frame-grid layout (cumulative boundary rounding)
│   ├── timeline-audio-offset.test.ts # narration 1.2× rate ↔ audioStartTime conversion
│   ├── clips.test.ts            # clip array helpers (reindexing)
│   ├── bgm.test.ts              # BGM trim maths (preview ↔ renderer parity)
│   ├── store.test.ts            # Zustand app store (project data)
│   ├── editorStore.test.ts      # Zustand editor store actions (undo/redo/panels)
│   ├── metadata.test.ts         # metadata helpers
│   ├── retention.test.ts        # upload/output retention sweep
│   ├── useDragSession.test.tsx  # pointer-drag session hook
│   ├── check-i18n.test.ts       # i18n parity + used-keys script (subprocess-based)
│   ├── components/              # React Testing Library smoke tests (jsdom)
│   │   ├── VideoEditor.test.tsx     # editor mount + toolbar / panel toggle integration
│   │   ├── MediaUploadButton.test.tsx
│   │   ├── ClipProperties.test.tsx
│   │   ├── SubtitleEditor.test.tsx
│   │   ├── BgmSettings.test.tsx
│   │   └── Onboarding.test.tsx
│   ├── helpers/render.tsx       # NextIntlClientProvider-aware render helper
│   └── setup-jsdom.ts           # jest-dom matchers + jsdom polyfills
├── .github/
│   └── workflows/ci.yml         # typecheck / test / i18n / build / lint (warning ratchet) on every push & PR
├── proxy.ts                     # Security headers on every response (CSP, HSTS, COOP, …)
├── docs/
│   ├── headless.md              # headless / AI-pipeline guide (schema, curl, MCP)
│   └── headless.ja.md           # same, in Japanese
├── public/schema/
│   └── project.schema.json      # published JSON Schema for the project format
└── public/uploads/
    ├── image/                   # user-uploaded images
    ├── audio/                   # user-uploaded audio (clip narration + BGM)
    ├── video/                   # user-uploaded video clips (MP4 / MOV / WebM)
    └── output/                  # rendered MP4 files
```

## Tech stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand |
| i18n | next-intl (cookie-based locale) |
| Video engine | Remotion 4 (`@remotion/bundler` + `@remotion/renderer` server-side, `@remotion/player` in-browser preview) |
| Language | TypeScript 5 |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production server |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite — API-route integration tests (upload, render, validate), project-format validation, timeline / BGM / clip maths, Zustand stores, and React Testing Library smoke tests for the main editor panels |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Run with v8 coverage report |
| `npm run i18n:check` | Verify `messages/*.json` key parity and that every `t('…')` key referenced in code exists in the locales (run in CI) |
| `npm run mcp` | Start the MCP server (stdio) — lets an AI agent upload media, validate projects, and render through a running Abekyo server ([docs](docs/headless.md)) |
| `npm run remotion:studio` | Open Remotion Studio for composition debugging |
| `npm run remotion:render` | Render via CLI (advanced) |

## Configuration

Copy `.env.example` to `.env.local` and adjust if needed. Every variable is optional — the app runs with no env vars set.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | Canonical URL generation in metadata, and absolute URL resolution inside `/api/render`. Set to your deployment URL in production. |
| `NEXT_PUBLIC_GITHUB_URL` | _unset_ | Repository URL used by the landing-page GitHub buttons and footer links. When unset, those buttons are hidden so you never ship a dead placeholder link. |
| `RENDER_MAX_CONCURRENT` | `1` | Maximum simultaneous `/api/render` jobs. Remotion is heavy (Chromium + ffmpeg); raise only on beefy hardware. |
| `RENDER_RATE_LIMIT_WINDOW_MS` | `600000` (10 min) | Per-IP sliding window length for `/api/render`. |
| `RENDER_RATE_LIMIT_MAX` | `10` | Maximum `/api/render` requests per IP within the window. |
| `RENDER_MAX_CLIPS` | `200` | Maximum clips per project (enforced by `/api/render` and `/api/project/validate`). |
| `RENDER_MAX_CLIP_DURATION_SECONDS` | `300` | Maximum duration of a single clip. |
| `RENDER_MAX_TOTAL_DURATION_SECONDS` | `1800` | Maximum total video duration. |
| `RENDER_MAX_SUBTITLES` | `2000` | Maximum subtitles per project. |
| `RENDER_ALLOWED_MEDIA_HOSTS` | _empty_ | Comma-separated extra hostnames the renderer may fetch media from. By default only same-origin `/uploads/...` paths are allowed. |
| `TRUST_PROXY_HEADERS` | _unset_ | Set to `true` only when running behind a reverse proxy you control, so rate limiting reads `X-Forwarded-For`. Left unset, all clients share one rate-limit bucket. |
| `UPLOAD_RETENTION_DAYS` | _unset_ | Days before uploaded media and rendered outputs under `public/uploads/` are swept. Unset means nothing is ever deleted — set this on any deployment that accepts uploads from others. |

## Keyboard shortcuts

The editor ships with keyboard bindings modelled on desktop NLEs. Shortcuts are ignored while an input or textarea is focused, so typing into a field never triggers them. A shortcut reference overlay is available in-app from the toolbar.

### Playback and navigation

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Step 1 frame (30 fps) |
| `↑` / `↓` | Jump to previous / next clip (seeks playhead to clip start) |
| `Esc` | Close the active dialog or side panel |

### Editing

| Key | Action |
|---|---|
| `S` | Split selected clip or subtitle at the playhead |
| `A` | Cut selection back to the previous clip boundary |
| `D` | Cut selection forward to the next clip boundary |
| `Delete` / `Backspace` | Delete the current selection (clips and/or subtitles) |
| `Cmd` / `Ctrl` + `N` | Add a new clip (opens the media picker) |

### Clipboard

Clipboard operations auto-route: if a subtitle is selected it targets subtitles, otherwise it targets the selected clip(s).

| Key | Action |
|---|---|
| `Cmd` / `Ctrl` + `C` | Copy selection |
| `Cmd` / `Ctrl` + `V` | Paste (into the context matching what was copied) |
| `Cmd` / `Ctrl` + `X` | Cut selection |

### History

| Key | Action |
|---|---|
| `Cmd` / `Ctrl` + `Z` | Undo |
| `Cmd` / `Ctrl` + `Shift` + `Z` | Redo |
| `Cmd` / `Ctrl` + `Y` | Redo (Windows-style alias) |

### Export dialog

| Key | Action |
|---|---|
| `Enter` | Confirm and start the export |
| `Esc` | Cancel and close the dialog |

Bindings live in [`components/editor/hooks/useKeyboardShortcuts.ts`](components/editor/hooks/useKeyboardShortcuts.ts) — one switch statement, easy to audit or extend.

## Adding a language

1. Create `messages/<locale>.json` with the same shape as `messages/en.json`.
2. Add the locale code to `i18n/routing.ts` (`locales: ['en', 'ja', '<new>']`).
3. Add a button for it to `components/LanguageSwitcher.tsx`.

That's it — the app re-loads translations based on the `lang` cookie.

## Design notes

- **No authentication shipped.** This editor is meant to be self-hosted behind whatever auth your stack already uses (reverse proxy, internal network, or wrapper app). The render and upload endpoints have rate limiting and concurrency caps, but no user identity. Do not expose `/api/upload` or `/api/render` to the public internet without putting auth in front.
- **Narration plays at 1.2× speed.** The renderer plays each clip's narration audio at `NARRATION_PLAYBACK_RATE` (1.2), so a clip consumes its audio file ~20% faster than wall-clock, and `audioStartTime` is measured in the audio file's own timebase. When generating projects headlessly, set `duration = audioDurationSeconds / 1.2`.
- **Image and video clips, audio muted.** Each clip's primary asset is an image or short video (MP4 / MOV / WebM). Video clips render through Remotion's `<OffthreadVideo>`; their original audio track is muted because every clip already has its own narration channel. Trim happens by clip duration, not by source-video time range.
- **BGM library ships empty.** Build a personal library via the upload button in the BGM settings panel (persisted to `localStorage`).
- **Server-side rendering only.** Export goes through `/api/render` on your Next.js server; there is no browser-native MP4 encoding. Chrome Headless Shell is required (Remotion downloads it automatically on first export, ~90 MB).
- **File upload storage is local-disk.** Files live under `public/uploads/`. For multi-tenant deployments, swap `app/api/upload/route.ts` to write to your object store (S3 / R2 / GCS).

## Contributing

PRs welcome. Especially useful:

- Additional UI languages — drop a new `messages/<locale>.json` and open a PR.
- New transitions and image effects — see `src/Transitions.tsx` and `src/ImageEffects.tsx`.
- Visual polish and accessibility improvements.
- Object-storage adapters for `/api/upload` and `/api/render` output.

Keep the `.env.example` minimal. Do not add runtime dependencies on paid services.

## License

MIT © 2026 Opportunity Inc. See [LICENSE](./LICENSE).

## Credits

Abekyo Editor stands on the shoulders of:

- [Remotion](https://www.remotion.dev/) for the video engine
- The Next.js and React teams
- next-intl, Zustand, and Tailwind
