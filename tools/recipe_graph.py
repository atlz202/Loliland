"""Граф всех серверных рецептов HiTech из data/recipes/*.zs.

    python3 tools/recipe_graph.py dump data/recipes/graph.json      # все рецепты в одном JSON
    python3 tools/recipe_graph.py tree '<loli_utility:FortuneModule:10>' [--depth 4]
    python3 tools/recipe_graph.py leaves '<loli_utility:FortuneModule:10>'
    python3 tools/recipe_graph.py uses '<hielements:sparkling_ingot>'

Каждый рецепт приводится к виду: машина, выходы, входы (с количеством), энергия, файл.
Источники без входов (лазерный бур, репликатор, дроп с мобов, кейсы, аирдроп, сундуки)
тоже записываются как рецепты, у них пустой список входов и тип source.

Ограничения: здесь только то, что сервер добавляет скриптами. Рецепты самих модов,
которые сервер не трогал, и дроп с драконов сюда не попадают; такие предметы
оказываются листьями дерева с пометкой «нет серверного рецепта».
"""
import argparse, glob, json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- разбор выражений

TOK = re.compile(r"""\s*(?:
    (?P<str>'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")
  | (?P<num>-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?[lLdDfF]?)
  | (?P<id>[A-Za-z_$][\w$]*(?:/[\w$]+)*)
  | (?P<p>[()\[\]{},.:*<>])
)""", re.X)


class Item:
    __slots__ = ('kind', 'id', 'amount', 'tag', 'chance')

    def __init__(self, kind, id_, amount=1):
        self.kind, self.id, self.amount, self.tag, self.chance = kind, id_, amount, None, None

    def key(self):
        k = self.id
        if self.kind == 'item':
            parts = k.split(':')
            if len(parts) == 3 and parts[2] == '0':
                k = ':'.join(parts[:2])
            if self.tag and isinstance(self.tag, dict):
                n = self.tag.get('Name') or self.tag.get('id')
                if isinstance(n, str):
                    k += '{' + n + '}'
            return k
        return f'{self.kind}:{k}'

    def __repr__(self):
        return f'<{self.key()}>x{self.amount}'


class Call:
    __slots__ = ('name', 'args')

    def __init__(self, name, args):
        self.name, self.args = name, args

    def __repr__(self):
        return f'{self.name}({self.args})'


class Parser:
    def __init__(self, s):
        self.s, self.i = s, 0

    def peek(self):
        m = TOK.match(self.s, self.i)
        if not m or m.end() == m.start():
            return None, None
        for g in ('str', 'num', 'id', 'p'):
            if m.group(g) is not None:
                return g, m.group(g)

    def take(self):
        m = TOK.match(self.s, self.i)
        self.i = m.end()
        for g in ('str', 'num', 'id', 'p'):
            if m.group(g) is not None:
                return g, m.group(g)

    def expect(self, v):
        t, x = self.take()
        if x != v:
            raise ValueError(f'ожидалось {v!r}, получено {x!r} на {self.i}: {self.s[self.i-40:self.i+40]!r}')

    def bracket(self):
        # <mod:name:meta>, бывают вложенные: <ore:<oc:cpu1>>
        while self.s[self.i] == ' ':
            self.i += 1
        assert self.s[self.i] == '<'
        depth, j = 0, self.i
        while True:
            c = self.s[j]
            if c == '<':
                depth += 1
            elif c == '>':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = self.s[self.i + 1:j]
        self.i = j + 1
        if body.startswith('ore:'):
            return Item('ore', body[4:])
        if body.startswith('liquid:'):
            return Item('liquid', body[7:])
        return Item('item', body)

    def args(self, close):
        out = []
        while True:
            t, x = self.peek()
            if x == close:
                self.take()
                return out
            out.append(self.expr())
            t, x = self.peek()
            if x == ',':
                self.take()

    def primary(self):
        t, x = self.peek()
        if x == '<':
            return self.bracket()
        if x == '[':
            self.take()
            return self.args(']')
        if x == '{':
            self.take()
            d = {}
            while True:
                t, x = self.peek()
                if x == '}':
                    self.take()
                    return d
                kt, k = self.take()
                self.expect(':')
                d[k.strip('\'"')] = self.expr()
                if self.peek()[1] == ',':
                    self.take()
        self.take()
        if t == 'str':
            return x[1:-1]
        if t == 'num':
            v = x.rstrip('lLdDfF')
            return float(v) if any(c in v for c in '.eE') else int(v)
        if t == 'id':
            if x in ('null', 'true', 'false'):
                return {'null': None, 'true': True, 'false': False}[x]
            name = x
            while self.peek()[1] == '.':
                save = self.i
                self.take()
                t2, x2 = self.take()
                if t2 != 'id':
                    self.i = save
                    break
                name += '.' + x2
            if self.peek()[1] == '(':
                self.take()
                return self.special(Call(name, self.args(')')))
            return name
        if x == '(':
            v = self.expr()
            self.expect(')')
            return v
        raise ValueError(f'не разобрал {x!r} на {self.i}')

    def special(self, c):
        if c.name.endswith('GasBracketHandler.getGas'):
            return Item('gas', c.args[0])
        if c.name.endswith('LiquidStackExpansion.chemical') and c.args:
            return c.args[0]
        return c

    def expr(self):
        v = self.primary()
        while True:
            t, x = self.peek()
            if x == '.':
                self.take()
                _, m = self.take()
                a = []
                if self.peek()[1] == '(':
                    self.take()
                    a = self.args(')')
                if isinstance(v, Item):
                    if m in ('withAmount', 'amount') and a:
                        v.amount = a[0]
                    elif m == 'makeStack' and a:
                        # getDefinition().makeStack(n) даёт предмет с метой n, а не n штук
                        v.id = v.id.split(':')[0] + ':' + v.id.split(':')[1] + f':{a[0]}'
                    elif m == 'withTag' and a:
                        v.tag = a[0]
                    elif m in ('percent', 'weight') and a:
                        v.chance = a[0]
                    elif m in ('getDefinition', 'anyDamage', 'onlyDamaged', 'reuse', 'noReturn'):
                        pass
                    else:
                        v = Call('.' + m, [v] + a)
                else:
                    v = Call('.' + m, [v] + a)
            elif x == '*':
                self.take()
                n = self.primary()
                if isinstance(v, Item) and isinstance(n, int):
                    v.amount = n
            else:
                return v


