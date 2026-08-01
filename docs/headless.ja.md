# ヘッドレス利用と AI パイプライン

[English](./headless.md) / 日本語

Abekyo Editor はタイムライン UI だけのツールではありません。すべてのプロジェクトは
ただの JSON ドキュメントで、サーバーはその JSON を HTTP 経由で MP4 にレンダリング
します。つまりエディタ全体がスクリプトから操作可能です — シェルスクリプトからでも、
CI ジョブからでも、タイムラインを代わりに書いてくれる LLM エージェントからでも。
ブラウザ UI は「最終調整」のレイヤーになります: 生成されたプロジェクトを開き、
モデルが外した部分を直して、書き出す。

```
┌─────────────┐  プロジェクトJSON  ┌──────────────────┐    MP4
│ あなたのコード│ ────────────────► │  Abekyo サーバー  │ ─────────►
│  または LLM  │                   │ (セルフホスト)    │
└─────────────┘                   └──────────────────┘
```

以下はすべて通常の `npm run dev` / `npm run start` インスタンスに対して動作します。
API キーも外部サービスも不要で、メディアがサーバーの外に出ることはありません。

## プロジェクト形式

プロジェクトは 1 つの JSON オブジェクトです: `clips`(順序付きのシーン。各シーンは
画像/動画とオプションのナレーション)、オプションの `subtitles`(絶対時間指定の
オーバーレイ)、オプションの BGM フィールド、そして出力形式(`resolution`、
`aspectRatio`)。

機械可読な仕様はサーバー自身が公開しています:

```
GET /schema/project.schema.json
```

([ソース](../public/schema/project.schema.json)) — 全フィールドが型・enum・
デフォルト値付きで文書化されています。LLM でプロジェクトを生成する場合は、この
スキーマをプロンプトに貼るか(MCP サーバーの `get_project_schema` ツールに取得
させるか)して、適合するオブジェクトを書かせてください。

最小のプロジェクト例:

```json
{
  "clips": [
    { "plotName": "イントロ", "text": "オープニング", "imageUrl": "/uploads/image/intro.png", "audioUrl": "", "duration": 3, "index": 0 },
    { "plotName": "詳細", "text": "商品のクローズアップ", "imageUrl": "/uploads/image/detail.png", "audioUrl": "/uploads/audio/detail.mp3", "duration": 5, "index": 1, "transitionType": "crossfade" }
  ],
  "subtitles": [
    { "id": "s1", "text": "こんにちは！", "startTime": 0.5, "endTime": 2.5, "position": "bottom", "fontSize": 5, "color": "#ffffff", "align": "center" }
  ],
  "bgmUrl": "/uploads/audio/bgm.mp3",
  "bgmVolume": 0.2,
  "resolution": "1080p",
  "aspectRatio": "16:9"
}
```

> **ナレーションのタイミング:** クリップのナレーションはレンダラー内で **1.2 倍速**で
> 再生されます。ナレーション付きクリップの `duration` は `音声の秒数 / 1.2` に
> してください。`audioStartTime` は音声ファイル自身のタイムベースで指定します
> (タイムライン秒 × 1.2)。

## 3 つのエンドポイント

### 1. `POST /api/upload` — メディアをサーバーに載せる

```bash
curl -F "file=@./intro.png" http://localhost:3000/api/upload
# → {"url":"/uploads/image/1712...-intro.png","type":"image","filename":"...","size":12345}
```

ファイル種別はファイル名ではなくマジックバイトで検証されます。返ってきた `url` を
クリップの `imageUrl` / `audioUrl` や `bgmUrl` として使ってください。プロジェクト内の
メディア参照は、このような同一オリジンパス(または `RENDER_ALLOWED_MEDIA_HOSTS` で
明示的に許可したホスト)である必要があります。

### 2. `POST /api/project/validate` — 無料のドライラン

```bash
curl -s -X POST http://localhost:3000/api/project/validate \
  -H 'content-type: application/json' \
  --data @project.json
```

レンダリング可能なプロジェクトには `200` とサマリーが返ります:

