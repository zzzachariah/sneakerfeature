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
  APNs。**Android 推送当前已停用**：原本走 FCM，但 FCM 依赖 Google Play Services（大陆
  大量机型没有 → 注册时闪退），且 FCM 在大陆被墙、根本推不到。代码里 `PushRegistration`
  已限制为「仅 iOS」。要在安卓做推送，需接国内方案（厂商推送 / 极光 JPush 等），届时再
  放开。原 FCM 路线需要 `google-services.json`，本仓库未配置。
- **保存图片到相册**：iOS 需在 `Info.plist` 加 `NSPhotoLibraryAddUsageDescription`
  文案（如「保存球鞋图片到你的相册」）。
- **拍照 / 从相册选图（图片纠错）**：用 `@capacitor/camera`。装好后 `npx cap sync ios`
  会带入插件；iOS 需在 `Info.plist` 补两条用途说明，否则首次调用会闪退：
  - `NSCameraUsageDescription`（如「拍摄球鞋照片用于图片纠错」）
  - `NSPhotoLibraryUsageDescription`（如「从相册选择球鞋照片用于图片纠错」）
  代码里 `lib/native/camera.ts` 仅在原生 App 内启用；网页端继续用文件选择，**不需要这两条**。
- **脚型测量（Foot Scan）相机 + 水平仪权限**：测量脚的拍摄页（`components/foot-scan/capture-step.tsx`）
  在打开相机**之前**会先调 `lib/native/camera.ts` 的 `ensureCameraPermission()` 主动申请系统
  相机 + 相册权限，并在 checklist 的「Start scanning」点击里同步调
  `requestMotionPermission()` 弹陀螺仪授权。原因：iOS 的实时取景用的是 WKWebView 的
  `getUserMedia`，**首次若系统相机权限还没授予，预览会是一片黑、摄像头出不来**；安卓走原生
  拍照/相册选择器。提前弹一次系统授权框，相机才能正常出现；用户拒绝时自动回退到「从相册选择」。
  要让它生效，原生工程**必须**声明用途文案，否则 iOS 会在调用瞬间杀掉 App（点拍照/相册秒闪退）：

  - **iOS — `ios/App/App/Info.plist`** 必须包含以下四条 key（缺一项就闪退或权限永远弹不出来）：
    | Key | 推荐文案 | 用途 |
    |---|---|---|
    | `NSCameraUsageDescription` | 用于拍摄脚型照片，离线计算尺码与楦型。 | 实时取景 + 拍照 + 深度扫描 |
    | `NSPhotoLibraryUsageDescription` | 用于从相册选择脚型照片，离线计算尺码与楦型。 | `Camera.getPhoto({source: Photos})` |
    | `NSPhotoLibraryAddUsageDescription` | 保存球鞋图片到你的相册。 | 写入相册（图片纠错 / 分享） |
    | `NSMotionUsageDescription` | 用陀螺仪检测手机倾角，提示「水平 / 45° / 垂直」拍摄姿态。 | `DeviceOrientationEvent.requestPermission()`（水平仪权限） |

    打开 `ios/App/App.xcworkspace` → 左侧 `App/App/Info.plist` → 右键 **Add Row** 把上面四条
    都加进去（或 Source Code 模式直接贴 `<key>…</key><string>…</string>`）。改完 **Product →
    Clean Build Folder** 再 Run。`Info.plist` 缺 `NSMotionUsageDescription` 时，iOS 会直接
    *无声忽略* `DeviceOrientationEvent.requestPermission()`，水平仪授权永远不弹。

  - **Android**：`AndroidManifest.xml` 需有 `<uses-permission android:name="android.permission.CAMERA" />`
    （`@capacitor/camera` 已自带声明，`npx cap sync android` 后确认存在即可）。

详见各功能对应的代码注释与提交说明。

---

## 七、会员开通（Stripe）在 App 里怎么走

**为什么点「开通会员」会离开 WebView**：Stripe 的收银台在 `checkout.stripe.com`，而
`capacitor.config.ts` 的 `server.url` 只允许 `snkrfeature.com`（没有配 `allowNavigation`）。
Capacitor 的导航拦截发现目标不同域，就会取消 WebView 内的跳转、改交给外部浏览器。
**这是 Capacitor 的既定行为，不是 bug** —— 也不该改成 `allowNavigation`：那会把支付页塞回
WebView，Apple Pay / 支付宝 / 微信的跳转在里面反而更容易断。

现在的流程（代码见 `lib/native/checkout.ts` + `components/native/capacitor-bridge.tsx`）：

1. 点开通 → `openCheckout()` 判断在原生 App 里 → 用 `@capacitor/browser` 开**应用内浏览器**
   （iOS 是 SFSafariViewController，安卓是 Custom Tabs）。App 还活着，收银台浮在上面，
   用户点一下「完成」就回来了，不用去任务切换器。
2. 同时在 `sessionStorage` 留一个 `sf:checkout-pending` 面包屑。
3. 付款完成 → Stripe 跳 `success_url`（`/subscribe/complete?session_id=…&app=1`）。
   `&app=1` 是 `/api/stripe/checkout` 根据 WebView 的 UA 后缀 `sneakerfeature-mobile` 打的标记。
