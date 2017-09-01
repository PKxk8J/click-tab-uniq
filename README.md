# click-tab-uniq

タブ右クリックから重複するタブを削除する Firefox アドオン。

e10s 対応。

https://addons.mozilla.org/addon/clicktabuniq/


## <span id="messaging"/> Messaging

Other addons can use this addon by using [sendMessage](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/runtime/sendMessage)

```javascript
browser.runtime.sendMessage('{e3e32590-2c56-405d-9f0f-9dc571a87d67}', {
  type: 'uniq',
  keyType: 'url',
  windowId: 24,
  notification: false
})
```


#### extensionId

`{e3e32590-2c56-405d-9f0f-9dc571a87d67}`


#### message

|Property name|Type|Description|
|:--|:--|:--|
|type|string|`uniq`|
|keyType|string|`url` or `title`|
|windowId|number|The ID of a target window|
|notification|boolean|Whether to show notification|
