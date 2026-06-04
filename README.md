# 海克斯大乱斗 · 符文实验室

一个英雄联盟「海克斯大乱斗」风格的符文（强化）模拟网页：选择任意英雄，模拟 **银色 / 金色 / 彩色** 三档符文的「四次三选一、每次可刷新一次」开局，看看你的英雄能随机点出什么强化。

## 玩法（参照客户端规则）

1. **选英雄**：从全部 172 位英雄中点击选择（支持搜索）。
2. **翻牌抽取**：共 4 次翻牌。点击「翻牌抽取」后，三张牌面朝下依次翻开 —— **品质不可指定**，翻开时才揭晓本次随机出现的颜色（银 / 金 / 彩），然后在这一品质内 **三选一**。
3. 每次翻牌可 **刷新一次**（重新随机品质 + 重新发牌）。
4. **全部随机**：一键随机点满 4 次；**重置** 清空。
5. 同一套构筑里不会出现重复符文（与游戏规则一致）。

> 每次翻牌的品质为加权随机：银最常见、彩最稀有。权重可在 `js/app.js` 顶部的 `COLOR_WEIGHTS` 调整（当前 银 50 / 金 33 / 彩 17）。

## 数据来源（真实游戏数据）

- 英雄：Riot **Data Dragon**（`zh_CN`，版本 16.11.1），图标 / 原画走官方 CDN。
- 符文（强化）：**CommunityDragon** 的 arena augments 数据。
  - `rarity 0 = 银色`、`1 = 金色`、`2 = 彩色（棱彩）`。
  - `rarity 4`（Boss/锻造等特殊子模式）及占位条目已过滤。
  - 共 **201** 个符文：68 银 / 77 金 / 56 彩。

## 目录结构

```
index.html          页面结构
css/style.css       海克斯主题样式
js/app.js           交互逻辑（选英雄 / 抽符文 / 刷新 / 概览）
data/data.json      前端使用的合并数据（由 build_data.py 生成）
data/*_zh.json      抓取下来的原始数据源
build_data.py       数据构建脚本：合并 + 清洗描述 + 拼接图标 URL
serve.py            本地静态服务器
```

## 本地运行

```bash
cd "second therdore"
python3 serve.py            # 然后浏览器打开 http://localhost:8765
# 或： python3 -m http.server 8765
```

> 必须通过本地服务器打开，不能直接双击 `index.html`（`file://` 下浏览器会拦截 `fetch` 加载 data.json）。

## 更新数据（换新版本 / 拉最新符文）

1. 重新下载源数据（更新 `build_data.py` 顶部的 `DDRAGON_VER`）：
   ```bash
   curl -s "https://ddragon.leagueoflegends.com/cdn/<版本>/data/zh_CN/champion.json" -o data/champion_zh.json
   curl -s "https://raw.communitydragon.org/latest/cdragon/arena/zh_cn.json" -o data/arena_zh.json
   ```
2. 重新生成：
   ```bash
   python3 build_data.py
   ```

---

本站为粉丝模拟工具，与 Riot Games 无关。所有英雄、符文、图标版权归 Riot Games 所有。
