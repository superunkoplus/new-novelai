// ===== 状態 =====
const WEIGHTS = [0.8, 1.0, 1.1, 1.2, 1.3, 1.5];
const state = { data: null, tab: 0, selected: [] }; // selected: { text, label, weight }
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

function toggle(text, label) {
  const i = find(text);
  if (i >= 0) state.selected.splice(i, 1);
  else state.selected.push({ text, label, weight: 1.0 });
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
      state.tab = i; window.scrollTo(0, 0); update();
    }));
  });
}

function renderContent() {
  const box = $("content");
  box.innerHTML = "";
  state.data.categories[state.tab].sections.forEach((sec) => {
    if (sec.title) box.appendChild(el("h2", sec.title));
    const row = el("div", "", "buttons");
    sec.items.forEach((it) => {
      if (it.variation) {
        row.appendChild(el("button", it.label, "var", () => openVariation(it.variation)));
      } else {
        const b = el("button", it.label, find(it.text) >= 0 ? "on" : "", () => toggle(it.text, it.label));
        if (it.desc) b.title = it.desc + (it.note ? "\n注意: " + it.note : "");
        row.appendChild(b);
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
  p.innerHTML = "";
  p.appendChild(el("h3", title));
  buttons.forEach((b) => p.appendChild(b));
  p.appendChild(el("button", "閉じる", "close", closePanel));
  $("overlay").hidden = false;
}
function closePanel() { $("overlay").hidden = true; }

function openVariation(key) {
  const v = state.data.variations[key];
  const btns = v.options.map((o) => {
    const b = el("button", o.label, find(o.text) >= 0 ? "on" : "", () => { toggle(o.text, o.label); closePanel(); });
    if (o.desc) b.appendChild(el("small", o.desc));
    return b;
  });
  openPanel(v.title, btns);
}

function openWeight(i) {
  const s = state.selected[i];
  const btns = WEIGHTS.map((w) =>
    el("button", String(w), w === s.weight ? "on" : "", () => { s.weight = w; closePanel(); update(); }));
  btns.push(el("button", "このチップを削除", "danger", () => { state.selected.splice(i, 1); closePanel(); update(); }));
  openPanel((s.label || s.text) + " の重み", btns);
}

// ===== コピー =====
async function copyPrompt() {
  if (!state.selected.length) return;
  let out = state.selected
    .map((s) => (s.weight === 1.0 ? s.text : s.weight + "::" + s.text + "::"))
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
