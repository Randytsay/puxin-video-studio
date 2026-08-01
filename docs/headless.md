# Headless & AI-pipeline usage

[日本語版 / Japanese](./headless.ja.md)

Abekyo Editor is more than the timeline UI: every project is a plain JSON
document, and the server renders that JSON to MP4 over HTTP. That makes the
whole editor scriptable — from a shell script, a CI job, or an LLM agent that
writes the timeline for you. The browser UI then becomes the *touch-up* layer:
open a generated project, nudge what the model got wrong, export.

```
┌─────────────┐   project JSON    ┌──────────────────┐    MP4
│  your code  │ ────────────────► │  Abekyo server   │ ─────────►
│  or an LLM  │                   │  (self-hosted)   │
└─────────────┘                   └──────────────────┘
```

Everything below runs against a normal `npm run dev` / `npm run start`
instance. No API keys, no external services; media never leaves your server.

## The project format

A project is one JSON object: `clips` (ordered scenes, each an image/video
plus optional narration), optional `subtitles` (absolute-time overlays),
optional BGM fields, and the output format (`resolution`, `aspectRatio`).

The machine-readable contract is published by the server itself:

```
GET /schema/project.schema.json
```

([source](../public/schema/project.schema.json)) — every field is documented
with types, enums, and defaults. If you are generating projects with an LLM,
paste that schema into the prompt (or let the MCP server's
`get_project_schema` tool fetch it) and ask for a conforming object.

A minimal project:

```json
{
  "clips": [
    { "plotName": "Intro", "text": "Opening scene", "imageUrl": "/uploads/image/intro.png", "audioUrl": "", "duration": 3, "index": 0 },
    { "plotName": "Detail", "text": "Product close-up", "imageUrl": "/uploads/image/detail.png", "audioUrl": "/uploads/audio/detail.mp3", "duration": 5, "index": 1, "transitionType": "crossfade" }
  ],
  "subtitles": [
    { "id": "s1", "text": "Hello!", "startTime": 0.5, "endTime": 2.5, "position": "bottom", "fontSize": 5, "color": "#ffffff", "align": "center" }
  ],
  "bgmUrl": "/uploads/audio/bgm.mp3",
  "bgmVolume": 0.2,
  "resolution": "1080p",
  "aspectRatio": "16:9"
}
```

> **Narration timing:** clip narration plays at **1.2× speed** in the renderer.
> A clip with narration should have `duration = audioDurationSeconds / 1.2`, and
> `audioStartTime` is measured in the audio file's own timebase (timeline
> seconds × 1.2).

## The three endpoints

### 1. `POST /api/upload` — get media onto the server

```bash
curl -F "file=@./intro.png" http://localhost:3000/api/upload
# → {"url":"/uploads/image/1712...-intro.png","type":"image","filename":"...","size":12345}
```

File type is verified from magic bytes, not the filename. Use the returned
`url` as a clip's `imageUrl` / `audioUrl` or as `bgmUrl`. Media references in
projects must be same-origin paths like these (or hosts you explicitly allow
via `RENDER_ALLOWED_MEDIA_HOSTS`).

### 2. `POST /api/project/validate` — dry-run, free

```bash
curl -s -X POST http://localhost:3000/api/project/validate \
  -H 'content-type: application/json' \
  --data @project.json
```

Returns `200` with a summary when the project is renderable:

```json
{
  "ok": true,
  "warnings": [{ "path": "clips[2].imageUrl", "message": "clip has no image or video; it will render as a black frame" }],
  "summary": { "clipCount": 3, "subtitleCount": 4, "durationSeconds": 12.5, "durationInFrames": 375, "fps": 30, "hasBgm": true },
  "schema": "/schema/project.schema.json"
}
```

or `422` with path-scoped errors (`{"path": "clips[0].duration", "message":
"duration must be a positive number (seconds)"}`) when it is not. The rules
are exactly the ones `/api/render` enforces — same code, including the
media-origin policy (same-origin `/uploads/...` paths or allowlisted hosts)
— so a passing dry-run is a guarantee the render won't be rejected. Wire it
into CI, or into an agent loop as the cheap "did the LLM produce a valid
timeline?" check.

### 3. `POST /api/render` — JSON in, MP4 out

```bash
curl -sN -X POST http://localhost:3000/api/render \
  -H 'content-type: application/json' \
  --data @project.json
```

The response is a stream of NDJSON progress events, ending in either:

```json
{"type":"progress","phase":"rendering","progress":63,"message":"Rendering frames… 55%"}
{"type":"done","videoUrl":"/uploads/output/output-1712...mp4","filename":"output-1712...mp4"}
```

or `{"type":"error", ...}`. Download the finished file from `videoUrl`.
The endpoint is rate-limited per IP and caps concurrent renders (see the
`RENDER_*` variables in the [README](../README.md#configuration)); a `429`
or `503` includes a `Retry-After` header.

## MCP server — let an AI agent drive the editor

`scripts/mcp-server.mjs` is a zero-dependency
[MCP](https://modelcontextprotocol.io) server (stdio transport) that exposes
the pipeline above as four tools:

| Tool | What it does |
|---|---|
| `get_project_schema` | Fetches the project JSON Schema so the model knows the format |
| `upload_media` | Uploads a local file, returns its `/uploads/...` URL |
| `validate_project` | Dry-runs a project, returns errors/warnings/summary |
| `render_video` | Renders to MP4; optionally saves the file locally |

Start your Abekyo server, then register the MCP server with your client.
Claude Code:

```bash
claude mcp add abekyo -e ABEKYO_URL=http://localhost:3000 -- node /path/to/Abekyo-editor/scripts/mcp-server.mjs
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "abekyo": {
      "command": "node",
      "args": ["/path/to/Abekyo-editor/scripts/mcp-server.mjs"],
      "env": { "ABEKYO_URL": "http://localhost:3000" }
    }
  }
}
```

Then ask for a video in natural language — "make a 15-second vertical teaser
from the images in ./shots with captions" — and the agent uploads the media,
writes the project JSON, validates it, and renders. Open the result in the
editor UI whenever human judgment is needed.

## Notes for production pipelines

- **Set `NEXT_PUBLIC_BASE_URL`** when the server is not on localhost — media
  URL resolution during rendering is anchored to it.
- **`RENDER_ALLOWED_MEDIA_HOSTS`** allowlists external CDNs for media
  references; everything else must be same-origin.
- **Resource ceilings** (`RENDER_MAX_CLIPS`, `RENDER_MAX_CLIP_DURATION_SECONDS`,
  `RENDER_MAX_TOTAL_DURATION_SECONDS`, `RENDER_MAX_SUBTITLES`) bound what an
  unauthenticated caller can make the renderer do. Raise them deliberately.
- **Set `UPLOAD_RETENTION_DAYS`** on any deployment that accepts uploads from
  others — uploaded media and rendered MP4s under `public/uploads/` are then
  swept after that many days (unset means nothing is ever deleted). Either
  way, download the MP4 rather than hotlinking `/uploads/output/` long-term.
