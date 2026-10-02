# 普新內容製作台 V1

入口 `/studio`；原剪輯器位於 `/legacy`。需要 Node.js 22。

## 可用流程

1. 本機選圖或讀取指定 Drive 根目錄內素材，輸出選 3:4 或 9:16。
2. 預設完整保留原圖；每張圖可明確選上下拆格並調整分隔線。
3. 建立、保存、重開或複製作品。修改採版本檢查，避免舊視窗覆蓋新內容。
4. 編輯順序、旁白、秒數、圖片呈現、運鏡、字幕、配樂及品牌。原圖有字／Logo 時可關閉重複疊加。
5. 單段試聽 Gemini-TTS 或整批生成缺少配音的段落。文字修改後會清除該段配音；相同文字、聲線、語氣與模型沿用快取。也可上傳真人音訊。
6. 匯出保存當時的作品版本，下載 MP4；已連接寫入授權時同步到 `IG輪播素材／製作成果／作品名稱 · ID`。同步失敗可重試，影片保留。

## 部署與資料

正式入口為 `https://video-studio.puxin.ccwu.cc/studio`。目前使用 `puxin-video-studio-app` Docker（host network，`127.0.0.1:3110`）與 Cloudflare Named Tunnel `puxin-video-studio`。`PUXIN_RENDER_ORIGIN=http://127.0.0.1:3110`、`PUXIN_PUBLIC_ORIGIN=https://video-studio.puxin.ccwu.cc`。獨立 systemd 範例 `deploy/puxin-video-studio.service` 可供日後遷移，但不可同時啟用：單程序 Next.js 服務，每次只處理一支影片，佇列最多十支。不可使用多個服務程序共同執行 worker。5 秒輪詢可在重啟後恢復佇列；被中斷的影片由頭重製。

現有 Docker 與備用 systemd 部署都統一使用 `/srv/ai-workspace/projects/puxin-video-studio/.data/studio`，包含 SQLite、原素材、音訊、Veo 影片、成果與 OAuth token。不可當作建置快取刪除。瀏覽器重開從 SQLite 還原；部署不清理素材。

原有 Basic auth 保留；內部渲染器使用一小時有效、單一檔案的簽章 GET。只有正確簽章的素材回應允許跨來源讀取，作品 API 仍要求登入。正式域名透過既有 HTTPS 反向代理或 Tunnel 接入內部連接埠；不要直接公開 3471。

`deploy/puxin-video-studio-backup.timer` 每日保留七天資料備份。備份為一致的 SQLite 快照＋不可變更的 media；OAuth token 不包含在備份中。復原前停止服務，備份當前資料，再解壓並確認 webcodex 擁有權，啟動服務。備份目前同一 VPS，正式大量使用後應另接離機備份。

## Google 接線

既有 SA impersonation 可讀素材及呼叫 Vertex。付費 TTS／Veo 需由使用者確認實際生成；測試不代替聲音品質驗收。

個人 My Drive 產出需擁有人 OAuth：設定 `GOOGLE_DRIVE_CLIENT_ID`、`GOOGLE_DRIVE_CLIENT_SECRET`，Google Console 登記正式網址的 `/api/puxin/drive/callback`，再由使用者點「連接成果上傳」同意授權。指定現有資料夾需要 Drive scope；drive.file 無法只憑資料夾 URL 取得寫入權限。OAuth 同意頁會明示完整 Drive 權限，實際應用操作限制在指定成果資料夾，不更動共享設定。

反向代理部署另外設定 `PUXIN_PUBLIC_ORIGIN=https://正式網域`（只填 origin）。授權、交換 token 和完成後跳轉統一使用這個網址，避免 NextRequest 的內部 localhost 網址造成 redirect_uri_mismatch。使用臨時 tunnel 時，網址變更需同步更新環境設定及 Console 的允許回呼。

如果成果在 Shared Drive，可另設 `PUXIN_DRIVE_OUTPUT_SHARED_DRIVE=true`，並確保 SA 有新增權限；不得對個人 Drive 誤開此設定。

## 範圍與驗收界線

V1 主要是原圖故事製作、旁白、持久化與影片輸出。新版作品編輯頁已可針對單一靜態場景二次確認後呼叫 Veo 3.1 Fast，生成完成後自動替換該場景；影片保存到持久化 media store 並納入備份。沒有社群發布或批次生圖。文字字幕為場景級，尚未提供逐字對齊。

本機測試與 VPS 建置／服務／实际影片輸出需各自確認。Google OAuth 未完成時上傳會明示需求，不會把本機下載誤報為 Drive 已同步。

