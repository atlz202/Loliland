"""Соты для «Испытаний»: сколько нужно, какими пчёлами их брать и как расставить пчёл по совершенным пасекам.

    python3 -I tools/bees.py      # пишет data/bees.md и data/bees.json

Данные:
  - спрос на соты считается по графу рецептов (6 вех и 28 совершенных пасек сверх 4 стартовых), соты стоят стопом;
  - продукты пчёл: data/bees/forestry_bees.json (tools/extract_forestry_bees.py),
    data/bees/extrabees.json (tools/extract_extrabees.py) и пчёлы сервера из data/recipes/!Hitech_bee.zs;
  - центрифуга сервера переводит усовершенствованные соты в соты ExtraBees (100% + 25%, то есть 1,25 штуки).

Выбор пчёл: все пчёлы считаются одинаково сложными. Сначала берётся наименьшее число видов, которое покрывает все
нужные соты, а среди таких наборов тот, где на все соты уходит меньше всего циклов (нужно / шанс).
Гены скорости у всех пчёл считаются одинаковыми, поэтому выход соты с одного слота пропорционален шансу.
"""
import itertools, json, math, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import sub_milestones as sm  # noqa: E402
import milestones as ms  # noqa: E402

ROOT = rg.ROOT
APIARY = 'loli_forestry:IndustrialApiary'
START_APIARIES, MAX_APIARIES, SLOTS = 4, 32, 12
CRAFTED = MAX_APIARIES - START_APIARIES
COMB = re.compile(r'^(Forestry:beeCombs|ExtraBees:honeyComb|jgendustry:HoneyComb)')
ZS = os.path.join(ROOT, 'data/recipes/!Hitech_bee.zs')
CUSTOM_COMB_RU = {  # у пар сот сервера одно русское имя, поэтому второй даём по пчеле
    10016: 'Рыбные соты', 10017: 'Рыбные соты (вторые)', 10019: 'Волшебные соты (вторые)', 10021: 'Покфениумные соты (вторые)',
    10023: 'Аурумные соты (вторые)'}


def fid(meta):
    return 'Forestry:beeCombs' if meta == 0 else f'Forestry:beeCombs:{meta}'


def load_bees(lang):
    """Возвращает bees: uid -> dict(name, src, prods={comb: chance}, parents=[...]) и conv: comb -> [(из, выход)]."""
    bees, comb_name = {}, {}
    fb = json.load(open(os.path.join(ROOT, 'data/bees/forestry_bees.json'), encoding='utf8'))
    for sp, prods in fb.items():
        uid = 'forestry.species' + sp.title()
        p = {}
        for _, cname, meta, ch in prods:
            p[fid(meta)] = max(p.get(fid(meta), 0), ch)
            comb_name[fid(meta)] = lang.get(f'item.for.beeCombs.{cname.lower()}.name', cname)
        bees[uid] = dict(name=lang.get(f'for.bees.species.{sp.lower()}', sp), src='Forestry', prods=p, parents=[])
    eb = json.load(open(os.path.join(ROOT, 'data/bees/extrabees.json'), encoding='utf8'))
    for meta, (_, ru) in eb['combs'].items():
        comb_name[f'ExtraBees:honeyComb:{meta}'] = ru
    for uid, v in eb['species'].items():
        p = {}
        for _, mod, meta, ch in v['products']:
            i = f'ExtraBees:honeyComb:{meta}' if mod == 'ExtraBees' else fid(meta) if mod == 'Forestry' else None
            if i:
                p[i] = max(p.get(i, 0), ch)
        bees[uid] = dict(name=v['name'], src='ExtraBees', prods=p, parents=[(a, b, c) for a, b, c, _ in v['mutations']])

    zs = open(ZS, encoding='utf8').read()
    ru = dict(re.findall(r"setLocalization\('ru_RU', 'jgendustry\.bees\.species\.(\w+)', '([^']+)'\)", zs))
    cru = dict(re.findall(r"setLocalization\('ru_RU', 'jgendustry\.honeycomb\.(\w+)\.name', '([^']+)'\)", zs))
    for meta, nm_ in re.findall(r"addHoneyComb\((\d+), '(\w+)'", zs):
        comb_name[f'jgendustry:HoneyComb:{meta}'] = CUSTOM_COMB_RU.get(int(meta), cru.get(nm_, nm_))
    for m in re.finditer(r"registerSpecies\('(\w+)', '\w+', '\w+', '\w+', \{([^}]*)\}, \{([^}]*)\}", zs):
        p = {}
        for part in (m.group(2), m.group(3)):
            for i, ch in re.findall(r'<([^>]+)>: ([\d.]+)', part):
                if COMB.match(i):
                    p[i] = max(p.get(i, 0), float(ch))
        bees['gendustry.bee.' + m.group(1)] = dict(name=ru.get(m.group(1), m.group(1)), src='сервер', prods=p, parents=[])
    for a, b, c, ch in re.findall(r"registerBeeMutation\('([\w.]+)', '([\w.]+)', '([\w.]+)', ([\d.]+)", zs):
        if c in bees:
            bees[c]['parents'].append((a, b, int(float(ch))))
    conv = defaultdict(list)
    for outs, inp in re.findall(r'Centrifuge\.addRecipe\(\[([^\]]*)\], <([^>]+)>', zs):
        got = defaultdict(float)
        for i, pc in re.findall(r'<([^>]+)>\.percent\(([\d.]+)\)', outs):
            if COMB.match(i):
                got[i] += float(pc) / 100
        for i, k in got.items():
            conv[i].append((inp, k))
    for uid in list(bees):
        if not bees[uid]['prods']:
            del bees[uid]
    return bees, conv, comb_name


