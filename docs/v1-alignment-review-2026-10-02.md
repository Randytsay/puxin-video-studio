# Puxin Video Studio V1 — plan alignment & gap review

Date: 2026-10-02

## Baseline: original product plan

The original Puxin-specific plan was to turn illustrated meditation/carousel material into a reusable vertical-video workflow, using:

1. Google Drive as the source library.
2. Comic/panel splitting for multi-panel source images.
3. A 9:16 scene builder that preserves the original illustration and visible typography.
4. Natural Traditional-Chinese narration through Gemini TTS.
5. Optional AI motion through provider abstraction: Vertex AI Veo as the production cloud path, with MiniMax H3/Colab kept as an optional external provider.
6. BGM, subtitles, scene timing and motion controls.
7. Deterministic Remotion rendering to MP4.
8. A workflow simple enough for Puxin content operators rather than requiring the full general-purpose editor.

The implementation later added project persistence, durable render jobs, Drive result sync, fixed-domain deployment, backups and authentication. These are extensions of the original plan, not deviations.

## Alignment matrix

| Original capability | Current status | Assessment |
| --- | --- | --- |
| Drive source library | Complete | `IG輪播素材` is readable through keyless service-account impersonation. |
| Comic split | Mostly complete | V1 exposes explicit single/double split with adjustable divider. The auto detector still exists in the engine/API but is intentionally not exposed in the V1 creation UI. |
| 9:16 scene builder | Complete | 9:16 and 3:4 are supported; original-image preserving `contain` / `fit-blur` plus `cover` are available. |
| Preserve original image/text | Complete for static scenes | Static source is preserved without recreating text. Veo is prompted to preserve it, but generative video cannot guarantee pixel-perfect typography. |
| Gemini TTS | Functionally complete | Real Vertex generation, six voices, style prompt, cache, per-scene audition and bulk generation are implemented. Reliability gap remains for quota/rate-limit retry. |
| Veo AI motion | Functionally complete | V1 has explicit per-scene confirmation, Veo 3.1 Fast generation and persistent MP4 replacement. Long-running Veo state is still client-polled rather than persisted server-side. |
| MiniMax H3 provider | Placeholder only | Provider registry/config flag exists; no production worker/UI execution path is implemented. |
| BGM | Complete | Upload, volume control and Remotion mixing work. No curated Puxin BGM library yet. |
| Subtitles | Partial | Scene-level narration subtitle on/off exists. Word-level timing/SRT and V1 typography/timing editor are not implemented. |
| Scene timing/motion | Complete | Duration, static motions, transitions and video-scene handling work. |
| Browser preview | Complete | V1 embeds the Remotion Player with audio/video preview. |
| MP4 rendering | Complete | Durable SQLite-backed render queue, restart recovery and 720p/1080p output are implemented. |
| Result persistence | Complete | SQLite + `.data/studio/media` survive restarts/deploys and are included in backup. |
| Drive result sync | Complete | MP4, project JSON, narration script and per-scene WAV files are written to `製作成果`. |
| Fixed production URL | Complete | `https://video-studio.puxin.ccwu.cc/studio` through a Cloudflare Named Tunnel. |
| Authentication | Complete for current private use | Basic Auth protects the full app. This is not user/role management. |
| Backup | Partial | Daily seven-day local backup works; there is no off-site copy yet. |

## Full end-to-end validation — water-kettle story

Validation project:

- Title: `驗收｜水壺故事 V1 完整流程 20261002`
- Project ID: `c1043cf2-7d28-4a6c-9984-004ab3cd3e51`
- Render job: `3c68d794-4506-4037-9282-eee744c6fec2`
- Drive result folder: `https://drive.google.com/drive/folders/1dY6OS0PR0XQt1xYYosfdGcEq_S5vlfZ-`
- MP4: `https://drive.google.com/file/d/15XCyW8V_U8U7Es2afnmSaFinYK5n7Wt2/view`

Validated flow:

