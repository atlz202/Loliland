"""Лимиты механизмов на базу (LimitManagerMT) и раскладка механизмов по нагрузке шести вех.

    python3 tools/limits.py        # пишет data/limits.md

Нагрузка = число операций в дереве шести вех (граф recipe_graph). Множители модулей не учтены, поэтому
абсолютные числа завышены; смысл имеют доли. Цепочки руды (руда, пыль, слиток) отданы преобразователю удачи:
он сразу выдаёт готовый ресурс. Крафты верстака 3x3 и 9x9 идут в молекулярных сборщиках моментально и не считаются.
"""
import os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import milestones as ms  # noqa: E402

ROOT = rg.ROOT
SRC = os.path.join(ROOT, 'data/recipes/!!!Hitech_RealmLimitManager.zs')
HELL_STAR = 'lolidimensions:hell_star'

GROUP_TITLES = {
    'mashinegroupsic2': 'Промышленные механизмы', 'newmeka': 'Механизмы химии (как в Mekanism)',
    'gentvermatter': 'Твёрдая материя', 'genneitroniym': 'Генераторы нейтрония', 'NeutronCombinerall': 'Объединители нейтрония',
    'spawners': 'Спавнеры', 'Replicators': 'Репликаторы', 'AssemblerAE2': 'Молекулярные сборщики AE2',
    'listsolarpanels': 'Солнечные панели и квантовые генераторы', 'unifier': 'Объединители энергии', 'Energongen': 'Генераторы энергона',
    'QED': 'QED', 'apiculture': 'Пасеки', 'condens_mater': 'Конденсаторы материи', 'EnergyCell': 'Энергоячейки AE2',
    'BlockDrive': 'МЭ накопители', 'Wireless': 'Беспроводные точки', 'storageenergys': 'Хранилища энергии',
    'tranformatenergys': 'Трансформаторы', 'kinetic generator': 'Кинетические генераторы', 'extrayzel': 'Узлы ExtraUtilities',
    'ExtraUtilgenerator': 'Генераторы ExtraUtilities', 'advancedsolardestiller': 'Солнечные опреснители', 'lamp': 'Лампы',
    'OilDerrick': 'Нефтяные вышки', 'TinkerSmelter': 'Плавильня Tinkers (блоки)', 'TinkerSmelteryController': 'Плавильня Tinkers (контроллер)',
    'tinker': 'Tinkers (обожжённые блоки)',
}
EXTRA_NAMES = {
    'lolienergistics:BlockMacerator': 'Дробитель', 'lolienergistics:BlockCompressor': 'Компрессор',
    'lolienergistics:BlockMetalFormer': 'Металлоформовщик', 'lolienergistics:BlockElectricFurnace': 'Электропечь',
    'lolienergistics:BlockExtractor': 'Экстрактор', 'lolienergistics:BlockRecycler': 'Утилизатор',
    'lolienergistics:BlockCentrifuge': 'Термальная центрифуга', 'lolienergistics:BlockCentrifuge:1': 'Термальная центрифуга (улучшенная)',
    'lolienergistics:advanced_cutter_machine:1': 'Режущий механизм (улучшенный)', 'lolienergistics:industrial_filling:1': 'Разливочный механизм (улучшенный)',
    'lolienergistics:BlockWitcherFarm': 'Ферма ведьм', 'lolienergistics:alloy_chamber': 'Камера сплавов',
    'lolienergistics:alloy_chamber:1': 'Камера сплавов (тир 2)', 'lolienergistics:alloy_chamber:2': 'Камера сплавов (тир 3)',
    'lolienergistics:procedural_assembler': 'Процедурный сборщик', 'lolienergistics:enrichment_chamber': 'Обогатитель',
    'lolienergistics:enrichment_chamber:1': 'Обогатитель (тир 2)', 'lolienergistics:enrichment_chamber:2': 'Обогатитель (тир 3)',
    'lolienergistics:chemical_filler': 'Химический наполнитель', 'lolienergistics:chemical_oxidizer': 'Химический окислитель',
    'lolienergistics:reaction_chamber': 'Реакционная камера', 'lolienergistics:electrolytic_separator': 'Электролитический сепаратор',
    'lolienergistics:ambient_gas_collector': 'Сборщик газа из воздуха', 'lolienergistics:blender': 'Смеситель',
    'lolienergistics:rotary_condensentrator': 'Ротационный конденсатор', 'lolienergistics:steam_boiler': 'Паровой котёл',
    'lolienergistics:BlockMatterSolidX1': 'Твёрдая материя X1', 'lolienergistics:BlockMatterSolidX6': 'Твёрдая материя X6',
    'lolienergistics:BlockMatterSolidX12': 'Твёрдая материя X12', 'lolienergistics:BlockNeutron': 'Генератор нейтрония (груды)',
    'lolienergistics:BlockCompressedNeutronS1': 'Генератор нейтрония S1 (самородки)', 'lolienergistics:BlockCompressedNeutronS2': 'Генератор нейтрония S2 (слитки)',
    'lolienergistics:BlockCompressedNeutronS3': 'Генератор нейтрония S3 (блоки)', 'lolienergistics:BlockNeutronCombiner': 'Объединитель нейтрония',
    'lolienergistics:BlockEnergyNeutronCombiner': 'Энергетический объединитель нейтрония', 'lolienergistics:BlockQuantumReplicator': 'Квантовый репликатор',
    'IC2:blockMachine2:5': 'Репликатор IC2', 'DraconicEvolution:customSpawner': 'Стабилизированный спавнер',
    'loli_technologies:tile.BlockAdvancedAssembler': 'Улучшенный сборщик', 'loli_technologies:tile.BlockNeutroniumAssembler': 'Нейтрониевый сборщик',
    'loli_technologies:tile.BlockLargeAssemblerX9': 'Большой сборщик X9', 'loli_technologies:tile.BlockFusionAssembler': 'Сборщик синтеза',
    'loli_technologies:tile.BlockAssemblyTableAssembler': 'Сборщик сборочного стола',
}
# где живёт каждая машина графа: (группа или одиночный лимит, лимит)
MACHINE_GROUP = {
    'Печь': 'mashinegroupsic2', 'Дробитель': 'mashinegroupsic2', 'Компрессор IC2': 'mashinegroupsic2', 'Металлоформовщик': 'mashinegroupsic2',
    'Экстрактор': 'mashinegroupsic2', 'Термальная центрифуга': 'mashinegroupsic2', 'Рудопромывочная машина': 'mashinegroupsic2',
    'Плавильный завод': 'mashinegroupsic2', 'Капиллярный наполнитель': 'mashinegroupsic2', 'Камера сплавов': 'mashinegroupsic2',
    'Печь сплавов': 'mashinegroupsic2', 'Процедурный сборщик': 'mashinegroupsic2',
    'Обогатитель': 'newmeka', 'Химический наполнитель': 'newmeka', 'Химический окислитель': 'newmeka', 'Реакционная камера': 'newmeka',
    'Электролитический сепаратор': 'newmeka', 'Сборщик газа из воздуха': 'newmeka', 'Ротационный конденсатор': 'newmeka', 'Паровой котёл': 'newmeka',
}
SINGLE = {  # машина графа -> (id блока, лимит из скрипта)
    'Молекулярный преобразователь': ('lolienergistics:BlockMolecular', 64), 'Двойной молекулярный преобразователь': ('lolienergistics:double_molecular', 64),
    'Нейтронный компрессор': ('Avaritia:Neutronium_Compressor', 32), 'Жидкий нейтроний': ('lolienergistics:liquid_neutron_compressor', 16),
    'Закалочная ванна': ('lolienergistics:hardening_bath', 8), 'Доменная печь': ('lolienergistics:industrial_blast_furnace', 4),
    'Кристаллизационное охлаждение': ('lolienergistics:crystallization_cooling_complex', 16), 'Камера роста кристаллов': ('lolienergistics:crystal_growth_chamber', 32),
    'Камера зарядки кристаллов': ('lolienergistics:crystal_charging_chamber', 48), 'Промышленный смеситель': ('lolienergistics:mixer_core', 32),
    'Сборочный стол': ('lolienergistics:assembly_table', 32), 'Сборочный комплекс': ('hielements:assembly_complex', 32),
    'Легендарный сборочный комплекс': ('hielements:legendary_assembly_complex', 18), 'Гемонтрансмутатор': ('lolienergistics:hemontransmutator', 8),
    'Энтропийный реактор': ('lolienergistics:entropy_reactor', 4), 'Преобразователь душ': ('loli_dragon_might:extraterrestrial_soul_transformer', 8),
    'Пчелиная фабрика': ('loli_forestry:bee_factory', 8), 'Дистилляционная колонна': ('lolienergistics:distillation_column_core', 2),
    'Котёл': ('lolienergistics:cauldron', 8), 'Синтезатор энергона': ('lolienergistics:energon_synthesizer_core', 1),
    'Сушилка': ('TConstruct:Armor.DryingRack', 96), 'Центрифуга Forestry': ('Forestry:factory', 64), 'Сжиматель': ('Forestry:factory', 64),
    'Плотник': ('Forestry:factory', 64), 'Перегонный куб': ('Forestry:factory', 64), 'Термоионный фабрикатор': ('Forestry:factory2', 64),
}
INSTANT = {'Верстак', 'Экстремальный верстак', 'Словарь руд'}
LUCK_M = {'Печь', 'Дробитель', 'Компрессор IC2', 'Рудопромывочная машина', 'Термальная центрифуга', 'Металлоформовщик'}


