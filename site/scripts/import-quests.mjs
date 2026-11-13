// Переносит квесты вкладки «Испытания» в данные сайта.
//
//   node scripts/import-quests.mjs <ispytaniya_quests.json>
//
// Результат: src/data/hitech/quests.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [src] = process.argv.slice(2)
if (!src) {
  console.error('Нужен путь к ispytaniya_quests.json')
  process.exit(1)
}

// Какое задание дерева закрывает ключевой квест.
const TASK_OF = {
  '1 миллиард чистой энергии': 68,
  'Демонический Дракон Бесконечности': 65,
  'Охота на 100 добычу': 69,
  'У меня будет миллиард алмазов!': 70,
  'Чудо генной инженерии': 71,
  'Клинок Азраила': 72,
  'Владыка демонической ковки': 72,
}

const data = JSON.parse(readFileSync(src, 'utf8'))
const names = new Set(data.quests.map((x) => x.name))
const external = new Set(data.external)
for (const quest of data.quests)
  for (const r of quest.requires)
    if (!names.has(r) && !external.has(r)) throw new Error(`Квест «${quest.name}»: условие «${r}» не найдено ни среди квестов, ни в external`)
for (const name of Object.keys(TASK_OF)) if (!names.has(name)) throw new Error(`Нет квеста «${name}»`)

const q = (s) => JSON.stringify(s)
const lines = data.quests.map((x) => {
  const parts = [`id: ${x.id}`, `name: ${q(x.name)}`, `requires: [${x.requires.map(q).join(', ')}]`, `difficulty: ${q(x.difficulty)}`]
  if (x.difficulty_note) parts.push(`note: ${q(x.difficulty_note)}`)
  if (x.goal) parts.push(`goal: ${q(x.goal)}`)
  if (x.key_milestone) parts.push(`milestone: ${q(x.key_milestone)}`)
  if (TASK_OF[x.name]) parts.push(`taskId: ${TASK_OF[x.name]}`)
  return `  { ${parts.join(', ')} },`
})

const out = `// Сгенерировано scripts/import-quests.mjs из ispytaniya_quests.json. Руками не править.
import type { Quest } from '../types.ts'

export const QUEST_TAB = 'Испытания'

export const QUESTS: Quest[] = [
${lines.join('\n')}
]
`
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/hitech/quests.ts')
writeFileSync(target, out)
console.log(`${data.quests.length} квестов → ${target}`)
