import type { Locale } from "@/components/i18n/locale-provider";

/**
 * Hand-authored bilingual legal content.
 *
 * Why a plain data module instead of the i18n `translate()` / `translateDynamic`
 * helpers: `translate()` is an English-keyed dictionary meant for short UI labels,
 * and `translateDynamic` routes through a free machine-translation API (chunked,
 * rate-limited, and explicitly flagged "may be inaccurate"). Neither is acceptable
 * for legally operative prose. Instead each document is authored in full in both
 * languages and selected with `doc[locale]` inside <LegalPageLayout>, so the text
 * is version-controlled and switches instantly with the existing language toggle.
 *
 * NOTE: These are plain-language templates that reflect how the app actually works.
 * They are not legal advice; have them reviewed by a lawyer before relying on them.
 * Placeholders to replace before launch: [Jurisdiction].
 */

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  intro?: string[];
  sections: LegalSection[];
  contactNote: string;
  contactEmail: string;
};

export type BilingualLegalDoc = Record<Locale, LegalDoc>;

export const CONTACT_EMAIL = "zach@snkrfeature.com";

/* ------------------------------------------------------------------ */
/* Terms of Use                                                        */
/* ------------------------------------------------------------------ */

export const TERMS: BilingualLegalDoc = {
  en: {
    eyebrow: "Legal · Terms of Use",
    title: "Terms of Use",
    lastUpdated: "Last updated May 30, 2026",
    intro: [
      `These Terms of Use ("Terms") govern your access to and use of sneakerfeature (the "Service"), an independent basketball-sneaker information and community platform operated by sneakerfeature ("we", "us", or "our"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, please do not use the Service.`,
    ],
    sections: [
      {
        id: "acceptance",
        heading: "1. Acceptance & Eligibility",
        paragraphs: [
          `By creating an account or otherwise using the Service, you confirm that you are able to form a binding agreement with us and that you will comply with these Terms and all applicable laws.`,
          `The Service is run by an independent creator for a general audience interested in basketball footwear. If you are a minor in your jurisdiction, you may use the Service only with the involvement and consent of a parent or guardian.`,
        ],
      },
      {
        id: "service",
        heading: "2. The Service",
        paragraphs: [
          `sneakerfeature provides basketball-sneaker specifications, comparisons, community reviews and ratings, and an AI-assisted recommendation tool ("Smart Picker"). Much of the underlying data is contributed by the community or generated and enriched with automated tools, then reviewed by human moderators.`,
          `All information is provided for general informational purposes only and on an "as is" basis. It is not professional, fitting, medical, or purchasing advice and may contain errors, omissions, or out-of-date details. Always verify important details with the relevant brand or an authorized retailer before making a purchase.`,
        ],
      },
      {
        id: "accounts",
        heading: "3. Accounts & Registration",
        paragraphs: [
          `Some features require an account. When you register we collect a username, email address, and password (passwords are stored only in hashed form by our authentication provider). You agree to provide accurate information and to keep it up to date.`,
          `You are responsible for keeping your credentials confidential and for all activity that happens under your account. Notify us promptly at ${CONTACT_EMAIL} if you suspect unauthorized use.`,
        ],
      },
      {
        id: "acceptable-use",
        heading: "4. Acceptable Use & Community Guidelines",
        paragraphs: [
          `Use the Service lawfully and respectfully. Honest opinions about products are welcome — you can say a shoe is bad — but personal attacks are not. You agree not to:`,
        ],
        bullets: [
          `harass, threaten, defame, or post content that attacks other people;`,
          `post unlawful, hateful, sexually explicit, or deceptive content;`,
          `upload content that infringes others' intellectual-property or privacy rights;`,
          `spam, manipulate ratings, scrape the Service, or attempt to disrupt it or gain unauthorized access;`,
          `misuse the AI tools to generate harmful, illegal, or abusive content.`,
        ],
      },
      {
        id: "user-content",
        heading: "5. User-Generated Content",
        paragraphs: [
          `The Service lets you submit content such as comments, ratings, and sneaker-data submissions ("User Content"). You keep ownership of your User Content, but you grant sneakerfeature a worldwide, non-exclusive, royalty-free, sublicensable license to host, store, reproduce, adapt, publish, and display that content for the purpose of operating and promoting the Service.`,
          `You represent that you own or have the necessary rights to your User Content and that it does not violate these Terms or any law. We may review, edit, normalize, moderate, reject, or remove submissions and other User Content at our discretion — including before publication — and we may suspend accounts that repeatedly break these Terms.`,
        ],
      },
      {
        id: "ai",
        heading: "6. AI Smart Picker",
        paragraphs: [
          `The Smart Picker generates basketball-shoe recommendations using third-party AI providers, and using it consumes credits (see below). To produce recommendations, your inputs — and, where relevant, your athlete profile and account context — are sent to third-party AI services for processing, as described in our Privacy Policy.`,
          `AI output is generated automatically, may be inaccurate or incomplete, and is not professional advice. You are responsible for how you use it and should independently verify anything important before relying on it.`,
        ],
      },
      {
        id: "credits",
        heading: "7. Credits, Virtual Items & Payments",
        paragraphs: [
          `Certain features (such as AI recommendations) consume credits. Credits may be granted through actions such as a daily check-in or, in the future, obtained through paid options. Credits have no cash value, are not transferable, and cannot be exchanged or redeemed for money.`,
          `Except where required by law, purchased credits and virtual items are non-refundable and non-exchangeable once provided. We may change, add, or remove credit rules, pricing, and features at any time — including introducing fees such as a possible one-time account fee — with notice where required.`,
        ],
      },
      {
        id: "ip",
        heading: "8. Intellectual Property",
        paragraphs: [
          `The Service — including its layout, original text, design, and the selection and arrangement of content — is owned by sneakerfeature or its licensors and is protected by applicable laws. Third-party brand names, trademarks, logos, and product images belong to their respective owners and are used for identification and commentary only; see our Brand & IP Disclaimer.`,
          `Except for your own User Content and uses expressly permitted by these Terms, you may not copy, reproduce, or redistribute the Service's content without permission.`,
        ],
      },
      {
        id: "third-parties",
        heading: "9. Third-Party Services & Links",
        paragraphs: [
          `The Service relies on third-party providers (for example hosting, databases, AI processing, search, analytics, image sourcing, OCR, and anti-abuse verification) and may contain links to third-party websites. We do not control those third parties, and their own terms and privacy practices apply to your use of their services.`,
        ],
      },
      {
        id: "disclaimers",
        heading: "10. Disclaimers",
        paragraphs: [
          `The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, accuracy, and non-infringement. We do not warrant that the Service will be uninterrupted or error-free or that information will be accurate or complete.`,
        ],
      },
      {
        id: "liability",
        heading: "11. Limitation of Liability",
        paragraphs: [
          `To the maximum extent permitted by law, sneakerfeature and its operator will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, profits, or goodwill, arising from your use of (or inability to use) the Service. Nothing in these Terms limits liability that cannot be limited under applicable law.`,
        ],
      },
      {
        id: "indemnification",
        heading: "12. Indemnification",
        paragraphs: [
          `You agree to indemnify and hold harmless sneakerfeature and its operator from claims, damages, and expenses (including reasonable legal fees) arising out of your User Content, your use of the Service, or your violation of these Terms or any law or third-party right.`,
        ],
      },
      {
        id: "termination",
        heading: "13. Suspension & Termination",
        paragraphs: [
          `We may suspend or terminate your access to the Service at any time, with or without notice, if you violate these Terms or to protect the Service or other users. You may stop using the Service and request deletion of your account at any time by contacting us.`,
        ],
      },
      {
        id: "changes",
        heading: "14. Changes & Governing Law",
        paragraphs: [
          `We may update these Terms from time to time. We will reflect changes by updating the "Last updated" date, and your continued use of the Service after changes take effect means you accept them.`,
          `These Terms are governed by the laws of [Jurisdiction], without regard to conflict-of-laws rules. If any provision is found unenforceable, the remaining provisions stay in effect.`,
        ],
      },
    ],
    contactNote: "Questions about these Terms? Contact us at",
    contactEmail: CONTACT_EMAIL,
  },
  zh: {
    eyebrow: "法律 · 服务条款",
    title: "服务条款",
    lastUpdated: "最后更新于 2026 年 5 月 30 日",
    intro: [
      `本《服务条款》（以下简称"条款"）适用于你对 sneakerfeature（以下简称"本服务"）的访问与使用。本服务是由 sneakerfeature（以下简称"我们"）运营的独立篮球鞋信息与社区平台。访问或使用本服务，即表示你同意接受本条款约束。如不同意，请勿使用本服务。`,
    ],
    sections: [
      {
        id: "acceptance",
        heading: "1. 接受条款与使用资格",
        paragraphs: [
          `注册账号或以其他方式使用本服务，即表示你确认有能力与我们订立具有约束力的协议，并将遵守本条款及所有适用法律。`,
          `本服务由独立创作者运营，面向对篮球鞋感兴趣的一般用户。若你在所在地区属于未成年人，仅可在父母或监护人参与并同意的情况下使用本服务。`,
        ],
      },
      {
        id: "service",
        heading: "2. 关于本服务",
        paragraphs: [
          `sneakerfeature 提供篮球鞋参数、对比、社区评测与评分，以及一个 AI 辅助推荐工具（"智能选鞋 / Smart Picker"）。其中大量基础数据由社区贡献，或借助自动化工具生成与补充，并经人工审核。`,
          `所有信息仅供一般参考，并以"现状"提供，不构成专业、试穿、医疗或购买建议，且可能存在错误、遗漏或过时之处。在购买前，请务必向相关品牌或授权零售商核实重要信息。`,
        ],
      },
      {
        id: "accounts",
        heading: "3. 账户与注册",
        paragraphs: [
          `部分功能需要账号。注册时我们会收集用户名、电子邮箱和密码（密码仅以哈希形式由我们的身份验证服务商存储）。你同意提供真实信息并保持更新。`,
          `你有责任对账户凭据保密，并对你账户下发生的所有活动负责。如怀疑账户被盗用，请立即通过 ${CONTACT_EMAIL} 通知我们。`,
        ],
      },
      {
        id: "acceptable-use",
        heading: "4. 可接受使用与社区准则",
        paragraphs: [
          `请合法、文明地使用本服务。我们欢迎对产品的真实评价——你可以说一双鞋很糟——但不接受人身攻击。你同意不得：`,
        ],
        bullets: [
          `骚扰、威胁、诽谤他人，或发布攻击他人的内容；`,
          `发布违法、仇恨、色情或具有欺骗性的内容；`,
          `上传侵犯他人知识产权或隐私权的内容；`,
          `发送垃圾信息、操纵评分、抓取本服务，或试图干扰本服务、获取未授权访问；`,
          `滥用 AI 工具生成有害、违法或辱骂性内容。`,
        ],
      },
      {
        id: "user-content",
        heading: "5. 用户生成内容",
        paragraphs: [
          `本服务允许你提交评论、评分、球鞋数据投稿等内容（"用户内容"）。你保留对用户内容的所有权，但你授予 sneakerfeature 一项全球范围、非独占、免版税、可转授的许可，用于为运营和推广本服务之目的而托管、存储、复制、改编、发布和展示该等内容。`,
          `你声明你拥有用户内容或拥有发布所需的相应权利，且其不违反本条款或任何法律。我们可自行决定对投稿及其他用户内容进行审核、编辑、规整、过滤、拒绝或删除（包括在发布前），并可对反复违反本条款的账户予以封禁。`,
        ],
      },
      {
        id: "ai",
        heading: "6. AI 智能选鞋",
        paragraphs: [
          `智能选鞋借助第三方 AI 服务商生成篮球鞋推荐，使用时会消耗积分（见下文）。为生成推荐，你的输入内容——以及在相关情况下你的球员档案和账户上下文——会被发送给第三方 AI 服务进行处理，详见我们的《隐私政策》。`,
          `AI 输出由系统自动生成，可能不准确或不完整，且不构成专业建议。你需对如何使用这些输出负责，并在依赖任何重要信息前自行核实。`,
        ],
      },
      {
        id: "credits",
        heading: "7. 积分、虚拟物品与付费",
        paragraphs: [
          `部分功能（如 AI 推荐）会消耗积分。积分可通过每日签到等方式获得，未来也可能通过付费方式获取。积分不具有现金价值，不可转让，亦不可兑换或赎回为现金。`,
          `除法律另有要求外，已购买的积分和虚拟物品一经提供即不可退款、不可兑换。我们可随时变更、新增或取消积分规则、定价与功能——包括引入诸如一次性账户费等收费——并在法律要求时事先通知。`,
        ],
      },
      {
        id: "ip",
        heading: "8. 知识产权",
        paragraphs: [
          `本服务——包括其版式、原创文字、设计，以及内容的选择与编排——归 sneakerfeature 或其许可方所有，受适用法律保护。第三方的品牌名称、商标、标识和产品图片归各自所有者所有，仅用于识别与评述；详见我们的《品牌与知识产权免责声明》。`,
          `除你自己的用户内容，以及本条款明确允许的使用外，未经许可你不得复制、再现或再分发本服务的内容。`,
        ],
      },
      {
        id: "third-parties",
        heading: "9. 第三方服务与链接",
        paragraphs: [
          `本服务依赖第三方服务商（例如托管、数据库、AI 处理、搜索、分析、图片来源获取、OCR 和反滥用验证），并可能包含指向第三方网站的链接。我们无法控制这些第三方，你对其服务的使用适用其自身的条款与隐私政策。`,
        ],
      },
      {
        id: "disclaimers",
        heading: "10. 免责声明",
        paragraphs: [
          `本服务以"现状"和"现有"提供，不附带任何明示或默示的保证，包括适销性、特定用途适用性、准确性和不侵权。我们不保证本服务不中断、无错误，也不保证信息准确或完整。`,
        ],
      },
      {
        id: "liability",
        heading: "11. 责任限制",
        paragraphs: [
          `在法律允许的最大范围内，对于因你使用（或无法使用）本服务而产生的任何间接、附带、特殊、后果性或惩罚性损害，或任何数据、利润或商誉损失，sneakerfeature 及其运营者概不负责。本条款中的任何内容均不限制依适用法律不可限制的责任。`,
        ],
      },
      {
        id: "indemnification",
        heading: "12. 赔偿",
        paragraphs: [
          `对于因你的用户内容、你对本服务的使用，或你违反本条款、任何法律或第三方权利而引起的索赔、损害和费用（包括合理的律师费），你同意向 sneakerfeature 及其运营者作出赔偿并使其免受损害。`,
        ],
      },
      {
        id: "termination",
        heading: "13. 暂停与终止",
        paragraphs: [
          `如你违反本条款，或为保护本服务或其他用户，我们可随时（无论是否通知）暂停或终止你对本服务的访问。你也可随时停止使用本服务，并通过联系我们申请删除账户。`,
        ],
      },
      {
        id: "changes",
        heading: "14. 条款变更与适用法律",
        paragraphs: [
          `我们可不时更新本条款。变更将通过更新"最后更新"日期体现；在变更生效后你继续使用本服务，即表示接受变更。`,
          `本条款受 [Jurisdiction] 法律管辖，不考虑其法律冲突规则。若任何条款被认定为不可执行，其余条款仍然有效。`,
        ],
      },
    ],
    contactNote: "对本条款有疑问？请联系",
    contactEmail: CONTACT_EMAIL,
  },
};

