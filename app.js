const state = {
  view: "all",
  status: "all",
  query: "",
  page: 1,
  pageSize: 25,
  layout: "rows",
  total: 0,
  activeSource: null,
};

const rows = document.getElementById("rows");
const search = document.getElementById("search");
const crumbView = document.getElementById("crumb-view");
const libraryTitle = document.getElementById("library-title");
const librarySubtitle = document.getElementById("library-subtitle");
const pagination = document.getElementById("pagination");
const toast = document.getElementById("toast");
const backdrop = document.getElementById("drawer-backdrop");
const drawerBadge = document.getElementById("drawer-badge");
const drawerTitle = document.getElementById("drawer-title");
const drawerMeta = document.getElementById("drawer-meta");
const drawerSummary = document.getElementById("drawer-summary");
const drawerTags = document.getElementById("drawer-tags");
const drawerStatus = document.getElementById("drawer-status");
const drawerReportTitle = document.getElementById("drawer-report-title");
const drawerReportCopy = document.getElementById("drawer-report-copy");
const drawerBody = document.getElementById("drawer-body");
const drawerReportBody = document.getElementById("drawer-report-body");
let toastTimer;
let searchTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function stripFrontmatter(markdown) {
  const text = String(markdown ?? "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) return text;
  const closing = text.indexOf("\n---\n", 4);
  return closing >= 0 ? text.slice(closing + 5) : text;
}

function safeHref(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return escapeHtml(url.href);
  } catch {
    return "";
  }
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => {
    const href = safeHref(url);
    return href ? `<figure><a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${href}" alt="${alt}" loading="lazy"></a><figcaption>${alt}</figcaption></figure>` : `<span>[Image : ${alt}]</span>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  return html;
}

function renderMarkdown(markdown) {
  const lines = stripFrontmatter(markdown).split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let quote = [];
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) return;
    output.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushQuote = () => {
    if (quote.length) output.push(`<blockquote>${inlineMarkdown(quote.join(" "))}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flushAll();
      if (code === null) code = [];
      else {
        output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    if (!trimmed) {
      flushAll();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^-{3,}\s*$/.test(trimmed)) {
      flushAll();
      output.push("<hr>");
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(unordered[1]);
      continue;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(ordered[1]);
      continue;
    }
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }
  if (code !== null) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushAll();
  return output.join("") || "<p>Aucun contenu lisible disponible.</p>";
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", withTime ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function typeLabel(type) {
  return type === "youtube" ? "YouTube" : "Tweet";
}

function statusClass(status) {
  return ["pending", "running", "done", "warning"].includes(status) ? status : "warning";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setConnectedLabels(stats) {
  document.querySelector(".brand-note").textContent = "Cockpit / connecté";
  document.querySelector(".demo-pill").textContent = "Sources réelles";
  document.querySelector(".sync-pill").textContent = `Supabase + Obsidian · ${formatDate(stats.youtubeSyncAt, true)}`;
  document.querySelector(".sidebar-card p").textContent = "Lecture connectée. Obsidian reste la source canonique des notes YouTube.";
  document.querySelector(".hero-copy p").textContent = "Un seul espace pour parcourir les tweets, les notes YouTube et les décisions issues des reviews réelles.";
  document.querySelector("#sync-button").textContent = "Actualiser";
}

function renderStats(stats) {
  const kpis = document.querySelectorAll(".kpi");
  if (kpis.length < 4) return;
  kpis[0].querySelector(".kpi-value").textContent = formatNumber(stats.total);
  kpis[0].querySelector(".kpi-meta").innerHTML = `<b>${formatNumber(stats.tweets)} tweets</b> · ${formatNumber(stats.youtube)} YouTube`;
  kpis[1].querySelector(".kpi-value").textContent = String(stats.running).padStart(2, "0");
  kpis[1].querySelector(".kpi-meta").innerHTML = `${formatNumber(stats.running)} source(s) réservée(s) · ${formatNumber(stats.warning)} à reprendre`;
  kpis[2].querySelector(".kpi-value").textContent = formatNumber(stats.reports);
  kpis[2].querySelector(".kpi-meta").textContent = `${formatNumber(stats.reviews)} reviews suivies · Supabase`;
  kpis[3].querySelector(".kpi-value").textContent = stats.youtubeSyncAt ? formatDate(stats.youtubeSyncAt, true).split(" ").slice(-1)[0] : "—";
  kpis[3].querySelector(".kpi-meta").innerHTML = `Miroir Obsidian · <b>${stats.youtubeSyncAt ? "stable" : "absent"}</b>`;
  const counts = { all: stats.total, tweet: stats.tweets, youtube: stats.youtube, review: stats.reviews };
  document.querySelectorAll(".nav button").forEach((button) => {
    const count = button.querySelector(".nav-count");
    if (count) count.textContent = formatNumber(counts[button.dataset.view] || 0);
  });
}

function renderQueue(queue) {
  const list = document.querySelector(".queue-list");
  if (!list) return;
  list.innerHTML = queue.map((item, index) => `
    <div class="queue-item">
      <span class="queue-dot queue-dot-${escapeHtml(item.status)}"></span>
      <div><div class="queue-name">${escapeHtml(item.label)}</div><div class="queue-type">${escapeHtml(item.kind)}</div></div>
      <span class="queue-count">${formatNumber(item.count)}</span>
    </div>
  `).join("");
}

function renderViewLabels() {
  const labels = { all: "Vue globale", tweet: "Tweets", youtube: "YouTube", review: "Reviews" };
  const descriptions = {
    all: "Les sources réelles les plus récentes apparaissent en premier.",
    tweet: "Les tweets enrichis depuis la vue Supabase.",
    youtube: "Les notes Markdown miroir d’Obsidian.",
    review: "Les sources réservées, terminées ou à reprendre.",
  };
  crumbView.textContent = labels[state.view];
  libraryTitle.textContent = state.view === "review" ? "Suivi des reviews" : state.view === "all" ? "Bibliothèque active" : labels[state.view];
  librarySubtitle.textContent = descriptions[state.view];
}

function renderRows(items) {
  if (!items.length) {
    rows.innerHTML = '<div class="empty"><strong>Aucune source dans cette vue.</strong>Modifie la recherche ou le filtre.</div>';
    return;
  }
  rows.innerHTML = items.map((source) => `
    <article class="item-row" data-source-type="${escapeHtml(source.type)}" data-reference="${escapeHtml(source.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHtml(source.title)}">
      <div class="source-cell"><span class="source-badge ${escapeHtml(source.type)}">${typeLabel(source.type)}</span></div>
      <div class="item-main"><span class="item-title">${escapeHtml(source.title)}</span><span class="item-summary">${escapeHtml(source.summary)}</span></div>
      <div class="item-author">${escapeHtml(source.author)}</div>
      <div class="item-date">${escapeHtml(formatDate(source.date))}</div>
      <div class="status-cell"><span class="status ${statusClass(source.status)}">${escapeHtml(source.statusLabel)}</span></div>
      <button class="row-open" data-open-type="${escapeHtml(source.type)}" data-open-reference="${escapeHtml(source.id)}" type="button" aria-label="Voir le détail">↗</button>
    </article>
  `).join("");
  rows.querySelectorAll("[data-source-type]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openDrawer(element.dataset.sourceType, element.dataset.reference);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDrawer(element.dataset.sourceType, element.dataset.reference);
      }
    });
  });
  rows.querySelectorAll("[data-open-type]").forEach((button) => button.addEventListener("click", () => openDrawer(button.dataset.openType, button.dataset.openReference)));
}

