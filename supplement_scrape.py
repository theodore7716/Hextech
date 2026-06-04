#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补抓首轮漏掉的符文（图标名含 ' : ! - 空格 等特殊字符）。"""
import re, json, os, time, html as htmlmod, urllib.request, urllib.parse

ROOT = "/Users/admin/Desktop/second therdore"
ICON_DIR = os.path.join(ROOT, "data", "icons")
UA = {"User-Agent": "Mozilla/5.0 (compatible; rune-lab/1.0)"}
BASE = "https://arammayhem.com"
STOPS = ["强化符文攻略", "最佳英雄", "登场率", "胜率", "排名", "英雄推荐", "继续查看",
         "相关英雄", "数据来源", "Patch", "强化符文套装", "组合示例", "最近更新"]


def fetch(url, binary=False, retries=3):
    for k in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read() if binary else r.read().decode("utf-8", "ignore")
        except Exception as e:
            if k == retries - 1:
                print("  ! fail", url, e, flush=True)
                return None
            time.sleep(1.0)


def extract_desc(h):
    m = re.search(r"<h1[^>]*>.*?</h1>", h, re.S)
    if not m:
        return ""
    chunk = h[m.end():m.end() + 2000]
    cut = len(chunk)
    for s in STOPS:
        p = chunk.find(s)
        if 0 < p < cut:
            cut = p
    txt = re.sub(r"<[^>]+>", "", chunk[:cut])
    txt = re.sub(r"\s+", "", txt)
    for w in ["棱彩", "黄金", "白银", "金色", "银色", "彩色"]:
        if txt.startswith(w):
            txt = txt[len(w):]
            break
    return txt.strip()[:400]


def safe_id(icon_raw):
    return re.sub(r"[^A-Za-z0-9]+", "_", icon_raw).strip("_")


def main():
    allaug = json.load(open("/tmp/all_aug.json", encoding="utf-8"))
    have_names = {a["name"] for a in json.load(open(os.path.join(ROOT, "data", "mayhem_augments.json"), encoding="utf-8"))}
    missing = [a for a in allaug if a["name"] not in have_names]
    print(f"missing to fetch: {len(missing)}", flush=True)
    add = []
    for a in missing:
        icon_raw = htmlmod.unescape(a["icon"])  # &#x27; -> '
        sid = safe_id(icon_raw)
        # 图标
        ipath = os.path.join(ICON_DIR, f"{sid}.webp")
        if not os.path.exists(ipath):
            ok = False
            for enc in (urllib.parse.quote(icon_raw), icon_raw):
                data = fetch(f"{BASE}/augments/{enc}_mayhem_augment.webp", binary=True)
                if data and len(data) > 200:
                    open(ipath, "wb").write(data)
                    ok = True
                    break
            if not ok:
                print("  ! icon fail", a["name"], icon_raw, flush=True)
        # 描述
        dh = fetch(f"{BASE}/zh-cn/augments/{a['slug']}/")
        desc = extract_desc(dh) if dh else ""
        add.append({"icon": sid, "rarity": a["rarity"], "name": a["name"],
                    "slug": a["slug"], "winrate": a.get("winrate"), "desc": desc,
                    "iconLocal": f"icons/{sid}.webp"})
        print(f"  + {a['name']} ({sid}) desc={len(desc)}", flush=True)
        time.sleep(0.25)
    # 合并写回
    cur = json.load(open(os.path.join(ROOT, "data", "mayhem_augments.json"), encoding="utf-8"))
    cur += add
    json.dump(cur, open(os.path.join(ROOT, "data", "mayhem_augments.json"), "w"), ensure_ascii=False)
    print(f"DONE total now: {len(cur)}", flush=True)


if __name__ == "__main__":
    main()
