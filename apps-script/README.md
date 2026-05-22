# Google Apps Script 設定手順

このスクリプトは、Google Drive の指定フォルダに置かれた最新のぴよログテキストエクスポートを Cloudflare Worker に送信します。

## 使い方

1. Google Apps Script プロジェクトを作成します。
2. [Code.gs](Code.gs) の内容を Apps Script エディタに貼り付けます。
3. Apps Script の「プロジェクトの設定」から Script Properties を設定します。

| Key | Value |
| --- | --- |
| `PIYOLOG_FOLDER_ID` | ぴよログのテキストファイルを置く Google Drive フォルダID |
| `WORKER_TEXT_ENDPOINT` | `https://<worker-url>/api/text-records` |
| `INGEST_TOKEN` | Cloudflare Worker に設定した共有トークン |

4. `syncPiyologTextExports` を手動実行し、Google Drive と外部URLアクセスの権限を承認します。
5. Apps Script の「トリガー」から `syncPiyologTextExports` を時間主導型で5分ごとに実行するよう設定します。

## 処理済み判定

Apps Script は、最後に送信した最新ファイルを `LAST_PROCESSED_FILE_KEY` として `PropertiesService` に保存します。

保存される値は `<fileId>:<updatedAt>` です。

5分ごとに同じファイル名の新規ファイルが作られる運用でも、Script Properties は増え続けません。フォルダ内の最新テキストファイル1件だけを見て、前回処理した最新ファイルと同じなら送信しません。新しいファイルが追加された場合、または最新ファイルが更新された場合は Worker に送信します。

## Worker に送る内容

```json
{
  "source": "google_drive_text_export",
  "fileId": "Google Drive file id",
  "fileName": "piyolog-2026-05-22.txt",
  "updatedAt": "2026-05-22T00:10:00.000Z",
  "text": "ぴよログのテキストエクスポート本文"
}
```
