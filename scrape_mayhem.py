#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 arammayhem.com (zh-cn) 抓取「海克斯大乱斗」全部强化符文：
中文名 / 品质 / 描述 / 胜率 / 图标(下载到本地)。输出 data/mayhem_augments.json。"""
import re, json, os, time, urllib.request

ROOT = "/Users/admin/Desktop/second therdore"
ICON_DIR = os.path.join(ROOT, "data", "icons")
os.makedirs(ICON_DIR, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (compatible; rune-lab/1.0)"}
BASE = "https://arammayhem.com"


def fetch(url, binary=False, retries=3):
    for k in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read() if binary else r.read().decode("utf-8", "ignore")
        except Exception as e:
            if k == retries - 1:
                print("  ! fail", url, e, flush=True)
                return None
            time.sleep(1.0)


def parse_listing(html):
    # 以 <a href="/zh-cn/augments/slug/"> 为卡片边界切分
    parts = re.split(r'<a\s+href="(/(?:zh-cn/)?augments/[a-z0-9\-]+/?)"', html)
    augs = {}
    for k in range(1, len(parts), 2):
        href, body = parts[k], parts[k + 1]
        m_icon = re.search(r'/augments/([A-Za-z0-9_]+)_mayhem_augment\.webp', body)
        m_rar = re.search(r'text-rarity-([a-z]+)', body)
        m_name = re.search(r'<h3[^>]*>(.*?)</h3>', body, re.S)
        m_wr = re.search(r'([0-9]{1,2}\.[0-9]{2})<!-- -->%', body)
        if not (m_icon and m_rar and m_name):
            continue
        icon = m_icon.group(1)
        if icon in augs:
            continue
        slug = re.search(r'/augments/([a-z0-9\-]+)', href).group(1)
        augs[icon] = {
            "icon": icon,
            "rarity": m_rar.group(1),
            "name": re.sub(r"<[^>]+>", "", m_name.group(1)).strip(),
            "slug": slug,
            "winrate": float(m_wr.group(1)) if m_wr else None,
        }
    return augs


STOPS = ["强化符文攻略", "最佳英雄", "登场率", "胜率", "排名", "英雄推荐",
         "继续查看", "相关英雄", "数据来源", "Patch", "强化符文套装", "组合示例"]


def extract_desc(detail_html):
    m = re.search(r"<h1[^>]*>.*?</h1>", detail_html, re.S)
    if not m:
        return ""
    chunk = detail_html[m.end():m.end() + 2000]
    cut = len(chunk)
    for s in STOPS:
        p = chunk.find(s)
        if 0 < p < cut:
            cut = p
    chunk = chunk[:cut]
    txt = re.sub(r"<[^>]+>", "", chunk)
    txt = re.sub(r"\s+", "", txt)
    for w in ["棱彩", "黄金", "白银", "金色", "银色", "彩色"]:
        if txt.startswith(w):
            txt = txt[len(w):]
            break
    return txt.strip()[:400]


def main():
    listing = open("/tmp/mayhem_zh.html", encoding="utf-8", errors="ignore").read()
    augs = parse_listing(listing)
    print(f"listing parsed: {len(augs)} augments", flush=True)
    out = []
    for i, (icon, a) in enumerate(sorted(augs.items())):
        # 描述
        durl = f"{BASE}/zh-cn/augments/{a['slug']}/"
        dh = fetch(durl)
        a["desc"] = extract_desc(dh) if dh else ""
        # 图标
        iurl = f"{BASE}/augments/{icon}_mayhem_augment.webp"
        ipath = os.path.join(ICON_DIR, f"{icon}.webp")
        if not os.path.exists(ipath):
            data = fetch(iurl, binary=True)
            if data:
                open(ipath, "wb").write(data)
        a["iconLocal"] = f"icons/{icon}.webp"
        out.append(a)
        if (i + 1) % 20 == 0:
            print(f"  {i+1}/{len(augs)} done", flush=True)
            json.dump(out, open(os.path.join(ROOT, "data", "mayhem_augments.json"), "w"),
                      ensure_ascii=False)
        time.sleep(0.25)
    json.dump(out, open(os.path.join(ROOT, "data", "mayhem_augments.json"), "w"),
              ensure_ascii=False)
    miss_desc = sum(1 for a in out if not a["desc"])
    print(f"DONE: {len(out)} augments, {miss_desc} missing desc", flush=True)


if __name__ == "__main__":
    main()
