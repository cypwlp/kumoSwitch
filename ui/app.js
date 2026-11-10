const invoke = window.__TAURI__.core.invoke;

const state = {
  tools: [],
  selected: null,
  providers: [],
  filter: "",
  toolFilter: "",
};

const $ = (id) => document.getElementById(id);
const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(message, kind = "") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 2600);
}

function openModal(html, narrow = false) {
  $("sheet").className = `sheet${narrow ? " narrow" : ""}`;
  $("sheet").innerHTML = html;
  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
  $("sheet").innerHTML = "";
}

$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

async function boot() {
  try {
    const info = await invoke("app_info");
    $("version").textContent = `v${info.version}`;
  } catch {}
  await refreshTools();
  $("rescan").addEventListener("click", async () => {
    await refreshTools();
    if (state.selected) await selectTool(state.selected.id, true);
    toast("已重新掃描", "ok");
  });
  $("toolFilter").addEventListener("input", (e) => {
    state.toolFilter = e.target.value.trim().toLowerCase();
    renderTools();
  });
  $("providerFilter").addEventListener("input", (e) => {
    state.filter = e.target.value.trim().toLowerCase();
    renderProviders();
  });
  $("addBtn").addEventListener("click", () => editProvider(null));
  $("backupBtn").addEventListener("click", showBackups);
  $("revealBtn").addEventListener("click", () => reveal());
}

async function refreshTools() {
  state.tools = await invoke("tool_list");
  renderTools();
}

function renderTools() {
  const list = $("toolList");
  const q = state.toolFilter;
  const items = state.tools.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q) || t.id.includes(q)
  );
  list.innerHTML = items
    .map(
      (t) => `
      <button class="tool ${state.selected && state.selected.id === t.id ? "active" : ""}" data-id="${esc(t.id)}">
        <span class="dot ${t.detected ? "on" : ""}" title="${t.detected ? "已偵測到設定目錄" : "尚未安裝或沒有設定目錄"}"></span>
        <span class="label"><b>${esc(t.name)}</b><span>${esc(t.blurb)}</span></span>
        ${t.provider_count ? `<span class="n">${t.provider_count}</span>` : ""}
      </button>`
    )
    .join("");
  list.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = state.tools.find((t) => t.id === btn.dataset.id);
      if (tool) selectTool(tool);
    });
  });
}

async function selectTool(tool, keepFilter = false) {
  state.selected = tool;
  state.providers = await invoke("provider_list", { tool: tool.id });
  if (!keepFilter) state.filter = "";
  $("providerFilter").value = state.filter;
  $("welcome").classList.add("hidden");
  $("panel").classList.remove("hidden");
  $("toolName").textContent = tool.name;
  $("toolBlurb").textContent = tool.blurb;
  $("configPath").textContent = tool.path;
  $("formatBadge").textContent = tool.format;
  $("curBase").textContent = tool.current.base_url || "—";
  $("curModel").textContent = tool.current.model || "—";
  $("curKey").textContent = tool.current.api_key_tail || "—";
  $("curRestart").textContent = tool.restart;
  $("takeoverBanner").classList.toggle("hidden", !tool.takeover);

  const badge = $("verifyBadge");
  if (tool.verified) {
    badge.className = "badge ok";
    badge.textContent = "格式已驗證";
  } else {
    badge.className = "badge warn";
    badge.textContent = "格式未實測，請先看 diff";
  }
  renderTools();
  renderProviders();
}

