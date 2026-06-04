"use strict";

// ---------- 状态 ----------
let DATA = null;
let AUG_BY_RARITY = { silver: [], gold: [], prismatic: [] };
let selectedChamp = null;

const SLOT_COUNT = 4;
// 每次翻牌随机出现的品质权重（银最常见，彩最稀有）——可按需调整
const COLOR_WEIGHTS = { silver: 50, gold: 33, prismatic: 17 };
const TIER_LABEL = { silver: "银色", gold: "金色", prismatic: "彩色" };
const TIER_SHORT = { silver: "银", gold: "金", prismatic: "彩" };
const ORDER = ["silver", "gold", "prismatic"];

// 质变（Transmute）符文：按名字判定变身规则
// 质变：混沌→2个随机(70%金/30%银) · 质变：棱彩阶→1随机彩 · 质变：黄金阶→1随机金
function transmuteSpec(a) {
  const n = (a && a.name) || "";
  if (!n.startsWith("质变")) return null;
  if (n.indexOf("混沌") >= 0)
    return { rolls: [{ mix: [["gold", 0.7], ["silver", 0.3]] }, { mix: [["gold", 0.7], ["silver", 0.3]] }] };
  if (n.indexOf("黄金") >= 0) return { rolls: [{ pool: "gold" }] };
  return { rolls: [{ pool: "prismatic" }] }; // 棱彩阶及兜底
}
function isTransmute(a) {
  return !!transmuteSpec(a);
}
function isPandora(a) {
  return !!a && (a.apiName === "PandorasBox" || a.name === "潘朵拉的盒子");
}

// 每个符文位状态：抽到的符文 + 质变结果 + 是否用过刷新
let slots = [];
function freshSlots() {
  return Array.from({ length: SLOT_COUNT }, () => ({ chosen: null, transmuted: null, fromPandora: false, rerollUsed: false }));
}
const PANDORA = "PandorasBox"; // 潘朵拉的盒子：将其余所有符文变为随机棱彩

// 当前正在翻牌的位 + 本次随机出的品质 + 三个候选
let activeSlot = -1;
let activeColor = null;
let activeChoices = [];
let activeRerolled = []; // 每张牌是否已用过刷新
let revealTimers = [];

// ---------- 工具 ----------
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

function rollColor() {
  const total = ORDER.reduce((a, c) => a + COLOR_WEIGHTS[c], 0);
  let r = Math.random() * total;
  for (const c of ORDER) {
    if (r < COLOR_WEIGHTS[c]) return c;
    r -= COLOR_WEIGHTS[c];
  }
  return "silver";
}

function sampleDistinct(pool, n, exclude) {
  const excl = new Set(exclude || []);
  const copy = pool.filter((a) => !excl.has(a.id));
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function chosenIds(exceptSlot) {
  const ids = [];
  slots.forEach((s, i) => {
    if (i !== exceptSlot && s.chosen) {
      ids.push(s.chosen.id);
      if (s.transmuted) s.transmuted.forEach((t) => ids.push(t.id));
    }
  });
  return ids;
}

// 计算质变结果（排除已选符文，避免再抽到质变自身）
function resolveTransmute(aug, excludeIds) {
  const spec = transmuteSpec(aug);
  const excl = new Set(excludeIds || []);
  const out = [];
  spec.rolls.forEach((roll) => {
    let rarity = roll.pool;
    if (!rarity) {
      let r = Math.random();
      let acc = 0;
      rarity = roll.mix[0][0];
      for (const [rar, w] of roll.mix) {
        acc += w;
        if (r < acc) { rarity = rar; break; }
      }
    }
    const pool = AUG_BY_RARITY[rarity].filter((x) => !excl.has(x.id) && !isTransmute(x));
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      out.push(pick);
      excl.add(pick.id);
    }
  });
  return out;
}