/* ------------------------------------------------------------------ */
/* Privacy Policy                                                      */
/* ------------------------------------------------------------------ */

export const PRIVACY: BilingualLegalDoc = {
  en: {
    eyebrow: "Legal · Privacy Policy",
    title: "Privacy Policy",
    lastUpdated: "Last updated May 30, 2026",
    intro: [
      `This Privacy Policy explains how sneakerfeature ("we", "us", or "our") collects, uses, and shares information when you use sneakerfeature (the "Service"). By using the Service, you agree to the practices described here.`,
    ],
    sections: [
      {
        id: "who-we-are",
        heading: "1. Who We Are",
        paragraphs: [
          `sneakerfeature is an independent basketball-sneaker information and community platform. For any privacy question or request, contact us at ${CONTACT_EMAIL}.`,
        ],
      },
      {
        id: "info-we-collect",
        heading: "2. Information We Collect",
        paragraphs: [`We collect the following categories of information:`],
        bullets: [
          `Account data: username, email address, and a password (stored only in hashed form by our authentication provider).`,
          `Profile data: your optional athlete profile, including playing positions, skill level, whether you have flat feet, height, and weight, plus your rating-focus preferences.`,
          `User content: comments, ratings, and sneaker-data submissions you provide.`,
          `AI chat data: the messages you send to the Smart Picker and the recommendations returned, stored in your account history.`,
          `Payment-verification data: if you top up credits, screenshots you upload and the information extracted from them by OCR.`,
          `Usage & device data: log data, approximate location / IP address, device and browser information, and analytics about how you use the Service.`,
        ],
      },
      {
        id: "how-we-use",
        heading: "3. How We Use Information",
        paragraphs: [`We use information to:`],
        bullets: [
          `provide, maintain, and improve the Service and personalize recommendations;`,
          `operate the AI Smart Picker and other features;`,
          `moderate user content and enforce our Terms;`,
          `process credits and verify payments;`,
          `perform analytics, ensure security, prevent fraud and abuse, and comply with legal obligations.`,
        ],
      },
      {
        id: "cookies",
        heading: "4. Cookies & Sessions",
        paragraphs: [
          `We use cookies and similar technologies that are necessary to keep you signed in (authentication session cookies from our auth provider) and, where enabled, analytics cookies. Your language preference is stored locally in your browser. You can control cookies through your browser settings, but some features may not work without essential cookies.`,
        ],
      },
      {
        id: "third-parties",
        heading: "5. Third-Party Service Providers",
        paragraphs: [
          `We rely on the following third-party providers, who process certain data on our behalf or as independent controllers. Data sent to AI providers may include your prompt and, where relevant, profile and account context; AI output may be inaccurate.`,
        ],
        bullets: [
          `Supabase — database, authentication, and file/image storage (hosting your account and content data).`,
          `Packy API (running Anthropic Claude) — AI inference for the Smart Picker.`,
          `Bocha (博查) — web search used to support AI answers.`,
          `OpenAI — normalization of sneaker-data submissions.`,
          `Cloudflare Turnstile — human verification (CAPTCHA), which processes your IP address.`,
          `OCR.space — text extraction from payment-verification screenshots you upload.`,
          `SerpAPI — used server-side to source publicly available product images.`,
          `Vercel Analytics & Speed Insights, and (where enabled) Google Analytics/Ads — usage and performance analytics.`,
        ],
      },
      {
        id: "ai-data",
        heading: "6. AI Chat Data",
        paragraphs: [
          `When you use the Smart Picker, your messages and the AI's responses are stored as part of your chat history so you can refer back to them, and your inputs are transmitted to the AI providers listed above for processing. You can delete chat sessions from your account, which removes the associated messages.`,
        ],
      },
      {
        id: "sharing",
        heading: "7. How We Share Information",
        paragraphs: [
          `We do not sell your personal information. We share information with the service providers above to operate the Service, and we may disclose information where required by law, to enforce our Terms, or to protect the rights, safety, and security of our users, the public, or the Service. Public content you post — such as your username, comments, and ratings — is visible to others.`,
        ],
      },
      {
        id: "transfers",
        heading: "8. International Data Transfers",
        paragraphs: [
          `Our providers may process and store information in countries other than your own. Where required, we rely on appropriate safeguards for such transfers. By using the Service, you understand that your information may be processed outside your country of residence.`,
        ],
      },
      {
        id: "retention",
        heading: "9. Data Retention",
        paragraphs: [
          `We keep personal information for as long as your account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements. You can request deletion of your account and associated data as described below.`,
        ],
      },
      {
        id: "security",
        heading: "10. Security",
        paragraphs: [
          `We use reasonable technical and organizational measures to protect your information, including hashed password storage and access controls. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.`,
        ],
      },
      {
        id: "your-rights",
        heading: "11. Your Rights",
        paragraphs: [
          `Depending on where you live, you may have rights under laws such as the GDPR (EU/UK), CCPA/CPRA (California), and PIPL (China), including the right to:`,
        ],
        bullets: [
          `access, correct, or delete your personal information;`,
          `obtain a copy of, or port, your data;`,
          `object to or restrict certain processing;`,
          `withdraw consent where processing is based on consent; and`,
          `not be discriminated against for exercising your rights.`,
        ],
      },
      {
        id: "children",
        heading: "12. Children's Privacy",
        paragraphs: [
          `The Service is not directed to children, and we do not knowingly collect personal information from children under the age required by your local law (for example, 13, or higher where applicable). If you believe a child has provided us with personal information, contact us and we will take appropriate steps to delete it.`,
        ],
      },
      {
        id: "changes",
        heading: "13. Changes to This Policy",
        paragraphs: [
          `We may update this Privacy Policy from time to time. We will indicate changes by updating the "Last updated" date, and significant changes may be highlighted within the Service.`,
        ],
      },
    ],
    contactNote: "Questions or requests about your privacy? Contact us at",
    contactEmail: CONTACT_EMAIL,
  },
  zh: {
    eyebrow: "法律 · 隐私政策",
    title: "隐私政策",
    lastUpdated: "最后更新于 2026 年 5 月 30 日",
    intro: [
      `本《隐私政策》说明当你使用 sneakerfeature（以下简称"本服务"）时，sneakerfeature（以下简称"我们"）如何收集、使用和共享信息。使用本服务，即表示你同意此处所述的做法。`,
    ],
    sections: [
      {
        id: "who-we-are",
        heading: "1. 我们是谁",
        paragraphs: [
          `sneakerfeature 是一个独立的篮球鞋信息与社区平台。如有任何隐私方面的疑问或请求，请通过 ${CONTACT_EMAIL} 联系我们。`,
        ],
      },
      {
        id: "info-we-collect",
        heading: "2. 我们收集的信息",
        paragraphs: [`我们收集以下类别的信息：`],
        bullets: [
          `账户信息：用户名、电子邮箱和密码（密码仅以哈希形式由我们的身份验证服务商存储）。`,
          `档案信息：你可选填写的球员档案，包括司职位置、水平、是否扁平足、身高和体重，以及你的评分偏好。`,
          `用户内容：你提供的评论、评分和球鞋数据投稿。`,
          `AI 聊天数据：你发送给智能选鞋的消息及其返回的推荐，存储于你的账户历史记录中。`,
          `支付验证数据：如你为积分充值，你上传的截图以及通过 OCR 从中提取的信息。`,
          `使用与设备数据：日志数据、大致位置 / IP 地址、设备和浏览器信息，以及关于你如何使用本服务的分析数据。`,
        ],
      },
      {
        id: "how-we-use",
        heading: "3. 我们如何使用信息",
        paragraphs: [`我们使用信息用于：`],
        bullets: [
          `提供、维护和改进本服务，并个性化推荐；`,
          `运行 AI 智能选鞋及其他功能；`,
          `审核用户内容并执行我们的条款；`,
          `处理积分并验证支付；`,
          `进行分析、保障安全、防范欺诈与滥用，并遵守法律义务。`,
        ],
      },
      {
        id: "cookies",
        heading: "4. Cookie 与会话",
        paragraphs: [
          `我们使用为保持登录所必需的 Cookie 及类似技术（来自身份验证服务商的会话 Cookie），并在启用时使用分析类 Cookie。你的语言偏好保存在你浏览器的本地存储中。你可以通过浏览器设置管理 Cookie，但若禁用必要 Cookie，部分功能可能无法正常使用。`,
        ],
      },
      {
        id: "third-parties",
        heading: "5. 第三方服务商",
        paragraphs: [
          `我们依赖以下第三方服务商，它们代表我们或作为独立控制者处理某些数据。发送给 AI 服务商的数据可能包括你的提问内容，并在相关情况下包括档案和账户上下文；AI 输出可能不准确。`,
        ],
        bullets: [
          `Supabase——数据库、身份验证和文件/图片存储（托管你的账户与内容数据）。`,
          `Packy API（运行 Anthropic Claude）——为智能选鞋提供 AI 推理。`,
          `博查（Bocha）——用于支持 AI 回答的网页搜索。`,
          `OpenAI——对球鞋数据投稿进行规整。`,
          `Cloudflare Turnstile——人机验证（验证码），会处理你的 IP 地址。`,
          `OCR.space——从你上传的支付验证截图中提取文字。`,
          `SerpAPI——在服务端用于获取公开可得的产品图片。`,
          `Vercel Analytics 与 Speed Insights，以及（在启用时）Google Analytics/Ads——使用情况与性能分析。`,
        ],
      },
      {
        id: "ai-data",
        heading: "6. AI 聊天数据",
        paragraphs: [
          `当你使用智能选鞋时，你的消息和 AI 的回复会作为聊天历史存储，便于你日后查阅；同时你的输入会被传输给上述 AI 服务商进行处理。你可以从账户中删除聊天会话，这将一并删除相关消息。`,
        ],
      },
      {
        id: "sharing",
        heading: "7. 我们如何共享信息",
        paragraphs: [
          `我们不出售你的个人信息。我们会与上述服务商共享信息以运营本服务；并可能在法律要求时、为执行我们的条款，或为保护用户、公众或本服务的权利、安全与稳健而披露信息。你公开发布的内容——如用户名、评论和评分——对他人可见。`,
        ],
      },
      {
        id: "transfers",
        heading: "8. 数据的跨境传输",
        paragraphs: [
          `我们的服务商可能在你所在国家/地区以外处理和存储信息。在必要时，我们会就此类传输采取适当的保障措施。使用本服务，即表示你了解你的信息可能在你居住国以外被处理。`,
        ],
      },
      {
        id: "retention",
        heading: "9. 数据保留",
        paragraphs: [
          `在你的账户处于活跃状态期间，或为提供本服务、遵守法律义务、解决争议和执行协议所需的期间内，我们会保留个人信息。你可按下文所述申请删除你的账户及相关数据。`,
        ],
      },
      {
        id: "security",
        heading: "10. 安全",
        paragraphs: [
          `我们采取合理的技术和组织措施来保护你的信息，包括密码哈希存储和访问控制。然而，没有任何传输或存储方式是绝对安全的，我们无法保证绝对的安全性。`,
        ],
      },
      {
        id: "your-rights",
        heading: "11. 你的权利",
        paragraphs: [
          `根据你所在地的不同，你可能依据 GDPR（欧盟/英国）、CCPA/CPRA（加州）和 PIPL（中国）等法律享有相应权利，包括：`,
        ],
        bullets: [
          `访问、更正或删除你的个人信息；`,
          `获取你数据的副本，或进行数据可携转移；`,
          `反对或限制某些处理活动；`,
          `在处理以同意为依据时撤回同意；以及`,
          `不因行使权利而受到歧视性对待。`,
        ],
      },
      {
        id: "children",
        heading: "12. 儿童隐私",
        paragraphs: [
          `本服务并非面向儿童，我们不会在明知的情况下收集低于你所在地法律规定年龄（例如 13 岁，或适用时更高年龄）的儿童的个人信息。如你认为某名儿童向我们提供了个人信息，请联系我们，我们将采取适当措施予以删除。`,
        ],
      },
      {
        id: "changes",
        heading: "13. 本政策的变更",
        paragraphs: [
          `我们可不时更新本《隐私政策》。我们将通过更新"最后更新"日期来标示变更，重大变更可能会在本服务内予以提示。`,
        ],
      },
    ],
    contactNote: "对隐私有疑问或请求？请联系",
    contactEmail: CONTACT_EMAIL,
  },
};