## 2026-10-02 驗收紀錄

目前完整測試 260 個通過；lint 無新增錯誤。VPS Node 預設 heap 太小，建置使用 `NODE_OPTIONS=--max-old-space-size=4096 node node_modules/next/dist/bin/next build`。部署時先停止正在使用同一 `.next` 目錄的 runtime，再做 production build，避免 Turbopack 與執行中服務同時碰建置目錄。

真實圖片匯入確認完整尺寸保留、手動拆兩格與保存重開。實際 3:4（720×960 H.264）與 9:16（720×1280 H.264＋AAC）影片解碼通過。VPS 登入保護、單檔簽章素材 Range、服務重啟後無瀏覽器輪詢的自動續跑、SQLite 備份解壓完整性檢查通過。原圖模式關閉舊商品模板裝飾，避免暗色遮罩蓋住原圖文字。

Google SA 讀取指定 Drive 素材目錄已驗證。Gemini-TTS 已用 Kore 對「那天，我跟師父說，我真的快冒煙了。」做真實 Vertex 驗收，成功產生 24kHz mono PCM WAV、長度約 6.92 秒；聲音風格仍需由使用者實際試聽決定預設聲線。Veo 3.1 Fast 也已完成真實 4 秒 9:16 測試。

Drive 寫入授權已由 `randy.tsay@gmail.com` 完成。VPS 驗證指定「IG輪播素材」目錄 `connected=true`、`writable=true`，refresh token 保存於資料目錄並限制為 0600。修正反向代理 OAuth origin 後，額外 6 個回歸測試、本機 TypeScript、VPS production build 通過；實際公開回呼、取消後跳轉、安全 cookie、錯誤 state 拒絕及未登入 401 均驗證。

驗收匯出 `e3ba6d4c-5c01-42e0-9687-d88bfac44521` 的 MP4、設定 JSON、腳本 TXT 已透過正式上傳 API 同步，並於 Drive UI 確認三個檔案。此驗收作品沒有旁白音訊；不代表 Gemini-TTS 聲音驗收已完成。成果目錄：[驗收｜水壺故事完整原圖](https://drive.google.com/drive/folders/1temEuy0gcB36mYMEjbqUhXsi9PSJmLY0)。

固定網域完成後又執行一次完整 V1 驗收：`水壺` 8 張素材拆成 15 Scene，15/15 Gemini TTS、2 個 Veo Scene、BGM、1080×1920 Remotion Render、Drive 回存全部成功。成品 101.42 秒、H.264 + AAC，成果資料夾：[驗收｜水壺故事 V1 完整流程 20261002](https://drive.google.com/drive/folders/1dY6OS0PR0XQt1xYYosfdGcEq_S5vlfZ-)。第一次批次 TTS 在第 12 段遇到 Vertex `429 Resource exhausted`，加入退避重試後完成，證實下一步應把 retry/backoff 正式做進批次 TTS。完整一致性與缺口盤點見 `docs/v1-alignment-review-2026-10-02.md`。

後續修正版統一將所有非滿版靜態場景改成模糊延伸背景，不再出現純白上下留邊；加入原創程序生成 BGM「茶煙・心靜」，並重新輸出 revision 2。正式成品為 1080×1920、H.264 30fps、AAC 48kHz stereo、101.42 秒、112,178,351 bytes；整體音訊約 -22.2 LUFS、True Peak -5.2 dBFS。R2 公開播放連結：`https://pub-81becb6c33d744ad9c8bff0f27c0d785.r2.dev/puxin-video-studio/releases/water-kettle-meditation-20261002.mp4`，HTTP 200、`video/mp4`、Range 請求 206 已驗證。

MiniMax H3 已以外部 runner 方式整合進 V1 API 與場景 UI；外部 skill 原始碼維持在 Git 之外。Google Colab CLI + ADC 連線測試成功，但目前連線帳號回報 compute-unit balance `0.0`，因此這次成片未消耗 H3 額度，仍使用既有兩段 Veo 動態場景。

OAuth 目前為 External／Testing；長期使用前仍需完成適用的 OAuth 發布／驗證流程。正式固定網域與 Console 回呼已改為 `video-studio.puxin.ccwu.cc`，不再依賴 Quick Tunnel。V1 基礎版本已提交並推送至 `feat/puxin-studio-v01`；後續修改同樣必須在上線前完成測試、commit 與 push。完整營運資料見 `docs/production-runbook.md`。
