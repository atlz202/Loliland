# Лимиты механизмов и раскладка под нагрузку

Собрано `tools/limits.py` из `data/recipes/!!!Hitech_RealmLimitManager.zs` и графа рецептов шести вех. Лимит действует на всю базу. Нагрузка посчитана без множителей модулей, поэтому смысл имеют доли, а не числа. Цепочки руды отданы преобразователю удачи, крафты 3x3 и 9x9 идут в молекулярных сборщиках моментально.

## Раскладка общих групп по нагрузке

В общей группе лимит делится между типами. Если механизм делает одну операцию в тик, быстрее всего выходит, когда число механизмов каждого типа пропорционально его нагрузке.

### Промышленные механизмы: 1024 на всё

| Механизм | Доля нагрузки | Сколько ставить |
|---|---|---|
| Металлоформовщик | 33% | 340 |
| Дробитель | 22% | 225 |
| Компрессор IC2 | 20% | 205 |
| Печь | 13% | 134 |
| Плавильный завод | 4% | 44 |
| Термальная центрифуга | 4% | 36 |
| Экстрактор | 3% | 32 |
| Камера сплавов | 1% | 6 |
| Печь сплавов | 0% | 2 |
| Капиллярный наполнитель | 0% | 1 |
| Процедурный сборщик | 0% | 1 |

С округлением выходит на 2 больше лимита: снимите их с самого большого типа.

### Механизмы химии (как в Mekanism): 192 на всё

| Механизм | Доля нагрузки | Сколько ставить |
|---|---|---|
| Реакционная камера | 42% | 80 |
| Химический окислитель | 29% | 55 |
| Электролитический сепаратор | 15% | 28 |
| Химический наполнитель | 9% | 17 |
| Обогатитель | 4% | 8 |
| Паровой котёл | 2% | 3 |
| Ротационный конденсатор | 0% | 1 |

### Твёрдая материя: 192 машины на все тиры

Каждая машина питается от своих двух квантовых генераторов (4,2G в тик), поэтому делить машины между тирами нужно по энергии, а не по числу операций: на высоких тирах операция дороже.

| Тир | Доля энергии | Машин из 192 |
|---|---|---|
| (тир 0) | 42.1% | 81 |
| (тир 1) | 27.5% | 53 |
| (тир 2) | 19.0% | 36 |
| (тир 3) | 7.0% | 14 |
| (тир 4) | 2.8% | 5 |
| (тир 5) | 1.1% | 2 |
| (тир 6) | 0.3% | 1 |
| (тир 7) | 0.1% | 1 |
| (тир 8) | 0.1% | 1 |
| (тир 9) | 0.0% | 1 |

## Механизмы с отдельным лимитом: где тесно

«Нагрузка на штуку» = операции на один механизм при полном лимите, относительно самого загруженного. Чем ближе к 100%, тем раньше этот механизм упрётся в лимит.

| Механизм | Лимит | Нагрузка на штуку |
|---|---|---|
| Доменная печь | 4 | 100.0% |
| Молекулярный преобразователь | 64 | 96.1% |
| Закалочная ванна | 8 | 50.0% |
| Механизмы химии (как в Mekanism), вся группа | 192 | 22.7% |
| Промышленные механизмы, вся группа | 1024 | 7.0% |
| Кристаллизационное охлаждение | 16 | 6.4% |
| Промышленный смеситель | 32 | 3.1% |
| Преобразователь удачи (руда x25, 96 руд в тик) | 32 | 0.5% |
| Камера роста кристаллов | 32 | 0.1% |
| Сборочный стол | 32 | 0.1% |
| Двойной молекулярный преобразователь | 64 | 0.1% |
| Энтропийный реактор | 4 | 0.0% |
| Нейтронный компрессор | 32 | 0.0% |
| Центрифуга Forestry | 64 | 0.0% |
| Перегонный куб | 64 | 0.0% |
| Гемонтрансмутатор | 8 | 0.0% |
| Дистилляционная колонна | 2 | 0.0% |
| Сборочный комплекс | 32 | 0.0% |
| Сжиматель | 64 | 0.0% |
| Термоионный фабрикатор | 64 | 0.0% |
| Плотник | 64 | 0.0% |
| Сушилка | 96 | 0.0% |
| Синтезатор энергона | 1 | 0.0% |
| Жидкий нейтроний | 16 | 0.0% |
| Легендарный сборочный комплекс | 18 | 0.0% |
| Преобразователь душ | 8 | 0.0% |
| Пчелиная фабрика | 8 | 0.0% |

