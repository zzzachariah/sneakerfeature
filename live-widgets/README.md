# 灵动岛 · 锁屏实时活动 · 主屏小组件 — 接入手册

这一份是**你要在 Mac / Android Studio 上手动做的所有事**。代码已经全部写好了，
下面每一步都是「点哪里、填什么」。

> **前提**：仓库里目前**没有** `ios/` 和 `android/`（MOBILE.md 第 36 行说明它们要在
> Mac 上生成后提交）。所以第一步一定是生成原生工程。

---

## 零、这套东西是什么

| 用户看到的 | Apple / Google 的名字 | 代码在哪 |
|---|---|---|
| 灵动岛走秒 | Live Activity 的 Dynamic Island 呈现 | `ios/Widgets/CourtSessionLiveActivity.swift` |
| 锁屏那张卡 | **同一个** Live Activity 的 Lock Screen 呈现 | 同上，同一份代码 |
| 主屏小组件 | WidgetKit Widget | `ios/Widgets/*Widget.swift` |
| 锁屏圆环 | accessory family Widget | `ios/Widgets/CourtWeekAccessoryWidget.swift` |
| 安卓小组件 | AppWidgetProvider | `android/.../ClosetWidgetProvider.kt` |
| 安卓走秒通知 | ongoing notification + chronometer | `android/.../CourtSessionNotifier.kt` |

灵动岛和锁屏卡是**同一个 `ActivityConfiguration` 的两种呈现**，不是两件事。

### 为什么 iOS 是「手动加文件」而安卓是 npm 插件

安卓的 widget provider、receiver、布局都能靠 Gradle 的 manifest merger 自动并进主工程，
所以 `live-widgets` 是一个正常的本地 Capacitor 插件，`npx cap sync android` 就装好了。

iOS 不行，两个原因：

1. **Widget Extension 是一个新的 Xcode target**，`cap sync` 不会替你建，必须手动建一次。
2. **App Intents 的元数据只从 target 自己的源码里提取**。如果把 `CourtSessionIntents.swift`
   放进 SPM 包，小组件上的「开场」按钮很可能在真机上点了没反应 —— 系统找不到那个 intent。
   所以它必须直接属于 App target。

既然已经要在 Xcode 里建 target 了，多拖三个文件夹进去的边际成本很小。

---

## 一、生成原生工程（只做一次，必须在 Mac）

```bash
git checkout claude/dynamic-island-homescreen-widget-xru63a
npm install                # 会把 live-widgets 装成本地依赖
npx cap add ios
npx cap add android
npm run cap:assets
npx cap sync
git add ios android && git commit -m "Add generated native projects"
```

`cap sync android` 之后，安卓那半边**就已经全好了** —— 小组件和走秒通知都在了。
剩下全是 iOS 的活。

---

## 二、iOS：建 Widget Extension target

```bash
npx cap open ios          # 打开 ios/App/App.xcworkspace
```

1. **File → New → Target…**
2. 选 **Widget Extension** → Next
3. 填：
   - **Product Name**：`SneakerfeatureWidgets` ← **必须一字不差**，代码里引用了这个名字
   - **Include Live Activity**：**勾上**
   - **Include Configuration App Intent**：**不要勾**（我们用的是静态小组件）
   - Team / Organization 跟主 App 一致
4. Next → Finish → 弹出「Activate scheme?」选 **Activate**
5. Xcode 会生成一堆模板文件（`SneakerfeatureWidgets.swift`、`SneakerfeatureWidgetsBundle.swift`、
   `SneakerfeatureWidgetsLiveActivity.swift`、`AppIntent.swift` 等）。
   **把它们全部删掉**（Move to Trash），只留下 `Assets.xcassets` 和 `Info.plist`。
   > 不删的话会有两个 `@main`，直接编译失败。

### 设置 Deployment Target

选中 **SneakerfeatureWidgets** target → **General** → **Minimum Deployments** → **iOS 16.2**。

