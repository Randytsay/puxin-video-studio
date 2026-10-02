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

目前沿用 `puxin-video-studio-app` Docker（host network，`127.0.0.1:3110`）與既有 Cloudflare Tunnel。`PUXIN_RENDER_ORIGIN=http://127.0.0.1:3110`。獨立 systemd 範例 `deploy/puxin-video-studio.service` 可供日後遷移，但不可同時啟用：單程序 Next.js 服務，內部 `127.0.0.1:3471`，每次只處理一支影片，佇列最多十支。不可使用多個服務程序共同執行 worker。5 秒輪詢可在重啟後恢復佇列；被中斷的影片由頭重製。

現有 Docker 與備用 systemd 部署都統一使用 `/srv/ai-workspace/projects/puxin-video-studio/.data/studio`，包含 SQLite、原素材、音訊、成果與 OAuth token。不可當作建置快取刪除。瀏覽器重開從 SQLite 還原；部署不清理素材。

原有 Basic auth 保留；內部渲染器使用一小時有效、單一檔案的簽章 GET。只有正確簽章的素材回應允許跨來源讀取，作品 API 仍要求登入。正式域名透過既有 HTTPS 反向代理或 Tunnel 接入內部連接埠；不要直接公開 3471。

`deploy/puxin-video-studio-backup.timer` 每日保留七天資料備份。備份為一致的 SQLite 快照＋不可變更的 media；OAuth token 不包含在備份中。復原前停止服務，備份當前資料，再解壓並確認 webcodex 擁有權，啟動服務。備份目前同一 VPS，正式大量使用後應另接離機備份。

## Google 接線

既有 SA impersonation 可讀素材及呼叫 Vertex。付費 TTS／Veo 需由使用者確認實際生成；測試不代替聲音品質驗收。

個人 My Drive 產出需擁有人 OAuth：設定 `GOOGLE_DRIVE_CLIENT_ID`、`GOOGLE_DRIVE_CLIENT_SECRET`，Google Console 登記正式網址的 `/api/puxin/drive/callback`，再由使用者點「連接成果上傳」同意授權。指定現有資料夾需要 Drive scope；drive.file 無法只憑資料夾 URL 取得寫入權限。OAuth 同意頁會明示完整 Drive 權限，實際應用操作限制在指定成果資料夾，不更動共享設定。

反向代理部署另外設定 `PUXIN_PUBLIC_ORIGIN=https://正式網域`（只填 origin）。授權、交換 token 和完成後跳轉統一使用這個網址，避免 NextRequest 的內部 localhost 網址造成 redirect_uri_mismatch。使用臨時 tunnel 時，網址變更需同步更新環境設定及 Console 的允許回呼。

如果成果在 Shared Drive，可另設 `PUXIN_DRIVE_OUTPUT_SHARED_DRIVE=true`，並確保 SA 有新增權限；不得對個人 Drive 誤開此設定。

## 範圍與驗收界線

V1 主要是原圖故事製作、旁白、持久化與影片輸出。既有 Veo API／一般剪輯器維持相容；新製作台尚未加入一鍵 Veo 運鏡按鈕。沒有社群發布或批次生圖。文字字幕為場景級，尚未提供逐字對齊。

本機測試與 VPS 建置／服務／实际影片輸出需各自確認。Google OAuth 未完成時上傳會明示需求，不會把本機下載誤報為 Drive 已同步。

## 2026-10-02 驗收紀錄

本機與 VPS 各 253 個測試通過；lint 0 錯誤／93 個既有警告。VPS Node 預設 heap 太小，建置使用 `NODE_OPTIONS=--max-old-space-size=4096 node node_modules/next/dist/bin/next build`。

真實圖片匯入確認完整尺寸保留、手動拆兩格與保存重開。實際 3:4（720×960 H.264）與 9:16（720×1280 H.264＋AAC）影片解碼通過。VPS 登入保護、單檔簽章素材 Range、服務重啟後無瀏覽器輪詢的自動續跑、SQLite 備份解壓完整性檢查通過。原圖模式關閉舊商品模板裝飾，避免暗色遮罩蓋住原圖文字。

Google SA 讀取指定 Drive 素材目錄已驗證。Gemini-TTS REST 配置、PCM 包裝與快取以模擬回應驗證，尚未執行付費聲音驗收。個人 Drive 寫入仍需擁有人 OAuth；目前成果沒有同步到 Drive。