## Все группы лимитов и что в них входит

**Плавильня Tinkers (блоки)** (`TinkerSmelter`), 1586 на всё: TConstruct:LavaTank, TConstruct:LavaTank:1, TConstruct:LavaTank:2, TConstruct:Smeltery:1, TConstruct:Smeltery:2, TConstruct:Smeltery:4, TConstruct:Smeltery:5, TConstruct:Smeltery:6, TConstruct:Smeltery:7, TConstruct:Smeltery:8, TConstruct:Smeltery:9, TConstruct:Smeltery:10, TConstruct:LavaTankNether, TConstruct:LavaTankNether:1, TConstruct:LavaTankNether:2, TConstruct:SmelteryNether:1, TConstruct:SmelteryNether:2, TConstruct:SmelteryNether:4, TConstruct:SmelteryNether:5, TConstruct:SmelteryNether:6, TConstruct:SmelteryNether:7, TConstruct:SmelteryNether:8, TConstruct:SmelteryNether:9, TConstruct:SmelteryNether:10, TConstruct:SmelteryNether:11, TConstruct:Smeltery:11.

**Промышленные механизмы** (`mashinegroupsic2`), 1024 на всё: Улучшенный Режущий механизм, Режущий механизм (улучшенный), Термальная центрифуга, Термальная центрифуга (улучшенная), Промышленный разливочный механизм, Дробитель, Металлоформовщик, Электропечь, Компрессор, Экстрактор, Утилизатор, Основной корпус механизма, Основной корпус механизма, Основной корпус механизма, Основной корпус механизма, Основной корпус механизма, Основной корпус механизма, Основной корпус механизма, IC2:blockMachine2:2, IC2:blockMachine2:3, IC2:blockMachine2:4, IC2:blockMachine2:6, IC2:blockMachine2:7, IC2:blockMachine2:8, IC2:blockMachine3, Капиллярный наполнитель, Промышленный Капиллярный наполнитель, Разливочный механизм (улучшенный), Генератор, Генератор, Фабрика хладагента, Плавильная установка, Ферма ведьм, Сплавная печь, Вулканический пресс, Камера сплавов, Камера сплавов (тир 2), Камера сплавов (тир 3), Процедурный сборщик.

**Молекулярные сборщики AE2** (`AssemblerAE2`), 512 на всё: Молекулярный сборщик, Улучшенный сборщик, Нейтрониевый сборщик, Большой сборщик X9, Сборщик синтеза, Сборщик сборочного стола.

**Пасеки** (`apiculture`), 256 на всё: Forestry:apiculture, Вагонетка с пасекой, Forestry:apiculture:2.

**Твёрдая материя** (`gentvermatter`), 192 на всё: Твёрдая материя X1, Твёрдая материя X6, Твёрдая материя X12.

**Объединители энергии** (`unifier`), 192 на всё: lolienergistics:tile.unifier_gold, lolienergistics:tile.unifier, lolienergistics:advanced_energy_unifier.

**Механизмы химии (как в Mekanism)** (`newmeka`), 192 на всё: Обогатитель, Обогатитель (тир 2), Обогатитель (тир 3), Химический наполнитель, Химический окислитель, Реакционная камера, Электролитический сепаратор, Сборщик газа из воздуха, Смеситель, Ротационный конденсатор, Паровой котёл.

