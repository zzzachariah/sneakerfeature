# 一句话优缺点（Verdict）导入

每双鞋一句话优点 + 一句话缺点。详情页在**性能雷达图正下方**把它们拼成：

> 如果你喜欢{优点}，并且可以接受{缺点}，那么这双鞋就是为你准备的。

英文界面对应：

> If you like {pro}, and can live with {con}, then this shoe is for you.

存储在 `shoe_specs` 表的四列（迁移 `037_shoe_verdict_proscons.sql`）：
`pro_summary` / `pro_summary_zh` / `con_summary` / `con_summary_zh`。中文走 `*_zh` 列，
英文走普通列；中文界面优先读中文、空了才回退英文。

---

## 1. CSV 格式

带表头，列名不区分大小写、顺序随意、多余列忽略。

```csv
slug,brand,shoe_name,pro_summary,pro_summary_zh,con_summary,con_summary_zh
gt-cut-3,Nike,GT Cut 3,its quick low-to-the-ground court feel,灵活贴地的场地感,a firm ride and a narrow fit,偏硬的脚感和偏窄的楦型
```

**匹配键**：优先用 `slug`（最稳，唯一）；没有 slug 时用 `brand` + `shoe_name` 兜底。
匹配不上的行会被跳过并在导入结果里列出。

**写入规则**：
- 空单元格**永远不会**覆盖已有内容（可以只导中文，英文留空，反之亦然）。
- “On conflict”选 **Overwrite**：非空单元格覆盖旧值；选 **Only fill empty**：只填库里为空的格子。

**短语写法（重要）**：`pro_summary` / `con_summary` 是要塞进“如果你喜欢___”和
“可以接受___”里的**短语**，不是完整句子。写成名词/动宾短语，不要加句号。

- ✅ 优点：`灵活贴地的场地感`　缺点：`偏硬的脚感和偏窄的楦型`
- ❌ 优点：`它的场地感很灵活。`（带主语和句号，拼出来读不通）

> 即使你写成了带句尾标点的句子，详情页也会自动去掉结尾的 `。，、；：！.` 再拼接，
> 但开头的主语去不掉，所以请按短语写。

---

## 2. 让 Claude chat 批量生成内容的提示词

把你的鞋款清单（最好含 `slug`、`brand`、`shoe_name`，以及现有的玩法/脚感描述）粘进
Claude chat，配合下面这段提示词，让它直接吐出可导入的 CSV：

```
你是球鞋编辑。我会给你一批球鞋（含 slug、品牌、型号，可能还有性能/脚感描述）。
为每一双写「一句话优点」和「一句话缺点」，中英文各一份，用来拼成这句话：
  「如果你喜欢{优点}，并且可以接受{缺点}，那么这双鞋就是为你准备的。」

要求：
1. 优点/缺点都写成能直接接在「如果你喜欢___」「并且可以接受___」后面的【短语】，
   不要写成带主语的完整句，不要加句号。例：优点「灵活贴地的场地感」，缺点「偏硬的脚感」。
2. 中文 8–20 字，简洁、具体、说人话；英文是等价表达（不是逐字直译）。
3. 优点抓这双鞋最突出的卖点；缺点是真实、可接受的取舍，别编参数。
4. 每双鞋只给一条优点、一条缺点。

只输出 CSV，第一行表头照抄，不要解释、不要代码块围栏：
slug,brand,shoe_name,pro_summary,pro_summary_zh,con_summary,con_summary_zh
```

> 提示：分批喂（一次 20–40 双）质量更稳，最后把多段 CSV 的数据行拼到一起（表头只留一行）。

---

## 3. 导入

1. 用管理员账号打开后台 → 侧边栏 **Content → Verdict import**（`/admin/verdicts`）。
2. 选 `.csv` 文件或直接粘贴 CSV 文本。
3. 选覆盖策略（默认 Overwrite），点 **Import**。
4. 结果会显示 匹配/更新/新建/未匹配 数量，并列出没匹配上的行——按需修正 slug/型号后重导。

导入会即时刷新缓存（`revalidateTag("shoes")`），详情页很快就能看到。
重复导入是幂等的：再导一次同样的 CSV 不会产生重复，只会按规则覆盖/填充。

`docs/verdict-import-sample.csv` 是一个可直接试导的小样例。