def parse_limits():
    src = open(SRC, encoding='utf8').read()
    groups = []
    for m in re.finditer(r"addGroup\('([^']*)', *([^,]+), *\[(.*?)\]\)", src):
        ids = [i[:-6] if i.endswith(':32767') else i for i in re.findall(r'<([^<>]+)>', m.group(3))]
        groups.append((m.group(1), int(eval(m.group(2))), ids))
    singles = [(i[:-6] if i.endswith(':32767') else i, int(eval(n)))
               for i, n in re.findall(r"LimitManagerMT\.add\(<([^<>]+)>\.asBlock\(\), *([^)]+\)?)\)", src)]
    return groups, singles


def is_ore(i):
    return bool(re.search(r'(^|[:_])ore($|[:_])|_ore\b|ore[A-Z]|itemOreIridium|CrushedOre', i)) and 'core' not in i.lower()


def machine_ops(g):
    def from_ore(i):
        r = g.choose(i)
        return r is not None and r['kind'] == 'craft' and any(is_ore(x) for x in r['in_map'])
    ops = defaultdict(float)
    for _, _, targets in ms.MILESTONES:
        for t in targets:
            _, crafts = g.demand(t, 1, (HELL_STAR,))
            for k, c in crafts.items():
                r = g.choose(k)
                m = r['machine']
                if m in LUCK_M and any(is_ore(i) or from_ore(i) for i in r['in_map']):
                    ops['Преобразователь удачи'] += c
                else:
                    ops[re.sub(r' \(тир \d+\)$', '', m)] += c
    return ops


