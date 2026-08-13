# 网易云歌单抽屉与登录态持久化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构播放列表抽屉的固定层级与滚动体验，并在不把真实网易云 Cookie 暴露给浏览器的前提下，通过服务端加密持久化尽可能保持网易云登录态。

**Architecture:** `PlayerFull.vue` 使用固定来源头部、固定工具栏和单一内容滚动区；来源切换和抽屉打开时显式将内容区滚动到顶部。服务端新增网易云凭证加密存储表，使用环境变量密钥进行 AES-256-GCM 加密，浏览器继续只携带已有管理员 HttpOnly 会话，不接触网易云 Cookie；服务端启动时恢复并校验加密登录态，失效时清除并要求重新扫码。

**Tech Stack:** Vue 3、Pinia、TypeScript、Hono、Node `crypto`、SQLite、Drizzle ORM、SCSS、Vite。

## Global Constraints

- 网易云真实 Cookie 不得进入 `localStorage`、普通前端 Cookie、Git、日志、memory 或 API 响应。
- 只允许保存服务端加密后的凭证；加密密钥来自环境变量 `NETEASE_COOKIE_ENCRYPTION_KEY`，缺失时禁用持久化并保持内存模式。
- 不读取本机网易云客户端文件，不提取浏览器 Cookie，不绕过验证码、风控或账号保护。
- 数据库只保存单管理员的一份网易云登录态，不保存音频文件或批量下载数据。
- 每个完成步骤单独提交并立即推送到 `origin/main`。
- 保持现有 teal + zinc 设计系统、Phosphor 图标和现有路由行为。

---