// 确认选择（处理质变 / 潘朵拉的盒子）
function commitChoice(i, aug) {
  const slot = slots[i];
  slot.chosen = aug;
  slot.fromPandora = false;
  slot.transmuted = isTransmute(aug)
    ? resolveTransmute(aug, chosenIds(i).concat([aug.id]))
    : null;
  if (isPandora(aug)) applyPandora(i);
}

// 潘朵拉的盒子：把其余已选符文全部变成随机棱彩阶
function applyPandora(boxIndex) {
  slots.forEach((s, j) => {
    if (j === boxIndex || !s.chosen) return;
    const exclude = new Set(chosenIds(j));
    const pool = AUG_BY_RARITY.prismatic.filter(
      (x) => !exclude.has(x.id) && !isTransmute(x) && !isPandora(x)
    );
    if (pool.length) {
      s.chosen = pool[Math.floor(Math.random() * pool.length)];
      s.transmuted = null;
      s.fromPandora = true;
    }
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// ---------- 加载数据 ----------
async function init() {
  try {
    const res = await fetch("data/data.json");
    DATA = await res.json();
  } catch (e) {
    $("#champ-grid").innerHTML =
      '<div class="loading-screen">数据加载失败，请通过本地服务器打开（不要用 file:// 直接打开）。</div>';
    return;
  }
  AUG_BY_RARITY = { silver: [], gold: [], prismatic: [] };
  DATA.augments.forEach((a) => AUG_BY_RARITY[a.rarity].push(a));

  $("#meta-info").innerHTML =
    `游戏版本 ${DATA.version}<br>${DATA.championCount} 位英雄 · ` +
    `${DATA.augmentsByRarity.silver}银 / ${DATA.augmentsByRarity.gold}金 / ${DATA.augmentsByRarity.prismatic}彩`;

  renderChampGrid(DATA.champions);
  bindGlobal();
}

// ---------- 英雄网格 ----------
function renderChampGrid(list) {
  const grid = $("#champ-grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  list.forEach((c) => {
    const cell = el("div", "champ-cell");
    cell.title = `${c.name} · ${c.title}`;
    const img = el("img");
    img.loading = "lazy";
    img.src = c.icon;
    img.alt = c.name;
    const nm = el("div", "nm");
    nm.textContent = c.name;
    cell.appendChild(img);
    cell.appendChild(nm);
    cell.addEventListener("click", () => selectChamp(c));
    frag.appendChild(cell);
  });
  grid.appendChild(frag);
  $("#champ-count").textContent = `${list.length} / ${DATA.championCount}`;
}

function bindGlobal() {
  $("#champ-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return renderChampGrid(DATA.champions);
    const filtered = DATA.champions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.title && c.title.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q)
    );
    renderChampGrid(filtered);
  });

  $("#back-btn").addEventListener("click", goToChampSelect);
  $("#roll-all-btn").addEventListener("click", rollAll);
  $("#reset-btn").addEventListener("click", resetSlots);
  $("#picker-close").addEventListener("click", closePicker);
  $("#picker").addEventListener("click", (e) => {
    if (e.target.id === "picker") closePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePicker();
  });
}

