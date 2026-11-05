"""Достаёт продукты и мутации пчёл ExtraBees из binnie-mods-1.7.10-2.0.22.7.jar (байткод ExtraBeeDefinition).

    mkdir /tmp/binnie && cd /tmp/binnie && unzip -q binnie-mods.jar
    python3 -I tools/extract_extrabees.py /tmp/binnie

Пишет data/bees/extrabees.json:
  combs: мета -> (имя enum, русское название);
  species: вид -> {name, products: [(тип, мод, мета, шанс)], mutations: [(родитель1, родитель2, шанс, условие)]}.
Тип addProduct или addSpecialty, мод ExtraBees или Forestry (обычные соты Forestry идут через VanillaComb).
"""
import json, os, re, subprocess, sys

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/bees/extrabees.json')
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/tmp/binnie')


def jp(cls):
    return subprocess.run(['javap', '-p', '-c', '-constants', '-cp', SRC, cls], capture_output=True, text=True).stdout


def enum_order(cls):
    s = jp(cls)
    st = s[s.index('static {}'):]
    names = re.findall(r'putstatic\s+#\d+\s+// Field (\w+):L' + cls.replace('.', '/').replace('$', r'\$') + ';', st)
    return {n: i for i, n in enumerate(names)}


def lang(path):
    d = {}
    for line in open(path, encoding='utf8'):
        if '=' in line:
            k, v = line.rstrip('\n').split('=', 1)
            d[k] = v
    return d


def species_body(text, method):
    if method not in text:
        return ''
    b = text[text.index(method):]
    return b[:b.index('\n\n')] if '\n\n' in b else b


def bee_ref(line):
    m = re.search(r'Field (?:\S+\.)?(\w+):L(forestry/apiculture/genetics/BeeDefinition|binnie/extrabees/genetics/ExtraBeeDefinition);', line)
    if not m:
        return None
    return ('forestry.species' + m.group(1).title()) if 'forestry' in m.group(2) else 'extrabees.species.' + m.group(1).lower()


def main():
    eb = enum_order('binnie.extrabees.products.EnumHoneyComb')
    vc = enum_order('binnie.extrabees.products.ItemHoneyComb$VanillaComb')
    ru = lang(os.path.join(SRC, 'assets/extrabees/lang/ru_RU.lang'))
    combs = {i: (n, ru.get(f'extrabees.item.comb.{n.lower()}', n)) for n, i in eb.items()}

    s = jp('binnie.extrabees.genetics.ExtraBeeDefinition')
    st = s[s.index('static {}'):]
    cls2name = dict(re.findall(r'class binnie/extrabees/genetics/ExtraBeeDefinition\$(\d+)\n\s+\d+: dup\n\s+\d+: ldc(?:_w)?\s+#\d+\s+// String (\w+)', st))

    species = {}
    for n, name in cls2name.items():
        t = jp(f'binnie.extrabees.genetics.ExtraBeeDefinition${n}')
        prods, cur, fl = [], None, None
        for line in species_body(t, 'setSpeciesProperties').splitlines():
            m = re.search(r'Field binnie/extrabees/products/EnumHoneyComb\.(\w+):', line)
            if m:
                cur = ('ExtraBees', eb[m.group(1)])
                continue
            m = re.search(r'Field binnie/extrabees/products/ItemHoneyComb\$VanillaComb\.(\w+):', line)
            if m:
                cur = ('Forestry', vc[m.group(1)])
                continue
            m = re.search(r'Field net/minecraft/init/Items\.(\w+):', line)
            if m:
                cur = ('minecraft', m.group(1))
                continue
            m = re.search(r'// float ([\d.Ee-]+)f', line)
            if m:
                fl = float(m.group(1))
                continue
            m = re.search(r'\.(addProduct|addSpecialty):', line)
            if m and cur:
                prods.append((m.group(1), cur[0], cur[1], fl))
                cur = None
        muts, pend = [], []
        chance = None
        for line in species_body(t, 'registerMutations').splitlines():
            r = bee_ref(line)
            if r:
                pend.append(r)
                continue
            m = re.search(r'bipush\s+(\d+)|sipush\s+(\d+)|iconst_(\d)', line)
            if m and len(pend) == 2:
                chance = int(next(g for g in m.groups() if g))
                continue
            if 'registerMutation' in line and len(pend) >= 2:
                muts.append([pend[-2], pend[-1], chance, None])
                pend, chance = [], None
                continue
            m = re.search(r'ExtraBeeMutation\.(restrict\w+|require\w+)', line)
            if m and muts:
                muts[-1][3] = m.group(1)
        uid = 'extrabees.species.' + name.lower()
        species[uid] = dict(enum=name, name=ru.get(uid + '.name', name), products=prods, mutations=muts)

    json.dump(dict(combs=combs, species=species), open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    print(f'{len(combs)} сот, {len(species)} видов -> {OUT}')


if __name__ == '__main__':
    main()