def demand(g):
    allc = {i for r in g.recipes for i in [x['id'] for x in r['ins'] + r['outs']] if COMB.match(i)}
    stop = tuple(allc) + (sm.HELL_STAR,)
    keep = lambda x: COMB.match(x) or x == 'ore:beeComb'  # noqa: E731
    mil, ddb, api = defaultdict(float), defaultdict(float), defaultdict(float)
    for k, _, tt in ms.MILESTONES:
        for t in tt:
            need, _ = g.demand(t, 1, stop)
            for x, v in need.items():
                if keep(x):
                    mil[x] += v
                    if k == 'ddb':
                        ddb[x] += v
    need, _ = g.demand(APIARY, 1, stop)
    for x, v in need.items():
        if keep(x):
            api[x] += v
    return mil, ddb, api, stop


def first_era(g, stop, lang, names):
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}
    first = {}
    for era, targets in sm.ERAS:
        ts = [ids[t] for t in targets] if targets else [t for k, _, tt in ms.MILESTONES if k != 'ddb' for t in tt]
        for t in ts:
            need, _ = g.demand(t, 1, stop)
            for x in need:
                first.setdefault(x, era)
    return first


def era_demand(g, stop, lang, names):
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}
    out = []
    for era, targets in sm.ERAS:
        if not targets:
            continue
        d = defaultdict(float)
        for t in targets:
            need, _ = g.demand(ids[t], 1, stop)
            for x, v in need.items():
                if COMB.match(x):
                    d[x] += v
        out.append((era, d))
    return out


def eff_table(bees, conv, combs):
    """eff[bee][comb] = соты с одного цикла слота: прямой шанс или шанс на соты, которые центрифуга переводит в нужные."""
    eff = defaultdict(dict)
    for b, v in bees.items():
        for c in combs:
            best = v['prods'].get(c, 0)
            for src, k in conv.get(c, []):
                best = max(best, v['prods'].get(src, 0) * k)
            if best > 0:
                eff[b][c] = best
    return eff


def units(dem, chosen, eff):
    """Слото-циклы на спрос dem при наборе chosen: каждая сота к лучшей пчеле набора, пчеле нужно max по её сотам."""
    per, assign = defaultdict(float), {}
    for c, q in dem.items():
        if q <= 0:
            continue
        b = max((b for b in chosen if c in eff[b]), key=lambda b: eff[b][c])
        assign[c] = b
        per[b] = max(per[b], q / eff[b][c])
    return per, assign


