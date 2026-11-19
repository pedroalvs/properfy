# X03 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Total** | **3,0 dias** (plano: 2,25). Delta de +0,75 justificado em "Dias" abaixo (+0,25 da revisão original; +0,5 das lacunas L-X03-01..09, 2026-10-29) |
| **Tarefas** | 1: TASK-X03-1 = PR1 (pwa: testes E2E + config Playwright + job de CI + docs) |
| **Depende de** | Nada no código. A X00 (Onda 0) entra antes: o §16 do `CLAUDE.md` raiz já terá o build do `frontend-standards` (Bloco R22) e esta tarefa reverte os **quatro** avisos "56/56 … until X03" que a X00 grava (ver Passo 9, L-X03-09). Pela ordem das ondas, a F01 (heartbeat `app-state`) também já estará em `develop` (L-X03-05) |
| **Bloqueia** | TASK-F04-3b (specs E1–E6 do tour, critério 00.A1 por E2E) |
| **Base verificada** | Snapshot de `origin/develop` @042a9674 (2026-10-24). Abreviações: `PWA = apps/pwa`, `WEB = apps/web`, `CI = .github/workflows/ci.yml` |
| **PR** | ~15 arquivos (4 specs, `support/` novo com `global-setup.ts`, `api.ts`, `auth.ts`, `fixtures.ts`, `projects.ts` e `idb.ts`, o teste Vitest das fixtures, `playwright.config.ts`, `ci.yml`, `PWA/CLAUDE.md`, opcionalmente `vite.config.ts`, `.gitignore` e o `CLAUDE.md` raiz). Bem abaixo do limite de 150 |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-X03-1 | Recuperar a suíte E2E do PWA (diagnóstico, correção do harness, drift das specs, job de CI, docs) | 3,0 | – |

---

## TASK-X03-1 · Recuperar a suíte E2E do PWA

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1
> - **Desbloqueia:** TASK-F04-3b
> - **Pode rodar em paralelo com:** TASK-X01-1, TASK-X02-1, TASK-F00-1, TASK-F03-1
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo

A suíte Playwright do PWA (`PWA/tests/e2e`, 4 specs × 4 projetos = 56 testes) precisa voltar a dar sinal:

- **verde e determinística** num worktree limpo de `develop`, localmente e no CI;
- **hermética**: nenhuma chamada sai para `localhost:3000`, Mapbox ou qualquer host real;
- rodando num **job de CI novo** (`test-pwa-e2e`), espelhado no `test-web-e2e`. O job precisa ficar **vermelho de verdade** quando uma asserção quebra.

Com isso a F04-3b consegue escrever as specs do tour (E1–E6) sobre um harness confiável e com helpers de mock prontos.

### Contexto no código

**Config e scripts**
- `PWA/playwright.config.ts`:
  - `testDir './tests/e2e'`, `baseURL 'http://localhost:5173'`, `trace 'on-first-retry'`, `reporter 'html'`, `retries` 2 no CI, `workers` 1 no CI;
  - `webServer: { command: 'pnpm dev', port: 5173, reuseExistingServer: !process.env.CI }`;
  - 4 projetos: `Mobile Safari` (iPhone 13, **WebKit**), `Mobile Chrome` (Pixel 5), `Tablet (iPad portrait)` (iPad gen 7, **WebKit**) e `Foldable open` (Pixel 5 em 840×1080). Os dois últimos ficam ≥ `md` e caem no layout largo (two-pane).
- `PWA/package.json`: `"dev": "vite"` (porta padrão 5173, **a mesma do web**: `WEB/package.json` também é `"dev": "vite"`) e `"test:e2e": "playwright test"`. `@playwright/test ^1.59.1`.
- `PWA/vite.config.ts`: `VitePWA({ registerType: 'autoUpdate', workbox: {...} })`. Sem `devOptions`, então **não há service worker em `vite dev`**. Sem `server.port`, sem `strictPort`, sem `optimizeDeps`.
- `PWA/src/config/env.ts`: `apiBaseUrl` cai para `'http://localhost:3000'` e `mapboxToken` para `''` quando o `VITE_*` falta. `.env.example` lista só esses dois.
- `useMapboxInstance.ts:61`: com token vazio o mapa **não inicializa**, então não sai request para `api.mapbox.com`.

**Bootstrap**
- `main.tsx` → `App.tsx`. `App.tsx` importa `TIMING` de `@properfy/frontend-standards` no topo (desde `e12220ea`, 2026-10-10).
- `router.tsx` importa `retryLazyImportOnce` de `@properfy/shared`.
- Ordem dos providers: `ErrorBoundary` → `QueryProvider` → `SnackbarProvider` → `InstallPromptProvider` → `AuthProvider` → `OfflineQueueSync` (IndexedDB) → `RouterProvider`.
- Todas as páginas são `lazy` (`lazyRetry`). `/login` é rota pública.
- **Os dois pacotes de workspace só resolvem para `dist/`.** `packages/shared/package.json` e `packages/frontend-standards/package.json` têm `exports["."].import.default = ./dist/index.js`, e `dist/` está no `.gitignore`. O Vite dev resolve pelos `exports`, sem alias para `src`.
- Guardas:
  - `ProtectedRoute`: `isLoading` → skeleton; `!isAuthenticated` → `/login` (salva o redirect).
  - `InspectorAuthGuard`: `!user` → `/login`; `role !== INSP` → `/access-denied`.
- `useAuth.tsx`:
  - com `access_token` no `localStorage`, chama `api.GET('/v1/me')` (openapi-fetch, `baseUrl = env.apiBaseUrl`);
  - `/v1/me` precisa ser **plano** (`{ id, name, email, role, tenantId, ... }`, sem envelope `data`);
  - se falhar, limpa os tokens.
