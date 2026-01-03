// content.js — The Trenches 2026 overlay on all sites

// Same keys as newtab.js (IMPORTANT)
const STORAGE_KEY = "trenches_todos_v1";
const PANEL_STATE_KEY = "trenches_todo_panel_open_v1";
const FAB_POS_KEY = "trenches_fab_pos_v1"; // { x: number, y: number } in px


// Overlay settings
const SETTINGS_KEY = "trenches_overlay_settings_v1";
const DEFAULT_SETTINGS = { enabled: true, position: "top-right" };

// Mount state
let host = null;
let shadow = null;
let els = null;
let todos = [];
let draggedId = null;

// ---- storage helpers ----
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => resolve(res?.[key] ?? null));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

async function getSettings() {
  const s = (await storageGet(SETTINGS_KEY)) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

// ---- ui helpers ----
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function buildSVG() {
  // EXACT icon from newtab.html :contentReference[oaicite:2]{index=2}
  return `
    <svg class="fabIcon" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="none" stroke="#ffffff" stroke-width="3" />
      <circle cx="32" cy="32" r="12" fill="none" stroke="#ffffff" stroke-width="3" />
      <line x1="32" y1="6" x2="32" y2="20" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
      <line x1="32" y1="44" x2="32" y2="58" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
      <line x1="6" y1="32" x2="20" y2="32" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
      <line x1="44" y1="32" x2="58" y2="32" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
      <circle cx="32" cy="32" r="3.2" fill="#ffffff" />
    </svg>
  `;
}
function trapKeysInsideOverlay(shadowRoot) {
  // Capture phase so we intercept before the page (YouTube shortcuts etc.)
  shadowRoot.addEventListener(
    "keydown",
    (e) => {
      const t = e.target;

      const isTypingField =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable === true);

      // Only trap when user is typing in our fields
      if (!isTypingField) return;

      // Stop page-level shortcuts (YouTube: space, k, c, j, l, etc.)
      e.stopPropagation();
    },
    true // capture
  );

  // Some sites listen on keyup too
  shadowRoot.addEventListener(
    "keyup",
    (e) => {
      const t = e.target;

      const isTypingField =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable === true);

      if (!isTypingField) return;
      e.stopPropagation();
    },
    true
  );
}


