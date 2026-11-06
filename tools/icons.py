"""Иконки для дашборда: текстуры предметов из jar клиента.

    python3 -I tools/icons.py      # пишет web/icons.json и web/icons_sheet.png (контактный лист для проверки)

ICONS: ключ -> конец пути текстуры внутри jar (уникальный хвост). Берётся первый кадр анимации,
картинка остаётся в родном размере и масштабируется на странице без сглаживания.
Где иконки задаются задачам и квестам, см. tools/tree.py (icon_for).
"""
import base64, io, json, os, sys, zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT = os.environ.get('HITECH_CLIENT', '/mnt/user-data/uploads/hitech')

ICONS = {
    # контрольные точки
    'me': 'appliedenergistics2/textures/blocks/BlockController.png',
    'heart_ender': 'lolidimensions/textures/items/awakened_dragon_heart.png',
    'heart_chaos': 'lolidimensions/textures/items/awakened_chaos_dragon_heart.png',
    'heart_fire': 'lolidimensions/textures/items/awakened_fire_dragon_heart.png',
    'heart_inf': 'lolidimensions/textures/items/awakened_infinity_dragon_heart.png',
    'heart_demon': 'lolidimensions/textures/items/awakened_demonic_infinity_dragon_heart.png',
    'eternal': 'eternalsingularity/textures/items/eternal_singularity.png',
    # линии автокрафта
    'pattern': 'appliedenergistics2/textures/items/ItemEncodedPattern.png',
    'plate': 'ic2/textures/items/resources/itemPlateIron.png',
    'fluidcell': 'ic2/textures/items/cell/itemFluidCell.png',
    'steel': 'mekanism/textures/blocks/SteelCasing.png',
    'molten': 'lolienergistics/textures/items/molten_spark_matter_bucket.png',
    'invar': 'thermalfoundation/textures/items/material/IngotInvar.png',
    'singularity': 'eternalsingularity/textures/items/combined_singularity_3.png',
    'tube': 'forestry/textures/items/thermionicTubes.0.png',
    'assembly': 'hielements/textures/blocks/legendary_assembly_complex.png',
    'chamber': 'mekanism/textures/blocks/chemical_injection_chamber/ChemicalInjectionChamberFrontOn.png',
    'matter': 'lolienergistics/textures/items/matters/matter_purple.png',
    'molecular': 'lolienergistics/textures/blocks/machine/MolecularX1.png',
    'blood_ender': 'lolidimensions/textures/items/dragon_blood.png',
    'blood_chaos': 'lolidimensions/textures/items/chaos_dragon_blood.png',
    'blood_fire': 'lolidimensions/textures/items/fire_dragon_blood.png',
    'blood_inf': 'lolidimensions/textures/items/infinity_dragon_blood.png',
    'blood_demon': 'lolidimensions/textures/items/demonic_infinity_dragon_blood.png',
    'crystal': 'lolienergistics/textures/blocks/machine/crystallization_cooling_complex.png',
    'misc': 'lolienergistics/textures/items/core/sparkling_core.png',
    # сборщики
    'assembler': 'appliedenergistics2/textures/blocks/BlockMolecularAssembler.png',
    'neutron_ingot': 'avaritia/textures/items/resource_neutronium_ingot.png',
    'laser': 'lolienergistics/textures/blocks/laser_box/blockBlueLaser.png',
    'alien': 'loli_dragon_might/textures/blocks/extraterrestrial_basis.png',
    # этапы плана
    'drive': 'appliedenergistics2/textures/blocks/BlockDrive.png',
    'leg_spawner': 'loli_dragon_might/textures/blocks/legendary_spawner.png',
    'spawner': 'loli_dragon_might/textures/blocks/spawner.png',
    'qgen0': 'lolienergistics/textures/blocks/0qgen.png',
    'sulfur': 'mekanism/textures/items/SulfurDust.png',
    'wither_heart': 'loli_dragon_might/textures/items/wither/wither_skeleton_heart.png',
    'neutron_comb': 'lolienergistics/textures/blocks/machine/NeutronCombiner.png',
    'pedestal': 'lolidimensions/textures/blocks/dragon_summon_pedestal.png',
    'inf_catalyst': 'avaritia/textures/items/resource_infinity_catalyst.png',
    'lightning': 'lolidimensions/textures/items/bottled_lightning.png',
    'ore': 'lolienergistics/textures/blocks/ores/ore_radvirium.png',
    'draconium': 'lolidimensions/textures/items/draconium_ingot.png',
    'loot2': 'loli_dragon_might/textures/items/looting/looting_module_2.png',
    'loot11': 'loli_dragon_might/textures/items/looting/looting_module_11.png',
    'solar': 'lolienergistics/textures/blocks/antimaterial_solar_panel_top.png',
    'inf_ingot': 'avaritia/textures/items/resource_infinity_ingot.png',
    'chaos_heart': 'lolidimensions/textures/items/chaos_dragon_heart.png',
    'luck5': 'loli_utility/textures/items/FortuneModuleX5.png',
    'luck11': 'loli_utility/textures/items/FortuneModuleX11.png',
    'singularity7': 'eternalsingularity/textures/items/combined_singularity_7.png',
    'sparkling': 'lolienergistics/textures/items/matters/matter_sparkling.png',
    'demon_catalyst': 'energyrelics/textures/items/consumable/demonic_infinity_catalyst.png',
    'demon_shard': 'lolidimensions/textures/items/demonic_infinity_dragon_shard.png',
    'fluid_sing': 'lolienergistics/textures/items/singularity/fluid_singularity.png',
    'quest_station': 'betterquesting/textures/blocks/submit_station_top.png',
    # пчёлы и материя
    'apiary': 'loli_forestry/textures/blocks/industrial_apiary.png',
    'speed': 'loli_forestry/textures/items/upgrades/upgrade_speed_x3.png',
    'bee': 'loli_forestry/textures/items/bee_1_1.png',
    'creosote': 'lolienergistics/textures/items/creosote_bucket.png',
    'matter_t2': 'lolienergistics/textures/blocks/machine/MatterSolidT2.png',
    'apiary_frame': 'loli_forestry/textures/items/consumable/frame_perfect_apiary.png',
    # квесты
    'artifacts': 'energyrelics/textures/items/ItemCoreofStealingPower.png',
    'quantum_core': 'lolienergistics/textures/items/asp/quantum_core.png',
    'sparkling_core': 'lolienergistics/textures/items/core/sparkling_core.png',
    'qgen3': 'lolienergistics/textures/blocks/3qgen_side.png',
    'qgen1': 'lolienergistics/textures/blocks/1qgen_side.png',
    'qgen2': 'lolienergistics/textures/blocks/2qgen_side.png',
    'creative_cell': 'appliedenergistics2/textures/items/ItemCreativeStorageCell.png',
    'creative_energy': 'appliedenergistics2/textures/blocks/BlockCreativeEnergyCell.png',
    'demon_block': 'lolidimensions/textures/blocks/awakened_demonic_infinity_draconium_block.png',
    'slayer_panel': 'lolienergistics/textures/blocks/draconic_evolution/dragon_slayer_ultimate_panel_top.png',
    'leg_molecular': 'lolienergistics/textures/blocks/machine/LegendaryMolecular.png',
    'replicator': 'lolienergistics/textures/blocks/legendary_replicator_core.png',
    'inf_pick': 'avaritia/textures/items/infinity_pickaxe.png',
    'inf_hammer': 'avaritia/textures/items/infinity_hammer.png',
    'diamond': 'minecraft/textures/items/diamond.png',
    'codex': 'loli_forestry/textures/items/codex_life.png',
    'inf_sword': 'avaritia/textures/items/infinity_sword.png',
    'demon_sword': 'energyrelics/textures/items/infinity_sword.png',
    'demon_armor': 'energyrelics/textures/items/infinity_armor_1.png',
}


