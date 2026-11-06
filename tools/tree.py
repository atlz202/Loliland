"""Дерево контрольных точек и задач для дашборда.

    python3 -I tools/tree.py      # пишет data/tree.json и web/dashboard.html (из web/dashboard.src.html)

Контрольные точки идут по эпохам драконов (как в sub_milestones.py), перед ними «Старт». В каждой точке:
  - главные задачи этапа по трём потокам из таблицы «Три потока по эпохам» в data/plan.md;
  - подзадачи из data/subtasks.json (шаблоны, линии автокрафта, сборщики);
  - задачи по пчёлам и твёрдой материи из data/bees.json и data/solid_matter.md (заданы ниже руками).
Квесты вкладки «Испытания» берутся из data/ispytaniya_quests.json как есть.
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipe_graph as rg  # noqa: E402
import sub_milestones as sm  # noqa: E402

ROOT = rg.ROOT
STREAMS = [
    (1, 'База и конвейер', 'ME, автокрафт, сингулярности, цепочки блоков, катализаторы'),
    (2, 'Души и драконы', 'Спавнеры, призывы, души драконов, блоки с мобов'),
    (3, 'Энергия, руда и материя', 'Энергия, руда с удачей, репликаторы, твёрдая материя, нейтроний, химия, пчёлы'),
]
START = 'Старт'
# строка таблицы плана -> контрольная точка
PLAN_ROWS = {
    '1': START, '2': START, '3–4': 'Дракон Края', '5': 'Душа дракона хаоса', '6': 'Огненный и ледяной, призывы',
    '7': 'Души огненного и ледяного', '8': 'Дракон бесконечности, призыв', '9': 'Демонический дракон, призыв',
    '10–11': 'Остальные пять вех',
}
EXTRA = [  # (точка, поток, вид, задача, что сделать, сложность)
    (START, 3, 'пчёлы', 'Пустить 4 совершенные пасеки',
     'Медлительная (смолистые соты на креозот) и четыре усовершенствованные пчелы. Раскладка в `bees.md`.', 'средняя'),
    (START, 3, 'проверка', 'Замерить скорость совершенной пасеки',
     'Одна рыбная пчела в пустой пасеке с улучшениями, соты за 10 минут. От этого зависит весь план пчёл.', 'лёгкая'),
    ('Дракон Края', 3, 'пчёлы', 'Вывести все 38 видов пчёл',
     'Список и родители в `bees.md`. Без всех видов не собрать пчелиный сердечник для новых пасек.', 'сложная'),
    ('Дракон хаоса, призыв', 3, 'пчёлы', 'Креозот на коксовый уголь',
     'Смолистые соты в центрифугу, креозотный прополис в сжиматель (350 mB с соты), креозот в капиллярный наполнитель. '
     'С призыва хаоса нужен ВОП-графит.', 'средняя'),
    ('Душа дракона хаоса', 3, 'материя', 'Модуль твёрдой материи под мутировавшую',
     'Средний модуль: 25 квантовых генераторов на 10 машин, около 7,6 млн мутировавшей в час. Схема в `solid_matter.md`.',
     'средняя'),
    ('Огненный и ледяной, призывы', 3, 'пчёлы', 'Достроить 28 совершенных пасек',
     'Каждая пасека стоит около 68 тыс. влажных, платиновых, урановых и янтарных сот и 8 катализаторов бесконечности.',
     'суперсложная'),
    ('Остальные пять вех', 3, 'пчёлы', 'Лейт: 32 пасеки, медлительная почти на все слоты',
     'Креозот забирает 82% работы пчёл. Раскладка 384 слотов в `bees.md`.', 'сложная'),
]

# иконки (ключи из tools/icons.py)
CP_ICON = ['me', 'blood_ender', 'blood_chaos', 'heart_ender', 'blood_fire', 'heart_chaos', 'blood_inf', 'blood_demon',
           'heart_fire', 'heart_inf', 'heart_demon', 'eternal']
STAGE_ICON = {  # (строка плана, поток) -> иконка
    ('1', 1): 'drive', ('1', 2): 'leg_spawner', ('1', 3): 'qgen0',
    ('2', 1): 'sulfur', ('2', 2): 'wither_heart', ('2', 3): 'neutron_comb',
    ('3–4', 1): 'steel', ('3–4', 2): 'pedestal', ('3–4', 3): 'neutron_ingot',
    ('5', 1): 'inf_catalyst', ('5', 2): 'lightning', ('5', 3): 'ore',
    ('6', 1): 'draconium', ('6', 2): 'loot2', ('6', 3): 'solar',
    ('7', 1): 'inf_ingot', ('7', 2): 'chaos_heart', ('7', 3): 'luck5',
    ('8', 1): 'singularity7', ('8', 2): 'heart_inf', ('8', 3): 'sparkling',
    ('9', 1): 'demon_catalyst', ('9', 2): 'demon_shard', ('9', 3): 'fluid_sing',
    ('10–11', 1): 'quest_station', ('10–11', 2): 'spawner', ('10–11', 3): 'loot11',
}
LINE_ICON = [  # (кусок названия, иконка), первое совпадение
    ('Закодировать шаблоны', 'pattern'), ('Обработка IC2', 'plate'), ('Газы и жидкости', 'fluidcell'),
    ('Закалка и сталь', 'steel'), ('Плавка в жидкость', 'molten'), ('Сплавы', 'invar'),
    ('Сингулярности', 'singularity'), ('Пчёлы и Forestry', 'tube'), ('Сборка', 'assembly'), ('Techguns', 'chamber'),
    ('Твёрдая материя', 'matter'), ('Молекулярные', 'molecular'), ('Кристаллы', 'crystal'), ('Прочее', 'misc'),
    ('сборщики X9', 'assembler'), ('нейтронный кодировщик', 'neutron_ingot'), ('лазерный', 'laser'),
    ('внеземной', 'alien'), ('совершенные пасеки', 'apiary'), ('скорость', 'speed'), ('видов пчёл', 'bee'),
    ('Креозот', 'creosote'), ('Модуль твёрдой', 'matter_t2'), ('28 совершенных', 'apiary_frame'), ('32 пасеки', 'apiary'),
]
BLOOD = {'c03': 'blood_ender', 'c05': 'blood_chaos', 'c06': 'blood_chaos', 'c08': 'blood_fire', 'c09': 'blood_inf',
         'c10': 'blood_demon', 'c11': 'blood_demon'}
QUEST_ICON = {
    344: 'artifacts', 324: 'quantum_core', 328: 'sparkling_core', 217: 'qgen3', 218: 'qgen1', 219: 'qgen2',
    1669: 'creative_cell', 314: 'creative_energy', 2716: 'demon_block', 2712: 'demon_catalyst', 2709: 'slayer_panel',
    361: 'heart_demon', 239: 'leg_spawner', 216: 'loot11', 2659: 'luck11', 2657: 'leg_molecular', 115: 'eternal',
    2714: 'inf_catalyst', 1901: 'replicator', 117: 'inf_pick', 2715: 'inf_hammer', 213: 'diamond', 2384: 'apiary',
    2165: 'codex', 103: 'inf_sword', 318: 'demon_sword', 326: 'demon_armor',
}


def icon_for(t, cpid):
    if t['kind'] == 'этап':
        return STAGE_ICON[(t['title'].split('.')[0], t['stream'])]
    if 'Кровь драконов' in t['title']:
        return BLOOD[cpid]
    for part, key in LINE_ICON:
        if part in t['title']:
            return key
    raise KeyError(t['title'])


def line_key(t):
    """Задачи одной линии в разных точках связываются на графе."""
    if t['kind'] == 'этап':
        return f"stage{t['stream']}"
    if t['kind'] == 'пчёлы':
        return 'Пчёлы'
    m = re.match(r'(Линия «[^»]+»|Закодировать шаблоны)', t['title'])
    return m.group(1) if m else None


def plan_rows():
    text = open(os.path.join(ROOT, 'data/plan.md'), encoding='utf8').read()
    sec = text[text.index('## Три потока по эпохам'):]
    sec = sec[:sec.index('\n## ', 5)]
    rows = []
    for line in sec.splitlines():
        m = re.match(r'\| (\d+(?:–\d+)?)\. ([^|]+) \| (.+) \|$', line)
        if not m:
            continue
        cells = [c.strip() for c in m.group(3).split(' | ')]
        rows.append((m.group(1), m.group(2).strip(), cells))
    return rows


def split_diff(cell):
    m = re.search(r'\((лёгкая|средняя|сложная|суперсложная)\)\s*$', cell)
    return (cell[:m.start()].strip(), m.group(1)) if m else (cell, None)


def main():
    cps = [START] + [e for e, _ in sm.ERAS]
    tasks = []

    def add(cp, stream, kind, title, what, diff, source):
        tasks.append(dict(id=f't{len(tasks) + 1:03d}', checkpoint=cp, stream=stream, kind=kind, title=title,
                          what=what, difficulty=diff, source=source))

    for num, name, cells in plan_rows():
        cp = PLAN_ROWS[num]
        for s, cell in enumerate(cells, 1):
            body, diff = split_diff(cell)
            add(cp, s, 'этап', f'{num}. {name}', body, diff, 'plan.md')
    for x in json.load(open(os.path.join(ROOT, 'data/subtasks.json'), encoding='utf8')):
        add(x['era'], x['stream'], x['kind'], x['title'], x['what'], x['difficulty'], 'subtasks.md')
    for cp, s, kind, title, what, diff in EXTRA:
        add(cp, s, kind, title, what, diff, 'bees.md' if kind == 'пчёлы' or 'пасек' in title else 'solid_matter.md')
    bad = {t['checkpoint'] for t in tasks} - set(cps)
    assert not bad, bad

    q = json.load(open(os.path.join(ROOT, 'data/ispytaniya_quests.json'), encoding='utf8'))
    quests = [dict(id=x['id'], name=x['name'], requires=x['requires'], difficulty=x['difficulty'],
                   note=x.get('difficulty_note') or x.get('goal'), key=x.get('key_milestone'),
                   final=x['name'] in q['final_quests'], icon=QUEST_ICON[x['id']]) for x in q['quests']]
    out = dict(
        note='Собрано tools/tree.py. Контрольные точки по эпохам драконов, задачи по трём потокам.',
        streams=[dict(id=i, title=t, desc=d) for i, t, d in STREAMS],
        checkpoints=[dict(id=f'c{i:02d}', title=c, order=i, icon=CP_ICON[i]) for i, c in enumerate(cps)],
        tasks=[dict(t, checkpoint=cid, icon=icon_for(t, cid), line=line_key(t))
               for t in tasks for cid in [f'c{cps.index(t["checkpoint"]):02d}']],
        quests=quests, external=q['external'],
    )
    json.dump(out, open(os.path.join(ROOT, 'data/tree.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    tpl = open(os.path.join(ROOT, 'web/dashboard.src.html'), encoding='utf8').read()
    out['icons'] = json.load(open(os.path.join(ROOT, 'web/icons.json')))  # tools/icons.py
    blob = json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    open(os.path.join(ROOT, 'web/dashboard.html'), 'w', encoding='utf8').write(tpl.replace('/*TREE*/', blob))
    print(f'готово: data/tree.json, точек {len(cps)}, задач {len(tasks)}, квестов {len(quests)}')
    for i, c in enumerate(cps):
        n = [t for t in tasks if t['checkpoint'] == c]
        print(f'  {c}: {len(n)}', {s: sum(t["stream"] == s for t in n) for s in (1, 2, 3)})


if __name__ == '__main__':
    main()
