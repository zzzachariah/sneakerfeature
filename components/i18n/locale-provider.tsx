"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { Modal } from "@/components/ui/modal";

export type Locale = "en" | "zh";

const LOCALE_STORAGE_KEY = "locale";
const SWITCH_OVERLAY_MS = 900;
const isI18nDebugEnabled = process.env.NEXT_PUBLIC_I18N_DEBUG === "1";

const UI_TRANSLATIONS_ZH: Record<string, string> = {
  "bounce": "弹性",
  "decent": "中等",
  "kobe": "科比",
  "boom": "䨻",
  "continue": "继续",
  "translating...": "翻译中…",
  "machine translation may contain some inaccuracies. thank you for your understanding. loading may also take a little time.":
    "机器翻译可能出现一些问题，敬请谅解。另外，加载可能会花一点时间。",
  "integrated basketball sneaker feature platform": "综合篮球鞋性能平台",
  "basketball sneaker database": "球鞋配置信息库",
  "the decision layer for basketball sneakers": "篮球鞋决策中枢",
  "a living index": "实时更新的",
  "of every pair": "球鞋信息",
  "worth playing in.": "数据库",
  "every basketball sneaker worth playing in — reviewed, compared, and indexed by the community.": "查看、对比、上传球鞋",
  "cushion, traction, court feel — structured and comparable. because choosing a shoe shouldn't take 10 tabs.": "缓震、抓地、场地感 —— 数据化、可对比。买鞋不必再开十个网页查来查去。",
  "go to compare": "前往对比界面",
  "submission pipeline": "审核流程",
  "submit a shoe": "上传球鞋",
  "pick up to 5 shoes to compare.": "选至多五双鞋对比",
  "add shoe": "添加球鞋",
  "compare, discuss, and choose your ideal basketball sneaker on snkrfeature": "在 SNKRFEATURE 比较、讨论并选择你理想的篮球鞋",
  "if you want to contribute to our community, please submit corrections, upload a new shoe, and discuss!":
    "如果你想为社区做贡献，欢迎提交更正、上传新鞋并参与讨论！",
  "submit new shoe info": "提交新鞋信息",
  "open compare": "打开对比",
  "submission review pipeline": "投稿审核流程",
  "all brands": "全部品牌",
  "image": "图片",
  "no image": "暂无图片",
  "find image": "查找图片",
  "search image": "搜索图片",
  "search again": "重新搜索",
  "approve image": "通过图片",
  "reject image": "拒绝图片",
  "image pending review": "图片待审核",
  "image approved": "图片已通过审核",
  "image rejected": "图片已拒绝",
  "searching images...": "正在搜索图片…",
  "image import failed": "图片导入失败",
  "no suitable image found": "未找到合适图片",
  "selected image could not be downloaded": "所选图片无法下载",
  "image imported for review": "图片已导入，等待审核",
  "find images for all missing shoes": "为所有缺失图片的球鞋查找图片",
  "auto-fill missing images": "自动补全缺失图片",
  "bulk image import started": "批量图片导入已开始",
  "bulk image import completed": "批量图片导入已完成",
  "imported and approved": "已导入并通过",
  "skipped": "已跳过",
  "failed": "失败",
  "no missing shoes found": "未找到缺失图片的球鞋",
  "approved": "已通过",
  "pending": "待审核",
  "total checked": "总检查数",
  "missing approved images": "缺失已通过图片",
  "total shoes": "球鞋总数",
  "progress": "进度",
  "running": "运行中",
  "completed": "已完成",
  "no active bulk job": "当前没有批量任务",
  "bulk job in progress": "批量任务进行中",
  "current shoe": "当前球鞋",
  "abort": "中止",
  "stopping...": "正在停止...",
  "cancelled": "已取消",
  "search": "搜索",
  "clear search": "清空搜索",
  "name": "名称",
  "brand": "品牌",
  "release": "发售时间",
  "no sneakers match this search.": "没有符合当前搜索条件的球鞋。",
  "clear filters": "清除筛选",
  "shoes selected for compare": "双鞋已加入对比",
  "compare now": "立即对比",
  "advanced search": "高级搜索",
  "language": "语言",
  "toggle mobile menu": "切换移动端菜单",
  "close mobile navigation": "关闭移动端导航",
  "contact": "联系",
  "about": "关于",
  "email address copied to clipboard.": "邮箱地址已复制到剪贴板。",
  "unable to copy automatically. please try again.": "无法自动复制，请重试。",
  "information is collected from ai models such as chatgpt and from users, and is verified by humans.":
    "信息来自 ChatGPT 等 AI 模型与用户提交，并由人工审核。",
  "this website was created by zzz.": "本网站由 zzz 创建。",
  "close information modal": "关闭信息弹窗",
  "hi!": "你好！",
  "some words": "一些想说的话",
  "in the meantime, enjoy!": "在此期间，祝你浏览愉快！",
  "account": "账号",
  "log in": "登录",
  "sign up": "注册",
  "log out": "登出",
  "compare": "对比",
  "submit": "提交",
  "loading comparison matrix": "正在加载对比矩阵",
  "loading dashboard": "正在加载仪表盘",
  "loading dashboard data": "正在加载仪表盘数据",
  "loading advanced search": "正在加载高级搜索",
  "loading shoe detail": "正在加载球鞋详情",
  "authenticating": "认证中",
  "register": "注册",
  "login": "登录",
  "sign in": "登录",
  "signing in...": "登录中…",
  "create account": "创建账号",
  "creating account...": "正在创建账号…",
  "creating your account": "正在创建你的账号",
  "setting up your profile": "正在设置你的资料",
  "username": "用户名",
  "email": "邮箱",
  "password": "密码",
  "need an account?": "还没有账号？",
  "already have an account?": "已有账号？",
  "email or username": "邮箱或用户名",
  "sign in with email or username.": "使用邮箱或用户名登录。",
  "log in or sign up for the full snkr feature experience.": "登录或注册以获得完整的 SNKR Feature 体验。",
  "view shoe": "查看球鞋",
  "overview": "概览",
  "loading account...": "正在加载账号…",
  "welcome back": "欢迎回来",
  "user": "用户",
  "admin account": "管理员账号",
  "my comments": "我的评论",
  "liked comments": "点赞评论",
  "disliked comments": "点踩评论",
  "comments you liked": "你点赞过的评论",
  "comments you disliked": "你点踩过的评论",
  "no comments yet.": "还没有评论。",
  "you have not liked any comments yet.": "你还没有点赞任何评论。",
  "you have not disliked any comments yet.": "你还没有点踩任何评论。",
  "submissions": "投稿",
  "no submissions yet.": "还没有投稿。",
  "status": "状态",
  "saved compares": "已保存对比",
  "no saved comparisons yet.": "还没有保存的对比。",
  "settings": "设置",
  "email (read-only)": "邮箱（只读）",
  "current password": "当前密码",
  "enter current password": "输入当前密码",
  "change password": "修改密码",
  "save profile": "保存资料",
  "new password": "新密码",
  "at least 8 characters": "至少 8 个字符",
  "confirm new password": "确认新密码",
  "re-enter new password": "再次输入新密码",
  "cancel": "取消",
  "update password": "更新密码",
  "user center": "用户中心",
  "please sign in to view your user center.": "请先登录以查看用户中心。",
  "complete turnstile verification first.": "请先完成 Turnstile 验证。",
  "submit correction": "提交更正",
  "submit sneaker information": "提交球鞋信息",
  "you're submitting a correction for": "你正在提交更正，目标为",
  "an existing published shoe": "一双已发布球鞋",
  "this goes to the same review queue and approval will update the existing record.": "该请求会进入同一审核队列，审核通过后将更新现有记录。",
  "submissions are stored as raw payload, normalized server-side, and routed to admin review before publication.": "投稿会先以原始数据保存，在服务端标准化后提交管理员审核，再发布。",
  "story title": "故事标题",
  "short headline for the story.": "故事的简短标题。",
  "story / background notes": "背景故事/补充说明",
  "release context, design intent, notable versions, community notes.": "发售背景、设计意图、重要版本、社区补充说明。",
  "raw notes (required)": "原始备注（必填）",
  "paste your full performance observations and source snippets...": "粘贴完整实战观察和来源片段……",
  "submit for review": "提交审核",
  "submission received": "已收到投稿",
  "back to submit": "返回提交页",
  "write a comment": "写评论",
  "join the discussion with traction notes, fit tips, and durability observations.": "欢迎分享抓地、包裹和耐久方面的实战体验。",
  "you need to be logged in to post a comment.": "你需要登录后才能发表评论。",
  "write your performance feedback...": "写下你的实战反馈……",
  "log in to start writing...": "登录后开始撰写……",
  "posting...": "发布中…",
  "post comment": "发布评论",
  "keep it constructive and specific to on-court experience.": "请保持建设性，并聚焦实战体验。",
  "view discussion": "查看讨论",
  "comment": "评论",
  "comments": "评论",
  "no discussion yet": "还没有讨论",
  "be the first to share how this shoe performs on court.": "来当第一个分享这双鞋实战表现的人吧。",
  "delete my comment": "删除我的评论",
  "delete": "删除",
  "highlight differences": "高亮差异",
  "field": "字段",
  "release year": "发售年份",
  "category": "类别",
  "forefoot midsole": "前掌中底",
  "heel midsole": "后掌中底",
  "outsole": "外底",
  "not yet added": "尚未添加",
  "no shoes selected. add ids via the url query string.": "未选择球鞋。请通过 URL 查询参数添加 ID。",
  "welcome!": "欢迎！",
  "story behind snkrfeature": "snkrfeature 背后的故事",
  "completed reading": "我已阅读完毕",
  "continue to sign up": "继续注册",
  "turnstile is not configured. demo verification mode is active.": "Turnstile 未配置，当前为演示验证模式。",
  "use demo token": "使用演示令牌",
  "theme": "主题",
  "click to cycle theme.": "点击切换主题。",
  "system": "系统",
  "light": "浅色",
  "dark": "深色",
  "compare sneakers": "对比球鞋",
  "share this comparison via url query params:": "通过 URL 查询参数分享此对比：",
  "search to add": "搜索并添加",
  "find more shoes by keyword and filters, then add them directly to this comparison.": "通过关键词和筛选查找更多球鞋，并直接添加到本次对比。",
  "hide search": "隐藏搜索",
  "open search": "打开搜索",
  "keywords": "关键词",
  "name, tags, tech, notes...": "名称、标签、科技、备注……",
  "all categories": "全部类别",
  "tech": "科技",
  "e.g. lebron": "例如：LeBron",
  "e.g. zoom, plate": "例如：Zoom、支撑板",
  "reset": "重置",
  "no player tag": "暂无球员标签",
  "add to compare": "加入对比",
  "clear all shoes": "清空全部球鞋",
  "show tech details": "显示科技详情",
  "hide tech details": "隐藏科技详情",
  "remove shoe from compare": "从对比中移除球鞋",
  "no shoes in compare yet.": "当前还没有加入对比的球鞋。",
  "use search and add controls to start building your comparison.": "使用上方搜索和添加功能开始建立对比。",
  "no shoes found": "未找到球鞋",
  "try broader keywords or remove one filter.": "请尝试更宽泛的关键词，或移除一个筛选条件。",
  "no playstyle summary available yet.": "暂无打法总结。",
  "performance profile": "性能画像",
  "story & provenance": "故事与来源",
  "no editorial story content yet.": "暂无编辑故事内容。",
  "no editorial story yet.": "暂无编辑故事。",
  "source/evidence: seed dataset + community validation pipeline. admin review required before promotion to official records.":
    "来源/证据：种子数据集 + 社区验证流程。成为官方记录前需管理员审核。",
  "source": "来源",
  "related shoes": "相关球鞋",
  "back to database": "返回数据库",
  "shoe name": "鞋名",
  "model / version": "型号 / 版本",
  "forefoot midsole tech": "前掌中底科技",
  "heel midsole tech": "后掌中底科技",
  "forefoot tech": "前掌中底科技",
  "heel tech": "后掌中底科技",
  "outsole tech": "外底科技",
  "share card": "分享卡片",
  "spec sheet": "球鞋档案",
  "comparison sheet": "对比卡片",
  "scan to open": "扫码查看",
  "everything u need to know for sneakers": "球鞋情报，一网打尽",
  "rendering...": "生成中…",
  "download png": "下载 PNG",
  "3:4 ratio · 1080 × 1440 captured at 3x for retina sharpness.":
    "3:4 比例 · 1080 × 1440，按 3x 输出更清晰",
  "head to head": "正面对决",
  "shoes": "双",
  "story": "背景",
  "no editorial story available.": "暂无故事内容。",
  "pick up to": "至多挑选",
  "comparison cards fit at most": "对比卡片最多支持",
  "more shoe": "双球鞋",
  "more shoes": "双球鞋",
  "selected": "已选",
  "cushioning feel": "缓震脚感",
  "court feel": "场地感",
  "fit / containment": "包裹 / 锁定",
  "true to size": "不偏码",
  "tags (comma separated)": "标签（逗号分隔）",
  "source links (comma separated)": "来源链接（逗号分隔）",

  // Form validation & required-field copy
  "brand is required.": "品牌为必填项。",
  "shoe name is required.": "鞋名为必填项。",
  "raw notes are required.": "原始备注为必填项。",
  "enter a quantity.": "请输入数量。",
  "quantity must be a whole number greater than 0.": "数量必须为大于 0 的整数。",
  "complete verification above to enable submit.": "请先完成上方验证后再提交。",

  // Stepper / sectioning
  "step 1 of 4": "第 1 步（共 4 步）",
  "step 2 of 4": "第 2 步（共 4 步）",
  "step 3 of 4": "第 3 步（共 4 步）",
  "step 4 of 4": "第 4 步（共 4 步）",
  "section 2 of 4": "第 2 部分（共 4 部分）",
  "section 3 of 4": "第 3 部分（共 4 部分）",
  "section 4 of 4": "第 4 部分（共 4 部分）",

  // Buttons & button states
  "save compare": "保存对比",
  "add shoes": "添加球鞋",
  "pick shoes": "选择球鞋",
  "select up to": "最多可选",
  "clear all": "全部清除",
  "uploading...": "上传中…",
  "submitting...": "提交中…",
  "starting...": "正在开始…",
  "saving...": "保存中…",
  "save": "保存",
  "next": "下一步",
  "back": "返回",
  "open": "打开",
  "add": "添加",
  "stop": "停止",
  "stopped": "已停止",
  "preview": "预览",
  "upload": "上传",
  "generate images": "生成图片",
  "paste image url": "粘贴图片链接",
  "pasted image preview": "图片预览",

  // Empty states & feedback
  "no activity yet.": "还没有活动。",
  "no shoes selected yet": "还没有选择球鞋",
  "no matching shoes.": "没有匹配的球鞋。",
  "nothing to compare yet": "还没有要对比的球鞋",
  "only one shoe selected — add another to compare.": "只选择了一双鞋，请再添加一双进行对比。",
  "max reached": "已达上限",
  "you liked": "你点赞了",
  "you disliked": "你点踩了",
  "you commented": "你评论了",
  "comment posted": "评论已发布",
  "vote updated": "投票已更新",
  "vote failed": "投票失败",
  "comment deleted": "评论已删除",
  "delete failed": "删除失败",

  // Info copy / help text
  "let's start with what shoe this is.": "先确定这是哪一双鞋。",
  "manage your username and password.": "管理你的用户名和密码。",
  "materials and construction details. all optional.": "材料与构造细节，全部为可选填。",
  "subjective performance qualities, in your own words.": "用你自己的话描述主观性能体验。",
  "every metric is tied — these shoes are evenly matched.": "所有指标打平 — 这两双鞋势均力敌。",
  "add story + raw notes + verification, then submit.": "填写故事、原始备注、完成验证，然后提交。",
  "add up to five shoes and see their radar, diff, and full spec sheet side by side.":
    "最多添加五双鞋，并排查看雷达图、差异分析和完整规格。",
  "your submissions and saved comparisons.": "你的投稿和已保存的对比。",
  "your comments and reactions, newest first.": "你的评论和点赞 / 点踩记录，最新在前。",
  "create your snkrfeature account. public identity is username-based.":
    "创建你的 snkrfeature 账号，公开身份基于用户名。",
  "create your account to submit sneaker data and join discussions.":
    "创建账号以提交球鞋数据并参与讨论。",
  "a living index of every pair worth playing in.": "每一双值得上脚的球鞋的实时索引。",
  "every pair, indexed.": "每一双，皆有索引。",

  // Section labels & navigation
  "database": "数据库",
  "the database": "数据库",
  "analysis": "分析",
  "activity": "活动",
  "performance": "性能",
  "profile": "数据",
  "library": "图鉴",
  "index": "索引",
  "lineup": "阵容",
  "identity": "身份",
  "related": "相关",
  "verdict": "评估",
  "context": "背景",
  "spec": "规格",
  "specs": "规格",
  "tech specifications": "技术规格",
  "title": "标题",
  "metric": "指标",
  "metrics": "指标",
  "leads in": "领先于",

  // Search prompts
  "name, tags, tech…": "名称、标签、科技……",
  "search shoes...": "搜索球鞋...",
  "e.g. guards 2024": "例如：后卫鞋 2024",
  "scroll to next slide": "滚动到下一张幻灯片",

  // Compare card tech labels (used by share-card grid)
  "forefoot": "前掌",
  "heel": "后掌",
  "upper": "鞋面",

  // Compare spec table row labels (PROTECTED set used to block these — we
  // moved value protection into the spec-table component so labels can
  // translate cleanly.)
  "fit profile": "包裹感",

  // Advanced search
  "tech focus": "科技焦点",
  "e.g. zoom, traction pattern, carbon plate": "例如：Zoom、抓地花纹、碳板",
  "results": "搜索结果",
  "no results found": "未找到搜索结果",
  "try broadening your keyword or removing one filter.": "请尝试更宽泛的关键词，或减少一个筛选条件。",
  "open detail": "查看详情",
  "use structured filters here. the home table search remains your quick/basic search.":
    "在这里使用结构化筛选；主页表格搜索仍是你的快速/基本搜索。",
  "reset filters": "重置筛选",

  // Misc UI strings
  "no submissions match current filters.": "没有符合当前筛选条件的投稿。",

  // Star rating
  "rating": "评分",
  "your rating": "你的评分",
  "rate this": "去打分",
  "rate": "打分",
  "clear my rating": "清除我的评分",
  "min 0.5, max 5.0, in 0.5 steps.": "最低 0.5 星，最高 5 星，按 0.5 递增。",
  "rating saved.": "评分已保存。",
  "rating updated.": "评分已更新。",
  "rating cleared.": "评分已清除。",
  "authentication required.": "请先登录后再评分。",
  "sign in to rate": "登录后可评分",

  // Rating focus / playstyle
  "playstyle": "打法",
  "rating focus": "评分侧重",
  "pick playstyle": "选打法",
  "edit playstyle": "修改打法",
  "clear playstyle": "清除打法",
  "save playstyle": "保存打法",
  "sign in to pick playstyle": "登录后选打法",
  "how ratings work": "评分规则",
  "primary": "主要",
  "secondary": "次要",
  "tertiary": "第三",
  "pick three dimensions in order. the first is primary, then secondary, then tertiary.":
    "依次选三个维度：第一个是主要，然后是次要、第三。",
  "primary 40% · secondary 30% · tertiary 20% · others share 10%.":
    "主要 40% · 次要 30% · 第三 20% · 其余三项共 10%。",
  "ratings follow a bell curve based on every shoe's weighted score: 1-2 stars 20%, 3-4 stars 70%, 5 stars 10%.":
    "评分按所有球鞋的加权分百分位呈正态分布：1-2 星 20%，3-4 星 70%，5 星 10%。",
  "pick playstyle to see ratings": "选打法后查看评分",
  "playstyle saved.": "打法已保存。",
  "playstyle cleared.": "打法已清除。",
  "save failed": "保存失败",
  "clear failed": "清除失败",

  // Per-dimension user ratings
  "show ratings detail": "展开评分详情",
  "hide ratings detail": "收起评分详情",
  "rate every dimension to save": "评完所有维度才能保存",
  "by dimension": "各项评分",
  "clear my ratings": "清除我的评分",
  "save my ratings": "保存我的评分",
  "my ratings": "我的评分",

  // Tutorial
  "site tour": "网站导览",
  "tour": "导览",
  "close tour": "关闭导览",
  "step": "步骤",
  "previous step": "上一步",
  "finish": "完成",
  "this part lives on the homepage.": "这部分内容在首页。",
  "return home": "返回首页",
  "welcome to snkrfeature": "欢迎来到 snkrfeature",
  "a living index of basketball sneakers. let me show you around in under a minute.":
    "一份持续更新的篮球鞋索引，让我用不到一分钟带你看一遍。",
  "primary navigation": "主导航",
  "jump to home, compare, submit, and your account from here.":
    "在这里可以前往首页、对比、提交和你的账号。",
  "filter by tech, keywords, and structured fields when the homepage table isn't enough.":
    "需要更精细的筛选时，可在此按科技、关键词等字段查找。",
  "switch between english and chinese. machine-translated content is marked.":
    "在英文和中文之间切换，机器翻译内容会有标注。",
  "pick your playstyle and ratings reweight to what matters to you on court.":
    "选择你的打法后，评分会根据你在场上看重的维度重新加权。",
  "cycle light, dark, and system. your choice is remembered.":
    "循环切换浅色、深色和跟随系统，选择会被记住。",
  "sign in to save comparisons, rate shoes, and join discussions.":
    "登录后可保存对比、为球鞋打分并参与讨论。",
  "home — the index at a glance": "首页 — 索引一览",
  "live counts, what we cover, and quick links to compare and submit.":
    "实时计数、收录范围，以及对比与提交的快捷入口。",
  "every indexed pair, sortable and searchable. tap a row to open the full spec sheet.":
    "所有已收录的球鞋，可排序和搜索。点击行可查看完整规格。",
  "quick search": "快速搜索",
  "type a model, player, or tech keyword. filter by brand on the left.":
    "输入型号、球员或科技关键词，左侧可按品牌筛选。",
  "want a refresher?": "想再看一遍？",
  "re-open this tour anytime from this icon in the navbar. enjoy snkrfeature.":
    "随时通过导航栏的这个图标重新打开导览。祝你使用愉快。",

  // Persona / personalized recommendations
  "sneaker database": "球鞋信息库",
  "browse all": "浏览全部",
  "personalized": "个性化推荐",
  "recommended for you": "为你推荐",
  "why?": "为什么?",
  "match": "匹配",
  "log in to personalize": "登录以个性化推荐",
  "log in to personalize your feed.": "登录后即可获得个性化推荐。",
  "tap the avatar to set up your player profile.": "点小人设置你的球员档案。",
  "compare mode": "对比模式",
  "your personalized feed": "你的个性化推荐",
  "your player avatar": "你的球员形象",
  "edit your player profile": "编辑你的球员档案",
  "set up your player profile": "设置你的球员档案",
  "sign in to set up your player profile.": "登录后即可设置你的球员档案。",
  "pick your position(s), skill level, whether you have flat feet, and your height & weight. we will use these to recommend shoes.":
    "选择你的位置、水平、是否扁平足,以及身高体重。我们用这些信息来推荐球鞋。",
  "position": "位置",
  "pick up to 2 positions": "最多选择 2 个位置",
  "pick at least one position.": "请至少选择 1 个位置。",
  "please enter a valid height.": "请输入有效的身高。",
  "please enter a valid weight.": "请输入有效的体重。",
  "skill level": "水平",
  "beginner": "初学者",
  "amateur": "业余",
  "semi-pro": "半职业",
  "pro": "职业",
  "yes": "是",
  "no": "否",
  "are you flat-footed?": "你是平足吗?",
  "what is flat foot?": "什么是平足?",
  "flat foot means your arch is collapsed and your sole touches the ground more flatly. flat-footed players typically benefit from extra stability and arch support.":
    "平足意味着足弓塌陷,脚掌更平地接触地面。平足球员通常需要更强的稳定性和足弓支撑。",
  "height (cm)": "身高 (厘米)",
  "weight (kg)": "体重 (公斤)",
  "cm": "厘米",
  "kg": "公斤",
  "skill": "水平",
  "not set": "未设置",
  "player profile": "球员档案",
  "pick 3 in order (optional)": "按顺序选 3 个(可选)",
  "pick exactly 3 playstyle dimensions in order, or none.": "请按顺序选 3 个打法,或全部不选。",
  "set your position, skill, height, weight, and playstyle here. we use these to recommend shoes.":
    "在这里设置你的位置、水平、身高、体重和打法。我们用这些信息来推荐球鞋。",
  "clear profile": "清除档案",

  // Avatar pose labels + shuffle button
  "change move": "换个动作",
  "idle": "待机",
  "ready stance": "准备姿势",
  "tip-toe stretch": "踮脚伸展",
  "catching breath": "稍歇片刻",
  "arms crossed": "抱臂",
  "set shot": "站定投篮",
  "jump shot": "跳投",
  "fadeaway": "后仰跳投",
  "floater": "抛投",
  "free throw": "罚球",
  "three-pointer": "三分球",
  "low dribble": "低位运球",
  "high dribble": "高位运球",
  "crossover": "变向运球",
  "between the legs": "胯下运球",
  "behind-the-back": "背后运球",
  "chest pass": "胸前传球",
  "bounce pass": "击地传球",
  "overhead pass": "头顶传球",
  "defending": "防守姿势",
  "block": "盖帽",
  "reach for steal": "抢断伸手",
  "box out": "卡位",
  "layup": "上篮",
  "reverse layup": "反手上篮",
  "dunk": "扣篮",
  "curry · night-night": "Curry · 晚安",
  "curry · shimmy": "Curry · 抖肩",
  "curry · three fingers": "Curry · 三指庆祝",
  "harden · stir the pot": "Harden · 搅锅",
  "harden · sprinkle salt": "Harden · 撒盐",
  "lebron · silencer": "LeBron · 噤声",
  "lebron · crown": "LeBron · 加冕",
  "lebron · king walk": "LeBron · 霸王步",
  "mj · shrug": "MJ · 耸肩",
  "iverson · step-over": "Iverson · 跨越",
  "iverson · low crossover": "Iverson · 低位变向",
  "dirk · one-foot fade": "Dirk · 单脚后仰",
  "wave": "招手",
  "thumbs up": "点赞",
  "peace": "比耶",
  "heart hands": "比心",
  "bow": "鞠躬",
  "clap": "鼓掌",
  "jump for joy": "跳跃庆祝",
  "point up": "指天",
  "coaching": "教练指挥",
  "fist pump": "振臂",
  "flex": "秀肌肉",
  "arms wide": "张开双臂",


  // Match reasons
  "great for guards": "适合后卫",
  "great for wings": "适合锋线",
  "great for bigs": "适合内线",
  "stable for flat-footed players": "平足球员稳定性好",
  "forgiving for beginners": "对初学者友好",
  "responsive for advanced players": "进阶球员响应迅速",
  "lightweight for your build": "适合你身材的轻量化",
  "supportive for heavier players": "给重体型球员的支撑",
  "low-profile for shorter players": "适合矮身材的低帮",
  "containment for taller players": "给高身材的包裹",

  // Branding update
  "sneakers scored to your game. sign in to get started.": "为你的打法打分的球鞋。登录开始体验。",
  "personalized basketball sneaker recommendations. let me show you around in under a minute.":
    "个性化篮球鞋推荐。一分钟内带你逛一圈。",
  "recommendations": "推荐",

  // Tutorial copy updates
  "filter by tech, keywords, and structured fields when the homepage feed isn't enough.":
    "当主页瀑布流不够用时,可以按技术、关键词和结构化字段过滤。",
  "sneaker database — built around you": "球鞋信息库 —— 为你而建",
  "live counts and what we cover. below the fold you'll see shoes ranked for your player profile.":
    "实时数量与覆盖范围。下方就是为你的球员档案排序的球鞋列表。",
  "every shoe scored against your player profile. tap a card to open the full spec sheet.":
    "每双鞋都根据你的档案评分。点卡片即可打开完整规格页。",
  "type a model, player, or tech keyword. filter by brand from the toolbar.":
    "输入型号、球员或技术关键词。在工具栏按品牌过滤。",

  // Tutorial new steps
  "this little figure represents you. tap it to set your position, skill level, height and weight so we can score every shoe for you.":
    "这个小人代表你。点它设置你的位置、水平、身高和体重,我们会据此为你打分每双鞋。",
  "browse all or personalized": "浏览全部或个性化",
  "flip between personalized recommendations and the unfiltered database any time.":
    "随时在个性化推荐和完整数据库之间切换。",

  // Card / search misc
  "search shoes…": "搜索球鞋…",

  // Smart Picker (AI recommendation chat)
  "smart picker": "智能选鞋",
  "picker": "选鞋",
  "under development": "正在开发中",
  "smart picker is under development. stay tuned.": "智能选鞋功能正在开发中，敬请期待。",
  "recharge credits": "充值额度",
  "balance": "余额",
  "credits": "次",
  "1 credit = 1 recommended shoe. asking ai for 10 shoes at once costs 10 credits. please choose the number before sending.":
    "1 次 = 推荐 1 双球鞋。一次让 AI 推荐 10 双即扣 10 次。发送前请先选择本次推荐数量。",
  "complete payment (trial)": "完成支付（试用）",
  "added": "已到账",
  "payment integration is in progress; this is a trial — credits are granted instantly.":
    "收款功能开发中，当前为试用：点击即直接到账。",
  "view details": "查看详情",
  "pick up to 5 to compare": "最多选 5 双对比",
  "compare selected": "对比所选",
  "describe what you're looking for (e.g. responsive cushioning for a guard)…":
    "描述你想要的球鞋（例如：后卫用、软弹缓震）…",
  "ai picks": "AI 精选",
  "ai shoe recommendations from our database": "来自数据库的 AI 球鞋推荐",
  "recommend": "推荐",
  "decrease": "减少",
  "increase": "增加",
  "send": "发送",
  "insufficient balance": "余额不足",
  "go recharge": "去充值",
  "this will use": "本次消耗",
  "conversations": "对话",
  "find your next pair": "找到你的下一双",
  "tell me your playstyle, position, and the feel you want — i'll recommend shoes from our database.":
    "告诉我你的打法、位置和想要的脚感，我会从数据库里为你推荐球鞋。",
  "ai is thinking…": "AI 思考中…",
  "new chat": "新建对话",
  "close": "关闭",
  "no conversations yet.": "还没有对话。",
  "today": "今天",
  "yesterday": "昨天",
  "earlier": "更早",
  "new conversation": "新对话",
  "download report": "下载报告",
  "pros": "优点",
  "cons": "缺点",
  "recommendation": "推荐指数",
  "request": "本次需求",
  "recommendation report": "智能选鞋推荐报告",
  "more": "更多",
  "rename": "重命名",
  "delete this conversation?": "删除该对话？",
  "buy": "购买",
  "back to packages": "返回套餐",
  "cancel & start over": "取消并重新选择",
  "choose a payment method:": "选择支付方式：",
  "wechat pay": "微信支付",
  "alipay": "支付宝",
  "please pay exactly this amount": "请支付以下金额",
  "expires in": "剩余",
  "expired": "已过期",
  "required remark (must fill in!)": "支付备注（务必填写！）",
  "copied": "已复制",
  "copy": "复制",
  "must fill in this code as the payment remark. if you forget, your credits will be refunded.": "支付时务必务必把这个 6 位数验证码填到「备注/留言」里。如果忘填，您的款项将被退回，不会发放额度。",
  "honest trading reminder": "诚信交易提醒",
  "please trade honestly. once purchased, no refunds and no exchanges.": "请诚信交易，一旦购买不退不换。",
  "step 3 — upload bill-detail screenshot": "第三步 — 上传账单详情截图",
  "principle: the screenshot must contain both the amount and the verification code.": "原则：截图中必须同时包含「金额」和「6 位验证码」。",
  "after paying, do not upload the payment-success screen. open the bill detail (账单详情) — the page that shows your remark — and upload that screenshot.": "付款成功后，请不要上传「支付成功」那张截图。打开「微信支付凭证 → 查看账单详情」（即显示您留言的那一页），并上传该页截图。",
  "show example": "查看示意图",
  "bill detail screenshot example": "账单详情截图示意",
  "upload screenshot": "上传截图",
  "uploading & verifying…": "正在上传并识别…",
  "note: one screenshot per order. choose carefully.": "提示：每个订单仅可上传一次截图，请确认无误后再提交。",
  "payment verified — credits added!": "支付已验证 — 额度已发放！",
  "new balance": "新余额",
  "start picking": "开始选鞋",
  "submitted — awaiting manual review": "已提交 — 等待人工审核",
  "amount could not be read. we will review it manually.": "未能识别金额，将转入人工审核。",
  "verification code could not be read. we will review it manually.": "未能识别验证码，将转入人工审核。",
  "ocr service was unavailable. we will review it manually.": "OCR 服务暂时不可用，将转入人工审核。",
  "we could not auto-verify your screenshot. we will review it manually.": "无法自动核对该截图，已转入人工审核。",
  "if you forgot the remark, please contact support directly to avoid your payment being refunded.": "如果您忘填备注，请尽快直接联系客服，避免款项被退回。",
  "for appeals, please add wechat:": "如需申诉，请添加微信：",
  "copy support wechat id": "复制客服微信号",
  "claim daily bonus": "领取每日奖励",
  "next daily bonus in": "下次签到剩余",
  "got it": "知道了",
  "submission failed": "提交失败",
  "try again": "重试",
  "failed to create payment order.": "创建支付订单失败。",
  "network error. please retry.": "网络异常，请重试。",
  "upload failed.": "上传失败。"
};

