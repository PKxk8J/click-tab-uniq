# click-tab-uniq

右クリックから重複するタブを削除する Firefox 専用アドオン。

https://addons.mozilla.org/addon/clicktabuniq/

## 機能

- URL、ハッシュを除く URL、タイトルで重複タブを削除
- クリックしたグループまたはトップレベル内、トップレベルと各グループごと、
  全てのタブから削除範囲を選択
- メニューに削除予定の重複タブ数を表示
- トップレベルとタブグループごとに重複を判定
- ピン留めされたタブはトップレベルとして扱い、重複時は通常タブより優先して残す
- 分割ビュー内のタブも重複判定・削除の対象
- 通知を有効にすると、完了結果とトップレベル・グループ別の削除内訳を表示

「クリックしたグループまたはトップレベル内」では、右クリックしたタブが属する
グループ、またはトップレベルのタブだけを対象にします。
グループ内のタブを右クリックした場合は、そのグループ内に加えてトップレベルとしての
判定も選択できます。トップレベルを選択した場合はトップレベルのタブだけを対象とし、
右クリック元グループ内の重複は削除しません。
「トップレベルと各グループごと」では、トップレベルと各タブグループを別々に重複判定します。
「全てのタブ」ではグループやトップレベルの区切りをまたいで重複判定します。

## 動作要件

- Firefox 142 以降
- Node.js 現行 LTS

## 開発

```sh
npm install
npm run lint
npm run test
npm run test:perf
npm run screenshots:amo
npm run build
```

`npm run test:perf` は Firefox 上に実タブを 500 件作成し、重複タブ削除を測定します。
件数と時間予算は `PERF_TAB_COUNT=1000 PERF_MAX_MS=60000 npm run test:perf` のように
変更できます。

アドオンのバージョンは `extension/manifest.json` で管理します。
`npm run build` は `web-ext-artifacts/clicktabuniq-<version>.zip` を作成します。

`npm run screenshots:amo` は `amo/en` の AMO 用スクリーンショットを生成します。
対象を絞る場合は PowerShell で次のように指定できます。

```powershell
$env:AMO_SCREENSHOTS = 'settings'
npm run screenshots:amo
```

`npm run run` は、この拡張機能を一時的に読み込んだ Firefox を起動します。
拡張機能のソースは `extension/` にあります。

## プライバシー

この拡張機能はユーザーデータを収集または送信しません。

## ライセンス

Apache License 2.0 です。詳細は [LICENSE](LICENSE) を参照してください。

Copyright 2026 PKxk8J and contributors.
