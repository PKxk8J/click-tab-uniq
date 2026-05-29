# click-tab-uniq

タブ右クリックから重複するタブを削除する Firefox 専用アドオン。

https://addons.mozilla.org/addon/clicktabuniq/

## Features

- URL、ハッシュを除く URL、タイトルで重複タブを削除
- タブグループ、コンテナ、分割ビューをまたぐ重複を既定で保護
- 設定により、タブグループ、コンテナ、分割ビューを無視した削除も選択可能
- 固定タブから実行した場合のみ、固定タブ同士の重複も削除

「守る」モードでは、異なるタブグループやコンテナのタブを別物として扱い、
分割ビュー内のタブは削除対象から除外します。

## Requirements

- Firefox 142+
- Node.js current LTS

## Development

```sh
npm install
npm run lint
npm run test
npm run build
```

The add-on version is managed in `extension/manifest.json`.
`npm run build` creates `web-ext-artifacts/clicktabuniq-<version>.zip`.

`npm run run` starts Firefox with this extension loaded temporarily.
The extension source lives in `extension/`.

## Privacy

This extension does not collect or transmit user data.
