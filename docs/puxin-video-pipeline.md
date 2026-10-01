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

## AI video providers

AI scene generation is provider-based. `MiniMax H3 / Colab` and `Veo 3.1` stay outside the core timeline.

- MiniMax H3 is an external worker configured through `MINIMAX_H3_RUNNER_PATH`; the referenced Colab skill source is not copied into this MIT fork.
- Generated MP4 clips can later replace the visual asset of a selected scene while narration, subtitles and BGM remain controlled here.

## Environment

```text
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
PUXIN_DRIVE_ROOT_FOLDER_ID=11KCNFFXmZQG6CSITUNM_WfXA-nyOr0ah
MINIMAX_H3_RUNNER_PATH=
GEMINI_API_KEY=
```
