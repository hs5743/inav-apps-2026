# 人際導航員 Firebase 版

這是參考 `interpersonal-navigator-apps-script` 重新製作的靜態網站版本。原本 Apps Script + Google Sheets 的後端，已改成 Firebase Cloud Firestore。

## 功能

- 組長建立房間，組員用同一組代碼加入
- Firestore 即時同步房間、玩家、手牌、出牌與投票資料
- 組長可開始任務、進入投票、公布結果、結束遊戲
- 教師後台可查看房間並刪除測試房間
- 可直接部署到 GitHub Pages

## Firebase 資料

- Firebase 專案：`inav-apps-2026`
- Web App：`inav-apps-2026-web`
- 房間集合：`rooms`
- 玩家子集合：`rooms/{roomId}/players`

## 本機預覽

可用任一靜態伺服器開啟，例如：

```powershell
npx.cmd serve .
```

或直接用 VS Code / 瀏覽器開啟 `index.html`。正式分享建議用 GitHub Pages。

## 安全提醒

目前為課堂展示版，Firestore 規則允許公開讀寫 `rooms` 集合，方便學生免登入使用。正式長期使用時，建議加上 Firebase Authentication、App Check 或房間代碼限制規則。
