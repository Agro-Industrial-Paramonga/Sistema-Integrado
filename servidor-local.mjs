/* ============================================================
   SERVIDOR LOCAL PARA PREVISUALIZAR
   ------------------------------------------------------------
   Sirve la carpeta del proyecto en http://127.0.0.1:5501
   y recarga el navegador automaticamente al guardar un archivo.

   Se lanza con:  previsualizar.bat  (doble clic)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5501;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

const clientes = new Set();

function avisarRecarga() {
  for (const res of clientes) {
    try { res.write('data: reload\n\n'); } catch { /* ignora */ }
  }
}

let temporizador = null;
function programarRecarga() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    console.log('cambio detectado -> recargando navegador');
    avisarRecarga();
  }, 250);
}

try {
  fs.watch(ROOT, { recursive: true }, (_evento, archivo) => {
    if (!archivo) return;
    if (/node_modules|\\\.git\\|\\build\\|\\app\\android\\/i.test(archivo)) return;
    if (/\.(html|js|mjs|css|json|png|jpg|jpeg|svg|webp)$/i.test(archivo)) programarRecarga();
  });
} catch (e) {
  console.log('aviso: no se pudo vigilar cambios, la recarga automatica queda desactivada');
}

const SNIPPET = `
<script>
(function () {
  try {
    var es = new EventSource('/__recarga');
    es.onmessage = function () { location.reload(); };
  } catch (e) {}
})();
</script>
`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/__recarga') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clientes.add(res);
    const latido = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignora */ } }, 20000);
    req.on('close', () => { clearInterval(latido); clientes.delete(res); });
    return;
  }

  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let archivo = path.resolve(ROOT, rel);

  if (!archivo.startsWith(ROOT)) {
    res.writeHead(403).end('prohibido');
    return;
  }
  if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) {
    archivo = path.join(archivo, 'index.html');
  }

  fs.readFile(archivo, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    const ext = path.extname(archivo).toLowerCase();
    if (ext === '.html') {
      const html = data.toString('utf8').replace(/<\/body>/i, SNIPPET + '</body>');
      res.writeHead(200, { 'content-type': MIME[ext], 'cache-control': 'no-store' }).end(html);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(data);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('El puerto ' + PORT + ' ya esta en uso. Cierra la otra ventana del servidor.');
  } else {
    console.log('Error: ' + e.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Previsualizacion lista:  http://127.0.0.1:' + PORT);
  console.log('  Carpeta servida:         ' + ROOT);
  console.log('');
  console.log('  Guarda cualquier archivo y el navegador se recarga solo.');
  console.log('  Cierra esta ventana para detener el servidor.');
  console.log('');
});
