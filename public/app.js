const $ = (id) => document.getElementById(id);

let me = null;
let view = "editors";
let viewUser = null;

function getToken() {
  return localStorage.getItem("editzone_token") || "";
}

function setToken(token) {
  if (token) {
    localStorage.setItem("editzone_token", token);
  } else {
    localStorage.removeItem("editzone_token");
  }
}

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sanitizeUsername(username = "") {
  return String(username)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
}

function roleBadges(roles = []) {
  const map = {
    owner: { t: "OWNER", c: "owner" },
    admin: { t: "ADMIN", c: "admin" },
    vip: { t: "VIP", c: "vip" },
    editor: { t: "ედითორი", c: "editor" },
    member: { t: "წევრი", c: "member" }
  };

  const order = ["owner", "admin", "vip", "editor", "member"];
  return order
    .filter((r) => roles.includes(r))
    .map((r) => `<span class="b ${map[r].c}">${map[r].t}</span>`)
    .join("");
}

function canUpload(roles = []) {
  return roles.includes("owner") || roles.includes("admin") || roles.includes("vip") || roles.includes("editor");
}

function showError(msg) {
  const bar = $("errbar");
  $("okbar").style.display = "none";
  bar.style.display = "block";
  bar.textContent = "❌ " + msg;
}

function showOk(msg) {
  const bar = $("okbar");
  $("errbar").style.display = "none";
  bar.style.display = "block";
  bar.textContent = "✅ " + msg;
  setTimeout(() => {
    bar.style.display = "none";
    bar.textContent = "";
  }, 2500);
}

function hideBars() {
  $("errbar").style.display = "none";
  $("okbar").style.display = "none";
}

function openAuth() {
  $("authModal").style.display = "flex";
  $("authForms").style.display = me ? "none" : "block";
  $("authActions").style.display = me ? "block" : "none";
}

function closeAuth() {
  $("authModal").style.display = "none";
}

function openEdit() {
  if (!me) return;
  $("bioInput").value = me.bio || "";
  $("avatarInput").value = me.avatarUrl || "";
  $("bannerInput").value = me.bannerUrl || "";
  $("editModal").style.display = "flex";
}

function closeEdit() {
  $("editModal").style.display = "none";
}

function openUpload() {
  if (!me) return openAuth();
  if (!canUpload(me.roles || [])) {
    return alert("ვიდეოს დამატება მხოლოდ ედითორს/VIP-ს შეუძლია.");
  }
  $("editTitleInput").value = "";
  $("tiktokInput").value = "";
  $("upModal").style.display = "flex";
}

function closeUpload() {
  $("upModal").style.display = "none";
}

function parseHash() {
  const h = (location.hash || "#editors").trim();

  if (h.startsWith("#profile:")) {
    view = "profile";
    viewUser = decodeURIComponent(h.split(":")[1] || "");
    return;
  }

  if (h === "#edits") {
    view = "edits";
    viewUser = null;
    return;
  }

  view = "editors";
  viewUser = null;
}

function setActiveNav() {
  $("navEditors").classList.toggle("active", view === "editors");
  $("navEdits").classList.toggle("active", view === "edits");
}

function goEditors() {
  location.hash = "#editors";
}

function goEdits() {
  location.hash = "#edits";
}

function goProfile(username) {
  location.hash = "#profile:" + encodeURIComponent(username);
}

async function api(url, options = {}) {
  const token = getToken();

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-session-token": token
    },
    ...options
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "შეცდომა");
  }

  return data;
}

async function getSession() {
  const data = await api("/api/session");
  me = data.user || null;

  $("authLabel").textContent = me?.username ? `ანგარიში: ${me.username}` : "შესვლა / რეგისტრაცია";
  $("authForms").style.display = me ? "none" : "block";
  $("authActions").style.display = me ? "block" : "none";
}

function extractTikTokId(url = "") {
  const match = String(url).match(/\/video\/(\d+)/);
  return match ? match[1] : "";
}

function tiktokEmbedUrl(url) {
  const id = extractTikTokId(url);
  return id ? `https://www.tiktok.com/embed/v2/${id}` : "";
}

