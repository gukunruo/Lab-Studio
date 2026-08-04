# lab-studio

个人前端实验台（Vue 3 + Vite）。含 Lab 应用、3D World，以及 **AI 应用学院**学习板块。

## AI 学习（可携带）

课表与人设文档在 [`docs/ai-learning/`](./docs/ai-learning/README.md)。  
换 Cursor / Claude / ChatGPT 时按 [`HOW-TO-RESUME.md`](./docs/ai-learning/HOW-TO-RESUME.md) 续学。  
应用内入口：顶栏右侧 **Learn** → `/learn`。

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev:all
```

`dev:all` 会同时启动 Vite 前端和 Hono 服务端。生产环境使用 `pnpm build && pnpm server`。

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