/* ------------------------------------------------------------------ */
/* Brand & IP Disclaimer                                               */
/* ------------------------------------------------------------------ */

export const DISCLAIMER: BilingualLegalDoc = {
  en: {
    eyebrow: "Legal · Brand & IP Disclaimer",
    title: "Brand & IP Disclaimer",
    lastUpdated: "Last updated May 30, 2026",
    intro: [
      `sneakerfeature is an independent, informational fan project. This page explains our relationship (or lack thereof) with the brands featured on the Service and how we handle trademarks and images.`,
    ],
    sections: [
      {
        id: "no-affiliation",
        heading: "1. No Affiliation",
        paragraphs: [
          `sneakerfeature is not affiliated with, endorsed by, sponsored by, or associated with Nike, Jordan, adidas, Anta, Li-Ning, or any other brand, manufacturer, or retailer. All references to brands, teams, players, and products are for identification, comparison, and commentary only.`,
        ],
      },
      {
        id: "trademarks",
        heading: "2. Trademarks & Brand Names",
        paragraphs: [
          `All product names, brand names, trademarks, and registered trademarks are the property of their respective owners. Their use on the Service is nominative — that is, to identify and discuss the products — and does not imply any endorsement, partnership, or sponsorship.`,
        ],
      },
      {
        id: "images",
        heading: "3. Product Images",
        paragraphs: [
          `Product images shown on the Service are sourced from publicly available pages (including brand, retailer, and review sources, gathered via automated search) and may be cached or re-hosted on our content-delivery infrastructure for informational and comparison purposes. We do not claim ownership of these images; they remain the property of their respective owners. We aim to use such material in good faith for non-commercial, informational, and commentary purposes.`,
        ],
      },
      {
        id: "accuracy",
        heading: "4. Accuracy of Information",
        paragraphs: [
          `Specifications, stories, and other details are community-contributed and/or generated with automated tools and human review. They may contain errors and are not official brand data or professional advice. Always confirm important details with the brand or an authorized retailer.`,
        ],
      },
      {
        id: "takedown",
        heading: "5. Takedown & Rights-Holder Requests",
        paragraphs: [
          `We respect intellectual-property rights. If you are a rights holder (or their authorized agent) and believe that an image, name, or other content on the Service infringes your rights or should be corrected or removed, please contact us at ${CONTACT_EMAIL} with details identifying the content and your rights. We will review and respond in good faith and will remove or correct material where appropriate.`,
        ],
      },
      {
        id: "no-commercial",
        heading: "6. No Commercial Association",
        paragraphs: [
          `Nothing on the Service should be read as making us an official source, an authorized reseller, or a commercial partner of any brand. We do not sell the footwear shown on the Service.`,
        ],
      },
    ],
    contactNote: "To submit a takedown request or rights question, email us at",
    contactEmail: CONTACT_EMAIL,
  },
  zh: {
    eyebrow: "法律 · 品牌与知识产权免责声明",
    title: "品牌与知识产权免责声明",
    lastUpdated: "最后更新于 2026 年 5 月 30 日",
    intro: [
      `sneakerfeature 是一个独立的、信息性质的爱好者项目。本页说明我们与本服务中所涉品牌之间的关系（或并不存在的关系），以及我们如何处理商标与图片。`,
    ],
    sections: [
      {
        id: "no-affiliation",
        heading: "1. 无隶属关系",
        paragraphs: [
          `sneakerfeature 与 Nike、Jordan、adidas、Anta（安踏）、Li-Ning（李宁）或任何其他品牌、制造商或零售商均无隶属、背书、赞助或关联关系。所有对品牌、球队、球员和产品的提及，仅用于识别、对比与评述。`,
        ],
      },
      {
        id: "trademarks",
        heading: "2. 商标与品牌名称",
        paragraphs: [
          `所有产品名称、品牌名称、商标和注册商标均归各自所有者所有。它们在本服务中的使用属于指代性使用——即用于识别和讨论相关产品——并不意味着任何背书、合作或赞助。`,
        ],
      },
      {
        id: "images",
        heading: "3. 产品图片",
        paragraphs: [
          `本服务中展示的产品图片来源于公开可得的页面（包括通过自动搜索获取的品牌、零售商和评测来源），并可能为信息与对比之目的而缓存或转存于我们的内容分发设施上。我们不主张对这些图片拥有所有权；其仍归各自所有者所有。我们力求出于非商业的信息与评述目的、本着善意使用此类素材。`,
        ],
      },
      {
        id: "accuracy",
        heading: "4. 信息准确性",
        paragraphs: [
          `参数、故事及其他细节由社区贡献，和/或借助自动化工具生成并经人工审核。它们可能存在错误，且并非官方品牌数据或专业建议。请务必向品牌方或授权零售商确认重要信息。`,
        ],
      },
      {
        id: "takedown",
        heading: "5. 下架与权利人请求",
        paragraphs: [
          `我们尊重知识产权。如你是权利人（或其授权代理人），并认为本服务中的某张图片、某个名称或其他内容侵犯了你的权利，或应予更正或删除，请通过 ${CONTACT_EMAIL} 联系我们，并提供可识别相关内容及你权利的详细信息。我们将本着善意进行审查与回复，并在适当情况下删除或更正相关素材。`,
        ],
      },
      {
        id: "no-commercial",
        heading: "6. 无商业关联",
        paragraphs: [
          `本服务中的任何内容均不应被解读为使我们成为任何品牌的官方来源、授权经销商或商业合作伙伴。我们不销售本服务中展示的鞋款。`,
        ],
      },
    ],
    contactNote: "如需提交下架请求或权利相关问题，请发送邮件至",
    contactEmail: CONTACT_EMAIL,
  },
};
