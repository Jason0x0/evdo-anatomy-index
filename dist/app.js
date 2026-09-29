const PAGE_SIZE = 24;
const CATEGORY_ORDER = [
  "人体真实结构 / 2024批",
  "人体真实结构 / 藏医与仿真人体",
  "人体真实结构 / 高仿真模型",
  "人体真实结构 / 口腔与颌面颈部",
  "人体真实结构 / 其他",
  "病理人体标本",
  "动物标本",
  "临床与人工材料相关",
];

const STATUS_LABELS = {
  "human-normal": "人体正常结构",
  pathology: "病理人体标本",
  animal: "动物标本",
  review: "需复核",
};

const STATUS_MATCHES = {
  pathology: ["pathology", "human-pathology"],
};

const state = {
  records: [],
  filtered: [],
  page: 1,
  filters: {
    search: "",
    status: "human-normal",
    format: "all",
    category: "all",
  },
};

const elements = {
  categoryRail: document.querySelector("#category-rail"),
  searchInput: document.querySelector("#search-input"),
  statusSelect: document.querySelector("#status-select"),
  formatSelect: document.querySelector("#format-select"),
  resetButton: document.querySelector("#reset-button"),
  emptyReset: document.querySelector("#empty-reset"),
  activeFilters: document.querySelector("#active-filters"),
  resultsGrid: document.querySelector("#results-grid"),
  emptyState: document.querySelector("#empty-state"),
  resultCount: document.querySelector("#result-count"),
  pageSummary: document.querySelector("#page-summary"),
  pageNumber: document.querySelector("#page-number"),
  previousPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  topbarCount: document.querySelector("#topbar-count"),
  statTotal: document.querySelector("#stat-total"),
  statHuman: document.querySelector("#stat-human"),
  statScan: document.querySelector("#stat-scan"),
  statPathology: document.querySelector("#stat-pathology"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function sourceLabel() {
  return "27xxx 编号段";
}

function categoryLabel(category) {
  return String(category || "其他").replace(/^人体真实结构\s*\/\s*/, "");
}

function displayTitle(record) {
  return record.title || record.en_title || `标本 ${record.id}`;
}

function searchableText(record) {
  return [
    record.id,
    record.title,
    record.en_title,
    record.subtitle,
    record.sub_title2,
    record.classification?.category,
    record.classification?.format,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseInitialFilters() {
  const params = new URLSearchParams(window.location.search);
  const allowed = {
    status: ["all", "human-normal", "pathology", "animal", "review"],
    format: ["all", "人体标本", "塑化或铸型标本", "病理标本", "高仿真/仿真人体模型", "未注明"],
  };

  for (const [key, values] of Object.entries(allowed)) {
    const value = params.get(key);
    if (value && values.includes(value)) state.filters[key] = value;
  }

  const category = params.get("category");
  if (category && CATEGORY_ORDER.includes(category)) state.filters.category = category;
  state.filters.search = params.get("q") || "";
}

function syncUrl() {
  const params = new URLSearchParams();
  const { search, status, format, category } = state.filters;
  if (search) params.set("q", search);
  if (status !== "human-normal") params.set("status", status);
  if (format !== "all") params.set("format", format);
  if (category !== "all") params.set("category", category);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function getCategoryCounts(records) {
  return records.reduce((counts, record) => {
    const category = record.classification?.category || "其他";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
}

function renderCategoryRail() {
  const counts = getCategoryCounts(state.records);
  const humanCount = state.records.filter((record) => record.classification?.status === "human-normal").length;
  const items = [
    { value: "all", label: "人体正常结构", count: humanCount, special: true },
    ...CATEGORY_ORDER.filter((category) => counts[category]).map((category) => ({
      value: category,
      label: categoryLabel(category),
      count: counts[category],
    })),
  ];

  elements.categoryRail.innerHTML = items
    .map((item) => {
      const isActive = item.special
        ? state.filters.category === "all" && state.filters.status === "human-normal"
        : state.filters.category === item.value;
      return `<button class="category-item${isActive ? " is-active" : ""}" type="button" data-category="${escapeHtml(item.value)}" data-special="${item.special ? "true" : "false"}">
        <span class="category-item-label">${escapeHtml(item.label)}</span>
        <span class="category-item-count">${formatNumber(item.count)}</span>
      </button>`;
    })
    .join("");

  elements.categoryRail.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const isSpecial = button.dataset.special === "true";
      state.filters.category = isSpecial ? "all" : button.dataset.category;
      state.filters.status = isSpecial ? "human-normal" : "all";
      state.page = 1;
      syncControls();
      render();
    });
  });
}

function matchesFilter(record) {
  const classification = record.classification || {};
  const { search, status, format, category } = state.filters;
  const statusMatch = status === "all"
    || (STATUS_MATCHES[status] || [status]).includes(classification.status);
  const formatMatch = format === "all" || classification.format === format;
  const categoryMatch = category === "all" || classification.category === category;
  const searchMatch = !search || searchableText(record).includes(search.toLowerCase());
  return statusMatch && formatMatch && categoryMatch && searchMatch;
}

function cardMarkup(record) {
  const classification = record.classification || {};
  const title = displayTitle(record);
  const thumb = record.thumb ? escapeHtml(record.thumb) : "";
  const reason = classification.reason || "依据公开名称与分类字段整理。";
  const image = thumb
    ? `<img data-src="${thumb}" alt="${escapeHtml(title)} 缩略图" loading="lazy" />`
    : "";
  return `<article class="specimen-card">
    <div class="card-image">
      <div class="image-fallback" aria-hidden="true"></div>
      ${image}
      <div class="card-image-badges">
        <span class="id-badge">#${escapeHtml(record.id)}</span>
        <span class="source-badge">${escapeHtml(sourceLabel())}</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="category-badge">${escapeHtml(categoryLabel(classification.category))}</span>
        <span class="format-badge">${escapeHtml(classification.format || "未注明")}</span>
      </div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-reason">${escapeHtml(reason)}</p>
      <div class="card-actions">
        <a class="card-action card-action-primary" href="${escapeHtml(record.sourceUrl)}" target="_blank" rel="noreferrer">查看原站</a>
        <button class="card-action" type="button" data-copy-id="${escapeHtml(record.id)}">复制编号</button>
      </div>
    </div>
  </article>`;
}

function loadCardImages() {
  elements.resultsGrid.querySelectorAll("img[data-src]").forEach((image) => {
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = image.dataset.src;
  });
}

function renderActiveFilters() {
  const chips = [];
  const { search, status, format, category } = state.filters;
  if (search) chips.push(["search", `关键词：${search}`]);
  if (status !== "human-normal") chips.push(["status", `状态：${status === "all" ? "全部状态" : STATUS_LABELS[status]}`]);
  if (format !== "all") chips.push(["format", `格式：${format}`]);
  if (category !== "all") chips.push(["category", `分类：${categoryLabel(category)}`]);

  elements.activeFilters.innerHTML = chips
    .map(([key, label]) => `<span class="filter-chip">${escapeHtml(label)}<button type="button" data-clear-filter="${key}" aria-label="清除${escapeHtml(label)}">×</button></span>`)
    .join("");

  elements.activeFilters.querySelectorAll("[data-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.clearFilter;
      state.filters[key] = key === "status" ? "human-normal" : key === "category" ? "all" : key === "search" ? "" : "all";
      state.page = 1;
      syncControls();
      render();
    });
  });
}