def parse_line(line):
    p = Parser(line.strip())
    v = p.expr()
    return v if isinstance(v, Call) else None


# ---------------------------------------------------------------- приведение рецептов

def items(x):
    """Все предметы внутри значения (список, сетка) по порядку."""
    if isinstance(x, Item):
        return [x]
    if isinstance(x, list):
        return [i for e in x for i in items(e)]
    return []


def num(x):
    return x if isinstance(x, (int, float)) else None


def R(machine, outs, ins, energy=None, kind='craft', note=None, catalysts=()):
    return dict(machine=machine, outs=items(outs), ins=items(ins), energy=energy, kind=kind, note=note,
                catalysts=items(list(catalysts)))


def h_shaped(a, m):
    return R(m, a[0], a[1])


H = {
    'recipes.addShaped': lambda a: R('Верстак', a[0], a[1]),
    'recipes.addShapeless': lambda a: R('Верстак', a[0], a[1]),
    'ExtremeCrafting.addShaped': lambda a: R('Экстремальный верстак', a[0], a[1]),
    'furnace.addRecipe': lambda a: R('Печь', a[0], a[1]),
    # ферма выращивает предмет из семени, семя не тратится
    'MTMolecularFarm.add': lambda a: R('Молекулярная ферма', a[0], [], num(a[2]) if len(a) > 2 else None,
                                       kind='source', catalysts=[a[1]]),
    'Macerator.addRecipe': lambda a: R('Дробитель', a[0], a[1]),
    'Compressor.addRecipe': lambda a: R('Компрессор IC2', a[0], a[1]),
    'Extractor.addRecipe': lambda a: R('Экстрактор', a[0], a[1]),
    'MetalFormer.addRollingRecipe': lambda a: R('Металлоформовщик', a[0], a[1]),
    'MetalFormer.addExtrudingRecipe': lambda a: R('Металлоформовщик', a[0], a[1]),
    'MetalFormer.addCuttingRecipe': lambda a: R('Металлоформовщик', a[0], a[1]),
    'Compressor.add': lambda a: R('Нейтронный компрессор', a[0], [_amt(a[2], a[1])]),
    'MTSmeltingPlant.add': lambda a: R('Плавильный завод', a[0], a[1], num(a[3]) if len(a) > 3 else None),
    'MTAssemblyTable.addRecipe': lambda a: R('Сборочный стол', a[0], a[2], num(a[1])),
    'MTFusionCrafting.add': lambda a: R(f'Синтез (тир {a[2]})', a[0], a[4], num(a[3]), catalysts=[a[1]]),
    'MTMolecular.add': lambda a: R('Молекулярный преобразователь', a[1], a[0], num(a[2])),
    'MTDoubleMolecular.add': lambda a: R('Двойной молекулярный преобразователь', a[2], [a[0], a[1]], num(a[3])),
    'MTAssemblyComplex.addRecipe': lambda a: R('Сборочный комплекс', a[0], [a[1], a[2], a[3]], num(a[4])),
    'MTLegendaryAssemblyComplex.addRecipe': lambda a: R('Легендарный сборочный комплекс', a[0], [a[1], a[2], a[3]], num(a[4])),
    'ReactionChamberTweaker.addRecipe': lambda a: R('Реакционная камера Techguns', a[2], [a[0], a[1]], num(a[-1]), catalysts=[a[3]]),
    'MTCapillaryFiller.addRecipe': lambda a: R('Капиллярный наполнитель', a[0], a[1:]),
    'ThermalCentrifuge.addRecipe': lambda a: R('Термальная центрифуга', a[0], a[1]),
    'Centrifuge.addRecipe': lambda a: R('Центрифуга Forestry', a[0], a[1]),
    'Carpenter.addRecipe': lambda a: R('Плотник', a[0], a[1:3]),
    'MTReactionChamber.addRecipe': lambda a: R('Реакционная камера', a[0], a[1:]),
    'MTReactionChamber.addRecipeWithGas': lambda a: R('Реакционная камера', a[0:2], a[2:]),
    'MTReactionChamber.addRecipeWithFluid': lambda a: R('Реакционная камера', a[0:2], a[2:]),
    'MTIndustrialMixer.add': lambda a: R('Промышленный смеситель', a[0], a[1]),
    'MTProceduralAssembler.addRecipe': lambda a: R('Процедурный сборщик', a[0], [a[2], a[3] if len(a) > 3 else []], num(a[1])),
    'MTLiquidNeutron.add': lambda a: R('Жидкий нейтроний', a[0], a[1]),
    'MTBeeFactory.addRecipe': lambda a: R('Пчелиная фабрика', a[0], a[1]),
    'MTAlloyChamber.addRecipe': lambda a: R('Камера сплавов', a[0], a[1:3]),
    'MTAlloyFurnace.addRecipe': lambda a: R('Печь сплавов', a[0], a[1], num(a[2]) if len(a) > 2 else None),
    'MTEnrichmentChamber.add': lambda a: R('Обогатитель', a[0], a[1]),
    'MTChemicalOxidizer.addFluidRecipe': lambda a: R('Химический окислитель', a[0], a[1]),
    'MTChemicalOxidizer.addGasRecipe': lambda a: R('Химический окислитель', a[0], a[1]),
    'MTMatterSolid.add': lambda a: R(f'Твёрдая материя (тир {a[0]})', a[2], a[1], num(a[3])),
    'MTSoulTransformer.addRecipe': lambda a: R('Преобразователь душ', a[0], a[1]),
    'MTHemontransmutator.addRecipe': lambda a: R('Гемонтрансмутатор', a[3], a[0:3]),
    'MTHemontransmutator.addBottlingRecipe': lambda a: R('Гемонтрансмутатор', a[2], a[0:2]),
    'MTEntropyReactor.addBottlingRecipe': lambda a: R('Энтропийный реактор', a[2], a[0]),
    'QED.addShapedRecipe': lambda a: R('QED', a[0], a[1]),
    'MTAdvancedQED.addShaped': lambda a: R('Продвинутый QED', a[0], a[1]),
    'MTCrystallizationCooling.add': lambda a: R('Кристаллизационное охлаждение', a[0], a[1]),
    'MTCrystalGrowthChamber.add': lambda a: R('Камера роста кристаллов', a[0], a[1]),
    'MTCrystalChargingChamber.add': lambda a: R('Камера зарядки кристаллов', a[0], a[1]),
    'MTChemicalFiller.addGasRecipe': lambda a: R('Химический наполнитель', a[0], a[1:]),
    'MTChemicalFiller.addFluidRecipe': lambda a: R('Химический наполнитель', a[0], a[1:]),
    'MTBlastFurnace.addRecipe': lambda a: R('Доменная печь', [a[0], a[3] if len(a) > 3 else []], a[1]),
    'MTHardeningBath.addRecipe': lambda a: R('Закалочная ванна', a[0], a[1]),
    'MTCauldron.addRecipe': lambda a: R('Котёл', a[0], a[1]),
    'MTElectrolyticSeparator.addRecipeSplitFluid': lambda a: R('Электролитический сепаратор', a[0:2], a[2]),
    'MTElectrolyticSeparator.addRecipeSplitGas': lambda a: R('Электролитический сепаратор', a[0:2], a[2]),
    'MTElectrolyticSeparator.addRecipeConvertGas': lambda a: R('Электролитический сепаратор', a[0], a[1]),
    'MetalPressTweaker.addRecipe': lambda a: R('Пресс Techguns', a[2], a[0:2]),
    'ChemLabTweaker.addRecipe': lambda a: R('Химлаборатория Techguns', [a[6], a[7]],
                                            [_amt(a[0], a[1]), _amt(a[2], a[3]), a[4]]),
    'MTDistillationColumn.addRecipe': lambda a: R('Дистилляционная колонна', a[1], a[0]),
    'MTOutworldExchange.add': lambda a: R('Иномировой обмен', a[2], a[0:2]),
    'MTEnergonSynthesizer.add': lambda a: R('Синтезатор энергона', a[0], a[1], num(a[-1])),
    'MTEnergonConverter.add': lambda a: R('Конвертер энергона', a[1], a[0], num(a[2])),
    'MTSteamBoiler.addRecipe': lambda a: R('Паровой котёл', a[0], a[1]),
    'MTCondenser.add': lambda a: R('Конденсатор', a[1], a[0]),
    'MTRotaryCondensentrator.addEvaporationRecipe': lambda a: R('Ротационный конденсатор', a[0], a[1]),
    'MTRotaryCondensentrator.addCondensationRecipe': lambda a: R('Ротационный конденсатор', a[0], a[1]),
    'MTAmbientGasCollector.setRecipe': lambda a: R('Сборщик газа из воздуха', a[0], [], kind='source'),
    'Squeezer.addRecipe': lambda a: R('Сжиматель', a[0:2], a[2]),
    'OreWasher.addRecipe': lambda a: R('Рудопромывочная машина', a[0], a[1]),
    'Drying.addRecipe': lambda a: R('Сушилка', a[1], a[0]),
    'Still.addRecipe': lambda a: R('Перегонный куб', a[0], a[1]),
    'ThermionicFabricator.addCast': lambda a: R('Термоионный фабрикатор', a[0], a[1]),
    # источники без входов
    'Replicator.add': lambda a: R('Репликатор', a[0], [], kind='source', note=f'стоимость {a[1]}'),
    'MTLaserDrill.addOre': lambda a: R('Лазерный бур', a[0], [], kind='source', note=f'вес {a[1]}'),
    'MTLaserDrill.addPreferred': None,  # дублирует addOre, это вес для линзы
    'SpawnTrickTweaker.addLoot': lambda a: R(f'Дроп с моба {a[0]}', a[1], [], kind='drop', note=f'шанс {a[2]}'),
    'MTSubjectCase.addDrop': lambda a: R(f'Кейс {a[0]}', a[1], [], kind='case', note=f'вес {a[2]}'),
    'MineTweakerAirdrop.addLegendaryDrop': lambda a: R('Легендарный аирдроп', a[0], [], kind='case', note=f'вес {a[1]}'),
    'MineTweakerAirdrop.addDefaultDrop': lambda a: R('Обычный аирдроп', a[0], [], kind='case', note=f'вес {a[1]}'),
}


