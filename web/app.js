const COLLAPSE_KEY = "gradapps-collapsed-folders";

const state = {
  files: [],
  currentPath: null,
  content: "",
  savedContent: "",
  mode: "split",
  collapsed: loadCollapsed(),
};

const els = {
  fileTree: document.getElementById("file-tree"),
  search: document.getElementById("search"),
  editor: document.getElementById("editor"),
  preview: document.getElementById("preview"),
  workspace: document.getElementById("workspace"),
  pathLabel: document.getElementById("current-path"),
  status: document.getElementById("status"),
  btnSave: document.getElementById("btn-save"),
  btnSplit: document.getElementById("btn-split"),
  btnEdit: document.getElementById("btn-edit"),
  btnPreview: document.getElementById("btn-preview"),
  btnExpand: document.getElementById("btn-expand"),
  btnCollapse: document.getElementById("btn-collapse"),
};

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCollapsed() {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state.collapsed));
}

function isDirty() {
  return state.currentPath && state.content !== state.savedContent;
}

function setStatus(text, dirty = false) {
  els.status.textContent = text;
  els.status.classList.toggle("dirty", dirty);
}

function prettyName(name) {
  return name
    .replace(/-cs-phd$|-cse-phd$|-cms-phd$/, "")
    .replace(/-/g, " ");
}

function buildTree(files) {
  const root = { name: "", path: "", folders: {}, files: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const folderPath = parts.slice(0, i + 1).join("/");
      if (!node.folders[name]) {
        node.folders[name] = { name, path: folderPath, folders: {}, files: [] };
      }
      node = node.folders[name];
    }
    node.files.push(file);
  }
  return root;
}

function collectFolderPaths(node, out = []) {
  for (const folder of Object.values(node.folders)) {
    out.push(folder.path);
    collectFolderPaths(folder, out);
  }
  return out;
}

function ancestorsOf(filePath) {
  const parts = filePath.split("/");
  const dirs = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

function isFolderCollapsed(folderPath, searching) {
  if (searching) return false;
  if (state.currentPath && ancestorsOf(state.currentPath).includes(folderPath)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(state.collapsed, folderPath)) {
    return Boolean(state.collapsed[folderPath]);
  }
  return folderPath.includes("/");
}

function toggleFolder(folderPath) {
  const currently = isFolderCollapsed(folderPath, false);
  state.collapsed[folderPath] = !currently;
  saveCollapsed();
  renderTree(els.search.value);
}

function setAllCollapsed(collapsed) {
  const tree = buildTree(state.files);
  for (const path of collectFolderPaths(tree)) {
    state.collapsed[path] = collapsed;
  }
  saveCollapsed();
  renderTree(els.search.value);
}

function renderNode(node, searching) {
  const ul = document.createElement("ul");
  ul.className = "tree-children";

  const folders = Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
  for (const folder of folders) {
    const li = document.createElement("li");
    li.className = "tree-folder";
    if (isFolderCollapsed(folder.path, searching)) li.classList.add("collapsed");

    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row";
    row.title = folder.path;

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.textContent = "▾";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = "📁";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = prettyName(folder.name);

    const count = document.createElement("span");
    count.className = "tree-count";
    count.textContent = String(countFiles(folder));

    row.append(chevron, icon, name, count);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFolder(folder.path);
    });

    li.appendChild(row);
    li.appendChild(renderNode(folder, searching));
    ul.appendChild(li);
  }

  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  for (const file of files) {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (file.path === state.currentPath ? " active" : "");
    row.title = file.path;

    const spacer = document.createElement("span");
    spacer.className = "tree-chevron";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = file.name.endsWith(".csv") ? "📊" : "📄";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = file.name.replace(/\.md$/, "");

    row.append(spacer, icon, name);
    row.addEventListener("click", () => openFile(file.path));
    li.appendChild(row);
    ul.appendChild(li);
  }

  return ul;
}

function countFiles(node) {
  let n = node.files.length;
  for (const folder of Object.values(node.folders)) n += countFiles(folder);
  return n;
}

