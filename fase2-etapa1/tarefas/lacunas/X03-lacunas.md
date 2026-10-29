# X03 · Lacunas

| | |
|---|---|
| **Total** | **9** |
| **ALTA** | 1 |
| **MÉDIA** | 6 |
| **BAIXA** | 2 |
| **Base** | `tarefas/X03-tarefas.md` (2026-10-28) × snapshot `origin/develop` @042a9674 × estado vivo do repositório no GitHub (ruleset e branch protection lidos em 2026-10-28) |

---

## L-X03-01 · O job "consultivo" bloqueia deploy no dia em que entra, e não existe check obrigatório nenhum

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X03-1 · "Job de CI" (parágrafo "Gate: o job é consultivo (advisory) até virar obrigatório") e "Achados para revisão" item 3
- **O que falta / está ambíguo:** a tarefa afirma que, fora de `build.needs` e da branch protection, "um vermelho dele **não bloqueia** o merge" e trata o job como advisory. Dois fatos do repositório contradizem o modelo de gate que a tarefa descreve:
  1. **Os deploys são gateados no workflow inteiro, não no `build`.** `frontend-deploy.yml` e `fly-deploy.yml` disparam por `workflow_run` do CI e só rodam com `github.event.workflow_run.conclusion == 'success'`. Qualquer job vermelho no CI (inclusive `test-pwa-e2e`) faz a conclusão do workflow ser `failure` e **bloqueia o deploy de backend, web e PWA** em `develop`, `staging` e `main`. Um flake do WebKit num push para `develop` trava o DEV inteiro até alguém re-rodar.
  2. **Não há nenhum check obrigatório.** `GET /branches/develop/protection` devolve `404 Branch not protected`; o único ruleset ("Basic Security", ativo em `develop`/`staging`/`main`) tem `deletion`, `non_fast_forward` e `pull_request` com `required_approving_review_count: 0` e **nenhum `required_status_checks`**. Ou seja: hoje nem o `build` bloqueia merge; "entrar em `build.needs`" não muda o gate de merge, só a ordem dos jobs.
  A tarefa não define rollout (o job nasce hard para deploy sem dizer isso), nem rollback (como desligar o job se o WebKit flakear em `develop` sem reverter o PR), nem corrige o modelo de gate que o dev vai usar para decidir "promover ou não".
- **Por que importa:** cenário concreto: X03 mergeia na sexta; no sábado o merge da F02 em `develop` dispara o CI; `Mobile Safari` flakeia 3× (retries esgotados) num teste de marketplace; CI = failure; `frontend-deploy`/`fly-deploy` não rodam; DEV fica com o backend velho e o web novo não sobe. Ninguém esperava, porque a tarefa dizia "consultivo". Sem kill switch, a saída é reverter o job ou re-rodar à mão.
- **Evidência:** `.github/workflows/frontend-deploy.yml:10-36` e `fly-deploy.yml:10-36` (`workflow_run` + `conclusion == 'success'`); `gh api repos/pedroalvs/properfy/branches/develop/protection` → 404; `gh api repos/pedroalvs/properfy/rulesets/20266400` → `rules: [deletion, non_fast_forward, pull_request{required_approving_review_count: 0}]`; `ci.yml:247-258` (`build.needs` sem os dois E2E).
- **Proposta de regra/detalhe:**
  - Reescrever o parágrafo "Gate" com o modelo real: *"merge em `develop` não tem check obrigatório; o gate efetivo é o deploy, que exige o workflow CI inteiro verde. `test-pwa-e2e` é, portanto, bloqueador de deploy desde o primeiro merge."*
  - Acrescentar **kill switch** no job: `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` (variável de repositório, default ausente = hard). Documentar no `PWA/CLAUDE.md` §10 o runbook: *"flake sistemático em `develop` → setar `PWA_E2E_ADVISORY=true` nas Variables do repositório (ação de admin, sem PR), abrir issue, corrigir na causa, remover a variável"*. Isso é o rollback sem reverter código.
  - Nota obrigatória no PR: com `continue-on-error: true` o **job** aparece verde (só a step fica vermelha), então o critério de aceite 3 ("job vermelho") só é verificável com a variável **ausente**. A sanidade V5 roda com a variável ausente.
  - Atualizar o Achado 3: "promover" significa criar `required_status_checks` no ruleset (ação de admin), e isso vale para `build` também, que hoje tampouco bloqueia.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Job hard desde o início (bloqueia deploy como todos os outros) **com** o kill switch `vars.PWA_E2E_ADVISORY` e runbook documentado.
  2. Job com `continue-on-error: true` fixo por N semanas (advisory de verdade); promover a hard num PR de uma linha depois de N semanas sem flake. Custo: durante o período o vermelho só aparece na step, e o critério 3 precisa ser reescrito como "step vermelha".
  3. Job hard sem kill switch (o que a tarefa descreve hoje, sem saber). Não recomendado.

