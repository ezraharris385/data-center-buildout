#!/usr/bin/env python3
"""design_engine.py — converts DesignStudioEquipmentSpecs.xlsx (CBRE Powered Land
Design Studio engine data) into data/design_engine.json for the app.

Usage: python3 scripts/design_engine.py [path-to-xlsx]
Default source: ~/Downloads/DesignStudioEquipmentSpecs.xlsx
"""
import json, os, sys
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads/DesignStudioEquipmentSpecs.xlsx')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'design_engine.json')

wb = openpyxl.load_workbook(SRC, data_only=True)

def rows(name):
    ws = wb[name]
    data = list(ws.iter_rows(values_only=True))
    hdr = [str(h) if h else f'c{i}' for i, h in enumerate(data[0])]
    out = []
    for r in data[1:]:
        if all(c is None for c in r):
            continue
        d = {h: c for h, c in zip(hdr, r) if c is not None}
        if d:
            out.append(d)
    return out

def kv(name, key_col, val_col, extra=None):
    out = {}
    for r in rows(name):
        k = r.get(key_col)
        if k is None or str(k).startswith('Source'):
            continue
        out[str(k)] = {val_col: r.get(val_col), **({e: r.get(e) for e in (extra or []) if e in r})}
    return out

engine = {
    'meta': {'source': 'DesignStudioEquipmentSpecs.xlsx — CBRE Powered Land Design Studio, catalog v1'},
    'equipment': [r for r in rows('Equipment - All') if r.get('ID')],
    'buildingPresets': [r for r in rows('Building Presets') if r.get('Family')],
    'engineParameters': rows('Engine Parameters'),
    'costModel': {r['Item']: {'rate': r.get('Rate'), 'unit': r.get('Unit'), 'notes': r.get('Notes')}
                  for r in rows('Cost Model') if r.get('Item')},
    'efficiencyModel': {r['Driver']: r.get('Value') for r in rows('Efficiency Model') if r.get('Driver')},
    'gridFactors': {r['Region']: r for r in rows('Grid Factors')
                    if r.get('Region') and not str(r['Region']).startswith('Source')},
    'wetBulb': {r['Metro']: r for r in rows('Wet-Bulb')
                if r.get('Metro') and not str(r['Metro']).startswith('Source')},
    'leadTimes': {r['Item']: r.get('Lead time (weeks)') for r in rows('Lead Times')
                  if r.get('Item') and not str(r['Item']).startswith('Source')},
    'constants': {r['Constant']: {'value': r.get('Value'), 'unit': r.get('Unit')}
                  for r in rows('Engine Constants') if r.get('Constant')},
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(engine, f, indent=1, default=str)
print(f"design_engine.json: {len(engine['equipment'])} equipment, "
      f"{len(engine['buildingPresets'])} building presets, "
      f"{len(engine['costModel'])} cost lines, {len(engine['gridFactors'])} grid regions")