async function renderEditors() {
  const users = await api("/api/users");

  const list = users.filter((u) => {
    const roles = u.roles || [];
    return roles.includes("owner") || roles.includes("admin") || roles.includes("vip") || roles.includes("editor");
  });

  $("app").innerHTML = `
    <div class="title">
      <h1>ედითორები</h1>
      <div class="muted">${me ? `შესული ხარ: ${esc(me.username)}` : "შესვლა / რეგისტრაცია ზედა მარჯვენა კუთხიდან"}</div>
    </div>

    <div class="grid">
      ${
        list.length
          ? list.map((u) => `
            <div class="card">
              <div class="row">
                <div class="mini">
                  <img class="av" src="${u.avatarUrl || "https://placehold.co/96x96/png"}" alt="">
                  <div style="min-width:0">
                    <div class="name">${esc(u.username)} ${roleBadges(u.roles || [])}</div>
                    <div class="meta">${esc((u.bio || "BIO არ აქვს").slice(0, 80))}${(u.bio || "").length > 80 ? "…" : ""}</div>
                  </div>
                </div>
                <a class="link" data-p="${esc(u.username)}">პროფილი</a>
              </div>
            </div>
          `).join("")
          : `<div class="card">ჯერ ედითორი არ არის.</div>`
      }
    </div>
  `;

  document.querySelectorAll("[data-p]").forEach((el) => {
    el.addEventListener("click", () => goProfile(el.getAttribute("data-p")));
  });
}

async function renderEdits() {
  const users = await api("/api/users");
  const allEdits = [];

  users.forEach((u) => {
    (u.edits || []).forEach((e) => {
      allEdits.push({
        ...e,
        ownerUsername: u.username
      });
    });
  });

  allEdits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  $("app").innerHTML = `
    <div class="title">
      <h1>ედითები</h1>
      <div class="muted">აქ ჩანს ყველა დამატებული TikTok ედითი.</div>
    </div>

    <div class="grid">
      ${
        allEdits.length
          ? allEdits.map((it) => `
            <div class="card">
              <div class="row" style="align-items:flex-start">
                <div style="min-width:0">
                  <div class="name">${esc(it.title || "TikTok Edit")} <span class="b editor">${esc(it.ownerUsername)}</span></div>
                </div>
                <a class="link" data-p="${esc(it.ownerUsername)}">პროფილი</a>
              </div>

              <div style="height:10px"></div>

              ${
                extractTikTokId(it.tiktokUrl)
                  ? `<iframe src="${tiktokEmbedUrl(it.tiktokUrl)}" allowfullscreen></iframe>`
                  : `<div class="note">TikTok embed ვერ ჩაიტვირთა.</div>`
              }
            </div>
          `).join("")
          : `<div class="card">ჯერ ედითი არ არის.</div>`
      }
    </div>
  `;

  document.querySelectorAll("[data-p]").forEach((el) => {
    el.addEventListener("click", () => goProfile(el.getAttribute("data-p")));
  });
}