---

## L-X03-02 · "`flaky: 0` no CI" não tem como ser verificado nem imposto

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X03-1 · "Validação primeiro" V6, "Casos de borda" (Retries mascarando flake), "Riscos" (WebKit), Critério de aceite 1
- **O que falta / está ambíguo:** a tarefa exige "no CI, nenhum teste pode passar só no retry: conferir `flaky: 0` no relatório" e "um teste flaky é tratado como falha". Mas: (a) o relatório HTML só é publicado `if: failure()`; numa execução verde com testes flaky **não há artefato** para conferir; (b) o reporter `list` não imprime o resumo de flaky de forma parseável; (c) nenhum passo do job falha quando `flaky > 0`. O critério é inverificável na forma escrita, e o `retries: 2` do CI mascara exatamente o que a tarefa diz que não aceita.
- **Por que importa:** o WebKit no Ubuntu é o risco número 1 da tarefa. Sem imposição automática, um teste que passa no 2º retry em 40% das execuções entra verde no PR, a "estabilidade" do critério 1 é fictícia, e a F04-3b herda um harness que a tarefa prometeu determinístico.
- **Evidência:** job proposto em "Job de CI" (`if: failure()` no upload; reporter `[['list'], ['html']]`); `playwright.config.ts:7` (`retries: CI ? 2 : 0`); Playwright `^1.59.1` (`apps/pwa/package.json`) suporta `failOnFlakyTests` (config) e `--fail-on-flaky-tests` (CLI) desde a 1.52.
- **Proposta de regra/detalhe:**
  - `failOnFlakyTests: !!process.env.CI` na config (mantém `retries: 2` para o trace do primeiro retry, mas a execução termina vermelha se algum teste só passou no retry). Com isso o `if: failure()` do upload passa a cobrir o caso flaky, e o critério 1 vira verificável.
  - Somar `['json', { outputFile: 'test-results/e2e.json' }]` ao reporter do CI e incluir `apps/pwa/test-results/` no artefato (já está), para que o PR possa citar `stats.flaky`.
  - Reescrever V6/critério 1: *"`failOnFlakyTests` ligado no CI; o job fica vermelho se qualquer teste passar só no retry; a evidência é o `e2e.json` do artefato"*.
- **Precisa de decisão do dev?** Não.

---

