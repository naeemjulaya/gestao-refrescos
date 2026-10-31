/* Service Worker — Gestão de Refrescos (PWA offline) */
const CACHE = "refrescos-v3";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        // Guarda a página inicial e, a partir dela, todos os ficheiros
        // JavaScript e CSS com hash gerados pelo Next.js. Sem isto, uma
        // instalação recém-publicada podia precisar de uma segunda visita
        // online antes de abrir completamente offline.
        await cache.addAll(PRECACHE);
        try {
          const response = await fetch("/", { cache: "no-store" });
          const html = await response.text();
          const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
            .map((match) => new URL(match[1], self.location.origin))
            .filter((url) => url.origin === self.location.origin)
            .map((url) => url.pathname + url.search);
          await Promise.all(refs.map((url) => cache.add(url).catch(() => {})));
        } catch {
          // Os recursos essenciais acima continuam disponíveis; a próxima
          // visita online completa o cache dinâmico.
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const isNavigate = req.mode === "navigate" || accept.includes("text/html");

  if (isNavigate) {
    // Rede primeiro (para manter a app atualizada), cache como recurso offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() =>
          caches
            .match("/")
            .then((shell) => shell || caches.match(req))
            .then((r) => r || Response.error())
        )
    );
    return;
  }

  // Restantes pedidos GET: rede primeiro, guarda no cache, offline usa o cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || Response.error()))
  );
});
