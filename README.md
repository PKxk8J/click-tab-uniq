# click-tab-uniq

タブ右クリックから重複するタブを削除する Firefox 専用アドオン。

https://addons.mozilla.org/addon/clicktabuniq/

## 機能

- URL、ハッシュを除く URL、タイトルで重複タブを削除
- タブグループ、コンテナ、分割ビューをまたぐ重複を既定で保護
- 設定により、タブグループ、コンテナ、分割ビューを無視した削除も選択可能
- 固定タブから実行した場合のみ、固定タブ同士の重複も削除

「守る」モードでは、異なるタブグループやコンテナのタブを別物として扱い、
分割ビュー内のタブは削除対象から除外します。

## 動作要件

- Firefox 142 以降
- Node.js 現行 LTS

## 開発

```sh
npm install
npm run lint
npm run test
npm run build
```

アドオンのバージョンは `extension/manifest.json` で管理します。
`npm run build` は `web-ext-artifacts/clicktabuniq-<version>.zip` を作成します。

`npm run run` は、この拡張機能を一時的に読み込んだ Firefox を起動します。
拡張機能のソースは `extension/` にあります。

## プライバシー

この拡張機能はユーザーデータを収集または送信しません。
