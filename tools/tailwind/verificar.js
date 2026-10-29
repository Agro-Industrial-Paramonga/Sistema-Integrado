/* Verifica que el CSS compilado cubra las clases que usan las páginas de hallazgos.
   Uso: node verificar.js
   Falla (exit 1) si encuentra una clase con pinta de Tailwind que no exista en
   tailwind.css ni esté definida a mano en el <style> de index.html. */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..', '..');
const dirHallazgos = path.join(raiz, 'hallazgos');
const archivos = ['index.html', 'app.js', 'carta-rrll.js', 'push-jefe.js']
    .map(f => path.join(dirHallazgos, f))
    .filter(f => fs.existsSync(f));

const css = fs.readFileSync(path.join(dirHallazgos, 'tailwind.css'), 'utf8');

const html = fs.readFileSync(path.join(dirHallazgos, 'index.html'), 'utf8');
const estilosPropios = new Set();
for (const id of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) estilosPropios.add(id[1]);
for (const bloque of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const sel of bloque[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) estilosPropios.add(sel[1]);
    for (const sel of bloque[1].matchAll(/#([A-Za-z0-9_-]+)/g)) estilosPropios.add(sel[1]);
}

const clases = new Map(); // clase -> archivo
for (const archivo of archivos) {
    const texto = fs.readFileSync(archivo, 'utf8');
    const patrones = [
        /class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g,
        /classList\.(?:add|remove|toggle)\(([^)]*)\)/g,
        /['"`]([^'"`\n]{2,120})['"`]/g
    ];
    for (const patron of patrones) {
        for (const m of texto.matchAll(patron)) {
            for (const token of m[1].split(/\s+/)) {
                const t = token.trim();
                if (!/^[-A-Za-z0-9_:/[\].,%()#!&+*~^$|]+$/.test(t)) continue;
                if (!/^[a-z[-]/.test(t)) continue;
                if (t.endsWith(':') || t.startsWith('--')) continue;
                if (!clases.has(t)) clases.set(t, path.basename(archivo));
            }
        }
    }
}

function escapada(clase) {
    return clase.replace(/[^A-Za-z0-9_-]/g, c => '\\' + c);
}

const faltantes = [];
for (const [clase, archivo] of clases) {
    if (estilosPropios.has(clase)) continue;
    const selector = '.' + escapada(clase);
    if (css.includes(selector + '{') || css.includes(selector + ':') ||
        css.includes(selector + ',') || css.includes(selector + ' ') ||
        css.includes(selector + '>') || css.includes(selector + '}')) continue;
    faltantes.push({ clase, archivo });
}

/* Muchos "tokens" son texto normal (ids, valores, palabras). Solo avisamos de los
   que se parecen a utilidades de Tailwind y no existen como selector. */
const sospechosas = faltantes.filter(f =>
    /^(?:[a-z]+:)*(?:-)?(?:bg|text|border|ring|from|to|via|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|gap|space|grid|col|row|flex|items|justify|self|font|leading|tracking|rounded|shadow|opacity|z|top|left|right|bottom|inset|overflow|truncate|cursor|pointer|select|transition|duration|ease|animate|divide|order|object|aspect|whitespace|break|uppercase|lowercase|capitalize|italic|underline|line)-/.test(f.clase)
);

if (sospechosas.length) {
    console.error('Clases sospechosas sin CSS (' + sospechosas.length + '):');
    for (const s of sospechosas.slice(0, 40)) console.error('  ' + s.clase + '  (' + s.archivo + ')');
    process.exit(1);
}

console.log('OK: ' + clases.size + ' tokens revisados, sin utilidades de Tailwind faltantes.');