- `LoginPage.tsx` (The Round, #1282, `AuthHeroLayout`):
  - `data-testid`: `login-form`, `login-error`, `email-input`, `password-input`, `totp-input` e `login-button`;
  - a mensagem de erro depende do `ApiError.code` (`AUTH_INVALID_CREDENTIALS` → "Invalid email or password."); um erro de rede vira "Something went wrong. Check your connection and try again.".

**Contratos lidos pelas telas das specs**
- Agenda: `useScheduleMonth.ts:23` lê `GET /v1/inspector/schedule/month`, no envelope `{ data: { today, from, to, days, appointments, overdueAppointments } }`. **Ninguém mais chama `/v1/inspector/schedule/range`.**
- Marketplace:
  - `useMarketplaceOffers.ts:24` lê `GET /v1/marketplace/offers?page&pageSize` → `{ data, pagination }`;
  - detalhe em `/v1/marketplace/offers/:groupId`;
  - `MarketplacePage.tsx`: `useIsWide()` (≥ `TABLET_MIN_WIDTH`) troca o layout: o toggle e o bottom sheet só aparecem no estreito; no largo entram `marketplace-extended` + `TwoPaneLayout` + `GroupDetailPane`, e o `GroupDetailBottomSheet` recebe `groupId={isWide ? null : detailGroupId}`.
- Bottom nav: `BottomNavBar.tsx:95` gera `nav-${label.toLowerCase()}` → `nav-schedule`, `nav-offers`, `nav-earnings` e `nav-profile`. Todos existem.

**Specs atuais** (detalhe em "Inventário de specs")
- `auth.spec.ts`: 3 testes.
- `schedule.spec.ts`: 3 testes.
- `marketplace.spec.ts`: 4 testes.
- `execution-finish.spec.ts`: 4 testes.

São 14 testes × 4 projetos = **56**, que bate com a memória `project_pwa_e2e_suite_broken_vacuous` (56/56 falhando @1bad8154, 2026-10-17, em worktree descartável de `develop`).

**CI**
- `CI:205-245` `test-web-e2e`:
  - `actions/checkout@v4` (`persist-credentials: false`);
  - `./.github/actions/setup` com `build-shared: "true"` e `build-frontend-standards: "true"`;
  - cache de `~/.cache/ms-playwright` (chave `playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`);
  - `pnpm --filter web exec playwright install --with-deps chromium`;
  - `pnpm --filter web test:e2e`;
  - `upload-artifact@v4` de `apps/web/playwright-report/` em `if: failure()`, com `retention-days: 7`.
- O web usa a porta **5174** (`pnpm dev --port 5174`), justamente fora da porta padrão.
- `.github/actions/setup/action.yml`: o `build-frontend-standards` diz textualmente que "the package resolves only to its compiled dist/".
- O `ci.yml` **não tem filtro de paths**: roda em todo PR e push para `main`, `staging` e `develop`. **Não existe job de E2E do PWA** (auditoria da X00, linha 55).

### Decisões aplicáveis

| Data | Decisão | Fonte |
|---|---|---|
| 2026-10-17 | A suíte E2E do PWA está vazia como gate (56/56 falhando). Até o conserto, os gates do PWA são `typecheck`, `lint`, `test`, `check:ds` e `build` | memória `project_pwa_e2e_suite_broken_vacuous` |
| 2026-10-28 | O critério 00.A1 (tour) é provado por E2E Playwright, e a suíte do PWA é recuperada antes da F04-3b. **Não** trocar E2E por QA manual | `X03-e2e-pwa.md`; F04-tarefas, TASK-F04-3b |
| 2026-10-28 | O job de E2E do PWA não existe no CI e é criado aqui (+0,25 no plano) | auditoria X00 (`X00-tarefas.md:55`) |
| 2026-10-28 | **O CI roda o E2E do PWA em Chromium + WebKit (os 4 projetos).** Mitigações de flake do WebKit: `retries` no CI, trace no primeiro retry e nenhum timeout arbitrário (`waitForTimeout`) | decisão do dev, via coordenador |
| 2026-10-28 | **Nunca reaproveitar silenciosamente um dev server de outro worktree:** `reuseExistingServer: false` + porta estrita (sobrescrevível por worktree). A 5173 também é o default de `CORS_ORIGIN`, `TENANT_PORTAL_BASE_URL` e `WEB_APP_BASE_URL` no backend (`apps/backend/.env.example:31-38`), e o `PWA_BASE_URL` local é 5174 | decisão do dev, via coordenador |
| Contínua | As fixtures de mock seguem o formato real dos contratos (api-types e schemas do shared) | memória `feedback_test_fixtures_must_match_api_shape` |
| Contínua | Nunca usar o catch-all `**/v1/**`, porque intercepta `api.mapbox.com/styles/v1/...`. `page.route` casa primeiro a rota registrada **por último**. Monkey-patch de `window.fetch` não funciona, porque o openapi-fetch captura o `fetch` na criação do client. `/v1/me` é **plano** | gotchas da memória (contexto do pedido) |
| Contínua | Sem workarounds: se o bootstrap do app tiver bug real, corrigir com teste, e não mascarar no harness | memória `feedback_no_workarounds` |
| 2026-10-29 | **Modelo de gate real:** merge em `develop`/`staging`/`main` não tem check obrigatório (sem branch protection; o ruleset "Basic Security" não tem `required_status_checks`). O gate efetivo é o **deploy**: `frontend-deploy.yml` e `fly-deploy.yml` disparam por `workflow_run` e exigem `conclusion == 'success'` do CI inteiro. Logo, `test-pwa-e2e` **bloqueia deploy desde o primeiro merge**. O job nasce hard, com kill switch `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` (variável de repositório; ausente = hard) e runbook no `PWA/CLAUDE.md` §10 | L-X03-01 (opção 1, recomendada) |
| 2026-10-29 | **Flake é falha no CI:** `failOnFlakyTests: !!process.env.CI` na config (mantém `retries: 2` para o trace do 1º retry, mas a execução termina vermelha se algum teste só passou no retry). Reporter JSON (`test-results/e2e.json`) no CI como evidência de `stats.flaky` | L-X03-02 |
| 2026-10-29 | **Critério de saída do diagnóstico:** `auth.spec.ts` 3/3 verde em `Mobile Chrome` **e** `Mobile Safari` com `--retries=0`, num worktree com os dois `dist` construídos e porta estrita. Time-box de 0,5 dia; estourou → registrar `pageerror`/trace e escalar ao dev no mesmo dia (reestimativa), mesmo sem classificar como H3 | L-X03-03 |
| 2026-10-29 | **Fronteira harness × app:** qualquer mudança sob `apps/pwa/src/` que não seja (a) `data-testid` novo onde não há seletor acessível ou (b) `optimizeDeps` no `vite.config.ts` conta como "mudança de app" e dispara a reestimativa | L-X03-03 |
| 2026-10-29 | **Falha só-WebKit** que sobra depois do inventário: `test.fixme(isWebKit, '<link da issue>')` temporário, com issue aberta e prazo; o conserto vira tarefa própria e não bloqueia a F04-3b. Nunca `test.skip` silencioso nem espera arbitrária; nunca remover o projeto WebKit do CI | L-X03-03 (opção 1, recomendada) |
| 2026-10-29 | **Fixtures puras e estritas:** `tests/e2e/support/fixtures.ts` sem import de `@playwright/test`; cada fixture validada por `schema.strict().parse(...)` contra o schema do shared (tabela no Passo 5), ids em uuid válido, datas no formato que o schema exige | L-X03-04 |
| 2026-10-29 | **501 `E2E_UNMOCKED` não falha o teste por si:** o app decide o que fazer; falha só quando a asserção depende da chamada. O helper emite `console.warn` legível. `loginAsInspector` registra um **conjunto-base de stubs** (`BASELINE_STUBS`) para as chamadas do boot autenticado; toda feature que adiciona chamada de boot soma o stub default no mesmo PR | L-X03-05 |
| 2026-10-29 | **Semente de IndexedDB** só via helper `seedExecutionState` (`goto('/login')` + `evaluate` com `openDB` aguardado), nunca dentro de `addInitScript`. Tokens continuam via `loginAsInspector` (`addInitScript`) | L-X03-06 |
| 2026-10-29 | **Restrição por projeto só via `tests/e2e/support/projects.ts`** (`WIDE_PROJECTS`, `isWideProject`, `skipOnWide`, `skipOnPhone`, motivo obrigatório). Os nomes dos projetos viram contrato. `isMobile` não distingue nada (os 4 projetos têm `isMobile: true`). Specs do tour (F04-3b) rodam **só nos 2 projetos de telefone** via `skipOnWide`; as 4 specs atuais seguem nos 4 projetos | L-X03-07 (opção 1, recomendada) |
| 2026-10-29 | **Sanidade no CI espera o run terminar** antes do revert (`concurrency.cancel-in-progress: true` cancela o run vermelho, e um run cancelado não é evidência) | L-X03-08 |
| 2026-10-29 | **Divisão com a X00:** o build do `frontend-standards` no §16 é da X00 (Bloco R22); a X03 só confere. A X03 reverte os quatro avisos "56/56" (raiz R12, `apps/pwa/CLAUDE.md` §1 e §10, memória + linha do `MEMORY.md`) | L-X03-09 |

### Validação primeiro

Esta tarefa é de testes, então "validação" aqui quer dizer **reproduzir e provar o vermelho antes de mexer**, e depois provar que o verde não é vazio.

**V1 · Reproduzir a falha num worktree limpo (antes de qualquer mudança)**

O worktree é criado **sem** `pnpm --filter @properfy/frontend-standards build`, independentemente do que o `CLAUDE.md` raiz diga (a X00 já corrige a receita no Bloco R22). É isso que torna a H1 testável (L-X03-09).

```bash
git fetch origin && git worktree add ../properfy-x03 -b test/pwa-e2e-repair origin/develop
cd ../properfy-x03
pnpm install
pnpm --filter @properfy/shared build
ls packages/frontend-standards/dist 2>&1        # esperado: "No such file or directory" (H1)
lsof -nP -iTCP:5173 -sTCP:LISTEN                # registrar quem ocupa a 5173 (H2)
pnpm --filter pwa exec playwright install chromium webkit
pnpm --filter pwa exec playwright test tests/e2e/auth.spec.ts --project="Mobile Chrome" \
  --trace on --reporter=list 2>&1 | tail -40
```

**V2 · Capturar trace, console e rede**
- Trace: `--trace on`, depois `pnpm --filter pwa exec playwright show-trace test-results/<pasta>/trace.zip`. Nas abas **Console** e **Network** do trace estão os erros de módulo e os 404/500 do Vite.
- Console e erros de página sem trace: rodar uma vez com um `test.beforeEach` **temporário** e não commitado no `auth.spec.ts`:
  ```ts
  page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
  ```
- Ver o shell ao vivo: `pnpm --filter pwa exec playwright test tests/e2e/auth.spec.ts:9 --project="Mobile Chrome" --headed --debug`.
- Isolar o servidor do Playwright: `pnpm --filter pwa dev --port 5199 --strictPort` num terminal, depois `curl -s localhost:5199/src/app/App.tsx | head -5` e `curl -si localhost:5199/@id/@properfy/frontend-standards | head -5`. Um 500 ou "Failed to resolve entry" confirma a H1 sem browser.

**V3 · Eliminar hipóteses em ordem** (cada passo leva minutos; parar quando o **critério de saída** abaixo for atingido)

**Critério de saída do diagnóstico (L-X03-03):** `auth.spec.ts` **3/3 verde** em `Mobile Chrome` **e** `Mobile Safari` com `--retries=0`, num worktree com os dois `dist` construídos e porta estrita. Atingido isso, o diagnóstico acabou; as falhas restantes são inventário (Passo 6), não diagnóstico. **Time-box: 0,5 dia.** Se V3.1 e V3.2 não atingirem o critério dentro do time-box, registrar o `pageerror`/trace e escalar ao dev no mesmo dia (reestimativa), mesmo que a causa ainda não esteja classificada como H3.

1. Construir o pacote que falta e repetir o V1: `pnpm --filter @properfy/frontend-standards build`. Se o `login-form` aparecer, a H1 está confirmada.
2. Derrubar qualquer processo na 5173 e repetir com `CI=1` (força o Playwright a subir o próprio servidor): `CI=1 pnpm --filter pwa exec playwright test tests/e2e/auth.spec.ts --project="Mobile Chrome" --retries=0 --workers=1`. Para provar a H2 de propósito: `pnpm --filter web dev` noutro terminal e repetir **sem** `CI=1` → falha idêntica, `login-form` não encontrado.
3. Se 1 e 2 não resolverem: o `pageerror` do V2 aponta o crash de bootstrap (H3). **Parar e aplicar a regra de reestimativa.**
4. Conferir o critério de saída nos dois engines: `pnpm --filter pwa exec playwright test tests/e2e/auth.spec.ts --project="Mobile Chrome" --project="Mobile Safari" --retries=0; echo "exit=$?"` → esperado `exit=0`, 6 passed.

**V4 · Registro no PR**: a causa raiz, o trecho do console/trace que a prova (texto, sem screenshot commitado; memória `feedback_review_screenshots_never_commit`) e o comando que reproduz.

**V5 · Sanidade (o gate não é vazio).** Feito no CI, no próprio PR, **com a variável `PWA_E2E_ADVISORY` ausente** (com `continue-on-error: true` o job aparece verde e só a step fica vermelha; L-X03-01):
1. Commit temporário `test: [sanity] break pwa e2e assertion` que troca `toHaveText('INS-0042')` por `toHaveText('INS-9999')` em `schedule.spec.ts`.
2. Push → o job `test-pwa-e2e` precisa ficar **vermelho**, com o artefato `pwa-playwright-report` publicado.
3. **Aguardar o run terminar antes do revert** (L-X03-08): o `ci.yml` tem `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`, e um push do revert antes do fim cancela o run vermelho (conclusão `cancelled`, sem artefato, sem valor de evidência). Comando: `gh run watch <id> --exit-status; echo "exit=$?"` → esperado `exit≠0`, **sem pipe** (memória `feedback_gh_run_watch_pipe_exit`). Conferir `gh run view <id> --json conclusion` → `"failure"`.
4. Só então `git revert` desse commit → push → job verde.
5. Linkar as duas execuções na descrição do PR: o id do run vermelho (conclusão `failure`, com artefato) e o do verde.

Local antes do push: a mesma troca + `pnpm --filter pwa test:e2e` precisa sair com exit ≠ 0 (`echo $?`, sem pipe; memória `feedback_pipe_swallows_exit_code_in_verification`).

**V6 · Estabilidade (L-X03-02)**: `pnpm --filter pwa exec playwright test --repeat-each=3 --retries=0` verde local antes de abrir o PR. No CI, `failOnFlakyTests` ligado: o job fica **vermelho** se qualquer teste passar só no retry. A evidência é o `apps/pwa/test-results/e2e.json` (`stats.flaky === 0`), publicado no artefato; como o run flaky termina em `failure`, o `if: failure()` do upload passa a cobrir esse caso.

**V7 · Testes do harness (TDD, entrada → saída esperada)**. Escritos **antes** dos helpers correspondentes (Passo 5); cada um vermelho primeiro.

| # | Teste | Entrada | Saída esperada |
|---|---|---|---|
| T1 | `src/__tests__/e2e-fixtures.test.ts` (Vitest) · `INSPECTOR_ME` | `meResponseSchema.strict().parse(INSPECTOR_ME)` | não lança; com a fixture antiga (`id: 'user-1'`, 5 campos) lança `ZodError` em `id` (uuid) e nos campos obrigatórios (`branchId`, `totpEnabled`, `phone`, `status`, `lastLoginAt`, `createdAt`, `timezone`, `personalTimezone`) |
| T2 | idem · uma linha por fixture da tabela do Passo 5 | `schema.strict().parse(fixture)` | não lança |
| T3 | idem · chave morta | `meResponseSchema.strict().parse({ ...INSPECTOR_ME, legacyField: 1 })` | lança `ZodError` com `code: 'unrecognized_keys'` (prova que o `.strict()` está ativo) |
| T4 | idem · `LOGIN_401` | parse pelo schema local do envelope `{ error: { code: string, message: string, details?: unknown } }` (`.strict()`) | não lança; `code === 'AUTH_INVALID_CREDENTIALS'` |
| T5 | idem · o arquivo roda | `pnpm --filter pwa test -- e2e-fixtures` | o log lista `e2e-fixtures.test.ts` com ≥ 10 testes passados (prova que a suíte unitária executa o arquivo) |
| T6 | `auth.spec.ts` · login com 401 mockado | `POST /v1/auth/login` → 401 `LOGIN_401` | `login-error` com o texto exato "Invalid email or password." |
| T7 | `globalSetup` sem `frontend-standards/dist` | `mv packages/frontend-standards/dist /tmp/fs-dist; pnpm --filter pwa test:e2e; echo "exit=$?"` | `exit≠0` em < 10 s, com `Build workspace packages first: …` no stderr, sem timeout no `login-form`; restaurar o `dist` depois |
| T8 | `blockUnmockedApi` + baseline | spec qualquer, sem stub de `GET /v1/inspector/schedule/month` | a chamada recebe 501 `E2E_UNMOCKED` e um `console.warn` `[E2E_UNMOCKED] GET http://localhost:3000/v1/inspector/schedule/month` aparece no trace; as chamadas do baseline (`/v1/me`, `POST /v1/inspectors/me/app-state`, `GET /v1/inspectors/me`) **não** aparecem como 501 |
| T9 | `failOnFlakyTests` | teste temporário, não commitado, que falha na 1ª tentativa e passa na 2ª (`expect(testInfo.retry).toBeGreaterThan(0)`), rodado com `CI=1` | `exit≠0`; `e2e.json` com `stats.flaky === 1`. Remover o teste depois |
| T10 | `skipOnWide` | `app-*.spec.ts` temporário com `skipOnWide('probe')` rodado nos 4 projetos | 2 passed (`Mobile Safari`, `Mobile Chrome`) e 2 skipped com motivo "probe" (`Tablet (iPad portrait)`, `Foldable open`) |
| T11 | `seedExecutionState` | `execution-finish.spec.ts` com `--repeat-each=5 --retries=0 --project="Mobile Safari"` | 20/20 verdes (`submit-button` visível em todos; nenhuma intermitência de IndexedDB) |

### Hipóteses de causa raiz (ranqueadas)

| # | Hipótese | Evidência (leitura de código) | Correção que exige |
|---|---|---|---|
| **H1** | **`@properfy/frontend-standards` sem `dist/` (ou `@properfy/shared` com `dist/` desatualizado) no worktree.** O Vite dev não resolve o import de topo do `App.tsx`, o grafo de módulos de `main.tsx` falha e o `#root` fica vazio | (a) Os dois pacotes exportam **só** `./dist/index.js`, e `dist/` é ignorado no git. (b) O `CLAUDE.md` raiz §16 manda o setup do worktree rodar só `pnpm --filter @properfy/shared build`, **sem** o frontend-standards. Um worktree "limpo" feito pela receita oficial fica sem esse `dist`. (c) O pacote nasceu em 2026-10-10 (`dbde3943`), e o import de topo em `App.tsx` entrou no mesmo dia (`e12220ea`). A falha foi observada em 2026-10-17, num worktree descartável. (d) A falha é total, inclusive em `/login`, que não depende de API: isso é sintoma de módulo, não de mock. (e) O próprio `action.yml` do CI documenta que o pacote "resolves only to its compiled dist/". (f) Variante: um `shared/dist` velho sem um export novo (`retryLazyImportOnce`, `loginSchema`...) dá `SyntaxError: does not provide an export named ...` com o mesmo sintoma | **Harness/doc, não app.** (1) `globalSetup` do Playwright (ou script `pretest:e2e`) que falha cedo com mensagem clara se `packages/{shared,frontend-standards}/dist/index.js` não existir. Não fazer o build ali, para não esconder dist velho; a mensagem manda rodar os dois builds. (2) A receita de setup do worktree no `CLAUDE.md` raiz §16 passa a incluir `pnpm --filter @properfy/frontend-standards build` (Bloco R22 da X00; aqui só conferido, L-X03-09). (3) No CI o job já usa `build-frontend-standards: "true"` |
| **H2** | **Colisão na porta 5173 + `reuseExistingServer: true` local.** O Playwright reaproveita o que estiver na 5173 (o dev server do **web** ou um PWA de outro worktree com outro código) e nunca sobe o PWA certo | (a) `PWA` e `WEB` usam `"dev": "vite"`, ambos na porta padrão 5173. (b) A config do PWA tem `port: 5173` e `reuseExistingServer: !process.env.CI`. (c) O web foge disso com `--port 5174`, o que indica que o problema já apareceu lá. (d) O login do web **não** tem `data-testid="login-form"` (grep vazio em `WEB/src`): o timeout seria exatamente no `auth.spec.ts:9`. (e) Com vários worktrees abertos (rotina do projeto), a 5173 quase sempre está ocupada | **Harness.** (1) `reuseExistingServer: false` **sempre**: o Playwright sobe o próprio servidor e, se a porta estiver ocupada, falha alto em vez de reaproveitar o dev server de outro worktree. (2) Porta dedicada e estrita, sobrescrevível por worktree: `const PORT = Number(process.env.PWA_E2E_PORT ?? 5175)`, `webServer.command: \`pnpm exec vite --port ${PORT} --strictPort\``, `url: \`http://localhost:${PORT}/login\`` (no lugar de `port`) e `baseURL` igual. Fica fora da 5173 (default do web e de `CORS_ORIGIN`/`TENANT_PORTAL_BASE_URL`/`WEB_APP_BASE_URL` em `apps/backend/.env.example:31-38`) e da 5174 (`PWA_BASE_URL` e porta do E2E do web). Documentar a porta e o `PWA_E2E_PORT` |
| **H3** | **Crash real de bootstrap sob o harness** (só no browser automatizado ou só no WebKit): efeito de módulo em `OfflineQueueSync`/IndexedDB, `InstallPromptProvider` (`beforeinstallprompt`), `retryLazyImportOnce` lendo `sessionStorage`, ou dependência de `matchMedia` no `TwoPaneLayout` | Fraca. A suíte Vitest (jsdom) passa, mas o jsdom não reproduz IndexedDB/WebKit. Falhar **igual** em Chromium e WebKit aponta contra uma causa específica de engine. O `ErrorBoundary` renderizaria um fallback, e não um `#root` vazio, a menos que o erro seja de módulo (o que volta para a H1) | **App**, com teste de unidade que reproduz. **Gatilho da regra de reestimativa** |
| H4 | Reotimização de deps do Vite no 1º acesso ("new dependencies optimized, reloading"). As rotas `lazy` descobrem deps em tempo de execução e recarregam a página no meio do teste | Não explica 56/56 (seria intermitente), mas vai aparecer no CI com cache `.vite` frio, quando as outras forem corrigidas | `optimizeDeps.entries: ['src/main.tsx', 'src/features/**/pages/*.tsx']` no `vite.config.ts` **ou** aquecer o servidor no `globalSetup` (um `fetch` em `/login` e nas páginas lazy). Preferir o `optimizeDeps.entries`, que é declarativo e beneficia o dev |
| H5 | Mocks `page.route` desatualizados ou fora de contrato | Explica **algumas** falhas depois do shell voltar (ver inventário), não o `login-form` | Atualizar as specs (Passo 6) |
| H6 | Falta `VITE_*` no dev server | **Refutada por leitura:** `env.ts` tem fallback para os dois, e o build do CI (`CI:278-281`) já roda sem env. Sem token, o mapa nem inicializa (`useMapboxInstance.ts:61`) | Nenhuma. Fixar `VITE_API_BASE_URL=http://localhost:3000` e `VITE_MAPBOX_TOKEN=` no `webServer.env`, para ignorar um `.env.local` do dev |
| H7 | CORS em resposta cross-origin cumprida por `route.fulfill` (app em `:5175`, API em `:3000`) | **Controle negativo:** o web usa o mesmo padrão (app em `:5174`, API em `:3000`, `fulfill` sem cabeçalhos) e está verde no CI | Nenhuma, salvo se o trace mostrar um preflight bloqueado. Aí, `headers: { 'access-control-allow-origin': '*' }` no helper |

Aposta: **H1** (mais provável, sozinha explica 56/56 num worktree recém-criado), depois **H2** (explica 56/56 em qualquer máquina com a 5173 ocupada). As duas são corrigidas no harness, e as correções das duas entram no PR mesmo que só uma seja a causa observada.

### Escopo / Passos

1. **Diagnóstico** (V1–V3), com time-box de **0,5 dia** e o critério de saída do V3 (`auth.spec.ts` 3/3 em `Mobile Chrome` e `Mobile Safari`, `--retries=0`). Registrar a causa e a evidência. Se for a H3, ou se o time-box estourar, aplicar a regra de reestimativa antes do Passo 2 (L-X03-03).
2. **Pré-condição dos pacotes (H1).** Novo `PWA/tests/e2e/support/global-setup.ts` (`globalSetup` na config):
   - confere `packages/shared/dist/index.js` e `packages/frontend-standards/dist/index.js` (caminho relativo a `__dirname`);
   - na ausência, lança `Error('Build workspace packages first: pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build')`.
3. **Config Playwright** (`PWA/playwright.config.ts`):
   - `const PORT = Number(process.env.PWA_E2E_PORT ?? 5175)`; `baseURL: \`http://localhost:${PORT}\``;
   - `webServer: { command: \`pnpm exec vite --port ${PORT} --strictPort\`, url: \`http://localhost:${PORT}/login\`, reuseExistingServer: false, timeout: 120_000, env: { VITE_API_BASE_URL: 'http://localhost:3000', VITE_MAPBOX_TOKEN: '' } }`. Nunca `reuseExistingServer: !process.env.CI` (decisão de 2026-10-28): um worktree em paralelo usa outro `PWA_E2E_PORT`;
   - `reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e.json' }]] : [['html', { open: 'never' }]]` (o JSON é a evidência de `stats.flaky`, L-X03-02);
   - `failOnFlakyTests: !!process.env.CI` (Playwright ≥ 1.52; o PWA usa `^1.59.1`): com `retries: 2` o 1º retry ainda gera trace, mas a execução termina vermelha se algum teste só passou no retry (L-X03-02);
   - `trace: 'on-first-retry'` (mantido, decisão de 2026-10-28), `screenshot: 'only-on-failure'`, `video: 'off'`. Localmente, o diagnóstico usa `--trace on` na linha de comando;
   - mitigações de flake do WebKit: `retries: process.env.CI ? 2 : 0` e `workers: process.env.CI ? 1 : undefined` (mantidos); `expect.timeout` padrão (5 s) sem override por projeto; **nenhum** `page.waitForTimeout`/`setTimeout` nas specs. Toda espera é por estado (`toBeVisible`, `toHaveCount`, `toHaveURL`, `waitForResponse`). Grep no aceite;
   - `serviceWorkers: 'block'` em `use`. Hoje não há SW no dev, mas um SW intercepta o fetch **antes** do `page.route`, e isso protege contra uma futura habilitação do `devOptions`;
   - `timezoneId: 'Australia/Sydney'` e `locale: 'en-AU'` em `use`. O app é Sydney-only (memória `project_sydney_only_timezone`), e as specs calculam "hoje" (`schedule.spec.ts`), por isso o fuso precisa ser fixo, e não o do runner (UTC no CI). Ver Casos de borda;
   - manter os 4 projetos, `fullyParallel`, `forbidOnly` e `retries`/`workers` do CI.
4. **Reotimização (H4):** `optimizeDeps: { entries: ['index.html', 'src/features/**/pages/*.tsx'] }` em `PWA/vite.config.ts`. Só entra se o V6 ou o CI mostrarem reload. Senão fica de fora (mudança mínima) e vira nota no PR.
5. **Helpers de mock** (`PWA/tests/e2e/support/`, base para a F04-3b). Testes T1–T5, T8, T10 e T11 do V7 primeiro:
   - `fixtures.ts` (**puro**, sem import de `@playwright/test`, L-X03-04): exporta as constantes; `auth.ts`/`api.ts` e as specs importam dele. Ids em uuid válido (`'00000000-0000-4000-8000-0000000000NN'`), datas civis `'YYYY-MM-DD'` e instantes ISO (`civilDateStr`/`instantStr` são helpers **privados** de `packages/shared/src/schemas/responses.ts:39-54`, não exportados; a fixture usa strings literais no formato que eles aceitam). Tabela fixa fixture → schema:

     | Fixture | Schema (`@properfy/shared`) | Rota |
     |---|---|---|
     | `INSPECTOR_ME` | `meResponseSchema` (`responses.ts:105`), completo: `id` uuid, `name`, `email`, `role: 'INSP'`, `tenantId`, `branchId`, `totpEnabled`, `phone`, `status`, `lastLoginAt`, `createdAt`, `inspectorId` uuid, `timezone: 'Australia/Sydney'`, `personalTimezone` | `GET /v1/me` |
     | `SCHEDULE_MONTH_EMPTY`, `SCHEDULE_MONTH_ONE` | `inspectorScheduleMonthResponseSchema` (`responses.ts:895`) | `GET /v1/inspector/schedule/month` (dentro do envelope `{ data }`) |
     | `OFFER` | `marketplaceOfferResponseSchema` (`responses.ts:657`) | item de `GET /v1/marketplace/offers` |
     | `OFFER_DETAIL` | `marketplaceOfferDetailResponseSchema` (`responses.ts:708`) | `GET /v1/marketplace/offers/:groupId` |
     | `APPOINTMENT_DETAIL` | `inspectorAppointmentDetailResponseSchema` (`responses.ts:492`) | detalhe usado pela execução |
     | `FINISH_RESULT` | `finishInspectionResponseSchema` (`responses.ts:909`) | `POST …/finish` |
     | `LOGIN_401` | schema **local** do teste para o envelope `{ error: { code, message, details? } }` (o shared não exporta schema de erro; contrato do `CLAUDE.md` raiz §9) | `POST /v1/auth/login` → 401 |
     | `INSPECTOR_PROFILE` | sem response schema no backend (`GET /v1/inspectors/me`, tipo em `features/profile/hooks/useInspectorMe.ts`); comentar no teste que a fixture espelha esse tipo | `GET /v1/inspectors/me` (só se a rota existir no snapshot da implementação) |

   - `api.ts`:
     - `export const API = 'http://localhost:3000'`;
     - `stubJson(page, path, body, status = 200)`, que registra `page.route(\`${API}${path}\`, ...)`;
     - `blockUnmockedApi(page)`, que registra `page.route(\`${API}/v1/**\`, r => { console.warn(\`[E2E_UNMOCKED] ${r.request().method()} ${r.request().url()}\`); return r.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: { code: 'E2E_UNMOCKED', message: r.request().url() } }) }); })`. É o catch-all **escopado à origem da API** (nunca `**/v1/**`) e precisa ser registrado **primeiro**, porque `page.route` casa a última rota registrada antes. O 501 **não** falha o teste por si; falha a asserção que depende da chamada (L-X03-05);
     - `blockExternal(page)`, que aborta `https://api.mapbox.com/**` e `https://events.mapbox.com/**` (defensivo).
   - `auth.ts` (L-X03-05):
     - `BASELINE_STUBS`: lista exportada dos stubs do boot autenticado. No merge: `GET /v1/me` → `INSPECTOR_ME`; `POST /v1/inspectors/me/app-state` → 204 (heartbeat da F01, já em `develop` pela ordem das ondas); `GET /v1/inspectors/me` → `INSPECTOR_PROFILE` (quando a rota existir). Listar no PR os stubs do baseline no momento do merge;
     - `loginAsInspector(page, { me = INSPECTOR_ME, baseline = true } = {})`: `page.addInitScript` gravando `access_token`/`refresh_token` (no lugar do `goto('/login') + evaluate` atual); com `baseline`, registra `blockUnmockedApi` → `BASELINE_STUBS` (com `me` no lugar do `/v1/me` default). Uma spec que precisa de outro comportamento (ex.: F04-3b capturando o corpo do `app-state`) registra o stub **depois** do `loginAsInspector`, e a última rota vence, sem mexer no baseline.
   - `projects.ts` (L-X03-07): `export const WIDE_PROJECTS = ['Tablet (iPad portrait)', 'Foldable open'] as const`; `isWideProject(testInfo)` (`WIDE_PROJECTS.includes(testInfo.project.name)`); `isWebKitProject(testInfo)` (por `browserName === 'webkit'`, para o `test.fixme` da regra só-WebKit); `skipOnWide(reason)` e `skipOnPhone(reason)` como wrappers de `test.skip` com motivo obrigatório (string não vazia). Nenhuma spec deriva largura ou layout por conta própria (`viewport.width`, `isMobile`). Mudar o nome de um projeto na config = mudar a constante.
   - `idb.ts` (L-X03-06): `seedExecutionState(page, state)` extraído do `setupExecutionAtFinishing` atual (`execution-finish.spec.ts:120-159`): `goto('/login')` (rota pública; o `/v1/me` do boot já está no baseline do `loginAsInspector`) + `evaluate` com `openDB('properfy-pwa', 1)` **aguardado** gravando em `execution-states` (`phase: 'FINISHING'`). A spec chama `loginAsInspector` **antes** do `goto` e navega para `/execution/:id` só depois que o `seedExecutionState` resolve. Nunca semear IndexedDB em `addInitScript` (corre em paralelo com o `openDB` do app em `features/execution/lib/indexeddb.ts:34`).
   - Teste Vitest das fixtures (T1–T5): `PWA/src/__tests__/e2e-fixtures.test.ts`, importando `../../tests/e2e/support/fixtures` por caminho relativo. Escolha registrada: fica em `src/__tests__/` porque o `vite.config.ts` (`test.exclude: ['tests/e2e/**', …]`) exclui tudo sob `tests/e2e/`, e esta escolha não exige mudar o exclude. Cada fixture com `schema.strict().parse(fixture)` (chave a mais no nível do objeto = falha; o `.strict()` do Zod 3 vale só para o nível de topo, e os objetos aninhados seguem `strip`, limitação anotada em comentário). O PR prova que `pnpm --filter pwa test` executa o arquivo (contagem de testes no log). Cumpre a memória `feedback_test_fixtures_must_match_api_shape`.
6. **Atualizar as specs** conforme o "Inventário de specs" (sem criar testes novos).
7. **Verificação local:**
   - `pnpm --filter pwa test:e2e` com os 4 projetos;
   - `--repeat-each=3 --retries=0`;
   - `pnpm --filter pwa typecheck`, `lint`, `test` e `check:ds`.

   Atenção: o `tsconfig` do PWA pode não incluir `tests/`. Conferir com `pnpm --filter pwa exec tsc --noEmit -p tsconfig.json --listFilesOnly | grep tests/e2e`. Se não incluir, rodar `pnpm --filter pwa exec tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --skipLibCheck tests/e2e/*.ts tests/e2e/support/*.ts` só como checagem local, sem mudar o tsconfig.
8. **Job de CI** `test-pwa-e2e` (ver seção), hard desde o início com o kill switch `vars.PWA_E2E_ADVISORY` (L-X03-01), + sanidade V5 com a variável ausente e esperando o run vermelho terminar (L-X03-08).
9. **Documentação:**
   - `PWA/CLAUDE.md` §2 (comandos): somar `pnpm --filter pwa test:e2e`.
   - `PWA/CLAUDE.md` §10 (Testing), reescrito com:
     - pré-requisito dos builds de `shared` e `frontend-standards`;
     - porta 5175 estrita, `PWA_E2E_PORT` por worktree e `reuseExistingServer: false`;
     - API toda mockada via `tests/e2e/support/api.ts`, com as regras: `blockUnmockedApi` primeiro, nunca `**/v1/**`, rota registrada por último vence, `/v1/me` plano, sem monkey-patch de `fetch`;
     - os 4 projetos e o layout largo nos 2 últimos;
     - `timezoneId` Sydney;
     - como capturar trace (`--trace on` + `show-trace`);
     - o job `test-pwa-e2e` como gate **de deploy** (não de merge: não há check obrigatório; os deploys exigem o CI inteiro verde) e o `failOnFlakyTests` no CI (L-X03-01, L-X03-02);
     - **runbook do kill switch** (L-X03-01): *"flake sistemático em `develop` → setar `PWA_E2E_ADVISORY=true` nas Variables do repositório (ação de admin, sem PR), abrir issue, corrigir na causa, remover a variável. Com a variável ligada o job aparece verde e só a step fica vermelha"*;
     - semântica do 501 `E2E_UNMOCKED` e a regra *"toda feature que adiciona uma chamada de API no boot autenticado adiciona o stub default correspondente em `tests/e2e/support/auth.ts` (`BASELINE_STUBS`) no mesmo PR"* (L-X03-05);
     - restrição por projeto só via `tests/e2e/support/projects.ts` (`skipOnWide`/`skipOnPhone` com motivo); specs do tour nos 2 projetos de telefone (L-X03-07);
     - semente de IndexedDB só via `seedExecutionState` (L-X03-06);
     - regra só-WebKit: `test.fixme` por engine com issue e prazo, nunca `test.skip` silencioso (L-X03-03).
   - `CLAUDE.md` raiz (L-X03-09):
     - §16 passo 2: **conferir** que a receita já tem `pnpm --filter @properfy/frontend-standards build` (Bloco R22 da X00). Se a X00 não tiver entrado, aplicar o Bloco R22 literalmente;
     - trocar o aviso "currently broken (56/56...)" (R12 da X00) por "a CI gate (`test-pwa-e2e`)".
   - `PWA/CLAUDE.md` §1 (P01 da X00, linha 24): remover o aviso "56/56 … until X03" (L-X03-09).
   - Memória: reescrever `project_pwa_e2e_suite_broken_vacuous.md` como **RESOLVIDO** (causa raiz, PR, job, pré-requisitos) e atualizar a linha do `MEMORY.md` (`[e2e suite vazia]` → `[e2e suite RESOLVIDA]`). É passo de fechamento, depois do merge. Checklist dos quatro pontos que a X03 reverte: raiz R12, `PWA/CLAUDE.md` §1, `PWA/CLAUDE.md` §10, memória + `MEMORY.md`.
10. Commit (Conventional Commits, sem referência a IA), push, PR para `develop` com causa raiz, as execuções de sanidade e o `git diff --stat origin/develop... | tail -1`.

### Inventário de specs

Nenhuma spec nova. Todas **migram para os helpers** de `support/` (`loginAsInspector`, `blockUnmockedApi`, `stubJson`), o que as torna herméticas: hoje qualquer rota não mockada sai para `localhost:3000` e o resultado depende de haver backend local rodando.

| Spec · teste | Cobre | Veredito | Justificativa e mudança |
|---|---|---|---|
| `auth` · redirects to login when not authenticated | Guarda `ProtectedRoute` sem token → `/login` | **Manter** | Contrato estável. Somar `blockUnmockedApi`. |
| `auth` · shows login form | Render da LoginPage (The Round) e testids | **Manter** | Os testids existem em `LoginPage.tsx:129-221`. É o teste-sentinela da H1/H2. |
| `auth` · shows error on invalid credentials | Erro de login | **Atualizar** | Hoje não mocka `/v1/auth/login`: o resultado depende de backend local (401) ou de erro de rede, que mostra outra mensagem. Mockar `POST /v1/auth/login` → 401 `{ error: { code: 'AUTH_INVALID_CREDENTIALS', message: '...' } }` e asserir o **texto** "Invalid email or password." em `login-error`. Sem o texto, o teste passaria com qualquer erro. |
| `schedule` · shows schedule page with day selector | Shell + agenda vazia | **Atualizar** | Mocka `/v1/inspector/schedule/range`, **rota que o app não chama mais** (lê `/month`). Trocar pelo stub de `/v1/inspector/schedule/month` vazio, no envelope `{ data: { today, from, to, days: [], appointments: [], overdueAppointments: [] } }`. |
| `schedule` · shows bottom navigation with 4 tabs | `bottom-nav` + 4 abas | **Atualizar** | Mesmo stub `/range` → `/month`. Os testids `nav-*` existem (`BottomNavBar.tsx:70-95`). No layout largo, conferir se a bottom nav continua renderizada (o two-pane não a remove). Se o design a substituir por rail nos projetos largos, usar `skipOnWide('bottom nav only on phone layout')` de `support/projects.ts` (L-X03-07). |
| `schedule` · appointment card shows the appointment code but not the property code | Card da agenda (`appointment-code`; `property-code` ausente) | **Manter** (ajuste de "hoje") | Já stuba `/month`. `today` vem de `new Date().toISOString()` (UTC). Com o `timezoneId` Sydney, entre 00:00 e 10:00/11:00 de Sydney o "hoje" UTC é ontem e o card some. Calcular `today` com `Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' })`. É a spec usada na sanidade V5. |
| `marketplace` · shows marketplace with offers | `marketplace-page` + `offer-card-group-1` | **Atualizar** | O stub de `/v1/inspector/schedule/range` no `beforeEach` é morto: remover. O resto já está no contrato `{ data, pagination }` (comentário da própria spec). |
| `marketplace` · offer card shows a full address, the remainder count and type icons | Endereço, "+2 more addresses", ícones | **Manter** | Testids existem (`OfferCard.tsx`). No largo, confirmar que o mesmo `OfferCard` é usado na lista do `marketplace-extended`. |
| `marketplace` · group detail sheet shows per-job addresses and the group total | Detalhe da oferta | **Atualizar** | **Drift do two-pane / Direction D (#1299):** no largo o `GroupDetailBottomSheet` recebe `groupId null`, e o detalhe abre no `GroupDetailPane`. Nos projetos `Tablet` e `Foldable`, o `group-detail-sheet` nunca aparece. Mudar a âncora para o conteúdo (`appointment-address` ×2, `appointment-property-type-icon` ×2, `group-total-payout` /240/) dentro de um container que exista nos dois layouts. Se o pane não tiver testid próprio, asserir `group-detail-sheet` só no estreito e o conteúdo nos dois, com `isWideProject(testInfo)` de `support/projects.ts` (nunca um `isWide` local; L-X03-07). Não adicionar testid ao app só para isso, salvo se o pane não tiver nenhum seletor acessível (aí `getByRole('region', { name })`). |
| `marketplace` · shows empty state when no offers | "No offers available" | **Manter** | O texto existe em `OfferFeed.tsx:26` e `OfferAccordionList.tsx:38`. Usar `getByText(...).first()` se os dois renderizarem no largo. |
| `execution-finish` · declining sync keeps the inspection in finishing… | Modal de sync → "No" | **Atualizar** | Usa o catch-all `page.route('**/v1/**', ...)`, que é **proibido** porque casa `api.mapbox.com/styles/v1`. Trocar por `blockUnmockedApi` (escopado em `http://localhost:3000/v1/**`). Trocar a gravação de tokens do `goto('/login') + evaluate` por `loginAsInspector`, e a semente do IndexedDB (`execution-states`, `phase: 'FINISHING'`) pelo helper `seedExecutionState` (`goto('/login')` + `evaluate` com `openDB` aguardado, depois navega para `/execution/:id`; L-X03-06). Manter o mock de geolocalização via `addInitScript`, que é o padrão correto. Testids existem. |
| `execution-finish` · sync confirmation chains into the past-time warning… | Sync → aviso de horário passado → conclui | **Atualizar** | Mesma migração. O `scheduledDate` derivado de "hoje/ontem" passa a usar a data de Sydney. |
| `execution-finish` · cancelling the past-time warning does not submit | Cancelar não chama `/finish` | **Atualizar** | Idem. Manter o contador `finishCalls()`. |
| `execution-finish` · completes directly when no confirmation applies | Conclusão direta | **Atualizar** | Idem. Execução é rota fora do `PwaLayout` (sem two-pane), igual em todos os projetos. |

**Remover:** nenhuma. Os 14 testes cobrem comportamento vivo. Se algum projeto largo não fizer sentido para um teste (ex.: bottom nav), usar `skipOnWide`/`skipOnPhone` **com motivo**, e não apagar o teste. Falha que sobra só no WebKit: `test.fixme(isWebKitProject(testInfo), '<link da issue>')` com issue e prazo (L-X03-03).

### Requisitos do harness

- **Pré-requisitos:** `pnpm install`; `pnpm --filter @properfy/shared build`; `pnpm --filter @properfy/frontend-standards build` (checado pelo `globalSetup`); browsers `chromium` e `webkit` do Playwright.
- **Servidor:** `vite` na **5175** (ou `PWA_E2E_PORT`) com `--strictPort` e `reuseExistingServer: false`. Sobe sempre do zero, no CI e localmente; nunca reaproveita servidor de outro worktree.
- **Env (fixo no `webServer.env`):** `VITE_API_BASE_URL=http://localhost:3000` (só um alvo para os mocks, nunca chamado de verdade) e `VITE_MAPBOX_TOKEN=` (vazio, para o mapa não inicializar e não haver request externo).
- **Mocks:**
  - todo request para `http://localhost:3000/v1/**` é mockado; o não mockado devolve 501 `E2E_UNMOCKED` com `console.warn` legível no trace. O 501 **não** falha o teste por si: o app decide; o teste falha quando a asserção depende da chamada (L-X03-05);
  - conjunto-base `BASELINE_STUBS` registrado por `loginAsInspector`: `GET /v1/me`, `POST /v1/inspectors/me/app-state` (204) e `GET /v1/inspectors/me` (quando existir). Dono: toda feature que soma uma chamada de boot autenticado soma o stub no mesmo PR;
  - `/v1/me` plano;
  - envelopes `{ data }` e `{ data, pagination }` conforme o contrato de cada rota;
  - ordem: `blockUnmockedApi` → stubs específicos (o último registrado vence);
  - sem `window.fetch` monkey-patch;
  - geolocalização por `addInitScript`; IndexedDB **nunca** por `addInitScript`, só via `seedExecutionState` (L-X03-06).
- **Contexto:** `serviceWorkers: 'block'`, `timezoneId: 'Australia/Sydney'`, `locale: 'en-AU'`.
- **Viewport (projetos):** iPhone 13 (390×844, WebKit), Pixel 5 (393×851, Chromium), iPad gen 7 (810×1080, WebKit, layout largo) e Foldable (840×1080, Chromium, layout largo). Os 4 projetos têm `isMobile: true` (`playwright.config.ts:14,35` e os devices), então `test.skip(({ isMobile }) => …)` **não distingue nada**. Restrição por projeto só via `support/projects.ts` (L-X03-07).
- **Contrato exportado para a F04-3b:** `support/fixtures.ts`, `support/api.ts` (`API`, `stubJson`, `blockUnmockedApi`, `blockExternal`), `support/auth.ts` (`loginAsInspector`, `BASELINE_STUBS`, `INSPECTOR_ME`), `support/projects.ts` (`skipOnWide`, `skipOnPhone`, `isWideProject`, `isWebKitProject`) e `support/idb.ts`. As specs do tour rodam **só nos projetos de telefone**: `skipOnWide('tour targets are phone-layout anchors')` no topo do arquivo. Para capturar o corpo do `app-state`, a F04-3b registra o próprio stub **depois** do `loginAsInspector` (a última rota vence).

### Job de CI

Novo job em `.github/workflows/ci.yml`, logo depois de `test-web-e2e`:

```yaml
  test-pwa-e2e:
    name: E2E pwa (Playwright mobile)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    # Kill switch (L-X03-01). The deploy workflows require the whole CI run to be
    # green, so this job blocks deploys from day one. If WebKit flakes
    # systematically on develop, an admin sets the repository variable
    # PWA_E2E_ADVISORY=true (no PR), opens an issue and removes it after the fix.
    # With the variable set the job shows green and only the step goes red.
    continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}
    # The PWA suite stubs every API call (tests/e2e/support/api.ts), so it needs
    # no backend or database. It was broken 56/56 for weeks with nobody noticing
    # because it was never wired into CI (X03). Both workspace packages resolve
    # only to their compiled dist/, so both builds are mandatory here.
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false

      - uses: ./.github/actions/setup
        with:
          build-shared: "true"
          build-frontend-standards: "true"

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          # Distinct key from the web job: this one also holds WebKit.
          key: playwright-pwa-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Install Chromium + WebKit
        # Dev decision 2026-10-28: all 4 projects run in CI. Chromium: Mobile
        # Chrome + Foldable. WebKit: Mobile Safari + iPad. --with-deps always
        # runs (system libs are not cached, only the browser binaries).
        run: pnpm --filter pwa exec playwright install --with-deps chromium webkit

      - name: E2E
        # CI=true (set by Actions) turns on retries: 2, workers: 1, the
        # on-first-retry trace, failOnFlakyTests and the JSON reporter
        # (test-results/e2e.json) in playwright.config.ts.
        run: pnpm --filter pwa test:e2e

      - name: Upload report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: pwa-playwright-report
          path: |
            apps/pwa/playwright-report/
            apps/pwa/test-results/
          retention-days: 7
```

- **Gatilhos e paths:** o job herda o `on:` do `ci.yml` (PR e push para `main`, `staging` e `develop`), **sem filtro de paths**, igual ao `test-web-e2e`. Motivo: um check obrigatório com filtro de paths fica "pending" para sempre nos PRs que não tocam os paths. Os paths que de fato afetam a suíte são `apps/pwa/**`, `packages/shared/**`, `packages/frontend-standards/**`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` e `.github/actions/setup/**`. Se o custo (~5–7 min) incomodar, a otimização certa é `dorny/paths-filter` + job condicional com saída "skipped = success", numa tarefa separada.
- **Gate (modelo real, L-X03-01):** merge em `develop` **não tem check obrigatório**: `GET /branches/develop/protection` → 404 e o único ruleset ("Basic Security", em `develop`/`staging`/`main`) tem `deletion`, `non_fast_forward` e `pull_request` com `required_approving_review_count: 0`, sem `required_status_checks`. Hoje nem o `build` bloqueia merge. O gate efetivo é o **deploy**: `frontend-deploy.yml` e `fly-deploy.yml` disparam por `workflow_run` do CI e só rodam com `github.event.workflow_run.conclusion == 'success'` (`frontend-deploy.yml:33-35`, `fly-deploy.yml:32-34`, `57-59`). Qualquer job vermelho, inclusive `test-pwa-e2e`, bloqueia o deploy de backend, web e PWA. Logo, `test-pwa-e2e` é **bloqueador de deploy desde o primeiro merge**. Decisão: job hard desde o início, com o kill switch `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` (variável ausente = hard) como rollback sem reverter código, e o runbook no `PWA/CLAUDE.md` §10. Ele **não** entra em `build.needs` (`ci.yml:258`), espelhando o web; isso só mudaria a ordem dos jobs, não o gate. "Promover a check de merge" significa criar `required_status_checks` no ruleset (ação de admin, fora do PR), e vale para o `build` também.
- **`.gitignore`:** conferir se `apps/pwa/playwright-report/` e `apps/pwa/test-results/` estão ignorados (`git check-ignore -v apps/pwa/test-results`). Se não estiverem, somar ao `.gitignore`.

### Casos de borda

- **Fuso do runner:** o CI roda em UTC. Sem `timezoneId`, a lógica de "hoje" do app (Sydney) e a da spec (UTC) divergem entre 00:00 e ~10:00 de Sydney. Por isso o fuso fica fixo no contexto e a spec calcula a data com `Intl` + Sydney (memória `feedback_tz_dependent_test_must_pin_away`: além disso, rodar uma vez localmente com `TZ=UTC` e uma com `TZ=America/Los_Angeles` para provar a independência do host).
- **Rota registrada por último vence:** um `stubJson` específico registrado **antes** do `blockUnmockedApi` fica sombreado e devolve 501. O helper documenta a ordem, e o `loginAsInspector` chama o `blockUnmockedApi` internamente primeiro (`blockUnmockedApi` idempotente por página).
- **Globs com query:** `${API}/v1/marketplace/offers` não casa `?page=1&pageSize=20`. Usar `**`/`*` no fim ou um predicado `(url) => url.pathname === '/v1/marketplace/offers'`. O predicado é preferível para não casar `/offers/:id` por engano.
- **Refresh de token:** um 401 de mock dispara `refreshAccessToken()` com `fetch` direto em `${API}/v1/auth/refresh`, que o catch-all devolve como 501 → logout. Não mockar 401 fora do teste de login.
- **WebKit e `isMobile`:** `devices['iPad (gen 7)']` tem `isMobile: true` e o layout é decidido por `min-width`. Manter as asserções por layout, e não por engine.
- **Porta 5175 ocupada localmente** (outro worktree rodando a suíte): com `--strictPort` e `reuseExistingServer: false`, a suíte falha alto em vez de pular de porta ou reaproveitar o servidor errado. A saída é `PWA_E2E_PORT=5176 pnpm --filter pwa test:e2e`, documentada no `PWA/CLAUDE.md`.
- **`dist` velho (variante da H1):** o `globalSetup` só checa a existência. Um `dist` velho ainda passa e quebra com "does not provide an export named". A doc manda reconstruir os dois pacotes depois de `git pull`, e no CI o build é sempre fresco.
- **Retries mascarando flake:** `retries: 2` no CI fica (para o trace do 1º retry), e `failOnFlakyTests` faz a execução terminar vermelha se algum teste só passou no retry (V6, L-X03-02). O `e2e.json` do artefato registra `stats.flaky`.
- **Kill switch ligado:** com `PWA_E2E_ADVISORY=true`, o job aparece verde e só a step fica vermelha; o deploy segue. Nenhum critério de aceite pode ser verificado com a variável ligada (L-X03-01).
- **Run de sanidade cancelado:** um push antes do fim do run vermelho o cancela (`concurrency.cancel-in-progress`), e `cancelled` não é `failure` (sem artefato). Aguardar com `gh run watch` (V5, L-X03-08).
- **Chamada de boot nova (F01/F02 ou futura):** sem stub no `BASELINE_STUBS`, devolve 501 `E2E_UNMOCKED` com `console.warn` em toda spec; não quebra a suíte por si, mas o PR da feature soma o stub default (L-X03-05).
- **IndexedDB semeado em paralelo com o app:** um `openDB` em `addInitScript` corre com o `openDB` do app (`indexeddb.ts:34`) e o `submit-button` some de forma intermitente (pior no WebKit). Por isso a semente fica no `seedExecutionState`, com `openDB` aguardado numa rota pública, antes da navegação para `/execution/:id` (L-X03-06).
- **iPad no breakpoint:** o `Tablet (iPad portrait)` tem 810 px, "right at the breakpoint" (comentário da config). Derivar layout por `viewport.width` erraria esse caso; a lista `WIDE_PROJECTS` é a fonte única (L-X03-07).
- **Fixture com chave morta:** os schemas de resposta do shared não são `.strict()` (0 ocorrências em `responses.ts`); o teste aplica `.strict()` no topo de cada fixture. Chaves mortas em objetos aninhados não são pegas (limitação conhecida do Zod 3), comentada no teste (L-X03-04).
- **Falha só no WebKit depois do inventário:** `test.fixme(isWebKitProject(testInfo), '<issue>')` com issue aberta e prazo; o conserto vira tarefa própria. Nunca `test.skip` silencioso, `waitForTimeout` ou remover o projeto do CI (L-X03-03).

### Fora do escopo

- Specs novas, incluindo as do tour (E1–E6, F04-3b) e cobertura das features da Fase 2.
- Trocar o Playwright, rodar contra `vite preview`/build, ou ligar o service worker no E2E.
- Filtro de paths no `ci.yml` e mudança da branch protection (ação de admin).
- Corrigir bugs reais de bootstrap do app. Se o diagnóstico achar um (H3), isso entra só com reestimativa aprovada (ver Riscos).
- Mudar o `tsconfig` do PWA para incluir `tests/`.

### Critérios de aceite

1. Num worktree limpo, criado pela receita atualizada do `CLAUDE.md`, `pnpm --filter pwa test:e2e` passa os **56** testes (14 × 4 projetos; os `skipOnWide`/`skipOnPhone` justificados e eventuais `test.fixme` só-WebKit com issue não contam como falha), com exit 0 em `--repeat-each=3 --retries=0`. No CI, `failOnFlakyTests` ligado: o job fica vermelho se qualquer teste passar só no retry; a evidência é o `e2e.json` do artefato (`stats.flaky === 0`) (L-X03-02).
2. O job `test-pwa-e2e` existe no `ci.yml`, roda no PR e fica verde, com `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` e o runbook do kill switch no `PWA/CLAUDE.md` §10 (L-X03-01).
3. Sanidade, **com a variável `PWA_E2E_ADVISORY` ausente**: uma execução do job com conclusão `failure` (não `cancelled`) e artefato publicado, com a asserção quebrada de propósito, e a verde depois do revert, ambos os ids linkados no PR (L-X03-01, L-X03-08).
4. Nenhuma spec usa `waitForTimeout` (`grep -rn waitForTimeout apps/pwa/tests/e2e` vazio), e a config tem `reuseExistingServer: false`. Nenhuma spec usa `**/v1/**`, `window.fetch` patch ou grava tokens via `goto + evaluate`; semear IndexedDB via `evaluate` numa rota pública é permitido e fica só no helper `seedExecutionState` (L-X03-06). `grep -rn "'\*\*/v1/\*\*'" apps/pwa/tests/e2e` vem vazio. Todo request não mockado devolve `E2E_UNMOCKED`.
5. Sem o `frontend-standards/dist`, a suíte falha **no `globalSetup`** com a mensagem que manda fazer o build, e não com timeout de 30 s no `login-form`.
6. A causa raiz está documentada no PR, com a evidência do trace/console e o comando que reproduz.
7. `PWA/CLAUDE.md` §1, §2 e §10, `CLAUDE.md` raiz (§16 conferido, aviso R12 revertido) e a memória estão atualizados.
8. `pnpm --filter pwa typecheck|lint|test|check:ds|build` verdes.
9. `src/__tests__/e2e-fixtures.test.ts` roda na suíte unitária (contagem no log) e valida **todas** as fixtures da tabela do Passo 5 com `.strict().parse` (L-X03-04).
10. `support/projects.ts` é a única fonte de restrição por projeto: `grep -rn "isMobile\|viewport.width\|project.name" apps/pwa/tests/e2e --include=*.spec.ts` vem vazio (L-X03-07).
11. `BASELINE_STUBS` listado na descrição do PR, com o estado no momento do merge (L-X03-05).
12. O diagnóstico registra o critério de saída atingido (`auth.spec.ts` 3/3 em `Mobile Chrome` e `Mobile Safari`, `--retries=0`) ou a escalada ao dev dentro do time-box (L-X03-03).
13. Os quatro avisos "56/56" da X00 foram revertidos (raiz R12, `PWA/CLAUDE.md` §1 e §10, memória + `MEMORY.md`) (L-X03-09).

### Dependências

- Nenhuma de código. A F04-3b depende **desta** tarefa mergeada (e usa `tests/e2e/support/`).
- Coordenação com a X00 (L-X03-09): a X00 (Onda 0) é dona do build do `frontend-standards` no §16 (Bloco R22) e grava os avisos "56/56 … until X03" (raiz R12, `PWA/CLAUDE.md` §1 P01 e §10, memória M01). A X03 só confere o §16 e reverte os quatro avisos. Se a X00 ainda não tiver entrado, a X03 aplica o Bloco R22 literalmente.
- F01 (Onda 1) já em `develop`: o heartbeat `POST /v1/inspectors/me/app-state` entra no `BASELINE_STUBS` (L-X03-05).

### Riscos

- **Regra de reestimativa (ampliada por L-X03-03):** reestimar com o dev quando (a) o diagnóstico (V3.3) achar um **bug real de bootstrap do app** (H3: crash de módulo, provider ou guarda); (b) o time-box de 0,5 dia do diagnóstico estourar sem atingir o critério de saída; ou (c) qualquer correção exigir mudança sob `apps/pwa/src/` além de `data-testid` novo (onde não há seletor acessível) ou `optimizeDeps`. Nos três casos, **parar**, registrar a causa e reestimar antes de corrigir. A correção do app vira passo próprio com teste de unidade que reproduz o problema (TDD). A estimativa de 3,0 vale só para causa de harness/env (H1/H2/H4/H5). Falha só-WebKit não dispara reestimativa: vira `test.fixme` com issue e prazo.
- **WebKit no Linux do CI** (decisão de 2026-10-28: os 4 projetos rodam no CI). Os projetos `Mobile Safari` e `Tablet` usam WebKit, que no Ubuntu é mais lento e mais sujeito a flake de timing. Mitigações: `retries: 2` e `workers: 1` no CI; trace no primeiro retry para diagnosticar; nenhum timeout arbitrário nas specs (só esperas por estado); o V6 também no CI (2 execuções seguidas verdes). Um teste que só passa no retry é corrigido na causa, sem aumentar timeout (e o `failOnFlakyTests` o torna vermelho). Tirar o WebKit do CI não é opção desta tarefa.
- **Deploy travado por flake (L-X03-01):** como os deploys exigem o CI inteiro verde, um flake do WebKit em `develop` trava o deploy de DEV. Rollback sem PR: `PWA_E2E_ADVISORY=true` (runbook no `PWA/CLAUDE.md` §10).
- **Drift de boot das features seguintes (L-X03-05):** cada chamada nova de boot autenticado sem stub no baseline vira 501 em toda spec. Mitigação: regra no `PWA/CLAUDE.md` §10 e ajuste nas tarefas da F02/F04.
- **Drift além do inventário:** o inventário vem de leitura de código. Ao rodar, uma tela pode ter mudado de um jeito que a leitura não pegou (ex.: o `GroupDetailPane` sem seletor estável). Reserva coberta pelo +0,25.
- **Tempo de CI:** +5–7 min por PR, em paralelo com os outros jobs (não alonga o caminho crítico, que é o `build` + integração com banco).

### Dias · Branch · Verificação

| Item | Plano | Realista | Delta e justificativa |
|---|---|---|---|
| Diagnóstico | 0,75 | **0,5** | −0,25: a leitura de código já reduziu a busca a duas hipóteses de harness (H1/H2) com teste de minutos cada (V3). Agora com time-box explícito de 0,5 e critério de saída (L-X03-03), sem custo extra |
| Correção do harness | 0,75 | **0,75** | 0 vs. plano (+0,25 vs. revisão anterior): porta estrita, `globalSetup`, env, `serviceWorkers`, `timezoneId` e helpers; somam-se `failOnFlakyTests` + reporter JSON (L-X03-02), `BASELINE_STUBS` (L-X03-05), `projects.ts` (L-X03-07) e `idb.ts`/`seedExecutionState` (L-X03-06), com os testes T8–T11. Tudo em config/test, sem código do app |
| Specs com drift + fixtures | 0,25 | **1,0** | +0,75: das 14, **11 mudam** (só 3 ficam como estão: o redirect, o login-form e o card da agenda; o teste do endereço e o do estado vazio pedem só conferência). Inclui o drift do two-pane/Direction D no marketplace nos 2 projetos largos e a migração para os helpers herméticos. +0,25 da L-X03-04: fixtures completas (8 fixtures, `meResponseSchema` com todos os campos e uuids) validadas por `.strict().parse` (T1–T5) |
| CI + sanidade | 0,25 (+0,25 X00) = 0,5 | **0,5** | 0: job espelhado + WebKit + kill switch (1 linha) + as duas execuções de sanidade no CI (round-trips de ~7 min, agora aguardando o run vermelho terminar, L-X03-08) |
| Documentação (CLAUDE.md ×2 + memória) | dentro do CI | **0,25** | +0,25: o plano não custeava. O §16 passa a ser só conferência (X00 R22), e entram o runbook do kill switch, a regra do baseline, `projects.ts`/`idb.ts` e os quatro avisos da X00 a reverter (L-X03-01, -05, -07, -09); saldo neutro |
| **Total** | **2,25** | **3,0** | **+0,75** (+0,25 da revisão original; +0,5 das lacunas de 2026-10-29) |

- **Branch:** `test/pwa-e2e-repair` (a partir de `origin/develop`), PR para `develop`.
- **Commits sugeridos:**
  - `test(pwa): pin e2e dev server to a strict port and guard workspace builds`;
  - `test(pwa): make e2e specs hermetic and align them with current contracts`;
  - `ci: run the pwa playwright suite`;
  - `docs: document the pwa e2e harness`.
- **Verificação (dentro do worktree):**
  ```bash
  pnpm --filter pwa typecheck && pnpm --filter pwa lint && pnpm --filter pwa test && pnpm --filter pwa check:ds
  pnpm --filter pwa test:e2e; echo "exit=$?"
  pnpm --filter pwa exec playwright test --repeat-each=3 --retries=0; echo "exit=$?"
  pnpm --filter pwa exec playwright test tests/e2e/auth.spec.ts --project="Mobile Chrome" --project="Mobile Safari" --retries=0; echo "exit=$?"
  pnpm --filter pwa test -- e2e-fixtures; echo "exit=$?"
  TZ=UTC pnpm --filter pwa test:e2e; echo "exit=$?"
  pnpm --filter pwa build
  grep -rn "'\*\*/v1/\*\*'" apps/pwa/tests/e2e || echo "no catch-all"
  grep -rn "isMobile\|viewport.width\|project.name" apps/pwa/tests/e2e --include=*.spec.ts || echo "no ad-hoc project checks"
  git diff --stat origin/develop... | tail -1
  ```
  - No CI (variável `PWA_E2E_ADVISORY` ausente): `test-pwa-e2e` com conclusão `failure` no commit de sanidade (`gh run watch <id> --exit-status; echo "exit=$?"`, sem pipe, antes do revert) e verde depois do revert, com os dois ids no PR.

---

## Achados para revisão

1. **A receita oficial de worktree provavelmente causa a quebra.** O `CLAUDE.md` raiz §16 manda buildar só o `@properfy/shared`. Desde 2026-10-10, o `App.tsx` do PWA importa `@properfy/frontend-standards` no topo, e esse pacote só resolve para `dist/`. Todo worktree feito pela receita sobe um PWA em branco no `vite dev` (e o `typecheck` do PWA também deveria falhar). A correção da receita é da X00 (Bloco R22, que também altera a memória `feedback_worktree_setup_delegated_haiku`); esta tarefa só confere e, se a X00 não tiver entrado, aplica o Bloco R22 literalmente (L-X03-09).
2. **Texto da F04-3b (o coordenador corrige o F04).** Ela cita a X03 com 2,0 dias (o total aqui é 3,0), um job de CI "pwa Playwright mobile e2e" como existente e a rota `/today`. Nenhuma das duas últimas é bloqueio: a F04-3b roda **depois da F04-3** (que cria `/today`) e **depois da X03** (que cria o job, com o nome `test-pwa-e2e` / "E2E pwa (Playwright mobile)").
3. **O job bloqueia deploy desde o primeiro merge (L-X03-01, decidido 2026-10-29).** Não há check obrigatório de merge em nenhuma branch (sem branch protection; ruleset sem `required_status_checks`), nem para o `build`. Os deploys (`frontend-deploy.yml`, `fly-deploy.yml`) exigem o CI inteiro verde, então o job é hard para deploy desde o início, com o kill switch `vars.PWA_E2E_ADVISORY` como rollback. "Promover" a check de merge significa criar `required_status_checks` no ruleset (ação de admin do dev), e vale também para o `build`; fica fora desta tarefa.
4. **WebKit no CI (decisão de 2026-10-28):** os 4 projetos rodam, com mitigações de flake (retries, trace no primeiro retry, sem timeouts arbitrários). O custo cabe nos 0,5 dia de CI + sanidade. O total passa a **3,0** pelas lacunas de 2026-10-29 (fixtures estritas e helpers de harness), não pelo WebKit.

---

## Ajustes necessários em outras tarefas (para reconciliar)

- `tarefas/F04-tarefas.md` · TASK-F04-3b: specs do tour rodam só nos 2 projetos de telefone, com `skipOnWide('tour targets are phone-layout anchors')` de `tests/e2e/support/projects.ts` (trocar "no projeto mobile da config"); E1–E6 = 12 execuções, não 24 (L-X03-07).
- `tarefas/F04-tarefas.md` · TASK-F04-3b: usar `loginAsInspector` (baseline já stuba `/v1/me`, `POST /v1/inspectors/me/app-state` 204 e `GET /v1/inspectors/me`) e registrar o stub que captura o corpo do `app-state` **depois** dele; fixtures novas em `support/fixtures.ts` com `.strict().parse` no `e2e-fixtures.test.ts` (L-X03-04, L-X03-05).
- `tarefas/F04-tarefas.md` · TASK-F04-3b e Achado 2 da X03: X03 com 3,0 dias; job `test-pwa-e2e` bloqueia deploy (não é advisory) e tem `failOnFlakyTests` (L-X03-01, L-X03-02).
- `tarefas/F02-tarefas.md` (e F01, se mergear depois da X03): toda chamada nova de API no boot autenticado do PWA (push/avisos, heartbeat) soma o stub default em `tests/e2e/support/auth.ts` (`BASELINE_STUBS`) no mesmo PR; trocar "e2e em `tests/e2e/` quebrado no repo (56/56)" pelo gate `test-pwa-e2e` (L-X03-05).
- `tarefas/X00-tarefas.md`: registrar que os avisos "56/56 … until X03" (R12, P01 em `apps/pwa/CLAUDE.md` §1, §10, memória M01) são revertidos pela X03, e que o Bloco R22 (§16 com build do `frontend-standards`) é dono exclusivo da X00 (L-X03-09).
- `README.md`: X03 2,5 → 3,0 dias; total de desenvolvimento 110,25 → 110,75 (parcela X03 2,5 → 3,0) (todas as lacunas L-X03).
- (encaminhado) `X03-e2e-pwa.md` (plano): modelo de gate real (deploy exige CI inteiro verde; sem check obrigatório de merge), kill switch `vars.PWA_E2E_ADVISORY` e `failOnFlakyTests` (L-X03-01, L-X03-02).
