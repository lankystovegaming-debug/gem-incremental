import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5500);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function sendFile(response, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendNotFound(response);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

function sendNotFound(response) {
  const filePath = path.join(ROOT, "404.html");

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(content);
  });
}

function safePathname(url) {
  const pathname = new URL(url, `http://127.0.0.1:${PORT}`).pathname;
  const decoded = decodeURIComponent(pathname);
  const normalized = path.posix.normalize(decoded);

  if (normalized.includes("..")) {
    return null;
  }

  return normalized;
}

const server = http.createServer((request, response) => {
  const pathname = safePathname(request.url || "/");

  if (!pathname) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  // Exact dynamic profile route. This is the part Live Server does not provide.
  if (/^\/user\/[0-9a-fA-F-]{36}\/?$/.test(pathname)) {
    sendFile(response, path.join(ROOT, "user", "index.html"));
    return;
  }

  let relativePath = pathname === "/" ? "" : pathname.slice(1);
  let filePath = path.join(ROOT, relativePath);

  if (pathname === "/") {
    filePath = path.join(ROOT, "index.html");
  } else if (pathname.endsWith("/")) {
    filePath = path.join(ROOT, relativePath, "index.html");
  }

  // Prevent the requested path from escaping the project directory.
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, "index.html")) {
    sendNotFound(response);
    return;
  }

  // Match static hosting's directory redirect for clean Minigames URLs.
  if (/^\/minigames(?:\/[a-z0-9-]+)?$/.test(pathname)) {
    fs.stat(path.join(filePath, "index.html"), (error, stats) => {
      if (!error && stats.isFile()) {
        response.writeHead(301, {
          Location: `${pathname}/${new URL(request.url, "http://localhost").search}`,
        });
        response.end();
      } else sendNotFound(response);
    });
    return;
  }

  sendFile(response, filePath);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Gem Incremental dev server: http://127.0.0.1:${PORT}`);
  console.log(`Dynamic profiles: http://127.0.0.1:${PORT}/user/<uuid>/`);
});