4. 用户关掉应用内浏览器（或点页面上的「返回 App」深链接）→ Bridge 收到
   `browserFinished` / `appUrlOpen` / `appStateChange`，消费掉面包屑并 `reload()`，
   底下那个 `/subscribe` 页重新服务端渲染，会员状态立刻变新。

### 两个必须知道的坑

- **`/subscribe/complete` 必须是 public path**（`middleware.ts` 里已加）。外部浏览器和
  WebView 的 cookie 罐是分开的，那边一定是未登录的；一旦被鉴权拦截，用户刚付完钱看到的
  就是登录页，而且页面里的**兜底发货**（`fulfillCheckoutSession`）根本不会执行。
  发货本身不依赖登录态 —— 用的是 Stripe session metadata 里的 `userId`，且幂等。
- **Universal Links 救不了这一跳**。Stripe 是服务端 302 重定向过去的，iOS 只对**用户真实点击**
  的链接触发 universal link。所以完成页上放的是一个**要用户点一下**的自定义 scheme 按钮。

### 原生工程需要注册 URL scheme（否则「返回 App」按钮点了没反应）

scheme 定义在 `lib/native/deep-link.ts` 的 `APP_URL_SCHEME`（当前是 `sneakerfeature`）。
`cap sync` **不会**自动写这个，得手动加一次：

- **iOS — `ios/App/App/Info.plist`**：加 `CFBundleURLTypes`。Xcode 里也可以走
  **App target → Info → URL Types → +**，Identifier 填 `com.sneakerfeature.app`，
  URL Schemes 填 `sneakerfeature`。

  ```xml
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>com.sneakerfeature.app</string>
      <key>CFBundleURLSchemes</key>
      <array><string>sneakerfeature</string></array>
    </dict>
  </array>
  ```

- **Android — `android/app/src/main/AndroidManifest.xml`**：在 `.MainActivity` 的
  `<activity>` 里加一个 intent-filter。

  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="sneakerfeature" />
  </intent-filter>
  ```

没注册也不会崩：应用内浏览器的「完成」按钮仍然能回到 App 并刷新，只是页面上那个
「返回 App」按钮点了没反应。

> 深链接解析（`pathFromDeepLink`）是攻击面 —— 任何 App / 网页 / 二维码都能塞一个 URL 进来，
> 解析错就是把已登录的 WebView 导去别人的域。回归用 `npm run test:deep-link`。

### 上线前必须确认

**Stripe webhook 一定要配好**（`STRIPE_WEBHOOK_SECRET` + Dashboard 里指向
`/api/stripe/webhook`）。完成页的兜底只在用户真的看到那个页面时才跑；用户如果付完直接
杀掉浏览器，**只有 webhook 能保证发货**。

---

## 八、性能与缓存（点击反馈 / 预取 / 离线）

针对「点球鞋要点好几次」+「App 整体慢半拍」，已做的（多为纯 Web，部署即生效）：

- **首次点击更可靠**：全局 `touch-action: manipulation`（去掉合成点击延迟 / 双击缩放抢手势）。
- **即时反馈**：球鞋卡片按压态（`active:scale`）；顶部**路由进度条**（`RouteProgress`）——
  点链接立刻有反应，慢 SSR 也不再「像没点上」。
- **预取**：卡片在手指/指针进入时就预取详情页 RSC（`router.prefetch`），点击近乎瞬开。
- **Service Worker + PWA**（`public/sw.js` + `manifest.webmanifest`，`ServiceWorkerRegister`）：
  静态资源/图片 stale-while-revalidate（重复加载瞬时）、整页导航 network-first + 离线兜底；
  **绝不缓存** `/api`、RSC 数据、非 GET（个性化/登录态永不变旧）。
  - **Android WebView / 所有浏览器**：直接生效。
  - **iOS App（WKWebView）要让 SW 生效**：需把站点设为 *app-bound domain*——在 iOS 工程
    `Info.plist` 加 `WKAppBoundDomains`（含 `snkrfeature.com`）。未配前 iOS App 内 SW 不跑
    （无副作用，自动回退到现有行为），iOS Safari/PWA 仍能用。

### 仍值得做、但需在真机验证的「深水区」（未盲改，避免改坏首页/登录）

- **边缘 ISR 缓存（首页/详情）**：现在首页和详情都读 cookie（For You / persona / 登录态），
  所以是 `force-dynamic`。要走 Vercel 边缘 CDN 秒开，需把**个性化下沉到客户端**：服务端只渲染
  可缓存的基础数据（`revalidate`），For You / persona 排序改成客户端拉新 API（先出骨架）。
  这是「每次跳转都慢」的根治，但属核心改造，建议单独一批 + 真机回归。
- **本地结构化球鞋库（SQLite）**：把相对静态的球鞋规格下到设备本地（`@capacitor-community/sqlite`
  或 IndexedDB），列表/详情本地秒出 + 离线 + 后台增量同步。收益最大、工程最大；当前 SW 的
  Cache Storage 已先覆盖了「本地 + 离线 + 重复访问快」的主要诉求。