## L-X03-03 · Critério de saída do diagnóstico e gatilho de reestimativa cobrem só o "crash de bootstrap"

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X03-1 · "Validação primeiro" V3, "Escopo / Passos" 1, "Riscos" (Regra de reestimativa)
- **O que falta / está ambíguo:**
  1. "Parar na primeira [hipótese] que explicar 100% das falhas" não diz **o que é a medida**: 100% dos 56? Só o `login-form` do `auth.spec`? Em quais projetos? H1/H2 explicam o `#root` vazio, mas o inventário já prevê que 11/14 testes continuam vermelhos por drift depois do shell voltar, então "100% das falhas" nunca é atingido pelo V3.
  2. O gatilho de reestimativa é só "V3.3 → H3 (crash de módulo/provider/guarda)". Não há regra para o caso mais provável de sobra: depois de H1+H2+inventário, **sobram falhas que não são drift nem crash** (ex.: `addInitScript` de geolocalização ou IndexedDB se comportando diferente no WebKit; `GroupDetailPane` sem seletor estável; teste que precisa de testid novo no app). A tarefa diz "não adicionar testid ao app só para isso, salvo…" e "corrigir bugs reais do app está fora do escopo", mas não define a fronteira entre "ajuste de harness" e "mudança de app" para fins de reestimativa.
  3. Falhas **só no WebKit** não têm regra: "tirar o WebKit do CI não é opção" e "`test.skip` condicional só por layout, nunca por engine" fecham as duas saídas, sem dizer qual é a terceira.
  4. Não há time-box: o diagnóstico vale 0,5 dia, mas nada diz quando parar e escalar se V3.1/V3.2 não fecharem.
- **Por que importa:** o implementador fica preso entre "não posso mexer no app" e "não posso pular o WebKit" num teste que falha só no `Mobile Safari` por timing de IndexedDB; sem regra, ou gasta dias, ou mascara com espera (`waitForTimeout`, proibido), ou abre PR com `test.skip` injustificado. A F04-3b fica bloqueada sem data.
- **Evidência:** V3 ("parar na primeira que explicar 100% das falhas"); Riscos ("A estimativa de 2,5 vale só para causa de harness/env (H1/H2/H4/H5)"); Inventário (`execution-finish` migra `addInitScript` + IndexedDB, 2 projetos WebKit).
- **Proposta de regra/detalhe:**
  - **Critério de saída do diagnóstico:** `auth.spec.ts` 3/3 verde em `Mobile Chrome` **e** `Mobile Safari` com `--retries=0`, num worktree com os dois `dist` construídos e porta estrita. Atingido isso, o diagnóstico acabou; o resto é inventário (Passo 6).
  - **Time-box:** 0,5 dia. Se V3.1 e V3.2 não derem o critério acima, registrar o `pageerror`/trace e escalar ao dev no mesmo dia (reestimativa), mesmo que a causa ainda não seja classificada como H3.
  - **Fronteira harness × app:** qualquer mudança sob `apps/pwa/src/` que não seja (a) `data-testid` novo onde não há seletor acessível ou (b) `optimizeDeps` no `vite.config.ts` conta como "mudança de app" e dispara a reestimativa.
  - **Falha só-WebKit** depois do inventário: tratada como mudança de app (dispara reestimativa) **ou** como `test.fixme(isWebKit, '<issue>')` temporário com issue aberta e prazo, a critério do dev. Nunca `test.skip` silencioso nem espera arbitrária.
- **Precisa de decisão do dev?** Sim, só para o item "falha só-WebKit".
  1. **(Recomendada)** `test.fixme` por engine com issue + prazo, para não bloquear a F04-3b; o conserto vira tarefa própria.
  2. Reestimar e corrigir dentro da X03 (bloqueia a F04-3b pelo tempo que levar).
  3. Remover o projeto WebKit afetado do CI (contraria a decisão de 2026-10-28; não recomendado).

---

