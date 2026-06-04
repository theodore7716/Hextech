#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把抓取到的「海克斯大乱斗」符文(mayhem_augments.json) + 英雄数据 合并成前端用的 data/data.json。
图标使用已下载到本地的 data/icons/*.webp。"""
import json, os, re
import html as htmlmod
from build_data import resolve_desc as cherry_resolve

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
DDRAGON_VER = "16.11.1"
CHAMP_ICON_BASE = f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/img/champion/"
SPLASH_BASE = "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/"
LOADING_BASE = "https://ddragon.leagueoflegends.com/cdn/img/champion/loading/"


def build_champions():
    raw = json.load(open(os.path.join(DATA, "champion_zh.json"), encoding="utf-8"))["data"]
    out = []
    for cid, c in raw.items():
        out.append({
            "id": cid,
            "key": int(c["key"]),
            "name": c["name"],
            "title": c.get("title", ""),
            "tags": c.get("tags", []),
            "icon": CHAMP_ICON_BASE + c["image"]["full"],
            "splash": f"{SPLASH_BASE}{cid}_0.jpg",
            "loading": f"{LOADING_BASE}{cid}_0.jpg",
        })
    out.sort(key=lambda x: x["name"])
    return out


def clean_desc(desc):
    """清理 arammayhem 描述：去掉‘最近更新/统计’尾巴 + 各类占位符 + 标签。"""
    if not desc:
        return ""
    for s in ["最近更新", "强化符文攻略", "最佳英雄", "登场率", "排名", "数据来源"]:
        p = desc.find(s)
        if p > 0:
            desc = desc[:p]
    desc = htmlmod.unescape(desc)
    desc = re.sub(r"@[^@]+@", "", desc)        # 无 dataValues 可解析，直接去占位
    desc = re.sub(r"%i:[^%]*%", "", desc)
    desc = re.sub(r"%[A-Za-z][^%]*%", "", desc)
    desc = re.sub(r"\{\{.*?\}\}", "", desc)
    desc = re.sub(r"<[^>]+>", "", desc)
    desc = re.sub(r"<[^>]*$", "", desc)   # 去掉结尾被截断的半个标签
    desc = re.sub(r"[ \t]+", " ", desc).strip()
    return desc


def cherry_desc_map():
    """cherry(竞技场) 数据里已解析好数值的干净描述：{规范化apiName: desc}。"""
    raw = json.load(open(os.path.join(DATA, "arena_zh.json"), encoding="utf-8"))["augments"]
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    m = {}
    for a in raw:
        if a.get("rarity") in (0, 1, 2):
            d = cherry_resolve(a.get("desc", ""), a.get("dataValues"))
            if d:
                m[norm(a["apiName"])] = d
    return m


def build_augments():
    raw = json.load(open(os.path.join(DATA, "mayhem_augments.json"), encoding="utf-8"))
    cherry = cherry_desc_map()
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    out = []
    seen = set()
    for a in raw:
        icon = a["icon"]
        name = (a.get("name") or "").strip()
        if not name or icon in seen:
            continue
        seen.add(icon)
        local = os.path.join(DATA, "icons", f"{icon}.webp")
        icon_path = f"data/icons/{icon}.webp" if os.path.exists(local) \
            else f"https://arammayhem.com/augments/{icon}_mayhem_augment.webp"
        # 描述：优先用 cherry 已解析的干净描述（数值完整），否则清理 arammayhem 文本
        desc = cherry.get(norm(icon)) or clean_desc(a.get("desc") or "")
        out.append({
            "id": icon,
            "apiName": icon,
            "name": name,
            "rarity": a["rarity"],
            "desc": desc,
            "icon": icon_path,
            "winrate": a.get("winrate"),
        })
    return out


def main():
    champions = build_champions()
    augments = build_augments()
    by = {"silver": 0, "gold": 0, "prismatic": 0}
    for a in augments:
        by[a["rarity"]] = by.get(a["rarity"], 0) + 1
    payload = {
        "version": DDRAGON_VER,
        "mode": "海克斯大乱斗",
        "source": "arammayhem.com (zh-cn)",
        "championCount": len(champions),
        "augmentCount": len(augments),
        "augmentsByRarity": by,
        "champions": champions,
        "augments": augments,
    }
    json.dump(payload, open(os.path.join(DATA, "data.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"champions: {len(champions)}  augments: {len(augments)}  byRarity: {by}")
    nodesc = [a["name"] for a in augments if not a["desc"]]
    print(f"无描述符文 {len(nodesc)}: {nodesc[:20]}")


if __name__ == "__main__":
    main()
