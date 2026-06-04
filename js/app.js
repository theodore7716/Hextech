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

// 每个符文位状态：抽到的符文 + 是否用过刷新
let slots = [];
function freshSlots() {
  return Array.from({ length: SLOT_COUNT }, () => ({ chosen: null, rerollUsed: false }));
}

// 当前正在翻牌的位 + 本次随机出的品质 + 三个候选
let activeSlot = -1;
let activeColor = null;
let activeChoices = [];
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
    if (i !== exceptSlot && s.chosen) ids.push(s.chosen.id);
  });
  return ids;
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
  $("#picker-reroll").addEventListener("click", rerollActive);
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
    slot.classList.add("filled", s.chosen.rarity);
    const p = el("div", "picked");
    p.innerHTML =
      `<div class="slot-badge ${s.chosen.rarity}">${TIER_LABEL[s.chosen.rarity]}</div>` +
      `<img class="aug-icon" src="${s.chosen.icon}" alt="">` +
      `<div class="aug-name">${s.chosen.name}</div>` +
      `<div class="aug-desc">${escapeHtml(s.chosen.desc)}</div>`;
    const again = el("button", "draw-btn");
    again.textContent = "重新翻牌";
    again.addEventListener("click", () => openPicker(i));
    p.appendChild(again);
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
  slots[i].rerollUsed = false; // 新的一次翻牌：刷新机会重置
  drawNewCards();
  $("#picker").classList.remove("hidden");
}

// 随机出一种品质 + 三个候选
function drawNewCards() {
  activeColor = rollColor();
  activeChoices = sampleDistinct(AUG_BY_RARITY[activeColor], 3, chosenIds(activeSlot));
  renderPicker();
}

function clearReveals() {
  revealTimers.forEach((t) => clearTimeout(t));
  revealTimers = [];
}

function renderPicker() {
  clearReveals();
  const s = slots[activeSlot];

  $("#picker-title").textContent = `第 ${activeSlot + 1} 次翻牌`;
  const bar = $("#picker-colorbar");
  bar.className = "picker-colorbar";
  bar.textContent = "翻牌中…";

  const box = $("#picker-choices");
  box.innerHTML = "";
  activeChoices.forEach((a, idx) => {
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
      choose(a);
    });
    box.appendChild(card);

    // 依次翻牌
    revealTimers.push(
      setTimeout(() => card.classList.add("revealed"), 140 * idx + 120)
    );
  });

  // 全部翻开后揭晓品质
  revealTimers.push(
    setTimeout(() => {
      bar.className = "picker-colorbar revealed " + activeColor;
      bar.innerHTML = `本次出现 <span class="reveal-tag ${activeColor}">${TIER_LABEL[activeColor]}符文</span> · 三选一`;
    }, 140 * activeChoices.length + 220)
  );

  const reroll = $("#picker-reroll");
  reroll.disabled = s.rerollUsed;
  reroll.textContent = s.rerollUsed ? "已刷新（本次用完）" : "🔄 刷新（剩 1 次）";
}

function rerollActive() {
  const s = slots[activeSlot];
  if (s.rerollUsed) return;
  s.rerollUsed = true;
  drawNewCards(); // 重新随机品质 + 候选，重新翻牌
}

function choose(a) {
  slots[activeSlot].chosen = a;
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
    if (opts.length) s.chosen = opts[Math.floor(Math.random() * opts.length)];
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
    const chip = el("div", "lo-chip");
    chip.innerHTML =
      `<img src="${s.chosen.icon}" alt=""><span class="tier-chip ${s.chosen.rarity}">${TIER_SHORT[s.chosen.rarity]}</span> ${s.chosen.name}`;
    items.appendChild(chip);
  });
  lo.appendChild(items);
}

init();