## L-X03-04 · O teste Vitest "parse das fixtures" está subespecificado e as fixtures atuais não passam nele

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X03-1 · "Escopo / Passos" 5 (helpers de mock, teste `src/__tests__/e2e-fixtures.test.ts`), "Decisões aplicáveis" (fixtures seguem o contrato)
- **O que falta / está ambíguo:**
  1. **Qual fixture valida contra qual schema** não está listado, e o único exemplo (`marketplaceOfferResponseSchema` para `OFFER`) esconde que **todos** os payloads têm schema no shared: `meResponseSchema`, `inspectorScheduleMonthResponseSchema`, `marketplaceOfferDetailResponseSchema`, `inspectorAppointmentDetailResponseSchema`, `finishInspectionResponseSchema`. O "se o shared não exportar schema" não se aplica a nenhuma delas.
  2. `INSPECTOR_ME` é descrito como "plana, com `role: 'INSP'`, `inspectorId`, `timezone`". O `meResponseSchema` exige `id` **uuid**, `branchId`, `totpEnabled`, `phone`, `status`, `lastLoginAt`, `createdAt` (instant), `timezone`, `personalTimezone`. As fixtures de hoje (`id: 'user-1'`, 5 campos) falham o parse; a tarefa não diz que a fixture nova precisa ser completa.
  3. Os schemas de resposta **não são `.strict()`** (0 ocorrências em `responses.ts`), então um `parse` simples aceita chaves mortas: a memória `feedback_test_fixtures_must_match_api_shape` não fica cumprida para o caso "campo que o app não recebe mais".
  4. **Onde as fixtures moram:** se ficarem em `support/auth.ts`/`api.ts` (que importam `@playwright/test` e usam `Page`), o teste Vitest em jsdom carrega o runner do Playwright. Também não está dito como o teste em `src/__tests__/` importa de `tests/e2e/support/` (fora do `include` do tsconfig e fora de `src`, que o `lint` cobre).
- **Por que importa:** o implementador escreve a fixture pelo que a tela usa, o parse falha por `uuid`/campos obrigatórios, e a saída fácil é relaxar o teste (`.partial()`, `safeParse` sem assert) ou pular — e o objetivo (fixtures sincronizadas com o contrato, que a F04-3b vai copiar) se perde.
- **Evidência:** `packages/shared/src/schemas/responses.ts:105-127` (`meResponseSchema`), `:657-713` (offer e detail), `:848-901` (schedule item/month), `:492` (appointment detail), `:909` (finish); `grep -c '\.strict()' responses.ts` → 0; specs atuais com `id: 'user-1'`; `apps/pwa/tsconfig.json` (`include: ["src", …]`), `package.json` (`"lint": "eslint src"`).
- **Proposta de regra/detalhe:**
  - `tests/e2e/support/fixtures.ts` **puro** (sem import de `@playwright/test`), exportando as constantes; `auth.ts`/`api.ts` importam dele.
  - Tabela fixa no passo 5: `INSPECTOR_ME → meResponseSchema`, `SCHEDULE_MONTH_EMPTY`/`SCHEDULE_MONTH_ONE → inspectorScheduleMonthResponseSchema`, `OFFER → marketplaceOfferResponseSchema`, `OFFER_DETAIL → marketplaceOfferDetailResponseSchema`, `APPOINTMENT_DETAIL → inspectorAppointmentDetailResponseSchema`, `FINISH_RESULT → finishInspectionResponseSchema`, `LOGIN_401 → errorResponseSchema` (ou o envelope `{ error: { code, message } }` documentado).
  - Parse com `schema.strict().parse(fixture)` (chave a mais = falha), ids em uuid válido, datas por `civilDateStr`/`instantStr` do shared.
  - O teste fica em `apps/pwa/tests/e2e/support/__tests__/fixtures.test.ts` e o `vite.config.ts` muda `test.exclude` para excluir só `tests/e2e/*.spec.ts` (não `tests/e2e/**`), **ou** fica em `src/__tests__/` com import relativo `../../tests/e2e/support/fixtures` — escolher um e registrar; o PR precisa provar que `pnpm --filter pwa test` executa o arquivo (contagem de testes no log).
- **Precisa de decisão do dev?** Não.

---