### Task 1: 添加加密网易云凭证存储基础设施

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/<generated-net-ease-session-migration>.sql` via `pnpm drizzle-kit generate`
- Modify: `.env.example` only if it exists; otherwise do not create a documentation file
- Test: `pnpm db:generate` and `pnpm db:migrate`

**Interfaces:**
- Produces `neteaseSessions` Drizzle table with one row keyed by `userKey = 'admin'` and fields `id`, `userKey`, `encryptedCookie`, `iv`, `authTag`, `createdAt`, `updatedAt`, `expiresAt`.
- `encryptedCookie`, `iv`, and `authTag` are opaque base64 strings; plaintext Cookie never leaves runtime memory.

- [ ] **Step 1: Add the table definition**

```ts
export const neteaseSessions = sqliteTable('netease_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull().unique(),
  encryptedCookie: text('encrypted_cookie').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
})
```

- [ ] **Step 2: Generate and apply the migration**

Run: `pnpm drizzle-kit generate` then `pnpm db:migrate`.
Expected: a migration adds `netease_sessions` without altering existing tables.

- [ ] **Step 3: Verify schema checks**

Run: `pnpm type-check`.
Expected: PASS.

- [ ] **Step 4: Commit and push**

```bash
git add server/db/schema.ts server/db/migrations
git commit -m "feat(auth): add encrypted netease session storage"
git push origin main
```

---

### Task 2: Implement server-side encryption and session restoration

**Files:**
- Modify: `server/app.ts`
- Modify: `server/index.ts` only if startup restoration must be explicitly invoked
- Test: add a focused Node test only if the repository already has a server test setup; otherwise run the listed smoke checks without adding a new test framework

**Interfaces:**
- Internal `encryptNeteaseCookie(cookie: string)` returns `{ encryptedCookie: string; iv: string; authTag: string }`.
- Internal `decryptNeteaseCookie(record)` returns `string | null` and rejects malformed/authentication-failed records.
- Internal `persistNeteaseCookie(cookie: string): Promise<void>` upserts the single admin row.
- Internal `restoreNeteaseCookie(): Promise<void>` decrypts the row, verifies `/api/nuser/account/get`, and clears stale records.

- [ ] **Step 1: Define the key contract**

Read `process.env.NETEASE_COOKIE_ENCRYPTION_KEY` once at module initialization. Accept a 32-byte base64 value only. If absent, do not write a database row and log only a non-sensitive warning; never print the Cookie or key.

- [ ] **Step 2: Implement AES-256-GCM helpers**

Use Node `crypto.randomBytes(12)`, `createCipheriv('aes-256-gcm', key, iv)`, `cipher.getAuthTag()`, and base64 encoding. Decryption must call `decipher.setAuthTag()` before `decipher.final()` and return `null` on any failure.

- [ ] **Step 3: Add upsert and deletion helpers**

Use Drizzle `insert(...).onConflictDoUpdate({ target: neteaseSessions.userKey, set: ... })`; delete the row when verification fails or the user disconnects. Set `expiresAt` to the upstream cookie's practical expiry only when known; otherwise leave it null and rely on every-use account verification.

- [ ] **Step 4: Restore on app startup**

Call `void restoreNeteaseCookie()` once after app creation or before serving requests. Because startup restoration is asynchronous, protected `/netease/*` handlers must call `ensureNeteaseCookieLoaded()` before returning a false unauthenticated response.

- [ ] **Step 5: Persist QR and MUSIC_U connections**

After `verifyNeteaseCookie(cookie)` succeeds in QR status and `/netease/connect`, set the in-memory Cookie and call `persistNeteaseCookie(cookie)`. The API response remains `{ connected: true }`; never return the Cookie.

- [ ] **Step 6: Clear durable state on disconnect and invalid session**

`/netease/disconnect`, failed account verification, and upstream 401/invalid-account responses must set `neteaseCookie = null` and delete the encrypted row. A service restart with a missing encryption key must not silently delete the encrypted row.

- [ ] **Step 7: Verify server behavior**

Run: `pnpm type-check`, `pnpm build-only`, and inspect `git diff` for credential leakage. Expected: PASS and no plaintext credential in response/log/source.

- [ ] **Step 8: Commit and push**

```bash
git add server/app.ts server/index.ts
git commit -m "feat(auth): persist netease login securely"
git push origin main
```

---

### Task 3: Rebuild the playlist drawer layout and scroll behavior

**Files:**
- Modify: `src/components/PlayerFull.vue`
- Test: browser smoke test using the running Vue app after authentication

**Interfaces:**
- Keep existing `openLocal()`, `openNetease()`, `resetPlaylistScroll()`, `playlist__body`, `playlist__tools`, and `playlistListEl` names where possible.
- `openLocal()` and `openNetease()` must set source and call `resetPlaylistScroll()` after `nextTick()`.

- [ ] **Step 1: Normalize the drawer DOM hierarchy**

Use exactly one scroll owner:

```vue
<div class="playlist">
  <div class="playlist__collections">来源切换 + 关闭</div>
  <div class="playlist__tools">搜索 + 分类筛选</div>
  <div class="playlist__body">
    <section v-if="source === 'netease'" class="playlist__netease">网易云状态和歌单</section>
    <div v-if="source === 'netease' && neteaseConnected && playlist.length" class="playlist__netease-now" />
    <ul class="playlist__list" />
  </div>
</div>
```

Do not place a second `playlist__bar` or nested overflow container inside `playlist__body`.

- [ ] **Step 2: Make fixed sections non-scrolling**

Set `.playlist` to `display: flex; flex-direction: column; overflow: hidden`; set `.playlist__collections` and `.playlist__tools` to `flex-shrink: 0`; set only `.playlist__body` to `flex: 1; min-height: 0; overflow-y: auto`.

- [ ] **Step 3: Fix reopen and source-switch positioning**

When `showPlaylist` changes to true, call `resetPlaylistScroll()` after `nextTick()`. When switching source, reset before/after loading so the first visible content is the selected source's header, not the previous source's saved offset.

- [ ] **Step 4: Add compact scrollbar styling**

Desktop:

```scss
.playlist__body {
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--color-accent-rgb), 0.35) transparent;
}
.playlist__body::-webkit-scrollbar { width: 4px; }
.playlist__body::-webkit-scrollbar-track { background: transparent; }
.playlist__body::-webkit-scrollbar-thumb {
  background: rgba(var(--color-accent-rgb), 0.35);
  border-radius: 999px;
}
.playlist__body::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--color-accent-rgb), 0.6);
}
```

At `max-width: 720px`, keep native touch scrolling and use `scrollbar-width: none` with `::-webkit-scrollbar { display: none; }`.

- [ ] **Step 5: Verify drawer behavior in browser**

After authenticating, verify:
1. Open drawer while local list is scrolled down; source and tools are visible.
2. Click 网易云音乐; content starts at its header without an extra manual scroll.
3. Close and reopen; the drawer opens at the configured top state.
4. Search input remains fixed while content scrolls.
5. Scrollbar is visually 4px on desktop and not an oversized gray rail.

- [ ] **Step 6: Commit and push**

```bash
git add src/components/PlayerFull.vue
git commit -m "fix(player): refine playlist drawer hierarchy"
git push origin main
```

---

### Task 4: Wire frontend connection-state restoration

**Files:**
- Modify: `src/stores/player.ts`
- Modify: `src/components/PlayerFull.vue`
- Test: browser smoke test after a refresh

**Interfaces:**
- Add `restoreNeteaseConnection(): Promise<boolean>` to the Pinia store.
- It calls `GET /api/netease/playlists`; success sets `neteaseConnected = true` and playlists; 401 sets false without showing a generic error; other errors surface through the existing UI error state.

- [ ] **Step 1: Add a restore method**

```ts
async function restoreNeteaseConnection() {
  const response = await fetch('/api/netease/playlists', { credentials: 'include' })
  if (response.status === 401) {
    neteaseConnected.value = false
    return false
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? '读取网易云歌单失败')
  neteaseConnected.value = true
  neteasePlaylists.value = data?.playlists ?? []
  return true
}
```

Use the existing admin HttpOnly session credentials; never add a `musicU` value to browser storage or a client-visible cookie.

- [ ] **Step 2: Restore on player store initialization**

Call the method once from the store initialization path, guarded so it does not cause duplicate requests during HMR. Keep the initial local music experience unaffected when restoration is unavailable.

- [ ] **Step 3: Update UI connection state**

When the user opens 网易云 and restoration is still pending, show a compact “正在恢复网易云连接…” state rather than immediately showing the QR login panel. If restoration returns false, show the existing connection entry.

- [ ] **Step 4: Verify refresh behavior**

With a valid QR login and configured encryption key, refresh the browser, open the player, switch between local and 网易云, and confirm the connection remains without a new QR scan. Expire/delete the server record and confirm the UI falls back to reconnect.

- [ ] **Step 5: Commit and push**

```bash
git add src/stores/player.ts src/components/PlayerFull.vue
git commit -m "feat(player): restore netease session on refresh"
git push origin main
```

---

### Task 5: End-to-end verification and security review

**Files:**
- Modify: only files required by failed verification; do not add credential fixtures
- Test: full repository checks and browser path

- [ ] **Step 1: Run static checks**

```bash
pnpm type-check
pnpm build-only
git diff --check
```

Expected: all PASS.

- [ ] **Step 2: Audit credential boundaries**

Run searches for `localStorage`, `sessionStorage`, response bodies, logs, and database writes involving `MUSIC_U` or `neteaseCookie`. Confirm only ciphertext fields are persisted and no endpoint returns plaintext.

- [ ] **Step 3: Run browser acceptance paths**

Verify local source, 网易云 source, close/reopen, search/filter fixed position, narrow scrollbar, QR login, page refresh restoration, expired session fallback, and manual disconnect.

- [ ] **Step 4: Commit any verification-only fix separately**

Use a new commit, never amend a prior step, then push `origin/main`.
