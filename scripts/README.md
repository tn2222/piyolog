# Macのミルク時間通知

Macから5分ごとにTiDBを確認し、次回ミルク予定の35分前以内になったらmacOSの通知と音声で知らせます。

```text
最後のミルク時刻 + 3時間 = 次回ミルク予定
次回ミルク予定まで 0分より大きく35分以下なら通知
同じ次回ミルク予定では1回だけ通知
```

別のMacで使う場合も、このリポジトリをcloneして同じ手順で設定します。

以下のコマンドは、リポジトリルートで実行します。

## セットアップ

Node.js 22以上を使います。

```sh
node -v
npm install
```

TiDBの接続文字列を `.env` に設定します。

```sh
cp .dev.vars.example .env
```

`.env` の `DATABASE_URL` をTiDB Cloudの接続文字列に置き換えます。`INGEST_TOKEN` はWorker用なので、Mac通知だけなら未設定でも動きます。

```sh
DATABASE_URL=mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
```

## 手動テスト

まずは通知を鳴らさずに、判定だけ確認します。

```sh
npm run notify:formula -- --dry-run
```

強制的にmacOS通知と音声を鳴らす場合は次を実行します。

```sh
npm run notify:formula -- --force
```

音声なしでmacOS通知だけ確認する場合は次を実行します。

```sh
npm run notify:formula -- --force --no-sound
```

## 5分ごとの自動実行

macOSの `launchd` に登録します。

```sh
npm run notify:formula:install
```

登録後は5分ごとに `npm run notify:formula` が実行されます。Macが起動していてログイン中であれば動きます。

ログは次で確認できます。

```sh
tail -f ~/Library/Logs/piyolog/formula-notifier.log
tail -f ~/Library/Logs/piyolog/formula-notifier.error.log
```

## 止め方

自動実行を止める場合は次を実行します。`launchd` の登録を解除するので、以後5分ごとの実行は行われません。

```sh
npm run notify:formula:uninstall
```

手動実行だけに戻したい場合も、このコマンドで止めて問題ありません。もう一度自動実行したくなったら、再度登録します。

```sh
npm run notify:formula:install
```

通知済み状態は次のファイルに保存されます。同じ次回ミルク予定で何度も鳴らさないためのファイルです。

```text
~/Library/Application Support/piyolog/formula-notifier-state.json
```
