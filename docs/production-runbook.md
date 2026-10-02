# Puxin Video Studio — production runbook

Updated: 2026-10-02

## Canonical locations

- Public URL: `https://video-studio.puxin.ccwu.cc/studio`
- Public origin: `https://video-studio.puxin.ccwu.cc`
- Google OAuth callback: `https://video-studio.puxin.ccwu.cc/api/puxin/drive/callback`
- VPS project path: `/srv/ai-workspace/projects/puxin-video-studio`
- GitHub: `https://github.com/Randytsay/puxin-video-studio`
- Active branch: `feat/puxin-studio-v01`
- Pull request: `https://github.com/Randytsay/puxin-video-studio/pull/1`

## Runtime topology

```text
video-studio.puxin.ccwu.cc
        ↓ HTTPS
Cloudflare Named Tunnel: puxin-video-studio
        ↓
http://127.0.0.1:3110
        ↓
Docker: puxin-video-studio-app
        ↓
Next.js / Remotion / SQLite / persistent media
```

The tunnel connector runs in Docker as `puxin-video-studio-tunnel`. The application container is `puxin-video-studio-app`. Both use `restart unless-stopped`.

The app is protected by HTTP Basic Auth. Credentials and the precomputed `PUXIN_BASIC_AUTH_HEADER` are deployment secrets and intentionally are not stored in Git.

## Persistent data

- Data root: `/srv/ai-workspace/projects/puxin-video-studio/.data/studio`
- SQLite: `.data/studio/studio.sqlite`
- Imported images: `.data/studio/media/image/`
- Narration/BGM: `.data/studio/media/audio/`
- Veo generated clips: `.data/studio/media/video/`
- Rendered outputs: `.data/studio/media/output/`
- OAuth refresh token: inside the data root, mode `0600`; never commit it
- Backups: `.data/studio/backups/`, daily retention currently seven days

Do not delete `.data/studio` during deploys or cache cleanup.

## Cloudflare R2 release media

- Bucket: `puxin-enrollment-media`
- Public R2 endpoint: `https://pub-81becb6c33d744ad9c8bff0f27c0d785.r2.dev`
- Release objects use `video/mp4` with byte-range support so a shared URL can play directly in a browser.
- The original ambient BGM `茶煙・心靜` is stored under `puxin-video-studio/audio/chayan-xinjing-20261002.mp3`; it was procedurally synthesized for this project and normalized to about `-24.9 LUFS`.
- Current water-kettle release: `https://pub-81becb6c33d744ad9c8bff0f27c0d785.r2.dev/puxin-video-studio/releases/water-kettle-meditation-20261002.mp4`

R2 is currently a publication target, not the full off-site application backup. Do not treat a published MP4 as a replacement for SQLite/media backups.

## Google Cloud / Vertex AI

- Google Cloud project: `video-studio-510316`
- Service account: `puxin-video-studio@video-studio-510316.iam.gserviceaccount.com`
- Vertex video model: `veo-3.1-fast-generate-001`
- Vertex video region: `us-central1`
- TTS model: `gemini-3.1-flash-tts-preview`
- TTS region: `global`
- Authentication: keyless service-account impersonation from VPS ADC; no service-account JSON key is required

MiniMax H3 is intentionally kept outside this MIT repository. The runtime image includes Python 3.12 and \`google-colab-cli\`; the external H3 skill checkout is mounted read-only and referenced by \`MINIMAX_H3_RUNNER_PATH\`. Do not vendor the external skill into this repository unless its licensing is explicitly clarified.

## Google Drive

- Source/root folder name: `IG輪播素材`
- Root folder ID: `11KCNFFXmZQG6CSITUNM_WfXA-nyOr0ah`
- Source reads use the service account with read-only Drive scope.
- Result writes use the owner's OAuth grant and are constrained by application logic to the configured output root.
- Output hierarchy: `IG輪播素材 / 製作成果 / 作品名稱 · 專案ID`

The fixed callback below must remain registered in Google Cloud Console:

```text
https://video-studio.puxin.ccwu.cc/api/puxin/drive/callback
```

Do not put OAuth client secrets or refresh tokens in this repository.

## Deployment notes

- Build with: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`
- Stop the running app container before replacing `.next`; running Next.js and Turbopack must not share the build directory while rebuilding.
- `PUXIN_RENDER_ORIGIN=http://127.0.0.1:3110`
- `PUXIN_PUBLIC_ORIGIN=https://video-studio.puxin.ccwu.cc`
- Public ingress is Cloudflare Tunnel; the app itself is not directly exposed.

### Minimum health checks

1. Unauthenticated `GET /studio` returns `401`.
2. Authenticated `GET /studio` returns `200`.
3. `GET /api/puxin/drive/status` reports the source folder accessible.
4. `GET /api/puxin/drive/output` reports `connected=true` and `writable=true`.
5. `GET /api/puxin/providers` reports Vertex providers configured.
6. Docker containers `puxin-video-studio-app` and `puxin-video-studio-tunnel` are running.

## Secret inventory — names only

These values are required in deployment but must never be committed:

- `PUXIN_BASIC_AUTH_HEADER`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- stored Google Drive refresh token
- Cloudflare Named Tunnel token

The repository should contain only variable names, public IDs, public URLs and recovery instructions.