## L-X03-05 · `loginAsInspector` não define o conjunto-base de stubs, e as chamadas de boot da F01/F02 vão cair no 501

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X03-1 · "Escopo / Passos" 5 (`auth.ts`), "Requisitos do harness" (Mocks), "Dependências"
- **O que falta / está ambíguo:** `loginAsInspector` registra `blockUnmockedApi` + `/v1/me` e nada mais. Pela ordem das ondas (X03 na Onda 2, **depois** da F01 na Onda 1), quando a X03 mergear o app já terá o heartbeat da F01 (`POST /v1/inspectors/me/app-state`, disparado no boot autenticado com throttle em `localStorage`) e, em seguida, a F02 somará push/avisos. Cada uma dessas chamadas devolve `501 E2E_UNMOCKED` em **toda** spec. A tarefa não diz: (a) se um 501 em chamada de telemetria é tolerado ou falha o teste ("o não mockado … falha o teste de forma legível" sugere que falha); (b) quem é dono de manter o conjunto-base quando uma feature nova adiciona uma chamada de boot; (c) o que a F04-3b encontra pronto (`/v1/inspectors/me`, `app-state`).
- **Por que importa:** no dia seguinte ao merge da F01 (ou no próprio PR da X03, se a F01 já estiver em `develop`), 56/56 passam a ter um 501 no trace; se `blockUnmockedApi` for tratado como falha, a suíte quebra de novo por uma chamada benigna; se for tolerado em silêncio, o 501 deixa de ser "legível" e volta a esconder mocks faltando.
- **Evidência:** README "Ordem de execução" (Onda 1 F01; Onda 2 X03); F04-tarefas `TASK-F04-3b` "Contexto" (heartbeat `POST /v1/inspectors/me/app-state`, cliente `useAppStateHeartbeat.ts`, throttle 6 h) e E2E E1–E6 (mockam `/v1/inspectors/me` e `app-state`); X03 "Requisitos do harness" ("todo request … não mockado devolve 501 … e falha o teste").
- **Proposta de regra/detalhe:**
  - Definir a semântica do 501: **não** falha o teste por si (o app decide); falha quando a asserção depende dele. O helper registra `console.warn` legível no trace. Acrescentar ao `PWA/CLAUDE.md` §10 a regra: *"toda feature que adiciona uma chamada de API no boot autenticado adiciona o stub default correspondente em `tests/e2e/support/auth.ts` (`BASELINE_STUBS`) no mesmo PR"*.
  - `loginAsInspector(page, { me = INSPECTOR_ME, baseline = true })`: com `baseline`, registra `blockUnmockedApi` → `/v1/me` → `POST /v1/inspectors/me/app-state` 204 → `GET /v1/inspectors/me` (fixture `INSPECTOR_PROFILE`, quando a rota existir no snapshot da implementação). Listar no PR os stubs do baseline no momento do merge.
  - Nota para a F04-3b: ela sobrescreve `app-state` com o stub que captura o corpo (rota registrada por último vence), sem mexer no baseline.
- **Precisa de decisão do dev?** Não.

---

## L-X03-06 · A migração do `execution-finish.spec.ts` para `addInitScript` não diz como o IndexedDB é semeado

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X03-1 · "Inventário de specs" (4 testes de `execution-finish`), Critério de aceite 4 ("nenhuma spec usa `goto('/login') + evaluate` para auth")
- **O que falta / está ambíguo:** hoje o `setupExecutionAtFinishing` faz `goto('/login')` e, no `evaluate`, grava os tokens **e** semeia `properfy-pwa` v1 (`execution-states` com `phase: 'FINISHING'`) antes de navegar para `/execution/:id`. A tarefa manda trocar "`goto('/login') + evaluate` por `loginAsInspector`" (que usa `addInitScript`), mas não diz onde fica a semente do IndexedDB. `addInitScript` roda antes do app e é síncrono; um `openDB('properfy-pwa', 1)` ali corre em paralelo com o `openDB` do app (`features/execution/lib/indexeddb.ts:34`), e o `put` pode acontecer depois de a `ExecutionPage` ler o estado → `submit-button` nunca aparece, de forma intermitente (pior no WebKit).
- **Por que importa:** é exatamente o tipo de falha "só no retry" que a tarefa proíbe, numa spec com 4 testes × 4 projetos = 16 dos 56.
- **Evidência:** `apps/pwa/tests/e2e/execution-finish.spec.ts:120-159`; `apps/pwa/src/features/execution/lib/indexeddb.ts:34-40` (`openDB('properfy-pwa', 1, { upgrade })`); `App.tsx:12-24` (`OfflineQueueSync` monta antes do router).
- **Proposta de regra/detalhe:**
  - Helper `seedExecutionState(page, state)` em `support/idb.ts` que faz `goto('/login')` (rota pública, sem chamada de API quando não há token) + `evaluate` com o `openDB` **aguardado** (o código atual, extraído), e só então o teste navega para `/execution/:id`. Tokens continuam via `loginAsInspector` (`addInitScript`), registrado **antes** do `goto`.
  - Reescrever o critério 4: *"nenhuma spec grava tokens via `goto + evaluate`; semear IndexedDB via `evaluate` numa rota pública é permitido e fica no helper `seedExecutionState`"*.
