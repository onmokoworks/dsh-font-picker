# DSH Font Picker

Windows版DeepSeek Harnessで、PC内のフォントを一覧から選ぶ拡張です。画面・会話本文・コード・ターミナルの書体を変更できます。

A font picker for DeepSeek Harness on Windows. Choose installed fonts for the app, chat, code and terminal.

## 導入 / Install

Harnessを完全に終了し、HarnessのCLIで次のコマンドを実行してから再起動してください。

Fully quit Harness, run this command with the Harness CLI, then reopen it.

```sh
dsh plugin --profile desktop add github:onmokoworks/dsh-font-picker
```

## 使い方 / Usage

設定 → フォントで検索・プレビューし、「このフォントを使う」で保存します。「デフォルト」で元に戻せます。

Open Settings → フォント (Fonts), search and preview, then select このフォントを使う (Use this font). デフォルト (Default) restores the default font.

一覧はHarnessを動かすWindows PCのものです。別の端末で表示するには、その端末にも同じフォントが必要です。

The list comes from the Windows host. Other devices need the same fonts installed locally.

[MIT](LICENSE)。フォント本体・個人設定は含みません。No font files or personal settings included.
