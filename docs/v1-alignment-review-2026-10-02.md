# Puxin Video Studio V1 — plan alignment & gap review

Updated: 2026-10-03

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
| Comic split | Complete | V1 exposes explicit single/double split with adjustable divider plus a non-destructive 「建議拆格」 analysis step. The suggested divider is shown first and the image is only split when the operator creates the project. |
| 9:16 scene builder | Complete | 9:16 and 3:4 are supported; original-image preserving `contain` / `fit-blur` plus `cover` are available. |
| Preserve original image/text | Complete for static scenes | Static source is preserved without recreating text. Veo is prompted to preserve it, but generative video cannot guarantee pixel-perfect typography. |
| Gemini TTS | Complete for V1 | Real Vertex generation, six voices, style prompt, cache, per-scene generation, voice audition and SQLite-backed bulk narration jobs are implemented. Batch work survives page closure/service restart; transient `429/5xx` responses retry with bounded backoff. |
| Veo AI motion | Complete for V1 | V1 has explicit per-scene confirmation, durable server-side Veo jobs, persistent MP4 replacement and one-click restoration of the original static image. |
| MiniMax H3 provider | Integrated external provider | V1 can submit/poll H3 jobs through an external Colab runner without copying the unlicensed skill source into this MIT repository. Runtime/ADC connectivity is verified; the currently connected Colab account reports 0 compute-unit balance, so paid H3 inference has not been run. |
| BGM | Complete | Upload, volume control and Remotion mixing work. No curated Puxin BGM library yet. |
| Subtitles | Partial | Scene-level narration subtitle on/off exists. Word-level timing/SRT and V1 typography/timing editor are not implemented. |
| Scene timing/motion | Complete | Duration, static motions, transitions and video-scene handling work. |
| Browser preview | Complete | V1 embeds the Remotion Player with audio/video preview. |
| MP4 rendering | Complete | Durable SQLite-backed render queue, restart recovery and 720p/1080p output are implemented. |
| Result persistence | Complete | SQLite + `.data/studio/media` survive restarts/deploys and are included in backup. |
| Drive result sync | Complete | MP4, project JSON, narration script and per-scene WAV files are written to `製作成果`. |
| Fixed production URL | Complete | `https://video-studio.puxin.ccwu.cc/studio` through a Cloudflare Named Tunnel. |
| Authentication | Complete for current private use | Basic Auth protects the full app. This is not user/role management. |
| Backup | Complete for V1 | Daily seven-day local backup plus private R2 off-site multipart backup is active. SHA-256 is uploaded and the manifest is written last as the completion marker. |

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

The first bulk run reached Vertex quota/rate limiting at scene 12 (`429 Resource exhausted`). Retrying with backoff completed successfully; previously generated narration was reused from cache. The TTS provider now retries transient `429/500/502/503/504` responses with bounded backoff, and a regression test covers the throttling-recovery path.

## Remaining work

### P0 — external account lifecycle

1. **OAuth production status.** The owner OAuth app is still External/Testing. Complete the appropriate Google OAuth publishing/verification path for long-term refresh-token stability. This is a Google account/consent-screen action rather than a missing V1 code path.

Completed reliability items:

- Veo/H3 scene generation now uses SQLite-backed server jobs. Veo operation names survive service/browser restarts and server polling resumes automatically. H3 runs independently of the browser; after a service restart its local runner job is safely re-queued from the same durable request.
- Application data now receives a daily private R2 off-site copy in `puxin-video-studio-backups`. Large archives are chunked, hashed and completed with a manifest; local seven-day backups remain for fast recovery.
- Bulk TTS now uses a SQLite-backed server queue with cursor/progress recovery. Interactive and background TTS calls are globally serialized to avoid accidental provider concurrency.

### P1 — product-quality improvements

2. **TTS approved preset.** A six-voice audition action is now available and uses the same cache as production TTS. Puxin still needs a human listening decision for the organization-wide approved default voice/style.
3. **Subtitle workflow.** Add SRT/word-level timing and V1 subtitle typography controls if narration captions are required for short-video publishing; current V1 remains scene-level.
4. **BGM library.** Current workflow accepts uploads but has no curated, licensed Puxin music library or reusable presets.
5. **Cost/usage summaries.** Batch TTS now shows pending scene and character counts before the user starts it, and all paid generation remains explicit. Daily/monthly provider-cost summaries are not yet implemented.
6. **Project lifecycle cleanup.** Soft archive/restore is implemented so the library can be kept tidy without deleting media. Hard delete and orphan-media garbage collection remain intentionally separate administrative actions.

### P2 — optional/future scope

7. **MiniMax H3 capacity.** The external runner/API/UI path is implemented; actual H3 inference awaits a Colab account with available compute units. Keep the external source outside this MIT fork unless licensing is clarified.
8. **Direct social publishing.** Instagram/LINE publishing is not part of the current V1 and was not required for the original core pipeline; add only if Puxin wants a publishing console.
9. **Multi-user roles/audit.** Basic Auth is sufficient for private operation but does not provide named users, roles, or edit history.
10. **Cloud-native render scaling.** Current single-worker VPS rendering is appropriate for the expected workload; scale only if queue demand grows.

## Conclusion

The current implementation matches the original core plan: Drive → panel scenes → narration → optional AI motion → BGM/subtitles → Remotion MP4. It also exceeds the original plan in persistence, Drive output, durable rendering, fixed-domain deployment and backups.

The remaining work is primarily operator-product polish and OAuth lifecycle hardening rather than missing core video-generation capability.
