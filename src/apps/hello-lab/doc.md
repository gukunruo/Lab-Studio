# Hello, Lab

实验台的种子实验。验证从注册表自动发现到渲染的完整链路。

## 它做了什么

- 展示一个实时时钟（每秒更新）
- 读取 Pinia 的 locale store，演示中英文切换如何在实验内生效
- 提示去 `src/experiments/hello-lab/index.vue` 编辑代码

## 约定

每个实验是一个目录：`meta.ts` 描述元信息，`index.vue` 是组件，`doc.md`（本文件）是说明文档。放到 `src/experiments/<slug>/` 下即自动出现在列表里。

右上角「说明」按钮即你正在看的这个文档。