1. Read the eight `水壺` PNG files from Google Drive.
2. Split pages 01–07 into upper/lower panels and keep page 08 whole: 15 scenes total.
3. Generate Gemini TTS narration for all 15 scenes using `Kore` and a Taiwan-Mandarin style prompt.
4. Animate scene 1 and scene 6 with Veo 3.1 Fast; keep the other scenes as original illustrations with deterministic motion.
5. Add a low-volume validation BGM.
6. Persist the V1 project in SQLite.
7. Render through Remotion.
8. Upload the result package back to Google Drive.

Result media:

- 1080 × 1920
- H.264 video, 30 fps
- AAC stereo audio, 48 kHz
- Duration: 101.42 seconds
- File size: 111,864,737 bytes
- 15/15 scenes have narration audio
- 2/15 scenes use Veo-generated video
- BGM is present

Drive output was independently checked after upload. The result folder contains the MP4, project JSON, narration script and all 15 narration WAV files.

### Validation finding: TTS rate limiting

The first bulk run reached Vertex quota/rate limiting at scene 12 (`429 Resource exhausted`). Retrying with backoff completed successfully; previously generated narration was reused from cache. This is an important production finding: the current V1 browser bulk-generation loop should implement server-side retry/backoff instead of surfacing a temporary 429 as a failed batch.

## Remaining work

### P0 — recommended before calling the product V1.0 final

1. **TTS retry/backoff and durable bulk queue.** Handle `429` and transient Vertex failures automatically; resume from cache without asking the operator to restart the batch.
2. **Persist Veo long-running jobs.** A browser close/reload currently loses the client-side polling context. Store operation name/status in SQLite and let a server worker resume polling and attach the result.
3. **Off-site backup.** Current backups live on the same VPS. Replicate backups to R2, Drive, or another host.
4. **OAuth production status.** The owner OAuth app is still External/Testing. Complete the appropriate Google OAuth publishing/verification path for long-term refresh-token stability.

### P1 — product-quality improvements

5. **TTS voice acceptance and presets.** Technically validated, but Puxin has not yet chosen the preferred default voice/style by listening. Add a short six-voice audition screen and store an approved Puxin preset.
6. **Veo revert/versioning.** Preserve the original static visual as an explicit previous version so operators can compare/revert after AI animation.
7. **Automatic split suggestion in V1 UI.** The auto detector exists but V1 currently defaults to explicit operator control. Offer “建議拆格” with a visible proposed divider, requiring confirmation.
8. **Subtitle workflow.** Add SRT/word-level timing and subtitle typography controls if narration captions are required for short-video publishing; current V1 is scene-level only.
9. **BGM library.** Current workflow accepts uploads but has no curated, licensed Puxin music library or reusable presets.
10. **Cost/usage guardrails.** Show estimated Veo/TTS use before batch actions and optionally daily/monthly usage summaries to reduce accidental credit consumption.
11. **Project lifecycle.** Add archive/delete/restore and orphan-media garbage collection. Current V1 saves and duplicates projects but does not provide project deletion.

### P2 — optional/future scope

12. **MiniMax H3 execution path.** The provider is registered only. Implement an external runner only if H3 remains strategically useful; do not copy unlicensed skill source into this MIT fork.
13. **Direct social publishing.** Instagram/LINE publishing is not part of the current V1 and was not required for the original core pipeline; add only if Puxin wants a publishing console.
14. **Multi-user roles/audit.** Basic Auth is sufficient for private operation but does not provide named users, roles, or edit history.
15. **Cloud-native render scaling.** Current single-worker VPS rendering is appropriate for the expected workload; scale only if queue demand grows.

## Conclusion

The current implementation matches the original core plan: Drive → panel scenes → narration → optional AI motion → BGM/subtitles → Remotion MP4. It also exceeds the original plan in persistence, Drive output, durable rendering, fixed-domain deployment and backups.

The remaining work is primarily reliability and operator-product polish rather than missing core video-generation capability. The four P0 items above are the practical boundary between “working V1” and “production-final V1.0”.
