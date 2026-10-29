/** Config de Tailwind para hallazgos (reemplaza al Play CDN).
 *  El modo noche no usa el prefijo dark: sino reglas propias en index.html,
 *  así que no hace falta darkMode: 'class'.
 */
module.exports = {
    content: [
        '../../hallazgos/index.html',
        '../../hallazgos/app.js',
        '../../hallazgos/carta-rrll.js',
        '../../hallazgos/push-jefe.js'
    ],
    theme: {
        extend: {}
    },
    plugins: [],
    /* Por si alguna clase se arma en tiempo de ejecución: queda generada igual. */
    safelist: [
        { pattern: /^(bg|text|border|ring|from|to|via)-(slate|gray|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900)$/ },
        { pattern: /^(bg|text|border|ring)-(white|black|transparent)$/ },
        'hidden',
        'block',
        'flex',
        'inline-flex',
        'grid'
    ]
};
