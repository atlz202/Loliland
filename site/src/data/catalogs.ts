import { HITECH } from './hitech/index.ts'
import type { Catalog } from './types.ts'

const CATALOGS: Record<string, Catalog> = { hitech: HITECH }

/** Каталог заданий сервера. Для сервера без каталога вернёт null. */
export const catalogOf = (server: string): Catalog | null => CATALOGS[server] ?? null