def min_cover(combs, eff, total):
    cands = {c: sorted([b for b in eff if c in eff[b]], key=lambda b: -eff[b][c]) for c in combs}
    forced = {cands[c][0] for c in combs if len(cands[c]) == 1}
    rest = [c for c in combs if not any(c in eff[b] for b in forced)]
    # в переборе остаются три лучшие пчелы на каждую соту и все, кто закрывает две соты и больше;
    # из пчёл с одинаковым покрытием остаётся та, у которой шансы выше
    multi = {b for c in rest for b in cands[c] if sum(c2 in eff[b] for c2 in rest) >= 2}
    pool = {b for c in rest for b in cands[c][:3]} | multi
    by_cover = {}
    for b in pool:
        key = frozenset(c for c in rest if c in eff[b])
        if key not in by_cover or sum(eff[b].get(c, 0) for c in key) > sum(eff[by_cover[key]].get(c, 0) for c in key):
            by_cover[key] = b
    pool = sorted(by_cover.values())
    for k in range(0, len(rest) + 1):
        best = None
        for extra in itertools.combinations(pool, k):
            if all(any(c in eff[b] for b in extra) for c in rest):
                per, _ = units(total, forced | set(extra), eff)
                score = sum(per.values())
                if best is None or score < best[0]:
                    best = (score, forced | set(extra))
        if best:
            return best[1], forced
    raise RuntimeError('не покрыть')


def alloc(per, slots, min_share=0.5):
    """Слоты пропорционально слото-циклам. Пчёлы, которым по доле меньше min_share слота, идут в ротацию."""
    tot = sum(per.values())
    big = {b: u for b, u in per.items() if u / tot * slots >= min_share}
    small = {b: u for b, u in per.items() if b not in big}
    rot = max(1, round(sum(small.values()) / tot * slots)) if small else 0
    left = slots - rot
    tb = sum(big.values())
    raw = {b: u / tb * left for b, u in big.items()}
    out = {b: max(1, int(x)) for b, x in raw.items()}
    while sum(out.values()) > left:
        b = max(out, key=lambda b: out[b] - raw[b])
        out[b] -= 1
    for b in sorted(raw, key=lambda b: raw[b] - out[b], reverse=True):
        if sum(out.values()) >= left:
            break
        out[b] += 1
    return out, rot, small


def fmt(x):
    if x >= 1e6:
        return f'{x / 1e6:.1f} млн'.replace('.', ',')
    if x >= 1e4:
        return f'{x / 1e3:.0f} тыс'
    if x >= 1e3:
        return f'{x / 1e3:.1f} тыс'.replace('.', ',')
    return f'{x:.0f}'