export const MANUAL_TRANSLATIONS: Record<string, string> = {
  "shoe indexed": "双鞋子",
  "shoes indexed": "双鞋子",
  "brand represented": "品牌",
  "brands represented": "品牌",
  "live": "实时",
  "dashboard": "我的账号",
  "home": "主页",
  "player": "球员",
  "search by name, player, tags, technologies...": "按名称、球员、标签、技术搜索……",
  "loading": "加载中…",
  "loading...": "加载中…",
  "preparing your feed": "加载中…",
  "forefoot_midsole_tech": "前掌中底科技",
  "heel_midsole_tech": "后掌中底科技",
  "outsole_tech": "外底科技",
  "upper_tech": "鞋面科技",
  "forefoot tech": "前掌中底科技",
  "heel tech": "后掌中底科技",
  "upper tech": "鞋面科技",
  "cushioning": "泡棉舒适度",
  "traction": "抓地力/止滑程度",
  "stability": "稳定性",
  "fit": "包裹",
  "admin": "管理员",
  "curry": "库里",
};

type LocaleContextValue = {
  locale: Locale;
  requestLocaleChange: (locale: Locale) => void;
  translate: (text: string) => string;
  translateDynamic: (text: string) => Promise<string>;
  getRankLabel: (rank: number) => string;
  isTranslating: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function normalizeKey(text: string) {
  return text.trim().toLowerCase();
}

/**
 * Reserved for keys we never want translated even if they show up in
 * dynamic content (e.g. brand-locked phrases). Tech-area labels used to
 * live here; they were moved out so static `translate()` can hand back
 * proper Chinese labels. Value-side protection is now done explicitly by
 * the components that render forefoot/heel midsole tech (compare card,
 * compare spec table) using `skipDynamic`/`protectValue` flags.
 */
const PROTECTED_NO_TRANSLATE_KEYS = new Set<string>([]);

function shouldSkipDynamicTranslation(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (normalizeKey(trimmed) === "snkrfeature") return true;
  if (PROTECTED_NO_TRANSLATE_KEYS.has(normalizeKey(trimmed))) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
  return false;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return saved === "zh" || saved === "en" ? saved : "en";
  });
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationCache, setTranslationCache] = useState<Record<string, string>>({});

  const translate = useCallback(
    (text: string) => {
      if (locale === "en") return text;

      const normalized = normalizeKey(text);

      if (normalizeKey(text) === "snkrfeature") return "snkrfeature";
      if (PROTECTED_NO_TRANSLATE_KEYS.has(normalized)) return text;

      if (MANUAL_TRANSLATIONS[normalized]) return MANUAL_TRANSLATIONS[normalized];

      if (UI_TRANSLATIONS_ZH[normalized]) return UI_TRANSLATIONS_ZH[normalized];

      if (translationCache[text]) return translationCache[text];

      return text;
    },
    [locale, translationCache]
  );

  const translateDynamic = useCallback(
    async (text: string) => {
      if (locale === "en" || shouldSkipDynamicTranslation(text)) {
        if (isI18nDebugEnabled) {
          console.debug("[i18n/locale-provider] translateDynamic skipped", {
            text,
            locale,
            reason: locale === "en" ? "locale_en" : "protected_or_invalid"
          });
        }
        return text;
      }

      const normalized = normalizeKey(text);

      if (MANUAL_TRANSLATIONS[normalized]) return MANUAL_TRANSLATIONS[normalized];
      if (translationCache[text]) {
        if (isI18nDebugEnabled) {
          console.debug("[i18n/locale-provider] translateDynamic cache hit", { text, value: translationCache[text] });
        }
        return translationCache[text];
      }

      try {
        if (isI18nDebugEnabled) {
          console.debug("[i18n/locale-provider] translateDynamic request", { text, target: "zh" });
        }
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, target: "zh" })
        });

        if (!response.ok) return text;

        const payload = (await response.json()) as { translatedText?: string };
        const value = payload.translatedText?.trim() || text;

        if (isI18nDebugEnabled) {
          console.debug("[i18n/locale-provider] translateDynamic response", { text, value });
        }

        setTranslationCache((prev) => ({ ...prev, [text]: value }));
        return value;
      } catch (error) {
        console.error("[i18n] translateDynamic failed", { text, error });
        return text;
      }
    },
    [locale, translationCache]
  );

  const requestLocaleChange = useCallback(
    (next: Locale) => {
      if (next === locale) return;

      if (next === "zh") {
        setPendingLocale(next);
        setWarningOpen(true);
        return;
      }

      setWarningOpen(false);
      setPendingLocale(null);
      setIsTranslating(false);
      setLocale("en");
      window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    },
    [locale]
  );

  const confirmWarning = useCallback(() => {
    if (!pendingLocale) return;

    setWarningOpen(false);
    setPendingLocale(null);
    setIsTranslating(true);

    setLocale(pendingLocale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, pendingLocale);

    window.setTimeout(() => {
      setIsTranslating(false);
    }, SWITCH_OVERLAY_MS);
  }, [pendingLocale]);

  const getRankLabel = useCallback(
    (rank: number) => {
      const safeRank = Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : 1;
      if (locale === "zh") return `第${safeRank}名`;
      return `No.${safeRank}`;
    },
    [locale]
  );

  const contextValue = useMemo<LocaleContextValue>(
    () => ({
      locale,
      requestLocaleChange,
      translate,
      translateDynamic,
      getRankLabel,
      isTranslating
    }),
    [getRankLabel, isTranslating, locale, requestLocaleChange, translate, translateDynamic]
  );

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}

      <Modal
        open={warningOpen}
        onClose={() => undefined}
        title=""
        dismissible={false}
        zIndexClass="z-[80]"
      >
        <div className="space-y-4">
          <p className="text-sm">
            {translate("Machine translation may contain some inaccuracies. Thank you for your understanding. Loading may also take a little time.")}
          </p>
          <button
            type="button"
            onClick={confirmWarning}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[rgb(var(--accent)/0.55)] bg-[rgb(var(--accent)/0.12)] text-sm font-medium text-[rgb(var(--text))] transition hover:bg-[rgb(var(--accent)/0.18)]"
          >
            {translate("Continue")}
          </button>
        </div>
      </Modal>
      {isTranslating ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(var(--bg)/0.78)] backdrop-blur-sm" aria-live="polite" aria-busy="true">
          <SneakerLoader label={translate("Translating...")} />
        </div>
      ) : null}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