function renderPagination(meta) {
  state.total = Number(meta.total || 0);
  const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
  pagination.innerHTML = `
    <span>${formatNumber(state.total)} source(s) · page ${state.page}/${pages}</span>
    <span class="pagination-actions">
      <button class="secondary" type="button" data-page="prev" ${state.page <= 1 ? "disabled" : ""}>Précédente</button>
      <button class="secondary" type="button" data-page="next" ${state.page >= pages ? "disabled" : ""}>Suivante</button>
    </span>
  `;
  pagination.querySelector('[data-page="prev"]')?.addEventListener("click", () => { state.page -= 1; loadSources(); });
  pagination.querySelector('[data-page="next"]')?.addEventListener("click", () => { state.page += 1; loadSources(); });
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({ ok: false, error: "invalid_response" }));
  if (!response.ok) {
    const error = new Error(payload.error || "request_failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadSources() {
  rows.innerHTML = '<div class="empty"><strong>Chargement des sources.</strong>Lecture de la page demandée.</div>';
  const params = new URLSearchParams({ view: state.view, status: state.status, q: state.query, page: String(state.page), pageSize: String(state.pageSize) });
  try {
    const payload = await getJson(`/api/sources?${params.toString()}`);
    renderRows(payload.data || []);
    renderPagination(payload.meta || { total: 0 });
  } catch (error) {
    rows.innerHTML = `<div class="empty"><strong>Lecture indisponible.</strong>${error.status === 401 ? "Authentification requise." : "La source de données ne répond pas."}</div>`;
    showToast("La lecture des sources a échoué.");
  }
}

async function loadBootstrap() {
  try {
    const payload = await getJson(`/api/bootstrap?view=${encodeURIComponent(state.view)}&status=${encodeURIComponent(state.status)}&q=${encodeURIComponent(state.query)}&page=${state.page}&pageSize=${state.pageSize}`);
    setConnectedLabels(payload.stats);
    renderStats(payload.stats);
    renderQueue(payload.queue || []);
    renderRows(payload.data || []);
    renderPagination(payload.meta || { total: 0 });
  } catch (error) {
    rows.innerHTML = '<div class="empty"><strong>Connexion indisponible.</strong>Le dashboard ne peut pas lire les données réelles.</div>';
    showToast(error.status === 401 ? "Authentification requise." : "La connexion aux données a échoué.");
  }
}

function clearDrawer() {
  drawerTitle.textContent = "Titre de la source";
  drawerMeta.textContent = "Auteur · date · état";
  drawerSummary.textContent = "";
  drawerTags.innerHTML = "";
  drawerStatus.innerHTML = "";
  drawerReportTitle.textContent = "Aucun rapport";
  drawerReportCopy.textContent = "Cette source attend encore une analyse.";
  drawerBody.innerHTML = "";
  drawerReportBody.innerHTML = "";
}

async function openDrawer(type, reference) {
  clearDrawer();
  drawerBadge.className = `source-badge ${type}`;
  drawerBadge.textContent = typeLabel(type);
  drawerTitle.textContent = "Lecture de la source…";
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  try {
    const payload = await getJson(`/api/source?type=${encodeURIComponent(type)}&id=${encodeURIComponent(reference)}`);
    const source = payload.source;
    state.activeSource = source;
    drawerBadge.className = `source-badge ${source.type}`;
    drawerBadge.textContent = typeLabel(source.type);
    drawerTitle.textContent = source.title;
    drawerMeta.textContent = `${source.author} · ${formatDate(source.date)}${source.originalPath ? ` · ${source.originalPath}` : ""}`;
    drawerSummary.textContent = source.summary || "Aucun résumé disponible.";
    drawerTags.innerHTML = (source.tags || []).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("") || '<span class="detail-copy">Aucun tag.</span>';
    drawerStatus.innerHTML = `<span class="status ${statusClass(source.status)}">${escapeHtml(source.statusLabel)}</span>`;
    drawerBody.innerHTML = renderMarkdown(source.bodyMarkdown || "");
    if (source.report) {
      drawerReportTitle.textContent = source.report.name || "Rapport associé";
      drawerReportCopy.textContent = `Créé le ${formatDate(source.report.createdAt)} · digest ${source.report.digest.slice(0, 12)}…`;
      drawerReportBody.innerHTML = renderMarkdown(source.report.body || "");
    } else {
      drawerReportTitle.textContent = "Aucun rapport disponible";
      drawerReportCopy.textContent = source.review ? "La review existe, mais son rapport n’est pas présent dans le miroir." : "Cette source attend encore une analyse.";
    }
    document.getElementById("close-drawer").focus();
  } catch {
    showToast("La source n’a pas pu être chargée.");
  }
}

function closeDrawer() {
  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");
  state.activeSource = null;
}

async function requestReview() {
  if (!state.activeSource) return;
  try {
    await getJson("/api/reviews/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: state.activeSource.type, identity: state.activeSource.identity }),
    });
    showToast("Review envoyée au pont serveur.");
  } catch (error) {
    if (error.message === "review_bridge_not_configured") {
      showToast("Le pont de review n’est pas configuré. Aucune action n’a été simulée.");
    } else {
      showToast("La review n’a pas été lancée.");
    }
  }
}

