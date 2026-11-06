"""Рисует крафт предмета из data/recipes с иконками и русскими названиями из файлов модов.

    python3 tools/render_recipe.py '<Avaritia:Resource:5>' out.png --assets <папка с распакованными assets модов>

Иконки и названия берутся из assets/*/textures и assets/*/lang в jar-файлах модов.
"""
import argparse, glob, os, re, sys
from collections import Counter
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = re.compile(r'<[^<>]+>(?:\.withAmount\(\d+\))?|null')

# Предметы, у которых имя иконки или ключ перевода не совпадает с id.
AVARITIA_RESOURCE = ['diamond_lattice', 'crystal_matrix_ingot', 'neutron_pile', 'neutron_nugget', 'neutronium_ingot',
                     'infinity_catalyst', 'infinity_ingot', 'record_fragment', 'starfuel', 'neutronium_gear']
OVERRIDES = {
    'Avaritia:Ultimate_Stew': ('stew', 'item.avaritia:ultimate_stew.name'),
    'Avaritia:Cosmic_Meatballs': ('meatballs', 'item.avaritia:cosmic_meatballs.name'),
    'ExtraTiC:funStuffIngot:2': ('red_aurum_ingot', 'Слиток красного аурума'),
    'ExtraTiC:funStuffIngot:1': ('pokefennium_ingot', 'Покфениумный слиток'),
    'ExtraTiC:funStuffIngot': ('fairy_ingot', 'Волшебный слиток'),
    'eternalsingularity:eternal_singularity': ('eternal_singularity', 'Вечная сингулярность'),
}
for i, n in enumerate(AVARITIA_RESOURCE):
    OVERRIDES[f'Avaritia:Resource:{i}' if i else 'Avaritia:Resource'] = ('resource_' + n, f'item.resource.{n}.name')


def load_recipes():
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data/recipes/*.zs'))):
        for ln in open(f, encoding='utf8'):
            m = re.match(r'.*?(ExtremeCrafting\.addShaped|recipes\.addShaped)\((<[^>]+>(?:\.withAmount\(\d+\))?), (\[\[.*\]\])', ln)
            if not m:
                continue
            rows = re.findall(r'\[([^\[\]]*)\]', m.group(3))
            grid = [[None if t == 'null' else t for t in TOKEN.findall(r)] for r in rows]
            out.setdefault(m.group(2).split('.withAmount')[0], []).append((m.group(1), grid, os.path.basename(f), m.group(2)))
    return out


def load_assets(assets_dirs):
    pngs, lang = {}, {}
    for d in assets_dirs:
        for p in glob.glob(os.path.join(d, '**/textures/**/*.png'), recursive=True):
            pngs.setdefault(os.path.basename(p)[:-4].lower(), p)
        # Loliland кладёт русские строки и в en_US.lang, поэтому читаем оба, ru_RU в приоритете
        for p in sorted(glob.glob(os.path.join(d, '**/lang/*.lang'), recursive=True), key=lambda p: 'ru_RU' in p):
            if not re.search(r'(ru_RU|en_US)\.lang$', p):
                continue
            for ln in open(p, encoding='utf8', errors='replace'):
                if '=' in ln and not ln.startswith('#'):
                    k, v = ln.rstrip('\r\n').split('=', 1)
                    if 'en_US' in p and k in lang and re.search('[а-яА-Я]', lang[k]):
                        continue
                    lang[k] = v
    return pngs, lang


def resolve(item, pngs, lang):
    mod, name = item.strip('<>').split(':')[:2]
    key = item.strip('<>')
    tex, title = None, None
    if key in OVERRIDES:
        tex, t = OVERRIDES[key]
        title = lang.get(t, t)
    tex = pngs.get((tex or name).lower())
    if title is None:
        cands = [v for k, v in lang.items() if k.endswith('.' + name + '.name') or k.endswith(':' + name + '.name')
                 or k == f'item.{name}.name' or k == f'tile.{name}.name']
        cyr = [c for c in cands if re.search('[а-яА-Я]', c)]
        title = (cyr or cands or [key])[0]
    return tex, title


