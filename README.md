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
- `data/solid_matter.md` — твёрдая материя: каскад тиров, схема генераторов на квантовых генераторах под прекрафт 4 тира (мутировавшая).
- `data/subtasks.md`, `data/subtasks.json` — подзадачи по эпохам: какие шаблоны кодировать, какие линии автокрафта собрать, что проверить на сервере.
- `data/patterns.md`, `data/patterns.json` — все шаблоны по эпохам и чем каждый кодировать, особые случаи.
- `data/bees.md`, `data/bees.json` — соты под вехи и 32 совершенные пасеки, наименьший набор пчёл, раскладка пчёл на старте (4 пасеки) и в лейте (32).
- `data/bees/` — продукты и мутации пчёл Forestry и ExtraBees, вытащенные из байткода модов.
- `data/autocraft.json` — профиль каждого механизма: слоты, жидкости и газы, катализаторы, выходы с шансом.
- `data/tree.json` — дерево: 12 контрольных точек по драконам, задачи по трём потокам, квесты «Испытаний».
- `data/milestones.md`, `data/milestones.json` — из чего состоят шесть ключевых вех: общий ствол, свои ветки, драконы, базовые ресурсы.
- `tools/scripts_cache/` — скрипт, который заново достаёт крафты из `scripts_cache.dat` после вайпа.
- `tools/recipe_graph.py` — граф всех серверных рецептов: дерево крафта предмета, базовые ресурсы, где предмет используется.
- `tools/milestones.py` — пересобирает `data/milestones.md` по графу.
- `tools/bottlenecks.py` — цифры для плана: цена вех, нейтроний, доли душ драконов, окупаемость модулей и квантового генератора.
- `tools/limits.py` — пересобирает `data/limits.md`.
- `tools/sub_milestones.py` — пересобирает `data/sub_milestones.md`.
- `tools/autocraft.py` — профиль механизмов для автокрафта, пишет `data/autocraft.json`.
- `tools/patterns.py` — пересобирает `data/patterns.md`.
- `tools/bees.py` — пересобирает `data/bees.md`: спрос на соты, набор пчёл, раскладка по пасекам.
- `tools/extract_forestry_bees.py`, `tools/extract_extrabees.py` — достают пчёл из jar Forestry и binnie-mods в `data/bees/`.
- `tools/tree.py` — собирает `data/tree.json` из `plan.md`, `subtasks.json`, пчёл и материи, и вшивает его в `web/dashboard.html` вместе с иконками.
- `tools/icons.py` — достаёт иконки предметов из jar клиента в `web/icons.json` (какие иконки у каких задач, задано в `tools/tree.py`).
- `tools/subtasks.py` — пересобирает `data/subtasks.md` из шаблонов и мелких вех.
- `web/dashboard.src.html` — шаблон дашборда (граф карты прохождения и граф квестов); `web/dashboard.html` — собранная страница (опубликована: https://claude.ai/artifact/296woLFrb3djqyC6aRbmCQ). Отметки команды хранятся в базе страницы, не в git.
