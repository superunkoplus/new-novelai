// ===== 状態 =====
const WEIGHTS = [0.8, 1.0, 1.1, 1.2, 1.3, 1.5];
const state = { data: null, tab: 0, selected: [], open: new Set() }; // open: 展開中のセクション // selected: { text, label, weight }
const $ = (id) => document.getElementById(id);

// ===== 起動 =====
async function init() {
  try {
    state.data = await (await fetch("prompts.json")).json();
  } catch (e) {
    $("content").textContent = "prompts.json を読み込めません(Live Server等で開いてください)";
    return;
  }
  try { state.selected = JSON.parse(localStorage.getItem("nai_selected") || "[]"); } catch (e) {}
  $("copy").onclick = copyPrompt;
  $("clear").onclick = () => { state.selected = []; update(); };
  $("overlay").onclick = (e) => { if (e.target.id === "overlay") closePanel(); };
  update();
}

// ===== 選択操作 =====
const find = (text) => state.selected.findIndex((s) => s.text === text);

function toggle(text, label, sec) {
  const i = find(text);
  if (i >= 0) state.selected.splice(i, 1);
  else {
    // exclusive セクション: 同じセクションの他の選択を外して入れ替える
    if (sec && sec.exclusive) {
      const others = sec.items.map((x) => x.text).filter(Boolean);
      state.selected = state.selected.filter((s) => !others.includes(s.text));
    }
    state.selected.push({ text, label, weight: 1.0 });
  }
  update();
}

function update() {
  try { localStorage.setItem("nai_selected", JSON.stringify(state.selected)); } catch (e) {}
  renderTabs();
  renderContent();
  renderChips();
}

// ===== 描画 =====
function el(tag, text, cls, onclick) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  if (onclick) e.onclick = onclick;
  return e;
}

function renderTabs() {
  const box = $("tabs");
  box.innerHTML = "";
  state.data.categories.forEach((c, i) => {
    box.appendChild(el("button", c.name, i === state.tab ? "active" : "", () => {
      state.tab = i; state.open.clear(); window.scrollTo(0, 0); update();
    }));
  });
}

function isItemOn(it) {
  if (it.text && find(it.text) >= 0) return true;
  if (it.garment && state.selected.some((s) => s.group === it.garment)) return true;
  if (it.handHold && it.handHold.targets) {
    const texts = [];
    it.handHold.targets.forEach((t) => {
      if (t.one && t.one.text) texts.push(t.one.text);
      if (t.both && t.both.text) texts.push(t.both.text);
    });
    return texts.some((t) => find(t) >= 0);
  }
  return false;
}

function renderContent() {
  const box = $("content");
  box.innerHTML = "";
  state.data.categories[state.tab].sections.forEach((sec) => {
    const isOpen = state.open.has(sec.title);
    const n = sec.items.filter((it) => isItemOn(it)).length;
    const head = el("button", (isOpen ? "▾ " : "▸ ") + sec.title + (n ? "  (" + n + ")" : ""), "sechead" + (isOpen ? " open" : ""), () => {
      if (isOpen) state.open.delete(sec.title); else state.open.add(sec.title);
      renderContent();
    });
    box.appendChild(head);
    if (!isOpen) return;
    const row = el("div", "", "buttons");
    sec.items.forEach((it) => {
      if (it.garment) {
        const on = state.selected.some((s) => s.group === it.garment);
        row.appendChild(el("button", it.label, "var" + (on ? " on" : ""), () => openGarment(it.garment, null)));
      } else if (it.handHold) {
        row.appendChild(el("button", it.label, "var" + (isItemOn(it) ? " on" : ""), () => openHandHold(it)));
      } else if (it.variation) {
        row.appendChild(el("button", it.label, "var", () => openVariation(it.variation)));
      } else {
        const b = el("button", it.label, find(it.text) >= 0 ? "on" : "", () => toggle(it.text, it.label, sec));
        if (it.desc || it.note) {
          const wrap = el("span", "", "item");
          wrap.appendChild(b);
          wrap.appendChild(el("button", "?", "q", () => openInfo(it)));
          row.appendChild(wrap);
        } else row.appendChild(b);
      }
    });
    box.appendChild(row);
  });
}

function renderChips() {
  const box = $("chips");
  box.innerHTML = "";
  if (!state.selected.length) box.appendChild(el("span", "ここに選択したプロンプトが表示されます", "hint"));
  state.selected.forEach((s, i) => {
    const c = el("span", s.label || s.text, "chip", () => openWeight(i));
    if (s.weight !== 1.0) c.appendChild(el("b", String(s.weight)));
    box.appendChild(c);
  });
}

// ===== パネル(バリエーション / 重み) =====
function openPanel(title, buttons) {
  const p = $("panel");
  const top = p.scrollTop; // 開いたまま更新するときスクロール位置を保つ
  p.innerHTML = "";
  p.appendChild(el("h3", title));
  buttons.forEach((b) => p.appendChild(b));
  p.appendChild(el("button", "閉じる", "close", closePanel));
  $("overlay").hidden = false;
  p.scrollTop = top;
}
function closePanel() { $("overlay").hidden = true; }

function openInfo(it) {
  const p = $("panel");
  p.scrollTop = 0;
  const box = [el("p", it.desc || "")];
  if (it.note) box.push(el("p", "注意: " + it.note, "note"));
  box.push(el("code", it.text));
  openPanel(it.label, box);
}