def _amt(it, n):
    if isinstance(it, Item) and isinstance(n, int):
        it.amount = n
    return it


def handler_for(name):
    name = name.split('/')[-1].replace('MineTweakerAPI.', '')
    if name in H:
        return name, H[name]
    return name, None


def load(paths=None):
    paths = paths or sorted(glob.glob(os.path.join(ROOT, 'data/recipes/*.zs')))
    recipes, skipped, errors = [], defaultdict(int), []
    for f in paths:
        for n, line in enumerate(open(f, encoding='utf8'), 1):
            if not line.strip() or line.startswith('//'):
                continue
            head = re.match(r'[\w/.$]+', line)
            if not head:
                continue
            name, h = handler_for(re.sub(r'\(.*', '', head.group(0)))
            if h is None:
                skipped[name] += 1
                continue
            # addChestLoot идёт через vanilla.getLoot().addChestLoot(...)
            try:
                c = parse_line(line)
                r = h(c.args)
            except Exception as e:  # noqa
                errors.append((os.path.basename(f), n, str(e)[:120]))
                continue
            r['file'] = os.path.basename(f)
            r['line'] = n
            recipes.append(r)
    # сундуки
    for f in paths:
        for n, line in enumerate(open(f, encoding='utf8'), 1):
            if '.addChestLoot(' in line:
                try:
                    c = parse_line(line)
                    r = R(f'Сундук {c.args[1]}', c.args[2], [], kind='case')
                    r['file'], r['line'] = os.path.basename(f), n
                    recipes.append(r)
                except Exception as e:  # noqa
                    errors.append((os.path.basename(f), n, str(e)[:120]))
    return recipes, skipped, errors