function renderPagination(total) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, pageCount);
  const first = total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(state.page * PAGE_SIZE, total);
  elements.pageSummary.textContent = total ? `显示 ${formatNumber(first)}–${formatNumber(last)} 条` : "没有记录";
  elements.pageNumber.textContent = `${state.page} / ${pageCount}`;
  elements.previousPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= pageCount;
}

function render() {
  state.filtered = state.records.filter(matchesFilter);
  const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageRecords = state.filtered.slice(start, start + PAGE_SIZE);

  elements.resultsGrid.innerHTML = pageRecords.map(cardMarkup).join("");
  elements.resultsGrid.hidden = pageRecords.length === 0;
  elements.emptyState.hidden = pageRecords.length !== 0;
  elements.resultCount.textContent = `${formatNumber(state.filtered.length)} 条匹配记录`;
  renderPagination(state.filtered.length);
  renderActiveFilters();
  renderCategoryRail();
  loadCardImages();
  bindCopyButtons();
  syncUrl();
}

function syncControls() {
  elements.searchInput.value = state.filters.search;
  elements.statusSelect.value = state.filters.status;
  elements.formatSelect.value = state.filters.format;
}

function resetFilters() {
  state.filters = { search: "", status: "human-normal", format: "all", category: "all" };
  state.page = 1;
  syncControls();
  render();
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

async function copyId(id) {
  const text = String(id);
  try {
    await navigator.clipboard.writeText(text);
    showToast(`已复制编号 ${text}`);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast(`已复制编号 ${text}`);
  }
}

function bindCopyButtons() {
  elements.resultsGrid.querySelectorAll("[data-copy-id]").forEach((button) => {
    button.addEventListener("click", () => copyId(button.dataset.copyId));
  });
}

function bindControls() {
  elements.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim();
    state.page = 1;
    render();
  });
  elements.statusSelect.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    state.page = 1;
    state.filters.category = "all";
    render();
  });
  elements.formatSelect.addEventListener("change", (event) => {
    state.filters.format = event.target.value;
    state.page = 1;
    render();
  });
  elements.resetButton.addEventListener("click", resetFilters);
  elements.emptyReset.addEventListener("click", resetFilters);
  elements.previousPage.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      render();
      document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  elements.nextPage.addEventListener("click", () => {
    const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page < pageCount) {
      state.page += 1;
      render();
      document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.searchInput && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      elements.searchInput.focus();
    }
  });
}

function updateStats(data) {
  const pathologyCount = data.records.filter((record) => STATUS_MATCHES.pathology.includes(record.classification?.status)).length;
  elements.statTotal.textContent = formatNumber(data.totalUniqueRecords || data.records.length);
  elements.statHuman.textContent = formatNumber(data.humanNormalCount);
  elements.statScan.textContent = formatNumber(data.scan?.validExternalRecords || data.records.length);
  elements.statPathology.textContent = formatNumber(pathologyCount);
  elements.topbarCount.textContent = `${formatNumber(data.totalUniqueRecords || data.records.length)} 条记录`;
}

async function loadData() {
  parseInitialFilters();
  syncControls();
  bindControls();
  try {
    const manifestResponse = await fetch("./data/manifest.json", { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const chunks = await Promise.all(
      manifest.chunks.map(async (chunk) => {
        const response = await fetch(`./data/${chunk}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${chunk}`);
        return response.json();
      }),
    );
    const data = { ...manifest, records: chunks.flat() };
    state.records = Array.isArray(data.records) ? data.records : [];
    updateStats(data);
    render();
  } catch (error) {
    elements.resultsGrid.hidden = true;
    elements.emptyState.hidden = false;
    elements.emptyState.querySelector("h3").textContent = "目录载入失败";
    elements.emptyState.querySelector("p").textContent = "请刷新页面，或检查 data.json 是否可访问。";
    elements.resultCount.textContent = "载入失败";
    console.error("EVDO index load failed", error);
  }
}

loadData();