def main():
    recipes, _, _ = rg.load()
    g = rg.Graph(recipes)
    lang, names = rg.load_names(rg.default_assets())
    nm = lambda i: EXTRA_NAMES.get(i) or rg.name_of(i, lang, names)  # noqa: E731
    groups, singles = parse_limits()
    glim = {k: n for k, n, _ in groups}
    ops = machine_ops(g)

    L = ['# Лимиты механизмов и раскладка под нагрузку\n',
         'Собрано `tools/limits.py` из `data/recipes/!!!Hitech_RealmLimitManager.zs` и графа рецептов шести вех. '
         'Лимит действует на всю базу. Нагрузка посчитана без множителей модулей, поэтому смысл имеют доли, а не числа. '
         'Цепочки руды отданы преобразователю удачи, крафты 3x3 и 9x9 идут в молекулярных сборщиках моментально.\n']

    L.append('## Раскладка общих групп по нагрузке\n')
    L.append('В общей группе лимит делится между типами. Если механизм делает одну операцию в тик, '
             'быстрее всего выходит, когда число механизмов каждого типа пропорционально его нагрузке.\n')
    for gid in ('mashinegroupsic2', 'newmeka'):
        rows = [(ops[m], m) for m, gg in MACHINE_GROUP.items() if gg == gid and ops.get(m, 0) > 0]
        tot = sum(q for q, _ in rows)
        lim = glim[gid]
        L.append(f'### {GROUP_TITLES[gid]}: {lim} на всё\n')
        L.append('| Механизм | Доля нагрузки | Сколько ставить |')
        L.append('|---|---|---|')
        alloc = {m: max(1, round(lim * q / tot)) for q, m in rows}
        over = sum(alloc.values()) - lim
        for q, m in sorted(rows, reverse=True):
            L.append(f'| {m} | {q / tot:.0%} | {alloc[m]} |')
        if over > 0:
            L.append(f'\nС округлением выходит на {over} больше лимита: снимите их с самого большого типа.')
        L.append('')
    L.append('### Твёрдая материя: 192 машины на все тиры\n')
    L.append('Каждая машина питается от своих двух квантовых генераторов (4,2G в тик), поэтому делить машины между тирами '
             'нужно по энергии, а не по числу операций: на высоких тирах операция дороже.\n')
    sm = machine_ops_by_tier(g)
    tot = sum(sm.values())
    L.append('| Тир | Доля энергии | Машин из 192 |')
    L.append('|---|---|---|')
    for m, q in sm.items():
        L.append(f'| {m.replace("Твёрдая материя ", "")} | {q / tot:.1%} | {max(1, round(192 * q / tot))} |')
    L.append('')

    L.append('## Механизмы с отдельным лимитом: где тесно\n')
    L.append('«Нагрузка на штуку» = операции на один механизм при полном лимите, относительно самого загруженного. '
             'Чем ближе к 100%, тем раньше этот механизм упрётся в лимит.\n')
    rows = []
    for m, (bid, lim) in SINGLE.items():
        if ops.get(m, 0) > 0:
            rows.append((ops[m] / lim, m, lim, bid))
    # преобразователь удачи: руды в x25 раз меньше, чем готовых ресурсов, и он берёт до 96 руд в тик
    rows.append((ops['Преобразователь удачи'] / 25 / 96 / 32, 'Преобразователь удачи (руда x25, 96 руд в тик)', 32, ''))
    for gid in ('mashinegroupsic2', 'newmeka'):
        q = sum(ops[m] for m, gg in MACHINE_GROUP.items() if gg == gid)
        rows.append((q / glim[gid], GROUP_TITLES[gid] + ', вся группа', glim[gid], ''))
    top = max(r[0] for r in rows)
    L.append('| Механизм | Лимит | Нагрузка на штуку |')
    L.append('|---|---|---|')
    for per, m, lim, bid in sorted(rows, reverse=True):
        L.append(f'| {m} | {lim} | {per / top:.1%} |')
    L.append('')

    L.append('## Все группы лимитов и что в них входит\n')
    for gid, lim, ids in sorted(groups, key=lambda x: -x[1]):
        L.append(f'**{GROUP_TITLES.get(gid, gid)}** (`{gid}`), {lim} на всё: ' + ', '.join(nm(i) for i in ids) + '.\n')
    L.append('## Одиночные лимиты\n')
    L.append('| Механизм | Лимит |')
    L.append('|---|---|')
    for i, n in sorted(singles, key=lambda x: (-x[1], nm(x[0]))):
        L.append(f'| {nm(i)} `{i}` | {n} |')
    open(os.path.join(ROOT, 'data/limits.md'), 'w', encoding='utf8').write('\n'.join(L) + '\n')
    print('готово: data/limits.md')


def machine_ops_by_tier(g):
    out = defaultdict(float)
    for _, _, targets in ms.MILESTONES:
        for t in targets:
            _, crafts = g.demand(t, 1, (HELL_STAR,))
            for k, c in crafts.items():
                r = g.choose(k)
                if r['machine'].startswith('Твёрдая материя'):
                    out[r['machine']] += c * float(r.get('energy') or 0)
    return dict(sorted(out.items(), key=lambda kv: int(re.search(r'\d+', kv[0]).group())))


if __name__ == '__main__':
    main()
