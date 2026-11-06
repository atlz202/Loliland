"""Разбор шести ключевых вех «Испытаний» по графу серверных рецептов.

    python3 tools/milestones.py            # пишет data/milestones.md и data/milestones.json

Для каждой вехи строится самый дешёвый путь крафта (tools/recipe_graph.py), затем листья
раскладываются по источникам: драконы, души мобов, лазерный бур, репликатор и т. д.
Количества даются порядками («тысячи», «миллионы»), точные числа зависят от выбора рецептов.
"""
import json, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402

ROOT = rg.ROOT

MILESTONES = [
    ('fkvg', 'ФКВГ', ['lolienergistics:3qgen']),
    ('ddb', 'Демонический Дракон Бесконечности', ['DraconicEvolution:mobSoul{ldne_demonic_infinity_dragon_boss}']),
    ('loot100', 'Сотая добыча', ['loli_dragon_might:looting_module:10']),
    ('luck100', 'Сотая удача', ['loli_utility:FortuneModule:10']),
    ('codex', 'Кодекс жизни', ['loli_forestry:codex_life']),
    ('demonset', 'Демонический сет', ['lolienergyrelics:ItemDemonSwordInfinity', 'lolienergyrelics:ItemDemonHelmetInfinity',
                                      'lolienergyrelics:ItemDemonChestInfinity', 'lolienergyrelics:ItemDemonPantsInfinity',
                                      'lolienergyrelics:ItemDemonShoesInfinity']),
]

DRAGONS = [
    ('ldne_ender_dragon_boss', 'Обычный (Края)'),
    ('ldne_chaos_dragon_boss', 'Хаоса'),
    ('ldne_ice_dragon_boss', 'Ледяной'),
    ('ldne_fire_dragon_boss', 'Огненный'),
    ('ldne_infinity_dragon_boss', 'Бесконечности'),
    ('ldne_demonic_infinity_dragon_boss', 'Демонический'),
]

CATEGORIES = ['Драконы', 'Души мобов (спавнер хаоса)', 'Лазерный бур', 'Генератор нейтрония', 'Репликатор',
              'Молекулярная ферма', 'Жидкости и газы', 'Нет серверного рецепта (крафт мода, мир, магазин)']


def magnitude(q, liquid=False):
    if liquid:
        q = q / 1000  # мВ -> вёдра
    for lim, word in ((10, 'единицы'), (100, 'десятки'), (1e3, 'сотни'), (1e4, 'тысячи'), (1e5, 'десятки тысяч'),
                      (1e6, 'сотни тысяч'), (1e9, 'миллионы'), (1e12, 'миллиарды')):
        if q < lim:
            return word + (' вёдер' if liquid else '')
    return 'триллионы' + (' вёдер' if liquid else '')


def category(g, item):
    r = g.choose(item)
    lk = g.leaf_kind(item)
    if item.startswith(('liquid:', 'gas:')):
        return 'Жидкости и газы'
    if r is None or lk in ('нет серверного рецепта', 'крафт по кругу'):
        if item == 'Avaritia:Resource:2':
            return 'Генератор нейтрония'
        return 'Нет серверного рецепта (крафт мода, мир, магазин)'
    m = r['machine']
    if m.startswith('Дроп с моба'):
        return 'Драконы' if 'dragon_boss' in m else 'Души мобов (спавнер хаоса)'
    if m == 'Лазерный бур':
        return 'Лазерный бур'
    if m == 'Репликатор':
        return 'Репликатор'
    if m == 'Молекулярная ферма':
        return 'Молекулярная ферма'
    return 'Нет серверного рецепта (крафт мода, мир, магазин)'


