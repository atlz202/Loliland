"""Какие шаблоны кодировать к каждой эпохе и чем.

    python3 tools/patterns.py      # пишет data/patterns.md и data/patterns.json

Для каждого предмета, который крафтится в деревьях драконов и шести вех, берётся выбранный рецепт
и эпоха, где предмет нужен впервые (как в sub_milestones.py). По механизму рецепта определяется,
чем кодируется шаблон и где он выполняется:

  Верстак                -> крафт 3x3, молекулярный или улучшенный сборщик
  Экстремальный верстак  -> крафт 9x9, большой сборщик X9
  Нейтронный компрессор  -> нейтронный кодировщик, нейтрониевый сборщик
  Синтез                 -> внеземной дракониевый кодировщик, сборщик синтеза
  Сборочный стол         -> лазерный кодировщик, сборщик сборочного стола
  остальные механизмы    -> шаблон обработки, интерфейс у механизма

Шаблон обработки держит 9 входов и 3 выхода. Интерфейс этой сборки AE2 отдаёт в механизм предметы,
жидкости и газы (DualityInterface работает с тремя каналами хранения).
"""
import json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import sub_milestones as sm  # noqa: E402
import milestones as ms  # noqa: E402
import autocraft as ac  # noqa: E402

ROOT = rg.ROOT
ENCODERS = [
    ('3x3', 'Крафт 3x3', 'терминал шаблонов, молекулярный или улучшенный сборщик'),
    ('9x9', 'Крафт 9x9', 'большой сборщик X9'),
    ('neutron', 'Сингулярности', 'нейтронный кодировщик, нейтрониевый сборщик'),
    ('fusion', 'Синтез', 'внеземной дракониевый кодировщик, сборщик синтеза'),
    ('table', 'Сборочный стол', 'лазерный кодировщик, сборщик сборочного стола'),
    ('process', 'Обработка', 'терминал шаблонов, интерфейс у механизма'),
]
ENC_TITLE = {k: t for k, t, _ in ENCODERS}
# механизмы, где раскладка по слотам может быть важна, а интерфейс сливает одинаковые стаки
POSITIONAL = {'Плотник', 'Термоионный фабрикатор', 'Продвинутый QED', 'Преобразователь душ',
              'Легендарный сборочный комплекс', 'Пчелиная фабрика'}
GRID_IN_MACHINE = {'Плотник', 'Термоионный фабрикатор'}  # рецепт выставляется в сетке самого механизма
MANUAL_MAX = 200  # столько крафтов на все вехи проще сделать руками


def encoder(m):
    if m == 'Верстак':
        return '3x3'
    if m == 'Экстремальный верстак':
        return '9x9'
    if m == 'Нейтронный компрессор':
        return 'neutron'
    if m.startswith('Синтез'):
        return 'fusion'
    if m == 'Сборочный стол':
        return 'table'
    if m == 'Словарь руд':
        return None
    return 'process'


