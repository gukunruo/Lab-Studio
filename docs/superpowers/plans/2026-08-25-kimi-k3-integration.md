# Kimi K3 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kimi K3 to AI Playground, evaluate it with the existing benchmark, and show it in the five-model composite recommendation only if its measured rank qualifies.

**Architecture:** Kimi K3 is a new `openai-compatible` chat seed whose existing upsert path makes it available through the model endpoint. The proxy adds Kimi's documented `reasoning` payload when chat parameters request a thinking effort. The existing benchmark discovers chat models from the seed list; its generated report becomes the source of truth for manually updating the explicit, five-entry recommendation list.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle ORM, Node.js built-in test runner via `tsx`, OpenAI-compatible streaming API.

## Global Constraints

- Kimi K3 has `modelId` `kimi-k3`, display name `Kimi K3`, vendor `moonshot`, category `chat`, and provider `openai-compatible`.
- Kimi K3 exposes `streaming` and `reasoning_mode`, a 1,000,000-token context window, 50 RPM, and 500,000 TPM.
- Kimi's upstream request uses the existing TAL OpenAI-compatible endpoint and authorization headers; never log or commit credentials.
- Benchmark tasks and weighting remain unchanged: five tasks; quality 65%, success rate 20%, speed 15%.
- Only models completing all five tasks may be ranked; a failed Kimi K3 run must not change the existing five recommended models.
- “综合推荐” always contains exactly five model IDs in descending composite-score order; models outside it remain selectable under “其他对话模型”.
- Each completed task is committed and pushed to `origin/main` before starting the next task.

---

## File Structure

- `server/ai-platform-seed.ts` — declarative Kimi K3 model metadata, seeded/upserted with all other models.
- `server/ai-platform.ts` — maps Playground thinking effort to Kimi's OpenAI-compatible `reasoning` request field.
- `tests/ai-platform-models.test.ts` — validates Kimi K3's identity, metadata, and inclusion among valid seed models.
- `tests/ai-platform-proxy.test.ts` — validates the exact Kimi K3 upstream request body without network access.
- `tests/ai-platform-benchmark.test.ts` — validates that the benchmark inventory contains 17 non-image models including Kimi K3.
- `data/ai-platform-benchmarks/<run-start>.json` — committed real benchmark evidence produced by the run.
- `docs/ai-platform-model-benchmark.md` — regenerated benchmark report containing Kimi K3 metrics and rank or failure reason.
- `src/ai-platform/components/ModelSelector.vue` — manually synchronizes the five explicit composite recommendations to the completed benchmark's top-five rows.

## Task 1: Seed Kimi K3 and Forward Its Thinking Parameters

**Files:**
- Modify: `server/ai-platform-seed.ts:17-38`
- Modify: `server/ai-platform.ts:273-323`
- Modify: `tests/ai-platform-models.test.ts:4-63`
- Modify: `tests/ai-platform-proxy.test.ts:11-192`
- Modify: `tests/ai-platform-benchmark.test.ts:12-18`

**Interfaces:**
- Consumes: `SeedModel` fields defined in `server/ai-platform-seed.ts:4-15` and `ChatRequestBody.params.reasoningEffort` defined in `server/ai-platform.ts:79-84`.
- Produces: a seeded `aiModels` record for `kimi-k3`, and `buildUpstreamRequest()` output with `reasoning: { mode: 'enabled', effort: 'low' | 'medium' | 'high' }` for Kimi K3.

- [ ] **Step 1: Add a failing Kimi K3 seed-metadata test**

In `tests/ai-platform-models.test.ts`, add this test after the required-model assertions:

```ts
test('Kimi K3 has the documented chat configuration', () => {
  const model = SEED_MODELS.find((candidate) => candidate.modelId === 'kimi-k3')
  assert.deepEqual(model, {
    modelId: 'kimi-k3',
    displayName: 'Kimi K3',
    provider: 'openai-compatible',
    category: 'chat',
    vendor: 'moonshot',
    capabilities: ['streaming', 'reasoning_mode'],
    contextWindow: 1_000_000,
    rpmLimit: 50,
    tpmLimit: 500_000,
    sortOrder: 31,
  })
})
```

- [ ] **Step 2: Add a failing benchmark-discovery assertion**

In the first test in `tests/ai-platform-benchmark.test.ts`, replace the model-count line with:

```ts
assert.equal(models.length, 17)
assert.ok(models.some((model) => model.modelId === 'kimi-k3'))
```

Keep the existing five-task assertions unchanged.

- [ ] **Step 3: Run the seed and benchmark tests to verify they fail**

Run:

```bash
npx tsx --test tests/ai-platform-models.test.ts tests/ai-platform-benchmark.test.ts
```

