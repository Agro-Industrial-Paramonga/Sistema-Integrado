#!/usr/bin/env python3
"""
Convierte el KMZ de campos de AIPSA al GeoJSON que usa el mapa
(plan-contingencia/assets/campos-aipsa.geojson).

- Cada sector queda como POLIGONO (para el relleno verde y el nombre al pasar el mouse).
- El borde se corta donde coincide con una linea turquesa: esos tramos no se
  pintan de verde porque mandan las turquesas (campos en riesgo: rojo + alerta).
- Los tramos verdes que quedan se guardan como LINEAS aparte (propiedad tipo="borde").

Uso:
  python tools/kmz-a-geojson.py AIPSA.kmz turquesa.json \\
      -o plan-contingencia/assets/campos-aipsa.geojson

turquesa.json es la salida de:
  select json_agg(coords) from mapa_lineas where color = '#06b6d4';
es opcional: sin el, todo el borde se pinta de verde.
"""
import argparse
import json
import math
import sys
import zipfile
from xml.etree import ElementTree as ET

KML = '{http://www.opengis.net/kml/2.2}'
TOLERANCIA_M = 2.0      # a cuantos metros de la turquesa ya se considera el mismo borde
MIN_PUNTOS_TRAMO = 2    # un tramo verde necesita al menos 2 puntos


def leer_kml(ruta):
    if ruta.lower().endswith('.kmz'):
        with zipfile.ZipFile(ruta) as z:
            nombre = next(n for n in z.namelist() if n.lower().endswith('.kml'))
            return ET.fromstring(z.read(nombre))
    with open(ruta, 'rb') as f:
        return ET.fromstring(f.read())


def anillos(poligono):
    """Devuelve (exterior, [huecos]) en grados (lon, lat)."""
    ext = poligono.find(f'{KML}outerBoundaryIs/{KML}LinearRing/{KML}coordinates')
    if ext is None:
        return None, []
    borde = parse_coords(ext.text)
    huecos = []
    for h in poligono.findall(f'{KML}innerBoundaryIs/{KML}LinearRing/{KML}coordinates'):
        huecos.append(parse_coords(h.text))
    return borde, huecos


def parse_coords(texto):
    puntos = []
    for trozo in (texto or '').split():
        partes = trozo.split(',')
        if len(partes) < 2:
            continue
        puntos.append((round(float(partes[0]), 6), round(float(partes[1]), 6)))
    return puntos


def a_metros(lon, lat, lat0):
    return (lon * 111320.0 * math.cos(math.radians(lat0)), lat * 111132.0)


def distancia_punto_segmento(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def construir_indice_turquesa(lineas, lat0):
    """Segmentos turquesa ya en metros, para medir distancias rapido."""
    segmentos = []
    for coords in lineas:
        pts = []
        for c in coords:
            if isinstance(c, dict):
                lat, lon = c.get('lat'), c.get('lng', c.get('lon'))
            else:
                lat, lon = c[0], c[1]
            if lat is None or lon is None:
                continue
            pts.append(a_metros(float(lon), float(lat), lat0))
        for i in range(len(pts) - 1):
            segmentos.append((*pts[i], *pts[i + 1]))
    return segmentos


def cubierto(p1, p2, segmentos, lat0):
    """El borde p1-p2 coincide con una turquesa?"""
    if not segmentos:
        return False
    a = a_metros(p1[0], p1[1], lat0)
    b = a_metros(p2[0], p2[1], lat0)
    muestras = [a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)]
    for mx, my in muestras:
        for x1, y1, x2, y2 in segmentos:
            if distancia_punto_segmento(mx, my, x1, y1, x2, y2) <= TOLERANCIA_M:
                return True
    return False


def tramos_libres(anillo, segmentos, lat0):
    """Parte el anillo en tramos que NO coinciden con turquesas."""
    if len(anillo) < 3:
        return []
    cerrado = anillo + [anillo[0]]
    cubiertos = [cubierto(cerrado[i], cerrado[i + 1], segmentos, lat0)
                 for i in range(len(cerrado) - 1)]
    if not any(cubiertos):
        return [cerrado]

    tramos, actual = [], []
    for i, tapado in enumerate(cubiertos):
        if tapado:
            if len(actual) >= MIN_PUNTOS_TRAMO:
                tramos.append(actual)
            actual = []
        else:
            if not actual:
                actual = [cerrado[i]]
            actual.append(cerrado[i + 1])
    if len(actual) >= MIN_PUNTOS_TRAMO:
        tramos.append(actual)
    return tramos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('kmz')
    ap.add_argument('turquesa', nargs='?')
    ap.add_argument('-o', '--salida', default='campos-aipsa.geojson')
    args = ap.parse_args()

    raiz = leer_kml(args.kmz)
    lineas_turquesa = []
    if args.turquesa:
        with open(args.turquesa, 'r', encoding='utf-8-sig') as f:
            crudo = json.load(f)
        if isinstance(crudo, list) and crudo and isinstance(crudo[0], dict) and 'coords' in crudo[0]:
            crudo = [x['coords'] for x in crudo]
        elif isinstance(crudo, list) and crudo and isinstance(crudo[0], dict) and 'json_agg' in crudo[0]:
            crudo = crudo[0]['json_agg']
        lineas_turquesa = crudo or []

    lat0 = -10.67
    segmentos = construir_indice_turquesa(lineas_turquesa, lat0)

    features = []
    total_tramos = 0
    total_ptos = 0

    def recorrer(nodo, zona):
        """Recorre carpetas y placemarks guardando la carpeta mas cercana."""
        nonlocal total_tramos, total_ptos
        for hijo in list(nodo):
            if hijo.tag == f'{KML}Folder':
                propia = (hijo.findtext(f'{KML}name') or '').strip() or zona
                recorrer(hijo, propia)
            elif hijo.tag == f'{KML}Placemark':
                agregar(hijo, zona)
            elif hijo.tag in (f'{KML}Document', f'{KML}kml'):
                recorrer(hijo, zona)

    def agregar(pm, zona):
        nonlocal total_tramos, total_ptos
        nombre = (pm.findtext(f'{KML}name') or '').strip()

        poligonos = []
        for pol in pm.iter(f'{KML}Polygon'):
            ext, huecos = anillos(pol)
            if not ext:
                continue
            poligonos.append([ext] + huecos)

        if not poligonos:
            return

        if len(poligonos) == 1:
            geometria = {'type': 'Polygon', 'coordinates': poligonos[0]}
        else:
            geometria = {'type': 'MultiPolygon', 'coordinates': poligonos}
        features.append({
            'type': 'Feature',
            'properties': {'tipo': 'sector', 'nombre': nombre, 'zona': zona},
            'geometry': geometria
        })

        for poligono in poligonos:
            for anillo in poligono:
                for tramo in tramos_libres(anillo, segmentos, lat0):
                    total_tramos += 1
                    total_ptos += len(tramo)
                    features.append({
                        'type': 'Feature',
                        'properties': {'tipo': 'borde', 'nombre': nombre, 'zona': zona},
                        'geometry': {'type': 'LineString', 'coordinates': tramo}
                    })

    recorrer(raiz, '')

    salida = {'type': 'FeatureCollection', 'features': features}
    with open(args.salida, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))

    sectores = sum(1 for f in features if f['properties']['tipo'] == 'sector')
    print(f'sectores: {sectores}')
    print(f'tramos verdes: {total_tramos} (puntos {total_ptos})')
    print(f'archivo: {args.salida}')


if __name__ == '__main__':
    sys.exit(main())