def icon(path, size):
    if not path:
        im = Image.new('RGBA', (16, 16), (200, 0, 200, 255))
    else:
        im = Image.open(path).convert('RGBA')
        w = im.width
        im = im.crop((0, 0, w, w))  # первый кадр анимации
    return im.resize((size, size), Image.NEAREST)


def render(item, out_png, assets_dirs, which=0):
    recipes = load_recipes()
    if item not in recipes:
        sys.exit(f'Нет крафта для {item}')
    kind, grid, src, out_tok = recipes[item][which]
    pngs, lang = load_assets(assets_dirs)
    S, P = 48, 6  # иконка и отступ слота
    n = len(grid)
    cell = S + P
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)

    counts = Counter(t.split('.withAmount')[0] for r in grid for t in r if t)
    legend = sorted(counts.items(), key=lambda kv: -kv[1])
    names = {k: resolve(k, pngs, lang) for k in list(counts) + [item]}

    gw = n * cell + P
    W = max(gw + 260, 900)
    legend_h = 40 + ((len(legend) + 1) // 2) * (S + 10)
    H = 70 + gw + 30 + legend_h
    img = Image.new('RGB', (W, H), (198, 198, 198))
    d = ImageDraw.Draw(img)
    otex, oname = names[item]
    d.text((20, 18), f'{oname}: {"экстремальный верстак" if kind.startswith("Extreme") else "верстак"} {n}×{n}', font=bold, fill=(40, 40, 40))
    x0, y0 = 20, 70
    for r, row in enumerate(grid):
        for c in range(n):
            x, y = x0 + c * cell, y0 + r * cell
            d.rectangle([x, y, x + S + 4, y + S + 4], fill=(139, 139, 139), outline=(55, 55, 55))
            t = row[c] if c < len(row) else None
            if t:
                img.paste(icon(names[t.split('.withAmount')[0]][0], S), (x + 2, y + 2), icon(names[t.split('.withAmount')[0]][0], S))
    # стрелка и результат
    ax, ay = x0 + gw + 20, y0 + gw // 2
    d.polygon([(ax, ay - 14), (ax + 50, ay - 14), (ax + 50, ay - 26), (ax + 80, ay), (ax + 50, ay + 26), (ax + 50, ay + 14), (ax, ay + 14)], fill=(110, 110, 110))
    ox, oy = ax + 100, ay - (S + 24) // 2
    d.rectangle([ox, oy, ox + S + 24, oy + S + 24], fill=(139, 139, 139), outline=(55, 55, 55))
    oi = icon(otex, S + 16)
    img.paste(oi, (ox + 4, oy + 4), oi)
    # легенда
    ly = y0 + gw + 30
    d.text((20, ly), 'Ингредиенты (сколько клеток):', font=bold, fill=(40, 40, 40))
    ly += 40
    colw = (W - 40) // 2
    for i, (k, cnt) in enumerate(legend):
        x, y = 20 + (i % 2) * colw, ly + (i // 2) * (S + 10)
        ic = icon(names[k][0], S)
        d.rectangle([x, y, x + S + 4, y + S + 4], fill=(139, 139, 139), outline=(55, 55, 55))
        img.paste(ic, (x + 2, y + 2), ic)
        d.text((x + S + 14, y + 4), f'{cnt} × {names[k][1]}', font=font, fill=(20, 20, 20))
        d.text((x + S + 14, y + 28), k.strip('<>'), font=small, fill=(80, 80, 80))
    img.save(out_png)
    return kind, src, legend, names


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('item'); ap.add_argument('out')
    ap.add_argument('--assets', nargs='+', required=True)
    ap.add_argument('--which', type=int, default=0)
    a = ap.parse_args()
    kind, src, legend, names = render(a.item, a.out, a.assets, a.which)
    print(kind, src)
    for k, c in legend:
        print(c, k, '|', names[k][1], '|', names[k][0])
