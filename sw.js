/* Preenche — service worker.
 * Estratégia: rede primeiro (sempre a versão mais nova quando há internet),
 * com o cache como reserva quando está offline ou a rede demora mais de 3 s.
 * Ao publicar uma versão nova, basta subir os arquivos; troque VERSION só
 * se quiser forçar a limpeza do cache antigo.
 */
const VERSION = 'preenche-v0.2.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/core.js', 'js/format.js', 'js/sheet.js', 'js/pdf.js', 'js/app.js',
  'vendor/jszip.min.js', 'vendor/xlsx.full.min.js', 'vendor/docx-preview.min.js', 'vendor/marked.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'exemplos/modelo-contrato.docx', 'exemplos/modelo-proposta.md', 'exemplos/modelo-carta.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('preenche-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    });
    net.catch(() => {});
    try {
      return await timeout(net, 3000);
    } catch (e) {
      const hit = (await caches.match(req, { ignoreSearch: true })) ||
        (req.mode === 'navigate' ? await caches.match('index.html') : null);
      if (hit) return hit;
      // Nada no cache: espera a rede (primeira visita em conexão lenta)
      return net.catch(() => Response.error());
    }
  })());
});
