# 移动端 UI / 体验优化规范（决策记录）

本文件锁定与用户确认的设计决策,作为逐屏优化的依据。总基调:**丝滑炫酷但不突兀**
——在现有「深色高级感」上精修 + 适度视觉升级;**关键处炫、常规处丝滑**;App/移动网页
做**类原生**,电脑网页保持并随手微调。

## For You = 首页门面
- **首页改为常规上下滚动**(弱化原全屏滑动):顶部 **For You 块** → 下面 **Hero + 数据库 feed**。
- **persona 个性化 feed 与 For You 共存**:persona 继续给数据库列表排序;For You 是另一层
  (浏览历史 + 周报 AI)。**Hero 保留**,下移到 For You 之下。
- **三端**(电脑网页 / 移动网页 / App)都以 For You 作首页门面。
- **折叠**:点 X 收起 For You,露出下面数据库;收起后**顶部留一条「为你推荐」细条**可重开;
  **每天首次进入自动展开一次**。
- **未登录 / 无推荐**:显示「开始浏览」引导页(引导文案 + 几双热门鞋)。
- **板块顺序**:
  1. **带洞察的个性化问候 + 日期**(如「晚上好,Mathilde · 为控卫的你挑了几双抓地好的」)
  2. **为你挑的对比**(周报:2 双近期浏览鞋,一键对比)
  3. **智能选鞋推荐**(周报 AI:几双 + 理由,可跳 Smart Picker 继续)
  4. **继续浏览**(最近浏览,横滑卡片)
  5. **热门 Top 3**(领奖台式:第 1 居中抬高,第 2 左、第 3 右)
- **样板**:先在 `/for-you` 路由把 For You 内容做成样板供 on-device review,定调后再集成为
  首页顶部块(含折叠/每日展开逻辑)。

## 动画(framer-motion)
- 力度:**关键处炫、常规处丝滑**。
- **页面转场:iOS 式滑动**(进入右滑入、返回右滑出,带层叠阴影)。
- 微交互(全做):**按压回弹(tap scale)**、**列表 stagger 入场**、**骨架屏 shimmer**、
  **滚动视差 / 光效**。

## 手势(类原生,全做)
- **边缘滑动返回**、**下拉刷新**、**底部弹出 sheet**(筛选/举报/分享改 bottom sheet)、
  **卡片滑动操作**(评论/对比项左滑出操作)。

## 触感(`lib/native/haptics.ts`)
- 触发点(全做):主按钮/CTA、开关·标签·选择器、成功/警告/失败、手势触发点。
- 强度:**关键处重、常规轻**(routine=light,success/确认/关键=medium·notification)。
- **开关**:设置里「触感反馈」开关,**默认开**,尊重系统。
- 平台:**iOS 全量;Android 适度**(只在关键处触发,routine tap 在 Android 跳过)。

## 优化顺序
For You / 首页(样板)→ 鞋详情页 → 对比页 → 智能选鞋 → 全局导航/转场。全部要做。

## 进度
- [x] 触感基建 `lib/native/haptics.ts`
- [x] For You 样板(`/for-you`)+ 领奖台修复(王冠在图上方、`object-contain` 不裁切)
- [x] **首页 = For You(slide 0)+ 数据库(slide 1)**:保留 2-screen deck;slide 0 = For You(球员
      小人放问候旁),slide 1 = 小 Hero + 统计(在 feed 滚动区内、**不悬挂、下滑即没**)+ 数据库;
      **去掉 X/浮层,一路下滑**;persona feed 仍管数据库排序、Hero 缩小下移、统计移到数据库表上方。
      For You 数据 `getForYouData()` 服务端注入。
- [x] **触感全面铺开**:按钮 `.tap()`(在共享 `Button` 里统一)、Tab 切换 `.selection()`、
      投稿/评分/图片纠错的成功·失败触感;`window.confirm`/举报改原生玻璃动作表。
- [x] **触感设置开关 UI**(`HapticsToggle`,仅 App 内显示,沿用 localStorage 偏好)。
- [x] **下拉刷新 + 边缘滑动返回**(JS 手势层 `web-pull-to-refresh.tsx` →
      `window.location.reload()` 整页真刷新,服务端 + 客户端数据全部重新拉取;
      `allowsBackForwardNavigationGestures`)。手势只在当前滚动容器顶端才会武装,
      弹层/侧栏/图片平移区自带滚动时自动让路。
- [x] **全局转场 / 微交互基建**:iOS 式方向性页面转场(`components/motion/page-transition.tsx`,
      CSS 驱动、不残留 transform、按平台/前进后退区分);`Stagger`/`StaggerItem` 编排入场;
      `Parallax` 滚动视差;`BottomSheet` 可拖拽底部弹层;`SwipeRow` 左滑操作(按 coarse 指针自启);
      共享动效常量 `lib/motion/constants.ts`(EASE/DUR/SPRING)。
- [x] **逐屏套用**:详情(性能网格 stagger + 雷达揭示 + hero 视差/光扫)、对比(diff 行/条形已具)、
      智能选鞋(推荐网格 stagger + 气泡入场)、Quick Picker(步骤滑动转场 + chip 触感)、
      投稿(字段逐项入场)、收藏/Dashboard(网格/列表 stagger + 统计 count-up)、搜索(结果 stagger)、
      合集(横滑 rail 边缘渐隐)、底部导航(layoutId 滑动指示器 + selection 触感)、
      收藏心形迸发、球鞋卡片图片悬停缩放、星级填充滑动、Foot-scan 扫描线 + 倒计时弹跳。
- [x] **其余手势**:筛选在手机端改 `BottomSheet`(桌面保留内联面板);Dashboard 对比行左滑删除。
