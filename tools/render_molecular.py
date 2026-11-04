"""Рисует все рецепты молекулярного преобразователя (MTMolecular.add) из data/recipes одной картинкой.

    python3 tools/render_molecular.py out.png --jars <папка с распакованными assets модов>
"""
import argparse, glob, os, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# id предмета -> (путь к текстуре внутри распакованных модов, русское название)
ITEMS = {
    'Avaritia:Resource:2': ('Avaritia-1.13/assets/avaritia/textures/items/resource_neutron_pile.png', 'Пылинка нейтрония'),
    'ExtraUtilities:cobblestone_compressed:8': ('client/assets/minecraft/textures/blocks/dirt.png', 'Сжатая земля'),
    'Forestry:fertilizerCompound': ('forestry_1.7.10-4.2.16.64/assets/forestry/textures/items/fertilizerCompound.png', 'Минеральное удобрение'),
    'IC2:itemCrushedOre': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemCrushedIronOre.png', 'Измельчённая железная руда'),
    'IC2:itemCrushedOre:1': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemCrushedCopperOre.png', 'Измельчённая медная руда'),
    'IC2:itemCrushedOre:2': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemCrushedGoldOre.png', 'Измельчённая золотая руда'),
    'IC2:itemCrushedOre:3': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemCrushedTinOre.png', 'Измельчённая оловянная руда'),
    'IC2:itemOreIridium': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/itemOreIridium.png', 'Иридиевая руда'),
    'IC2:itemShardIridium': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/itemShardIridium.png', 'Иридиевый осколок'),
    'appliedenergistics2:item.ItemCrystalSeed': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemCrystalSeed.Certus.png', 'Семя истинного кварца'),
    'appliedenergistics2:item.ItemCrystalSeed:600': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemCrystalSeed.Nether.png', 'Семя кварца Нижнего мира'),
    'appliedenergistics2:item.ItemCrystalSeed:1200': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemCrystalSeed.Fluix.png', 'Изменчивое семя'),
    'appliedenergistics2:item.ItemMultiMaterial': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemMaterial.CertusQuartzCrystal.png', 'Кристалл истинного кварца'),
    'appliedenergistics2:item.ItemMultiMaterial:1': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemMaterial.CertusQuartzCrystalCharged.png', 'Заряженный кристалл истинного кварца'),
    'appliedenergistics2:item.ItemMultiMaterial:10': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemMaterial.PurifiedCertusQuartzCrystal.png', 'Чистый кристалл истинного кварца'),
    'appliedenergistics2:item.ItemMultiMaterial:11': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemMaterial.PurifiedNetherQuartzCrystal.png', 'Чистый кристалл кварца Нижнего мира'),
    'appliedenergistics2:item.ItemMultiMaterial:12': ('appliedenergistics2-rv3-beta-6/assets/appliedenergistics2/textures/items/ItemMaterial.PurifiedFluixCrystal.png', 'Чистый изменчивый кристалл'),
    'lolidimensions:dragon_heart': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/items/dragon_heart.png', 'Сердце дракона'),
    'lolidimensions:glowstone': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/blocks/glowstone.png', 'Светокамень'),
    'lolidimensions:glowstone_dust': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/items/glowstone_dust.png', 'Светопыль'),
    'lolidimensions:hell_brick': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/blocks/hell_brick.png', 'Адский кирпич'),
    'lolidimensions:hell_quartz': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/items/hell_quartz.png', 'Адский кварц'),
    'lolidimensions:hell_rock': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/blocks/hell_rock.png', 'Адский камень'),
    'lolidimensions:hell_star': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/items/hell_star.png', 'Адская звезда'),
    'lolidimensions:soul_sand': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/blocks/soul_sand.png', 'Песок душ'),
    'lolidimensions:wither_skeleton_skull': ('LoliDimensions-1.7.10-client/assets/lolidimensions/textures/blocks/wither_skeleton_skull.png', 'Череп скелета-иссушителя'),
    'lolienergistics:infinity_dust': ('LoliEnergistics-1.7.10-client/assets/lolienergistics/textures/items/infinity_dust.png', 'Инфинити пыль'),
    'lolienergistics:irradiant_uranium': ('LoliEnergistics-1.7.10-client/assets/lolienergistics/textures/items/asp/irradiant_uranium.png', 'Излучающий уран'),
    'lolienergistics:sunnarium': ('LoliEnergistics-1.7.10-client/assets/lolienergistics/textures/items/asp/sunnarium.png', 'Саннариум'),
    'lolienergistics:sunnarium_part': ('LoliEnergistics-1.7.10-client/assets/lolienergistics/textures/items/asp/sunnarium_part.png', 'Часть саннариума'),
    'lolienergistics:uran_ingot': ('LoliEnergistics-1.7.10-client/assets/lolienergistics/textures/items/asp/uran_ingot.png', 'Слиток урана'),
    'lolienergyrelics:demonic_infinity_dust': ('LoliEnergyRelics-1.7.10-client/assets/energyrelics/textures/items/consumable/demonic_infinity_dust.png', 'Демоническая пыль бесконечности'),
    'minecraft:clay': ('client/assets/minecraft/textures/blocks/clay.png', 'Блок глины'),
    'minecraft:dirt': ('client/assets/minecraft/textures/blocks/dirt.png', 'Земля'),
    'minecraft:dragon_egg': ('client/assets/minecraft/textures/blocks/dragon_egg.png', 'Яйцо дракона'),
    'minecraft:emerald_block': ('client/assets/minecraft/textures/blocks/emerald_block.png', 'Изумрудный блок'),
    'minecraft:gold_block': ('client/assets/minecraft/textures/blocks/gold_block.png', 'Золотой блок'),
    'minecraft:gold_ingot': ('client/assets/minecraft/textures/items/gold_ingot.png', 'Золотой слиток'),
    'minecraft:iron_block': ('client/assets/minecraft/textures/blocks/iron_block.png', 'Железный блок'),
    'minecraft:iron_ingot': ('client/assets/minecraft/textures/items/iron_ingot.png', 'Железный слиток'),
    'minecraft:lapis_block': ('client/assets/minecraft/textures/blocks/lapis_block.png', 'Лазуритовый блок'),
    'minecraft:redstone_block': ('client/assets/minecraft/textures/blocks/redstone_block.png', 'Блок красного камня'),
    'minecraft:spawn_egg:120': ('client/assets/minecraft/textures/items/spawn_egg.png', 'Яйцо призыва жителя'),
    'minecraft:wool:4': ('client/assets/minecraft/textures/blocks/wool_colored_yellow.png', 'Жёлтая шерсть'),
    'minecraft:wool:7': ('client/assets/minecraft/textures/blocks/wool_colored_gray.png', 'Серая шерсть'),
    'minecraft:wool:8': ('client/assets/minecraft/textures/blocks/wool_colored_silver.png', 'Светло-серая шерсть'),
    'minecraft:wool:9': ('client/assets/minecraft/textures/blocks/wool_colored_cyan.png', 'Бирюзовая шерсть'),
    'minecraft:wool:11': ('client/assets/minecraft/textures/blocks/wool_colored_blue.png', 'Синяя шерсть'),
    'minecraft:wool:14': ('client/assets/minecraft/textures/blocks/wool_colored_red.png', 'Красная шерсть'),
    'uniresources:blockAluminum': ('client/assets/minecraft/textures/blocks/iron_block.png', 'Алюминиевый блок'),
    'uniresources:blockCopper': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/blocks/storage/Block_Copper.png', 'Медный блок'),
    'uniresources:blockNickel': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/blocks/storage/Block_Nickel.png', 'Никелевый блок'),
    'uniresources:blockOsmium': ('Mekanism-1.7.10-9.1.1.1031/assets/mekanism/textures/blocks/OsmiumBlock.png', 'Осмиевый блок'),
    'uniresources:blockSilver': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/blocks/storage/Block_Silver.png', 'Серебряный блок'),
    'uniresources:blockTin': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/blocks/storage/Block_Tin.png', 'Оловянный блок'),
    'uniresources:dustDiamond': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemDustdiamond.png', 'Алмазная пыль'),
    'uniresources:dustPlatinum': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/items/material/DustPlatinum.png', 'Платиновая пыль'),
    'uniresources:ingotCopper': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/items/material/IngotCopper.png', 'Медный слиток'),
    'uniresources:ingotNickel': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/items/material/IngotNickel.png', 'Никелевый слиток'),
    'uniresources:ingotSilver': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/items/material/IngotSilver.png', 'Серебряный слиток'),
    'uniresources:ingotTin': ('ThermalFoundation-_1.7.10_1.2.6-118/assets/thermalfoundation/textures/items/material/IngotTin.png', 'Оловянный слиток'),
    'uniresources:plateCopper': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemPlateCopper.png', 'Медная пластина'),
    'uniresources:plateTin': ('industrialcraft-2-2.2.827-experimental/assets/ic2/textures/items/resources/itemPlateTin.png', 'Оловянная пластина'),
    'universalsingularities:universal.extraPlanets.singularity:2': ('Avaritia-1.13/assets/avaritia/textures/items/singularity.png', 'Сингулярность Extra Planets №2'),
}


