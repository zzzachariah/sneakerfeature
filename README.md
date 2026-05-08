# 👟 snkrfeature

> A better way to explore, compare, and understand basketball shoes.

---

## 🧠 What Is snkrfeature?

**snkrfeature** is a basketball sneaker information platform designed to **collect, organize, and present detailed sneaker data in one place**.

Instead of jumping across YouTube reviews, blogs, and brand pages, snkrfeature provides a **clear, structured, and unbiased view** of each shoe — helping you make smarter decisions faster.

---

## ❓ Why This Project Exists

Choosing a basketball shoe shouldn’t take hours of scattered research.

Yet:
- Reviews are often **biased or inconsistent**
- Tech names vary across brands and are **hard to compare**
- Information is **fragmented across platforms**

So I built **snkrfeature** — a platform where you can find **everything about one shoe, in one place**.

---

## 🔍 What You Can Find

Each shoe page aims to provide a **complete breakdown**, including:

- 🦶 Forefoot & heel midsole tech  
- 🧱 Outsole technology  
- 🧵 Upper construction  
- 🛑 Traction performance  
- 🛡️ Containment & safety  
- ⚡ Court feel  
- ☁️ Cushioning feel  
- 📖 Background stories  

> Not just opinions — but structured, comparable information.

---

## 📊 A Growing Database

- 📦 **400+ basketball shoes**
- 🗓️ Coverage from **1997 → 2026**
- 🔄 **Continuously updated**

Compare across eras, brands, and design philosophies — all in one place.

---

## 🎯 Clean Design, Powerful Features

snkrfeature focuses on both **aesthetic clarity** and **functional depth**:

- 🧼 Clean, premium UI  
- 🌙 Light & Dark mode  
- 🔎 Advanced search & filters  
  - Brand  
  - Category  
  - Player  
  - Tech keywords  
- 📋 Structured comparison system  

---

## 👥 Community-Oriented

snkrfeature is not just a database — it's a **community platform**.

You can:
- 💬 Comment on any shoe  
- 🧠 Share performance insights  
- ⬆️ Upload sneaker information  

All submissions are reviewed before publishing to maintain quality.

---

## 🚀 The Story Behind It

This idea had been in my mind for over a year.

At first, I gave up — I didn’t know how to code, and AI tools weren’t as developed.  
But as technology improved, I finally had the chance to **turn the idea into reality**.

As a high school student, I’m still learning:
- how to build systems  
- how to design better UX  
- how to grow a real community  

This project is as much about **learning** as it is about **building**.

---

## 🤝 Get Involved

If you want to contribute:

- 💡 Share suggestions  
- 🛠️ Join as a developer  
- 🧑‍⚖️ Help review sneaker submissions  

👉 Use the **Contact** button at the bottom of the site.

---

## ⚠️ Community Guidelines

- ✅ Honest opinions are welcome  
- ❌ Personal attacks are not  

> You can say a shoe is trash — just don’t attack people.

---

## 💡 Future Plans

If the platform grows:

- 💵 Possible **$1 one-time account fee**  
  (to cover database + domain costs)

- 🚫 Minimal ads only  
  (I hate ads too — there won’t be clutter)

---

## 🙌 Final Note

Thanks for being here.

snkrfeature is still early, but the mission is simple:

> Make basketball shoe information  
> **easier to access, compare, and discuss.**

**If that sounds useful to you, then the platform is already doing what it was meant to do.**

---

🌐 **Visit:** https://snkrfeature.com

---

## 💻 Desktop App

snkrfeature also ships as a desktop application for macOS and Windows. The
desktop app mirrors the website experience and stays in sync with snkrfeature.com
automatically.

### Download

Grab the latest installer from the [Releases page](https://github.com/zzzachariah/snkrfeature/releases).

- **macOS** — download the `.dmg`, drag snkrfeature into Applications. On first
  launch, right-click the app → **Open** to bypass the "unidentified developer"
  prompt (the build is currently unsigned; signing is planned).
- **Windows** — download the `.exe` installer. SmartScreen may show a warning
  on first run; click **More info** → **Run anyway**.

The app requires an internet connection.

### Build locally

```bash
cd electron
npm install
npm start          # launch the app pointing at production
```

Set `ELECTRON_DEV=1` to open DevTools, or `SNKRFEATURE_URL=http://localhost:3000`
to point the app at your local Next.js dev server.

### Release a new desktop version

You can cut a desktop release in two ways:

1. **From the GitHub UI** — go to **Actions → Build Desktop Apps → Run workflow**,
   enter the version (e.g. `0.1.0`), and run it. The workflow builds installers
   on macOS and Windows runners, creates the `desktop-v<version>` tag, and
   publishes a GitHub Release with the `.dmg` and `.exe` attached.
2. **By pushing a tag** — push a tag matching `desktop-v*` (e.g.
   `desktop-v0.1.0`). The same workflow runs and attaches the installers to a
   GitHub Release automatically.

Running the workflow manually with an empty `version` only produces build
artifacts (no release).
