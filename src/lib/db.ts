import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
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

/**
 * Production/serverless (Netlify + Neon): Prisma's native query engine cannot
 * complete its connection to Neon's proxy (P1001 "Can't reach database server"
 * on both the direct and pooled endpoints, while node-postgres over the exact
 * same TCP+TLS path succeeds — verified 2026-10-31 from three independent
 * networks). The officially supported workaround is a driver adapter, which
 * routes all connections through node-postgres (Node's TLS stack).
 *
 * Uses DATABASE_URL (the pooled Neon endpoint) exactly as before, so no
 * environment configuration changes.
 */
function makeClient(): PrismaClient {
  // kick off local db ensure (no-op in production)
  void ensureLocalDb()
  if (process.env.USE_EMBEDDED_PG === '1') {
    // Local development: native engine against the embedded local PostgreSQL.
    return new PrismaClient({ log: ['error'] })
  }
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter, log: ['error'] })
}

export const db = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