def to_json(r):
    def it(i):
        d = {'id': i.key(), 'n': i.amount}
        if i.chance is not None:
            d['chance'] = i.chance
        return d
    out = dict(r)
    out['outs'] = [it(i) for i in r['outs'] if i.amount != 0]
    out['ins'] = [it(i) for i in r['ins']]
    out['catalysts'] = [it(i) for i in r['catalysts']]
    return out


def merge_ins(lst):
    acc = {}
    for i in lst:
        n = i['n'] if isinstance(i['n'], (int, float)) else 1
        acc[i['id']] = acc.get(i['id'], 0) + n
    return acc


# ---------------------------------------------------------------- словарь руд

ORE_MANUAL = {
    'blockCosmicNeutronium': 'Avaritia:Resource_Block', 'ingotCosmicNeutronium': 'Avaritia:Resource:4',
    'blockInfinity': 'Avaritia:Resource_Block:1', 'ingotInfinity': 'Avaritia:Resource:6',
    'ingotCrystalMatrix': 'Avaritia:Resource:1', 'blockCrystalMatrix': 'Avaritia:Crystal_Matrix',
    'ingotDraconium': 'lolidimensions:draconium_ingot', 'blockDraconium': 'lolidimensions:draconium_block',
    'ingotDraconiumAwakened': 'lolidimensions:awakened_draconium_ingot',
    'blockDraconiumAwakened': 'lolidimensions:awakened_draconium_block',
    'ingotUnstable': 'ExtraUtilities:unstableingot', 'ingotFairy': 'ExtraTiC:funStuffIngot',
    'ingotPokefennium': 'ExtraTiC:funStuffIngot:1', 'gemDiamond': 'uniresources:diamond',
    'gemEmerald': 'uniresources:emerald', 'emerald': 'uniresources:emerald',
}


def ore_alias_recipes(all_ids):
    """ore:xxx -> конкретный предмет: явная таблица, затем uniresources:xxx, если он встречается в рецептах."""
    out = []
    for oid in sorted(i for i in all_ids if i.startswith('ore:')):
        name = oid[4:]
        tgt = ORE_MANUAL.get(name)
        if tgt is None and f'uniresources:{name}' in all_ids:
            tgt = f'uniresources:{name}'
        if tgt:
            r = dict(machine='Словарь руд', outs=[{'id': oid, 'n': 1}], ins=[{'id': tgt, 'n': 1}], energy=None,
                     kind='craft', note=None, catalysts=[], file='', line=0)
            out.append(r)
    return out


# ---------------------------------------------------------------- граф

# То, что берётся бесконечно и бесплатно (помпы, воздух, генератор булыжника)
FREE = {'liquid:water', 'liquid:fresh_water', 'gas:ambient', 'minecraft:cobblestone', 'ore:cobblestone',
        'liquid:lava'}