// ---------- 选英雄 ----------
function selectChamp(c) {
  selectedChamp = c;
  slots = freshSlots();

  const bg = $("#bg-splash");
  bg.style.backgroundImage = `url("${c.splash}")`;
  bg.classList.add("show");

  $("#champ-banner").innerHTML =
    `<img src="${c.icon}" alt="${c.name}">` +
    `<div><div class="ci-name">${c.name}</div><div class="ci-title">${c.title}</div></div>`;

  $("#screen-champ").classList.add("hidden");
  $("#screen-runes").classList.remove("hidden");
  renderSlots();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToChampSelect() {
  $("#screen-runes").classList.add("hidden");
  $("#screen-champ").classList.remove("hidden");
  $("#bg-splash").classList.remove("show");
}

// ---------- 渲染符文位 ----------
function renderSlots() {
  const wrap = $("#slots");
  wrap.innerHTML = "";
  slots.forEach((s, i) => wrap.appendChild(buildSlot(s, i)));
  renderLoadout();
}

function buildSlot(s, i) {
  const slot = el("div", "slot");
  const body = el("div", "slot-body");

  if (s.chosen) {
    const pandoraSlot = isPandora(s.chosen);
    slot.classList.add("filled", s.chosen.rarity);
    if (isTransmute(s.chosen)) slot.classList.add("is-transmute");
    const p = el("div", "picked");
    let badgePrefix = isTransmute(s.chosen) ? "质变·" : pandoraSlot ? "潘朵拉·" : "";
    p.innerHTML =
      (s.fromPandora ? `<div class="pandora-tag">来自潘朵拉的盒子</div>` : "") +
      `<div class="slot-badge ${s.chosen.rarity}">${badgePrefix}${TIER_LABEL[s.chosen.rarity]}</div>` +
      `<img class="aug-icon" src="${s.chosen.icon}" alt="">` +
      `<div class="aug-name">${s.chosen.name}</div>` +
      `<div class="aug-desc">${escapeHtml(s.chosen.desc)}</div>` +
      (pandoraSlot ? `<div class="pandora-note">↓ 已将其余已选符文全部质变为随机棱彩阶</div>` : "");
    // 质变结果：展示它实际变成的符文
    if (s.transmuted && s.transmuted.length) {
      const tr = el("div", "transmute-result");
      tr.innerHTML = `<div class="tr-arrow">质变为 ↓</div>`;
      s.transmuted.forEach((t) => {
        const item = el("div", "tr-item " + t.rarity);
        item.innerHTML =
          `<img src="${t.icon}" alt="">` +
          `<div class="tr-text"><span class="tr-name">${t.name}</span>` +
          `<span class="tier-chip ${t.rarity}">${TIER_SHORT[t.rarity]}</span>` +
          `<div class="tr-desc">${escapeHtml(t.desc)}</div></div>`;
        tr.appendChild(item);
      });
      p.appendChild(tr);
    }
    body.appendChild(p);
  } else {
    const empty = el("div", "slot-empty");
    const orb = el("div", "orb facedown");
    orb.innerHTML = '<span class="hexq">⬡</span>';
    const label = el("div", "slot-no");
    label.textContent = `第 ${i + 1} 次翻牌`;
    const btn = el("button", "draw-btn primary-draw");
    btn.textContent = "🎴 翻牌抽取";
    btn.addEventListener("click", () => openPicker(i));
    empty.appendChild(orb);
    empty.appendChild(label);
    empty.appendChild(btn);
    body.appendChild(empty);
  }

  slot.appendChild(body);
  return slot;
}

// ---------- 翻牌弹层 ----------
function openPicker(i) {
  activeSlot = i;
  drawNewCards();
  $("#picker").classList.remove("hidden");
}

// 随机出一种品质 + 三个候选（本次品质固定，仅可逐张刷新）
function drawNewCards() {
  activeColor = rollColor();
  activeChoices = sampleDistinct(AUG_BY_RARITY[activeColor], 3, chosenIds(activeSlot));
  activeRerolled = activeChoices.map(() => false);
  renderPicker();
}

function clearReveals() {
  revealTimers.forEach((t) => clearTimeout(t));
  revealTimers = [];
}

// 构建单张牌（含其下方的独立刷新按钮）
function buildChoiceCell(idx, delay) {
  const a = activeChoices[idx];
  const cell = el("div", "choice-cell");

  const card = el("div", "flip-card");
  const inner = el("div", "flip-inner");
  const back = el("div", "flip-back");
  back.innerHTML = '<span class="hexq">⬡</span>';
  const front = el("div", "flip-front choice " + a.rarity);
  front.innerHTML =
    `<img src="${a.icon}" alt="">` +
    `<div class="c-name">${a.name}</div>` +
    `<div class="c-desc">${escapeHtml(a.desc)}</div>`;
  inner.appendChild(back);
  inner.appendChild(front);
  card.appendChild(inner);
  card.addEventListener("click", () => {
    if (!card.classList.contains("revealed")) return; // 翻开后才能选
    choose(activeChoices[idx]);
  });
  cell.appendChild(card);

  // 这张牌专属的刷新按钮（每张一次）
  const rb = el("button", "card-reroll");
  rb.disabled = activeRerolled[idx];
  rb.textContent = activeRerolled[idx] ? "✓ 已刷新" : "🔄 刷新这张";
  rb.addEventListener("click", (e) => {
    e.stopPropagation();
    rerollCard(idx);
  });
  cell.appendChild(rb);

  revealTimers.push(setTimeout(() => card.classList.add("revealed"), delay));
  return cell;
}

function renderPicker() {
  clearReveals();

  $("#picker-title").textContent = `第 ${activeSlot + 1} 次翻牌`;
  const bar = $("#picker-colorbar");
  bar.className = "picker-colorbar";
  bar.textContent = "翻牌中…";

  const box = $("#picker-choices");
  box.innerHTML = "";
  activeChoices.forEach((a, idx) => box.appendChild(buildChoiceCell(idx, 140 * idx + 120)));

  // 全部翻开后揭晓品质
  revealTimers.push(
    setTimeout(() => {
      bar.className = "picker-colorbar revealed " + activeColor;
      bar.innerHTML = `本次出现 <span class="reveal-tag ${activeColor}">${TIER_LABEL[activeColor]}符文</span> · 三选一（每张可刷新一次）`;
    }, 140 * activeChoices.length + 220)
  );
}

// 仅刷新某一张牌（同品质换一张，每张限一次）
function rerollCard(idx) {
  if (activeRerolled[idx]) return;
  const exclude = chosenIds(activeSlot).concat(activeChoices.map((c) => c.id));
  const next = sampleDistinct(AUG_BY_RARITY[activeColor], 1, exclude);
  if (!next.length) return;
  activeRerolled[idx] = true;
  activeChoices[idx] = next[0];
  const box = $("#picker-choices");
  box.replaceChild(buildChoiceCell(idx, 60), box.children[idx]);
}

function choose(a) {
  commitChoice(activeSlot, a);
  closePicker();
  renderSlots();
}

function closePicker() {
  clearReveals();
  $("#picker").classList.add("hidden");
  activeSlot = -1;
  activeColor = null;
  activeChoices = [];
}

// ---------- 批量操作 ----------
function rollAll() {
  slots.forEach((s, i) => {
    const color = rollColor();
    const opts = sampleDistinct(AUG_BY_RARITY[color], 3, chosenIds(i));
    if (opts.length) commitChoice(i, opts[Math.floor(Math.random() * opts.length)]);
    s.rerollUsed = false;
  });
  renderSlots();
}

function resetSlots() {
  slots = freshSlots();
  renderSlots();
}

// ---------- 已选概览 ----------
function renderLoadout() {
  const lo = $("#loadout");
  const picked = slots.filter((s) => s.chosen);
  if (!picked.length) {
    lo.classList.remove("show");
    return;
  }
  lo.classList.add("show");
  lo.innerHTML = `<div class="lo-title">${selectedChamp.name} 的符文构筑（${picked.length}/${SLOT_COUNT}）</div>`;
  const items = el("div", "lo-items");
  slots.forEach((s) => {
    if (!s.chosen) return;
    // 质变符文在概览里直接显示它变成的符文
    const effective = s.transmuted && s.transmuted.length ? s.transmuted : [s.chosen];
    effective.forEach((a) => {
      const chip = el("div", "lo-chip");
      chip.innerHTML =
        `<img src="${a.icon}" alt=""><span class="tier-chip ${a.rarity}">${TIER_SHORT[a.rarity]}</span> ${a.name}`;
      items.appendChild(chip);
    });
  });
  lo.appendChild(items);
}

init();
