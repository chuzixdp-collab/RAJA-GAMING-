import { PrismaClient } from '@prisma/client'
import net from 'net'
import { spawn } from 'child_process'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __rajaDbReady: Promise<void> | undefined
}

/**
 * DEV ONLY: ensure the embedded local PostgreSQL is running.
 * It is spawned as a detached child of the dev server process so it stays
 * alive with the supervised dev server. Production (Neon) is unaffected:
 * guarded by USE_EMBEDDED_PG=1 which only exists in local .env.
 */
function ensureLocalDb(): Promise<void> {
  if (process.env.USE_EMBEDDED_PG !== '1') return Promise.resolve()
  if (globalForPrisma.__rajaDbReady) return globalForPrisma.__rajaDbReady

  globalForPrisma.__rajaDbReady = (async () => {
    const portOpen = () =>
      new Promise<boolean>((resolve) => {
        const s = new net.Socket()
        s.setTimeout(1000)
        s.once('connect', () => { s.destroy(); resolve(true) })
        s.once('timeout', () => { s.destroy(); resolve(false) })
        s.once('error', () => { s.destroy(); resolve(false) })
        s.connect(5432, '127.0.0.1')
      })

    if (!(await portOpen())) {
      try {
        const child = spawn('bun', ['scripts/dev-db.ts'], {
          cwd: process.cwd(),
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
      } catch {
        // ignore — will surface as a query error if the DB truly cannot start
      }
    }

    // wait up to 30s for the database to accept connections
    for (let i = 0; i < 60; i++) {
      if (await portOpen()) return
      await new Promise((r) => setTimeout(r, 500))
    }
  })()

  return globalForPrisma.__rajaDbReady
}

export const db =
  globalForPrisma.prisma ??
  (() => {
    // kick off local db ensure (no-op in production)
    void ensureLocalDb()
    return new PrismaClient({
      log: ['error'],
    })
  })()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