KIND_RANK = {'craft': 0, 'source': 1, 'drop': 2, 'case': 3}
MACHINE_PENALTY = {'Печь': 1, 'Дробитель': 2, 'Экстрактор': 2}


class Graph:
    def __init__(self, recipes):
        self.recipes = [to_json(r) for r in recipes]
        ids = {i['id'] for r in self.recipes for i in r['outs'] + r['ins']}
        self.recipes += ore_alias_recipes(ids)
        self.by_out = defaultdict(list)
        self.by_in = defaultdict(list)
        for idx, r in enumerate(self.recipes):
            r['idx'] = idx
            r['in_map'] = merge_ins(r['ins'])
            for o in r['outs']:
                self.by_out[o['id']].append(r)
            for i in r['in_map']:
                self.by_in[i].append(r)
        self._mark_unpacking()
        self.memo = {}

    def _mark_unpacking(self):
        """Разборка блока на слитки и подобные обратные крафты помечаются, чтобы дерево не ходило по кругу."""
        for r in self.recipes:
            r['unpack'] = False
            if r['kind'] != 'craft' or len(r['in_map']) != 1 or len(r['outs']) != 1:
                continue
            (src, n_in), = r['in_map'].items()
            o = r['outs'][0]
            n_out = o['n'] if isinstance(o['n'], (int, float)) else 1
            back = [b for b in self.by_out.get(src, []) if b['kind'] == 'craft' and set(b['in_map']) == {o['id']}]
            if back and n_out > n_in:
                r['unpack'] = True

    def options(self, item):
        rs = [r for r in self.by_out.get(item, []) if not r['unpack']]
        return sorted(rs, key=lambda r: (KIND_RANK[r['kind']], MACHINE_PENALTY.get(r['machine'], 0), r['idx']))

    def out_count(self, r, item):
        for o in r['outs']:
            if o['id'] == item:
                return o['n'] if isinstance(o['n'], (int, float)) and o['n'] > 0 else 1
        return 1

    def leaf_weight(self, item, r=None):
        """Условная цена одной штуки предмета, который берётся не крафтом."""
        if item in FREE:
            return 1e-9
        if item.startswith(('liquid:', 'gas:')):
            base = 0.001  # 1 mB
        else:
            base = 1.0
        if r is None:
            return base * 2  # рецепта на сервере нет: мод, мир или магазин
        k = r['kind']
        if k == 'source':
            return base
        if k == 'drop':
            m = r['machine']
            return base * (300 if 'boss' in m else 3)
        return base * 1e6  # кейсы и аирдропы как основной путь не рассматриваем

    def compute_costs(self, passes=60):
        INF = float('inf')
        items = set(self.by_out) | set(self.by_in)
        cost = {}
        for it in items:
            srcs = [r for r in self.by_out.get(it, []) if r['kind'] not in ('craft', 'case')]
            craftable = any(r['kind'] == 'craft' and not r['unpack'] for r in self.by_out.get(it, []))
            cost[it] = min([self.leaf_weight(it, r) for r in srcs] or [INF if craftable else self.leaf_weight(it)])
        best = {}
        self._relax(cost, best, passes)
        # предметы, у которых все рецепты замкнуты в круг: считаем их листьями (берутся вне скриптов)
        self.unresolved = set()
        for _ in range(20):
            U = {it for it, c in cost.items() if c == INF}
            if not U:
                break
            cyc = self._cycle_items(U)
            if not cyc:
                # нет кругов: значит, вход без рецепта где-то потерян; помечаем самые нижние предметы
                cyc = {u for u in U if not any(i in U for r in self.by_out.get(u, []) if r['kind'] == 'craft'
                                               for i in r['in_map'])} or U
            for it in cyc:
                cost[it] = self.leaf_weight(it) * 10
            self.unresolved |= cyc
            self._relax(cost, best, passes)
        self.cost, self.best_craft = cost, best

    def _cycle_items(self, U):
        """Предметы из U, лежащие на круге крафтов внутри U (сильно связные компоненты)."""
        adj = {u: set() for u in U}
        for u in U:
            for r in self.by_out.get(u, []):
                if r['kind'] == 'craft' and not r['unpack']:
                    adj[u] |= {i for i in r['in_map'] if i in U}
        index, low, stack, on, out, cnt = {}, {}, [], set(), set(), [0]
        sys.setrecursionlimit(100000)

        def sc(v):
            index[v] = low[v] = cnt[0]
            cnt[0] += 1
            stack.append(v)
            on.add(v)
            for w in adj[v]:
                if w not in index:
                    sc(w)
                    low[v] = min(low[v], low[w])
                elif w in on:
                    low[v] = min(low[v], index[w])
            if low[v] == index[v]:
                comp = []
                while True:
                    w = stack.pop()
                    on.discard(w)
                    comp.append(w)
                    if w == v:
                        break
                if len(comp) > 1 or v in adj[v]:
                    out.update(comp)
        for v in U:
            if v not in index:
                sc(v)
        return out

    def _relax(self, cost, best, passes):
        INF = float('inf')
        for _ in range(passes):
            changed = False
            for r in self.recipes:
                if r['kind'] != 'craft' or r['unpack']:
                    continue
                tot = 0.0
                for i, n in r['in_map'].items():
                    c = cost.get(i, INF)
                    if c == INF:
                        tot = INF
                        break
                    tot += n * c
                if tot == INF:
                    continue
                for o in r['outs']:
                    n_out = o['n'] if isinstance(o['n'], (int, float)) and o['n'] > 0 else 1
                    v = tot / n_out
                    if v < cost.get(o['id'], INF) * 0.999999:
                        cost[o['id']] = v
                        best[o['id']] = r
                        changed = True
            if not changed:
                break

    def choose(self, item, visiting=None, memo=None):
        """Самый дешёвый способ получить предмет по условным ценам листьев (None, если рецепта нет)."""
        if not hasattr(self, 'cost'):
            self.compute_costs()
        if item in self.best_craft:
            return self.best_craft[item]
        srcs = [r for r in self.by_out.get(item, []) if r['kind'] not in ('craft', 'case')]
        if srcs:
            return min(srcs, key=lambda r: self.leaf_weight(item, r))
        return None

    def demand(self, item, qty=1.0, stop=()):
        """Сколько каждого предмета нужно на qty штук item. Возвращает (qty_by_item, crafts_by_item)."""
        self.memo = getattr(self, 'memo', {})
        order, seen = [], set()

        def visit(x):
            if x in seen:
                return
            seen.add(x)
            r = self.choose(x)
            if r is not None and r['kind'] == 'craft' and x not in stop:
                for i in r['in_map']:
                    visit(i)
            order.append(x)
        visit(item)
        need = defaultdict(float)
        need[item] = qty
        crafts = {}
        for x in reversed(order):
            r = self.choose(x)
            if r is None or r['kind'] != 'craft' or x in stop:
                continue
            c = need[x] / self.out_count(r, x)
            crafts[x] = c
            for i, n in r['in_map'].items():
                need[i] += n * c
        return need, crafts

    def leaf_kind(self, item):
        r = self.choose(item)
        if r is None:
            return 'нет серверного рецепта'
        if r['kind'] == 'craft' and item in self.unresolved and self.best_craft.get(item) is None:
            return 'крафт по кругу'
        if r['kind'] == 'case':
            return 'нет серверного рецепта'  # кейсы и аирдропы не считаем способом получения
        return r['machine'] if r['kind'] != 'craft' else None