- **Precisa de decisão do dev?** Não.

---

## L-X03-07 · Não existe mecanismo correto para restringir uma spec por projeto, e a F04-3b precisa de um

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X03-1 · "Requisitos do harness" (Viewport/projetos: "A F04-3b roda as specs do tour 'no projeto mobile'. Se quiser restringir, usa `test.skip(({ isMobile }) => ...)` ou `testInfo.project.name`"), Inventário (`isWide` derivado de `testInfo.project.name`)
- **O que falta / está ambíguo:** `test.skip(({ isMobile }) => …)` **não distingue nada**: os 4 projetos têm `isMobile: true` (`iPhone 13`, `Pixel 5`, `iPad (gen 7)` e o `Foldable` explicitamente). O único critério que funciona é o nome do projeto ou a largura do viewport, e a tarefa deixa cada spec reinventar isso ("um `isWide` derivado de `testInfo.project.name`"). A F04-3b diz "no projeto mobile da config" sem dizer se E1–E6 rodam nos 4 projetos (24 testes) ou só nos 2 de telefone, e não há helper para ela usar.
- **Por que importa:** duas specs com dois `isWide` diferentes (uma por nome, outra por `viewport.width`), um deles errado no `iPad` (810 px, "right at the breakpoint" segundo o comentário da config); a F04-3b escreve 6 cenários que no `Tablet` miram alvos do layout largo que o tour pode não ter.
- **Evidência:** `apps/pwa/playwright.config.ts:17-37` (`isMobile: true` nos 4 projetos; iPad 810×1080 "sits right at the breakpoint"); `MarketplacePage.tsx:34` (`useIsWide()`); F04-tarefas linha 1958 ("no projeto mobile da config").
- **Proposta de regra/detalhe:**
  - `tests/e2e/support/projects.ts`: `export const WIDE_PROJECTS = ['Tablet (iPad portrait)', 'Foldable open'] as const; export const isWideProject = (testInfo: TestInfo) => WIDE_PROJECTS.includes(testInfo.project.name)` e `skipOnWide(reason)` / `skipOnPhone(reason)` como wrappers de `test.skip` com motivo obrigatório. Toda spec usa isso; nenhuma deriva largura por conta própria. Os nomes dos projetos viram contrato (mudar nome = mudar a constante).
  - Documentar em `PWA/CLAUDE.md` §10 e no "Contratos exportados" para a F04-3b: *"as specs do tour rodam nos projetos de telefone; `skipOnWide('tour targets are phone-layout anchors')` no topo do arquivo"* (ou o oposto, conforme a decisão abaixo).
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Specs do tour (F04-3b) só nos 2 projetos de telefone, via `skipOnWide` com motivo; as 4 specs atuais continuam nos 4 projetos.
  2. Specs do tour nos 4 projetos (24 testes), com a F04-3b obrigada a garantir alvos do tour nos dois layouts (+custo na F04-3b).
  3. Projeto dedicado `Tour (phone)` na config, com `testMatch: 'app-tour.spec.ts'` (mais config; dificulta o "um `test.skip` com motivo" como regra única).

---

