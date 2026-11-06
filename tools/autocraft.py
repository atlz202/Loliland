"""Как автоматизировать каждый механизм в цепочках «Испытаний»: шаблоны AE2, обвязка или программа.

    python3 tools/autocraft.py        # пишет data/autocraft.json и печатает сводку по механизмам

Берутся только рецепты, которые реально выбраны в деревьях драконов и шести вех (как в sub_milestones.py).
Для каждого механизма считается:
  - сколько входных слотов у рецепта (шаблон обработки AE2 держит 9 входов и 3 выхода);
  - есть ли жидкости и газы на входе и выходе (интерфейс этой сборки AE2 умеет их отдавать);
  - повторяется ли один предмет вразбивку (A B A B): интерфейс сливает одинаковые стаки,
    поэтому машине с позиционными слотами такие рецепты нужно раскладывать программой;
  - катализаторы, которые остаются в машине, и выходы с шансом.
"""
import json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import sub_milestones as sm  # noqa: E402
import milestones as ms  # noqa: E402

ROOT = rg.ROOT
PATTERN_INS, PATTERN_OUTS = 9, 3


def kind(i):
    return 'gas' if i.startswith('gas:') else 'fluid' if i.startswith('liquid:') else 'item'


def interleaved(ins):
    """Один и тот же предмет стоит в нескольких местах, разделённых другими предметами."""
    seq = [i['id'] for i in ins]
    seen, last = set(), None
    for x in seq:
        if x != last and x in seen:
            return True
        seen.add(x)
        last = x
    return False


def profile(r):
    ins = [i for i in r['ins'] if i['id'] and i['id'] != 'null']
    outs = r['outs']
    return dict(
        slots=len(ins),
        distinct=len(r['in_map']),
        fluid_in=sum(kind(i['id']) == 'fluid' for i in ins),
        gas_in=sum(kind(i['id']) == 'gas' for i in ins),
        fluid_out=sum(kind(o['id']) == 'fluid' for o in outs),
        gas_out=sum(kind(o['id']) == 'gas' for o in outs),
        outs=len(outs),
        chance=sum(1 for o in outs if o.get('chance') not in (None, 1, 1.0)),
        catalysts=len(r['catalysts']),
        interleaved=interleaved(ins),
    )


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    nm = lambda i: rg.name_of(i, lang, names)  # noqa: E731
    ids = {nm(o['id']): o['id'] for r in g.recipes for o in r['outs']}

    targets = []
    for _, ts in sm.ERAS:
        targets += [ids[t] for t in ts] if ts else [t for k, _, tt in ms.MILESTONES if k != 'ddb' for t in tt]
    used = {}
    for t in targets:
        _, crafts = g.demand(t, 1, (sm.HELL_STAR,))
        for x in crafts:
            r = g.choose(x)
            used[r['idx']] = (x, r)

    by_m = defaultdict(list)
    for x, r in used.values():
        by_m[r['machine']].append((x, r, profile(r)))

    out = {}
    for m, lst in sorted(by_m.items(), key=lambda kv: -len(kv[1])):
        ps = [p for _, _, p in lst]
        agg = dict(
            recipes=len(lst),
            max_slots=max(p['slots'] for p in ps),
            over_9=sum(p['slots'] > PATTERN_INS for p in ps),
            over_3_out=sum(p['outs'] > PATTERN_OUTS for p in ps),
            fluid_in=sum(p['fluid_in'] > 0 for p in ps),
            gas_in=sum(p['gas_in'] > 0 for p in ps),
            fluid_out=sum(p['fluid_out'] > 0 for p in ps),
            gas_out=sum(p['gas_out'] > 0 for p in ps),
            chance=sum(p['chance'] > 0 for p in ps),
            catalysts=sum(p['catalysts'] > 0 for p in ps),
            distinct_catalysts=len({c['id'] for _, r, _ in lst for c in r['catalysts']}),
            interleaved=sum(p['interleaved'] for p in ps),
            examples=[nm(x) for x, _, _ in lst[:4]],
            interleaved_examples=[nm(x) for x, _, p in lst if p['interleaved']][:4],
            over_9_examples=[nm(x) for x, _, p in lst if p['slots'] > PATTERN_INS][:4],
        )
        out[m] = agg
    path = os.path.join(ROOT, 'data/autocraft.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    for m, a in out.items():
        flags = [k for k in ('over_9', 'over_3_out', 'fluid_in', 'gas_in', 'fluid_out', 'gas_out', 'chance',
                             'catalysts', 'interleaved') if a[k]]
        print(f"{m:40s} {a['recipes']:4d} слотов≤{a['max_slots']:2d} " +
              ' '.join(f'{k}={a[k]}' for k in flags) +
              (f" кат.видов={a['distinct_catalysts']}" if a['catalysts'] else ''))


if __name__ == '__main__':
    main()
