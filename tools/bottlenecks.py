"""Узкие места шести вех: вечные сингулярности, демонические каталисты, нагрузка на компрессоры, энергия.

    python3 tools/bottlenecks.py

Цифры для data/plan_v1.md. Множители модулей не учтены. Потолок компрессоров: 32 штуки по стаку (64) за тик.
"""
import os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import milestones as ms  # noqa: E402

ES = 'eternalsingularity:eternal_singularity'
DC = 'lolienergyrelics:demonic_infinity_catalyst'
HELL_STAR = 'lolidimensions:hell_star'
CAP = 32 * 64            # блоков в тик на все компрессоры
DAY = 20 * 60 * 60 * 24  # тиков в сутках
BASE_EU = 1e10           # 10G в тик базовой энергии
SOLID_EU = 192 * 2 * 2.1e9  # 192 машины твёрдой материи по два квантовых генератора


def energy(g, crafts):
    by = defaultdict(float)
    for k, c in crafts.items():
        r = g.choose(k)
        try:
            e = float(r.get('energy') or 0)
        except (TypeError, ValueError):
            e = 0
        by[r['machine']] += c * e
    return by


def compressor_load(g, crafts):
    blocks = 0.0
    for k, c in crafts.items():
        r = g.choose(k)
        if r['machine'] == 'Нейтронный компрессор':
            blocks += c * sum(r['in_map'].values())
    return blocks


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731

    n, c = g.demand(ES)
    b = compressor_load(g, c)
    print(f'1 вечная сингулярность: {b:.3g} блоков, {b / CAP / 20:.0f} с работы всех компрессоров')
    print(f'1 демонический каталист: {g.demand(DC)[0][ES]:.0f} ВС\n')

    print('Драконы (призыв и душа), ВС и сингулярности:')
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}
    for w in ['Катализатор призыва дракона Хаоса', 'Катализатор призыва дракона Огня', 'Катализатор призыва дракона Бесконечности',
              'Катализатор призыва демонического дракона Бесконечности', 'Душа: Дракон Края', 'Душа: Дракон Хаоса',
              'Душа: Дракон Пламени', 'Душа: Дракон бесконечности', 'Душа: Демонический дракон бесконечности']:
        n, c = g.demand(ids[w])
        sing = sum(v for k, v in c.items() if g.choose(k)['machine'] == 'Нейтронный компрессор')
        print(f'  {w:58s} ВС {n.get(ES, 0):8.0f}  сингулярностей {sing:9.0f}')
    print()

    total = 0
    for key, title, targets in ms.MILESTONES:
        es = dc = blocks = 0.0
        eb, sm = 0.0, 0.0
        for t in targets:
            n, c = g.demand(t)
            es += n.get(ES, 0)
            dc += n.get(DC, 0)
            blocks += compressor_load(g, c)
            _, c2 = g.demand(t, 1, (HELL_STAR,))  # адские звёзды с душ визера
            for m, v in energy(g, c2).items():
                if m.startswith('Твёрдая материя'):
                    sm += v
                else:
                    eb += v
        total += blocks
        print(f'{title:36s} ВС {es:7.0f}  дем. каталистов {dc:5.0f}  компрессоры {blocks / CAP / DAY:4.1f} сут  '
              f'энергия базы {eb / BASE_EU / 72000:4.1f} ч при 10G/t  твёрдая материя {sm / SOLID_EU / 72000:4.1f} ч')
    print(f'\nвсе шесть вех: компрессоры {total / CAP / DAY:.0f} суток')


if __name__ == '__main__':
    main()
