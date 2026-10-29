# Avisos de terceros

Este proyecto usa componentes de terceros. Cada uno conserva su licencia y su
titular. Esta lista se mantiene para cumplir con los requisitos de atribución e
inclusión de avisos de esas licencias.

Última revisión: 2026-10-29

## 1. Código incluido dentro de la aplicación (APK)

| Componente | Versión | Licencia | Titular |
|---|---|---|---|
| Capacitor (core, cli, android) | 8.5.3 | MIT | Ionic / Outsystems |
| @capacitor/local-notifications | 8.3.1 | MIT | Ionic / Outsystems |
| @capacitor/push-notifications | 8.1.3 | MIT | Ionic / Outsystems |
| AndroidX AppCompat, CoordinatorLayout, Core SplashScreen | según Plantilla de Capacitor | Apache 2.0 | The Android Open Source Project |
| AndroidX WorkManager (work-runtime) | 2.9.1 | Apache 2.0 | The Android Open Source Project |
| Firebase Messaging SDK | 25.0.1 | Apache 2.0 + Términos de Servicio de Google | Google LLC |
| Tailwind CSS (compilado en `tools/tailwind`) | 3.4.17 | MIT | Tailwind Labs Inc. |

## 2. Código cargado desde internet (no se redistribuye)

| Componente | Versión | Licencia | Titular |
|---|---|---|---|
| Leaflet | 1.9.4 | BSD 2-Clause | Volodymyr Agafonkin |
| @supabase/supabase-js | 2.x | MIT | Supabase Inc. |
| Firebase JS SDK (app, messaging) | 10.13.2 | Apache 2.0 | Google LLC |
| Chart.js | 4.x | MIT | Chart.js Contributors |
| chartjs-plugin-datalabels | 2.x | MIT | Chart.js Contributors |
| SheetJS Community Edition (xlsx) | 0.20.2 | Apache 2.0 | SheetJS LLC |
| jsPDF | 2.5.1 | MIT | James Hall y colaboradores |
| html2canvas | 1.4.1 | MIT | Niklas von Hertzen |
| Font Awesome Free (iconos) | 6.4.0 | CC BY 4.0 (iconos), SIL OFL 1.1 (fuentes), MIT (código) | Fonticons, Inc. |
| Google Fonts: Caveat, Inter | — | SIL Open Font License 1.1 | Respectivos autores |

## 3. Imágenes y datos geográficos

El material gráfico que viaja en el repositorio es **propiedad de Agro Industrial
Paramonga** o fue producido para la empresa. La única excepción es el fondo
satelital, que se descarga de un servicio de terceros y no se redistribuye.

| Elemento | Origen y condiciones |
|---|---|
| Logo de la empresa (`assets/logo.png`, `hallazgos/assets/logo.png`, iconos del APK) | Marca de Agro Industrial Paramonga. |
| `assets/compuertas/gate-green.gif`, `gate-red.gif` | Creados por la empresa con herramientas de IA generativa; sin material de terceros. |
| `assets/huayco.png`, `huayco2.png`, `antes.png`, `durante.png`, `despues.png`, `flujo.png` | Material propio del plan de contingencia de la empresa. |
| `assets/mapa-canales.png`, `mapa-puntos-criticos.png` | Material propio de la empresa. |
| `assets/campos.geojson` | Datos internos de la empresa (linderos de campos). |
| `hallazgos/assets/*.png` | Material propio de la empresa. |
| Fondo satelital «Sentinel-2 cloudless 2025» | © EOX IT Services GmbH, con datos modificados de Copernicus Sentinel-2. Licencia **CC BY 4.0**. Atribución visible en el mapa. Es el fondo por defecto. |
| Fondo de alta resolución «World Imagery» (opcional) | © Esri, Maxar. Solo se activa si se configura una API key de Esri en `plan-contingencia/mapa.js`; sin clave el botón no aparece. Sujeto a los Términos de Uso de Esri y con costo por tile arriba de 2 millones al mes. |

## 4. Texto de las licencias

### MIT

Se aplica a Capacitor y sus plugins, @supabase/supabase-js, Chart.js,
chartjs-plugin-datalabels, jsPDF, html2canvas y Tailwind CSS.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### BSD 2-Clause (Leaflet)

```
Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Apache License 2.0

Se aplica a AndroidX, WorkManager, Firebase y SheetJS.
Texto completo: https://www.apache.org/licenses/LICENSE-2.0

### CC BY 4.0 (iconos de Font Awesome Free)

Los iconos de Font Awesome Free están bajo Creative Commons Attribution 4.0.
Atribución: «Icons by Fonticons, Inc. — Font Awesome Free (CC BY 4.0)».
Texto completo: https://creativecommons.org/licenses/by/4.0/

### SIL Open Font License 1.1

Se aplica a las fuentes de Font Awesome y a las tipografías Caveat e Inter de
Google Fonts. Texto completo: https://openfontlicense.org/

## 5. Marca y datos

Los nombres, logos y marcas de terceros pertenecen a sus titulares y se usan
solo para identificar los componentes. Los datos de personal y de operación son
propiedad de Agro Industrial Paramonga.
