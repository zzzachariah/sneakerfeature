# 📱 sneakerfeature 移动端（iOS + Android）操作手册

本 App 用 [Capacitor](https://capacitorjs.com/) 把现有网站包成原生壳：壳里是一个
WebView，加载线上的 `https://snkrfeature.com`（和 `electron/` 桌面壳同思路）。
因为 Next.js 是服务端渲染、不能静态导出，所以用 `server.url` 指向线上，而不是打包
网页资源进 App。

> **两层心智模型**
> - **内容/功能层**：App 加载线上站点 → 你改网站代码、部署后，**App 里直接生效，无需重新打包、无需重新过审**。
> - **原生壳层**：只有改图标、原生插件、权限，或要发新版本时，才需要 Xcode / CI 重新打包。

- `appId`：`com.sneakerfeature.app`
- `appName`：`sneakerfeature`
- 配置文件：[`capacitor.config.ts`](./capacitor.config.ts)

---

## 一、首次准备（每台机器一次）

```bash
npm install            # 安装依赖（含 Capacitor）
# macOS 打 iOS 必备：
xcode-select --install # 命令行工具；再到 App Store 安装 Xcode
sudo gem install cocoapods   # iOS 原生依赖管理
# Android：安装 Android Studio（自带 SDK / Gradle）
```

生成原生工程（只需第一次；之后用 `cap sync` 更新）：

```bash
npx cap add ios        # 生成 ios/    （需在 macOS 上跑，会执行 pod install）
npx cap add android    # 生成 android/
npm run cap:assets     # 从 assets/logo.png 生成各尺寸图标 + 启动图（需先 add 平台）
```

> `ios/` 和 `android/` 是生成产物。建议在 Mac 上生成后提交到仓库，这样 CI 和你
> 本地一致。它们已加入 `.gitignore` 的构建产物豁免，源工程文件会被提交。

---

## 二、日常开发循环

1. 我（或你）改网站代码 → 推到 `claude/confident-hypatia-h7h785` → 部署到
   `snkrfeature.com`。**App 内容随之更新，不用碰 Xcode。**
2. 只有动了 `capacitor.config.ts`、原生插件、图标时，才需要：

```bash
git pull origin claude/confident-hypatia-h7h785
npm install
npx cap sync           # 把配置/插件同步进 ios/ 和 android/
```

### 在 Xcode 里真机测试

```bash
npx cap open ios       # 打开 ios/App/App.xcworkspace
```

- **Signing & Capabilities** → 登录开发者账号 → 勾 **Automatically manage signing** → 选 Team。
- 顶部选你的 iPhone（或模拟器）→ 点 **▶ Run**。
- 回归项：登录、滑块人机验证、AI 选鞋、评论/投稿、推送、分享、深色模式、底部导航。

### 测「还没上线的本地改动」

让 App 指向你电脑上的 dev server（同一局域网）：

```bash
npm run dev                                  # 终端 A：起本地站点
SNEAKERFEATURE_URL=http://192.168.1.20:3000 npx cap sync   # 用你电脑的局域网 IP
npx cap open ios                             # 再 Run
```

> 用完记得 `npx cap sync`（不带环境变量）改回线上地址。

---

## 三、Android 出包 + 站内下载

```bash
# 1) 生成签名 keystore（只做一次，务必备份，丢了无法更新 App）
keytool -genkey -v -keystore sneakerfeature.keystore \
  -alias sneakerfeature -keyalg RSA -keysize 2048 -validity 10000

# 2) 用 Android Studio 出签名 APK
npx cap open android
#   Build → Generate Signed Bundle / APK → APK → 选上面的 keystore
```

把签好名的 `app-release.apk` 传到站点（`snkrfeature.com/download` 页已就绪），
或挂到 GitHub Releases。用户：下载 → 点开 → 首次允许「未知来源安装」→ 直接用。
**大陆可直接安装，无需任何商店。**

---

## 四、iOS 上架 App Store

1. Xcode：设好版本号 / build 号 → **Product → Archive**（或用下面的 CI 自动上传）。
2. **Distribute App → App Store Connect → Upload**。
3. 去 [App Store Connect](https://appstoreconnect.apple.com) 建 App 记录，填：名称 /
   副标题 / 分类、**隐私政策链接**（站点已有 `/privacy`）、隐私「营养标签」、年龄分级、
   各尺寸截图、关键词、描述。
4. 选刚上传的 build → **Submit for Review**。审核 1–3 天。
5. **若以 Guideline 4.2（套壳）被拒**：强调本 App 的原生能力（推送、分享、个性化周报、
   离线兜底）与登录账号体系，或补更多原生功能后重交。首拒很常见。
6. **发布区域**：勾**海外区**可直接上（**不需备案**）。**中国大陆区**需 ICP 备案 +
   生成式 AI 备案（通常要公司主体）→ 作为 Phase 2。

---

## 五、CI 自动打包（GitHub Actions）

工作流见 `.github/workflows/mobile.yml`（在 CI 任务里加入后生效）：macOS runner 自动
`cap sync` → 构建 iOS 上传 **TestFlight**、构建签名 **APK** 作为 artifact / Release。
配好后：**每次推代码，CI 自动出 TestFlight 版和 APK，你 iPhone 上一键测。**

### 需要你在仓库填的 GitHub Secrets

| Secret | 用途 |
|---|---|
| `APPSTORE_ISSUER_ID` / `APPSTORE_KEY_ID` / `APPSTORE_PRIVATE_KEY` | App Store Connect API Key（.p8 内容），CI 上传 TestFlight |
| `APPLE_TEAM_ID` | 你的 Apple 开发者 Team ID（10 位） |
| `IOS_DIST_CERT_P12` / `IOS_DIST_CERT_PASSWORD` | iOS 发布证书（base64 的 .p12 + 密码） |
| `IOS_PROVISIONING_PROFILE` / `IOS_PROVISIONING_PROFILE_NAME` | App Store 描述文件（base64）+ 它的名称 |
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | 安卓签名（keystore base64 + 密码 + 别名 + 密钥密码） |

> 生成 base64：`base64 -i sneakerfeature.keystore | pbcopy`（macOS，证书 .p12 同理）。
> 工作流文件：[`.github/workflows/mobile.yml`](./.github/workflows/mobile.yml)。推一个
> `mobile-v0.1.0` 标签，或在 Actions 页手动运行即可触发。iOS 上传到 TestFlight，
> 安卓签名 APK 自动挂到对应的 GitHub Release（供 `/download` 页下载）。

---

## 六、原生权限说明（提交前确认 Info.plist / Manifest）

- **推送通知**：iOS 在 `Signing & Capabilities` 加 **Push Notifications** 能力；后端用
  APNs。Android 用 FCM（放 `google-services.json`）。
- **保存图片到相册**：iOS 需在 `Info.plist` 加 `NSPhotoLibraryAddUsageDescription`
  文案（如「保存球鞋图片到你的相册」）。

详见各功能对应的代码注释与提交说明。
