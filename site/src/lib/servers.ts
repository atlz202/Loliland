// Серверы Loliland. При добавлении сервера допиши его id и в firestore.rules (knownServer).
export interface Server {
  id: string
  name: string
}

export const SERVERS: Server[] = [{ id: 'hitech', name: 'HiTech' }]

export const serverName = (id: string) => SERVERS.find((s) => s.id === id)?.name ?? id
