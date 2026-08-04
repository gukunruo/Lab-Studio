import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from './db/client'
import { adminSessions } from './db/schema'

export const SESSION_COOKIE = 'lab_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function configuredAdmin() {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  const secret = process.env.SESSION_SECRET
  return username && password && secret ? { username, password, secret } : null
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function authenticate(c: Context): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return false
  const row = await db
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, sessionHash(token)), gt(adminSessions.expiresAt, new Date())))
    .get()
  return Boolean(row)
}

export async function requireAuth(c: Context, next: Next) {
  if (!(await authenticate(c))) return c.json({ error: 'authentication required' }, 401)
  await next()
}

export async function login(c: Context, username: string, password: string): Promise<boolean> {
  const admin = configuredAdmin()
  if (!admin || !safeEqual(username, admin.username) || !safeEqual(password, admin.password)) return false

  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  await db.insert(adminSessions).values({
    tokenHash: sessionHash(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    createdAt: now,
    lastSeenAt: now,
  })
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return true
}

export async function logout(c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, sessionHash(token)))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export function adminConfigured(): boolean {
  return Boolean(configuredAdmin())
}
