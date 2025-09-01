const App = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString() : '';
  const KEY = "organizer:v1";
  const defaultState = () => ({
    projects: [
      { id: "inbox", name: "Inbox", color: "#2dd4bf", createdAt: Date.now() }
    ],
    tasks: [],
    notes: []
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.projects?.some(p => p.id === "inbox")) {
        parsed.projects = [{ id: "inbox", name: "Inbox", color: "#2dd4bf", createdAt: Date.now() }, ...(parsed.projects || [])];
      }
      parsed.tasks ||= [];
      parsed.notes ||= [];
      return parsed;
    } catch {
      return defaultState();
    }
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    refreshOverview();
  }
  function resetAll() {
    if (!confirm("This will delete ALL your local data. Continue?")) return;
    state = defaultState();
    save();
    location.reload();
  }
  // ---------- Projects ----------
  function getProjectById(id) { return state.projects.find(p => p.id === id); }
  function renderProjectOptions(selects) {
    selects.forEach(sel => {
      sel.innerHTML = "";
      state.projects.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id; opt.textContent = p.name;
        if (p.id === "inbox") opt.textContent = "Inbox";
        sel.appendChild(opt);
      });
    });
  }
  function addProject(name, color) {
    const id = uid();
    state.projects.push({ id, name: name.trim(), color, createdAt: Date.now() });
    save(); renderProjects(); renderProjectOptions([$("#taskProject"), $("#quickTaskProject")]);
  }
  function updateProject(id, name, color) {
    const p = getProjectById(id);
    if (!p || p.id === "inbox") return;
    p.name = name.trim(); p.color = color;
    save(); renderProjects(); renderProjectOptions([$("#taskProject"), $("#quickTaskProject")]);
  }
  function deleteProject(id) {
    if (id === "inbox") return;
    state.tasks.forEach(t => { if (t.projectId === id) t.projectId = "inbox"; });
    state.projects = state.projects.filter(p => p.id !== id);
    save(); renderProjects(); renderKanban(); renderProjectOptions([$("#taskProject"), $("#quickTaskProject")]);
  }
  function renderProjects() {
    const grid = $("#projectGrid");
    grid.innerHTML = "";
    state.projects.forEach(p => {
      const tasks = state.tasks.filter(t => t.projectId === p.id);
      const card = document.createElement("div");
      card.className = "card project-card";
      card.innerHTML = `
        <div class="row-between">
          <h3 class="row gap"><span style="display:inline-block;width:12px;height:12px;border-radius:999px;background:${p.color}"></span>${p.name}</h3>
          ${p.id !== "inbox" ? `<button class="icon-btn edit">edit</button>` : ""}
        </div>
        <div class="muted small">${tasks.length} tasks</div>
      `;
      if (p.id !== "inbox") {
        card.querySelector(".edit").addEventListener("click", () => openProjectModal(p));
      }
      grid.appendChild(card);
    });
  }
  function newTask({
    title, description="", projectId="inbox", priority="medium",
    dueDate="", tags=[], status="todo"
  }) {
    return {
      id: uid(),
      title: title.trim(),
      description: description.trim(),
      projectId,
      priority,
      dueDate,
      tags,
      status,
      createdAt: Date.now(),
      order: Date.now(),
      completed: status === "done"
    };
  }
  function addTask(task) {
    state.tasks.push(task);
    save(); renderKanban(); renderProjects(); refreshOverview();
  }
  function updateTask(id, changes) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    Object.assign(t, changes);
    if (t.status === "done") t.completed = true;
    save(); renderKanban(); renderProjects(); refreshOverview();
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    save(); renderKanban(); renderProjects(); refreshOverview();
  }

  const filters = { q:"" };
  function filterTasks(list) {
    return list.filter(t => {
      if (filters.q) {
        const hay = [t.title, t.description, (t.tags||[]).join(",")].join(" ").toLowerCase();
        if (!hay.includes(filters.q.toLowerCase())) return false;
      }
      return true;
    });
  }

  function taskCardElement(task) {
    const tpl = $("#taskCardTemplate").content.cloneNode(true);
    const el = tpl.querySelector(".task-card");
    el.dataset.id = task.id;

    const title = el.querySelector(".task-title"); title.textContent = task.title;
    const pDot = el.querySelector(".priority-dot");
    pDot.classList.add(task.priority === "high" ? "priority-high" : task.priority === "low" ? "priority-low" : "priority-medium");

    const projectPill = el.querySelector(".project-pill");
    const pr = getProjectById(task.projectId);
    projectPill.textContent = pr ? pr.name : "—";
    projectPill.style.background = pr ? pr.color + '33' : '';
    projectPill.style.border = `1px solid ${pr ? pr.color : 'transparent'}`;

    el.querySelector(".due").textContent = task.dueDate ? `Due: ${fmtDate(task.dueDate)}` : "";

    const tagsWrap = el.querySelector(".tags");
    (task.tags || []).forEach(tag => {
      const span = document.createElement("span");
      span.className = "tag"; span.textContent = tag;
      tagsWrap.appendChild(span);
    });

    el.querySelector(".edit").addEventListener("click", () => openTaskModal(task));
    el.querySelector(".delete").addEventListener("click", () => { if (confirm("Delete task?")) deleteTask(task.id); });
    const chk = el.querySelector(".complete-toggle");
    chk.checked = task.completed;
    chk.addEventListener("change", () => {
      updateTask(task.id, { status: chk.checked ? "done" : "todo", completed: chk.checked });
    });
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", task.id);
      e.dataTransfer.effectAllowed = "move";
    });

    return el;
  }

  function renderKanban() {
    const zones = { todo: $("#todoZone"), doing: $("#doingZone"), done: $("#doneZone") };
    Object.values(zones).forEach(z => z.innerHTML = "");
    const list = filterTasks([...state.tasks].sort((a,b) => a.order - b.order));

    const counts = { todo:0, doing:0, done:0 };
    list.forEach(task => {
      counts[task.status]++; zones[task.status].appendChild(taskCardElement(task));
    });
    $("#todoCount").textContent = counts.todo;
    $("#doingCount").textContent = counts.doing;
    $("#doneCount").textContent = counts.done;
  }

  function setupKanbanDnD() {
    $$(".dropzone").forEach(zone => {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault(); zone.classList.remove("dragover");
        const id = e.dataTransfer.getData("text/plain"); if (!id) return;
        const status = zone.closest(".kanban-col").dataset.status;
        const now = Date.now();
        updateTask(id, { status, order: now, completed: status === "done" });
      });
    });
  }

  let editingTaskId = null;

  function openTaskModal(task = null) {
    editingTaskId = task?.id || null;
    $("#taskModalTitle").textContent = editingTaskId ? "Edit Task" : "New Task";
    $("#deleteTaskBtn").hidden = !editingTaskId;

    $("#taskTitle").value = task?.title || "";
    $("#taskDesc").value = task?.description || "";
    $("#taskProject").value = task?.projectId || "inbox";
    $("#taskPriority").value = task?.priority || "medium";
    $("#taskDue").value = task?.dueDate || "";
    $("#taskTags").value = (task?.tags || []).join(", ");
    $("#taskModal").showModal();
  }
  function closeTaskModal(){ $("#taskModal").close(); }
  function addNote(text) {
    state.notes.unshift({ id: uid(), content: text.trim(), createdAt: Date.now() });
    save(); renderNotes();
  }
  function updateNote(id, content) {
    const n = state.notes.find(n => n.id === id); if (!n) return;
    n.content = content.trim(); n.createdAt = Date.now();
    save(); renderNotes();
  }
  function deleteNote(id) {
    state.notes = state.notes.filter(n => n.id !== id);
    save(); renderNotes();
  }
  function renderNotes() {
    const grid = $("#noteList"); grid.innerHTML = "";
    state.notes.forEach(n => {
      const el = document.createElement("div");
      el.className = "note";
      el.innerHTML = `
        <textarea rows="6">${n.content}</textarea>
        <div class="row-between">
          <span class="muted small">${new Date(n.createdAt).toLocaleString()}</span>
          <div class="note-actions">
            <button class="secondary save">Save</button>
            <button class="danger delete">Delete</button>
          </div>
        </div>
      `;
      el.querySelector(".save").addEventListener("click", () => {
        const txt = el.querySelector("textarea").value;
        updateNote(n.id, txt);
      });
      el.querySelector(".delete").addEventListener("click", () => {
        if (confirm("Delete note?")) deleteNote(n.id);
      });
      grid.appendChild(el);
    });
  }

  function refreshOverview(){
    const box = $("#overviewStats");
    if (!box) return;
    const total = state.tasks.length;
    const done = state.tasks.filter(t=>t.status==="done").length;
    const dueToday = state.tasks.filter(t=>t.dueDate===todayStr()).length;

    box.innerHTML = `
      <div class="stat"><div class="num">${total}</div><div class="muted">Total Tasks</div></div>
      <div class="stat"><div class="num">${done}</div><div class="muted">Completed</div></div>
      <div class="stat"><div class="num">${dueToday}</div><div class="muted">Due Today</div></div>
    `;
  }

  // ---------- Event bindings ----------
  function bindGlobal(){
$("#loginBtn").addEventListener("click", openLoginPanel);
$("#closeLogin").addEventListener("click", closeLoginPanel);
$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  closeLoginPanel(); 
});
document.addEventListener("click", (e) => {
  if ($("#loginPanel").classList.contains("open") && 
      !e.target.closest("#loginPanel") && 
      !e.target.closest("#loginBtn")) {
    closeLoginPanel();
  }
});

    $("#resetAllBtn").addEventListener("click", resetAll);
    $("#quickTaskForm").addEventListener("submit", (e)=>{
      e.preventDefault();
      const t = $("#quickTaskTitle").value.trim();
      if (!t) return;
      addTask(newTask({
        title: t,
        projectId: $("#quickTaskProject").value || "inbox",
        priority: $("#quickTaskPriority").value,
        dueDate: $("#quickTaskDue").value || "",
        tags: ($("#quickTaskTags").value || "").split(",").map(s=>s.trim()).filter(Boolean)
      }));
      e.target.reset();
      $("#quickTaskTitle").focus();
    });

    $("#taskSearch").addEventListener("input", (e)=>{ filters.q = e.target.value; renderKanban(); });
    $("#addTaskBtn").addEventListener("click", ()=> openTaskModal());
    $("#saveTaskBtn").addEventListener("click", (e)=>{
      e.preventDefault();
      const data = {
        title: $("#taskTitle").value,
        description: $("#taskDesc").value,
        projectId: $("#taskProject").value||"inbox",
        priority: $("#taskPriority").value,
        dueDate: $("#taskDue").value || "",
        tags: ($("#taskTags").value||"").split(",").map(s=>s.trim()).filter(Boolean)
      };
      if (!data.title.trim()) return alert("Title is required");

      if (editingTaskId) updateTask(editingTaskId, data);
      else addTask(newTask(data));

      closeTaskModal();
    });
    $("#deleteTaskBtn").addEventListener("click", ()=>{
      if (editingTaskId && confirm("Delete this task?")) { deleteTask(editingTaskId); closeTaskModal(); }
    });
    $("#addProjectBtn").addEventListener("click", ()=>{
      const name = $("#projectNameInput").value.trim();
      if (!name) return;
      addProject(name, $("#projectColorInput").value);
      $("#projectNameInput").value = "";
    });

    // note
    $("#addNoteBtn").addEventListener("click", ()=>{
      const txt = $("#noteInput").value.trim();
      if (!txt) return;
      addNote(txt); $("#noteInput").value = "";
    });
  }
function openLoginPanel() {
  $("#loginPanel").classList.add("open");
}

function closeLoginPanel() {
  $("#loginPanel").classList.remove("open");
}

  // Project modal bindings
  let editingProjectId = null;
  function openProjectModal(p){
    editingProjectId = p.id;
    $("#editProjectName").value = p.name;
    $("#editProjectColor").value = p.color || "#4f46e5";
    $("#projectModal").showModal();
  }
  function bindProjectModal(){
    $("#saveProjectBtn").addEventListener("click", (e)=>{
      e.preventDefault();
      updateProject(editingProjectId, $("#editProjectName").value, $("#editProjectColor").value);
      $("#projectModal").close();
    });
    $("#deleteProjectBtn").addEventListener("click", ()=>{
      if (confirm("Delete this project? Tasks will be moved to Inbox.")) {
        deleteProject(editingProjectId);
        $("#projectModal").close();
      }
    });
  }
  function init(){
    renderProjectOptions([$("#taskProject"), $("#quickTaskProject")]);
    renderProjects(); renderKanban(); renderNotes(); refreshOverview();
    setupKanbanDnD();
    bindGlobal();
    bindProjectModal();
  }

  return { init };
})();
document.addEventListener("DOMContentLoaded", App.init);