# Puxin Video Studio pipeline

## V0.1

1. Google Drive root folder (`PUXIN_DRIVE_ROOT_FOLDER_ID`) is the source library.
2. `/studio` lists story folders and images through Google Drive OAuth.
3. Selected images are downloaded server-side and passed to `splitComicImage()`.
4. Auto split scans the middle of the image for a high-uniformity separator row. Manual single/double override is the next UI refinement.
5. Resulting panels are stored under `public/uploads/image/puxin/` and converted into Abekyo `VideoClip`s.
6. Projects are created as 1080p 9:16 with `fit-blur` composition and restrained motion.
7. Known story folders can supply a narration preset. The first preset is `水壺`: 15 scenes, natural 1.0x voice timing, about one minute.
8. Puxin imports set `showSceneSubtitle=false` by default because the illustrated source already carries its own visible text; narration can still be synthesized from `clip.text`.
9. Abekyo/Remotion remains the timeline, BGM, subtitle, preview and MP4 render engine.

## AI providers

Google-hosted AI uses Vertex AI. AI scene generation remains provider-based, with MiniMax H3 / Colab as an optional external worker and Vertex AI as the production cloud path.

- MiniMax H3 is an external worker configured through `MINIMAX_H3_RUNNER_PATH`; the referenced Colab skill source is not copied into this MIT fork.
- Vertex AI Veo 3.1 generates selected animated scenes.
- Imported Puxin still-image scenes expose an AI 動態化 control in the editor. After an explicit confirmation, the app submits one Veo 3.1 Fast job, polls the long-running operation, stores the MP4 under public/uploads/video/puxin/, and replaces only that scene's visual asset. The generated video is muted in Remotion so the existing narration/BGM remain authoritative.
- The editor rounds each scene up to the nearest supported Veo duration (4/6/8 seconds) but keeps the original timeline duration, so longer generated footage is trimmed rather than changing story pacing.
- Vertex AI Gemini 3.1 Flash TTS generates narration. The default model can be overridden by `VERTEX_TTS_MODEL`.
- Generated MP4 clips can later replace the visual asset of a selected scene while narration, subtitles and BGM remain controlled here.
- Google-hosted production access uses keyless service-account impersonation when `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT` is set. The VPS' existing ADC is only the source identity; Google issues short-lived credentials for the Puxin service account.
- Google Drive can use the same impersonated service account with the `drive.readonly` scope. The target My Drive folder must be shared with that service-account email. OAuth remains as a fallback for deployments that do not use service-account impersonation.

## Environment

```text
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
PUXIN_DRIVE_ROOT_FOLDER_ID=11KCNFFXmZQG6CSITUNM_WfXA-nyOr0ah
MINIMAX_H3_RUNNER_PATH=
GOOGLE_CLOUD_PROJECT=
GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=
GOOGLE_APPLICATION_CREDENTIALS=
PUXIN_BASIC_AUTH_HEADER=
VERTEX_VIDEO_LOCATION=us-central1
VERTEX_VIDEO_MODEL=veo-3.1-fast-generate-001
VERTEX_TTS_LOCATION=global
VERTEX_TTS_MODEL=gemini-3.1-flash-tts-preview
```
