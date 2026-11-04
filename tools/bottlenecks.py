"""Цифры для data/plan.md: цена вех, нейтроний под душу дракона хаоса, доли душ драконов, окупаемость модулей.

    python3 tools/bottlenecks.py

Множители модулей в количествах ресурсов не учтены. Скорости из data/process_notes.md:
спавнер 0,2 предмета в тик на душу (проверка Фёдора), 110 душ в спавнере, модуль добычи xN даёт в среднем N/2+1;
преобразователь удачи 30 слотов по стаку раз в секунду (96 руд в тик), модуль удачи считаем ровно xN;
генераторы нейтрония: период 250/150/100/50/10 с по тирам, S1/S2/S3 дают самородок/слиток/блок,
энергетический объединитель x2.
"""
import glob, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import milestones as ms  # noqa: E402

ES = 'eternalsingularity:eternal_singularity'
DC = 'lolienergyrelics:demonic_infinity_catalyst'
HELL_STAR = 'lolidimensions:hell_star'
INF_INGOT = 'Avaritia:Resource:6'
DAY = 20 * 60 * 60 * 24
NEUT = {'Avaritia:Resource:2': 1, 'Avaritia:Resource:3': 9, 'Avaritia:Resource:4': 81, 'Avaritia:Resource_Block': 729}
DRAGONS = [('ldne_ender_dragon_boss', 'Края'), ('ldne_chaos_dragon_boss', 'Хаоса'), ('ldne_ice_dragon_boss', 'Ледяной'),
           ('ldne_fire_dragon_boss', 'Огненный'), ('ldne_infinity_dragon_boss', 'Бесконечности'),
           ('ldne_demonic_infinity_dragon_boss', 'Демонический')]
TIERS = [3, 5, 10, 15, 20, 25, 30, 35, 40, 50, 100]


def leaves_mass(g, item, stop=()):
    n, c = g.demand(item, 1, stop)
    skip = set(rg.FREE) | {'IC2:itemScrap', item} | set(stop)
    return sum(v / (1000 if k.startswith(('liquid:', 'gas:')) else 1) for k, v in n.items() if k not in c and k not in skip)


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}

    es_mass = leaves_mass(g, ES)
    print(f'1 вечная сингулярность = {es_mass:.3g} предметов базы, 1 демонический каталист = {g.demand(DC)[0][ES]:.0f} ВС\n')
    print('Вехи:')
    total_es = 0
    for key, title, targets in ms.MILESTONES:
        es = sum(g.demand(t)[0].get(ES, 0) for t in targets)
        dc = sum(g.demand(t)[0].get(DC, 0) for t in targets)
        total_es += es
        print(f'  {title:36s} ВС {es:7.0f}  дем. каталистов {dc:5.0f}')
    print(f'  всего ВС {total_es:.0f} = {total_es * es_mass:.2g} предметов; за неделю это {total_es * es_mass / 7 / DAY:.2g} предметов в тик\n')

    print('Нейтроний под душу дракона хаоса (слитки бесконечности из китов):')
    n, c = g.demand(ids['Душа: Дракон Хаоса'], 1, (INF_INGOT,))
    blocks = n.get('Avaritia:Resource:2', 0) / 729
    print(f'  нужно около {blocks:.3g} блоков нейтрония')
    period = [250, 150, 100, 50, 10]
    out = {'BlockNeutron': 1, 'BlockCompressedNeutronS1': 9, 'BlockCompressedNeutronS2': 81, 'BlockCompressedNeutronS3': 729}
    for base, per_out in out.items():
        for m in range(5):
            k = f'lolienergistics:{base}' + (f':{m}' if m else '')
            nn, _ = g.demand(k)
            cost = nn.get('Avaritia:Resource:2', 0) / 729
            rate = per_out / period[m] * 86400 / 729 * 2
            cores = {nm(i).replace('DraconicEvolution:', ''): round(q) for i, q in nn.items() if i.startswith('DraconicEvolution:') and 'Core' in i}
            print(f'  {base}:{m}  {rate:8.3g} блоков в сутки (x2), в крафте {cost:6.3g} блоков, ядра {cores}')
    print()

    print('Драконы: сколько убийств нужно на все шесть вех и доли душ:')
    loot = defaultdict(dict)
    for f in glob.glob(os.path.join(rg.ROOT, 'data/recipes/*.zs')):
        for mob, it, ch in re.findall(r"SpawnTrickTweaker\.addLoot\('([^']*)', *<([^>]*)>[^,]*, *([0-9.]+)", open(f, encoding='utf8').read()):
            loot[mob][it] = float(ch)
    need = defaultdict(float)
    for _, _, targets in ms.MILESTONES:
        for t in targets:
            nn, cc = g.demand(t)
            for k, v in nn.items():
                if k not in cc:
                    need[k] += v
    kills = {}
    for mob, label in DRAGONS:
        rows = sorted(((need.get(it, 0) / ch, it) for it, ch in loot[mob].items() if need.get(it, 0) > 0), reverse=True)
        kills[label] = rows[0][0]
        print(f'  {label:14s} {rows[0][0]:9.3g} убийств, держит {nm(rows[0][1])}; ' +
              ', '.join(f'{nm(it)} {need[it]:.3g}' for _, it in rows))
    tot = sum(kills.values())
    souls_week = {k: v / 26 / 0.3 / (7 * DAY) for k, v in kills.items()}
    print('  доли: ' + ', '.join(f'{k} {v / tot:.0%}' for k, v in kills.items()))
    print('  душ на неделю при модуле x50 и 0,3 убийства в тик на душу: ' + ', '.join(f'{k} {v:.1f}' for k, v in souls_week.items()))
    print()

    print('Окупаемость модулей (шаг от предыдущего тира):')
    for base, label in [('loli_dragon_might:looting_module', 'добыча'), ('loli_utility:FortuneModule', 'удача')]:
        for m, t in enumerate(TIERS):
            k = base + (f':{m}' if m else '')
            prev = base + (f':{m - 1}' if m > 1 else '') if m else None
            stop = (prev,) if prev else ()
            mass = leaves_mass(g, k, stop)
            es = g.demand(k, 1, stop)[0].get(ES, 0)
            d_n = t - (TIERS[m - 1] if m else (0 if label == 'добыча' else 1))
            extra = 110 * 0.2 * d_n / 2 if label == 'добыча' else 96 * d_n
            print(f'  {label} x{t:<3} ВС {es:6.0f}  предметов {mass:9.3g}  прирост {extra:5.0f} в тик  окупается за {mass / extra / DAY * 24:9.3g} ч')
    k = 'lolienergistics:upgrade_quantum_generator'
    _, cc = g.demand(k)
    e = sum(c * float(g.choose(x).get('energy') or 0) for x, c in cc.items())
    print(f'\nКвантовый генератор: крафт стоит {e:.3g} EU, даёт 2,1G в тик, окупается за {e / 2.1e9 / 72000:.0f} ч')


if __name__ == '__main__':
    main()