> 为什么是 16.2：`ActivityContent` API 从 16.2 开始，代码全按它写的。主 App 的
> deployment target **不用动**（Capacitor 那套更低），两个 target 各管各的。

---

## 三、iOS：把写好的源码加进去

**File → Add Files to "App"…**，把 `live-widgets/ios/` 下面**三个文件夹**分别加进来。

加的时候注意底部的选项：

- **Copy items if needed → 不要勾**（保持引用仓库里的文件，这样以后 `git pull` 直接生效）
- **Create groups**（不是 folder references）
- **Add to targets** → 按下表**逐个文件夹**勾选：

| 文件夹 | App | SneakerfeatureWidgets | 为什么 |
|---|:--:|:--:|---|
| `live-widgets/ios/Shared/` | ✅ | ✅ | ActivityAttributes 和 App Intent 必须两边都有 —— 这是 Apple 规定的共享方式，扩展负责序列化，App 负责执行 |
| `live-widgets/ios/App/` | ✅ | ❌ | Capacitor 插件，只有 App 用 |
| `live-widgets/ios/Widgets/` | ❌ | ✅ | SwiftUI 视图 + `@main`，加进 App 会两个 `@main` 冲突 |

> **加完一定要核对一遍**：选中任意一个文件 → 右侧 **File Inspector → Target Membership**。
> 这一步错了是最常见的失败原因，而且报错信息通常指向别的地方。

每个源文件的开头都写了它该属于哪个 target（`// TARGET MEMBERSHIP: …`），照着核对即可。

---

## 三 b、iOS：让 Capacitor 认识这个插件（漏了整套静默失效）

**加进 target 只是让它被编译，不等于被注册。**

Capacitor 8 的 `CapacitorBridge.registerPlugins()` 只注册两类插件：它自己的内置插件，
和 `capacitor.config.json` 里 `packageClassList` 列出的类 —— 而那个列表是
`cap sync` 从 **npm 包**生成的。**写在 App target 里的插件，编译得好好的、链接得好好的，
但永远不会被注册**，JS 每次调用都以 "not implemented" 被拒。

而网页层把「调用失败」解读成「这台设备没有小组件」，于是把整套功能安静地关掉 ——
**编译零错误、运行零报错、什么都不发生**。

修法是 Capacitor 自己的钩子：

1. **File → New → File from Template… → Swift File**，命名 `MainViewController`，
   target 勾 **App**。把 `live-widgets/ios/App/MainViewController.swift` 的内容贴进去。

2. **左侧 `App → App → Main`（storyboard）** → 画布上选中那个 view controller
   → 右侧 **Identity Inspector（⌘⌥4）** → **Custom Class → Class** 从
   `CAPBridgeViewController` 改成 **`MainViewController`**，Module 选 **App**（不是 Capacitor）。

第 2 步漏了，第 1 步就白做 —— storyboard 还在实例化原来那个基类，你的 `capacitorDidLoad()`
根本不会被调用。

**验证**：跑起来后在 Xcode 控制台 Filter 里输 `LiveWidgets`，进一次账号页，
应该看到 `⚡️  To Native -> LiveWidgets isAvailable`。一行都没有就说明这一节没生效。

---

## 四、iOS：开 App Group（不开的话小组件永远是空的）

小组件是**独立进程**，读不到 App 的 `UserDefaults`，更读不到 WebView 的 cookie。
两者唯一能共用的就是 App Group 容器。

1. [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list/applicationGroup)
   → **Identifiers → App Groups → +**
   → Description 随便填，**Identifier 填 `group.com.sneakerfeature.app`** ← 必须一字不差
2. Xcode 里 **两个 target 都要加**：
   - 选 **App** target → **Signing & Capabilities** → **+ Capability** → **App Groups**
     → 勾上 `group.com.sneakerfeature.app`
   - 选 **SneakerfeatureWidgets** target → 同样操作