function setView(view) {
  state.view = view;
  state.status = "all";
  state.page = 1;
  document.querySelectorAll(".nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".filter").forEach((button) => button.classList.toggle("active", button.dataset.status === "all"));
  renderViewLabels();
  loadSources();
}

document.querySelectorAll(".nav button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.status = button.dataset.status;
  state.page = 1;
  loadSources();
}));
document.querySelectorAll(".view-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".view-tabs button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.layout = button.dataset.layout;
  showToast(state.layout === "cards" ? "La vue cartes sera ajoutée après la connexion des sources." : "Vue lignes active.");
}));
search.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.page = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadSources, 280);
});
document.getElementById("close-drawer").addEventListener("click", closeDrawer);
backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeDrawer(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });
document.getElementById("drawer-review").addEventListener("click", requestReview);
document.getElementById("drawer-source").addEventListener("click", () => {
  if (state.activeSource?.url) window.open(state.activeSource.url, "_blank", "noopener,noreferrer");
  else showToast("Cette source n’a pas d’URL externe.");
});
document.getElementById("sync-button").addEventListener("click", () => { loadBootstrap(); showToast("Données rechargées depuis Supabase."); });
document.getElementById("review-next").addEventListener("click", () => { state.status = "pending"; state.view = "all"; state.page = 1; document.querySelector('[data-view="all"]').click(); document.querySelector('[data-status="pending"]').classList.add("active"); loadSources(); });
document.getElementById("open-queue").addEventListener("click", () => setView("review"));

renderViewLabels();
loadBootstrap();
