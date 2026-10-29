# Tailwind compilado (hallazgos)

`hallazgos/index.html` usaba `https://cdn.tailwindcss.com` (Play CDN), que compila
Tailwind en el navegador y la propia Tailwind declara solo para prototipos: pesa más,
necesita internet y no se puede auditar. Acá se compila el CSS una vez y se sirve como
archivo normal.

## Regenerar el CSS

Requiere Node 22 y pnpm.

```powershell
pnpm --dir tools/tailwind install
pnpm --dir tools/tailwind build
```

Eso reescribe `hallazgos/tailwind.css` (minificado). **Hay que commitear el resultado**:
GitHub Pages sirve la rama tal cual, sin paso de compilación propia.

## Verificar

```powershell
pnpm --dir tools/tailwind check
```

Recorre `hallazgos/index.html` y los `.js` de esa carpeta, y falla si aparece una
utilidad de Tailwind que no esté en el CSS compilado. El workflow
`.github/workflows/verificar-tailwind.yml` corre lo mismo en cada push y además
falla si el CSS commiteado quedó viejo respecto de las fuentes.

## Cuándo hay que recompilar

- Se agregan o cambian clases de Tailwind en `hallazgos/`.
- Se cambia `tailwind.config.js` (por ejemplo, el `safelist` para clases armadas en
  tiempo de ejecución).
- Se sube la versión de Tailwind (hoy 3.4.17, fija en `package.json`).
