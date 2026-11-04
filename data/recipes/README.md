# Крафты сервера HiTech

Все рецепты, которые сервер Loliland HiTech меняет или добавляет поверх модов: 147 скриптов, около 24 тысяч строк. Версия от 23 октября 2026 года.

## Откуда

Сервер при входе присылает клиенту скомпилированные скрипты CraftTweaker. Клиент сохраняет их в `config/scripts_cache.dat` в папке игры. Мы прочитали этот файл и перевели байткод обратно в строки вида ZenScript. Ни модов, ни запросов к серверу, ни чтения памяти игры: только файл, который уже лежит на диске.

Актуальный клиент лежит в `%APPDATA%\.loliland\game-resources\clients\hitech\main`. Старая папка `loliland\updates\clients\hitech` не обновлялась с ноября 2025 года, брать из неё нельзя.

Повторить после вайпа:

    python3 tools/scripts_cache/extract.py <клиент>/config/scripts_cache.dat data/recipes

## Что внутри

| Что | Строк | Где искать |
|---|---|---|
| Обычные крафты (`recipes.addShaped`, `addShapeless`) | ~2900 | `!Hitech_3x3_<мод>.zs` |
| Экстремальный верстак (`ExtremeCrafting.addShaped`) | 439 | `!Hitech_9x9_<мод>.zs` |
| Молекулярный преобразователь (`MTMolecular.add`: вход, выход, энергия) | 38 | `!Hitech_MolecularTransformer.zs` |
| Двойной молекулярный (`MTDoubleMolecular.add`) | 36 | `!Hitech_DoubleMolecularTransformer.zs` |
| Молекулярная ферма (`MTMolecularFarm.add`) | 144 | `!Hitech_MolecularFarm.zs` |
| Репликатор (`Replicator.add`: предмет, стоимость) | 103 | `!Hitech_Replicator.zs` |
| Сингулярности (`MTSingularities.add`) | 93 | `!Hitech_Singularities.zs` |
| Твёрдая материя (`MTMatterSolid.add`) | 10 | `!Hitech_MatterSolid.zs` |
| Сборочный комплекс, легендарный комплекс, сборочный стол | 32, 17, 52 | `!Hitech_assembly_complex.zs`, `!Hitech_Legendary_Assembly_Complex.zs`, `!Hitech_assembly_table.zs` |
| Слияние (`MTFusionCrafting.add`) | 39 | `!Hitech_fusion_crafting.zs` |
| Преобразователь душ (`MTSoulTransformer.addRecipe`) | 9 | `!Hitech_soul_transformer.zs` |
| Лазерный бур (`MTLaserDrill.addOre`) | 59 | `!Hitech_MiningLaser.zs` |
| Блендер (`MTBlender.addRecipe`) | 123 | `!Hitech_Blender.zs` |
| Печь (`furnace.addRecipe`) | 185 | `!Hitech_furnace.zs` |
| Лимиты на блоки (`LimitManagerMT.add`) | 101 | `!!!Hitech_RealmLimitManager.zs` |
| Удалённые рецепты | — | `!!Hitech_Remove_Recipes.zs` |

## Как читать

- `<мод:предмет:мета>` это внутренний id предмета, `.withAmount(N)` это количество, `.withTag({...})` это NBT, например душа конкретного моба.
- В `addShaped` выход первым, дальше сетка по строкам. `null` значит пустая клетка.
- В `MTMolecular.add` и `MTDoubleMolecular.add` сначала вход, потом выход. Это видно по коду мода.
- Энергия в машинах записана так, как её задаёт сервер (у молекулярного это EU на весь крафт).
- Функции и циклы из скриптов раскрыты: вместо вызова функции стоят готовые рецепты.

## Ограничения

- В `!Z_Hitech_dropmob_test.zs` (лут мобов и души) часть условий зависит от состояния игры, такие ветки помечены комментарием `// ... условие зависит от игры`. Лут оттуда надо проверять в NEI.
- Рецептов модов, которые сервер не трогал, здесь нет. Их видно в NEI.
- Квестов здесь нет: они живут только на сервере. Вкладка «Испытания» переписана со скринов в `data/ispytaniya_quests.json`.