3. Xcode 会自动生成 `App.entitlements` 和 `SneakerfeatureWidgets.entitlements`

> 改这个名字的话，`live-widgets/ios/Shared/WidgetSharedStore.swift` 里的
> `appGroupIdentifier` 和安卓那边无关（安卓同进程，不需要）。

---

## 五、iOS：Info.plist 两条

**App target 的 `ios/App/App/Info.plist`**（不是小组件的）加一条：

```xml
<key>NSSupportsLiveActivities</key>
<true/>
```

没有这条，`Activity.request()` 会一直抛错，灵动岛永远不出现，而且**不会有任何报错提示**。

顺带确认 MOBILE.md 第 204 节说的 URL scheme 已经加好了 —— 小组件点击就是靠它跳回 App：

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

*（可选）* 想让灵动岛在「频繁更新」场景下不被系统限流，可以再加
`NSSupportsLiveActivitiesFrequentUpdates` = `true`。本方案的计时靠系统自己走秒、
基本不推送更新，**不加也完全正常**。

---

## 六、iOS：跑起来验证

真机（模拟器没有灵动岛硬件，但锁屏卡能看到）：

1. 顶部 scheme 选 **App**（不是 SneakerfeatureWidgets）→ 选你的 iPhone → **▶ Run**
2. 打开 App → 底部账号页 → 应该能看到新的 **「小组件与实时活动」** 设置区
   - **看不到这一区** = 插件没注册成功。先查第三 b 节（Main.storyboard 的 Custom Class
     改成 `MainViewController` 了吗），再查 App target → **Build Phases → Compile
     Sources** 里有没有 `LiveWidgetsPlugin.swift`。
3. 进 **/closet** → 页面顶部现在有一块很大的玻璃面板「打球计时 / 开场」
4. 点**开场** → 灵动岛立刻开始走秒；锁屏能看到整张卡；
   长按灵动岛展开有**暂停 / 结束**两个按钮
5. 点**结束** → 时长自动写进鞋柜（`closet_wear_logs`）
6. 回主屏 → 长按空白处 → **+** → 搜 `sneakerfeature` → 应该有四个小组件可加
7. 锁屏：长按锁屏 → **自定义** → 时间下方那一栏 → 加 **本周打球时长** 圆环

### 常见问题对照表

| 现象 | 原因 |
|---|---|
| 设置页看不到「小组件与实时活动」 | 十有八九是第三 b 节没做（storyboard 的 Custom Class 还是 `CAPBridgeViewController`）。控制台 filter `LiveWidgets` 一行都没有就是它。其次才是 `LiveWidgetsPlugin.swift` 没加进 App target |
| 小组件一直显示空状态 | App Group 没开，或两个 target 的 group id 不一致 |
| 灵动岛不出现，但 App 内计时正常 | `Info.plist` 缺 `NSSupportsLiveActivities` |
| 小组件里没有鞋图，文字都对 | 正常 —— 图片是 App 后台下载的，下次打开 App 就有了 |
| 小组件「开场」点了没反应 | 该 intent 没进 App target（`CourtSessionIntents.swift` 必须两个 target 都勾） |
| 编译报 `'glassEffect' is unavailable` | Xcode 低于 26。`LiquidGlass.swift` 里的 `#if compiler(>=6.2)` 本应挡住 —— 若仍报错，说明该文件被加进了 App target，只勾 Widgets |
| 编译报两个 `@main` | `Widgets/` 文件夹被加进了 App target，或模板文件没删干净 |

---

## 七、CI：加第二套签名（不加的话 Actions 会挂）

`.github/workflows/mobile.yml` 现在只装一个描述文件（第 99–107 行），
`exportOptions.plist` 的 `provisioningProfiles` 也只有一条。多了一个 extension bundle 之后
必须补第二条，否则 `xcodebuild -exportArchive` 直接失败。

### 在 Apple 开发者后台

