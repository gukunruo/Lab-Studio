# Lab Studio 服务端目标与规划

## 目标

为 Lab Studio 建立一个可持续扩展的 Node.js 服务端：

1. 生产环境提供 `/api`，不依赖 Vite 开发中间件。
2. AI 密钥和上游请求只留在服务端，浏览器只访问 Lab Studio API。
3. 为学习进度、笔记和 AI 学习会话建立可迁移的数据基础。

本阶段不把前端一次性改成全量服务端应用，也不提前加入认证、复杂 RAG、队列或多租户。

## 技术决策

- **运行时**：Node.js 22+
- **HTTP 框架**：Hono + `@hono/node-server`
- **数据库**：SQLite
- **ORM**：Drizzle ORM
- **迁移工具**：Drizzle Kit
- **部署形态**：一个 Node 进程提供 API，并在生产环境托管 `dist/`
- **代码位置**：与当前 Vue/Vite 项目同仓库，服务端代码放在 `server/`

同仓库适合当前单人、小规模项目：前后端类型和部署配置可以一起演进，避免过早拆分仓库。未来如果服务端需要独立团队、独立扩容或独立发布，再拆仓库即可。

## 当前实现

- `server/index.ts`：Node 入口，默认监听 `8787`。
- `server/app.ts`：Hono app、健康检查、学习数据 API、AI 流式代理、静态文件托管。
- `server/db/schema.ts`：学习进度和聊天会话表。
- `server/db/client.ts`：SQLite 连接，默认数据库为 `data/lab-studio.db`。
- `server/db/migrate.ts`：执行 Drizzle migrations。
- `drizzle.config.ts`：Drizzle Kit 配置。
- `server/db/migrations/`：已生成的首个数据库迁移。

开发期仍保留 `vite-ai-proxy.ts`，因此 `pnpm dev` 的现有体验不变。生产或独立调试服务端使用 `pnpm server`。

## 数据模型

### `learning_progress`

按 `user_key` 保存课程完成状态、最后打开课程、笔记和步骤位置。当前默认使用单用户 key，认证接入后再替换为真实用户 ID。

### `chat_sessions`

按用户和课程保存 AI 助教消息。当前通过 `/api/chat-sessions/:lessonId` 提供读写，前端写入服务端失败时仍保留本地状态。

### `admin_profile`

保存单管理员的显示名称和头像 URL。表中固定使用 `id = 1`，不保存密码；没有资料记录时使用 `.env` 中的管理员账号作为默认显示名称。

资料接口：

- `GET /api/profile`：读取当前管理员资料，需要登录。
- `PUT /api/profile`：更新 `displayName` 和 `avatarUrl`，需要登录；显示名称限制为 1–40 个字符，头像 URL 限制为最多 500 个字符。

登录态接口 `/api/auth/me` 同时返回 `username` 和 `avatarUrl`，因此刷新页面后 Header 可以恢复资料显示。

## 当前 API 契约

- `GET /api/health`：服务存活检查。
- `GET /api/progress?userKey=...`：读取学习进度。
- `PUT /api/progress`：写入学习进度，包含 `userKey`、`completed`、`lastOpened`、`notes`、`stepIndex`。
- `GET /api/chat-sessions/:lessonId?userKey=...`：读取课程会话。
- `PUT /api/chat-sessions/:lessonId`：写入课程会话，包含 `userKey`、`messages`。
- `GET /api/ai/config`：返回脱敏 AI 配置状态。
- `POST /api/ai/chat`：服务端代理上游流式 AI 响应。

当前采用单管理员账号认证：账号密码通过本地 `.env` 配置，服务端使用 HttpOnly Cookie 保存 Session，业务数据固定归属于管理员身份。密码和真实 `.env` 不进入 Git；当前方案适合个人私有使用，不是多用户注册系统。

认证接口：

- `POST /api/auth/login`：验证管理员账号密码并设置 Session Cookie。
- `GET /api/auth/me`：恢复当前登录态。
- `POST /api/auth/logout`：删除当前 Session。

前端不把密码或 Session Token 写入 localStorage；刷新和重启通过 `/api/auth/me` 恢复登录态，换电脑后重新输入同一组账号密码即可。

正式公开部署前仍需 HTTPS、登录限流和更严格的安全配置。

## 登录配置

本地 `.env` 示例：

```env
ADMIN_USERNAME=gukunruo
ADMIN_PASSWORD=你的密码
SESSION_SECRET=随机长字符串
```

`.env` 已被 Git 忽略，仓库只提交 `.env.example`。

## 业务 API 的认证边界

学习进度、聊天会话和 AI API 都要求有效的管理员 Session。服务端不再信任前端提交的 `userKey`，而是使用固定的管理员数据归属键；后续如果增加多用户，再将其替换为真实用户 ID。

## 数据重置行为

当前是单管理员账号，不存在匿名身份。清除浏览器 Cookie 后，用户需要重新登录，但 SQLite 中的数据不会自动删除；重新登录后仍可读取原有数据。若未来需要“重置所有学习数据”按钮，应增加明确的二次确认和服务端删除接口。

## 当前认证限制

- 只有一个管理员账号，没有注册、找回密码或角色系统。
- 修改密码需要更新部署环境的 `.env`。
- Session 当前保存 30 天。
- 该方案适合个人私有部署，不适合直接作为公开 SaaS 认证系统。

## 旧的身份方案

此前的 `local-user` 仅用于开发阶段，已不再由前端提交，也不应作为公网身份认证方案。

## 当前 API 契约

