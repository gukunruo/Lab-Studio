# AI Playground 模型综合评测

- 运行开始：2026-08-25T08:25:24.839Z
- 运行结束：2026-08-25T08:36:24.852Z
- 评测任务：通用问答、逻辑推理、TypeScript 代码、受限摘要、结构化 JSON
- 可正式排名模型：13/17（仅五项任务均完成的模型参与排名）
- 综合分：质量 65% + 成功率 20% + 速度 15%；速度同时考虑平均首 token 延迟与平均总时长。

## 综合榜单

| 排名 | 模型 | 完成/失败/跳过 | 成功率 | 质量 | 平均 TTFT (ms) | 平均总时长 (ms) | 综合分 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | deepseek-v4-pro | 5/0/0 | 100% | 1.00 | 986 | 2247 | 93.2 |
| 2 | doubao-seed-2.0-mini | 5/0/0 | 100% | 0.93 | 431 | 987 | 92.7 |
| 3 | gpt-5.4 | 5/0/0 | 100% | 1.00 | 1335 | 2314 | 92.0 |
| 4 | glm-5.2 | 5/0/0 | 100% | 0.95 | 687 | 1707 | 91.8 |
| 5 | deepseek-v4-flash | 5/0/0 | 100% | 0.95 | 1108 | 1786 | 90.3 |
| 6 | claude-sonnet-5 | 5/0/0 | 100% | 1.00 | 1914 | 2757 | 89.4 |
| 7 | claude-sonnet-4.6 | 5/0/0 | 100% | 1.00 | 1952 | 2690 | 89.4 |
| 8 | claude-opus-4.8 | 5/0/0 | 100% | 1.00 | 1933 | 2875 | 89.2 |
| 9 | claude-opus-4.7 | 5/0/0 | 100% | 1.00 | 2051 | 2733 | 89.0 |
| 10 | claude-opus-5 | 5/0/0 | 100% | 1.00 | 2314 | 3294 | 87.3 |
| 11 | gpt-5.6-sol | 5/0/0 | 100% | 1.00 | 2721 | 3613 | 85.5 |
| 12 | claude-opus-4.6 | 5/0/0 | 100% | 0.93 | 2188 | 2986 | 83.8 |
| 13 | gpt-5.5 | 5/0/0 | 100% | 0.95 | 2837 | 3673 | 81.7 |
| — | deepseek-chat | 0/5/0 | 0% | — | — | — | — |
| — | gemini-3-pro-preview | 0/5/0 | 0% | — | — | — | — |
| — | kimi-k3 | 4/1/0 | 80% | 1.00 | 10066 | 12233 | — |
| — | kimi-k2-7-code | 0/5/0 | 0% | — | — | — | — |

## 使用建议

- 日常默认：deepseek-v4-pro（本轮综合分最高；请在确认连续多轮结果稳定后再更新产品默认值）。
- 代码、推理、长文本和结构化输出的推荐应以对应任务的单项原始结果为准；本表不把失败或跳过伪装为低质量。

## 失败与跳过说明

- deepseek-chat / general：failed（http_error, HTTP 403）
- deepseek-chat / reasoning：failed（http_error, HTTP 403）
- deepseek-chat / code：failed（http_error, HTTP 403）
- deepseek-chat / summary：failed（http_error, HTTP 403）
- deepseek-chat / structured：failed（http_error, HTTP 403）
- gemini-3-pro-preview / general：failed（http_error, HTTP 403）
- gemini-3-pro-preview / reasoning：failed（http_error, HTTP 403）
- gemini-3-pro-preview / code：failed（http_error, HTTP 403）
- gemini-3-pro-preview / summary：failed（http_error, HTTP 403）
- gemini-3-pro-preview / structured：failed（http_error, HTTP 403）
- kimi-k3 / general：failed（http_error, HTTP 429）
- kimi-k2-7-code / general：failed（http_error, HTTP 403）
- kimi-k2-7-code / reasoning：failed（http_error, HTTP 403）
- kimi-k2-7-code / code：failed（http_error, HTTP 403）
- kimi-k2-7-code / summary：failed（http_error, HTTP 403）
- kimi-k2-7-code / structured：failed（http_error, HTTP 403）