1. **Identifiers → +** → App IDs → App
   → Bundle ID 填 `com.sneakerfeature.app.SneakerfeatureWidgets`
   → 勾上 **App Groups**
2. **Profiles → +** → **App Store** → 选上面这个 App ID → 生成并下载
3. 主 App 的 App ID 也要**补勾 App Groups**，然后**重新生成**它的描述文件

### 在 GitHub Secrets 里新增

| Secret | 内容 |
|---|---|
| `IOS_WIDGET_PROVISIONING_PROFILE` | 新描述文件的 base64 |
| `IOS_WIDGET_PROVISIONING_PROFILE_NAME` | 它在后台显示的名字 |

生成 base64：`base64 -i Widgets.mobileprovision | pbcopy`

工作流的改动已经写好了，直接用即可（见 `.github/workflows/mobile.yml`）。

---

## 八、Android：还需要做什么

**基本不用做。** `npx cap sync android` 之后：

- `ClosetWidgetProvider` / `CourtSessionReceiver` 已经由 manifest merger 并进主工程
- 打开 App → 长按桌面 → 小组件 → 找 **战靴里程**

只有一件事要留意：

**Android 13+ 的通知权限**。走秒通知需要 `POST_NOTIFICATIONS`，但本 App 目前**不申请**
它（MOBILE.md 第 135 行：安卓推送已停用）。`CourtSessionNotifier` 会先查
`areNotificationsEnabled()`，没授权就直接跳过 —— **App 内的计时完全不受影响，
只是通知栏那条不出现**。想要它出现，得在某处调一次运行时权限申请。

### 安卓和 iOS 的差异（有意为之）

| | iOS | Android |
|---|---|---|
| 小组件数量 | 4 个 | 1 个（战靴里程） |
| 进度显示 | 圆环 | 进度条（RemoteViews 的原生控件，画圆环要每次栅格化位图） |
| 计时呈现 | 灵动岛 + 锁屏卡 | 常驻通知 + chronometer |
| Smart Picker 进度 | 有 | 无（`liveActivities: false`，设置里那一行会自动隐藏） |

小米「灵动岛」、华为实时窗、OPPO/vivo 实况通知都要**各家单独申请接入 + 各自的 SDK**，
不在这一批里。

---

## 九、代码结构速查

```
live-widgets/
├── ios/
│   ├── Shared/          → App + SneakerfeatureWidgets 两个 target 都勾
│   │   ├── WidgetSnapshot.swift          lib/widgets/snapshot.ts 的 Swift 镜像
│   │   ├── WidgetSharedStore.swift       App Group 容器读写
│   │   ├── WidgetCopy.swift              中英文案 + 数字格式
│   │   ├── WidgetLinks.swift             生成 sneakerfeature:// 深链接
│   │   ├── CourtSessionAttributes.swift  实时活动的数据形状
│   │   ├── CourtSessionController.swift  ActivityKit 的启动/更新/结束
│   │   ├── CourtSessionIntents.swift     开场 / 暂停 / 结束三个 App Intent
│   │   ├── PickerActivityAttributes.swift
│   │   └── PickerActivityController.swift
│   ├── App/             → 只勾 App
│   │   ├── LiveWidgetsPlugin.swift       Capacitor 桥
│   │   └── MainViewController.swift      把插件注册进 bridge（见第三 b 节）
│   └── Widgets/         → 只勾 SneakerfeatureWidgets
│       ├── SneakerfeatureWidgetsBundle.swift   @main
│       ├── WidgetSnapshotProvider.swift        TimelineProvider
│       ├── WidgetTheme.swift / LiquidGlass.swift
│       ├── ClosetMileageWidget.swift           战靴里程（小/中/大）
│       ├── DailyShoeWidget.swift               今日一鞋（小/中）
│       ├── FavoritesWidget.swift               收藏与对比（小/中）
│       ├── CourtWeekAccessoryWidget.swift      锁屏圆环 / 行内
│       ├── CourtSessionLiveActivity.swift      灵动岛 + 锁屏卡
│       └── PickerLiveActivity.swift            Smart Picker 进度
└── android/             → npx cap sync android 自动接入
```

