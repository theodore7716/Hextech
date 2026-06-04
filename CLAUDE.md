# 海克斯大乱斗 · 符文实验室 — 项目说明

英雄联盟「海克斯大乱斗」(英文名 **ARAM Mayhem**) 的符文/强化模拟网页：选英雄 → 翻牌随机抽符文 → 看羁绊。**粉丝工具，与 Riot 无关。**

## 关键链接
- 线上：https://theodore7716.github.io/Hextech/ （GitHub Pages）
- 仓库：`theodore7716/Hextech`，分支 `main`，Pages 从 `main /(root)` 部署，含 `.nojekyll`
- 本地项目根目录：`/Users/admin/Desktop/second therdore`

## 技术栈 / 环境约束
- **纯静态站**：`index.html` + `css/style.css` + `js/app.js`（原生 JS，无框架、无打包）
- **无 Node / npm / gh / brew**。只有 **Python 3.9**。脚本打印中文需加 `LC_ALL=en_US.UTF-8`
- 某些子 shell 里 `curl` 不在 PATH，用绝对路径 `/usr/bin/curl`
- 数据在前端 `fetch('data/*.json')`，必须经 HTTP 打开（不能 file://）

## 目录结构
```
index.html  css/style.css  js/app.js        # 前端
data/data.json        # 运行时数据(英雄+符文)，由 build_mayhem.py 生成
data/synergies.json   # 9 个羁绊套装，由 scrape_sets.py 生成
data/icons/*.webp     # 195 个符文图标(本地托管)
data/champion_zh.json # 源:DDragon 英雄(zh_CN)
data/arena_zh.json    # 源:CommunityDragon 竞技场augments(用于复用干净描述)
data/mayhem_augments.json # 抓取的原始符文(195)
build_mayhem.py   # 主构建: mayhem_augments.json + 英雄 -> data.json
build_data.py     # 旧(竞技场)构建; 提供 resolve_desc() 给 build_mayhem 复用
scrape_mayhem.py  # 抓 arammayhem 列表+详情(描述/图标) -> mayhem_augments.json(170)
supplement_scrape.py # 补抓图标名含特殊字符(' : !)的 25 个 -> 凑齐 195
scrape_sets.py    # 抓 9 个套装 -> synergies.json
serve.py          # 本地静态服务器(DIRECTORY 硬编码为 Desktop 路径)
.claude/launch.json # 预览配置 -> 跑 /tmp/lolrunes/serve.py
```

## 数据来源
- **英雄**：Riot Data Dragon，版本 `16.11.1`，`zh_CN`。图标/原画走 ddragon CDN。
- **符文**：**arammayhem.com**（zh-cn 即海克斯大乱斗官方简体译名）。
  - 列表 `/zh-cn/augments/`；详情 `/zh-cn/augments/{slug}/`（**必须带末尾斜杠**，否则 307）
  - 套装 `/zh-cn/augment-sets/{slug}/`；图标 `/augments/{IconID}_mayhem_augment.webp`
  - 共 **195 个符文**：62 银 / 68 金 / 65 彩。品质在 HTML 的 `text-rarity-{silver|gold|prismatic}` class 里
  - ⚠️ 25 个符文图标名含 `'`(`&#x27;`)、`:`、`!` 等特殊字符；`safe_id()` 用 `[^A-Za-z0-9]+ -> _` 归一化做本地文件名与 id
- CommunityDragon 只有「竞技场(cherry)」augments，**没有** mayhem 专属数据；故符文必须用 arammayhem。

## 构建流程（改数据时）
1. （重新抓取才需要）`python3 scrape_mayhem.py` → `python3 supplement_scrape.py` → `python3 scrape_sets.py`
2. **`python3 build_mayhem.py`** 生成 `data/data.json`（描述：能匹配竞技场apiName的用其已解析数值，否则清理 arammayhem 文本的占位符/“最近更新”尾巴）
3. 图标已在 `data/icons/`；data.json 里 icon 字段 = `data/icons/{id}.webp`

## 游戏规则实现（js/app.js）
- **4 次翻牌**，每次 `rollColor()` 加权随机品质（`COLOR_WEIGHTS` 银50/金33/彩17），再三选一
- **每张牌下方独立刷新一次**（`activeRerolled[]`），不是一键重抽三张
- 选定后**锁定**该位（无重新翻牌按钮）；同一构筑**不重复**（`chosenIds()` 含质变结果）
- **生成型符文按名字识别**：
  - `transmuteSpec()`：质变：混沌→2个随机(70%金/30%银)；质变：棱彩阶→1随机彩（质变：黄金阶→金，若存在）
  - `isPandora()`：潘朵拉的盒子 → 其余已选位全部变随机棱彩（`applyPandora`）
  - 质变变出的符文存在 `slot.transmuted`，会展示且计入羁绊/去重
- **符文羁绊**：`SYNERGIES` 来自 synergies.json；`renderSynergies()` 统计 `ownedAugmentIds()`(含 transmuted) 命中各套装成员数，≥`tiers[0].count`(通常2) 点亮，高亮当前生效档位。9 套装 54 成员全部与库对齐。

## 部署（每次更新）
```bash
cd "/Users/admin/Desktop/second therdore"
git add -A && git commit -m "..." && git push   # 凭证已缓存
```
Pages 自动重建 ~1-2 分钟，网址不变。**不要点 Unpublish**（会下线整站）。提交信息结尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## 本地预览的坑（重要）
- macOS **Desktop 受 TCC 保护**，预览 MCP 派生的进程读不到 Desktop。
- 解决：从 **`/tmp/lolrunes/`** 提供服务（那里有一份拷贝 + serve.py）。
- 迭代时：改完先 `cp` 到 `/tmp/lolrunes/`（含 `data/icons/`、`data/*.json`）再 reload 预览。**真正的源码在 Desktop 项目目录**，提交也提交 Desktop 这份。

## 待办 / 可扩展
- 客户端若发现符文名/描述/羁绊成员对不上 → 用户提供具体项后精确修正
- 可选新功能：按英雄推荐、分享构筑链接、按羁绊筛选符文、补全个别套装缺的档位