# ---------------------------------------------------------------- названия

AVARITIA_RESOURCE = ['Алмазная решётка', 'Кристально-матричный слиток', 'Груда нейтрония', 'Самородок нейтрония',
                     'Нейтрониевый слиток', 'Катализатор бесконечности', 'Слиток бесконечности', 'Фрагмент пластинки',
                     'Звёздное топливо', 'Нейтрониевая шестерня']
FIXED_NAMES = {
    'Avaritia:Resource_Block': 'Блок нейтрония', 'Avaritia:Resource_Block:1': 'Блок бесконечности',
    'Avaritia:Crystal_Matrix': 'Кристально-матричный блок', 'Avaritia:Cosmic_Meatballs': 'Космические фрикадельки',
    'Avaritia:Ultimate_Stew': 'Ультимативное рагу', 'eternalsingularity:eternal_singularity': 'Вечная сингулярность',
    'ExtraTiC:funStuffIngot': 'Волшебный слиток', 'ExtraTiC:funStuffIngot:1': 'Покфениумный слиток',
    'ExtraTiC:funStuffIngot:2': 'Слиток красного аурума',
    'lolienergistics:0qgen': 'Квантовый генератор', 'lolienergistics:1qgen': 'Параллактический квантовый генератор',
    'lolienergistics:2qgen': 'Ионный квантовый генератор', 'lolienergistics:3qgen': 'ФКВГ (Ультимативный фиолетовый квантовый генератор)',
    'lolienergyrelics:ItemDemonSwordInfinity': 'Демонический меч бесконечности',
    'lolienergyrelics:ItemDemonHelmetInfinity': 'Демонический шлем бесконечности',
    'lolienergyrelics:ItemDemonChestInfinity': 'Демонический нагрудник бесконечности',
    'lolienergyrelics:ItemDemonPantsInfinity': 'Демонические поножи бесконечности',
    'lolienergyrelics:ItemDemonShoesInfinity': 'Демонические ботинки бесконечности',
}
for _i, _n in enumerate(AVARITIA_RESOURCE):
    FIXED_NAMES[f'Avaritia:Resource:{_i}' if _i else 'Avaritia:Resource'] = _n


