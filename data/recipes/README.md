# Крафты сервера HiTech

Все рецепты, которые сервер Loliland HiTech меняет или добавляет поверх модов: 71 скрипт, около 7 тысяч строк.

## Откуда

Сервер при входе присылает клиенту скомпилированные скрипты CraftTweaker, а клиент сохраняет их в `config/scripts_cache.dat` в папке игры. Мы прочитали этот файл и перевели байткод обратно в строки вида ZenScript. Ни модов, ни запросов к серверу, ни чтения памяти игры: только файл, который уже лежит на диске. Повторить после вайпа: `python3 tools/scripts_cache/extract.py <путь>/config/scripts_cache.dat data/recipes`.

## Что внутри

| Что | Строк | Где искать |
|---|---|---|
| Обычные крафты (`recipes.addShaped`) | ~1600 | почти во всех файлах |
| Экстремальный верстак (`ExtremeCrafting.addShaped`) | ~420 | разбросан по модам: больше всего в `HiTech_Loli_Energistics*.zs`, `LoliMods_HiTech_AE2_loli_technologies.zs`, `HiTech_Loli_Dragon_might.zs`, `HiTech_EnergyRelics.zs`, `HiTech_Avaritia.zs` |
| Молекулярный преобразователь (`MTMolecular.add`: вход, выход, энергия) | 36 | `HiTech_MolecularTransformer.zs`, немного в `HiTech_Avaritia.zs` и `HiTech_AE2.zs` |
| Двойной молекулярный (`MTDoubleMolecular.add`) | 33 | `HiTech_DoubleMolecularTransformer.zs` |
| Молекулярная ферма (`MTMolecularFarm.add`) | 101 | `LoliMods_HiTech_MolecularFarm.zs` |
| Слияние (`MTFusionCrafting.add`) | 34 | `LoliMods_HiTech_Loli_Dragon_might_Fusion.zs` |
| Души и лут спавнеров (`MTSoulTransformer`, `SpawnTrickTweaker.addLoot`) | ~560 | `De_spawns.zs` (лут), `HiTech_Loli_Dragon_might.zs` и `HiTech_DraconicEvolution_Soul.zs` (преобразователь душ), `De_souls.zs` |
| Лазерный бур (`MiningLaser.addOre`) | 29 | `HiTech_MineFactory.zs` |
| Лимиты на блоки (`LimitManagerMT.add`) | 125 | `Hitech_RealmLimitManager.zs` |
| Подсказки и переименования | ~2500 | `Hitech_tooltips*.zs`, `HiTech_NEI.zs` |

## Как читать

- `<мод:предмет:мета>` это внутренний id предмета, `.withAmount(N)` это количество.
- В `addShaped` выход первым, дальше сетка по строкам. `null` значит пустая клетка.
- Энергия в машинах записана так, как её задаёт сервер (у молекулярного это EU на весь крафт).
- Строки `// ifeq ...` это остатки условий из исходного скрипта, их можно пропускать.

## Чего здесь нет

- Рецептов модов, которые сервер не трогал. Они берутся из самих модов (NEI в одиночной игре на той же сборке).
- Квестов. Они живут только на сервере, вкладка «Испытания» переписана со скринов в `data/ispytaniya_quests.json`.