function renderProviders() {
  const body = $("providerBody");
  const q = state.filter;
  const items = state.providers.filter((p) => {
    if (!q) return true;
    return [p.name, p.base_url, p.model, p.note, p.kind].join(" ").toLowerCase().includes(q);
  });
  $("count").textContent = `${items.length} / ${state.providers.length} 個供應商`;

  body.innerHTML = items
    .map((p) => {
      const tool = state.selected;
      const active = tool.active_id === p.id;
      return `
      <tr class="${active ? "active-row" : ""}">
        <td class="name"><b>${esc(p.name)}</b><span>${esc(p.note || p.config_id)}</span></td>
        <td class="url mono">${esc(p.base_url)}</td>
        <td class="mono">${esc(p.model || "—")}</td>
        <td>${active ? '<span class="badge ok">使用中</span>' : '<span class="badge subtle">待用</span>'}</td>
        <td class="c-act">
          <span class="act">
            <button class="small primary" data-apply="${esc(p.id)}">套用</button>
            <button class="small ghost" data-edit="${esc(p.id)}">編輯</button>
            <button class="small danger" data-del="${esc(p.id)}">刪除</button>
          </span>
        </td>
      </tr>`;
    })
    .join("");

  const empty = $("emptyHint");
  if (items.length === 0) {
    empty.classList.remove("hidden");
    empty.innerHTML = state.providers.length
      ? "沒有符合條件的供應商<br/><span class='small'>清空搜尋框可看全部</span>"
      : "還沒有供應商<br/><span class='small'>點右上「＋ 新增供應商」，填入 Base URL 與 API Key 即可</span>";
  } else {
    empty.classList.add("hidden");
  }

  body.querySelectorAll("[data-apply]").forEach((b) =>
    b.addEventListener("click", () => startApply(b.dataset.apply))
  );
  body.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => editProvider(state.providers.find((p) => p.id === b.dataset.edit)))
  );
  body.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => removeProvider(b.dataset.del))
  );
}

function editProvider(provider) {
  const tool = state.selected;
  const p = provider || { name: "", base_url: "", api_key: "", model: "", kind: "", note: "" };
  const kindField = tool.kind_choices.length
    ? `<div class="field">
         <label>類型（${tool.format === "TOML" ? "wire_api" : "協議"}）</label>
         <select id="fKind">
           ${tool.kind_choices
             .map((k) => `<option value="${esc(k)}" ${p.kind === k ? "selected" : ""}>${esc(k)}</option>`)
             .join("")}
         </select>
       </div>`
    : "";
  openModal(
    `<div class="sheet-head"><h3>${provider ? "編輯供應商" : "新增供應商"} · ${esc(tool.name)}</h3>
       <button class="ghost small" onclick="document.getElementById('modal').classList.add('hidden')">✕</button></div>
     <div class="sheet-body">
       <div class="field-row">
         <div class="field"><label>名稱</label><input id="fName" value="${esc(p.name)}" placeholder="例：OpenCode Go" /></div>
         <div class="field"><label>模型</label><input id="fModel" value="${esc(p.model)}" placeholder="例：glm-5.3-flash" /></div>
       </div>
       <div class="field"><label>Base URL</label><input id="fUrl" value="${esc(p.base_url)}" placeholder="https://api.example.com/v1" />
         <div class="hint">必須包含路徑前綴（多數供應商要 /v1）</div></div>
       <div class="field"><label>API Key</label>
         <div class="key-row"><input id="fKey" type="password" value="${esc(p.api_key)}" placeholder="sk-..." />
         <button class="ghost" id="toggleKey" type="button">顯示</button></div></div>
       ${kindField}
       <div class="field"><label>備註</label><input id="fNote" value="${esc(p.note)}" placeholder="選填" /></div>
       <div class="note">套用時只會寫入 ${esc(tool.name)} 的供應商鍵位，其他設定與註解不會被動到。</div>
     </div>
     <div class="sheet-foot">
       <button class="ghost" id="cancelBtn">取消</button>
       <button class="primary" id="saveBtn">儲存</button>
     </div>`,
    true
  );
  $("cancelBtn").addEventListener("click", closeModal);
  $("toggleKey").addEventListener("click", () => {
    const input = $("fKey");
    input.type = input.type === "password" ? "text" : "password";
    $("toggleKey").textContent = input.type === "password" ? "顯示" : "隱藏";
  });
  $("saveBtn").addEventListener("click", async () => {
    const payload = {
      id: p.id || "",
      config_id: p.config_id || "",
      name: $("fName").value.trim(),
      base_url: $("fUrl").value.trim(),
      api_key: $("fKey").value.trim(),
      model: $("fModel").value.trim(),
      kind: $("fKind") ? $("fKind").value : p.kind || "",
      note: $("fNote").value.trim(),
    };
    try {
      const saved = await invoke("provider_save", { tool: tool.id, provider: payload });
      closeModal();
      toast(`已儲存「${saved.name}」`, "ok");
      await selectTool(state.selected, true);
    } catch (err) {
      toast(String(err), "err");
    }
  });
}

