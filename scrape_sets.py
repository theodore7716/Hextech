#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取「海克斯大乱斗」9 个符文羁绊套装：名字 / 简介 / 2-3-4 件套加成 / 成员符文。
输出 data/synergies.json。成员用 safe_id 与 mayhem 符文库的 id 对齐。"""
import re, json, os, time, html as htmlmod, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
UA = {"User-Agent": "Mozilla/5.0 (compatible; rune-lab/1.0)"}
BASE = "https://arammayhem.com"
SLUGS = ["archmage", "dive-bomb-set", "firecracker-set", "fully-automated",
         "high-roller", "make-it-rain", "snowday", "stackosaurus-rex", "wee-woo-wee-woo"]


def fetch(url):
    for k in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            if k == 2:
                print("  ! fail", url, e, flush=True)
                return None
            time.sleep(1)


def safe_id(icon_raw):
    icon_raw = htmlmod.unescape(icon_raw)
    if re.fullmatch(r"[A-Za-z0-9_]+", icon_raw):
        return icon_raw
    return re.sub(r"[^A-Za-z0-9]+", "_", icon_raw).strip("_")


def parse_set(h, slug):
    name = ""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
    if m:
        name = re.sub(r"<[^>]+>", "", m.group(1)).strip()
    # 简介：H1 之后到 '层级加成' 之间，取以。结尾的句子
    desc = ""
    if m:
        pre = h[m.end():h.find("层级加成", m.end()) if "层级加成" in h[m.end():] else m.end() + 1500]
        ptxt = re.sub(r"<[^>]+>", " ", pre)
        ptxt = re.sub(r"\s+", " ", ptxt)
        ds = re.findall(r"[^。\s][^。]{4,80}。", ptxt)
        if ds:
            desc = ds[0].strip()
    # 件套加成
    tiers = []
    i = h.find("收集同套装")
    if i > 0:
        seg = h[i:i + 2200]
        cut = seg.find("成员强化符文")
        if cut > 0:
            seg = seg[:cut]
        txt = re.sub(r"<[^>]+>", " ", seg)
        txt = re.sub(r"\s+", " ", txt).strip()
        for c, e in re.findall(r"(\d+)\s*个\s+(.+?)(?=\s+\d+\s*个\s|\s*$)", txt):
            tiers.append({"count": int(c), "effect": e.strip()})
    # 成员（图标 id）
    members, seen = [], set()
    for mm in re.finditer(r"/augments/([^\"/]+?)_mayhem_augment\.webp", h):
        sid = safe_id(mm.group(1))
        if sid not in seen:
            seen.add(sid)
            members.append(sid)
    return {"key": slug, "name": name, "desc": desc, "tiers": tiers, "members": members}


def main():
    out = []
    for slug in SLUGS:
        h = fetch(f"{BASE}/zh-cn/augment-sets/{slug}/")
        if not h:
            continue
        s = parse_set(h, slug)
        out.append(s)
        print(f"{s['name']}({slug}): {len(s['members'])} 成员, {len(s['tiers'])} 档加成", flush=True)
        time.sleep(0.3)
    json.dump(out, open(os.path.join(DATA, "synergies.json"), "w"), ensure_ascii=False, indent=1)
    print("DONE ->", os.path.join(DATA, "synergies.json"), flush=True)


if __name__ == "__main__":
    main()