Expected: FAIL because no `kimi-k3` seed exists and the benchmark still discovers only 16 models.

- [ ] **Step 4: Add a failing proxy-payload test**

In `tests/ai-platform-proxy.test.ts`, add this test:

```ts
test('buildUpstreamRequest enables Kimi K3 thinking with the selected effort', () => {
  const result = buildUpstreamRequest({
    modelId: 'kimi-k3',
    messages: [{ role: 'user', content: '解释数据库索引' }],
    params: { reasoningEffort: 'high' },
  }, {
    provider: 'openai-compatible',
    modelId: 'kimi-k3',
    baseUrl: 'https://ai.example.test/',
    appId: 'test-app',
    appKey: 'test-key',
  })

  assert.equal(result.url, 'https://ai.example.test/openai-compatible/v1/chat/completions')
  assert.deepEqual(JSON.parse(result.body), {
    model: 'kimi-k3',
    messages: [{ role: 'user', content: '解释数据库索引' }],
    stream: true,
    reasoning: { mode: 'enabled', effort: 'high' },
  })
})
```

- [ ] **Step 5: Run the proxy test to verify it fails**

Run:

```bash
npx tsx --test tests/ai-platform-proxy.test.ts
```

Expected: FAIL because Kimi K3 currently receives `reasoning_effort` rather than a `reasoning` object.

- [ ] **Step 6: Add the minimal Kimi K3 seed**

Insert this entry immediately after `glm-5.2` in `server/ai-platform-seed.ts`:

```ts
{ modelId: 'kimi-k3', displayName: 'Kimi K3', provider: 'openai-compatible', category: 'chat', vendor: 'moonshot', capabilities: ['streaming', 'reasoning_mode'], contextWindow: 1_000_000, rpmLimit: 50, tpmLimit: 500_000, sortOrder: 31 },
```

- [ ] **Step 7: Send Kimi's documented reasoning object**

In `buildUpstreamRequest()` in `server/ai-platform.ts`, retain the Doubao branch unchanged and add a Kimi-specific branch before the generic `reasoning_effort` branch:

```ts
} else if (modelId === 'kimi-k3') {
  payload.reasoning = {
    mode: 'enabled',
    effort: body.params?.reasoningEffort ?? 'low',
  }
} else if (body.params?.reasoningEffort) {
```

- [ ] **Step 8: Run focused tests to verify they pass**

Run:

```bash
npx tsx --test tests/ai-platform-models.test.ts tests/ai-platform-proxy.test.ts tests/ai-platform-benchmark.test.ts
```

Expected: PASS; the Kimi metadata, exact proxy payload, and 17-model benchmark inventory match the assertions.

- [ ] **Step 9: Run type checking**

Run:

```bash
npm run type-check
```

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 10: Commit and push Task 1**

Run:

```bash
git add server/ai-platform-seed.ts server/ai-platform.ts tests/ai-platform-models.test.ts tests/ai-platform-proxy.test.ts tests/ai-platform-benchmark.test.ts
git commit -m "feat(ai): add Kimi K3 chat model"
git push origin main
```

Expected: one commit containing only Task 1 files is on `origin/main`.

## Task 2: Include Kimi K3 in the Benchmark and Generate Real Evidence

**Files:**
- Create: `data/ai-platform-benchmarks/<ISO-8601-start-time-with-colons-replaced>.json`
- Modify: `docs/ai-platform-model-benchmark.md`

**Interfaces:**
- Consumes: `SEED_MODELS`, `getBenchmarkModels()`, `BENCHMARK_TASKS`, `readCredentials()`, and the committed model seed from Task 1.
- Produces: one five-result Kimi K3 dataset and a report with Kimi K3's observed status and rank.

- [ ] **Step 1: Confirm the benchmark inventory is ready**

Run:

```bash
npx tsx --test tests/ai-platform-benchmark.test.ts
```

Expected: PASS; `getBenchmarkModels()` includes Kimi K3 and defines exactly five fixed tasks.

- [ ] **Step 2: Run the real, full 17-model benchmark**

Run:

```bash
npm run benchmark:ai
```

Expected: the script creates one new `data/ai-platform-benchmarks/*.json` file and regenerates `docs/ai-platform-model-benchmark.md`. Never print `TAL_MLOPS_APP_ID`, `TAL_MLOPS_APP_KEY`, or request headers.

- [ ] **Step 3: Validate Kimi's generated evidence**

Run:

```bash
node -e "const fs=require('fs'); const dir='data/ai-platform-benchmarks'; const file=fs.readdirSync(dir).filter((name)=>name.endsWith('.json')).sort().at(-1); const run=JSON.parse(fs.readFileSync(dir+'/'+file,'utf8')); const results=run.results.filter((result)=>result.modelId==='kimi-k3'); if(results.length!==5) throw new Error('expected five Kimi K3 results'); console.log(file, results.map(({taskId,status,qualityScore})=>({taskId,status,qualityScore})))"
```

Expected: exactly one Kimi K3 result for each of `general`, `reasoning`, `code`, `summary`, and `structured`. If any is not `completed`, retain the regenerated failure report, do not modify the recommendation list, and continue with the Task 2 commit only.

- [ ] **Step 4: Run the benchmark test again**

Run:

```bash
npx tsx --test tests/ai-platform-benchmark.test.ts
```

Expected: PASS after the real-run artifacts are generated.

- [ ] **Step 5: Commit and push Task 2**

Run:

```bash
git add data/ai-platform-benchmarks docs/ai-platform-model-benchmark.md
git commit -m "test(ai): benchmark Kimi K3"
git push origin main
```

Expected: one commit containing the new timestamped raw benchmark result and the regenerated report.

## Task 3: Synchronize the Composite Recommendation with the Measured Top Five

**Files:**
- Modify: `src/ai-platform/components/ModelSelector.vue:13-26`
- Test: manual browser verification against `docs/ai-platform-model-benchmark.md`

**Interfaces:**
- Consumes: the ranked rows in the Task 2 report and `modelsStore.chatModels`.
- Produces: `recommendedModelIds`, a literal array of exactly five eligible model IDs in report rank order; every non-recommended chat model, including Kimi K3 when it misses the cutoff, remains in `otherChatModels()`.

- [ ] **Step 1: Inspect eligibility before touching the selector**

Open `docs/ai-platform-model-benchmark.md` and find the `kimi-k3` row in the “综合榜单”. Apply this rule exactly:

```text
If Kimi K3 has a numeric 综合分 and rank 1 through 5,
recommendation IDs are report rows 1 through 5 in numeric rank order.
Otherwise, preserve the existing five recommendation IDs unchanged.
```

This prevents a failed or incomplete Kimi run from changing the visible recommendation set.

- [ ] **Step 2: Update the literal recommendation order**

In `src/ai-platform/components/ModelSelector.vue`, replace the five strings in `recommendedModelIds` with the five IDs selected by Step 1, in ascending numeric rank order. Keep the array length at five and do not add Kimi K3 merely because it was seeded.

Use the report's actual `model` values, not display names. For example, a row labeled “GLM 5.2” maps to the literal `glm-5.2`; a row labeled “Kimi K3” maps to `kimi-k3`. Keep the existing array declaration and its five entries rather than introducing a new runtime data source.

- [ ] **Step 3: Run static validation**

Run:

```bash
npm run type-check && npx tsx --test tests/ai-platform-models.test.ts tests/ai-platform-proxy.test.ts tests/ai-platform-benchmark.test.ts
```

Expected: PASS; Kimi K3 remains a valid seed, its proxy mapping is preserved, and the benchmark inventory remains 17 models.

- [ ] **Step 4: Start the app for visual verification**

Run:

```bash
npm run dev:all
```

Expected: Vite and the API server start successfully. Open the AI Playground in a browser, open the model selector, and verify:

1. “综合推荐” shows exactly five entries in the same order as the top five numeric ranks in the benchmark report.
2. Kimi K3 appears in “综合推荐” only when its report rank is 1–5; otherwise it appears under “其他对话模型”.
3. Kimi K3 displays `moonshot` as its vendor and can be selected.
4. Send one short chat prompt using Kimi K3 at `high` reasoning effort; it streams a response without a browser-console error.

- [ ] **Step 5: Commit and push Task 3**

Run:

```bash
git add src/ai-platform/components/ModelSelector.vue
git commit -m "feat(ai): rank Kimi K3 recommendations"
git push origin main
```

Expected: one commit containing only the final recommendation-order change. If Kimi K3 did not qualify, skip this commit because the source is intentionally unchanged.

## Final Verification

- [ ] **Step 1: Review the published diff and working tree**

Run:

```bash
git log --oneline -3
git status --short
git diff origin/main...HEAD
```

Expected: the Kimi commits are present on `main`, and no unrelated pre-existing edits were added to them.

- [ ] **Step 2: Confirm the report and UI agree**

Compare the five numeric rows at the top of `docs/ai-platform-model-benchmark.md` with `recommendedModelIds` in `src/ai-platform/components/ModelSelector.vue`. If Kimi's benchmark failed or has no numeric score, confirm it is absent from the five IDs and visible in “其他对话模型”.
