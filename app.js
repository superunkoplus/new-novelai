const state = {
  data: null,
  activeCategory: null,
  positive: [],
  negative: []
};

const categoryList = document.querySelector("#category-list");
const tagList = document.querySelector("#tag-list");
const positiveTags = document.querySelector("#positive-tags");
const negativeTags = document.querySelector("#negative-tags");
const statusMessage = document.querySelector("#status-message");

async function loadPrompts() {
  try {
    const response = await fetch("./prompts.json");
    if (!response.ok) throw new Error("prompts.json を読み込めませんでした。");
    state.data = await response.json();
    state.activeCategory = state.data.categories[0]?.id ?? null;
    renderCategories();
    renderTagButtons();
    renderSelectedTags();
  } catch (error) {
    tagList.textContent = "タグデータを読み込めませんでした。GitHub PagesなどHTTP経由で開いているか、prompts.jsonがあるか確認してください。";
    showStatus(error.message);
  }
}

function renderCategories() {
  categoryList.replaceChildren();
  for (const category of state.data.categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button" + (category.id === state.activeCategory ? " active" : "");
    button.textContent = category.name;
    button.setAttribute("aria-pressed", String(category.id === state.activeCategory));
    button.addEventListener("click", () => {
      state.activeCategory = category.id;
      renderCategories();
      renderTagButtons();
    });
    categoryList.append(button);
  }
}

function getActiveCategory() {
  return state.data.categories.find(category => category.id === state.activeCategory);
}

function renderTagButtons() {
  tagList.replaceChildren();
  const category = getActiveCategory();
  if (!category || !Array.isArray(category.tags) || category.tags.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "このカテゴリーにはまだタグがありません。";
    tagList.append(message);
    return;
  }

  for (const tag of category.tags) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-button";
    button.textContent = tag.label;
    button.title = tag.prompt;
    const target = tag.target === "negative" ? state.negative : state.positive;
    button.disabled = target.some(item => item.prompt === tag.prompt);
    button.addEventListener("click", () => addTag(tag));
    tagList.append(button);
  }
}

function addTag(tag) {
  const target = tag.target === "negative" ? state.negative : state.positive;
  if (target.some(item => item.prompt === tag.prompt)) {
    showStatus("同じタグは重複して追加できません。");
    return;
  }
  target.push({ label: tag.label, prompt: tag.prompt });
  renderSelectedTags();
  renderTagButtons();
  showStatus(`「${tag.label}」を追加しました。`);
}

function renderSelectedTags() {
  renderTagGroup(positiveTags, state.positive, "positive");
  renderTagGroup(negativeTags, state.negative, "negative");
}

function renderTagGroup(container, items, targetName) {
  container.replaceChildren();
  if (items.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "まだタグが選択されていません。";
    container.append(message);
    return;
  }

  items.forEach((item, index) => {
    const chip = document.createElement("div");
    chip.className = "selected-tag";
    const label = document.createElement("span");
    label.textContent = item.prompt;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-tag";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${item.label}を削除`);
    remove.addEventListener("click", () => {
      state[targetName].splice(index, 1);
      renderSelectedTags();
      renderTagButtons();
      showStatus(`「${item.label}」を削除しました。`);
    });
    chip.append(label, remove);
    container.append(chip);
  });
}

function getPrompt(items) {
  return items.map(item => item.prompt).join(", ");
}

async function copyText(text, label) {
  if (!text) {
    showStatus("コピーするタグがありません。");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showStatus(`${label}をコピーしました。`);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    showStatus(copied ? `${label}をコピーしました。` : "コピーできませんでした。テキストを選択してコピーしてください。");
  }
}

function showStatus(message) {
  statusMessage.textContent = message;
}

document.querySelector("#copy-positive").addEventListener("click", () => copyText(getPrompt(state.positive), "通常プロンプト"));
document.querySelector("#copy-negative").addEventListener("click", () => copyText(getPrompt(state.negative), "ネガティブプロンプト"));
document.querySelector("#copy-all").addEventListener("click", () => {
  const text = `通常プロンプト:\n${getPrompt(state.positive)}\n\nネガティブプロンプト:\n${getPrompt(state.negative)}`;
  copyText(text, "両方のプロンプト");
});
document.querySelector("#clear-all").addEventListener("click", () => {
  state.positive = [];
  state.negative = [];
  renderSelectedTags();
  renderTagButtons();
  showStatus("すべてのタグをクリアしました。");
});

loadPrompts();
