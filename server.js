import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data.users)) data.users = [];
    if (!Array.isArray(data.sessions)) data.sessions = [];

    return data;
  } catch {
    const base = { users: [], sessions: [] };
    await writeData(base);
    return base;
  }
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeUsername(username = "") {
  return String(username)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
}

function cleanText(value = "") {
  return String(value).trim();
}

function isTikTokUrl(url = "") {
  return /^https?:\/\/(www\.)?(vm\.)?tiktok\.com\/.+/i.test(String(url).trim());
}

function isImageUrl(url = "") {
  const v = String(url).trim();
  if (!v) return true;
  return /^https?:\/\/.+/i.test(v);
}

function roleAllowedToPost(roles = []) {
  return roles.includes("owner") || roles.includes("admin") || roles.includes("vip") || roles.includes("editor");
}

function publicUser(user) {
  return {
    username: user.username,
    roles: Array.isArray(user.roles) ? user.roles : ["member"],
    bio: user.bio || "",
    avatarUrl: user.avatarUrl || "",
    bannerUrl: user.bannerUrl || "",
    edits: Array.isArray(user.edits) ? user.edits : []
  };
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getToken(req) {
  return cleanText(req.headers["x-session-token"] || "");
}

async function getAuthUser(req) {
  const token = getToken(req);
  if (!token) return null;

  const data = await readData();
  const session = data.sessions.find((s) => s.token === token);
  if (!session) return null;

  const user = data.users.find((u) => u.username === session.username);
  if (!user) return null;

  return { data, user, token };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/users", async (_req, res) => {
  const data = await readData();
  res.json(data.users.map(publicUser));
});

app.get("/api/users/:username", async (req, res) => {
  const data = await readData();
  const username = sanitizeUsername(req.params.username);
  const user = data.users.find((u) => u.username === username);

  if (!user) {
    return res.status(404).json({ error: "მომხმარებელი ვერ მოიძებნა" });
  }

  res.json(publicUser(user));
});

app.get("/api/session", async (req, res) => {
  const auth = await getAuthUser(req);
  if (!auth) {
    return res.json({ user: null });
  }

  res.json({ user: publicUser(auth.user) });
});

app.post("/api/register", async (req, res) => {
  const data = await readData();

  const username = sanitizeUsername(req.body.username);
  const password = cleanText(req.body.password);
  const role = req.body.role === "member" ? "member" : "editor";

  if (!username || username.length < 3) {
    return res.status(400).json({ error: "იუზერნეიმი მინიმუმ 3 სიმბოლო უნდა იყოს" });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: "პაროლი მინიმუმ 4 სიმბოლო უნდა იყოს" });
  }

  const exists = data.users.find((u) => u.username === username);
  if (exists) {
    return res.status(400).json({ error: "ეს იუზერნეიმი უკვე არსებობს" });
  }

  const user = {
    username,
    password,
    roles: [role],
    bio: "",
    avatarUrl: "",
    bannerUrl: "",
    edits: []
  };

  const token = createToken();

  data.users.push(user);
  data.sessions.push({
    token,
    username,
    createdAt: new Date().toISOString()
  });

  await writeData(data);

  res.json({
    ok: true,
    token,
    user: publicUser(user)
  });
});

app.post("/api/login", async (req, res) => {
  const data = await readData();

  const username = sanitizeUsername(req.body.username);
  const password = cleanText(req.body.password);

  const user = data.users.find((u) => u.username === username && u.password === password);

  if (!user) {
    return res.status(400).json({ error: "არასწორი იუზერნეიმი ან პაროლი" });
  }

  const token = createToken();

  data.sessions.push({
    token,
    username: user.username,
    createdAt: new Date().toISOString()
  });

  await writeData(data);

  res.json({
    ok: true,
    token,
    user: publicUser(user)
  });
});

app.post("/api/logout", async (req, res) => {
  const token = getToken(req);
  const data = await readData();

  data.sessions = data.sessions.filter((s) => s.token !== token);
  await writeData(data);

  res.json({ ok: true });
});

app.put("/api/users/:username/profile", async (req, res) => {
  const auth = await getAuthUser(req);
  if (!auth) {
    return res.status(401).json({ error: "ჯერ შედი ანგარიშში" });
  }

  const username = sanitizeUsername(req.params.username);
  if (auth.user.username !== username) {
    return res.status(403).json({ error: "ამის შეცვლა არ შეგიძლია" });
  }

  const bio = cleanText(req.body.bio).slice(0, 240);
  const avatarUrl = cleanText(req.body.avatarUrl);
  const bannerUrl = cleanText(req.body.bannerUrl);

  if (!isImageUrl(avatarUrl) || !isImageUrl(bannerUrl)) {
    return res.status(400).json({ error: "ფოტოს ან ბანერის ლინკი არასწორია" });
  }

  auth.user.bio = bio;
  auth.user.avatarUrl = avatarUrl;
  auth.user.bannerUrl = bannerUrl;

  await writeData(auth.data);

  res.json({
    ok: true,
    user: publicUser(auth.user)
  });
});

app.post("/api/users/:username/edits", async (req, res) => {
  const auth = await getAuthUser(req);
  if (!auth) {
    return res.status(401).json({ error: "ჯერ შედი ანგარიშში" });
  }

  const username = sanitizeUsername(req.params.username);
  if (auth.user.username !== username) {
    return res.status(403).json({ error: "ამის გაკეთება არ შეგიძლია" });
  }

  if (!roleAllowedToPost(auth.user.roles || [])) {
    return res.status(403).json({ error: "ვიდეოს დამატება მხოლოდ ედითორს/VIP-ს შეუძლია" });
  }

  const title = cleanText(req.body.title || "TikTok Edit").slice(0, 80);
  const tiktokUrl = cleanText(req.body.tiktokUrl);

  if (!isTikTokUrl(tiktokUrl)) {
    return res.status(400).json({ error: "ჩასვი სწორი TikTok ლინკი" });
  }

  const edit = {
    id: Date.now().toString(),
    title,
    tiktokUrl,
    createdAt: new Date().toISOString()
  };

  auth.user.edits.unshift(edit);
  await writeData(auth.data);

  res.json({ ok: true, edit });
});

app.delete("/api/users/:username/edits/:editId", async (req, res) => {
  const auth = await getAuthUser(req);
  if (!auth) {
    return res.status(401).json({ error: "ჯერ შედი ანგარიშში" });
  }

  const username = sanitizeUsername(req.params.username);
  if (auth.user.username !== username) {
    return res.status(403).json({ error: "ამის წაშლა არ შეგიძლია" });
  }

  const editId = String(req.params.editId);
  auth.user.edits = (auth.user.edits || []).filter((e) => String(e.id) !== editId);

  await writeData(auth.data);
  res.json({ ok: true });
});



app.listen(PORT, () => {
  console.log(`EditZone running on http://localhost:${PORT}`);
});