def jars():
    out = [os.path.join(CLIENT, 'client.jar')]
    d = os.path.join(CLIENT, 'mods')
    out += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.jar')]
    return out


def find_all():
    index = {}
    for j in jars():
        with zipfile.ZipFile(j) as z:
            for n in z.namelist():
                if n.endswith('.png') and '/textures/' in n:
                    index.setdefault(n, j)
    res, miss = {}, []
    for key, tail in ICONS.items():
        hits = [n for n in index if n.endswith('/' + tail) or n == 'assets/' + tail]
        if not hits:
            miss.append((key, tail))
            continue
        with zipfile.ZipFile(index[hits[0]]) as z:
            img = Image.open(io.BytesIO(z.read(hits[0]))).convert('RGBA')
        w, h = img.size
        if h > w:  # анимация: кадры столбиком, берём первый
            img = img.crop((0, 0, w, w))
        res[key] = img
    return res, miss


def main():
    imgs, miss = find_all()
    for k, t in miss:
        print('нет текстуры:', k, t, file=sys.stderr)
    out = {}
    for k, img in imgs.items():
        b = io.BytesIO()
        img.save(b, 'PNG', optimize=True)
        out[k] = 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
    json.dump(out, open(os.path.join(ROOT, 'web/icons.json'), 'w'), indent=0)
    # контактный лист для глазной проверки
    keys = list(imgs)
    cols, cell = 12, 40
    sheet = Image.new('RGBA', (cols * cell, (len(keys) + cols - 1) // cols * cell), (60, 66, 76, 255))
    for i, k in enumerate(keys):
        im = imgs[k].resize((32, 32), Image.NEAREST)
        sheet.alpha_composite(im, (i % cols * cell + 4, i // cols * cell + 4))
    sheet.save(os.path.join(os.environ.get('SHEET_DIR', '/tmp'), 'icons_sheet.png'))
    print(f'иконок {len(out)}, не найдено {len(miss)}, {sum(len(v) for v in out.values()) // 1024} КБ')
    print(' '.join(keys))


if __name__ == '__main__':
    main()