**Узлы ExtraUtilities** (`extrayzel`), 128 на всё: ExtraUtilities:extractor_base_remote, ExtraUtilities:extractor_base.

**Солнечные панели и квантовые генераторы** (`listsolarpanels`), 128 на всё: lolienergistics:solar_panel, Улучшенная солнечная панель, Гибридная солнечная панель, Ультимейт гибридная солнечная панель, Квантовая солнечная панель, Дисперсионная солнечная панель, Гравимагнитная солнечная панель, Анизотропическая солнечная панель, Флуктуационная солнечная панель, Аберрационная солнечная панель, Параметрическая солнечная панель, Хромодинамическая солнечная панель, Антиматериальная солнечная панель, Искрящаяся панель, Искрящаяся панель из розового золота, Квантовый генератор, Параллактический квантовый генератор, Ионный квантовый генератор, ФКВГ (Ультимативный фиолетовый квантовый генератор), Голубая панель пчеловода, Зеленая панель пчеловода, Фиолетовая панель пчеловода, Янтарная панель пчеловода, Улучшенная голубая панель пчеловода, Улучшенная зеленая панель пчеловода, Улучшенная фиолетовая панель пчеловода, Улучшенная янтарная панель пчеловода, Ультимативная четырехцветная панель пчеловода, Панель из электролизованного бронзового сплава, Панель из электролизованного светокаменного сплава, Панель из электролизованного обсидианового сплава, Панель из электролизованного осмиевого сплава, Ультимативная панель из электролизованного мультисплава, Панель Дракона Хаоса, Панель Дракона Холода, Панель Дракона Пламени, Панель Дракона Бесконечности, Панель Демонического дракона Бесконечности, Ультимативная панель Убийцы драконов, Термодинамическая панель фиолетового спектра, Термодинамическая панель красного спектра, Прозрачная термодинамическая панель, Термодинамическая панель бирюзового спектра, Ультимативная голографическая термодинамическая панель.

**Генераторы энергона** (`Energongen`), 128 на всё: Генератор красного энергона, Генератор тёмного энергона.

**Беспроводные точки** (`Wireless`), 128 на всё: loli_technologies:tile.BlockWireless32, loli_technologies:tile.BlockWireless64, loli_technologies:tile.BlockWireless128, loli_technologies:tile.BlockWireless256, loli_technologies:tile.BlockGoldWireless, loli_technologies:tile.BlockInfiniteWireless, loli_technologies:tile.BlockDemonicWireless.

**Репликаторы** (`Replicators`), 128 на всё: Репликатор IC2, Квантовый репликатор.

**Спавнеры** (`spawners`), 128 на всё: Стабилизированный спавнер, Легендарный спавнер Хаоса, Спавнер Хаоса.

**Генераторы нейтрония** (`genneitroniym`), 96 на всё: Генератор нейтрония (груды), Генератор нейтрония S1 (самородки), Генератор нейтрония S2 (слитки), Генератор нейтрония S3 (блоки).

**Лампы** (`lamp`), 96 на всё: redpower:lamp, redpower:lamp_inverted, redpower:shaped_lamp_cage, redpower:shaped_lamp_fallout, redpower:shaped_lamp_lantern, redpower:shaped_lamp_fixture.

**Трансформаторы** (`tranformatenergys`), 64 на всё: IC2:blockElectric:3, IC2:blockElectric:4, IC2:blockElectric:5, IC2:blockElectric:6.

**Хранилища энергии** (`storageenergys`), 64 на всё: IC2:blockElectric, IC2:blockElectric:7, IC2:blockElectric:1, IC2:blockElectric:2, lolienergistics:BlockElectric, lolienergistics:BlockElectric:1, lolienergistics:BlockElectric:2.

**QED** (`QED`), 64 на всё: Продвинутый Автоматический QED, ExtraUtilities:endConstructor, Автоматический QED.

