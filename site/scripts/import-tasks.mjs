// Переносит согласованный список заданий в данные сайта.
//
//   node scripts/import-tasks.mjs <tasks_list.txt> <tasks_draft.md>
//
// tasks_list.txt даёт короткие названия, роли, сложность и связи («после N»),
// tasks_draft.md — полный текст задания и «зачем». Результат: src/data/hitech/tasks.ts.
// Группы (колонки дерева) и подпункты лежат отдельно, в src/data/hitech/extras.ts, их скрипт не трогает.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [listPath, draftPath] = process.argv.slice(2)
if (!listPath || !draftPath) {
  console.error('Нужно два пути: tasks_list.txt и tasks_draft.md')
  process.exit(1)
}

const ROLE = {
  AE: 'ae',
  Кодировщик: 'coder',
  'Ind-1': 'ind1',
  'Ind-2': 'ind2',
  Мека: 'meka',
  Пчеловод: 'beekeeper',
  Механик: 'beemech',
  Рагу: 'ragu',
  Прочее: 'misc',
  Драконик: 'dragon',
  Многоблочник: 'multi',
  Квестовик: 'quest',
  Все: 'all',
  все: 'all',
}
const DIFF = { лёгкая: 'L', средняя: 'M', сложная: 'H', суперсложная: 'X' }

// ---- tasks_list.txt ----
const tasks = new Map()
const order = []
let epoch = 0
for (const line of readFileSync(listPath, 'utf8').split(/\r?\n/)) {
  const e = line.match(/^Эпоха (\d+)\./)
  if (e) {
    epoch = Number(e[1])
    continue
  }
  const m = line.match(/^(\d+)\. (.+?) — (.+)$/)
  if (!m) continue
  const id = Number(m[1])
  let meta = m[3]

  const deps = []
  const depNotes = {}
  const after = meta.match(/(?:^|, )после (.+)$/)
  if (after) {
    for (const d of after[1].matchAll(/(\d+)(?: \(([^)]+)\))?/g)) {
      deps.push(Number(d[1]))
      if (d[2]) depNotes[d[1]] = d[2]
    }
    meta = meta.slice(0, after.index)
  }

  const task = { id, title: m[2], epoch, slots: [], difficulty: null, knowledge: false, deps, depNotes }
  if (/уточня/.test(meta)) {
    task.slots = ['any']
    task.tbd = true
  } else {
    for (const part of meta.split(', ')) {
      if (part === '🧠') task.knowledge = true
      else if (DIFF[part]) task.difficulty = DIFF[part]
      else if (part === 'каждая роль своё') {
        task.slots.push('all')
        task.slotNote = 'каждая роль покупает своё'
      } else if (part.startsWith('Любой')) {
        task.slots.push('any')
        const note = part.match(/\(([^)]+)\)/)
        if (note) task.slotNote = note[1]
      } else {
        for (const r of part.split(' + ')) {
          if (!ROLE[r]) throw new Error(`Задание ${id}: не понял роль «${r}» в «${m[3]}»`)
          task.slots.push(ROLE[r])
        }
      }
    }
  }
  if (!task.slots.length) throw new Error(`Задание ${id}: нет роли`)
  if (tasks.has(id)) throw new Error(`Задание ${id} встречается дважды`)
  tasks.set(id, task)
  order.push(id)
}

// ---- tasks_draft.md ----
for (const line of readFileSync(draftPath, 'utf8').split(/\r?\n/)) {
  if (!/^\| \d+ \|/.test(line)) continue
  const cells = line.split('|').slice(1, -1).map((c) => c.trim())
  const id = Number(cells[0])
  const task = tasks.get(id)
  if (!task) throw new Error(`В tasks_draft.md есть задание ${id}, которого нет в tasks_list.txt`)
  if (cells.length !== 6) throw new Error(`Задание ${id}: в строке таблицы ${cells.length} ячеек вместо 6`)
  task.text = cells[1]
  task.why = cells[5].replace(/\s*После: .*$/, '').trim()
}

// ---- проверки ----
for (const t of tasks.values()) {
  if (!t.text) throw new Error(`Задание ${t.id}: нет полного текста в tasks_draft.md`)
  for (const d of t.deps) {
    const dep = tasks.get(d)
    if (!dep) throw new Error(`Задание ${t.id}: «после ${d}», но такого задания нет`)
    if (dep.epoch > t.epoch) throw new Error(`Задание ${t.id} (эпоха ${t.epoch}) идёт после ${d} из более поздней эпохи ${dep.epoch}`)
  }
}

// ---- вывод ----
const q = (s) => JSON.stringify(s)
const lines = order.map((id) => {
  const t = tasks.get(id)
  const parts = [
    `id: ${t.id}`,
    `epoch: ${t.epoch}`,
    `title: ${q(t.title)}`,
    `text: ${q(t.text)}`,
    `why: ${q(t.why)}`,
    `slots: [${t.slots.map(q).join(', ')}]`,
  ]
  if (t.slotNote) parts.push(`slotNote: ${q(t.slotNote)}`)
  parts.push(`difficulty: ${t.difficulty ? q(t.difficulty) : 'null'}`, `knowledge: ${t.knowledge}`, `deps: [${t.deps.join(', ')}]`)
  if (Object.keys(t.depNotes).length) parts.push(`depNotes: { ${Object.entries(t.depNotes).map(([k, v]) => `${k}: ${q(v)}`).join(', ')} }`)
  if (t.tbd) parts.push('tbd: true')
  return `  { ${parts.join(', ')} },`
})

const out = `// Сгенерировано scripts/import-tasks.mjs из tasks_list.txt и tasks_draft.md.
// Руками не править: поменяй исходные файлы и запусти скрипт заново.
import type { TaskBase } from '../types.ts'

export const TASKS: TaskBase[] = [
${lines.join('\n')}
]
`
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/hitech/tasks.ts')
writeFileSync(target, out)
const links = [...tasks.values()].reduce((n, t) => n + t.deps.length, 0)
console.log(`${tasks.size} заданий, ${links} связей → ${target}`)
