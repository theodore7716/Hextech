#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建数据：把拳头 Data Dragon 的英雄数据 + CommunityDragon 的海克斯强化符文(arena augments)
合并成前端用的单个 data/data.json。

- 英雄：来自 ddragon champion.json (zh_CN)
- 符文：来自 communitydragon arena/zh_cn.json
    rarity 0 = 银色(Silver)  1 = 金色(Gold)  2 = 彩色/棱彩(Prismatic)
    rarity 4 = 特殊Boss子模式(GoH/Crafting)，排除。
- 把 @占位符@ 用 dataValues 解析为可读数值，去掉 <html> 风格标签。
"""
import json
import re
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")

DDRAGON_VER = "16.11.1"
CHAMP_ICON_BASE = f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/img/champion/"
SPLASH_BASE = "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/"
LOADING_BASE = "https://ddragon.leagueoflegends.com/cdn/img/champion/loading/"
AUG_ICON_BASE = "https://raw.communitydragon.org/latest/game/"

RARITY_NAME = {0: "silver", 1: "gold", 2: "prismatic"}
# 明确排除的内部/占位条目
BLOCKED_API = {"NullAugment"}


def resolve_desc(desc, dv):
    """把 @Key@ / @Key*100@ / @Key*100%@ 解析成数字，去掉标签。"""
    if not desc:
        return ""
    dv = dv or {}

    def value_of(key):
        if key in dv:
            v = dv[key]
            if isinstance(v, list):
                v = v[0] if v else 0
            return v
        return None

    def fmt(num):
        if abs(num - round(num)) < 1e-6:
            return str(int(round(num)))
        return ("%.2f" % num).rstrip("0").rstrip(".")

    def repl(m):
        expr = m.group(1)
        percent = expr.endswith("%")
        e = expr[:-1] if percent else expr
        parts = e.split("*")
        base = value_of(parts[0].strip())
        if base is None:
            # 未知占位符（多来自技能引用）——整体删掉，避免脏字符
            return ""
        try:
            num = float(base)
        except (TypeError, ValueError):
            return ""
        for p in parts[1:]:
            try:
                num *= float(p)
            except ValueError:
                pass
        return fmt(num) + ("%" if percent else "")

    desc = re.sub(r"@([^@]+)@", repl, desc)
    # 去掉图标/精灵占位符 %i:Xxx% 以及 %asciiToken%（不误伤 "20%" 这类百分号）
    desc = re.sub(r"%i:[^%]*%", "", desc)
    desc = re.sub(r"%[A-Za-z][^%]*%", "", desc)
    # 去掉 {{ Keyword_Xxx }} 这类关键词引用占位符
    desc = re.sub(r"\{\{.*?\}\}", "", desc)
    # 换行标签
    desc = re.sub(r"<\s*br\s*/?\s*>", "\n", desc, flags=re.I)
    # 去掉其余标签
    desc = re.sub(r"<[^>]+>", "", desc)
    # 清理多余空白
    desc = re.sub(r"[ \t]+", " ", desc)
    desc = re.sub(r"\n{3,}", "\n\n", desc)
    return desc.strip()


def build_champions():
    with open(os.path.join(DATA, "champion_zh.json"), encoding="utf-8") as f:
        raw = json.load(f)["data"]
    out = []
    for cid, c in raw.items():
        img = c["image"]["full"]
        out.append({
            "id": cid,
            "key": int(c["key"]),
            "name": c["name"],
            "title": c.get("title", ""),
            "tags": c.get("tags", []),
            "icon": CHAMP_ICON_BASE + img,
            "splash": f"{SPLASH_BASE}{cid}_0.jpg",
            "loading": f"{LOADING_BASE}{cid}_0.jpg",
        })
    out.sort(key=lambda x: x["name"])
    return out


def build_augments():
    with open(os.path.join(DATA, "arena_zh.json"), encoding="utf-8") as f:
        raw = json.load(f)["augments"]
    out = []
    for a in raw:
        r = a.get("rarity")
        if r not in RARITY_NAME:
            continue
        if a.get("apiName") in BLOCKED_API:
            continue
        name = a.get("name", "").strip()
        desc = resolve_desc(a.get("desc", ""), a.get("dataValues"))
        # 过滤无效/占位/未本地化的内部条目
        if not desc.strip():
            continue
        if re.match(r"^强化符文\d+$", name) or not name:
            continue
        icon = a.get("iconLarge") or a.get("iconSmall") or ""
        icon_url = AUG_ICON_BASE + icon.lower() if icon else ""
        out.append({
            "id": a["id"],
            "apiName": a.get("apiName", ""),
            "name": name,
            "rarity": RARITY_NAME[r],
            "desc": desc,
            "icon": icon_url,
        })
    return out


def main():
    champions = build_champions()
    augments = build_augments()
    by_rarity = {"silver": 0, "gold": 0, "prismatic": 0}
    for a in augments:
        by_rarity[a["rarity"]] += 1
    payload = {
        "version": DDRAGON_VER,
        "championCount": len(champions),
        "augmentCount": len(augments),
        "augmentsByRarity": by_rarity,
        "champions": champions,
        "augments": augments,
    }
    out_path = os.path.join(DATA, "data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(out_path)
    print(f"wrote {out_path}  ({size/1024:.0f} KB)")
    print(f"champions: {len(champions)}  augments: {len(augments)}  byRarity: {by_rarity}")


if __name__ == "__main__":
    main()