def load_names(assets_dirs):
    lang = {}
    for d in assets_dirs:
        for p in sorted(glob.glob(os.path.join(d, '**/lang/*.lang'), recursive=True), key=lambda p: 'ru_RU' in p):
            if not re.search(r'(ru_RU|en_US)\.lang$|ru_RU\.properties$', p):
                continue
            for ln in open(p, encoding='utf8', errors='replace'):
                if '=' in ln and not ln.startswith('#'):
                    k, v = ln.rstrip('\r\n').split('=', 1)
                    if 'en_US' in p and k in lang and re.search('[а-яА-Я]', lang[k]):
                        continue
                    lang[k] = v
    names = dict(FIXED_NAMES)
    saved = os.path.join(ROOT, 'data/item_names.json')
    if os.path.exists(saved):
        for k, v in json.load(open(saved, encoding='utf8')).items():
            names.setdefault(k, v)
    for d in assets_dirs:  # пары id -> имя из констант классов (имена, зашитые в код модов)
        cp = os.path.join(d, 'cpnames.json')
        if os.path.exists(cp):
            for k, v in json.load(open(cp, encoding='utf8')).items():
                lang.setdefault(f'cp.{k}', v)
    for f in glob.glob(os.path.join(ROOT, 'data/recipes/*.zs')):
        for ln in open(f, encoding='utf8'):
            m = re.match(r"MTSingularities\.add\((\d+), '[^']*', '[^']*', '([^']*)'", ln)
            if m:
                k = 'lolisingularity:singularity' + (f':{m.group(1)}' if m.group(1) != '0' else '')
                names[k] = m.group(2)
            m = re.match(r"NEI\.overrideName\(<([^>]+)>(?:\.withTag\(\{Name: '([^']+)'\}\))?, (.*)\)$", ln.strip())
            if m:
                txt = ''.join(re.findall(r"'([^']*)'", m.group(3)))
                txt = re.sub('§.', '', txt).replace('Душа', 'Душа: ', 1)
                k = m.group(1) + ('{' + m.group(2) + '}' if m.group(2) else '')
                names[k] = txt.strip()
    return lang, names


def name_of(item, lang, names):
    if item in names:
        return names[item]
    if item.startswith('ore:') and item[4:] in ORE_MANUAL:
        return name_of(ORE_MANUAL[item[4:]], lang, names)
    if item.startswith('appliedenergistics2:'):
        n = item.split(':')[1]
        for k in (f'{n.split(".")[0]}.appliedenergistics2.{n.split(".", 1)[-1]}.name',):
            if k in lang:
                return lang[k]
    if item.startswith('IC2:'):
        n = item.split(':')[1]
        if f'ic2.{n}' in lang:
            return lang[f'ic2.{n}']
    if item.startswith('Avaritia:'):
        n = item.split(':')[1].lower()
        for k in (f'item.avaritia_{n}.name', f'item.avaritia:{n}.name', f'tile.avaritia_{n}.name'):
            if k in lang:
                return lang[k]
    if item.startswith(('ore:', 'liquid:', 'gas:')):
        kind, n = item.split(':', 1)
        for k in (f'fluid.{n}', f'fluid.tile.{n}', f'{n}', f'gas.{n}'):
            if k in lang:
                return lang[k]
        return item
    base = re.sub(r'\{.*\}$', '', item)
    parts = base.split(':')
    name = parts[1]
    meta = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
    keys = [f'{parts[0]}:item.{name}.name', f'{parts[0]}:tile.{name}.name', f'item.{name}.name', f'tile.{name}.name',
            f'{parts[0]}:item.{name}_{meta + 1}.name', f'{parts[0]}:item.{name}{meta}.name']
    for k in keys:
        if k in lang and (meta == 0 or k.endswith(f'_{meta + 1}.name') or k.endswith(f'{meta}.name')):
            return lang[k]
    if f'{parts[0]}:item.{name}X{meta + 1}.name' in lang:
        return lang[f'{parts[0]}:item.{name}X{meta + 1}.name']
    if f'item.{name}X{meta + 1}.name' in lang:
        return lang[f'item.{name}X{meta + 1}.name']
    cands = [v for k, v in lang.items() if k.endswith('.' + name + '.name') or k.endswith(':' + name + '.name')
             or k == f'item.{name}' or k == f'tile.{name}']
    cyr = [c for c in cands if re.search('[а-яА-Я]', c)]
    if meta == 0 and (cyr or cands):
        return (cyr or cands)[0]
    if meta == 0 and f'cp.{name}' in lang:
        return lang[f'cp.{name}']
    if parts[0] == 'uniresources':
        m = re.match(r'(ingot|block|plate|dust|nugget|pile|gem|gear|rod|crushed)([A-Z]\w*)$', name)
        if m:
            metal = UNI_METALS.get(m.group(2), m.group(2))
            return f'{UNI_FORMS[m.group(1)]} ({metal})'
    return base


UNI_FORMS = {'ingot': 'Слиток', 'block': 'Блок', 'plate': 'Пластина', 'dust': 'Пыль', 'nugget': 'Самородок', 'pile': 'Груда',
             'gem': 'Самоцвет', 'gear': 'Шестерня', 'rod': 'Стержень', 'crushed': 'Измельчённая руда'}