**Солнечные опреснители** (`advancedsolardestiller`), 64 на всё: IC2:blockMachine3:1, Продвинутый солнечный опреснитель.

**Энергоячейки AE2** (`EnergyCell`), 64 на всё: Энергетическая ячейка, Плотная энергетическая ячейка, Творческая энергетическая ячейка, loli_technologies:tile.BlockGoldCreativeEnergyCell, loli_technologies:tile.BlockGoldEnergyCell, loli_technologies:tile.BlockInfiniteCreativeEnergyCell, loli_technologies:tile.BlockInfiniteEnergyCell, loli_technologies:tile.BlockDemonicCreativeEnergyCell, loli_technologies:tile.BlockDemonicEnergyCell, loli_technologies:tile.BlockEnergyCell.

**Конденсаторы материи** (`condens_mater`), 64 на всё: loli_technologies:tile.BlockAdvancedCondenser, Конденсатор материи.

**Генераторы ExtraUtilities** (`ExtraUtilgenerator`), 32 на всё: ExtraUtilities:generator, ТНТ генератор, ExtraUtilities:generator.64.

**Кинетические генераторы** (`kinetic generator`), 32 на всё: lolienergistics:BlockIEGenerator:7, lolienergistics:BlockIEGenerator:4, lolienergistics:BlockIEGenerator:5, lolienergistics:BlockIEGenerator:3, lolienergistics:BlockIEGenerator, lolienergistics:BlockIEGenerator:1, lolienergistics:BlockIEGenerator:2, lolienergistics:BlockIEGenerator:6.

**Объединители нейтрония** (`NeutronCombinerall`), 32 на всё: Объединитель нейтрония, Энергетический объединитель нейтрония.

**МЭ накопители** (`BlockDrive`), 32 на всё: МЭ накопитель, loli_technologies:tile.BlockLargeDrive, loli_technologies:tile.BlockGoldLargeDrive, loli_technologies:tile.BlockInfiniteLargeDrive, loli_technologies:tile.BlockDemonicLargeDrive.

**Tinkers (обожжённые блоки)** (`tinker`), 16 на всё: TConstruct:SearedBlock:2, TConstruct:SearedBlockNether:2, TConstruct:SearedBlock, TConstruct:SearedBlockNether.

**Нефтяные вышки** (`OilDerrick`), 4 на всё: lolienergistics:oil_derrick_core_1, lolienergistics:oil_derrick_core_2, lolienergistics:oil_derrick_core_3.

**Плавильня Tinkers (контроллер)** (`TinkerSmelteryController`), 2 на всё: TConstruct:Smeltery, TConstruct:SmelteryNether.

## Одиночные лимиты