async function renderProfile(username) {
  const u = await api("/api/users/" + encodeURIComponent(username));
  const meViewing = me && me.username === u.username;
  const canPost = meViewing && canUpload(me.roles || []);

  $("app").innerHTML = `
    <div class="profileShell">
      <div class="banner" style="${u.bannerUrl ? `background-image:url('${u.bannerUrl}')` : ""}"></div>

      <div class="profileCard">
        <div class="pTop">
          <div class="pLeft">
            <img class="avatarBig" src="${u.avatarUrl || "https://placehold.co/160x160/png"}" alt="">
            <div class="pInfo">
              <div class="pName">${esc(u.username)} ${roleBadges(u.roles || [])}</div>
              <div class="pBio">${esc(u.bio || "BIO არ აქვს")}</div>
            </div>
          </div>

          <div class="pRight">
            ${canPost ? `<div class="smallBtn primary" id="openUploadBtn">TikTok ედითის დამატება</div>` : ""}
            ${meViewing ? `<div class="smallBtn" id="openEditBtn">პროფილის რედაქტირება</div>` : ""}
          </div>
        </div>
      </div>
    </div>

    <div class="title" style="margin-top:14px">
      <h1>ვიდეოები</h1>
    </div>

    <div class="videos">
      ${
        (u.edits || []).length
          ? u.edits.map((it) => `
            <div class="vcard">
              ${
                extractTikTokId(it.tiktokUrl)
                  ? `<iframe src="${tiktokEmbedUrl(it.tiktokUrl)}" allowfullscreen></iframe>`
                  : `<div class="note">TikTok embed ვერ ჩაიტვირთა.</div>`
              }

              <div class="editMeta">
                <div class="muted">${esc(it.title || "TikTok Edit")}</div>
                ${
                  meViewing
                    ? `<button class="danger" style="width:auto;padding:8px 12px" data-del="${it.id}">წაშლა</button>`
                    : ``
                }
              </div>
            </div>
          `).join("")
          : `<div class="card">ჯერ ვიდეო არ არის.</div>`
      }
    </div>
  `;

  $("openEditBtn")?.addEventListener("click", openEdit);
  $("openUploadBtn")?.addEventListener("click", openUpload);

  document.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/users/${encodeURIComponent(u.username)}/edits/${btn.getAttribute("data-del")}`, {
          method: "DELETE"
        });
        showOk("ედითი წაიშალა");
        await refreshSession();
        await render();
      } catch (err) {
        showError(err.message);
      }
    });
  });
}

async function render() {
  hideBars();
  parseHash();
  setActiveNav();

  try {
    if (view === "editors") return await renderEditors();
    if (view === "edits") return await renderEdits();
    if (view === "profile") return await renderProfile(viewUser || me?.username || "");
  } catch (err) {
    showError(err.message);
  }
}

async function refreshSession() {
  await getSession();
}

async function register() {
  try {
    const username = sanitizeUsername($("regUser").value);
    const password = $("regPass").value || "";
    const role = $("regRole").value;

    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password, role })
    });

    setToken(data.token);
    me = data.user;
    $("authLabel").textContent = `ანგარიში: ${me.username}`;
    closeAuth();
    showOk("რეგისტრაცია დასრულდა");
    goProfile(me.username);
  } catch (err) {
    showError(err.message);
  }
}

async function login() {
  try {
    const username = sanitizeUsername($("loginUser").value);
    const password = $("loginPass").value || "";

    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    setToken(data.token);
    me = data.user;
    $("authLabel").textContent = `ანგარიში: ${me.username}`;
    closeAuth();
    showOk("შესვლა შესრულდა");
    goProfile(me.username);
  } catch (err) {
    showError(err.message);
  }
}

async function logoutUser() {
  try {
    await api("/api/logout", { method: "POST" });
    setToken("");
    me = null;
    $("authLabel").textContent = "შესვლა / რეგისტრაცია";
    closeAuth();
    showOk("გამოსვლა შესრულდა");
    goEditors();
  } catch (err) {
    showError(err.message);
  }
}

async function saveProfile() {
  if (!me) return;

  try {
    const bio = $("bioInput").value.trim();
    const avatarUrl = $("avatarInput").value.trim();
    const bannerUrl = $("bannerInput").value.trim();

    const data = await api(`/api/users/${encodeURIComponent(me.username)}/profile`, {
      method: "PUT",
      body: JSON.stringify({ bio, avatarUrl, bannerUrl })
    });

    me = data.user;
    closeEdit();
    showOk("პროფილი შეინახა");
    await render();
  } catch (err) {
    showError(err.message);
  }
}

async function saveEdit() {
  if (!me) return;

  try {
    const title = $("editTitleInput").value.trim();
    const tiktokUrl = $("tiktokInput").value.trim();

    await api(`/api/users/${encodeURIComponent(me.username)}/edits`, {
      method: "POST",
      body: JSON.stringify({ title, tiktokUrl })
    });

    closeUpload();
    showOk("TikTok ედითი დაემატა");
    await refreshSession();
    await render();
  } catch (err) {
    showError(err.message);
  }
}

$("navEditors").addEventListener("click", goEditors);
$("navEdits").addEventListener("click", goEdits);

$("btnAuth").addEventListener("click", () => {
  if (me?.username) {
    goProfile(me.username);
  } else {
    openAuth();
  }
});

$("closeAuth").addEventListener("click", closeAuth);
$("closeEdit").addEventListener("click", closeEdit);
$("closeUp").addEventListener("click", closeUpload);

$("doReg").addEventListener("click", register);
$("doLogin").addEventListener("click", login);
$("logout").addEventListener("click", logoutUser);

$("goMyProfile").addEventListener("click", () => {
  if (me?.username) {
    closeAuth();
    goProfile(me.username);
  }
});

$("saveProfile").addEventListener("click", saveProfile);
$("saveEdit").addEventListener("click", saveEdit);

window.addEventListener("hashchange", render);

(async function init() {
  try {
    await getSession();

    if (!location.hash) {
      location.hash = me?.username ? `#profile:${encodeURIComponent(me.username)}` : "#editors";
    } else {
      await render();
    }
  } catch (err) {
    showError(err.message);
  }
})();