// ===== 手で持つ: 片手/両手 → 対象 =====
function allHandHoldTexts(cfg) {
  const texts = [];
  (cfg.targets || []).forEach((t) => {
    if (t.one && t.one.text) texts.push(t.one.text);
    if (t.both && t.both.text) texts.push(t.both.text);
  });
  return texts;
}

function pickHandHold(cfg, countKey, target) {
  const opt = target[countKey];
  if (!opt || !opt.text) return;
  // 同じ handHold グループ内は1つだけ
  const others = allHandHoldTexts(cfg);
  state.selected = state.selected.filter((s) => !others.includes(s.text));
  const had = find(opt.text) >= 0;
  if (!had) state.selected.push({ text: opt.text, label: opt.label, weight: 1.0 });
  closePanel();
  update();
}

function openHandHoldTarget(it, countKey) {
  const cfg = it.handHold;
  const countLabel = countKey === "one" ? "片手" : "両手";
  const btns = (cfg.targets || []).map((t) => {
    const opt = t[countKey];
    if (!opt) return null;
    return el("button", t.label, find(opt.text) >= 0 ? "on" : "", () => pickHandHold(cfg, countKey, t));
  }).filter(Boolean);
  btns.unshift(el("button", "← 片手/両手を選び直す", "", () => openHandHold(it)));
  openPanel(it.label + "（" + countLabel + "）：どこを持つ？", btns);
}

function openHandHold(it) {
  openPanel(it.label + "：片手 / 両手", [
    el("button", "片手", "", () => openHandHoldTarget(it, "one")),
    el("button", "両手", "", () => openHandHoldTarget(it, "both")),
  ]);
}

// ===== 服装: 色 → 状態 を続けて選ぶ =====
function getColors(g) {
  if (g.colors) return g.colors;
  const list = state.data.colorSets[g.colorSet].map((c) => ({ label: c.label, text: c.value + " " + g.base }));
  list.push({ label: "指定なし", text: g.base });
  return list;
}
function getStates(g) {
  if (g.states) return g.states;
  return state.data.stateSets[g.stateSet].map((x) => ({ label: x.label, text: g.base + x.suffix }));
}
function garmentText(g, color, st) {
  return st.text.startsWith(g.base) ? color.text + st.text.slice(g.base.length) : st.text;
}
function garmentLabel(g, color, st) {
  const head = (color.label === "指定なし" ? "" : color.label + "の") + g.label;
  if (st.label === "普通に着ている") return head;
  return /(いる|れる)$/.test(st.label) ? head + "が" + st.label : head + "（" + st.label + "）";
}
function pickGarment(key, color, st) {
  const g = state.data.garments[key];
  const text = garmentText(g, color, st);
  const had = find(text) >= 0;
  state.selected = state.selected.filter((s) => s.group !== key);
  if (!had) state.selected.push({ text, label: garmentLabel(g, color, st), weight: 1.0, group: key });
  closePanel();
  update();
}
function openGarment(key, color) {
  const g = state.data.garments[key];
  if (!color) {
    openPanel(g.label + "：色を選ぶ", getColors(g).map((c) => el("button", c.label, "", () => openGarment(key, c))));
    return;
  }
  const sts = getStates(g);
  if (sts.length === 1) { pickGarment(key, color, sts[0]); return; }
  const btns = sts.map((st) =>
    el("button", st.label, find(garmentText(g, color, st)) >= 0 ? "on" : "", () => pickGarment(key, color, st)));
  btns.unshift(el("button", "← 色を選び直す", "", () => openGarment(key, null)));
  openPanel(g.label + "(" + color.label + ")：状態を選ぶ", btns);
}

function openVariation(key) {
  const v = state.data.variations[key];
  const btns = v.options.map((o) => {
    const b = el("button", o.label, find(o.text) >= 0 ? "on" : "", () => { toggle(o.text, o.label); closePanel(); });
    if (o.desc) b.appendChild(el("small", o.desc));
    return b;
  });
  openPanel(v.title, btns);
}

function move(i, d) {
  const j = i + d;
  const a = state.selected;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  update();
  openWeight(j);
}

function openWeight(i) {
  const s = state.selected[i];
  const btns = [];
  const mv = el("div", "", "moverow");
  mv.appendChild(el("button", "◀ 前へ", "", () => move(i, -1)));
  mv.appendChild(el("button", "後ろへ ▶", "", () => move(i, 1)));
  btns.push(mv);
  btns.push(el("p", "重み", "sub"));
  WEIGHTS.forEach((w) =>
    btns.push(el("button", String(w), w === s.weight ? "on" : "", () => { s.weight = w; update(); openWeight(i); })));
  btns.push(el("button", "このチップを削除", "danger", () => { state.selected.splice(i, 1); closePanel(); update(); }));
  openPanel((s.label || s.text) + "(" + (i + 1) + "/" + state.selected.length + ")", btns);
}

// ===== コピー =====
async function copyPrompt() {
  if (!state.selected.length) return;
  let out = state.selected
    .map((s) => {
      const t = s.text.replace(/[,\s]+$/, "");
      return s.weight === 1.0 ? t : s.weight + "::" + t + "::";
    })
    .join(", ");
  if (!out.endsWith(",")) out += ",";
  try { await navigator.clipboard.writeText(out); }
  catch (e) {
    const ta = el("textarea"); ta.value = out; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy"); ta.remove();
  }
  const b = $("copy");
  b.textContent = "コピーしました";
  setTimeout(() => (b.textContent = "コピー"), 1200);
}

init();