```json
{
  "ok": true,
  "warnings": [{ "path": "clips[2].imageUrl", "message": "clip has no image or video; it will render as a black frame" }],
  "summary": { "clipCount": 3, "subtitleCount": 4, "durationSeconds": 12.5, "durationInFrames": 375, "fps": 30, "hasBgm": true },
  "schema": "/schema/project.schema.json"
}
```

不正な場合はパス付きエラー(`{"path": "clips[0].duration", "message": "duration
must be a positive number (seconds)"}`)とともに `422` が返ります。適用される
ルールは `/api/render` が強制するものと完全に同一です — 同じコードで、メディア
オリジンポリシー(同一オリジンの `/uploads/...` パスまたは許可済みホスト)も
含みます。**したがってドライランが通れば、レンダリングが拒否されないことが保証
されます。** CI に組み込んだり、エージェントループの「LLM は妥当なタイムラインを
生成したか？」という安価なチェックとして使ってください。

### 3. `POST /api/render` — JSON を入れると MP4 が出てくる

```bash
curl -sN -X POST http://localhost:3000/api/render \
  -H 'content-type: application/json' \
  --data @project.json
```

レスポンスは NDJSON の進捗イベントストリームで、最後は次のいずれかで終わります:

```json
{"type":"progress","phase":"rendering","progress":63,"message":"Rendering frames… 55%"}
{"type":"done","videoUrl":"/uploads/output/output-1712...mp4","filename":"output-1712...mp4"}
```

または `{"type":"error", ...}`。完成したファイルは `videoUrl` からダウンロード
してください。このエンドポイントは IP ごとのレートリミットと同時実行数キャップが
あります(README の [`RENDER_*` 変数](../README.ja.md#設定)を参照)。`429` /
`503` には `Retry-After` ヘッダーが付きます。

## MCP サーバー — AI エージェントにエディタを操作させる

`scripts/mcp-server.mjs` は依存ゼロの [MCP](https://modelcontextprotocol.io)
サーバー(stdio トランスポート)で、上記のパイプラインを 4 つのツールとして公開
します:

| ツール | 動作 |
|---|---|
| `get_project_schema` | プロジェクトの JSON Schema を取得(モデルに形式を教える) |
| `upload_media` | ローカルファイルをアップロードし `/uploads/...` URL を返す |
| `validate_project` | ドライラン。エラー / 警告 / サマリーを返す |
| `render_video` | MP4 へレンダリング(進捗通知付き)。指定すればローカル保存も |

Abekyo サーバーを起動してから、MCP クライアントに登録してください。
Claude Code の場合:

```bash
claude mcp add abekyo -e ABEKYO_URL=http://localhost:3000 -- node /path/to/Abekyo-editor/scripts/mcp-server.mjs
```

Claude Desktop の場合(`claude_desktop_config.json`):

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

あとは自然言語で動画を頼むだけです — 「./shots の画像から字幕付きの 15 秒縦型
ティーザーを作って」— エージェントがメディアをアップロードし、プロジェクト JSON を
書き、検証し、レンダリングします。人間の判断が必要なときはいつでも結果をエディタ
UI で開けます。

## 本番パイプラインでの注意点

- **サーバーが localhost 以外にある場合は `NEXT_PUBLIC_BASE_URL` を設定**して
  ください — レンダリング時のメディア URL 解決はこの値に固定されます。
- **`RENDER_ALLOWED_MEDIA_HOSTS`** は外部 CDN をメディア参照として許可する
  ホワイトリストです。それ以外はすべて同一オリジンである必要があります。
- **リソース上限**(`RENDER_MAX_CLIPS`、`RENDER_MAX_CLIP_DURATION_SECONDS`、
  `RENDER_MAX_TOTAL_DURATION_SECONDS`、`RENDER_MAX_SUBTITLES`)は、認証なしの
  呼び出し元がレンダラーにさせられることの上限です。引き上げは意図を持って。
- **他人からのアップロードを受ける環境では `UPLOAD_RETENTION_DAYS` を設定**して
  ください — `public/uploads/` 以下のメディアと書き出し MP4 が指定日数後に削除
  されます(未設定だと何も削除されません)。いずれにせよ MP4 は
  `/uploads/output/` を直リンクせず速やかにダウンロードを。