def notes(r, p, total):
    n = []
    m = r['machine']
    if encoder(m) != 'process':
        return n  # у сборщиков свой кодировщик, раскладку он держит сам
    if len(r['in_map']) > ac.PATTERN_INS:
        n.append(f'{len(r["in_map"])} видов на входе, больше 9')
    if p['outs'] > ac.PATTERN_OUTS:
        n.append(f'{p["outs"]} выходов, больше 3')
    if p['catalysts'] and encoder(m) == 'process':
        n.append('катализатор лежит в механизме')
    if p['chance']:
        n.append('выход с шансом')
    if m in GRID_IN_MACHINE:
        n.append('рецепт выставить в сетке механизма')
    elif m in POSITIONAL and p['interleaved']:
        n.append('важна раскладка по слотам')
    if n and total <= MANUAL_MAX and encoder(m) == 'process':
        n.append('мало крафтов, проще руками')
    return n


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}

    first = {}
    for era, targets in sm.ERAS:
        ts = [ids[t] for t in targets] if targets else [t for k, _, tt in ms.MILESTONES if k != 'ddb' for t in tt]
        for t in ts:
            _, crafts = g.demand(t, 1, (sm.HELL_STAR,))
            for x in crafts:
                first.setdefault(x, era)
    total = defaultdict(float)
    for k, _, tt in ms.MILESTONES:
        for t in tt:
            _, crafts = g.demand(t, 1, (sm.HELL_STAR,))
            for x, n in crafts.items():
                total[x] += n

    rows = []
    for x, era in first.items():
        r = g.choose(x)
        e = encoder(r['machine'])
        if e is None:
            continue
        p = ac.profile(r)
        fluid = bool(p['fluid_in'] or p['gas_in'] or p['fluid_out'] or p['gas_out'])
        rows.append(dict(id=x, name=nm(x), era=era, encoder=e, machine=r['machine'], fluid=fluid,
                         crafts=round(total.get(x, 0), 1), notes=notes(r, p, total.get(x, 0))))

    eras = [e for e, _ in sm.ERAS]
    by = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by[r['era']][r['encoder']].append(r)

    L = ['# Шаблоны: что кодировать к каждой эпохе\n',
         'Собрано `tools/patterns.py` по графу рецептов. Предмет стоит в той эпохе, где он нужен впервые: к этому '
         'моменту его шаблон должен быть закодирован. Повторно в следующих эпохах он не пишется. Предметы без перевода '
         'показаны по внутреннему имени.\n',
         '## Чем кодировать\n',
         '| Вид | Чем кодировать и где выполняется |', '|---|---|']
    for k, t, d in ENCODERS:
        L.append(f'| {t} | {d} |')
    L.append('')
    L.append('## Сколько шаблонов к каждой эпохе\n')
    L.append('| Эпоха | ' + ' | '.join(t for _, t, _ in ENCODERS) + ' | Всего |')
    L.append('|---|' + '---|' * (len(ENCODERS) + 1))
    tot_by = defaultdict(int)
    for e in eras:
        cnt = [len(by[e][k]) for k, _, _ in ENCODERS]
        for (k, _, _), c in zip(ENCODERS, cnt):
            tot_by[k] += c
        L.append(f'| {e} | ' + ' | '.join(str(c) if c else '' for c in cnt) + f' | {sum(cnt)} |')
    L.append('| **Всего** | ' + ' | '.join(str(tot_by[k]) for k, _, _ in ENCODERS) + f' | {sum(tot_by.values())} |')
    L.append('')

    special = [r for r in rows if r['notes']]
    L.append('## Шаблоны с особенностями\n')
    L.append('Обычный шаблон обработки тут не сработает как есть или нужна обвязка механизма. «Крафтов» значит сколько '
             'раз рецепт нужен на все шесть вех.\n')
    L.append('| Предмет | Механизм | Эпоха | Крафтов | Что учесть |')
    L.append('|---|---|---|---|---|')
    for r in sorted(special, key=lambda r: (eras.index(r['era']), r['machine'], r['name'])):
        c = f'{r["crafts"]:.3g}' if r['crafts'] else 'только к дракону'
        L.append(f'| {r["name"]} | {r["machine"]} | {r["era"]} | {c} | {"; ".join(r["notes"])} |')
    L.append('')

    for e in eras:
        if not by[e]:
            continue
        L.append(f'## {e}\n')
        for k, t, _ in ENCODERS:
            items = by[e].get(k)
            if not items:
                continue
            if k == 'process':
                per_m = defaultdict(list)
                for r in items:
                    per_m[r['machine']].append(r['name'])
                body = '; '.join(f'{m}: ' + ', '.join(sorted(v)) for m, v in sorted(per_m.items()))
            else:
                body = ', '.join(sorted(r['name'] for r in items))
            L.append(f'**{t} ({len(items)}).** {body}.\n')
    open(os.path.join(ROOT, 'data/patterns.md'), 'w', encoding='utf8').write('\n'.join(L) + '\n')
    json.dump(rows, open(os.path.join(ROOT, 'data/patterns.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(f'готово: data/patterns.md, {len(rows)} шаблонов, с особенностями {len(special)}')
    for e in eras:
        print(e, {k: len(by[e][k]) for k, _, _ in ENCODERS})


if __name__ == '__main__':
    main()