UNI_METALS = {
    'Steel': 'сталь', 'Bronze': 'бронза', 'Iron': 'железо', 'Tin': 'олово', 'Copper': 'медь', 'Lead': 'свинец', 'Silver': 'серебро',
    'Osmium': 'осмий', 'Nickel': 'никель', 'Invar': 'инвар', 'Electrum': 'электрум', 'Aluminum': 'алюминий', 'Uranium': 'уран',
    'RefinedObsidian': 'очищенный обсидиан', 'Obsidian': 'обсидиан', 'Alumite': 'алюмит', 'Voidite': 'войдит', 'PigIron': 'чугун',
    'Sebastyanite': 'себастьянит', 'Skyfiry': 'скайфарий', 'Radvirium': 'радвириум', 'AluminumBrass': 'алюминиевая латунь',
    'Charcoal': 'древесный уголь', 'Redstone': 'редстоун', 'Mana': 'мана', 'Lumium': 'люмиум', 'Mithril': 'мифрил', 'Fluxite': 'флюксит',
    'Constantan': 'константан', 'Gold': 'золото', 'Diamond': 'алмаз', 'Emerald': 'изумруд', 'Coal': 'уголь', 'Platinum': 'платина',
    'Iridium': 'иридий', 'Signalum': 'сигнум', 'Enderium': 'эндериум', 'Ic2Alloy': 'композит', 'Ardite': 'ардит', 'Cobalt': 'кобальт',
    'Manyullyn': 'манулин', 'Zinc': 'цинк', 'Brass': 'латунь', 'Titanium': 'титан', 'Chrome': 'хром', 'Tungsten': 'вольфрам',
    'Thorium': 'торий', 'Plutonium': 'плутоний', 'Sulfur': 'сера', 'Saltpeter': 'селитра', 'Quartz': 'кварц', 'Glowstone': 'светокамень', 'RefinedGlowstone': 'очищенный светокамень',
}


HINT_WORDS = ('Выпадает', 'Можно получить', 'Встречается', 'Растёт', 'Добывается', 'Генерация', 'Падает', 'Покупка')


def load_hints():
    """Подсказки сервера о том, откуда берётся предмет (из подсказок к предметам)."""
    hints = defaultdict(list)
    for f in glob.glob(os.path.join(ROOT, 'data/recipes/*.zs')):
        for ln in open(f, encoding='utf8'):
            m = re.match(r"IngredientTooltips\.add(?:Shift)?Tooltip\(<([^>]+)>(?:\.withTag\(\{Name: '([^']+)'\}\))?, (.*)\)\s*$", ln.strip())
            if not m:
                continue
            txt = re.sub('§.', '', ''.join(re.findall(r"'([^']*)'", m.group(3)))).strip(' ◆●✦✎')
            if any(w in txt for w in HINT_WORDS):
                k = m.group(1) + ('{' + m.group(2) + '}' if m.group(2) else '')
                parts = k.split(':')
                if len(parts) == 3 and parts[2] == '0':
                    k = ':'.join(parts[:2])
                if txt not in hints[k]:
                    hints[k].append(txt)
    return hints


def default_assets():
    return [p for p in glob.glob('/tmp/claude-0/jars/*') if os.path.isdir(p)]


def fmt_qty(q):
    if q >= 1e9:
        return f'{q / 1e9:.1f}G'
    if q >= 1e6:
        return f'{q / 1e6:.1f}M'
    if q >= 1e4:
        return f'{q / 1e3:.0f}k'
    if q >= 10:
        return f'{q:.0f}'
    return f'{q:.2g}'


def print_tree(g, item, lang, names, depth, qty=1.0, ind=0, seen=None):
    """Дерево с количеством на этом пути (не суммарным)."""
    seen = seen if seen is not None else set()
    r = g.choose(item)
    lk = g.leaf_kind(item)
    extra = f"  [{r['machine']}]" if lk is None else f"  ({lk})"
    rep = ' (раскрыт выше)' if item in seen and lk is None else ''
    print('  ' * ind + f"{fmt_qty(qty)} × {name_of(item, lang, names)} <{item}>{extra}{rep}")
    if lk is None and not rep:
        seen.add(item)
        if ind + 1 < depth:
            c = qty / g.out_count(r, item)
            for i, n in r['in_map'].items():
                print_tree(g, i, lang, names, depth, n * c, ind + 1, seen)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['dump', 'tree', 'leaves', 'uses', 'stats'])
    ap.add_argument('arg', nargs='?')
    ap.add_argument('--depth', type=int, default=4)
    ap.add_argument('--assets', nargs='*', default=None)
    a = ap.parse_args()
    recipes, skipped, errors = load()
    g = Graph(recipes)
    lang, names = load_names(a.assets if a.assets is not None else default_assets())
    item = a.arg.strip('<>') if a.arg else None
    if a.cmd == 'stats':
        print('рецептов:', len(g.recipes), 'ошибок разбора:', len(errors))
        for e in errors[:20]:
            print('  ', e)
        print('пропущены вызовы:', dict(sorted(skipped.items(), key=lambda x: -x[1])))
    elif a.cmd == 'dump':
        keep = [{k: v for k, v in r.items() if k not in ('in_map', 'idx')} for r in g.recipes]
        json.dump(keep, open(a.arg, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
        print('записано', len(keep), 'рецептов в', a.arg)
    elif a.cmd == 'tree':
        print_tree(g, item, lang, names, a.depth)
    elif a.cmd == 'leaves':
        need, crafts = g.demand(item)
        hints = load_hints()
        for k, q in sorted(need.items(), key=lambda x: -x[1]):
            if k not in crafts:
                h = ('; ' + ' / '.join(hints[k])[:160]) if hints.get(k) else ''
                print(f"{fmt_qty(q):>8}  {name_of(k, lang, names)} <{k}>  [{g.leaf_kind(k)}{h}]")
    elif a.cmd == 'uses':
        for r in g.by_in.get(item, []):
            print(r['machine'], '->', ', '.join(f"{name_of(o['id'], lang, names)} <{o['id']}>" for o in r['outs']))


if __name__ == '__main__':
    main()
