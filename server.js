const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "server-data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const MAX_BODY_SIZE = 75 * 1024 * 1024;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function ensureStateFile() {
  await fs.mkdir(DATA_DIR, {recursive: true});

  try {
    await fs.access(STATE_FILE);
  } catch {
    await fs.writeFile(STATE_FILE, JSON.stringify({users: {}}, null, 2), "utf-8");
  }
}

async function readState() {
  await ensureStateFile();
  const rawState = await fs.readFile(STATE_FILE, "utf-8");
  const state = JSON.parse(rawState || "{}");
  return {
    users: state.users && typeof state.users === "object" ? state.users : {},
  };
}

async function writeState(nextState) {
  await ensureStateFile();
  const safeState = {
    users: nextState.users && typeof nextState.users === "object" ? nextState.users : {},
    updatedAt: new Date().toISOString(),
  };
  const tmpFile = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(safeState, null, 2), "utf-8");
  await fs.rename(tmpFile, STATE_FILE);
  return safeState;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("La sauvegarde est trop volumineuse pour ce prototype."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {ok: true});
    return;
  }

  if (url.pathname === "/api/state" && request.method === "GET") {
    sendJson(response, 200, await readState());
    return;
  }

  if (url.pathname === "/api/state" && request.method === "PUT") {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const savedState = await writeState(payload);
    sendJson(response, 200, {ok: true, updatedAt: savedState.updatedAt});
    return;
  }

  sendJson(response, 404, {error: "Route API inconnue."});
}

async function serveStaticFile(request, response, url) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const absolutePath = path.resolve(ROOT_DIR, `.${requestedPath}`);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    response.writeHead(403, {"Content-Type": "text/plain; charset=utf-8"});
    response.end("Accès interdit.");
    return;
  }

  try {
    const file = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    response.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
    response.end("Fichier introuvable.");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStaticFile(request, response, url);
  } catch (error) {
    sendJson(response, 500, {error: error.message || "Erreur serveur."});
  }
});

server.listen(PORT, () => {
  console.log(`AlgoScratch disponible sur http://localhost:${PORT}/`);
  console.log(`Données élèves : ${STATE_FILE}`);
});
