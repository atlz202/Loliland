# Loliland

Дерево заданий и дашборд для команды на сервере Loliland (сборка HiTech), чтобы закрыть вкладку квестов «Испытания» к вайпу 2–3 января.

План: https://claude.ai/artifact/EJdLgU6X8c6fvQPBQHse5H

## Структура

- `data/ispytaniya_quests.json` — квесты вкладки «Испытания» и их условия (переписаны со скринов подсказок).
- `data/recipes/` — все серверные крафты HiTech, извлечённые из кэша скриптов в папке игры (см. README внутри).
- `data/process_notes.md`, `data/modules.md`, `data/kits.md` — знания о процессе, модулях и китах.
- `data/plan.md` — план развития: порядок вех, нейтроний, души драконов, окупаемость модулей, три потока по эпохам.
- `data/limits.md` — все лимиты механизмов на базу и раскладка механизмов по нагрузке.
- `data/sub_milestones.md`, `data/sub_milestones.json` — мелкие вехи: многошаговые ресурсы и эпоха, к которой их автоматизировать.
- `data/subtasks.md`, `data/subtasks.json` — подзадачи по эпохам: какие шаблоны кодировать, какие линии автокрафта собрать, что проверить на сервере.
- `data/patterns.md`, `data/patterns.json` — все шаблоны по эпохам и чем каждый кодировать, особые случаи.
- `data/autocraft.json` — профиль каждого механизма: слоты, жидкости и газы, катализаторы, выходы с шансом.
- `data/tree.json` — дерево контрольных точек и задач (будет).
- `data/milestones.md`, `data/milestones.json` — из чего состоят шесть ключевых вех: общий ствол, свои ветки, драконы, базовые ресурсы.
- `tools/scripts_cache/` — скрипт, который заново достаёт крафты из `scripts_cache.dat` после вайпа.
- `tools/recipe_graph.py` — граф всех серверных рецептов: дерево крафта предмета, базовые ресурсы, где предмет используется.
- `tools/milestones.py` — пересобирает `data/milestones.md` по графу.
- `tools/bottlenecks.py` — цифры для плана: цена вех, нейтроний, доли душ драконов, окупаемость модулей и квантового генератора.
- `tools/limits.py` — пересобирает `data/limits.md`.
- `tools/sub_milestones.py` — пересобирает `data/sub_milestones.md`.
- `tools/autocraft.py` — профиль механизмов для автокрафта, пишет `data/autocraft.json`.
- `tools/patterns.py` — пересобирает `data/patterns.md`.
- `tools/subtasks.py` — пересобирает `data/subtasks.md` из шаблонов и мелких вех.
- `web/` — дашборд (будет).