## L-X03-08 · A sanidade V5 no CI é cancelada pelo `concurrency` do workflow

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X03-1 · "Validação primeiro" V5, Critério de aceite 3
- **O que falta / está ambíguo:** o `ci.yml` tem `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`. O roteiro "push do commit de sanidade → push do revert" cancela a execução vermelha se o revert for empurrado antes de ela terminar (~7 min com WebKit); uma execução **cancelada** não é `failure`, não publica o artefato `pwa-playwright-report` (o `if: failure()` não dispara) e não serve como evidência do critério 3.
- **Por que importa:** o implementador segue o roteiro, linka um run "cancelled", e o critério 3 fica sem prova; ou refaz o ciclo e perde mais 15 min de CI.
- **Evidência:** `.github/workflows/ci.yml:9-11`; V5 passos 2–3.
- **Proposta de regra/detalhe:** no V5, entre o push do commit de sanidade e o push do revert, **aguardar o run terminar** (`gh run watch <id> --exit-status; echo "exit=$?"` — esperado ≠ 0, sem pipe, memória `feedback_gh_run_watch_pipe_exit`) e só então reverter. Registrar no PR o id do run vermelho (conclusão `failure`, com artefato) e do verde.
- **Precisa de decisão do dev?** Não.

---

## L-X03-09 · Coordenação com a X00: as duas tarefas escrevem a mesma receita do §16 e o mesmo aviso "56/56" em quatro lugares

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X03-1 · "Escopo / Passos" 9 (`CLAUDE.md` raiz §16 e "frase da X00"), "Dependências" (coordenação com a X00), H1 correção (2)
- **O que falta / está ambíguo:** a X03 lista como entrega própria "§16 passo 2: somar `pnpm --filter @properfy/frontend-standards build`". A X00 (Onda 0, antes de tudo) já faz exatamente isso no **Bloco R22** e ainda altera a memória `feedback_worktree_setup_delegated_haiku` (M01). A X03 só prevê rebase "de quem mergear depois", mas não diz o que fica com quem: na prática, quando a X03 rodar, o §16 já estará corrigido e o passo 9 é no-op. Por outro lado, a X00 grava o aviso "broken (56/56) … until X03" em **quatro** lugares que a X03 precisa reverter — `CLAUDE.md` raiz (R12, linha 214 do X00), `apps/pwa/CLAUDE.md` §1 (P01) e §10 (linha 472 do X00), e a memória — e a X03 só cita "a frase do `CLAUDE.md` raiz" e o §2/§10 do PWA.
- **Por que importa:** o V1 ("faça o setup **exatamente** como manda o `CLAUDE.md` raiz, só `shared build`") deixa de reproduzir a H1 depois da X00, e um implementador literal perde tempo; e o aviso "56/56" sobrevive no §1 do `apps/pwa/CLAUDE.md` depois da X03 (o X00 escreve §1 e §10; a X03 só reescreve §2 e §10).
- **Evidência:** `tarefas/X00-tarefas.md:169` (R22), `:250` (Bloco R22), `:214` (R12 texto), `:444` (P01, `apps/pwa/CLAUDE.md:24`), `:472` (§10), `:524` (M01); X03 passo 9 e V1.
- **Proposta de regra/detalhe:**
  - V1: *"o worktree é criado sem `pnpm --filter @properfy/frontend-standards build`, independentemente do que o `CLAUDE.md` diga (a X00 já corrige a receita); isso é o que torna a H1 testável"*.
  - Passo 9: trocar "§16 passo 2: somar o build" por "conferir que o §16 já tem o build (R22 da X00); se a X00 não tiver entrado, aplicar o Bloco R22 literalmente". Listar os quatro pontos que a X03 reverte: `CLAUDE.md` raiz R12, `apps/pwa/CLAUDE.md` §1 (P01) e §10, memória `project_pwa_e2e_suite_broken_vacuous` + linha do `MEMORY.md`.
- **Precisa de decisão do dev?** Não.