async function removeProvider(id) {
  const p = state.providers.find((x) => x.id === id);
  if (!confirm(`確定刪除「${p ? p.name : id}」？\n這只會刪除 SwitchYard 裡的紀錄，不會改動你的設定檔。`)) return;
  try {
    await invoke("provider_delete", { tool: state.selected.id, id });
    toast("已刪除", "ok");
    await selectTool(state.selected, true);
  } catch (err) {
    toast(String(err), "err");
  }
}

async function startApply(id) {
  const p = state.providers.find((x) => x.id === id);
  try {
    const diffs = await invoke("preview", { tool: state.selected.id, providerId: id });
    if (!diffs.length) {
      toast("設定已是最新，沒有變更", "ok");
      return;
    }
    const body = diffs
      .map(
        (d) => `
        <div class="diff-head">
          <code>${esc(d.file)}</code>
          <span class="badge subtle">${esc(d.fmt)}</span>
          <span class="diff-stat"><span class="add">+${d.added}</span> / <span class="del">-${d.removed}</span></span>
          ${d.existed ? "" : '<span class="badge warn">檔案不存在，將新建</span>'}
        </div>
        <pre class="diff">${renderDiff(d.diff)}</pre>`
      )
      .join("");
    openModal(
      `<div class="sheet-head"><h3>套用「${esc(p.name)}」到 ${esc(state.selected.name)}</h3>
        <button class="ghost small" onclick="document.getElementById('modal').classList.add('hidden')">✕</button></div>
       <div class="sheet-body">
         <div class="note">以下是實際會寫入的變更。只列出被修改的行；未列出的內容一個字都不會動。寫入前會自動建立時間戳備份。</div>
         ${body}
       </div>
       <div class="sheet-foot">
         <button class="ghost" id="cancelBtn">取消</button>
         <button class="primary" id="confirmBtn">確認套用</button>
       </div>`
    );
    $("cancelBtn").addEventListener("click", closeModal);
    $("confirmBtn").addEventListener("click", async () => {
      $("confirmBtn").disabled = true;
      try {
        const result = await invoke("apply_provider", { tool: state.selected.id, providerId: id });
        closeModal();
        toast(result.message, "ok");
        await refreshTools();
        await selectTool(state.tools.find((t) => t.id === state.selected.id), true);
      } catch (err) {
        $("confirmBtn").disabled = false;
        toast(String(err), "err");
      }
    });
  } catch (err) {
    toast(String(err), "err");
  }
}

function renderDiff(text) {
  return text
    .split("\n")
    .map((line) => {
      const safe = esc(line);
      if (line.startsWith("+++") || line.startsWith("---")) return `<span class="line meta">${safe}</span>`;
      if (line.startsWith("@@")) return `<span class="line hunk">${safe}</span>`;
      if (line.startsWith("+")) return `<span class="line add">${safe}</span>`;
      if (line.startsWith("-")) return `<span class="line del">${safe}</span>`;
      return `<span class="line">${safe}</span>`;
    })
    .join("");
}

async function showBackups() {
  const tool = state.selected;
  const backups = await invoke("backup_list", { tool: tool.id });
  const body = backups.length
    ? backups
        .map(
          (b) => `
        <div class="backup-item">
          <span class="when">${esc(b.created)}</span>
          <span class="files">${b.files.map(esc).join(" · ")}</span>
          <button class="small ghost" data-restore="${esc(b.id)}">還原</button>
        </div>`
        )
        .join("")
    : '<div class="empty">這個工具還沒有備份</div>';
  openModal(
    `<div class="sheet-head"><h3>備份紀錄 · ${esc(tool.name)}</h3>
      <button class="ghost small" onclick="document.getElementById('modal').classList.add('hidden')">✕</button></div>
     <div class="sheet-body">${body}</div>`,
    true
  );
  $("sheet").querySelectorAll("[data-restore]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("還原會用這份備份覆蓋目前的設定檔，確定嗎？")) return;
      try {
        const files = await invoke("backup_restore", { tool: tool.id, id: btn.dataset.restore });
        closeModal();
        toast(`已還原：${files.join("、")}`, "ok");
        await selectTool(state.selected, true);
      } catch (err) {
        toast(String(err), "err");
      }
    })
  );
}

async function reveal() {
  try {
    await invoke("reveal_config", { tool: state.selected.id });
  } catch (err) {
    toast(String(err), "err");
  }
}

boot();
