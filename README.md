# click-tab-uniq

タブ右クリックから重複するタブを削除する Firefox 専用アドオン。

https://addons.mozilla.org/addon/clicktabuniq/

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

`npm run run` starts Firefox with this extension loaded temporarily.
The extension source lives in `extension/`.

## Privacy

This extension does not collect or transmit user data.