def eu(v):
    v = float(v)
    for k, s in ((1e9, 'G'), (1e6, 'M'), (1e3, 'k')):
        if v >= k * 0.9999:
            x = v / k
            return (f'{x:.0f}' if abs(x - round(x)) < 0.01 else f'{x:.1f}'.rstrip('0').rstrip('.')) + s
    return f'{v:.0f}'


def parse():
    rx = re.compile(r'MTMolecular\.add\(<([^>]+)>(?:\.withAmount\((\d+)\))?, <([^>]+)>(?:\.withAmount\((\d+)\))?, ([\d.E]+)\)')
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'data/recipes/*.zs'))):
        for ln in open(f, encoding='utf8'):
            m = rx.match(ln.strip())
            if m:
                a, an, b, bn, e = m.groups()
                out.append((a, int(an or 1), b, int(bn or 1), float(e)))
    return out


def icon(jars, key, size):
    path = os.path.join(jars, ITEMS[key][0])
    im = Image.open(path).convert('RGBA')
    im = im.crop((0, 0, im.width, im.width))
    return im.resize((size, size), Image.NEAREST)


def main(out_png, jars):
    rec = sorted(parse(), key=lambda r: -r[4])
    S = 40
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
    num = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    cols, cw, ch = 2, 640, 64
    rows = (len(rec) + cols - 1) // cols
    W, H = cols * cw + 30, 80 + rows * ch + 20
    img = Image.new('RGB', (W, H), (43, 52, 66))
    d = ImageDraw.Draw(img)
    d.text((20, 16), f'Молекулярный преобразователь: {len(rec)} серверных рецептов', font=title, fill=(235, 240, 245))
    d.text((20, 48), 'Энергия на одну операцию, по убыванию. Источник: config/scripts_cache.dat', font=font, fill=(160, 175, 190))

    def slot(x, y, key, n):
        d.rounded_rectangle([x, y, x + S + 8, y + S + 8], 6, fill=(60, 72, 90))
        ic = icon(jars, key, S)
        img.paste(ic, (x + 4, y + 4), ic)
        if n > 1:
            t = str(n)
            w = d.textlength(t, font=num)
            d.text((x + S + 4 - w, y + S - 10), t, font=num, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))

    for i, (a, an, b, bn, e) in enumerate(rec):
        x, y = 15 + (i % cols) * cw, 80 + (i // cols) * ch
        d.rounded_rectangle([x, y, x + cw - 10, y + ch - 6], 8, fill=(52, 62, 78))
        slot(x + 6, y + 3, a, an)
        d.text((x + S + 20, y + 15), '→', font=title, fill=(170, 185, 200))
        slot(x + S + 50, y + 3, b, bn)
        tx = x + 2 * S + 74
        d.text((tx, y + 7), f'{an} × {ITEMS[a][1]}' if an > 1 else ITEMS[a][1], font=font, fill=(200, 210, 220))
        d.text((tx, y + 29), f'→ {bn} × {ITEMS[b][1]}' if bn > 1 else f'→ {ITEMS[b][1]}', font=bold, fill=(240, 245, 250))
        et = eu(e)
        d.text((x + cw - 20 - d.textlength(et, font=bold), y + 18), et, font=bold, fill=(110, 220, 200))
    img.save(out_png)
    print(len(rec), 'рецептов ->', out_png)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--jars', required=True)
    a = ap.parse_args()
    main(a.out, a.jars)
