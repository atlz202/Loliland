# Loliland

Дерево заданий и дашборд для команды на сервере Loliland (сборка HiTech), чтобы закрыть вкладку квестов «Испытания» к вайпу 2–3 января.

План: https://claude.ai/artifact/EJdLgU6X8c6fvQPBQHse5H

## Структура

- `data/ispytaniya_quests.json` — квесты вкладки «Испытания» и их условия (переписаны со скринов подсказок).
- `data/recipes/` — все серверные крафты HiTech, извлечённые из кэша скриптов в папке игры (см. README внутри).
- `data/process_notes.md`, `data/modules.md`, `data/kits.md` — знания о процессе, модулях и китах.
- `data/tree.json` — дерево контрольных точек и задач (будет).
- `tools/scripts_cache/` — скрипт, который заново достаёт крафты из `scripts_cache.dat` после вайпа.
- `web/` — дашборд (будет).
