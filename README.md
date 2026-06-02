# click-tab-uniq

タブ右クリックから重複するタブを削除する Firefox 専用アドオン。

https://addons.mozilla.org/addon/clicktabuniq/

## 機能

- URL、ハッシュを除く URL、タイトルで重複タブを削除
- クリックした階層内、全ての階層ごと、全てのタブから削除範囲を選択
- 階層はトップレベル、タブグループごと、ピン留めされたタブ内で判定
- 分割ビュー内のタブも重複判定・削除の対象

「クリックした階層内」では、右クリックしたタブと同じ階層だけを対象にします。
「全ての階層ごと」では、トップレベル、各タブグループ、ピン留めされたタブを
別々に重複判定します。「全てのタブ」では階層をまたいで重複判定します。

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