def pct(x):
    return f'{x * 100:.3g}%'.replace('.', ',')


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    bees, conv, cname = load_bees(lang)
    bname = lambda b: bees[b]['name'] if b in bees else lang.get('for.bees.species.' + b.replace('forestry.species', '').lower(), b.split('.')[-1])  # noqa: E731
    mil, ddb, api, stop = demand(g)
    first = first_era(g, stop, lang, names)
    eras_d = era_demand(g, stop, lang, names)
    total = {c: mil[c] + CRAFTED * api[c] for c in set(mil) | set(api)}
    any_comb = total.pop('ore:beeComb', 0)
    combs = sorted(total, key=lambda c: -total[c])
    eff = eff_table(bees, conv, combs)
    best = {c: max(eff, key=lambda b: eff[b].get(c, 0)) for c in combs}
    chosen, forced = min_cover(combs, eff, total)
    per, assign = units(total, chosen, eff)
    per_best, _ = units(total, set(best.values()), eff)
    cn = lambda c: cname.get(c, c)  # noqa: E731

    # фазы: старт на 4 пасеках строит остальные 28 и копит соты ДДБ; лейт добирает вехи на 32 пасеках
    api_all = {c: CRAFTED * api[c] for c in api if c != 'ore:beeComb'}
    start_dem = {c: api_all.get(c, 0) + ddb.get(c, 0) for c in combs}
    late_dem = {c: mil.get(c, 0) - ddb.get(c, 0) for c in combs}
    per_start, _ = units(start_dem, chosen, eff)
    per_late, _ = units(late_dem, chosen, eff)
    per_api, _ = units(api_all, chosen, eff)
    per_ddb, _ = units({c: ddb.get(c, 0) for c in combs}, chosen, eff)
    per_mil, _ = units({c: mil.get(c, 0) for c in combs}, chosen, eff)
    start, start_rot, start_small = alloc(per_start, START_APIARIES * SLOTS)
    improved = [b for b in chosen if 'Improved' in b and b != 'gendustry.bee.ImprovedTitan']
    ddb_only = {b: u for b, u in per_ddb.items() if b not in improved}
    startb, startb_rot, startb_small = alloc(ddb_only, START_APIARIES * SLOTS - len(improved))
    for b in improved:
        startb[b] = 1
    late, late_rot, late_small = alloc(per_late, MAX_APIARIES * SLOTS)
    u_api, u_ddb, u_late, u_mil = (sum(x.values()) for x in (per_api, per_ddb, per_late, per_mil))
    per_one = u_api / CRAFTED
    t_grow = per_one / SLOTS * math.log(MAX_APIARIES / START_APIARIES)
    t_after = (u_ddb + u_late) / (MAX_APIARIES * SLOTS)
    t_none = u_mil / (START_APIARIES * SLOTS)

    L = ['# Соты и пчёлы под «Испытания»\n',
         'Собрано `tools/bees.py` по графу рецептов и байткоду Forestry и ExtraBees, пчёлы сервера взяты из '
         '`data/recipes/!Hitech_bee.zs`. Совершенных пасек 32 (лимит): 4 стартовые, остальные 28 крафтятся.\n',
         '**Как считается.** В совершенной пасеке 12 слотов под пчёл. Гены скорости у всех пчёл считаю одинаковыми, '
         'поэтому выход соты с одного слота пропорционален шансу. «Циклы» = сколько нужно сот, делённое на шанс: '
         'сколько рабочих циклов пчёл в сумме уйдёт на эту соту. Слоты делятся по циклам. Длину цикла в совершенной '
         'пасеке клиент не знает, её надо замерить на сервере (в конце).\n']

    L.append('## Главное\n')
    L.append(f'- **Набор: {len(chosen)} видов пчёл.** Из них {len(forced)} без замены: их соты больше никто не даёт. '
             'Это же и набор с наибольшим выходом: лишние виды ничего не ускоряют (ниже почему).\n'
             '- **Основная нагрузка на 7 пчёл.** Рыбная, аурумная, волшебная и четыре усовершенствованные (водная, '
             'ценная, радиоактивная, янтарная) забирают больше 80% всех циклов.\n'
             f'- **Сначала пасеки.** Одна новая пасека стоит около {fmt(per_one)} циклов, почти все на четыре '
             'усовершенствованные пчелы. Если сначала достроить все 32, а потом закрывать вехи, на всё уйдёт около '
             f'{fmt(t_grow + t_after)} циклов одного слота. На 4 пасеках без роста те же вехи займут {fmt(t_none)}, '
             f'то есть в {t_none / (t_grow + t_after):.0f} раза дольше. Это только по сотам: кроме них пасека стоит '
             '8 катализаторов бесконечности и корпус с каркасами на десятки миллионов mB газов и жидкостей, так что '
             'темп роста может задать не пасека пчёл, а эти крафты.\n'
             '- **Ранним драконам сот нужно мало.** До души дракона хаоса уходят сотни рыбных и теневых сот, это '
             'один-два слота. Тысячи начинаются с душ огненного и ледяного драконов, к этому времени пасек уже больше.\n'
             '- **Для каждой пасеки нужны почти все виды.** Пчелиный сердечник берёт по чуть-чуть почти всех сот из '
             'набора, поэтому до первой своей пасеки нужно вывести все виды и хотя бы немного на каждом поработать.\n')

    L.append('## Сколько сот нужно\n')
    L.append(f'«Вехи» = все шесть вех, «ДДБ» = только дерево Демонического дракона, «пасека» = одна совершенная '
             f'пасека, «всего» = вехи и 28 пасек. Ещё {fmt(any_comb)} любых сот (`ore:beeComb`) уходит в рецепты, '
             'их даёт любая пчела.\n')
    L.append('| Сота | Вехи | Из них ДДБ | Пасека | Всего | В вехах впервые нужна |')
    L.append('|---|---|---|---|---|---|')
    gkey = lambda c: (fmt(mil.get(c, 0)), fmt(ddb.get(c, 0)), fmt(api.get(c, 0)))  # noqa: E731
    groups = defaultdict(list)
    for c in combs:
        groups[gkey(c)].append(c)
    done = set()
    for c in combs:
        key = gkey(c)
        if key in done:
            continue
        grp = groups[key]
        if len(grp) < 4:
            title = cn(c)
        else:
            done.add(key)
            title = f'Мелкие, {len(grp)} видов: ' + ', '.join(sorted(cn(x).replace(' соты', '') for x in grp))
        L.append(f'| {title} | {fmt(mil.get(c, 0))} | {fmt(ddb.get(c, 0)) if ddb.get(c) else ""} | '
                 f'{fmt(api.get(c, 0)) if api.get(c) else ""} | **{fmt(total[c])}** | {first.get(c, "")} |')
    L.append('')
    L.append('Влажные, платиновые, урановые и янтарные соты почти целиком уходят на пасеки: по 4 четырёхцветных '
             'кристальных каркаса на каждый из четырёх углов рецепта.\n')

    L.append('## Набор пчёл\n')
    L.append('Отсортирован по нагрузке. «Через центрифугу»: пчела даёт усовершенствованные соты, центрифуга сервера '
             'переводит каждую в 1,25 соты ExtraBees, это выгоднее любой пчелы ExtraBees на эти соты. Для пчёл Forestry '
             'родителей смотреть в NEI.\n')
    L.append('| Пчела | Откуда | Что даёт (шанс за цикл) | Циклов | Родители |')
    L.append('|---|---|---|---|---|')
    order = sorted(chosen, key=lambda b: -per[b])
    for b in order:
        mine = sorted([c for c, bb in assign.items() if bb == b], key=lambda c: -total[c])
        gives = ', '.join(f'{cn(c)} {pct(eff[b][c])}' +
                          (' через центрифугу' if bees[b]['prods'].get(c, 0) < eff[b][c] else '') for c in mine)
        par = '; '.join(f'{bname(x)} + {bname(y)} ({ch}%)' for x, y, ch in bees[b]['parents'][:2])
        src = bees[b]['src'] + (', без замены' if b in forced else '')
        L.append(f'| {bees[b]["name"]} | {src} | {gives} | {fmt(per[b])} | {par} |')
    L.append('')
    worse = [(c, best[c], assign[c]) for c in combs if eff[assign[c]][c] < eff[best[c]][c]]
    if worse:
        L.append('**Почему наименьший набор и есть лучший.** Есть соты, где у пчелы из набора шанс ниже лучшего:\n')
        for c, bb, ba in worse:
            other = max((x for x, y in assign.items() if y == ba and x != c), key=lambda x: total[x] / eff[ba][x])
            L.append(f'- {cn(c)}: в наборе {bees[ba]["name"]} {pct(eff[ba][c])}, лучшая {bees[bb]["name"]} '
                     f'{pct(eff[bb][c])}. Но {bees[ba]["name"].lower()} всё равно работает ради соты «{cn(other)}» и '
                     f'дольше, чем нужно на {cn(c).lower()}, так что эти соты идут попутно.')
        L.append('')
        L.append(f'С лучшей пчелой на каждую соту вышло бы {len(set(best.values()))} видов и {fmt(sum(per_best.values()))} '
                 f'циклов, у наименьшего набора {fmt(sum(per.values()))}.\n')

    def table(alloc_, rot, small, per_phase):
        rows = ['| Пчела | Слотов | Соты |', '|---|---|---|']
        for b in sorted(alloc_, key=lambda b: -alloc_[b]):
            mine = sorted([c for c, bb in assign.items() if bb == b], key=lambda c: -total[c])
            rows.append(f'| {bees[b]["name"]} | {alloc_[b]} | {", ".join(cn(c) for c in mine)} |')
        if len(small) == 1:
            b = next(iter(small))
            rows.append(f'| {bees[b]["name"]} | {rot} | {", ".join(cn(c) for c, bb in assign.items() if bb == b)} |')
        elif small:
            names_ = ', '.join(bees[b]['name'] for b in sorted(small, key=lambda b: (-small[b], b)))
            rows.append(f'| Ротация, по очереди | {rot} | {names_} |')
        return rows

    L.append('## Старт: 4 пасеки, 48 слотов\n')
    L.append(f'Задача старта: накрафтить остальные 28 пасек и по пути собрать соты на дерево ДДБ. Это '
             f'{fmt(u_api + u_ddb)} циклов, из них пасеки {fmt(u_api)}, ДДБ {fmt(u_ddb)}. Пчёлы с маленьким спросом не '
             'держат слот постоянно: они по очереди проходят через слоты ротации, каждая отрабатывает свои соты и '
             'уступает место следующей (первыми те, что выше в списке).\n')
    L += table(start, start_rot, start_small, per_start)
    L.append('')
    L.append('Это вариант, когда пасеки упираются только в соты.\n')
    L.append('- Каждая новая пасека получает пчёл в тех же долях, так рост ускоряется сам.\n'
             '- Пока не выведены все виды, свободные слоты отдаются четырём усовершенствованным: их сот на пасеки '
             'нужно больше всего.\n'
             '- Если дерево ДДБ упирается в соты раньше, чем готовы пасеки, слоты рыбной и аурумной поднимаются за счёт '
             'усовершенствованных. Пасеки тогда достроятся позже.\n')
    L.append('**Если пасеки упираются в катализаторы и корпус.** Тогда старт лучше отдать дереву ДДБ, а '
             'усовершенствованным оставить по слоту, чтобы соты на пасеки копились заранее:\n')
    L += table(startb, startb_rot, startb_small, per_ddb)
    L.append('')
    L.append('**Сколько сот нужно к каждой эпохе.** На цель эпохи вместе со всем, что в неё входит.\n')
    shown = [c for c in combs if ddb.get(c)]
    L.append('| Эпоха | ' + ' | '.join(cn(c) for c in shown) + ' |')
    L.append('|---|' + '---|' * len(shown))
    for era, d in eras_d:
        if any(d.get(c) for c in shown):
            L.append(f'| {era} | ' + ' | '.join(fmt(d[c]) if d.get(c) else '' for c in shown) + ' |')
    L.append('')

    L.append('## Лейт: 32 пасеки, 384 слота\n')
    L.append(f'Пасеки построены, ДДБ закрыт. Остаются соты остальных пяти вех: {fmt(u_late)} циклов.\n')
    L += table(late, late_rot, late_small, per_late)
    L.append('')
    L.append('Четыре усовершенствованные пчелы остаются: на вехи их сот тоже нужно много (по полмиллиона).\n')

    L.append('## Что проверить на сервере\n')
    L.append('- **Длина цикла.** Поставить одну рыбную пчелу в пустую пасеку с нужными улучшениями и засечь, сколько '
             'рыбных сот выходит за 10 минут. Цикл = 10 минут × 0,3 / число сот. Тогда все «циклы» выше переводятся в часы.\n'
             '- **Гены скорости.** Если у части пчёл гены скорости разные, их доли надо пересчитать: выход умножается '
             'на множитель гена.\n'
             '- **Улучшение «Стак».** По описанию пчёлы дают сразу стак продукции. Если так, все циклы делятся на 64, '
             'а доли остаются те же.\n')
    open(os.path.join(ROOT, 'data/bees.md'), 'w', encoding='utf8').write('\n'.join(L) + '\n')
    json.dump(dict(demand={c: dict(milestones=mil.get(c, 0), ddb=ddb.get(c, 0), apiary=api.get(c, 0), total=total[c],
                                   first=first.get(c)) for c in combs},
                   chosen={b: dict(name=bees[b]['name'], units=per[b], forced=b in forced,
                                   combs={c: eff[b][c] for c, bb in assign.items() if bb == b}) for b in chosen},
                   start=dict(slots=start, rotation=start_rot, rotation_bees=sorted(start_small)),
                   late=dict(slots=late, rotation=late_rot, rotation_bees=sorted(late_small)),
                   cycles=dict(per_apiary=per_one, grow=t_grow, after=t_after, no_growth=t_none)),
              open(os.path.join(ROOT, 'data/bees.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(f'готово: data/bees.md, видов {len(chosen)} (без замены {len(forced)}), циклов {fmt(sum(per.values()))}')
    print('старт', {bees[b]['name']: n for b, n in start.items()}, 'ротация', start_rot)
    print('лейт', {bees[b]['name']: n for b, n in late.items()}, 'ротация', late_rot)
    print('рост', fmt(t_grow), 'после', fmt(t_after), 'без роста', fmt(t_none))


if __name__ == '__main__':
    main()
