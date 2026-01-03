/* ------------------ Day grid ------------------ */
function startOfYear(year) {
  return new Date(year, 0, 1);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function dayIndexInYear(d) {
  const y0 = startOfYear(d.getFullYear());
  return Math.floor((d - y0) / 86400000);
}

function msToNextLocalMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next - now;
}

/* ------------------ Todo storage helpers ------------------ */
const STORAGE_KEY = "trenches_todos_v1";
const PANEL_STATE_KEY = "trenches_todo_panel_open_v1";

// ✅ New Tab Position setting (same key as overlay settings)
const SETTINGS_KEY = "trenches_overlay_settings_v1";
const DEFAULT_SETTINGS = { position: "top-right" }; // top-right | bottom-right | bottom-left

function storageGet(key) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve(null);
    chrome.storage.local.get([key], (res) => resolve(res?.[key] ?? null));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

async function getSettings() {
  const s = (await storageGet(SETTINGS_KEY)) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

// ✅ Apply New Tab Position (no top-left allowed)
function applyNewTabPositionClass(position) {
  // Default = top-right => aucune classe
  document.body.classList.remove("nt-bottom-right", "nt-bottom-left");

  if (position === "bottom-right") document.body.classList.add("nt-bottom-right");
  if (position === "bottom-left") document.body.classList.add("nt-bottom-left");
}


// ---- Drag state (premium reorder) ----
let draggedId = null;
let dropTargetId = null;
let dropBefore = true;

const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

/* ------------------ Todo UI logic ------------------ */
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function renderTodos(listEl, todos) {
  listEl.innerHTML = "";

  // Drop indicator (reuse single element)
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

  if (!todos.length) {
    const empty = document.createElement("div");
    empty.style.color = "rgba(255,255,255,0.35)";
    empty.style.fontSize = "13px";
    empty.style.padding = "6px 2px";
    empty.textContent = "No tasks.";
    listEl.appendChild(empty);
    return;
  }

  for (const t of todos) {
    const row = document.createElement("div");
    row.className = "task";
    row.draggable = true;
    row.dataset.id = t.id;

    row.addEventListener("dragstart", (e) => {
      indicator.classList.add("active");
      draggedId = t.id;
      dropTargetId = t.id;
      dropBefore = true;

      row.classList.add("dragging");
      // Create a visible drag ghost (so the item still follows the mouse)
      const ghost = row.cloneNode(true);
      ghost.style.position = "fixed";
      ghost.style.top = "-1000px";
      ghost.style.left = "-1000px";
      ghost.style.width = `${row.offsetWidth}px`;
      ghost.style.pointerEvents = "none";
      ghost.style.opacity = "0.95";
      document.body.appendChild(ghost);

      // Use the ghost as the drag image
      const rect = row.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      // clamp
      const x = Math.max(0, Math.min(offsetX, rect.width));
      const y = Math.max(0, Math.min(offsetY, rect.height));

      e.dataTransfer.setDragImage(ghost, x, y);

      // Store ref to remove later
      row._ghost = ghost;

      // Hide the original item AFTER drag has started (otherwise Chrome may cancel the drag)
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
      dropTargetId = null;
      dropBefore = true;

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

      dropTargetId = t.id;
      dropBefore = isBefore;

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
    check.setAttribute("aria-label", t.done ? "Mark as not done" : "Mark as done");

    const text = document.createElement("div");
    text.className = "taskText" + (t.done ? " done" : "");
    text.textContent = t.text;

    const del = document.createElement("button");
    del.className = "taskDelete";
    del.type = "button";
    del.setAttribute("aria-label", "Delete task");
    del.textContent = "×";

    check.addEventListener("click", async () => {
      t.done = !t.done;
      await storageSet(STORAGE_KEY, todos);
      renderTodos(listEl, todos);
    });

    del.addEventListener("click", async () => {
      const next = todos.filter(x => x.id !== t.id);
      todos.length = 0;
      todos.push(...next);
      await storageSet(STORAGE_KEY, todos);
      renderTodos(listEl, todos);
    });

    left.appendChild(check);
    left.appendChild(text);

    row.appendChild(left);
    row.appendChild(del);

    listEl.appendChild(row);
  }
}

async function initTodo() {
  const fab = document.getElementById("fab");
  const panel = document.getElementById("panel");

  const form = document.getElementById("todoForm");
  const input = document.getElementById("todoInput");
  const listEl = document.getElementById("todoList");
  const clearDoneBtn = document.getElementById("clearDone");

  // ✅ Apply New Tab position at startup
  let settings = await getSettings();
  applyNewTabPositionClass(settings.position);


  let todos = (await storageGet(STORAGE_KEY)) || [];
  const panelWasOpen = (await storageGet(PANEL_STATE_KEY)) === true;
  panel.hidden = !panelWasOpen;

  // Bind reorder drop on the whole list
  if (!listEl._reorderBound) {
    listEl._reorderBound = true;

    listEl.addEventListener("dragover", (e) => {
      if (!draggedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const indicator = listEl._indicator;
      if (!indicator) return;
      indicator.classList.add("active");

      const tasks = Array.from(listEl.querySelectorAll(".task"))
        .filter(el => !el.classList.contains("dragging") && el.style.display !== "none");

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

      if (!indicator || !indicator.classList.contains("active")) {
        const hidden = document.querySelector(".task.dragging");
        if (hidden) hidden.style.display = "";
        return;
      }

      indicator.classList.remove("active");

      const draggingEl = document.querySelector(".task.dragging");
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

      const hidden = document.querySelector(".task.dragging");
      if (hidden) hidden.style.display = "";

      renderTodos(listEl, todos);
    });
  }

  async function openPanel() {
    panel.hidden = false;
    await storageSet(PANEL_STATE_KEY, true);
    input.focus();
  }

  async function closePanel() {
    panel.hidden = true;
    await storageSet(PANEL_STATE_KEY, false);
  }

  fab.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  document.addEventListener("mouseup", () => {
    const hidden = document.querySelector(".task.dragging");
    if (hidden) hidden.style.display = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const hidden = document.querySelector(".task.dragging");
    if (hidden) hidden.style.display = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (input.value || "").trim();
    if (!text) return;

    todos.push({ id: uid(), text, done: false, createdAt: Date.now() });
    input.value = "";
    await storageSet(STORAGE_KEY, todos);
    renderTodos(listEl, todos);
  });

  clearDoneBtn.addEventListener("click", async () => {
    const next = todos.filter(t => !t.done);
    todos = next;
    await storageSet(STORAGE_KEY, todos);
    renderTodos(listEl, todos);
  });

  // ✅ Live sync (todos + panel state + NEW TAB POSITION)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    // If we are currently dragging inside New Tab, do not re-render
    if (draggedId) return;

    if (changes[STORAGE_KEY]) {
      todos = changes[STORAGE_KEY].newValue || [];
      renderTodos(listEl, todos);
    }

    if (changes[PANEL_STATE_KEY]) {
      const openNow = changes[PANEL_STATE_KEY].newValue === true;
      panel.hidden = !openNow;
    }

    // ✅ This is the missing part: New Tab reacts to New Tab Position
    if (changes[SETTINGS_KEY]) {
      const next = changes[SETTINGS_KEY].newValue || {};
      settings = { ...DEFAULT_SETTINGS, ...next };
      applyNewTabPositionClass(settings.position);
    }
  });

  renderTodos(listEl, todos);
}

/* ------------------ Init everything ------------------ */
(function init() {
  // ---- grid ----
  const now = new Date();
  const year = 2026;

  const totalDays = isLeapYear(year) ? 366 : 365;
  const todayIndex = (now.getFullYear() === year) ? dayIndexInYear(now) : -1;

  const grid = document.getElementById("grid");
  const title = document.getElementById("title");
  const meta = document.getElementById("meta");

  title.textContent = `The Trenches ${year}`;
  meta.textContent = todayIndex >= 0
    ? `${todayIndex + 1}/${totalDays} days`
    : `0/${totalDays} days`;

  const y0 = startOfYear(year);

  for (let i = 0; i < totalDays; i++) {
    const cell = document.createElement("div");
    cell.className = "day";

    if (todayIndex >= 0) {
      if (i < todayIndex) cell.classList.add("past");
      if (i === todayIndex) cell.classList.add("today");
    }

    const d = new Date(y0);
    d.setDate(y0.getDate() + i);
    const m = d.toLocaleString("fr-FR", { month: "short" });
    cell.title = `${m} ${d.getDate()}`;

    grid.appendChild(cell);
  }

  setTimeout(() => location.reload(), msToNextLocalMidnight() + 250);

  // ---- todo ----
  initTodo();
})();