function renderTree(filter = "") {
  const q = filter.trim().toLowerCase();
  const filtered = state.files.filter((f) => !q || f.path.toLowerCase().includes(q));

  els.fileTree.innerHTML = "";
  if (!filtered.length) {
    els.fileTree.innerHTML = '<p class="empty-state">No files match your search.</p>';
    return;
  }

  els.fileTree.appendChild(renderNode(buildTree(filtered), Boolean(q)));
}

function normalizeProjectPath(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function resolveProjectLink(href) {
  if (!href) return null;
  const clean = href.split("#")[0].split("?")[0].trim();
  if (!clean) return null;
  if (/^(https?:|mailto:|tel:|#)/i.test(clean)) return null;
  if (!(clean.endsWith(".md") || clean.endsWith(".csv"))) return null;

  let resolved;
  if (clean.startsWith("/")) {
    resolved = clean.slice(1);
  } else {
    const baseDir = state.currentPath?.includes("/")
      ? state.currentPath.slice(0, state.currentPath.lastIndexOf("/"))
      : "";
    resolved = baseDir ? `${baseDir}/${clean}` : clean;
  }

  resolved = normalizeProjectPath(resolved);
  const known = state.files.some((f) => f.path === resolved);
  return known ? resolved : null;
}

function renderPreview() {
  const html = marked.parse(state.content || "", { gfm: true, breaks: false });
  els.preview.innerHTML = '<div class="markdown-body">' + html + "</div>";
  els.preview.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const projectPath = resolveProjectLink(href);

    if (projectPath) {
      a.href = "#" + encodeURIComponent(projectPath);
      a.classList.add("internal-link");
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openFile(projectPath);
      });
      return;
    }

    if (/^https?:/i.test(href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  });
}

function setMode(mode) {
  state.mode = mode;
  els.workspace.className = "workspace";
  if (mode === "split") els.workspace.classList.add("split");
  if (mode === "edit") els.workspace.classList.add("edit-only");
  if (mode === "preview") els.workspace.classList.add("preview-only");

  for (const [id, name] of [
    [els.btnSplit, "split"],
    [els.btnEdit, "edit"],
    [els.btnPreview, "preview"],
  ]) {
    id.classList.toggle("active", name === mode);
  }
}

async function loadFileList() {
  const res = await fetch("/api/files");
  const data = await res.json();
  state.files = data.files;
  renderTree(els.search.value);
}

async function openFile(path) {
  if (isDirty() && !confirm("You have unsaved changes. Discard them?")) return;

  const res = await fetch("/api/file?path=" + encodeURIComponent(path));
  if (!res.ok) {
    alert("Could not open file.");
    return;
  }
  const data = await res.json();
  state.currentPath = data.path;
  state.content = data.content;
  state.savedContent = data.content;
  for (const dir of ancestorsOf(data.path)) {
    state.collapsed[dir] = false;
  }
  saveCollapsed();
  els.editor.value = data.content;
  els.pathLabel.textContent = data.path;
  renderPreview();
  renderTree(els.search.value);
  setStatus("Saved", false);
  history.replaceState(null, "", "#" + encodeURIComponent(path));
}

async function saveFile() {
  if (!state.currentPath) return;
  const res = await fetch("/api/file?path=" + encodeURIComponent(state.currentPath), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: state.content }),
  });
  if (!res.ok) {
    alert("Save failed.");
    return;
  }
  state.savedContent = state.content;
  setStatus("Saved", false);
}

els.editor.addEventListener("input", () => {
  state.content = els.editor.value;
  renderPreview();
  setStatus("Unsaved changes", true);
});

els.search.addEventListener("input", () => renderTree(els.search.value));

els.btnSave.addEventListener("click", saveFile);
els.btnSplit.addEventListener("click", () => setMode("split"));
els.btnEdit.addEventListener("click", () => setMode("edit"));
els.btnPreview.addEventListener("click", () => setMode("preview"));
els.btnExpand.addEventListener("click", () => setAllCollapsed(false));
els.btnCollapse.addEventListener("click", () => setAllCollapsed(true));

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    saveFile();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

loadFileList().then(() => {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (hash) openFile(hash);
  else if (state.files.length) openFile("tracker.md");
});

setMode("split");