function setPosition(position) {
  if (!els) return;
  const { fab, panel } = els;

  // reset
  fab.style.top = fab.style.right = fab.style.bottom = fab.style.left = "";
  panel.style.top = panel.style.right = panel.style.bottom = panel.style.left = "";

  const EDGE = "22px";
  const PANEL_OFFSET = "78px";

  switch (position) {
    case "top-left":
      fab.style.top = EDGE;
      fab.style.left = EDGE;
      panel.style.top = PANEL_OFFSET;
      panel.style.left = EDGE;
      break;

    case "bottom-right":
      fab.style.bottom = EDGE;
      fab.style.right = EDGE;
      panel.style.bottom = PANEL_OFFSET;
      panel.style.right = EDGE;
      break;

    case "bottom-left":
      fab.style.bottom = EDGE;
      fab.style.left = EDGE;
      panel.style.bottom = PANEL_OFFSET;
      panel.style.left = EDGE;
      break;

    case "top-right":
    default:
      fab.style.top = EDGE;
      fab.style.right = EDGE;
      panel.style.top = PANEL_OFFSET;
      panel.style.right = EDGE;
      break;
  }
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function applyFabPos(pos) {
  if (!els || !pos) return;
  const { fab } = els;

  // clear corner anchoring
  fab.style.right = "";
  fab.style.bottom = "";

  fab.style.left = `${pos.x}px`;
  fab.style.top = `${pos.y}px`;
}

function updatePanelPlacement() {
  if (!els) return;
  const { fab, panel } = els;
  if (panel.hidden) return;

  const MARGIN = 22;
  const GAP = 10;

  const fabRect = fab.getBoundingClientRect();

  // Temporarily ensure we can measure panel
  const panelRect = panel.getBoundingClientRect();
  const panelW = panelRect.width || 340;
  const panelH = panelRect.height || 240;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer opening DOWN
  const spaceBelow = vh - fabRect.bottom - MARGIN;
  const openUp = spaceBelow < (panelH + GAP);

  // Align panel so its right edge matches the FAB's right edge (premium feel)
  const desiredLeft = fabRect.right - panelW;
  const left = clamp(desiredLeft, MARGIN, vw - panelW - MARGIN);

  let top;
  if (!openUp) {
    top = fabRect.bottom + GAP;
  } else {
    top = fabRect.top - GAP - panelH;
  }
  top = clamp(top, MARGIN, vh - panelH - MARGIN);

  // clear corner anchoring
  panel.style.right = "";
  panel.style.bottom = "";

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}


// ---- render todos (copied logic style from newtab.js) ---- :contentReference[oaicite:3]{index=3}
function renderTodos(listEl, todosArr) {
  listEl.innerHTML = "";

  const indicator = listEl._indicator || document.createElement("div");
  indicator.className = "dropIndicator";
  indicator.classList.remove("active");
  listEl._indicator = indicator;
  listEl.appendChild(indicator);

  function clearReorderHints() {
    for (const el of listEl.querySelectorAll(".task.shiftUp, .task.shiftDown")) {
      el.classList.remove("shiftUp", "shiftDown");
    }
  }

  if (!todosArr.length) {
    const empty = document.createElement("div");
    empty.style.color = "rgba(255,255,255,0.35)";
    empty.style.fontSize = "13px";
    empty.style.padding = "6px 2px";
    empty.textContent = "No tasks.";
    listEl.appendChild(empty);
    return;
  }

  for (const t of todosArr) {
    const row = document.createElement("div");
    row.className = "task";
    row.draggable = true;
    row.dataset.id = t.id;

    row.addEventListener("dragstart", (e) => {
      indicator.classList.add("active");
      draggedId = t.id;

      row.classList.add("dragging");

      // visible ghost
      const ghost = row.cloneNode(true);
      ghost.style.position = "fixed";
      ghost.style.top = "-1000px";
      ghost.style.left = "-1000px";
      ghost.style.width = `${row.offsetWidth}px`;
      ghost.style.pointerEvents = "none";
      ghost.style.opacity = "0.95";
      document.body.appendChild(ghost);

      const rect = row.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const x = Math.max(0, Math.min(offsetX, rect.width));
      const y = Math.max(0, Math.min(offsetY, rect.height));
      e.dataTransfer.setDragImage(ghost, x, y);

      row._ghost = ghost;

      requestAnimationFrame(() => {
        row.style.display = "none";
      });

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.dropEffect = "move";
      e.dataTransfer.setData("text/plain", t.id);
    });

    row.addEventListener("dragend", () => {
      indicator.classList.remove("active");
      row.classList.remove("dragging");
      row.style.display = "";
      draggedId = null;

      clearReorderHints();
      listEl.appendChild(indicator);

      if (row._ghost) {
        row._ghost.remove();
        row._ghost = null;
      }
    });

    row.addEventListener("dragover", (e) => {
      if (!draggedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      indicator.classList.add("active");

      const rect = row.getBoundingClientRect();
      const isBefore = e.clientY < rect.top + rect.height / 2;

      if (isBefore) listEl.insertBefore(indicator, row);
      else listEl.insertBefore(indicator, row.nextSibling);

      clearReorderHints();
      row.classList.add(isBefore ? "shiftDown" : "shiftUp");
    });

    const left = document.createElement("div");
    left.className = "taskLeft";

    const check = document.createElement("button");
    check.className = "taskCheck" + (t.done ? " checked" : "");
    check.type = "button";

    const text = document.createElement("div");
    text.className = "taskText" + (t.done ? " done" : "");
    text.textContent = t.text;

    const del = document.createElement("button");
    del.className = "taskDelete";
    del.type = "button";
    del.textContent = "×";

    check.addEventListener("click", async () => {
      t.done = !t.done;
      await storageSet(STORAGE_KEY, todosArr);
      renderTodos(listEl, todosArr);
    });

    del.addEventListener("click", async () => {
      const next = todosArr.filter((x) => x.id !== t.id);
      todosArr.length = 0;
      todosArr.push(...next);
      await storageSet(STORAGE_KEY, todosArr);
      renderTodos(listEl, todosArr);
    });

    left.appendChild(check);
    left.appendChild(text);

    row.appendChild(left);
    row.appendChild(del);

    listEl.appendChild(row);
  }
}

function bindListDrop(listEl) {
  if (listEl._reorderBound) return;
  listEl._reorderBound = true;

  listEl.addEventListener("dragover", (e) => {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const indicator = listEl._indicator;
    if (!indicator) return;
    indicator.classList.add("active");

    const tasks = Array.from(listEl.querySelectorAll(".task"))
      .filter((el) => !el.classList.contains("dragging") && el.style.display !== "none");

    if (!tasks.length) return;

    const first = tasks[0];
    const last = tasks[tasks.length - 1];

    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    const y = e.clientY;

    if (y < firstRect.top + firstRect.height / 2) {
      listEl.insertBefore(indicator, first);
      return;
    }

    if (y > lastRect.top + lastRect.height / 2) {
      listEl.appendChild(indicator);
      return;
    }
  });

  listEl.addEventListener("drop", async (e) => {
    if (!draggedId) return;
    e.preventDefault();

    const indicator = listEl._indicator;

    // IMPORTANT: ambiguous drop => do nothing
    if (!indicator || !indicator.classList.contains("active")) {
      const hidden = shadow?.querySelector(".task.dragging");
      if (hidden) hidden.style.display = "";
      return;
    }

    indicator.classList.remove("active");

    const draggingEl = shadow?.querySelector(".task.dragging");
    if (draggingEl && draggingEl._ghost) {
      draggingEl._ghost.remove();
      draggingEl._ghost = null;
    }

    const prev = indicator.previousElementSibling;
    let toIndex = 0;

    if (prev && prev.classList.contains("task")) {
      const prevId = prev.dataset.id;
      const prevIndex = todos.findIndex((x) => x.id === prevId);
      toIndex = prevIndex + 1;
    }

    const fromIndex = todos.findIndex((x) => x.id === draggedId);
    const [moved] = todos.splice(fromIndex, 1);

    if (fromIndex < toIndex) toIndex -= 1;
    todos.splice(toIndex, 0, moved);

    await storageSet(STORAGE_KEY, todos);

    const hidden = shadow?.querySelector(".task.dragging");
    if (hidden) hidden.style.display = "";

    renderTodos(listEl, todos);
  });
}

// ---- mount / unmount ----
async function mount() {
  if (host?.isConnected) return;

  host = document.createElement("div");
  host.id = "trenches-overlay-host";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "0";
  host.style.height = "0";

  shadow = host.attachShadow({ mode: "open" });
  trapKeysInsideOverlay(shadow);


  // Load CSS via <link> (reliable)
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("styles/style.css");
  shadow.appendChild(link);
  // IMPORTANT: style.css defines variables in :root.
  // In Shadow DOM, :root doesn't apply, so we re-declare them on :host.
  const vars = document.createElement("style");
  vars.textContent = `
  /* Recreate EXACT New Tab environment */
  :host {
    --bg: #0b0b0d;
    --tile-future: #141418;
    --tile-past: #f3f3f3;
    --tile-today: #ffffff;

    --text: #d6d6d8;
    --muted: #8a8a92;

    --tile: 13px;
    --gap: 5px;
    --radius: 3px;

    --panel: rgba(12, 12, 14, 0.92);
    --panelBorder: rgba(255, 255, 255, 0.08);
    --panelShadow: 0 10px 40px rgba(0, 0, 0, 0.35);
  }

  /* Equivalent of body {} in New Tab */
  :host {
    background: var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }
`;
  shadow.appendChild(vars);




  // Build UI (same structure/classes as newtab.html) :contentReference[oaicite:4]{index=4}
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.id = "fab";
  fab.setAttribute("aria-label", "Open To Do List");
  fab.title = "To Do List";
  fab.innerHTML = buildSVG();

  const panel = document.createElement("aside");
  panel.className = "panel";
  panel.id = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "To Do List panel");

  panel.innerHTML = `
    <div class="panelHeader">
      <div class="panelTitle">To Do List</div>
    </div>

    <form class="panelForm" id="todoForm" autocomplete="off">
      <input class="panelInput" id="todoInput" type="text" placeholder="Add a task…" maxlength="120" />
      <button class="panelAdd" type="submit">Add</button>
    </form>

    <div class="panelList" id="todoList"></div>

    <div class="panelFooter">
      <button class="panelClear" id="clearDone" type="button">Clear done</button>
    </div>
  `;

  // Wrap UI to allow zoom compensation
  const ui = document.createElement("div");
  ui.id = "trenches-ui";

  // IMPORTANT: make it a full-viewport fixed layer.
  // If we scale a transformed parent, children "fixed" behave like absolute inside it.
  // So we must give the parent the same viewport size.
  ui.style.position = "fixed";
  ui.style.inset = "0";
  ui.style.pointerEvents = "none"; // clicks pass through except our widgets

  ui.style.transformOrigin = "top right";
  shadow.appendChild(ui);

  ui.appendChild(fab);
  ui.appendChild(panel);

  // Make sure our widgets remain clickable
  fab.style.pointerEvents = "auto";
  panel.style.pointerEvents = "auto";



  document.documentElement.appendChild(host);


  els = {
    fab,
    panel,
    form: panel.querySelector("#todoForm"),
    input: panel.querySelector("#todoInput"),
    listEl: panel.querySelector("#todoList"),
    clearDoneBtn: panel.querySelector("#clearDone"),
  };

  // Load data
  todos = (await storageGet(STORAGE_KEY)) || [];
  const open = (await storageGet(PANEL_STATE_KEY)) === true;
  panel.hidden = !open;
  if (open) requestAnimationFrame(() => updatePanelPlacement());


  const settings = await getSettings();
  const savedPos = await storageGet(FAB_POS_KEY);

  if (savedPos && typeof savedPos.x === "number" && typeof savedPos.y === "number") {
    applyFabPos(savedPos);
  } else {
    setPosition(settings.position);
  }
  // If panel is already open when this tab mounts, place it correctly
  if (!els.panel.hidden) {
    requestAnimationFrame(() => updatePanelPlacement());
  }



  bindListDrop(els.listEl);
  renderTodos(els.listEl, todos);

  async function openPanel() {
    els.panel.hidden = false;
    await storageSet(PANEL_STATE_KEY, true);

    // Place panel depending on available space (down by default, up if needed)
    requestAnimationFrame(() => updatePanelPlacement());

    els.input.focus();
  }


  async function closePanel() {
    els.panel.hidden = true;
    await storageSet(PANEL_STATE_KEY, false);
  }

  let dragging = false;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let isPointerDown = false;
  let activePointerId = null;


  els.fab.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // left click only
    if (!els) return;

    isPointerDown = true;
    activePointerId = e.pointerId;

    const fab = els.fab;
    fab.setPointerCapture(e.pointerId);

    const rect = fab.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    dragging = false;
    suppressClick = false;
  });


  els.fab.addEventListener("pointermove", (e) => {
    if (!els) return;
    if (!isPointerDown) return;
    if (activePointerId !== e.pointerId) return;
    if ((e.buttons & 1) !== 1) return; // must be holding left button


    const fab = els.fab;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Start drag after a small threshold (so normal clicks still work)
    if (!dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      dragging = true;
      suppressClick = true;
      fab.classList.add("isDragging");

      // When switching to drag mode, remove corner anchoring
      fab.style.right = "";
      fab.style.bottom = "";
    }

    if (!dragging) return;

    const MARGIN = 22;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fabW = fab.offsetWidth || 46;
    const fabH = fab.offsetHeight || 46;

    const x = clamp(e.clientX - offsetX, MARGIN, vw - fabW - MARGIN);
    const y = clamp(e.clientY - offsetY, MARGIN, vh - fabH - MARGIN);

    fab.style.left = `${x}px`;
    fab.style.top = `${y}px`;

    // If panel is open, it follows live
    updatePanelPlacement();
  });

  els.fab.addEventListener("pointerup", async (e) => {
    if (!els) return;

    const fab = els.fab;

    // Only react to the pointer that started the drag
    if (activePointerId !== e.pointerId) return;

    isPointerDown = false;
    activePointerId = null;

    try {
      fab.releasePointerCapture(e.pointerId);
    } catch { }

    if (dragging) {
      fab.classList.remove("isDragging");

      const rect = fab.getBoundingClientRect();
      await storageSet(FAB_POS_KEY, { x: Math.round(rect.left), y: Math.round(rect.top) });

      dragging = false;
      requestAnimationFrame(() => updatePanelPlacement());
      return;
    }

    // Normal click behavior
    if (!suppressClick) {
      if (els.panel.hidden) openPanel();
      else closePanel();
    }
  });

  els.fab.addEventListener("pointercancel", () => {
    if (!els) return;
    isPointerDown = false;
    activePointerId = null;
    dragging = false;
    els.fab.classList.remove("isDragging");
  });



  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els && !els.panel.hidden) closePanel();
  });
  window.addEventListener("resize", () => updatePanelPlacement());


  document.addEventListener("mouseup", () => {
    const hidden = shadow?.querySelector(".task.dragging");
    if (hidden) hidden.style.display = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const hidden = shadow?.querySelector(".task.dragging");
    if (hidden) hidden.style.display = "";
  });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (els.input.value || "").trim();
    if (!text) return;

    todos.push({ id: uid(), text, done: false, createdAt: Date.now() });
    els.input.value = "";
    await storageSet(STORAGE_KEY, todos);
    renderTodos(els.listEl, todos);
  });

  els.clearDoneBtn.addEventListener("click", async () => {
    todos = todos.filter((t) => !t.done);
    await storageSet(STORAGE_KEY, todos);
    renderTodos(els.listEl, todos);
  });

  // Sync if modified elsewhere (newtab or other page)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !els) return;

    if (changes[STORAGE_KEY]) {
      todos = changes[STORAGE_KEY].newValue || [];
      renderTodos(els.listEl, todos);
    }
    if (changes[PANEL_STATE_KEY]) {
      const openNow = changes[PANEL_STATE_KEY].newValue === true;
      els.panel.hidden = !openNow;

      // If opened from another tab/page, place it correctly (up/down)
      if (openNow) requestAnimationFrame(() => updatePanelPlacement());
    }
    if (changes[SETTINGS_KEY]) {
      const s = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
      if (!s.enabled) {
        unmount();
      } else {
        // Respect user's dragged position if it exists
        storageGet(FAB_POS_KEY).then((pos) => {
          if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
            applyFabPos(pos);
            requestAnimationFrame(() => updatePanelPlacement());
          } else {
            setPosition(s.position);
          }
        });
      }
    }

    if (changes[FAB_POS_KEY]) {
      const pos = changes[FAB_POS_KEY].newValue;

      // If pos is valid, apply it live everywhere
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        applyFabPos(pos);
        requestAnimationFrame(() => updatePanelPlacement());
      }
    }

  });
}

function unmount() {
  if (host?.isConnected) host.remove();
  host = null;
  shadow = null;
  els = null;
  todos = [];
  draggedId = null;
}

// Listen for background broadcasts (if you have background.js later)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TRENCHES_SETTINGS" && msg.settings) {
    const s = { ...DEFAULT_SETTINGS, ...msg.settings };
    if (!s.enabled) unmount();
    else mount();
  }
});

// Boot
(async function init() {
  const s = await getSettings();
  if (!s.enabled) return;
  await mount();
})();
