#!/usr/bin/env python3
"""
Convierte varios KMZ en un solo GeoJSON de zonas para la pestaÃ±a
Puntos criticos (relleno y borde con el color que trae cada archivo).

Uso:
  python tools/kmz-a-capas.py salida.geojson capa=Ruta.kmz [capa2=Otra.kmz ...]

Cada feature queda con: nombre, capa, relleno (hex), borde (hex), alfa.
"""
import json
import math
import sys
import zipfile
from xml.etree import ElementTree as ET

KML = '{http://www.opengis.net/kml/2.2}'


def leer_kml(ruta):
    if ruta.lower().endswith('.kmz'):
        with zipfile.ZipFile(ruta) as z:
            nombre = next(n for n in z.namelist() if n.lower().endswith('.kml'))
            return ET.fromstring(z.read(nombre))
    with open(ruta, 'rb') as f:
        return ET.fromstring(f.read())


def color_kml(kml_color):
    """KML es aabbggrr; devuelve (#rrggbb, alfa 0..1)."""
    if not kml_color or len(kml_color) != 8:
        return None, None
    a = int(kml_color[0:2], 16) / 255.0
    b = kml_color[2:4]
    g = kml_color[4:6]
    r = kml_color[6:8]
    return '#' + (r + g + b).lower(), round(a, 3)


def estilos(raiz):
    """id de Style -> (relleno, alfa); resuelve StyleMap al estilo normal."""
    simples = {}
    for st in raiz.iter(f'{KML}Style'):
        sid = st.get('id')
        pol = st.find(f'{KML}PolyStyle/{KML}color')
        if sid and pol is not None:
            simples[sid] = color_kml(pol.text.strip())
    mapas = {}
    for sm in raiz.iter(f'{KML}StyleMap'):
        sid = sm.get('id')
        for par in sm.findall(f'{KML}Pair'):
            clave = par.findtext(f'{KML}key')
            url = (par.findtext(f'{KML}styleUrl') or '').lstrip('#')
            if clave == 'normal' and sid:
                mapas[sid] = url
    return simples, mapas


def anillos(pol):
    ext = pol.find(f'{KML}outerBoundaryIs/{KML}LinearRing/{KML}coordinates')
    if ext is None:
        return None
    borde = coords(ext.text)
    huecos = [coords(h.text) for h in pol.findall(f'{KML}innerBoundaryIs/{KML}LinearRing/{KML}coordinates')]
    return [borde] + huecos


def coords(texto):
    salida = []
    for trozo in (texto or '').split():
        p = trozo.split(',')
        if len(p) >= 2:
            salida.append([round(float(p[0]), 6), round(float(p[1]), 6)])
    return salida


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    salida = sys.argv[1]
    pares = []
    for arg in sys.argv[2:]:
        capa, ruta = arg.split('=', 1)
        pares.append((capa, ruta))

    features = []
    for capa, ruta in pares:
        raiz = leer_kml(ruta)
        simples, mapas = estilos(raiz)
        for pm in raiz.iter(f'{KML}Placemark'):
            nombre = (pm.findtext(f'{KML}name') or '').strip()
            url = (pm.findtext(f'{KML}styleUrl') or '').lstrip('#')
            estilo = simples.get(mapas.get(url, url))
            if not estilo or not estilo[0]:
                estilo = ('#64748b', 0.3)

            poligonos = []
            for pol in pm.iter(f'{KML}Polygon'):
                a = anillos(pol)
                if a:
                    poligonos.append(a)
            if not poligonos:
                continue

            # Los colores del KML son muy opacos: se suavizan para el mapa
            relleno, alfa = estilo
            alfa = 0.18 if alfa >= 0.9 else round(min(0.32, alfa * 0.42), 3)

            geometria = ({'type': 'Polygon', 'coordinates': poligonos[0]}
                         if len(poligonos) == 1 else
                         {'type': 'MultiPolygon', 'coordinates': poligonos})
            features.append({
                'type': 'Feature',
                'properties': {'nombre': nombre, 'capa': capa, 'relleno': relleno, 'alfa': alfa},
                'geometry': geometria
            })

    with open(salida, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f,
                  ensure_ascii=False, separators=(',', ':'))
    print(f'zonas: {len(features)} -> {salida}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
