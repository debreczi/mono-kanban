// ============================================================
//  OpenClaw Kanban - Client-side application
// ============================================================

(function () {
  "use strict";

  const COLUMNS = ["backlog", "todo", "in_progress", "review", "on_hold", "done", "wont_do"];
  const API = "/api/tasks";

  // --- DOM refs ---
  const board = document.getElementById("board");
  const overlay = document.getElementById("modal-overlay");
  const modal = document.getElementById("task-modal");
  const form = document.getElementById("task-form");
  const modalTitle = document.getElementById("modal-title");
  const btnNew = document.getElementById("btn-new-task");
  const btnClose = document.getElementById("modal-close");
  const btnCancel = document.getElementById("btn-cancel");
  const btnDelete = document.getElementById("btn-delete");
  const btnSave = document.getElementById("btn-save");
  const fieldId = document.getElementById("task-id");
  const fieldTitle = document.getElementById("field-title");
  const fieldDesc = document.getElementById("field-description");
  const fieldAssignee = document.getElementById("field-assignee");
  const fieldPriority = document.getElementById("field-priority");
  const fieldColumn = document.getElementById("field-column");
  const toastContainer = document.getElementById("toast-container");

  let tasks = [];
  let draggedId = null;

  // --- Utilities ---

  function toast(message, type) {
    type = type || "success";
    var el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  async function api(url, options) {
    try {
      var res = await fetch(url, options);
      if (!res.ok) {
        var body = await res.text();
        throw new Error(body || res.statusText);
      }
      var ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return res.json();
      return null;
    } catch (err) {
      toast("API error: " + err.message, "error");
      throw err;
    }
  }

  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "\u2026" : str;
  }

  // --- Rendering ---

  function renderBoard() {
    // Clear card lists
    COLUMNS.forEach(function (col) {
      var list = document.querySelector('[data-drop="' + col + '"]');
      list.innerHTML = "";
    });

    // Count per column
    var counts = {};
    COLUMNS.forEach(function (c) { counts[c] = 0; });

    tasks.forEach(function (task) {
      var col = task.column || "backlog";
      if (COLUMNS.indexOf(col) === -1) col = "backlog";
      counts[col]++;

      var card = document.createElement("article");
      card.className = "card priority-" + (task.priority || "medium");
      card.setAttribute("draggable", "true");
      card.dataset.id = task.id;

      // Delete button
      var del = document.createElement("button");
      del.className = "card-delete";
      del.setAttribute("aria-label", "Delete task");
      del.innerHTML = "&times;";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteTask(task.id);
      });
      card.appendChild(del);

      // Title
      var title = document.createElement("div");
      title.className = "card-title";
      title.textContent = task.title || "Untitled";
      card.appendChild(title);

      // Description
      if (task.description) {
        var desc = document.createElement("div");
        desc.className = "card-desc";
        desc.textContent = truncate(task.description, 120);
        card.appendChild(desc);
      }

      // Meta row
      var meta = document.createElement("div");
      meta.className = "card-meta";

      if (task.assignee) {
        var badge = document.createElement("span");
        badge.className = "badge-assignee " + task.assignee.toLowerCase();
        badge.textContent = task.assignee;
        meta.appendChild(badge);
      }

      if (task.priority) {
        var pbadge = document.createElement("span");
        pbadge.className = "badge-priority " + task.priority;
        pbadge.textContent = task.priority;
        meta.appendChild(pbadge);
      }

      card.appendChild(meta);

      // Drag events
      card.addEventListener("dragstart", onDragStart);
      card.addEventListener("dragend", onDragEnd);

      // Click to edit
      card.addEventListener("click", function () { openEditModal(task); });

      var list = document.querySelector('[data-drop="' + col + '"]');
      list.appendChild(card);
    });

    // Update count badges
    COLUMNS.forEach(function (col) {
      var badge = document.querySelector('[data-count="' + col + '"]');
      if (badge) badge.textContent = counts[col];
    });
  }

  // --- API actions ---

  async function loadTasks() {
    try {
      tasks = await api(API);
      if (!Array.isArray(tasks)) tasks = [];
    } catch (_) {
      tasks = [];
    }
    renderBoard();
  }

  async function createTask(data) {
    await api(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    toast("Task created");
    await loadTasks();
  }

  async function updateTask(id, data) {
    await api(API + "/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    toast("Task updated");
    await loadTasks();
  }

  async function deleteTask(id) {
    if (!confirm("Delete this task?")) return;
    await api(API + "/" + id, { method: "DELETE" });
    toast("Task deleted");
    await loadTasks();
  }

  // --- Drag & Drop ---

  function onDragStart(e) {
    draggedId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggedId);
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove("dragging");
    draggedId = null;
    // Remove all drag-over highlights
    document.querySelectorAll(".column.drag-over").forEach(function (el) {
      el.classList.remove("drag-over");
    });
    document.querySelectorAll(".drop-placeholder").forEach(function (el) {
      el.parentNode.removeChild(el);
    });
  }

  function initDropZones() {
    COLUMNS.forEach(function (col) {
      var list = document.querySelector('[data-drop="' + col + '"]');
      var column = list.closest(".column");

      column.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        column.classList.add("drag-over");
      });

      column.addEventListener("dragleave", function (e) {
        // Only remove if leaving the column entirely
        if (!column.contains(e.relatedTarget)) {
          column.classList.remove("drag-over");
        }
      });

      column.addEventListener("drop", function (e) {
        e.preventDefault();
        column.classList.remove("drag-over");
        var id = e.dataTransfer.getData("text/plain");
        if (id) {
          updateTask(id, { column: col });
        }
      });
    });
  }

  // --- Modal ---

  function openModal() {
    overlay.hidden = false;
    // Let the browser paint the overlay first so the dialog animation works
    requestAnimationFrame(function () {
      modal.removeAttribute("open"); // reset animation
      requestAnimationFrame(function () {
        modal.setAttribute("open", "");
      });
    });
  }

  function closeModal() {
    overlay.hidden = true;
    form.reset();
    fieldId.value = "";
    btnDelete.hidden = true;
    btnSave.textContent = "Create";
    modalTitle.textContent = "New Task";
  }

  function openCreateModal() {
    closeModal(); // reset
    fieldColumn.value = "backlog";
    fieldPriority.value = "medium";
    fieldAssignee.value = "";
    openModal();
  }

  function openEditModal(task) {
    fieldId.value = task.id;
    fieldTitle.value = task.title || "";
    fieldDesc.value = task.description || "";
    fieldAssignee.value = task.assignee || "";
    fieldPriority.value = task.priority || "medium";
    fieldColumn.value = task.column || "backlog";
    modalTitle.textContent = "Edit Task";
    btnSave.textContent = "Save";
    btnDelete.hidden = false;
    openModal();
  }

  // --- Event wiring ---

  btnNew.addEventListener("click", openCreateModal);
  btnClose.addEventListener("click", closeModal);
  btnCancel.addEventListener("click", closeModal);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });

  btnDelete.addEventListener("click", function () {
    var id = fieldId.value;
    if (id) {
      closeModal();
      deleteTask(id);
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      title: fieldTitle.value.trim(),
      description: fieldDesc.value.trim(),
      assignee: fieldAssignee.value,
      priority: fieldPriority.value,
      column: fieldColumn.value,
    };

    if (!data.title) {
      toast("Title is required", "error");
      return;
    }

    var id = fieldId.value;
    closeModal();
    if (id) {
      updateTask(id, data);
    } else {
      createTask(data);
    }
  });

  // --- Init ---
  initDropZones();
  loadTasks();
})();