网页那一侧：

| 文件 | 作用 |
|---|---|
| `lib/widgets/snapshot.ts` | 数据契约（纯函数，有单测） |
| `lib/native/live-widgets.ts` | JS → 原生的桥，非原生环境全部安全降级 |
| `lib/native/widget-prefs.ts` | 用户开关（localStorage，逐设备） |
| `lib/closet/court-session.ts` | 计时纯逻辑（有单测） |
| `app/api/widgets/snapshot/route.ts` | 一次请求组装出小组件要画的全部内容 |
| `components/native/widget-sync.tsx` | 开机 / 回前台 / 数据变化时推送快照 |
| `components/closet/court-session-*.tsx` | 计时状态机 + /closet 入口 + 全局悬浮条 |
| `components/preferences/widgets-toggle.tsx` | 设置页那一组开关 |

回归测试：`npm run test:widgets`（90 条断言，纯逻辑，随时可跑）。

---

## 十、数据是怎么流动的

```
① 快照下行
   App 启动/回前台 → WidgetSync → GET /api/widgets/snapshot
   → 按本机设置裁剪（关掉的板块连数据都不写）
   → LiveWidgets.publishSnapshot() → App Group 的 JSON
   → WidgetCenter.reloadAllTimelines() → 小组件重绘

② 图片
   快照里只有 URL → 原生用 URLSession 下载 → 缩到 480px → PNG 存进 App Group
   （小组件进程不能联网，图必须提前落盘）

③ 开场（App 内）
   /closet 点开场 → CourtSessionProvider → Activity.request() → 灵动岛出现

④ 开场（小组件）
   小组件按钮 → StartCourtSessionIntent（在 App 进程里执行，App 可以是没开的）
   → 起 Live Activity + 往 App Group 的队列里塞一条 start 记录

⑤ 结束（灵动岛）
   Island 上点结束 → EndCourtSessionIntent → 结束活动 + 队列里塞一条 end 记录
   → 下次 App 回到前台 → CourtSessionProvider 排空队列 → POST /api/closet/wear

⑥ 点击
   小组件 widgetURL("sneakerfeature://shoes/xxx") → Capacitor appUrlOpen
   → pathFromDeepLink()（已有，且有独立回归 npm run test:deep-link）→ WebView 跳转
```

**为什么写日志一定要绕回网页层**：只有 WebView 那边有 Supabase 的会话 cookie。
原生能停表，但不能替用户写数据库。所以队列是唯一的交接方式 —— 也因此
App Group 里**没有任何 token**，被读走也只是用户自己鞋柜的一张渲染快照。

---

## 十一、几个刻意的取舍

- **计时只存时间戳，从不存累计秒数。** 系统自己走秒（iOS 的
  `Text(timerInterval:)`、安卓的 `setUsesChronometer`），所以 App 被挂起、被杀、
  手机装进包里两小时，回来依然是对的，而且不耗电。如果改成每秒推一次数字，
  iOS 一挂起就冻住了，ActivityKit 本身也会限流。
- **12 小时封顶。** 忘了停表的那种。超过就自动结算，最坏情况是一条偏大但有限的记录，
  用户可以自己改；而不是给中底凭空加 14 小时寿命。
- **不做发售倒计时。** `shoes` 表只有 `release_year`（`001_init.sql:22`），
  没有精确发售时间。要做得先加字段 + 建管理端录入界面，那是另一批活。
- **实时活动只做两个场景。** Apple 卡内容：必须是「正在进行、有时效」的事件。
  打球计时和 AI 生成都满足；「每日推荐」这种做成实时活动会被拒。
- **小组件不联网。** 扩展进程没有会话，能拉的只有公开数据；要拉私有数据就得把
  token 放进容器里给扩展用。改成 App 推快照，既简单又不用留这个口子。