- `GET /api/health`：服务存活检查。
- `POST /api/auth/login`：管理员登录。
- `GET /api/auth/me`：读取当前登录态。
- `POST /api/auth/logout`：退出登录。
- `GET /api/progress`：读取学习进度，需要登录。
- `PUT /api/progress`：写入学习进度，需要登录。
- `GET /api/chat-sessions`：读取全部课程会话，需要登录。
- `GET /api/chat-sessions/:lessonId`：读取单课程会话，需要登录。
- `PUT /api/chat-sessions/:lessonId`：写入课程会话，需要登录。
- `GET /api/ai/config`：返回脱敏 AI 配置状态，需要登录。
- `POST /api/ai/chat`：服务端代理上游流式 AI 响应，需要登录。

## 路线

### 阶段 1：服务端骨架（已完成）

- Hono API 和生产静态托管
- AI 密钥只在 Node 端
- SQLite + Drizzle schema
- migration 生成/执行命令
- `/api/health` 健康检查

### 阶段 2：持久化学习数据（已完成）

- `/api/progress` 和 `/api/chat-sessions` 接口
- 前端 Pinia store 自动同步 API
- 保留 localStorage 作为离线 fallback
- 基础请求体校验
- 管理员 Cookie Session 认证

### 阶段 3：边界能力（下一阶段）

- 登录限流
- 更完整的输入校验、请求体大小限制
- 统一错误格式和结构化日志
- AI 请求超时、重试策略和用量记录

### 阶段 4：产品能力（后续）

- 学习内容检索和 RAG
- 播放器偏好持久化
- 多设备登录态管理
- 后台任务或队列（确实需要时再引入）

### 阶段 5：数据库迁移（按需求触发）

- SQLite 数据量、并发或部署约束达到阈值后评估 PostgreSQL
- 新建目标数据库 schema 与迁移脚本
- 先做备份、导入、读写校验，再切换 `DATABASE_URL`
- 保留 SQLite 迁移链和回滚方案，确认切换稳定后再清理

## SQLite 能否迁移到其他数据库？

可以。Drizzle 的 schema 和迁移机制支持后续迁移到 PostgreSQL 等数据库。迁移时通常需要：

1. 新增对应数据库驱动和连接配置。
2. 将 schema 从 `drizzle-orm/sqlite-core` 调整为目标数据库 core。
3. 重新生成并审核迁移 SQL。
4. 做一次数据导出、导入和回滚演练。
5. 更新部署环境的 `DATABASE_URL`。

这不是完全无差异切换。SQLite 的 JSON、时间、并发和类型约束与 PostgreSQL 存在差异，迁移前要审核相关字段和查询。当前 schema 刻意保持简单，后续迁移成本可控。

数据库迁移不是默认动作，以下情况出现时再做评估：

- 需要多实例并发写入
- 需要云端托管和自动备份
- 数据量或查询复杂度明显超过 SQLite 舒适范围
- 需要 PostgreSQL 的原生能力，例如 `pgvector`

## 安全边界

- `ANTHROPIC_API_KEY` 永远不进入前端构建产物或 API 响应。
- `/api/ai/config` 只返回可用状态、模型名和脱敏后的 base URL。
- 上游 AI 请求只由 Node 服务端发起。
- 生产环境部署前必须补充 HTTPS、登录限流、请求体校验和安全日志，不能把当前开发配置直接暴露给公网。

## 路线

### 阶段 1：服务端骨架（已完成）

- Hono API 和生产静态托管
- AI 密钥只在 Node 端
- SQLite + Drizzle schema
- migration 生成/执行命令
- `/api/health` 健康检查

### 阶段 2：持久化学习数据（基础版已完成）

- `/api/progress` 和 `/api/chat-sessions` 接口
- 前端 Pinia store 自动同步 API
- 保留 localStorage 作为离线 fallback
- 基础请求体校验

下一步仍需处理同步冲突、清空数据的服务端语义和正式用户身份。

### 阶段 3：边界能力（下一阶段）

- 认证与用户身份
- 更完整的输入校验、请求体大小限制、限流
- 统一错误格式和结构化日志
- AI 请求超时、重试策略和用量记录

### 阶段 4：产品能力（后续）

- 学习内容检索和 RAG
- 多设备进度同步
- 后台任务或队列（确实需要时再引入）

### 阶段 5：数据库迁移（按需求触发）

- SQLite 数据量、并发或部署约束达到阈值后评估 PostgreSQL
- 新建目标数据库 schema 与迁移脚本
- 先做备份、导入、读写校验，再切换 `DATABASE_URL`
- 保留 SQLite 迁移链和回滚方案，确认切换稳定后再清理

## SQLite 能否迁移到其他数据库？

可以。Drizzle 的 schema 和迁移机制支持后续迁移到 PostgreSQL 等数据库。迁移时通常需要：

1. 新增对应数据库驱动和连接配置。
2. 将 schema 从 `drizzle-orm/sqlite-core` 调整为目标数据库 core。
3. 重新生成并审核迁移 SQL。
4. 做一次数据导出、导入和回滚演练。
5. 更新部署环境的 `DATABASE_URL`。

这不是完全无差异切换。SQLite 的 JSON、时间、并发和类型约束与 PostgreSQL 存在差异，迁移前要审核相关字段和查询。当前 schema 刻意保持简单，后续迁移成本可控。

数据库迁移不是默认动作，以下情况出现时再做评估：

- 需要多实例并发写入
- 需要云端托管和自动备份
- 数据量或查询复杂度明显超过 SQLite 舒适范围
- 需要 PostgreSQL 的原生能力，例如 `pgvector`

## 安全边界

- `ANTHROPIC_API_KEY` 永远不进入前端构建产物或 API 响应。
- `/api/ai/config` 只返回可用状态、模型名和脱敏后的 base URL。
- 上游 AI 请求只由 Node 服务端发起。
- 生产环境部署前必须补充认证、限流和请求体校验，不能把当前开发代理直接暴露给公网。
