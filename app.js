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
  $("random").onclick = runRandom;
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
      const others = sec.items.map((x) => x.text);
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

function renderContent() {
  const box = $("content");
  box.innerHTML = "";
  state.data.categories[state.tab].sections.forEach((sec) => {
    const isOpen = state.open.has(sec.title);
    const n = sec.items.filter((it) => (it.text && find(it.text) >= 0) || (it.garment && state.selected.some((s) => s.group === it.garment))).length;
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

// ===== 服装: 色 → 状態 を続けて選ぶ =====
// 色・状態は、服ごとの個別指定 or 共通セット(colorSets / stateSets)から作る
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
  // 状態タグの先頭の基本名を、色付きの名前に置き換える
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
  state.selected = state.selected.filter((s) => s.group !== key); // 同じ服は1つだけ
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
  if (sts.length === 1) { pickGarment(key, color, sts[0]); return; } // 状態が無い服は色だけで確定
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
      const t = s.text.replace(/[,\s]+$/, ""); // 末尾のカンマ・空白を除いて二重カンマを防ぐ
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

// ===== ランダム生成 =====
// 表情・服装・場所は抽選しない。体位/前戯・視点・体液・エフェクト等を相性の良い組み合わせから選ぶ

function pick(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  if (!arr || !arr.length) return [];
  const copy = [...arr];
  const out = [];
  const count = Math.min(n, copy.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/** ラベルから実体（text/label）を探す。variation なら options からランダムに1つ */
function resolveLabel(label) {
  if (!label || !state.data) return null;

  // 1. variations の title や options の label を探す
  if (state.data.variations) {
    for (const key of Object.keys(state.data.variations)) {
      const v = state.data.variations[key];
      if (v.title === label && v.options && v.options.length) {
        const o = pick(v.options);
        return { text: o.text, label: o.label || label };
      }
      if (v.options) {
        const found = v.options.find((o) => o.label === label);
        if (found) return { text: found.text, label: found.label };
      }
    }
  }

  // 2. categories 内の items を探す（text 直接 or variation キー）
  for (const cat of state.data.categories || []) {
    for (const sec of cat.sections || []) {
      for (const it of sec.items || []) {
        if (it.label === label) {
          if (it.text) return { text: it.text, label: it.label };
          if (it.variation && state.data.variations && state.data.variations[it.variation]) {
            const v = state.data.variations[it.variation];
            if (v.options && v.options.length) {
              const o = pick(v.options);
              return { text: o.text, label: o.label || it.label };
            }
          }
        }
      }
    }
  }

  // 3. 見つからなければラベルをそのまま text として使う（フォールバック）
  return { text: label, label };
}

/** 複数ラベルを解決して selected に追加（重複 text は避ける） */
function addResolved(labels) {
  const seen = new Set(state.selected.map((s) => s.text));
  for (const lab of labels) {
    if (!lab) continue;
    const r = resolveLabel(lab);
    if (!r || !r.text || seen.has(r.text)) continue;
    seen.add(r.text);
    state.selected.push({ text: r.text, label: r.label, weight: 1.0 });
  }
}

function runRandom() {
  const rnd = state.data && state.data.random;
  if (!rnd) {
    alert("prompts.json に random セクションがありません");
    return;
  }

  // 全消去して上書き
  state.selected = [];

  // --- 段階をランダム選択 ---
  const stageKeys = Object.keys(rnd.stages || {});
  const stageKey = pick(stageKeys) || "mid";
  const stage = rnd.stages[stageKey] || {};

  // --- 体位 or 前戯 をランダム選択（中盤・終盤は体位寄り、導入は前戯寄り） ---
  let group = null;
  let isPosition = false;
  const usePosition = stageKey === "intro" ? Math.random() < 0.35 : Math.random() < 0.65;

  if (usePosition && rnd.positions) {
    const posKeys = Object.keys(rnd.positions);
    const pk = pick(posKeys);
    group = rnd.positions[pk];
    isPosition = true;
  } else if (rnd.foreplay) {
    const fpKeys = Object.keys(rnd.foreplay);
    const fk = pick(fpKeys);
    group = rnd.foreplay[fk];
    isPosition = false;
  } else if (rnd.positions) {
    const posKeys = Object.keys(rnd.positions);
    group = rnd.positions[pick(posKeys)];
    isPosition = true;
  }

  if (!group) {
    update();
    return;
  }

  // --- 行為（acts）を1〜2個 ---
  const actCount = Math.random() < 0.25 ? 2 : 1;
  const acts = pickN(group.acts || [], actCount);
  addResolved(acts);

  // --- 視点（angle / camera / gaze）---
  // グループ固有があれば優先、なければ defaults
  const anglePool = (group.angle && group.angle.length) ? group.angle : (rnd.defaults && rnd.defaults.angle) || [];
  const cameraPool = (group.camera && group.camera.length) ? group.camera : (rnd.defaults && rnd.defaults.camera) || [];
  const gazePool = (group.gaze && group.gaze.length) ? group.gaze : (rnd.defaults && rnd.defaults.gaze) || [];

  addResolved([pick(anglePool)]);
  addResolved([pick(cameraPool)]);
  // gaze は 70% の確率で入れる（目を閉じる等と矛盾しにくいよう任意）
  if (Math.random() < 0.7) addResolved([pick(gazePool)]);

  // --- 体位の場合、overlay（重ね前戯）を確率で ---
  if (isPosition && group.overlay && group.overlay.length && Math.random() < 0.4) {
    addResolved([pick(group.overlay)]);
  }

  // --- 段階別：体液・エフェクト（表情・服装状態は入れない） ---
  // fluid: 1〜2個
  if (stage.fluid && stage.fluid.length) {
    const n = Math.random() < 0.4 ? 2 : 1;
    addResolved(pickN(stage.fluid, n));
  }
  // effect: 1〜2個
  if (stage.effect && stage.effect.length) {
    const n = Math.random() < 0.5 ? 2 : 1;
    addResolved(pickN(stage.effect, n));
  }
  // effectFore: 終盤などで強めに出したいもの（確率低め）
  if (stage.effectFore && stage.effectFore.length && Math.random() < 0.35) {
    addResolved([pick(stage.effectFore)]);
  }

  // --- 挿入の描写など、段階が mid/end で体位のとき追加で少し ---
  // （variations に "挿入の状態" 等がある想定。ラベルで解決できれば入る）
  if (isPosition && (stageKey === "mid" || stageKey === "end") && Math.random() < 0.45) {
    // よくある挿入関連ラベルを候補に（データに存在すれば解決される）
    const insertCandidates = [
      "挿入", "深い挿入", "浅い挿入", "膣内射精", "中出し",
      "アナル挿入", "二穴", "玩具挿入"
    ];
    addResolved([pick(insertCandidates)]);
  }

  update();

  // フィードバック
  const b = $("random");
  const prev = b.textContent;
  b.textContent = "生成しました";
  setTimeout(() => (b.textContent = prev), 1000);
}

init();
