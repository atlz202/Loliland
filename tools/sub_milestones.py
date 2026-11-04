"""Мелкие вехи: ресурсы, которые получаются больше чем за один шаг механизмами, и к какой эпохе они нужны.

    python3 tools/sub_milestones.py      # пишет data/sub_milestones.md и data/sub_milestones.json

Эпоха ресурса = первый дракон (призыв или душа) или веха, в дереве которой он встречается.
Шаги на верстаке 3x3 и 9x9 не считаются: они идут в молекулярных сборщиках моментально.
"""
import json, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import milestones as ms  # noqa: E402

ROOT = rg.ROOT
HELL_STAR = 'lolidimensions:hell_star'
INSTANT = {'Верстак', 'Экстремальный верстак', 'Словарь руд'}
ERAS = [
    ('Дракон Края', ['Катализатор призыва дракона Края']),
    ('Дракон хаоса, призыв', ['Катализатор призыва дракона Хаоса']),
    ('Душа дракона Края', ['Душа: Дракон Края']),
    ('Огненный и ледяной, призывы', ['Катализатор призыва дракона Огня', 'Катализатор призыва дракона Льда']),
    ('Душа дракона хаоса', ['Душа: Дракон Хаоса']),
    ('Дракон бесконечности, призыв', ['Катализатор призыва дракона Бесконечности']),
    ('Демонический дракон, призыв', ['Катализатор призыва демонического дракона Бесконечности']),
    ('Души огненного и ледяного', ['Душа: Дракон Пламени', 'Душа: Дракон Холода']),
    ('Душа дракона бесконечности', ['Душа: Дракон бесконечности']),
    ('ДДБ', ['Душа: Демонический дракон бесконечности']),
    ('Остальные пять вех', None),
]
FAMILIES = [
    ('Закалка и сталь', {'Закалочная ванна', 'Доменная печь'}),
    ('Газы и жидкости', {'Реакционная камера', 'Химический окислитель', 'Электролитический сепаратор', 'Химический наполнитель',
                         'Обогатитель', 'Ротационный конденсатор', 'Паровой котёл', 'Сборщик газа из воздуха',
                         'Дистилляционная колонна', 'Промышленный смеситель', 'Перегонный куб', 'Конденсатор'}),
    ('Плавка в жидкость и заливка', {'Плавильный завод', 'Капиллярный наполнитель'}),
    ('Кристаллы', {'Кристаллизационное охлаждение', 'Камера роста кристаллов', 'Камера зарядки кристаллов'}),
    ('Сплавы', {'Камера сплавов', 'Печь сплавов'}),
    ('Сингулярности', {'Нейтронный компрессор', 'Жидкий нейтроний'}),
    ('Молекулярные преобразователи', {'Молекулярный преобразователь', 'Двойной молекулярный преобразователь'}),
    ('Пчёлы и Forestry', {'Плотник', 'Термоионный фабрикатор', 'Центрифуга Forestry', 'Пчелиная фабрика', 'Сжиматель', 'Сушилка'}),
    ('Кровь драконов и души', {'Гемонтрансмутатор', 'Преобразователь душ'}),
    ('Сборка', {'Сборочный стол', 'Сборочный комплекс', 'Легендарный сборочный комплекс', 'Процедурный сборщик', 'Продвинутый QED', 'QED'}),
    ('Techguns', {'Реакционная камера Techguns', 'Пресс Techguns', 'Химлаборатория Techguns'}),
    ('Обработка IC2', {'Печь', 'Дробитель', 'Компрессор IC2', 'Металлоформовщик', 'Экстрактор', 'Термальная центрифуга', 'Рудопромывочная машина'}),
]


def family(m):
    if m.startswith('Твёрдая материя'):
        return 'Твёрдая материя'
    if m.startswith('Синтез'):
        return 'Сборка'
    for f, ms_ in FAMILIES:
        if m in ms_:
            return f
    return 'Прочее'


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}

    first = {}
    for era, targets in ERAS:
        ts = [ids[t] for t in targets] if targets else [t for k, _, tt in ms.MILESTONES if k != 'ddb' for t in tt]
        for t in ts:
            _, crafts = g.demand(t, 1, (HELL_STAR,))
            for x in crafts:
                first.setdefault(x, era)

    memo = {}

    def chain(x, stack=()):
        """Машины по самому длинному пути от сырья к x (без моментальных крафтов)."""
        if x in memo:
            return memo[x]
        r = g.choose(x)
        if r is None or r['kind'] != 'craft' or x in stack:
            memo[x] = []
            return []
        best = max((chain(i, stack + (x,)) for i in r['in_map']), key=len, default=[])
        out = best + ([] if r['machine'] in INSTANT else [r['machine']])
        memo[x] = out
        return out

    rows = []
    for x, era in first.items():
        r = g.choose(x)
        if r['machine'] in INSTANT:
            continue
        c = chain(x)
        steps = []
        for m in c:
            t = re.match(r'Твёрдая материя \(тир (\d+)\)', m)
            if t and steps and steps[-1].startswith('Твёрдая материя'):
                lo = re.search(r'тир(?:ы)? (\d+)', steps[-1]).group(1)
                steps[-1] = f'Твёрдая материя (тиры {lo}–{t.group(1)})'
            elif not steps or steps[-1] != m:
                steps.append(m)
        if len(c) >= 2:
            rows.append({'id': x, 'name': nm(x), 'era': era, 'family': family(r['machine']), 'machine': r['machine'],
                         'steps': len(c), 'chain': steps})

    order = [e for e, _ in ERAS]
    fam_order = [f for f, _ in FAMILIES] + ['Твёрдая материя', 'Прочее']
    by = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by[r['era']][r['family']].append(r)

    L = ['# Мелкие вехи: что автоматизировать к каждой эпохе\n',
         'Собрано `tools/sub_milestones.py` по графу рецептов. Сюда попали ресурсы, которые делаются механизмами '
         'больше чем за один шаг (крафты 3x3 и 9x9 не считаются, они моментальные). Каждый ресурс стоит в той эпохе, '
         'где он впервые нужен: к этому моменту его цепочка должна работать сама. Цепочка показана по самому длинному пути '
         'от сырья. Руду до готового ресурса берёт преобразователь удачи, поэтому начальные шаги «печь, дробитель» в цепочках '
         'руды на практике короче.\n']
    L.append('## Сводка\n')
    L.append('| Эпоха | Сколько цепочек | Главные направления |')
    L.append('|---|---|---|')
    for e in order:
        fams = sorted(by[e].items(), key=lambda kv: -len(kv[1]))
        if fams:
            L.append(f'| {e} | {sum(len(v) for _, v in fams)} | ' + ', '.join(f'{f} ({len(v)})' for f, v in fams[:4]) + ' |')
    L.append('')
    for e in order:
        if not by[e]:
            continue
        L.append(f'## {e}\n')
        for f in fam_order:
            items = by[e].get(f)
            if not items:
                continue
            items.sort(key=lambda r: (-r['steps'], r['name']))
            L.append(f'**{f}.** ' + '; '.join(f'{r["name"]} ({" → ".join(r["chain"])})' for r in items) + '.\n')
    open(os.path.join(ROOT, 'data/sub_milestones.md'), 'w', encoding='utf8').write('\n'.join(L) + '\n')
    json.dump(rows, open(os.path.join(ROOT, 'data/sub_milestones.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(f'готово: data/sub_milestones.md, {len(rows)} цепочек')


if __name__ == '__main__':
    main()