SPECIAL = ('Легендарный сборочный комплекс', 'Сборочный комплекс', 'Сборочный стол', 'Синтез', 'Твёрдая материя',
           'Жидкий нейтроний', 'Нейтронный компрессор', 'Пчелиная фабрика', 'Преобразователь душ', 'Процедурный сборщик',
           'Двойной молекулярный преобразователь', 'Молекулярный преобразователь', 'Гемонтрансмутатор',
           'Иномировой обмен', 'Продвинутый QED', 'Синтезатор энергона', 'Плавильный завод', 'Промышленный смеситель')


def special_machines(machines):
    """Крупные машины дерева; у машин с тирами показывается самый высокий нужный тир."""
    out, tiers = [], defaultdict(int)
    for m in machines:
        t = re.match(r'(.*) \(тир (\d+)\)$', m)
        if t:
            tiers[t.group(1)] = max(tiers[t.group(1)], int(t.group(2)))
        elif m in SPECIAL:
            out.append(m)
    out += [f'{k} до тира {v}' for k, v in sorted(tiers.items())]
    return sorted(out, key=lambda m: SPECIAL.index(next(x for x in SPECIAL if m.startswith(x))) if any(m.startswith(x) for x in SPECIAL) else 99)


def analyse(g, targets):
    need = defaultdict(float)
    crafts = {}
    for t in targets:
        n, c = g.demand(t)
        for k, v in n.items():
            need[k] += v
        for k, v in c.items():
            crafts[k] = crafts.get(k, 0) + v
    leaves = {k: v for k, v in need.items() if k not in crafts and v > 0}
    machines = defaultdict(float)
    for k, c in crafts.items():
        machines[g.choose(k)['machine']] += c
    dragons = set()
    for k in leaves:
        r = g.choose(k)
        if r and r['machine'].startswith('Дроп с моба'):
            mob = r['machine'].split()[-1]
            dragons.add(mob)
    return need, crafts, leaves, machines, dragons


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    hints = rg.load_hints()
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731

    res = {}
    for key, title, targets in MILESTONES:
        res[key] = analyse(g, targets)

    # общий ствол и свои ветки
    usage = defaultdict(set)
    for key, (need, crafts, leaves, machines, dragons) in res.items():
        for k in crafts:
            usage[k].add(key)
    weight = lambda key, k: res[key][0][k] * g.cost.get(k, 0)  # noqa: E731
    total = {key: sum(g.cost.get(t, 0) for t in targets) for key, _, targets in MILESTONES}
    allkeys = [k for k, _, _ in MILESTONES]
    trunk = [k for k, v in usage.items() if len(v) == len(MILESTONES)]
    trunk.sort(key=lambda k: -sum(weight(key, k) / total[key] for key in allkeys))

    L = []
    L.append('# Шесть вех «Испытаний»: из чего они состоят\n')
    L.append('Собрано скриптом `tools/milestones.py` из серверных рецептов в `data/recipes`. '
             'Для каждого предмета выбран самый дешёвый путь крафта, листья дерева разложены по источникам.\n')
    L.append('Как читать: количества здесь не главное. Скрипт не знает множителей модуля удачи (руда) '
             'и модуля добычи (души), поэтому абсолютные числа завышены в десятки раз. Важны состав, '
             'общие узлы и то, какая веха тяжелее другой. Рецепты модов, которые сервер не менял, в скриптах '
             'не видны, такие предметы попадают в группу «Нет серверного рецепта». Кейсы и аирдропы не учитываются.\n')

    L.append('## Главное\n')
    L.append('- Все шесть вех требуют дроп всех шести драконов, вплоть до демонического. Поэтому '
             'Демонический Дракон Бесконечности стоит не рядом с остальными вехами, а под ними: '
             'без его осколков, сердец и эссенции не собрать ни демонические слитки, ни квантовый осадок.')
    L.append('- У вех общий ствол (таблица ниже): демонические слитки и каталисты, инфинити-сингулярности, '
             'катализаторы бесконечности через вечную сингулярность, жидкостные сингулярности и искрящаяся материя.')
    rel = ', '.join(f'{t} {total[k] / total["fkvg"]:.0%}' for k, t, _ in MILESTONES)
    L.append(f'- Относительный вес вех (ФКВГ = 100%): {rel}.\n')

    L.append('## Какие драконы нужны каждой вехе\n')
    L.append('| Веха | ' + ' | '.join(d for _, d in DRAGONS) + ' |')
    L.append('|---|' + '---|' * len(DRAGONS))
    for key, title, _ in MILESTONES:
        ds = res[key][4]
        L.append(f'| {title} | ' + ' | '.join('✓' if m in ds else '' for m, _ in DRAGONS) + ' |')
    L.append('')

    L.append('## Общий ствол: что нужно всем шести вехам\n')
    L.append('Промежуточные предметы из дерева каждой вехи, по убыванию веса. '
             'Это первые кандидаты на постоянное автоматическое производство.\n')
    L.append('| Предмет | Чем делается |')
    L.append('|---|---|')
    for k in trunk[:30]:
        L.append(f'| {nm(k)} | {g.choose(k)["machine"]} |')
    L.append('')

    out_json = {}
    for key, title, targets in MILESTONES:
        need, crafts, leaves, machines, dragons = res[key]
        L.append(f'## {title}\n')
        for t in targets:
            r = g.choose(t)
            ins = ', '.join(nm(i) for i in r['in_map'])
            L.append(f'**{nm(t)}** ({r["machine"]}): {ins}.\n')
        own = [k for k in crafts if usage[k] <= {key} | set() and len(usage[k]) <= 2 and k not in targets]
        own.sort(key=lambda k: -weight(key, k))
        if own:
            L.append('**Своя ветка** (нужно этой вехе и не больше чем ещё одной): ' +
                     ', '.join(f'{nm(k)} [{g.choose(k)["machine"]}]' for k in own[:10]) + '.\n')
        L.append('**Особые машины в дереве:** ' + ', '.join(special_machines(machines)) + '.\n')
        by_cat = defaultdict(list)
        for k, q in leaves.items():
            if k in rg.FREE:
                continue
            by_cat[category(g, k)].append((q * g.cost.get(k, 1), q, k))
        L.append('**Базовые ресурсы** (по убыванию веса в каждой группе):\n')
        for c in CATEGORIES:
            rows = sorted(by_cat.get(c, []), reverse=True)
            if not rows:
                continue
            parts = []
            for _, q, k in rows[:6]:
                src = ''
                r = g.choose(k)
                if r and r['machine'].startswith('Дроп с моба'):
                    mob = r['machine'].split()[-1]
                    src = f' ({nm("DraconicEvolution:mobSoul{" + mob + "}").replace("Душа: ", "")})'
                parts.append(f'{nm(k)}{src}')
            more = f'; ещё {len(rows) - 6}' if len(rows) > 6 else ''
            L.append(f'- *{c}:* ' + '; '.join(parts) + more + '.')
        L.append('')
        out_json[key] = {
            'title': title, 'targets': targets, 'relative_weight': total[key] / total['fkvg'],
            'dragons': sorted(dragons & {m for m, _ in DRAGONS}),
            'machines': {m: round(v, 3) for m, v in machines.items()},
            'own_branch': [{'id': k, 'name': nm(k)} for k in own[:30]],
            'leaves': {k: {'qty': q, 'category': category(g, k), 'name': nm(k), 'hint': hints.get(k, [])}
                       for k, q in leaves.items() if k not in rg.FREE},
        }
    out_json['_trunk'] = [{'id': k, 'name': nm(k), 'machine': g.choose(k)['machine']} for k in trunk]

    open(os.path.join(ROOT, 'data/milestones.md'), 'w', encoding='utf8').write('\n'.join(L) + '\n')
    json.dump(out_json, open(os.path.join(ROOT, 'data/milestones.json'), 'w', encoding='utf8'),
              ensure_ascii=False, indent=1)
    print('готово: data/milestones.md, data/milestones.json')


if __name__ == '__main__':
    main()
