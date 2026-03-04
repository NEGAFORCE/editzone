(() => {
  "use strict";

  const APP_VERSION = "EZC_IDB_MEDIA_V5_NO_AUTO_FORCE_LOGIN_MOBILE_ROLES";
  const OWNER_NAME = "FORCE";
  const OWNER_PASS = "udzlieresi";
  const MAX_VIDEO_MB = 25;

  let users = JSON.parse(localStorage.getItem("users")) || {};
  let currentUser = (localStorage.getItem("currentUser") || "").trim() || null;

  const $ = (id) => document.getElementById(id);

  // =========================
  // IndexedDB
  // =========================
  const DB_NAME = "editzone_db";
  const DB_VERSION = 1;
  const STORE_MEDIA = "media";
  let dbPromise = null;
  const mediaUrlCache = new Map();

  function openDB(){
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE_MEDIA)){
          db.createObjectStore(STORE_MEDIA, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbPutMedia(key, blob, meta){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_MEDIA).put({ key, blob, meta: meta || {}, createdAt: Date.now() });
    });
  }

  async function idbGetMedia(key){
    if(!key) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readonly");
      const req = tx.objectStore(STORE_MEDIA).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDeleteMedia(key){
    if(!key) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_MEDIA).delete(key);
    });
  }

  function revokeMediaUrl(key){
    const url = mediaUrlCache.get(key);
    if(url){
      URL.revokeObjectURL(url);
      mediaUrlCache.delete(key);
    }
  }

  async function mediaUrl(key){
    if(!key) return null;
    if(mediaUrlCache.has(key)) return mediaUrlCache.get(key);
    const row = await idbGetMedia(key);
    if(!row || !row.blob) return null;
    const url = URL.createObjectURL(row.blob);
    mediaUrlCache.set(key, url);
    return url;
  }

  // =========================
  // Utils / Roles
  // =========================
  function escapeHtml(str){
    return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function escapeAttr(str){ return String(str).replaceAll("\\","\\\\").replaceAll("'","\\'"); }

  function defaultAvatar(name){
    const initials = (name||"E").trim().slice(0,2).toUpperCase();
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#22d3ee"/>
            <stop offset="1" stop-color="#6366f1"/>
          </linearGradient>
        </defs>
        <rect width="160" height="160" rx="26" fill="url(#g)"/>
        <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
          font-family="Noto Sans Georgian, Arial" font-size="56" font-weight="900" fill="white">${escapeHtml(initials)}</text>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function normalizeUser(u){
    u.createdAt ??= Date.now();
    u.bio ??= "";
    u.profileLikes ??= 0;
    u.profileLikedBy ??= {};
    u.passHash ??= "";

    if(!u.roles){
      if(u.role) u.roles = [u.role];
      else u.roles = ["member"];
    }
    delete u.role;

    u.roles = [...new Set(u.roles)].filter(Boolean);
    if(u.roles.length === 0) u.roles = ["member"];

    u.avatarKey ??= null;
    u.bannerKey ??= null;

    u.videos ??= [];
    u.videos.forEach(v=>{
      v.id ??= "v_" + Math.random().toString(16).slice(2) + Date.now();
      v.name ??= "ედითი";
      v.mediaKey ??= null;
      v.likes ??= 0;
      v.likedBy ??= {};
      v.createdAt ??= Date.now();
    });

    return u;
  }

  function ensureUser(name){
    if(!users[name]) users[name] = normalizeUser({});
    else users[name] = normalizeUser(users[name]);
  }

  function hasRole(name, role){
    ensureUser(name);
    return users[name].roles.includes(role);
  }

  // VIP-ს აქვს ედითორის პერმიშენები
  function isEditor(name){
    return hasRole(name,"editor") || hasRole(name,"vip") || hasRole(name,"admin") || hasRole(name,"owner");
  }

  function isOwner(name){ return !!name && hasRole(name,"owner"); }

  function roleBadgesHTML(name){
    ensureUser(name);
    const roles = users[name].roles;
    const order = ["owner","admin","vip","editor","member"];
    const sorted = order.filter(r=>roles.includes(r));
    const map = {
      owner: {txt:"OWNER", cls:"owner"},
      admin: {txt:"ADMIN", cls:"admin"},
      vip:   {txt:"VIP", cls:"vip"},
      editor:{txt:"ედითორი", cls:"editor"},
      member:{txt:"წევრი", cls:"member"},
    };
    return sorted.map(r=>`<span class="badge ${map[r].cls}">${map[r].txt}</span>`).join("");
  }

  function totalVideoLikesOf(name){
    ensureUser(name);
    return users[name].videos.reduce((sum,v)=>sum + (v.likes||0), 0);
  }

  function safeSave(){
    try{
      localStorage.setItem("users", JSON.stringify(users));
      localStorage.setItem("currentUser", currentUser || "");
      localStorage.setItem("ezc_version", APP_VERSION);
      return true;
    }catch(e){
      alert("მონაცემები ვერ შეინახა. სცადე გვერდის გადატვირთვა.");
      return false;
    }
  }

  async function sha256(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function updateAuthLabel(){
    $("authLabel").textContent = currentUser ? `ანგარიში: ${currentUser}` : "შესვლა / რეგისტრაცია";
  }

  // =========================
  // Permissions
  // =========================
  function canDeleteVideo(actor, targetUser){
    if(!actor) return false;
    if(isOwner(actor)) return true;
    if(hasRole(actor,"admin") && !hasRole(targetUser,"owner")) return true;
    return actor === targetUser;
  }

  // =========================
  // Routing / Nav
  // =========================
  function setActiveNav(which){
    $("navEditors").classList.toggle("active", which==="editors");
    $("navEdits").classList.toggle("active", which==="edits");
  }
  function goEditors(){ location.hash = "#editors"; }
  function goEdits(){ location.hash = "#edits"; }
  function goProfile(name){ location.hash = "#profile:" + encodeURIComponent(name); }

  async function route(){
    const h = (location.hash || "#editors").trim();
    if(h.startsWith("#profile:")){
      const name = decodeURIComponent(h.split(":")[1] || "");
      setActiveNav("");
      await renderProfile(name);
      return;
    }
    if(h === "#edits"){
      setActiveNav("edits");
      await renderEditsFeed();
      return;
    }
    setActiveNav("editors");
    await renderEditors();
  }

  // =========================
  // Auth modal
  // =========================
  function setTab(which){
    $("tabLogin").classList.toggle("active", which==="login");
    $("tabReg").classList.toggle("active", which==="register");
    $("loginForm").style.display = which==="login" ? "block" : "none";
    $("regForm").style.display = which==="register" ? "block" : "none";
  }

  function openAuth(){
    $("authModal").style.display = "flex";
    const loggedIn = !!currentUser;
    $("accountActions").style.display = loggedIn ? "block" : "none";
    $("authTabs").style.display = loggedIn ? "none" : "flex";
    $("loginForm").style.display = loggedIn ? "none" : "block";
    $("regForm").style.display = "none";
    $("modalTitle").textContent = loggedIn ? "შენი ანგარიში" : "ანგარიში";
    if(!loggedIn) setTab("login");
  }
  function closeAuth(){ $("authModal").style.display = "none"; }

  // =========================
  // Profile edit modal
  // =========================
  let editProfileName = null;

  async function openProfileEditModal(profileName){
    if(!currentUser || currentUser !== profileName) return;
    ensureUser(profileName);
    editProfileName = profileName;
    const u = users[profileName];

    const avatarSrc = (await mediaUrl(u.avatarKey)) || defaultAvatar(profileName);
    const bannerSrc = (await mediaUrl(u.bannerKey)) || null;

    $("editAvatarRow").innerHTML = `
      <div class="edit-row">
        <div class="left">
          <div class="thumb"><img src="${avatarSrc}" alt=""></div>
          <div>
            <div class="title">პროფილის ფოტო</div>
            <div class="hint">PNG/JPG რეკომენდებული</div>
          </div>
        </div>
        <div class="right">
          <button class="secondary" data-pick="avatar">შეცვლა</button>
          <button class="secondary danger" data-del="avatar">წაშლა</button>
        </div>
      </div>
    `;

    $("editBannerRow").innerHTML = `
      <div class="edit-row">
        <div class="left">
          <div class="thumb">
            ${bannerSrc ? `<img src="${bannerSrc}" alt="">` : `<div style="font-weight:1000;color:rgba(255,255,255,.65)">🖼️</div>`}
          </div>
          <div>
            <div class="title">ბანერი / ფონი</div>
            <div class="hint">კარგი ზომა: 1500×500 (ან მსგავსი)</div>
          </div>
        </div>
        <div class="right">
          <button class="secondary" data-pick="banner">შეცვლა</button>
          <button class="secondary danger" data-del="banner">წაშლა</button>
        </div>
      </div>
    `;

    $("bioInput").value = u.bio || "";
    $("profileEditModal").style.display = "flex";
  }

  function closeProfileEdit(){
    editProfileName = null;
    $("profileEditModal").style.display = "none";
  }

  function triggerPick(kind){
    const input = kind==="avatar" ? $("avatarInput") : $("bannerInput");
    input.value = "";
    input.click();
  }

  async function deleteImage(kind){
    if(!editProfileName) return;
    const u = users[editProfileName];

    if(kind==="avatar"){
      if(u.avatarKey){ await idbDeleteMedia(u.avatarKey); revokeMediaUrl(u.avatarKey); }
      u.avatarKey = null;
    }
    if(kind==="banner"){
      if(u.bannerKey){ await idbDeleteMedia(u.bannerKey); revokeMediaUrl(u.bannerKey); }
      u.bannerKey = null;
    }
    safeSave();
    await renderProfile(editProfileName);
    await openProfileEditModal(editProfileName);
  }

  async function saveBio(){
    if(!editProfileName) return;
    users[editProfileName].bio = ($("bioInput").value || "").trim().slice(0, 240);
    safeSave();
    await renderProfile(editProfileName);
    await openProfileEditModal(editProfileName);
  }

  // =========================
  // Upload modal
  // =========================
  let pendingUploadFiles = [];

  function openUploadModal(){
    if(!currentUser) return openAuth();
    ensureUser(currentUser);
    if(!isEditor(currentUser)){
      alert("ვიდეოს ატვირთვა მხოლოდ ედითორებს/VIP-ს შეუძლიათ.");
      return;
    }
    pendingUploadFiles = [];
    $("chosenFiles").innerHTML = "";
    $("uploadNote").innerHTML = `ℹ️ მაქსიმუმი: <b>${MAX_VIDEO_MB}MB</b> თითო ვიდეო • შეგიძლია რამდენიმე აირჩიო • ინახება IndexedDB-ში`;
    $("uploadModal").style.display = "flex";
  }
  function closeUploadModal(){
    pendingUploadFiles = [];
    $("uploadModal").style.display = "none";
  }
  function chooseVideos(){ $("videoInput").value = ""; $("videoInput").click(); }

  function renderChosenFiles(){
    if(pendingUploadFiles.length === 0){
      $("chosenFiles").innerHTML = "";
      return;
    }
    $("chosenFiles").innerHTML = pendingUploadFiles.map(f=>{
      const mb = f.size/(1024*1024);
      return `
        <div class="file-item">
          <div class="fn">${escapeHtml(f.name)}</div>
          <div class="fs">${mb.toFixed(1)}MB</div>
        </div>
      `;
    }).join("");
  }

  // =========================
  // Owner role management modal
  // =========================
  let roleTarget = null;
  let basePick = null;

  function openRoleModal(targetName){
    if(!currentUser || !isOwner(currentUser)) return;
    if(!targetName || !users[targetName]) return;
    if(hasRole(targetName,"owner")) {
      alert("OWNER-ზე როლებს ვერ შეცვლი.");
      return;
    }

    roleTarget = targetName;
    ensureUser(targetName);

    const r = users[targetName].roles;
    basePick = r.includes("editor") || r.includes("vip") || r.includes("admin") ? "editor" : "member";

    $("roleTargetHint").textContent = `მომხმარებელი: ${targetName}`;
    $("roleModal").style.display = "flex";
  }

  function closeRoleModal(){
    roleTarget = null;
    basePick = null;
    $("roleModal").style.display = "none";
  }

  function setBaseRole(base){
    basePick = base;
    alert(`ბაზა არჩეულია: ${base === "editor" ? "ედითორი" : "წევრი"}`);
  }

  function toggleRoleOnTarget(role){
    if(!roleTarget) return;
    ensureUser(roleTarget);
    const roles = new Set(users[roleTarget].roles);

    if(roles.has(role)) roles.delete(role);
    else roles.add(role);

    // owner არ შეიძლება
    roles.delete("owner");

    // base logic: თუ basePick=member -> editor გამორთე (მაგრამ vip/admin შეიძლება? დავტოვებთ vip/admin-ს, რადგან owner აძლევს)
    // basePick=editor -> member გამორთე
    if(basePick === "member"){
      roles.delete("editor");
    }else{
      roles.delete("member");
      roles.add("editor"); // ედითორის ბაზა უკეთესია
    }

    users[roleTarget].roles = [...roles];
    alert(`განახლდა: ${users[roleTarget].roles.join(", ")}`);
  }

  function saveRoles(){
    if(!roleTarget) return;

    // საბოლოო გამართვა
    const roles = new Set(users[roleTarget].roles);

    roles.delete("owner");
    if(basePick === "member"){
      roles.delete("editor");
      if(!roles.has("member")) roles.add("member");
    }else{
      roles.delete("member");
      roles.add("editor");
    }

    // VIP პერმიშენი = ედითორი პერმიშენი (კოდში isEditor უკვე ითვლის vip-საც)
    users[roleTarget].roles = [...roles];
    safeSave();
    closeRoleModal();
    alert("როლები შენახულია.");
  }

  // =========================
  // Pages
  // =========================
  async function renderEditors(){
    Object.keys(users).forEach(ensureUser);

    const editorNames = Object.keys(users)
      .filter(n => isEditor(n))
      .sort((a,b)=> totalVideoLikesOf(b) - totalVideoLikesOf(a));

    $("app").innerHTML = `
      <div class="titlebar">
        <h1>ედითორები:</h1>
        <div class="muted">${currentUser ? `შენ ხარ: ${currentUser}` : "შესვლა / რეგისტრაცია ზედა მარჯვენა კუთხიდან"}</div>
      </div>

      <div class="grid">
        ${editorNames.length ? editorNames.map(name=>{
          const u = users[name];
          const bio = (u.bio||"").trim();
          const bioLine = bio ? `${escapeHtml(bio.slice(0,80))}${bio.length>80?"…":""}` : `BIO არ აქვს`;
          return `
            <div class="card">
              <div class="row">
                <div class="mini">
                  <img class="avatar-sm" id="edAvatar_${escapeAttr(name)}" src="${defaultAvatar(name)}" alt="avatar">
                  <div>
                    <div class="name">${escapeHtml(name)} ${roleBadgesHTML(name)}</div>
                    <div class="meta">⭐ ${totalVideoLikesOf(name)} • 🎬 ${u.videos.length}</div>
                    <div class="meta">${bioLine}</div>
                  </div>
                </div>
                <a data-open-profile="${escapeAttr(name)}">პროფილი</a>
              </div>
            </div>
          `;
        }).join("") : `<div class="card">ჯერ ედითორი არ არის.</div>`}
      </div>
    `;

    $("app").querySelectorAll("[data-open-profile]").forEach(a=>{
      a.addEventListener("click", ()=> goProfile(a.getAttribute("data-open-profile")));
    });

    for(const name of editorNames){
      const u = users[name];
      const el = document.getElementById(`edAvatar_${name}`);
      if(!el) continue;
      const url = await mediaUrl(u.avatarKey);
      if(url) el.src = url;
    }
  }

  async function renderEditsFeed(){
    Object.keys(users).forEach(ensureUser);

    const all = [];
    for(const username of Object.keys(users)){
      const u = users[username];
      for(const v of u.videos){
        all.push({ username, video: v });
      }
    }
    all.sort((a,b)=> (b.video.createdAt||0) - (a.video.createdAt||0));

    $("app").innerHTML = `
      <div class="titlebar">
        <h1>ედითები</h1>
        <div class="muted">აქ ჩანს ყველა ატვირთული ედითი.</div>
      </div>

      <div class="feed" id="feed"></div>
    `;

    const feed = $("feed");
    if(!feed) return;

    if(all.length === 0){
      feed.innerHTML = `<div class="card">ჯერ ედითი არ არის ატვირთული.</div>`;
      return;
    }

    feed.innerHTML = all.map(item=>{
      const { username, video } = item;
      const liked = !!(video.likedBy && currentUser && video.likedBy[currentUser]);
      return `
        <div class="feed-card">
          <div class="feed-head">
            <div class="uploader" data-go-profile="${escapeAttr(username)}">
              <img id="feedAv_${escapeAttr(video.id)}" src="${defaultAvatar(username)}" alt="">
              <div>
                <div class="u-name">${escapeHtml(username)}</div>
                <div class="u-sub">${roleBadgesHTML(username)}</div>
              </div>
            </div>
            <div class="feed-meta">
              <div>❤️ <b>${video.likes||0}</b></div>
              <div>🎬 <b>${escapeHtml(video.name||"ედითი")}</b></div>
            </div>
          </div>

          <video id="feedVid_${escapeAttr(video.id)}" controls></video>

          <div class="vrow">
            <div class="small">ატვირთულია: ${new Date(video.createdAt||Date.now()).toLocaleString()}</div>
            <div class="vactions">
              <div class="likebtn" data-like-feed="${escapeAttr(username)}::${escapeAttr(video.id)}">
                <span>${liked ? "💙" : "🤍"}</span><span>მოწონება</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    feed.querySelectorAll("[data-go-profile]").forEach(el=>{
      el.addEventListener("click", ()=> goProfile(el.getAttribute("data-go-profile")));
    });

    feed.querySelectorAll("[data-like-feed]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const [user, vid] = btn.getAttribute("data-like-feed").split("::");
        toggleVideoLike(user, vid);
        void renderEditsFeed();
      });
    });

    for(const item of all){
      const { username, video } = item;

      const avEl = document.getElementById(`feedAv_${video.id}`);
      if(avEl){
        const av = await mediaUrl(users[username].avatarKey);
        if(av) avEl.src = av;
      }

      const vEl = document.getElementById(`feedVid_${video.id}`);
      if(vEl){
        const src = await mediaUrl(video.mediaKey);
        if(src) vEl.src = src;
      }
    }
  }

  async function renderProfile(name){
    ensureUser(name);
    const u = users[name];

    const isMe = currentUser === name;
    const canUpload = isMe && isEditor(name);

    const ownerControls = (currentUser && isOwner(currentUser) && name !== currentUser && !hasRole(name,"owner"));

    $("app").innerHTML = `
      <div class="channel">
        <div class="banner" id="bannerBox">
          <div class="banner-actions">
            ${isMe ? `
              <div class="btn-icon" id="btnEditProfile">
                <div class="avatar-dot">⚙️</div>
                <div style="font-weight:1000;">პარამეტრები</div>
              </div>
            ` : ``}

            ${ownerControls ? `
              <div class="btn-icon" id="btnRoleManage">
                <div class="avatar-dot">🛡️</div>
                <div style="font-weight:1000;">როლები</div>
              </div>
            ` : ``}
          </div>
        </div>

        <div class="profile-wrap">
          <div class="profile-top">
            <div class="profile-left">
              <div class="avatar-box">
                <img class="avatar-lg" id="avatarImg" src="${defaultAvatar(name)}" alt="avatar">
              </div>

              <div class="title-stack">
                <div class="title-line">
                  <span>${escapeHtml(name)}</span>
                  <span class="status-dot" title="ონლაინ"></span>
                  ${roleBadgesHTML(name)}
                </div>

                <div class="stats-row">
                  <div>❤️ პროფილის ლაიქი: <b>${u.profileLikes||0}</b></div>
                  <div>⭐ ვიდეო ლაიქი: <b>${totalVideoLikesOf(name)}</b></div>
                  <div>🎬 ვიდეო: <b>${u.videos.length}</b></div>
                </div>

                <div class="bio">${escapeHtml((u.bio||"BIO არ აქვს").trim() || "BIO არ აქვს")}</div>
              </div>
            </div>

            <div class="profile-right">
              <div class="pill-like" id="btnProfileLike">
                <span>❤️</span><span class="count">${u.profileLikes||0}</span><span>მოწონება</span>
              </div>

              ${canUpload ? `<button id="btnUploadVideo">ვიდეოს ატვირთვა</button>` : ``}
            </div>
          </div>
        </div>
      </div>

      <div class="titlebar" style="margin-top:16px">
        <h1>ვიდეოები</h1>
      </div>
      <div class="videos" id="videos"></div>
    `;

    $("btnProfileLike")?.addEventListener("click", ()=> toggleProfileLike(name));

    if(isMe){
      $("btnEditProfile")?.addEventListener("click", ()=> { void openProfileEditModal(name); });
    }
    if(canUpload){
      $("btnUploadVideo")?.addEventListener("click", openUploadModal);
    }
    if(ownerControls){
      $("btnRoleManage")?.addEventListener("click", ()=> openRoleModal(name));
    }

    const bannerUrl = await mediaUrl(u.bannerKey);
    if(bannerUrl){
      const banner = document.getElementById("bannerBox");
      if(banner) banner.style.backgroundImage = `url('${bannerUrl}')`;
    }
    const avatarUrl = await mediaUrl(u.avatarKey);
    if(avatarUrl){
      const img = document.getElementById("avatarImg");
      if(img) img.src = avatarUrl;
    }

    await renderVideos(name);
  }

  async function renderVideos(profileName){
    ensureUser(profileName);
    const u = users[profileName];
    const list = $("videos");
    if(!list) return;

    if(u.videos.length === 0){
      list.innerHTML = `<div class="card">ჯერ ვიდეო არ არის ატვირთული.</div>`;
      return;
    }

    const vids = [...u.videos].sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

    list.innerHTML = vids.map(v=>{
      const liked = !!(v.likedBy && currentUser && v.likedBy[currentUser]);
      const canDel = canDeleteVideo(currentUser, profileName);

      return `
        <div class="video-card">
          <video id="vid_${escapeAttr(v.id)}" controls></video>
          <div class="vrow">
            <div>
              <div style="font-weight:1000;">${escapeHtml(v.name || "ედითი")}</div>
              <div class="small">❤️ ${v.likes || 0} ლაიქი</div>
            </div>
            <div class="vactions">
              <div class="likebtn" data-like-video="${escapeAttr(v.id)}">
                <span>${liked ? "💙" : "🤍"}</span><span>მოწონება</span>
              </div>
              ${canDel ? `<button class="secondary danger" data-del-video="${escapeAttr(v.id)}">წაშლა</button>` : ``}
            </div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-like-video]").forEach(btn=>{
      btn.addEventListener("click", ()=> toggleVideoLike(profileName, btn.getAttribute("data-like-video")));
    });
    list.querySelectorAll("[data-del-video]").forEach(btn=>{
      btn.addEventListener("click", ()=> { void deleteVideo(profileName, btn.getAttribute("data-del-video")); });
    });

    for(const v of vids){
      const el = document.getElementById(`vid_${v.id}`);
      if(!el) continue;
      const url = await mediaUrl(v.mediaKey);
      if(url) el.src = url;
    }
  }

  // =========================
  // Actions
  // =========================
  function toggleProfileLike(profileName){
    if(!currentUser) return openAuth();
    ensureUser(profileName);
    const u = users[profileName];

    u.profileLikedBy ||= {};
    if(u.profileLikedBy[currentUser]){
      delete u.profileLikedBy[currentUser];
      u.profileLikes = Math.max(0,(u.profileLikes||0)-1);
    }else{
      u.profileLikedBy[currentUser]=true;
      u.profileLikes = (u.profileLikes||0)+1;
    }
    safeSave();
    void renderProfile(profileName);
  }

  function toggleVideoLike(profileName, videoId){
    if(!currentUser) return openAuth();
    ensureUser(profileName);
    const u = users[profileName];
    const v = u.videos.find(x=>x.id===videoId);
    if(!v) return;

    v.likedBy ||= {};
    if(v.likedBy[currentUser]){
      delete v.likedBy[currentUser];
      v.likes = Math.max(0,(v.likes||0)-1);
    }else{
      v.likedBy[currentUser]=true;
      v.likes = (v.likes||0)+1;
    }
    safeSave();
    if((location.hash||"").startsWith("#profile:")) void renderProfile(profileName);
  }

  async function deleteVideo(profileName, videoId){
    if(!canDeleteVideo(currentUser, profileName)) return;
    if(!confirm("ნამდვილად გინდა წაშლა?")) return;

    ensureUser(profileName);
    const u = users[profileName];
    const v = u.videos.find(x=>x.id===videoId);
    if(v && v.mediaKey){
      await idbDeleteMedia(v.mediaKey);
      revokeMediaUrl(v.mediaKey);
    }
    u.videos = u.videos.filter(x=>x.id!==videoId);
    safeSave();
    await renderProfile(profileName);
  }

  async function uploadMany(files){
    if(!files || files.length === 0) return;
    if(!currentUser) return openAuth();

    ensureUser(currentUser);
    if(!isEditor(currentUser)){
      alert("ვიდეოს ატვირთვა მხოლოდ ედითორებს/VIP-ს შეუძლიათ.");
      return;
    }

    for(const f of files){
      const mb = f.size/(1024*1024);
      if(mb > MAX_VIDEO_MB){
        alert(`ერთ-ერთი ვიდეო ძალიან დიდია (${mb.toFixed(1)}MB).\nმაქსიმუმი არის ${MAX_VIDEO_MB}MB თითო ვიდეო.`);
        return;
      }
    }

    for(const file of files){
      const key = `media_${crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(16).slice(2)+Date.now())}`;
      try{
        await idbPutMedia(key, file, { type: "video", name: file.name });
      }catch(e){
        alert("ვერ შეინახა ვიდეო. შეიძლება დისკის/ბრაუზერის ადგილი არ ეყო.");
        return;
      }

      users[currentUser].videos.push({
        id: `v_${Math.random().toString(16).slice(2)}${Date.now()}`,
        createdAt: Date.now(),
        name: file.name,
        mediaKey: key,
        likes: 0,
        likedBy: {}
      });
    }

    safeSave();
  }

  async function onImageChosen(kind, file){
    if(!file || !editProfileName) return;
    ensureUser(editProfileName);
    const u = users[editProfileName];

    const key = `media_${crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(16).slice(2)+Date.now())}`;
    try{
      await idbPutMedia(key, file, { type: "image", name: file.name });
    }catch(e){
      alert("ვერ შეინახა სურათი. შეიძლება ადგილი არ ეყო.");
      return;
    }

    if(kind==="avatar"){
      if(u.avatarKey){ await idbDeleteMedia(u.avatarKey); revokeMediaUrl(u.avatarKey); }
      u.avatarKey = key;
    }
    if(kind==="banner"){
      if(u.bannerKey){ await idbDeleteMedia(u.bannerKey); revokeMediaUrl(u.bannerKey); }
      u.bannerKey = key;
    }

    safeSave();
    await renderProfile(editProfileName);
    await openProfileEditModal(editProfileName);
  }

  // =========================
  // Auth
  // =========================
  async function doRegister(){
    const name = $("regUser").value.trim();
    const pass = $("regPass").value;
    const rolePick = $("regRole").value;

    if(!name) return alert("იუზერნეიმი შეიყვანე");
    if((pass||"").length < 4) return alert("პაროლი მინიმუმ 4 სიმბოლო იყოს");
    if(users[name]) return alert("ეს იუზერნეიმი უკვე არსებობს");

    ensureUser(name);
    users[name].roles = (rolePick === "editor") ? ["editor"] : ["member"];
    users[name].passHash = await sha256(pass);

    currentUser = name; // ✅ ვინც დარეგისტრირდა, თავის პროფილზე შევა (მხოლოდ თავის ბრაუზერში)
    safeSave();
    closeAuth();
    updateAuthLabel();
    goProfile(name);
  }

  async function doLogin(){
    const name = $("loginUser").value.trim();
    const pass = $("loginPass").value;

    if(!users[name]) return alert("ასეთი ანგარიში არ არსებობს");
    ensureUser(name);

    const passHash = await sha256(pass);
    if(users[name].passHash !== passHash) return alert("პაროლი არასწორია");

    currentUser = name; // ✅ დაბრუნებისას ისევ თავის ანგარიშში იქნება (ამ ბრაუზერში)
    safeSave();
    closeAuth();
    updateAuthLabel();
    goProfile(name);
  }

  async function logout(){
    currentUser = null;
    safeSave();
    closeAuth();
    updateAuthLabel();
    goEditors();
  }

  async function openMyProfile(){
    if(!currentUser) return openAuth();
    goProfile(currentUser);
    closeAuth();
  }

  // =========================
  // Init / Bindings
  // =========================
  async function init(){
    try{ await openDB(); }catch(e){
      alert("IndexedDB არ მუშაობს ამ ბრაუზერში. სცადე Chrome-ის ახალი ვერსია.");
      return;
    }

    // normalize existing
    Object.keys(users).forEach(ensureUser);

    // ⚠️ მთავარი ფიქსი: FORCE იქმნება, მაგრამ ავტომატურად არავის ვასმევთ login-ს
    const ver = localStorage.getItem("ezc_version");
    if(ver !== APP_VERSION){
      users = {};
      ensureUser(OWNER_NAME);
      users[OWNER_NAME].roles = ["owner","editor"]; // OWNER+EDITOR
      users[OWNER_NAME].passHash = await sha256(OWNER_PASS);
      users[OWNER_NAME].bio = "საიტის OWNER და ედითორი.";
      currentUser = null; // ✅ ესაა მთავარი: აღარ იქნება ყველასთვის FORCE-ზე შესვლა
      safeSave();
    }else{
      // თუ currentUser აღარ არსებობს users-ში — გამოვიყვანოთ
      if(currentUser && !users[currentUser]) currentUser = null;
      safeSave();
    }

    // NAV
    $("navEditors").addEventListener("click", goEditors);
    $("navEdits").addEventListener("click", goEdits);

    // header
    $("btnAuth").addEventListener("click", openAuth);

    // auth modal
    $("closeAuth").addEventListener("click", closeAuth);
    $("tabLogin").addEventListener("click", ()=> setTab("login"));
    $("tabReg").addEventListener("click", ()=> setTab("register"));
    $("doLoginBtn").addEventListener("click", ()=> { void doLogin(); });
    $("doRegBtn").addEventListener("click", ()=> { void doRegister(); });
    $("openMyProfileBtn").addEventListener("click", ()=> { void openMyProfile(); });
    $("logoutBtn").addEventListener("click", ()=> { void logout(); });

    // profile edit modal
    $("closeProfileEdit").addEventListener("click", closeProfileEdit);
    $("profileEditModal").addEventListener("click", (e)=>{ if(e.target === $("profileEditModal")) closeProfileEdit(); });
    $("profileEditModal").addEventListener("click", (e)=>{
      const pick = e.target?.getAttribute?.("data-pick");
      const del = e.target?.getAttribute?.("data-del");
      if(pick) triggerPick(pick);
      if(del) { void deleteImage(del); }
    });
    $("saveBioBtn").addEventListener("click", ()=> { void saveBio(); });

    // upload modal
    $("closeUpload").addEventListener("click", closeUploadModal);
    $("uploadModal").addEventListener("click", (e)=>{ if(e.target === $("uploadModal")) closeUploadModal(); });
    $("chooseVideosBtn").addEventListener("click", chooseVideos);
    $("uploadConfirmBtn").addEventListener("click", async ()=>{
      if(pendingUploadFiles.length === 0) return alert("ჯერ ვიდეო აირჩიე.");
      await uploadMany(pendingUploadFiles);
      closeUploadModal();
      if(currentUser) goProfile(currentUser);
    });

    // role modal
    $("closeRole").addEventListener("click", closeRoleModal);
    $("roleModal").addEventListener("click", (e)=>{ if(e.target === $("roleModal")) closeRoleModal(); });
    $("setBaseMember").addEventListener("click", ()=> setBaseRole("member"));
    $("setBaseEditor").addEventListener("click", ()=> setBaseRole("editor"));
    $("toggleAdminBtn").addEventListener("click", ()=> toggleRoleOnTarget("admin"));
    $("toggleVipBtn").addEventListener("click", ()=> toggleRoleOnTarget("vip"));
    $("saveRolesBtn").addEventListener("click", saveRoles);

    // file inputs
    $("videoInput").addEventListener("change", (e)=> {
      pendingUploadFiles = [...(e.target.files||[])];
      renderChosenFiles();
    });
    $("avatarInput").addEventListener("change", (e)=> { void onImageChosen("avatar", e.target.files?.[0]); });
    $("bannerInput").addEventListener("change", (e)=> { void onImageChosen("banner", e.target.files?.[0]); });

    // route
    window.addEventListener("hashchange", ()=> { void route(); });

    updateAuthLabel();

    // ✅ არასდროს გადავიყვანოთ ყველას FORCE-ზე ან პროფილზე
    // თუ login-ია (currentUser არსებობს) და hash ცარიელია -> მის პროფილზე
    if(!location.hash){
      location.hash = currentUser ? ("#profile:" + encodeURIComponent(currentUser)) : "#editors";
    }

    await route();
  }

  init();
})();