| Механизм | Лимит |
|---|---|
| Forestry:alveary `Forestry:alveary` | 1080 |
| Кирпич доменной печи `lolienergistics:blast_furnace_brick` | 1080 |
| Кирпич коксовой печи `lolienergistics:coke_oven_brick` | 1080 |
| ExtraUtilities:endConstructor:2 `ExtraUtilities:endConstructor:2` | 256 |
| lolienergistics:BlockMatter `lolienergistics:BlockMatter` | 192 |
| lolienergistics:laser_drill_precharger `lolienergistics:laser_drill_precharger` | 128 |
| TConstruct:Armor.DryingRack `TConstruct:Armor.DryingRack` | 96 |
| lolienergistics:deep_storage_unit `lolienergistics:deep_storage_unit` | 96 |
| Forestry:factory `Forestry:factory` | 64 |
| Forestry:factory2 `Forestry:factory2` | 64 |
| Forestry:factory:1 `Forestry:factory:1` | 64 |
| Forestry:factory:2 `Forestry:factory:2` | 64 |
| Forestry:factory:3 `Forestry:factory:3` | 64 |
| Forestry:factory:4 `Forestry:factory:4` | 64 |
| Forestry:factory:5 `Forestry:factory:5` | 64 |
| Forestry:factory:6 `Forestry:factory:6` | 64 |
| IC2:blockMachine2 `IC2:blockMachine2` | 64 |
| hielements:fisher `hielements:fisher` | 64 |
| lolienergistics:BlockLavaGenerate `lolienergistics:BlockLavaGenerate` | 64 |
| lolienergistics:BlockMatterCombiner `lolienergistics:BlockMatterCombiner` | 64 |
| lolienergistics:BlockMolecular `lolienergistics:BlockMolecular` | 64 |
| lolienergistics:BlockMolecularFarm `lolienergistics:BlockMolecularFarm` | 64 |
| lolienergistics:BlockStoneGenerator `lolienergistics:BlockStoneGenerator` | 64 |
| lolienergistics:wind_turbine `lolienergistics:wind_turbine` | 64 |
| Генератор воды `lolienergistics:blockWaterGenerate` | 64 |
| Двойной молекулярный преобразователь `lolienergistics:double_molecular` | 64 |
| Лазерный сборочный стол `lolienergistics:assembly_laser` | 64 |
| Спектральная дверь `loli_utility:spectral_door` | 64 |
| lolienergistics:crystal_charging_chamber `lolienergistics:crystal_charging_chamber` | 48 |
| ExtraBees:alveary:6 `ExtraBees:alveary:6` | 40 |
| Avaritia:Neutronium_Compressor `Avaritia:Neutronium_Compressor` | 32 |
| DraconicEvolution:energyPylon `DraconicEvolution:energyPylon` | 32 |
| DraconicEvolution:energyStorageCore `DraconicEvolution:energyStorageCore` | 32 |
| DraconicEvolution:flowGate `DraconicEvolution:flowGate` | 32 |
| DraconicEvolution:flowGate:6 `DraconicEvolution:flowGate:6` | 32 |
| IC2:blockMachine2:1 `IC2:blockMachine2:1` | 32 |
| Techguns:basicMachine:4 `Techguns:basicMachine:4` | 32 |
| Techguns:machineMultiBlock:1 `Techguns:machineMultiBlock:1` | 32 |
| jgendustry:liquifier `jgendustry:liquifier` | 32 |
| jgendustry:mutagen_producer `jgendustry:mutagen_producer` | 32 |
| loli_dragon_might:fusion_injector `loli_dragon_might:fusion_injector` | 32 |
| loli_technologies:tile.BlockCraftingCombiner `loli_technologies:tile.BlockCraftingCombiner` | 32 |
| lolienergistics:activator `lolienergistics:activator` | 32 |
| lolienergistics:crystal_growth_chamber `lolienergistics:crystal_growth_chamber` | 32 |
| lolienergistics:industrial_steam_boiler `lolienergistics:industrial_steam_boiler` | 32 |
| lolienergistics:laser_drill `lolienergistics:laser_drill` | 32 |
| Вакуумный сундук `loli_utility:vacuum_chest` | 32 |
| Генератор `IC2:blockGenerator:2` | 32 |
| Кластерный распаковщик `lolienergistics:cluster_unpacker` | 32 |
| Лазерный сборочный стол `lolienergistics:assembly_table` | 32 |
| Основной корпус механизма `IC2:blockMachine:1` | 32 |
| Преобразователь удачи `loli_utility:FortuneTransformer` | 32 |
| Сборочный цех `hielements:assembly_complex` | 32 |
| Совершенная пасека `loli_forestry:IndustrialApiary` | 32 |
| Экстрактор `jgendustry:extractor` | 32 |
| Ядро промышленного улья `loli_forestry:industrial_hive` | 32 |
| Ядро смесителя `lolienergistics:mixer_core` | 32 |
| Ядро легендарного сборочного комплекса `hielements:legendary_assembly_complex` | 18 |
| Techguns:basicMachine:1 `Techguns:basicMachine:1` | 16 |
| jgendustry:imprinter `jgendustry:imprinter` | 16 |
| jgendustry:mutatron `jgendustry:mutatron` | 16 |
| jgendustry:mutatron_adv `jgendustry:mutatron_adv` | 16 |
| jgendustry:sampler `jgendustry:sampler` | 16 |
| loli_technologies:tile.BlockAnnihilation `loli_technologies:tile.BlockAnnihilation` | 16 |
| loli_technologies:tile.BlockLevelMaintainer `loli_technologies:tile.BlockLevelMaintainer` | 16 |
| Жидкостный компрессор нейтрония `lolienergistics:liquid_neutron_compressor` | 16 |
| Плазменный зарядник `lolienergistics:plasma_charger` | 16 |
| Распределитель жидкостей `jgendustry:transposer` | 16 |
| Репликатор `jgendustry:replicator` | 16 |
| Совершенная Центрифуга `loli_forestry:centrifuge` | 16 |
| Ядро легендарного репликатора `lolienergistics:legendary_replicator_core` | 16 |
| Ядро охлаждающего комплекса `lolienergistics:crystallization_cooling_complex` | 16 |
| DraconicEvolution:dislocatorReceptacle `DraconicEvolution:dislocatorReceptacle` | 8 |
| DraconicEvolution:dissEnchanter `DraconicEvolution:dissEnchanter` | 8 |
| DraconicEvolution:energyInfuser `DraconicEvolution:energyInfuser` | 8 |
| DraconicEvolution:upgradeModifier `DraconicEvolution:upgradeModifier` | 8 |
| ExtraTrees:machine `ExtraTrees:machine` | 8 |
| Forestry:core `Forestry:core` | 8 |
| Techguns:machineMultiBlock:4 `Techguns:machineMultiBlock:4` | 8 |
| loli_technologies:tile.BlockWirelessHub `loli_technologies:tile.BlockWirelessHub` | 8 |
| lolienergistics:hemontransmutator `lolienergistics:hemontransmutator` | 8 |
| Закалочный котёл `lolienergistics:cauldron` | 8 |
| Ядро внеземного генератора энергии хаоса `loli_dragon_might:alien_chaos_energy_generator` | 8 |
| Ядро внеземного преобразователя душ `loli_dragon_might:extraterrestrial_soul_transformer` | 8 |
| Ядро закалочной ванны `lolienergistics:hardening_bath` | 8 |
| Ядро плавильного комплекса `lolienergistics:thermonuclear_smelting_complex` | 8 |
| Ядро пчелиной фабрики `loli_forestry:bee_factory` | 8 |
| DraconicEvolution:grinder:3 `DraconicEvolution:grinder:3` | 4 |
| DraconicEvolution:particleGenerator `DraconicEvolution:particleGenerator` | 4 |
| loli_dragon_might:reactor_core `loli_dragon_might:reactor_core` | 4 |
| loli_dragon_might:reactor_energy_injector `loli_dragon_might:reactor_energy_injector` | 4 |
| lolienergistics:auto_spawner `lolienergistics:auto_spawner` | 4 |
| lolienergistics:entropy_reactor `lolienergistics:entropy_reactor` | 4 |
| Внеземной дракониевый корпус создания `loli_dragon_might:fusion_crafting_core` | 4 |
| Гелиосферное зарядное ядро `lolienergistics:heliospheric_charging_center` | 4 |
| Квантовый шахтёр `lolienergistics:quantum_miner` | 4 |
| Ядро преобразователя энергония `lolienergistics:energon_converter_core` | 4 |
| Ядро промышленной доменной печи `lolienergistics:industrial_blast_furnace` | 4 |
| lolienergistics:distillation_column_core `lolienergistics:distillation_column_core` | 2 |
| chisel:autoChisel `chisel:autoChisel` | 1 |
| Энергонное ядро синтезатора `lolienergistics:energon_synthesizer_core` | 1 |
