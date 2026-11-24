# Fase 2 — plano de execução pós-validação

**Para:** executor "Claude Code" (despacha agentes, roda review, mergeia no verde).
**Fonte das decisões:** `fase2-etapa1/plano-acao-pos-validacao.md` (seções A–H, todas decididas pelo Pedro em 23–24/11/2026) + `fase2-etapa1/smoke-dev-2026-11-23.md` (defeitos, falhas, pendentes).
**Escopo:** só o Anexo I. Cada PR traz a seção de origem no plano de ação e o item/critério do anexo.
**Base de código:** todo worktree nasce de **`origin/develop`** (conferido em `bfbc9e4e`, merge do #1373). O checkout local está atrás: nunca basear nele. Arquivos e funções abaixo foram conferidos em `origin/develop`.
**Elaborado por:** Prumo (planejador), 24/11/2026. Não altera código.

---

## 0. Regras que valem para todos os PRs

1. **1 tarefa = 1 PR**, alvo `develop`, ≤ 150 arquivos (`git diff --stat origin/develop... | tail -1`).
2. **Worktree** por PR a partir de `origin/develop`; setup (pnpm install, `prisma generate`, build de `@properfy/shared` e `@properfy/frontend-standards`, typecheck + lint de baseline) delegado a subagente haiku.
3. **TDD**: o teste que prova o defeito falha antes da correção. Em remoções, a prova é a suíte existente verde + o `git grep` indicado voltar vazio.
4. **Gates dentro do worktree**: typecheck + lint + testes do(s) workspace(s). Se tocar backend (use case, rota, wiring), rodar também `pnpm --filter backend test:integration:db`. Mudança em `packages/shared` exige lint/typecheck de web e pwa. Ao mudar construtor de use case, atualizar todos os `new <UseCase>(` (container + testes).
5. **api-types**: tocou rota/schema → `pnpm generate:api` e commitar `packages/shared/openapi.json` + `packages/shared/src/api-types.ts`. PRs que regeneram o contrato **mergeiam em série** (rebase + regenerar, nunca resolver conflito à mão).
6. **CLAUDE.md** de cada workspace tocado atualizado no mesmo PR (§13.11).
7. **Commits/PR**: Conventional Commits, imperativo, sem nenhuma referência a Claude/Anthropic/IA.
8. **Review loop**: code-review por subagente antes do merge; corrigir e re-revisar o delta até limpo.
9. **Portão de design** (flag MUDANÇA-DE-TELA): antes de implementar, mostrar ao Pedro o que está descrito no PR e esperar aprovação. Textos de interface em inglês.
10. **Ambientes**: o agente não altera staging nem produção. DEV é livre só para teste (seção G do plano de ação).
11. **Parar e perguntar** quando a realidade divergir do PR (consumidor não previsto, valor gravado fora do padrão etc.). Nada fora do escopo é acrescentado nem removido por conta própria.

**Legenda de flags:** `CONTRATO` (item/critério do anexo) · `REMOÇÃO DECIDIDA` (fora do anexo, Pedro mandou tirar) · `DEFEITO` (comportamento divergente; se ligado a critério, é correção sem custo — cláusula 9.5) · `MUDANÇA-DE-TELA` · `ROTA/SCHEMA` (regenera api-types) · `ARQ. COMPARTILHADO` (api-types, role-matrix, templates, `schema.prisma`, `INSPECTOR_NOTICE_TARGET_PATTERNS`).

---

## 1. Visão geral das ondas

| Onda | PRs | Depende de | Paralelismo |
|---|---|---|---|
| 0 | DOC-1 (docs, sem worktree) | — | sozinho |
| 1 | PR-01 … PR-13 | nada entre si, exceto o portão de design/decisão de cada um | todos em paralelo (worktrees diferentes). Só PR-13 regenera api-types nesta onda |
| 2 | PR-14 (E-2), PR-15 (E-5) | PR-14 depois do PR-13 (api-types) | PR-14 ∥ PR-15 |
| 3 | PR-16 (E-3), PR-17 (E-4) | PR-16 depois de PR-14 e PR-15; PR-17 depois de PR-14 (api-types) e da contagem do Pedro | PR-16 ∥ PR-17; merge em série se ambos regenerarem api-types |
| Bloqueado | PR-18 (D-05) | proposta de regra aprovada pelo Pedro | entra na primeira onda livre depois da aprovação |
| Fora de PR | OPS-1 … OPS-6, DOC-2 (C-1), VAL-1 (H-6) | ver bloco 5 | — |

Conflitos esperados e como tratar:
- `apps/*/CLAUDE.md` e `CLAUDE.md` da raiz são editados por quase todos os PRs → rebase simples antes do merge.
- `day-plan/` (PR-06 e PR-13) mexem em arquivos diferentes; quem mergear depois faz rebase.
- `Sidebar.tsx`/`router.tsx` (PR-15 e PR-16) e `ConsentLookup.tsx` (PR-14 e PR-16) → por isso PR-16 fica na onda 3.

---

## 2. Onda 0

### DOC-1 — `docs(fase2): reclassify post-validation findings and commit pending phase docs`

- **Origem:** A, B1 (documentação), C (decisões 1 e 2), E (tabela de achados), F, H-5.
- **Anexo:** — (documentação). **Flags:** nenhuma de código. Sem worktree (exceção §16: só docs). Pode usar o branch `docs/fase2-pos-validacao` / PR #1374.
- **O que fazer:**
  - `fase2-etapa1/estacionamento.md` (linha ~49): "Show login details" = entregue pelo cartão "Apps"; apresentação difere do mockup v3 e não muda (fora do escopo); manter o registro da decisão de 18/11 e por que foi revista.
  - `fase2-etapa1/VALIDACAO-consolidada.md` (linhas ~130 e ~144): retirar "ÚNICO item do PDF sem registro de decisão"; no "Eixo 2 — PWA × Cliente", explicitar que a tabela compara com o PDF de design, que não é escopo; onde o selo de prioridade aparecer como gap: acesso antecipado entregue, selo não fazia parte, código morto retirado (PR-01).
  - Seção C da nota/relatório: nenhuma diferença frente ao escopo; o PDF é guia visual.
  - "Session management is not available yet." (H-4 do smoke): registrar que é mensagem de reserva e que "Active Sessions" funciona — não é defeito (tabela da seção E).
  - Commitar os 8 arquivos de `fase2-etapa1/` só da cópia local (F08, F10, README, cronograma, decisões, paralelização, tarefas F08 e F10).
  - Este plano (`plano-execucao-pos-validacao.md`).
- **Não entra:** `.eslintrc.json` (decisão pendente, ver §6), o anexo (`fase2-etapa1/arquivo/*`), `output/`, rascunhos da raiz.
- **Aceite:** PR mergeado; `git diff --stat` só com arquivos de `fase2-etapa1/`.

---

## 3. Onda 1 (paralela)

### PR-01 — `refactor(pwa): remove dead offer priority countdown`

- **Origem:** B1. **Anexo:** 03.7 / Q13 (o acesso antecipado está entregue; o selo não é pedido). **Flags:** `REMOÇÃO DECIDIDA`. Visualmente o selo nunca acendia: sem MUDANÇA-DE-TELA.
- **Workspaces:** pwa.
- **Dependências:** nenhuma.
- **Remover, e só isto:**
  - `apps/pwa/src/features/offers/components/OfferCard.tsx`: `usePriorityCountdown`, a chamada e o comentário, o bloco "Priority countdown" (`data-testid="priority-countdown"`), imports que ficarem sem uso (`Clock`, `ClockAlert`, hooks) **só se** nada mais no arquivo os usar.
  - `apps/pwa/src/features/offers/types/index.ts`: campos `priorityMode?` e `priorityExpiresAt?`; se a interface ficar vazia, virar alias do tipo de `@properfy/shared` e ajustar o comentário.
  - Testes: os dois casos do selo em `components/__tests__/OfferCard.test.tsx`; `priorityExpiresAt: null` nas fixtures de `AcceptOfferModal.test.tsx`, `GroupDetailBottomSheet.test.tsx`, `OfferAccordionList.test.tsx`, `OffersMapView.test.tsx`, `hooks/__tests__/useMarketplaceOffers.test.ts`, `pages/__tests__/MarketplacePage.test.tsx`.
- **Não fazer:** backend, `packages/shared`, `openapi.json`, `api-types.ts`; filtro/aceite/403 `OFFER_EARLY_ACCESS_ONLY`; `priorityOfferHours` (é o PR-17); redesenho do cartão.
- **Aceite:** `git grep -nE "priorityExpiresAt|priorityMode|priority-countdown|Priority expired" origin/develop -- apps packages` vazio no branch; `pnpm --filter pwa typecheck lint test` + E2E do PWA verdes; `apps/pwa/CLAUDE.md` atualizado se citar o selo.

### PR-02 — `fix(pwa): refresh next inspection card after check-out`

- **Origem:** H-1 / D-02. **Anexo:** 00.7 / **00.A3**. **Flags:** `DEFEITO`. Restaura o comportamento esperado (botão "Check in" aparece sem recarregar): sem MUDANÇA-DE-TELA.
- **Workspaces:** pwa. **Dependências:** nenhuma.
- **Comportamento:** em **Today**, depois de "Check out" da parada atual, o cartão "Next inspection" da parada seguinte mostra "Check in" sem recarregar (a aba **Schedule** já faz isso).
- **Alvos:** `apps/pwa/src/features/today/pages/TodayPage.tsx` (linha ~133, `next`), `features/today/components/NextInspectionCard.tsx`, `AppointmentActionBar` (`features/execution/components/`), `useLocalExecutionState` / `execution-state-events.ts` (`emitExecutionStateChange`), invalidação de `['inspector','day-plan']` após check-out (`useExecutionActions`). Hipótese a confirmar no teste: o cartão é montado com estado local da parada anterior (mesmo componente/chave) ou o plano não é relido após o DONE.
- **TDD:** teste de `TodayPage`/`NextInspectionCard` que faz check-out da parada 1 e espera "Check in" na parada 2 sem remontar a página; falha hoje.
- **Aceite:** teste novo verde; suíte PWA + E2E verdes. Reteste em DEV pelo "Claude Code #3"/Batedor.

### PR-03 — `fix(pwa): keep suggested-order comparison after saving a route order`

- **Origem:** H-1 / D-06. **Anexo:** 01.3 / **01.A2**. **Flags:** `DEFEITO`. Texto existente passa a refletir o valor certo: sem MUDANÇA-DE-TELA.
- **Workspaces:** pwa. **Dependências:** nenhuma.
- **Comportamento:** depois de "Save order" de uma ordem pior, o cabeçalho de **Today's route** continua comparando com a ordem sugerida ("Finish ~6:54 pm · +58 min vs. suggested"), não "Same finish time as suggested".
- **Alvos:** `apps/pwa/src/features/day-plan/lib/reorder-preview.ts` (`formatDelta`, linha ~89), `useReorderPreview` (ordem sugerida alinhada, cache por versão — após salvar, a versão nova passa a ter a ordem salva como "atual" e a sugestão não é mais buscada/igualada), `reorder-draft.ts`. Fonte da ordem sugerida depois do save: conferir no contrato da GET (`/v1/inspector/day-plans/:date`) se há ordem sugerida separada; se o contrato não a tiver, **parar e levar ao Pedro** (seria mudança de contrato).
- **TDD:** teste de `useReorderPreview`/página: salvar ordem com delta +58 → após o refetch, delta continua +58.
- **Aceite:** teste novo verde; suíte PWA + E2E verdes.

### PR-04 — `fix(pwa): use configured minimum services in challenges copy`

> **Escopo revisado (Pedro, 24/11/2026).** O número **não** vem de `minimumServices` (mínimo de uma meta, fixo em 10 no backend — outro conceito) e sim de `reliabilityIndex.minimumVolume` (campo "Minimum services to be ranked"), que não estava no contrato de `GET /v1/inspector/program`. Aprovado: expor **só** `minimumVolume` em `standing.index.minimumVolume` (backend `get-inspector-program.use-case.ts` lê a configuração; `packages/shared` ganha o campo `z.number().int().min(1)`; PWA usa o número nos dois textos, com o singular "1 job"; `pnpm generate:api`). **Workspaces:** backend + shared + pwa. **Flags:** + `ROTA/SCHEMA`, + `ARQ. COMPARTILHADO`. **Dependências:** PR-13 (série de api-types). O campo é obrigatório (mínimo 1), nunca nulo → a frase fica **sempre visível**; "esconder quando não há mínimo" não se aplica. Os itens abaixo valem no que não contrariam este bloco.

- **Origem:** H-1 / D-07. **Anexo:** 03.10 / 03.15 / **03.A3**. **Flags:** `DEFEITO`, `MUDANÇA-DE-TELA` (mínima).
- **Portão de design — mostrar ao Pedro:** os dois textos com o número vindo da configuração: "Based on your last 30 days. You need {n} jobs for a score." e "You'll appear once you have {n} jobs in the last 30 days." (e o singular para n = 1, "1 job"). Sem outra mudança.
- **Workspaces:** pwa. **Dependências:** nenhuma.
- **Alvos:** `apps/pwa/src/features/challenges/components/StandingCards.tsx` (linha ~26), `components/RankingTab.tsx` (linha ~20), teste `pages/__tests__/ChallengesPage.test.tsx` (linha ~178). Origem do número: `minimumServices` em `packages/shared/src/schemas/inspector-program.ts` (linha ~399, `z.number().int().nullable()`); confirmar que vem na resposta de `GET /v1/inspector/program`. Se não vier, **parar e levar ao Pedro** (exigiria contrato).
- **Não fazer:** "Complete 1 inspections" (observação H-4, sem decisão).
- **TDD:** com `minimumServices = 1`, os textos dizem 1; com `null`, comportamento definido no portão de design.
- **Aceite:** testes verdes; reteste em DEV ("Minimum services to be ranked" está em 1).

### PR-05 — `fix(backend): base live day not-started alert on the current stop time`

- **Origem:** H-1 / D-12. **Anexo:** 01.11 / **01.A5**. **Flags:** `DEFEITO`.
- **Workspaces:** backend. **Dependências:** nenhuma.
- **Comportamento:** o alerta "não iniciado" usa o horário atual da parada (janela reagendada), não o `publishedServiceStartAt` congelado na publicação. A métrica de precisão de ETA continua usando o congelado (L-F04-15).
- **Alvos:** `apps/backend/src/modules/live-day/domain/stop-view.ts` (`baselineInstant`, linha ~31), `domain/derive-alerts.ts` (linha ~100). Outros consumidores de `baselineInstant`: `application/use-cases/get-live-day.use-case.ts` (linha ~304) e `domain/compute-accumulated-delay.ts` (linha ~18) — **não mudar** sem decisão (ver §6, item 9); o plano de ação fala só do alerta.
- **TDD:** domínio puro: parada publicada às 17:00, reagendada para 13:00–13:15, sem check-in, limite 5 min, `now` 13:21 → alerta presente (falha hoje). Teste de que a métrica de precisão segue no congelado.
- **Aceite:** unit + suíte backend + `test:integration:db` verdes; `apps/backend/CLAUDE.md` (seção Live Day) atualizado.

### PR-06 — `fix(backend): send route-ready notice only for a published next-day plan`

- **Origem:** H-1 / D-13. **Anexo:** 00.9 / **00.A2**. **Flags:** `DEFEITO`; texto do aviso pode mudar (ver decisão).
- **⚠ Precisa decisão do Pedro antes** (parte a): (1) o aviso só sai para o plano do dia seguinte, **ou** (2) o texto confere a data ("today"/"tomorrow"). Se (2), é texto visível no aparelho → mostrar ao Pedro o texto antes.
- **Workspaces:** backend. **Dependências:** nenhuma.
- **Comportamento:** (b) `PublishDayPlansUseCase` só envia `ROUTE_PUBLISHED` e chama `markNotified` quando o plano está `PUBLISHED`; (a) conforme a decisão.
- **Alvos:** `apps/backend/src/modules/day-plan/application/use-cases/publish-day-plans.use-case.ts` (bloco `if (record.notifiedAt === null)`, linhas ~133–146), `application/day-plan-notices.ts` (título fixo "Your route for tomorrow is ready", linha ~46), `deriveDueInspectors`/`loadPublishDue` se a opção (1) for escolhida.
- **TDD:** (b) plano DRAFT (janela fechada) → nenhum aviso, `notifiedAt` continua null; (a) plano do próprio dia publicado `ON_OPEN` com claim pendente → conforme decisão. Ambos falham hoje.
- **Aceite:** testes verdes + `test:integration:db`; `apps/backend/CLAUDE.md` (19:30 publish job) atualizado.

### PR-07 — `fix(backend): return 404 when listing files of another agency's property`

- **Origem:** H-1 / D-15. **Anexo:** C.3 / **C.A2**. **Flags:** `DEFEITO`; `ROTA/SCHEMA` **só se** a resposta 404 precisar ser declarada no schema da rota (então regenerar api-types e mergear em série com PR-13).
- **Workspaces:** backend. **Dependências:** nenhuma.
- **Comportamento:** `GET /v1/property-files?propertyId=<outra agência>` (e `appointmentId` de outra agência) → 404, igual ao detalhe (C.A2). Hoje 200 com lista vazia (sem vazamento).
- **Alvos:** `apps/backend/src/modules/property-file/application/use-cases/list-property-files.use-case.ts` (`resolveReadListScope`, linhas ~19–29), o serviço de escopo do módulo; mesma regra no `list-property-issues` se tiver o mesmo padrão (conferir; se não, não mexer).
- **TDD:** route test com CL_ADMIN da agência A pedindo `propertyId` da agência B → 404 (falha hoje); OP/AM cross-tenant continuam 200; INSP pelo predicado T-1 inalterado.
- **Aceite:** testes + `test:integration:db` verdes; web (`PropertyFilesPanel`) segue funcionando (o caso cross-tenant não é alcançável pela tela).

### PR-08 — `fix(backend): stop storing raw inspector coordinates in execution audit`

- **Origem:** H-2 / D-01 (+ item 12 do estacionamento). **Anexo:** sem critério direto; regra §7.9 do projeto (relacionado a 03.2 e D.A3). **Flags:** `DEFEITO`.
- **Workspaces:** backend. **Dependências:** nenhuma.
- **Comportamento:** entradas novas de `inspection.started`, `inspection.finished` e `inspection.geolocation_mismatch` sem `latitude`/`longitude`/`inspectorLatitude`/`inspectorLongitude`; mantêm distância, precisão e sinalizações. Entradas antigas continuam mascaradas na leitura para CL (`maskCoordinateKeys`).
- **Alvos:** `apps/backend/src/modules/inspector-execution/application/use-cases/start-inspection.use-case.ts` (linhas ~297 e ~320), `finish-inspection.use-case.ts` (linhas ~161 e ~180); não mexer em `audit/domain/mask-coordinate-keys.ts`.
- **TDD:** os testes dos dois use cases afirmam que o `audit.log` não recebe nenhuma chave de coordenada crua (falham hoje) e continua com distância/precisão.
- **Atenção:** a coordenada continua gravada em `inspection_executions` (a operação vê no detalhe); só sai da auditoria. Se algum consumidor ler a coordenada da auditoria (grep `inspectorLatitude` em `apps/backend/src` e `apps/web/src`), **parar e levar ao Pedro**.
- **Aceite:** testes + `test:integration:db` verdes; `apps/backend/CLAUDE.md` e §7.9 da raiz coerentes.

### PR-09 — `fix(web): show street number in inspector base address`

- **Origem:** H-1 / D-04. **Anexo:** 00.4 / **00.A5**. **Flags:** `DEFEITO`, `MUDANÇA-DE-TELA` (mínima).
- **Portão de design — mostrar ao Pedro:** "1 Martin Place, Sydney NSW 2000, AU" no painel do inspetor (antes: sem o número).
- **Workspaces:** web. **Dependências:** nenhuma.
- **Alvos:** `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx` (linha ~137, `formatAddressLabel(inspector.address)`), `apps/web/src/lib/address.ts` (`formatAddressLabel`, linha ~36). Se `formatAddressLabel` for compartilhado por outras telas, a mudança não pode alterar endereços que já saem certos — teste cobrindo os formatos existentes.
- **TDD:** endereço `{ street: 'Martin Place', number: '1', … }` → rótulo com "1 Martin Place".
- **Aceite:** testes web verdes; E2E web verde.

### PR-10 — `fix(web): explain rejected file type or size on property file upload`

- **Origem:** H-1 / D-08 (parte de código). **Anexo:** C.2 / **C.A5**. **Flags:** `DEFEITO`, `MUDANÇA-DE-TELA`.
- **Portão de design — mostrar ao Pedro:** o texto em inglês quando o armazenamento recusa o arquivo por formato ou tamanho (ex.: "This file type or size isn't accepted. Allowed: … up to … MB.") e onde aparece (no lugar do "Upload failed").
- **Workspaces:** web (+ pwa se o fluxo de foto de issue tiver o mesmo genérico — conferir `apps/pwa/src/features/property-files/hooks/useIssuePhotoUpload.ts`; se igual, mesmo PR).
- **Dependências:** nenhuma. A configuração do bucket é OPS-3 (sem ela, PDF continua recusado — mas com mensagem clara).
- **Alvos:** `apps/web/src/features/property-files/hooks/usePropertyFileUpload.ts` (linha ~85, `resolveFileErrorMessage(err, 'Upload failed')`), o PUT ao URL assinado (resposta 415/413 do storage), mensagem do portal do inquilino se usar o mesmo hook.
- **TDD:** PUT devolvendo 415 `InvalidMimeType` → mensagem clara (falha hoje); 413 → mensagem de tamanho.
- **Aceite:** testes verdes; reteste em DEV antes de OPS-3 (mensagem) e depois (PDF aceito).

### PR-11 — `fix(web): remove contradictory change-time text from portal after can't-do`

- **Origem:** H-2 / D-10. **Anexo:** 00.7 (regra L-F03-01). **Flags:** `DEFEITO`, `MUDANÇA-DE-TELA`.
- **Portão de design — mostrar ao Pedro:** o portal do agendamento com `canChangeTime === false` mostrando só "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time." (some "…You can still report that you cannot attend, or change to another available time.").
- **Workspaces:** web. **Dependências:** nenhuma.
- **Alvos:** `apps/web/src/features/rental-tenant-portal/pages/PortalPage.tsx` (linhas ~303 e ~309), `PortalPage.test.tsx` (linha ~672), `hooks/useJoinGroupFlow.ts`.
- **TDD:** com `canChangeTime === false` não aparece a frase de troca (falha hoje).
- **Aceite:** testes + E2E web verdes.

### PR-12 — `fix(pwa): show a single build version in the app`

- **Origem:** H-2 / D-03. **Anexo:** 00.3 (sem critério específico). **Flags:** `DEFEITO`, `MUDANÇA-DE-TELA` (mínima).
- **Portão de design — mostrar ao Pedro:** hub **More** passa a mostrar a mesma versão de **App settings** ("Properfy Inspector v{versão}+{sha7}").
- **Workspaces:** pwa (+ `.github/workflows/frontend-deploy.yml` se o diagnóstico apontar).
- **Dependências:** nenhuma.
- **Alvos:** `apps/pwa/src/features/profile/pages/ProfilePage.tsx` (linha ~148, "v1.0" fixo) → `__APP_VERSION__`; `ProfileSettingsPage.tsx` (linha ~32) já usa.
- **Diagnóstico obrigatório antes de mexer em CI:** o workflow já passa `APP_BUILD_SHA` no passo "Build" dos três ambientes (`frontend-deploy.yml` linhas ~63–69, ~114–120, ~164–170) e `vite.config.ts` o lê. Mesmo assim DEV mostrou "v0.1.0+dev". Descobrir a causa (ex.: cache do service worker, outro caminho de deploy no projeto Vercel) e levar ao Pedro antes de alterar workflow ou projeto Vercel.
- **TDD:** `ProfilePage` renderiza `__APP_VERSION__` (falha hoje).
- **Aceite:** testes + E2E PWA verdes; após deploy em DEV, rodapé com SHA do commit.

### PR-13 — `refactor(backend): remove operator day-plan read, recalculate and sheet routes`

- **Origem:** C-2 (decisão 3 da seção C). **Anexo:** 01.7 / 01.A6 pedem a folha do **inspetor**; as rotas AM/OP não são pedidas. **Flags:** `REMOÇÃO DECIDIDA`, `ROTA/SCHEMA`, `ARQ. COMPARTILHADO` (api-types).
- **Workspaces:** backend, shared (api-types). **Dependências:** nenhuma. **Merge:** primeiro PR da série de api-types (antes de PR-14 e PR-17).
- **Remover:**
  - Rotas em `apps/backend/src/modules/day-plan/interfaces/day-plan.routes.ts`: `GET /v1/day-plans/:inspectorId/:date` (~266), `POST /v1/day-plans/:inspectorId/:date/recalculate` (~247), `GET /v1/day-plans/:inspectorId/:date/sheet` (~309).
  - `application/use-cases/get-day-plan-for-operator.use-case.ts` + teste; wiring em `apps/backend/src/main/container.ts` (~572, ~1310, ~1342, ~2145) e o campo `getDayPlanForOperatorUseCase` do container de rotas.
  - Ramo "operador" de `get-day-plan-sheet.use-case.ts` (`getForOperator`, linhas ~47 e ~58) — o construtor perde a dependência: atualizar todos os `new GetDayPlanSheetUseCase(` (container + `__tests__/get-day-plan-sheet.use-case.test.ts`).
  - Ramo `isOperator` de `recalculate-day-plan.use-case.ts` (linha ~62 e o bloco de `ROUTE_CHANGED`, ~105–125) — ver trava e §6 item 3.
  - Testes das partes removidas (incluindo rate limit e "AM/OP sem limite de data" em `tests/integration/day-plan/day-plan-sheet.routes.test.ts`, bloco `describe('GET /v1/day-plans/:inspectorId/:date/sheet (AM/OP)')`).
- **Travas (decididas):**
  - **Manter `RecalculateDayPlanUseCase` e `GetDayPlanSheetUseCase`** — servem `POST /v1/inspector/day-plans/:date/recalculate` e `GET /v1/inspector/day-plans/:date/sheet`.
  - **Manter** `POST /v1/day-plans/preview` (Platform settings ▸ Route planning) e `GET /v1/day-plans/eta-accuracy` (Live Day). Não tocar em `/v1/inspector/day-plans/*`.
  - Antes de apagar qualquer arquivo, repetir `git grep` pelo nome de cada caso de uso em `apps/backend/src` (container, workers, assinantes). **Consumidor fora da tabela da seção C-2 → parar e levar ao Pedro.**
  - Auditoria `day_plan.exported` continua para o inspetor.
  - A matriz de permissões (`packages/shared/src/permissions/`) **não tem** chave de day-plan (conferido); o RBAC está em `assertRoles` no use case — nada a remover lá.
- **⚠ Precisa decisão do Pedro antes:** `ROUTE_CHANGED` só é emitido pelo recálculo AM/OP (`recalculate-day-plan.use-case.ts` ~124; nenhum outro emissor em `apps/backend/src`). Sem a rota, o aviso fica sem emissor. Decidir se remove também o tipo/texto/`targetPath` (`day-plan-notices.ts`) ou deixa como está (§6 item 3).
- **Testes que não podem mudar de comportamento:** rotas do inspetor (ler, reordenar, pré-visualizar, recalcular, origem, folha). `apps/pwa/src/sw/__tests__/runtime-caching.test.ts` (~55) usa `/v1/day-plans/<id>/<data>` como caso negativo de cache — continua válido, não mexer.
- **Aceite:** `pnpm generate:api` com `openapi.json` + `api-types.ts` commitados; backend typecheck/lint/test + `test:integration:db`; shared typecheck/lint/test; lint+typecheck de web e pwa; `git grep -nE "day-plans/:inspectorId|day-plans/\{inspectorId\}" -- apps packages` vazio fora de specs; `apps/backend/CLAUDE.md` (Route sheet; Plan B — "AM/OP operator GET") e a linha F04-2 de "Active Technologies" no `CLAUDE.md` da raiz atualizadas.

---

## 4. Ondas 2 e 3

### PR-14 (onda 2) — `refactor: remove manual consent opt-out`

- **Origem:** E-2. **Anexo:** não consta (01.12 pede o aviso, não o descadastro manual). **Flags:** `REMOÇÃO DECIDIDA`, `ROTA/SCHEMA`, `ARQ. COMPARTILHADO`, `MUDANÇA-DE-TELA` (remoção do botão "Record opt-out" — decidida; mostrar ao Pedro a tela "Consent Lookup" sem o botão, só para confirmação visual).
- **Workspaces:** backend, shared, web. **Dependências:** PR-13 mergeado (série de api-types).
- **Remover:** botão e `ConsentOptOutModal` (`apps/web/src/features/notification-consents/components/ConsentLookup.tsx`, `ConsentOptOutModal.tsx` + teste); rota `POST /v1/notifications/consents/opt-out` (`apps/backend/src/modules/notification/interfaces/notification.routes.ts`); `RecordConsentOptOutUseCase` (`application/use-cases/record-consent-opt-out.use-case.ts`) + wiring em `container.ts`; `recordConsentOptOutSchema` (`packages/shared/src/schemas/notification.ts` + `notification.test.ts`); testes `tests/unit/notification/record-consent-opt-out.use-case.test.ts` e os casos de opt-out em `tests/integration/notification/consent-endpoints.routes.test.ts`.
- **Fica:** leitura de consentimento no envio (inclusive a comparação de e-mail sem diferenciar maiúsculas do F06-2), consulta e override antigos (Feature 018).
- **Consequência registrada (Pedro ciente, 24/11):** avisos de chegada não têm link de descadastro; a parada individual passa a depender do override antigo ou de desligar a imobiliária.
- **Aceite:** `git grep -nE "RecordConsentOptOut|recordConsentOptOutSchema|consents/opt-out|ConsentOptOutModal" -- apps packages` vazio fora de specs; `pnpm generate:api`; gates de backend (+ db), shared, web, lint/typecheck pwa; CLAUDE.md de backend ("Manual AM/OP opt-out" e "Compliance stance"), web (item 13) e shared atualizados; linha F06-1 do `CLAUDE.md` raiz ajustada.

### PR-15 (onda 2) — `feat(web): block inspector sign-in on the web and point to the app`

- **Origem:** E-5 (substitui E-1 — **E-1 não é planejado**). **Anexo:** entrega 00 ("aplicativo web instalável (PWA) do inspetor"); escopo Fase 1 § 2.2. **Flags:** `REMOÇÃO DECIDIDA` (acesso do inspetor ao web + Marketplace do web), `MUDANÇA-DE-TELA`.
- **Portão de design — mostrar ao Pedro antes:** a mensagem de falta de acesso e o modal (texto em inglês, rótulo do botão que abre o app, o que acontece ao fechar o modal — volta ao login limpo).
- **Workspaces:** web (+ `.github/workflows/frontend-deploy.yml` para a variável de build, ver lacuna L6). Backend não muda.
- **Dependências:** nenhuma de código; a variável com o endereço do app precisa de valor por ambiente (OPS-5).
- **Trava (decidida) — conferir antes de mexer:** para onde levam os links de redefinição de senha, convite e 2FA do inspetor. Já conferido: redefinição de senha do INSP usa `PWA_BASE_URL` (`apps/backend/src/modules/auth/application/use-cases/request-password-reset.use-case.ts` ~97). Falta conferir convite e 2FA. **Se algum levar o inspetor ao web, parar e levar ao Pedro com proposta.**
- **Comportamento:**
  - Login com credenciais válidas de INSP no web não abre sessão: mensagem + modal com botão para o app; nenhum token do inspetor fica guardado (`apps/web/src/features/auth/pages/LoginPage.tsx`, armazenamento de tokens do web).
  - Quem já tem sessão de INSP aberta no web cai na mesma tela ao abrir o web (`apps/web/src/app/AuthGuard.tsx` / boot de auth); tokens descartados.
  - Sai: rota `/marketplace` (`apps/web/src/app/router.tsx` ~79 e ~414), item "Marketplace" do `apps/web/src/components/shell/Sidebar.tsx` (~76), pasta `apps/web/src/features/marketplace/` — depois de `git grep` confirmar que só o roteador a usa.
  - Nova variável de ambiente de build com o endereço do app (nome a definir no PR, ex.: `VITE_PWA_URL`), uma por ambiente.
- **Não fazer:** marketplace do PWA; backend; `PERSONAL_TIMEZONE_ROLES` e `transitions.ts` (referências a INSP inertes — não ampliar o escopo).
- **TDD:** INSP faz login → mensagem + modal, nada no storage; sessão INSP preexistente → mesma tela e storage limpo; AM, OP, CL_ADMIN, CL_USER entram como antes. E2E web sem cenário de INSP logado.
- **Aceite:** testes + E2E web verdes; `git grep -n "features/marketplace" -- apps/web` vazio; `apps/web/CLAUDE.md` atualizado. **Aviso operacional:** antes de produção, o Pedro avisa os 3 inspetores (OPS-6).

### PR-16 (onda 3) — `fix: let operations search consent records by agency`

- **Origem:** E-3 / H-2 D-14. **Anexo:** não consta (tela da Feature 018; correção decidida). **Flags:** `DEFEITO`, `MUDANÇA-DE-TELA`.
- **Portão de design — mostrar ao Pedro antes:** o seletor de imobiliária (obrigatório para AM/OP) na busca do "Consent Lookup" e o novo item de menu (onde fica, nome).
- **Workspaces:** web **e backend** (ver lacuna L3). **Dependências:** PR-14 (mesmo arquivo `ConsentLookup.tsx`) e PR-15 (`Sidebar.tsx`/`router.tsx`).
- **Comportamento:** AM e OP escolhem a imobiliária e a busca funciona; item de menu para AM/OP.
- **Alvos:** backend `apps/backend/src/modules/notification/application/use-cases/list-consents-by-recipient.use-case.ts` (linhas ~59–70: OP é forçado ao próprio `tenantId` — "Operator must have a tenant context" —, contrário ao OP cross-tenant da constituição v1.3; passar a aceitar `tenantId` de OP como já aceita de AM, via `requireTenantScope`/`assertTenantScope`); web `ConsentLookup.tsx`, hook de busca, `Sidebar.tsx`.
- **TDD:** backend: OP com `tenantId` → 200 escopado; OP sem `tenantId` → 400 claro; CL → 403. Web: busca envia `tenantId`; sem imobiliária, não envia.
- **Aceite:** gates backend (+ db) e web; se a rota mudar de schema, `pnpm generate:api` (série com PR-17); CLAUDE.md de backend/web atualizados.

### PR-17 (onda 3) — `refactor(shared): drop unused agency offer settings`

- **Origem:** E-4 (item 3 do estacionamento), ligado a B1. **Anexo:** não consta. **Flags:** `REMOÇÃO DECIDIDA`, `ROTA/SCHEMA` (api-types), `ARQ. COMPARTILHADO`.
- **Workspaces:** shared (+ teste de backend). **Dependências:** PR-14 (série de api-types) e a contagem abaixo.
- **Trava (decidida) — passo 1, antes de qualquer código:** contar, em cada ambiente, imobiliárias com `priorityOfferHours` ou `inspectorOfferRadiusKm` gravados em `settings_json`. DEV: o agente pode ler. Staging e produção: o agente prepara a consulta e o **Pedro roda** (OPS-1). **Valor diferente do padrão (24 / 2) → parar e levar ao Pedro.**
- **Passos 2–4:** teste provando que ler uma imobiliária com as duas chaves gravadas continua funcionando (nenhuma migração; chaves ficam inertes); remover os campos de `packages/shared/src/schemas/tenant.ts` (linhas ~53–54) e os testes (`packages/shared/src/schemas/tenant.test.ts` ~450 e ~555, `apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts` ~327/~344); `pnpm generate:api`. Não reaproveitar os nomes: janela = `inspectorProgram.earlyAccess`; alcance = regiões do inspetor.
- **Aceite:** `git grep -nE "priorityOfferHours|inspectorOfferRadiusKm" -- apps packages ':!*.md'` vazio; gates shared + backend (+ db) + lint/typecheck web e pwa.

### PR-18 (liberado em 24/11 — ver decisão 12 em §6) — `fix(backend): treat low-relevance geocoding results as failed`

- **Origem:** H-2 / D-05. **Anexo:** X02 (fundação; sem item do anexo). **Flags:** `DEFEITO`; status de geocodificação muda em tela (FAILED em vez de SUCCESS).
- **Trava (decidida):** **levar ao Pedro a proposta de regra antes** (ex.: limiar de relevância/`match_code` do Mapbox, o que fazer com resultado só de cidade/código postal, se vira FAILED ou aviso). Sem aprovação, não implementar.
- **Workspaces:** backend. **Alvos prováveis:** `apps/backend/src/modules/property/domain/geocoding.service.ts` (porta), adaptador Mapbox (localizar a implementação da porta), `application/use-cases/geocode-property.use-case.ts`, `infrastructure/workers/geocode.worker.ts` (~44, ~107), `domain/property.entity.ts` (~115). Regra deve valer também para o endereço-base do inspetor (`inspector/application/services/geocode-inspector-base.ts`) se o Pedro aprovar.
- **TDD:** resultado de baixa relevância → status não-SUCCESS (falha hoje); endereço real continua SUCCESS.

---

## 5. O que NÃO é PR

### OPS — operação de ambientes (seção D + H-3). O Pedro opera staging e produção; o agente só prepara comandos (comando exato, o que faz, saída esperada, como desfazer) e confere o resultado. O agente não lê valores de segredos.

| # | Item | DEV | Staging | Produção |
|---|---|---|---|---|
| OPS-1 | **D-1 leitura:** nomes dos segredos VAPID no Fly; `push-config` devolve a chave; `DAY_PLAN_ROUTING_PROVIDER`; tipos/tamanho do bucket `inspection-assets`; existência do bucket de relatórios (`SUPABASE_STORAGE_BUCKET`); domínio do remetente de sistema verificado no Resend; contagem do dry-run da regeocodificação; contagem `priorityOfferHours`/`inspectorOfferRadiusKm` (PR-17) | agente lê | Pedro roda | Pedro roda (após aceite) |
| OPS-2 | **Push (VAPID)** — par exclusivo por ambiente, `VAPID_SUBJECT` com o endereço do ambiente | feito 24/11 | par novo (nunca o de DEV) | idem |
| OPS-3 | **Bucket `inspection-assets`** aceitar imagens + PDF + Word + Excel e o tamanho de Property files (D-08; C.2/C.A5). Registrar valor anterior | Pedro/agente prepara | Pedro | Pedro |
| OPS-4 | **D-09** bucket de relatórios inexistente em DEV (F08-g falhou) · **D-11** domínio `properfy.pedroalvs.com` não verificado no Resend (e-mails de sistema FAILED) — conferir os dois também em staging | corrigir | conferir | conferir |
| OPS-5 | **Variável com o endereço do app para o web** (PR-15), um valor por ambiente | definir | definir | definir |
| OPS-6 | **Regeocodificação (X02-2, fora do contrato):** só dry-run em cada ambiente; estimativa de custo (US$ 0,005/endereço, reconfirmar) ao Pedro; só com aprovação: lote de 20 → conferir pinos → completo → novo dry-run zerado (`docs/runbooks/regeocode-permanent.md`) | dry-run | dry-run | dry-run |
| OPS-7 | **D-3 aparelho real** (00.A1/00.A2): roteiro curto iPhone iOS ≥ 16.4 e Android — instalar, permitir notificações, receber aviso de publicação com o app fechado, tocar e cair na tela certa; sem push, SMS. Pedro primeiro, depois o cliente | — | Pedro | — |
| OPS-8 | **D-4 produção:** documento de execução (comandos, ordem, janela fora do horário comercial de Sydney, como desfazer) + aviso do Pedro aos 3 inspetores sobre o fim do acesso web (PR-15). Só após aceite em staging | — | — | Pedro executa |

Ordem em staging (D-2): push → bucket → regeocodificação. Defeito achado em staging é registrado e levado ao Pedro, não corrigido no ambiente.

### DOC-2 — C-1 Roteiro de homologação (documento, sem código)
- `fase2-etapa1/roteiro-homologacao.md`: uma seção por entrega, uma linha por critério (30: 00.A1–A5, 01.A1–A7, 03.A1–A5, D.A1–A3, E.A1–A2, C.A1–C.A5) com texto literal, passo a passo (perfil, tela com nome da interface, ação, esperado) e resultado em DEV. Correspondência conhecida: "cancelamento" (00.7/00.A3) = "Can't do this job"; 01.A6 pela tela **Today's route** › "Download" (C-3).
- **Depende de:** VAL-1 concluído e dos PRs ligados a critério (PR-02, 03, 04, 05, 06, 07, 09, 10 + OPS-3) em DEV, retestados. Critério não atendido vira defeito ao Pedro.
- **Decisão do Pedro antes:** idioma e formato (o relatório ao cliente previa inglês e Claude Docs).

### Seção A — só documentação: incluída no DOC-1. Não tocar em `AppsSection.tsx` nem `JobDetailsSection.tsx`.

### VAL-1 — H-6 pendentes do teste (validar depois, pelo "Claude Code #3"/Batedor; passo a passo em `smoke-dev-2026-11-23.md` § Pendentes declarados)

| # | Item | A partir de (Brasília) |
|---|---|---|
| P4 | Trocar ponto de partida (F04-b) | 24/11 05:30 |
| P1 | Níveis do índice e acesso antecipado (F07-a, F08-c/d/e/f — inclui a mensagem com dia e hora do F08-f) | 24/11 14:15 |
| P2 | Aviso da manhã ao inquilino (F06-a) | 24/11 17:00 |
| P3 | Prêmios e bônus na fatura (F08-a/b) | 29/11 15:45 |

Se o F08-f mostrar erro genérico, levar ao Pedro (não corrigir por conta própria).

---

## 6. Precisa decisão do Pedro antes de implementar

1. **PR-06 / D-13 (a):** aviso só para o plano do dia seguinte **ou** texto que confere a data.
2. **PR-18 / D-05:** regra de baixa relevância (proposta a preparar).
3. **PR-13 / C-2:** destino do aviso `ROUTE_CHANGED`, que fica sem emissor ao sair o recálculo AM/OP.
4. **Portões de design:** PR-04 (textos de Challenges), PR-09 (endereço com número), PR-10 (mensagem de arquivo recusado), PR-11 (texto do portal), PR-12 (versão no More), PR-14 (Consent Lookup sem o botão — confirmação), PR-15 (mensagem + modal do inspetor no web), PR-16 (seletor + item de menu).
5. **PR-05 / D-12:** se o atraso acumulado/barra de progresso (`compute-accumulated-delay.ts`, `get-live-day.use-case.ts`) também passa ao horário atual ou fica no congelado (o plano de ação fala só do alerta).
6. **PR-12 / D-03:** correção de CI/Vercel, depois do diagnóstico.
7. **PR-15 / E-5:** nome e valor da variável do endereço do app por ambiente; se o web deve também encerrar no servidor a sessão de um inspetor que já estava logado (o backend não muda pelo plano, então hoje só se descartariam os tokens no navegador).
8. **PR-17 / E-4:** resultado das contagens em staging e produção (rodadas pelo Pedro).
9. **DOC-1:** `.eslintrc.json` (exceção de lint para `TimeInput.tsx`, origem não esclarecida) entra ou não.
10. **DOC-2 / C-1:** idioma e formato do roteiro de homologação.
11. **H-4 observações menores** (UUIDs crus na Timeline, "Inactive Branch" no seletor, vírgula dupla em endereços importados, "Complete 1 inspections", excluir arquivo com 2 versões remove só a última, datas do Custom cortadas): o plano de ação lista sem prioridade e sem dizer se executa. Nenhum PR planejado até decisão.
12. **Reverter em DEV** "Minimum services to be ranked" para 10 depois de P1 e do reteste do PR-04 (opcional, registrado no smoke).

---

### Decisões do Pedro em 24/11/2026 (recomendações aceitas)

| # | Tema | Decisão | Efeito |
|---|---|---|---|
| 1 | Aviso `ROUTE_CHANGED` (C-2 / PR-13) | **Sai junto** com a rota de recalcular da operação: tipo, texto em `day-plan-notices.ts` e o que só servia a ele. O anexo não pede esse aviso. `ROUTE_PUBLISHED` fica | PR-13 liberado |
| 2 | D-13 (a) / PR-06 | O aviso "Your route for tomorrow is ready" **só sai para o plano do dia seguinte**; e só quando o plano está publicado | PR-06 liberado |
| 3 | D-12 / PR-05 | Alerta "não iniciado" **e** atraso acumulado/barra passam a usar o horário atual da parada. A métrica de precisão continua com o horário congelado na publicação | PR-05 liberado |
| 4 | E-5 / PR-15 | Inspetor já logado no web: basta descartar a sessão no navegador; o servidor não muda | Só falta o portão de design |
| 5 | H-4 observações menores | Não executar agora; vão para `fase2-etapa1/estacionamento.md` (no DOC-1) | Nenhum PR |
| 6 | C-1 / DOC-2 roteiro de homologação | Em inglês, em documento | — |
| 7 | "Minimum services to be ranked" em DEV | Volta a 10 depois dos testes pendentes (P1) e do reteste do PR-04 | Operação em DEV |
| 8 | Portões de design (PR-04, 09, 10, 11, 12, 14) | Textos aprovados como propostos. PR-10: duas mensagens separadas (tipo de arquivo / tamanho). PR-04: ver o bloco "Escopo revisado" do PR-04 | Seis PRs mergeiam no verde |
| 9 | PR-15 modal do inspetor | Título "Inspectors use the Properfy app"; corpo "Your account doesn't have access to this website. Open the Properfy Inspector app to see your offers and schedule."; botão "Open the app"; fechar volta ao login limpo. Captura de tela ao Pedro **antes** do merge | PR-15 liberado até a captura |
| 10 | PR-15 endereço do app (variável de build por ambiente, nunca fixo no código) | DEV `https://pwa-properfy.pedroalvs.com` · staging `https://pwa-properfy.autolabs.tech` · produção `https://pwa.properfy.me` (`app.properfy.me` é o portal web) | OPS-5 com valores definidos |
| 11 | PR-16 Consent Lookup | Item "Consent Lookup" em "Configuration", depois de "Notification Templates"; seletor "Agency" obrigatório. Captura de tela ao Pedro **antes** do merge | PR-16 liberado até a captura |
| 12 | PR-18 regra de geocodificação (D-05) | (1) FAILED quando o resultado não é do tipo endereço, ou é endereço com relevância < 0,8; reusa FAILED com código `LOW_RELEVANCE`, sem enum nem migração. (2) Limiar 0,8. (3) **Endereço rural não é falha:** resultado no nível de localidade é válido; níveis mais largos (cidade, CEP, região) continuam FAILED. (4) Mesma regra no endereço-base do inspetor | PR-18 liberado, no fim da fila de backend. **Parte (3) em verificação:** na Austrália o subúrbio pode vir como localidade e reabrir o defeito em endereço urbano; o executor consulta endereços reais e devolve o resultado antes de implementar essa parte |

| 13 | PR-13 tipo `ROUTE_CHANGED` | O emissor e o texto saíram; o valor do tipo fica inerte na lista compartilhada, só para leitura de avisos antigos (removê-lo exigiria migração do histórico). Sem resposta contrária do Pedro, fica assim | Nenhum PR |
| 14 | PR-15 telas e campos | Telas aprovadas (alerta + modal + volta ao login). Ao fechar o modal, e-mail e senha são limpos. Endereço do app derivado do endereço da API já embutido no build (o workflow de deploy roda com o arquivo de `main`, então variável nova em `develop` não vale em DEV/staging); host publicado desconhecido → botão desabilitado | PR-15 mergeia no verde |
| 15 | PR-05 ajuste da base do alerta | Base do alerta "não iniciado" e do atraso = horário previsto no plano quando cai dentro da janela atual do agendamento; senão o início da janela atual; nunca o horário congelado na publicação | PR de follow-up na fila de backend |
| 16 | D-03 versão "+dev" | Causa: o workflow de `main` não tem `APP_BUILD_SHA`. Corrige-se sozinho na promoção `develop → staging → main`; sem alteração direta em `main` por enquanto | Nenhum PR |

Continuam abertos: capturas de tela do PR-16 e do PR-16, verificação da parte (3) do PR-18, contagem em staging/produção (PR-17; consultas na nota Maestri "PR-17 e PR-18 — para o Pedro"), diagnóstico do D-03 (PR-12).

---

## 6-B. Validação das entregas (coordenador "Claude Code #3")

Cada entrega passa por duas conferências: leitura do diff contra a decisão do Pedro, e reteste em tela pelo Batedor com a onda em DEV.

| PR | Entrega | Leitura do diff | Reteste em tela |
|---|---|---|---|
| PR-02 | #1375 (c58fd6f3), 24/11 | ✅ Corrige a causa (estado local não zerava ao trocar de parada no mesmo cartão); teste que reproduz o caso do cartão reaproveitado; só PWA, 4 arquivos; CI verde; CLAUDE.md do PWA atualizado. Sem mudança fora do defeito | ⏳ com a onda em DEV (D-02 / 00.A3) |
| PR-07 | #1376 (0018471f), 24/11 | ✅ CL pedindo arquivos ou issues de imóvel/agendamento de outra imobiliária (ou inexistente) → 404, nos dois endpoints de listagem; AM/OP e inspetor inalterados; sem mudança de contrato; testes unitários e de banco real; CI verde. Observação: AM/OP com identificador inexistente continuam recebendo lista vazia (fora do critério C.A2) | ⏳ com a onda em DEV (D-15 / C.A2) |
| PR-01 | #1377 (807f12b7), 24/11 | ✅ Sai o selo de prioridade morto do cartão de oferta (contagem, tipos e dados de teste); 9 arquivos, todos em `apps/pwa/src/features/offers`, 5 linhas a mais e 95 a menos; nenhuma ocorrência restante de `priorityExpiresAt`/`priorityMode`/`priority-countdown` em `origin/develop`; backend, shared e contrato intocados; CI verde | ⏳ com a onda em DEV (B1) |
| PR-03 | #1378 (635d3f39), 24/11 — convertido de PWA para backend | ✅ Ao salvar ordem manual, a sugestão do otimizador é preservada; "Reset to suggested" e mudança no conjunto de paradas geram sugestão nova; 3 arquivos, sem mudança de contrato; testes dos dois casos; CI verde. **Ponto a retestar:** num recálculo automático que mantém a ordem (plano desatualizado por outro motivo, sem mudança no conjunto), a sugestão passa a ser a ordem atual — conferir em tela se o texto "Same finish time as suggested" volta nesse caso | ⏳ com a onda em DEV (D-06 / 01.A2) |
| PR-09 | #1379, 24/11 | ✅ O rótulo do endereço passa a incluir o número quando ele vem em campo separado e não há endereço formatado; 2 arquivos (`apps/web/src/lib/address.ts` + teste novo), sem backend nem contrato; CI verde. Observações: a função também serve a lista e o detalhe de filiais (filial com número em campo separado passa a mostrá-lo — conferir no reteste que não duplica); `InspectorDetailSections.tsx` e `apps/web/CLAUDE.md` não foram alterados, ao contrário do relato da entrega | ⏳ com a onda em DEV (D-04 / 00.A5; conferir também uma filial) |
| PR-13 | #1381 (80257e13), 24/11 | ✅ Saem as três rotas de AM/OP (`GET /v1/day-plans/:inspectorId/:date`, `…/recalculate`, `…/sheet`), o caso de uso de leitura da operação e os ramos de operador em recalcular e folha de rota; ficam as rotas do inspetor, `POST /v1/day-plans/preview` e `GET /v1/day-plans/eta-accuracy`; nenhum arquivo de web ou PWA alterado; contrato regenerado (só remoções); CI verde. **Desvio da decisão 1:** o emissor e o texto de `ROUTE_CHANGED` saíram, mas o **valor do tipo ficou** na lista compartilhada, porque avisos antigos gravados com esse tipo fariam a lista/detalhe de avisos de AM/OP responder 500 se o valor sumisse. Nada mais emite esse aviso | ⏳ com a onda em DEV (Live Day abre normal; folha de rota do inspetor baixa; "Today's route" recalcula) |
| PR-10 | #1380, 24/11 | ✅ Só web, 6 arquivos em `features/property-files` + `apps/web/CLAUDE.md`: a recusa do armazenamento no envio passa a carregar o status, e 415 → "This file type isn't accepted.", 413 → "This file is too large."; demais erros inalterados; CI verde. **Limite:** a mensagem depende do status que o armazenamento devolve; se o Supabase responder 400 para tipo inválido, a mensagem de tipo não aparece. Fora deste PR: foto de issue no PWA e no portal continuam com mensagem genérica (decisão do Pedro pendente) | ⏳ com a onda em DEV (D-08: enviar arquivo de tipo não aceito e um grande demais; anotar o status devolvido) |
| PR-04 | #1382, 24/11 — escopo revisado (backend + shared + pwa) | ✅ `GET /v1/inspector/program` passa a trazer `standing.index.minimumVolume` (lido da configuração `reliabilityIndex`; inteiro ≥ 1, obrigatório) e nada mais das configurações; os dois textos usam o número com singular "1 job"; contrato regenerado (um campo a mais); testes de backend, shared e PWA; CI verde; CLAUDE.md dos três workspaces atualizados | ⏳ com a onda em DEV (D-07 / 03.A3: com "Minimum services to be ranked" = 1 os dois textos dizem "1 job"; depois voltar o campo a 10) |
| PR-11 | #1383, 24/11 | ✅ Só web, 3 arquivos + `apps/web/CLAUDE.md`: quando o inspetor recusou o serviço (`canChangeTime` falso), o aviso de prazo encerrado/somente leitura deixa de aparecer, e fica só "The agency will contact you to arrange a new time."; com reagendamento permitido o aviso continua igual (teste de regressão); testes unitários e E2E; CI verde | ⏳ com a onda em DEV (D-10: portal de um agendamento recusado pelo inspetor, depois do prazo) |
| PR-12 | #1384, 24/11 | ✅ Só PWA, 2 arquivos + `apps/pwa/CLAUDE.md`: o rodapé do More troca o "v1.0" fixo pela mesma versão de build que App settings já mostrava; teste novo; CI verde. O diagnóstico do "v0.1.0+dev" (D-03) vem à parte, sem mexer em CI/Vercel | ⏳ com a onda em DEV (D-03: More e App settings mostram a mesma versão) |
| PR-05 | #1385, 24/11 | ⚠️ Corrige o caso do D-12 (parada remarcada de 17:00 para 13:00 deixava o alerta preso em 17:00); só `live-day`, 8 arquivos; métrica de precisão de ETA intocada; CI verde. **Ressalva aberta:** a base do alerta "não iniciado" e do atraso acumulado/por parada passou a ser **sempre o início da janela do agendamento**, mesmo sem remarcação, e não mais o horário previsto no plano. Com janela mais larga que o serviço (ex.: 13:00–17:00, chegada prevista 16:30), o alerta dispara e o atraso é medido contra 13:00. Levado ao Pedro e ao executor; possível ajuste: usar o horário previsto do plano atual quando ele cai dentro da janela atual, e o início da janela só quando não cai | ⏳ com a onda em DEV (D-12; conferir também um dia com várias paradas na mesma janela larga) |

---

## 7. Rastreabilidade

| Origem (smoke) | O que é | Resolve |
|---|---|---|
| D-01 | Auditoria guarda lat/lng do inspetor | PR-08 |
| D-02 | Cartão sem "Check in" após check-out (00.A3) | PR-02 |
| D-03 | Duas versões no app | PR-12 (+ diagnóstico de CI) |
| D-04 | Número do endereço-base some (00.A5) | PR-09 |
| D-05 | Endereço inventado vira "Success" | PR-18 (bloqueado por decisão) |
| D-06 | "Same finish time as suggested" após salvar (01.A2) | PR-03 |
| D-07 | "10 jobs" fixo (03.A3) | PR-04 |
| D-08 | PDF/DOCX/XLSX recusados (C.A5) | OPS-3 (bucket) + PR-10 (mensagem) |
| D-09 | Relatórios "Bucket not found" | OPS-4 |
| D-10 | Texto contraditório no portal | PR-11 |
| D-11 | E-mails de sistema falham (Resend) | OPS-4 |
| D-12 | "Não iniciado" atrasado após reagendar (01.A5) | PR-05 |
| D-13 | Aviso de rota "tomorrow" fora de hora (00.A2) | PR-06 |
| D-14 | Consent Lookup não busca para AM/OP | PR-16 |
| D-15 | Listagem de arquivos de outra agência 200 em vez de 404 (C.A2) | PR-07 |
| Falha F08-g | Relatório do programa Failed | OPS-4 (D-09); reteste depois |
| Falha F10-a | Upload de PDF falhou | OPS-3 + PR-10 (D-08); reteste depois |
| Falha H-4 | "Active Sessions" × "not available yet" | DOC-1 (não é defeito: mensagem de reserva) |
| Pendente P1 | Índice/níveis/acesso antecipado (F07-a, F08-c/d/e/f) | VAL-1 |
| Pendente P2 | Aviso da manhã (F06-a) | VAL-1 |
| Pendente P3 | Prêmios e bônus (F08-a/b) | VAL-1 |
| Pendente P4 | Trocar ponto de partida (F04-b) | VAL-1 |

Outras decisões do plano de ação → PR: A → DOC-1 · B1 → PR-01 (+ DOC-1) · B2+G → executado (smoke) · C → DOC-1 · C-1 → DOC-2 · C-2 → PR-13 · C-3 → nenhuma mudança · D → OPS · E-1 → substituído (não planejado) · E-2 → PR-14 · E-3 → PR-16 · E-4 item 3 → PR-17 · E-4 itens 1 e 16 → tarefas separadas fora desta entrega · E-4 item 12 → PR-08 · E-5 → PR-15 · F → DOC-1 · H-5 → sem ação · H-6 → VAL-1.

---

## 8. Lacunas (não resolvidas aqui — para o coordenador/Pedro)

- **L1 — `ROUTE_CHANGED` órfão (C-2).** O recálculo AM/OP é o único emissor de `ROUTE_CHANGED` em `apps/backend/src`. A seção C-2 diz "manter o caso de uso" e tirar "o ramo de permissão do operador", mas não trata o aviso, que vira código sem emissor (tipo, texto em `day-plan-notices.ts`, `targetPath: '/today'`). A regra "nada é removido além do decidido" conflita com deixar código morto.
- **L2 — matriz de permissões (C-2).** O plano de ação manda remover "a entrada correspondente na matriz de permissões"; não existe chave de day-plan em `packages/shared/src/permissions/` (RBAC via `assertRoles`). Nada a remover lá.
- **L3 — E-3 exige backend.** O plano de ação diz "PR web, talvez backend". O backend força OP ao próprio `tenantId` (`list-consents-by-recipient.use-case.ts` ~65–70), contra o OP cross-tenant da constituição v1.3. Só o seletor no web não resolve para OP. Planejado como backend + web (PR-16).
- **L4 — B1 × E-4.** A seção B1 proíbe tocar em `packages/shared`/`api-types` e remover `priorityOfferHours`; a E-4 diz que isso "muda o alcance de B1". Planejado como **dois PRs** (PR-01 só PWA; PR-17 shared + api-types, travado pela contagem). Confirmar a divisão.
- **L5 — D-03, parte de configuração.** O smoke classificou como "build de DEV sem `APP_BUILD_SHA`", mas o workflow já passa `APP_BUILD_SHA` nos três ambientes e `vite.config.ts` o lê. A causa de "v0.1.0+dev" em DEV não está identificada (diagnóstico no PR-12).
- **L6 — variável do endereço do app (E-5) não é só operação.** Os frontends são construídos no CI (`frontend-deploy.yml`) com as variáveis no próprio workflow; a nova variável entra no workflow (código, no PR-15), com valor por ambiente decidido pelo Pedro (OPS-5). A seção D a trata como configuração de ambiente.
- **L7 — tour com 10 passos × CLAUDE.md.** O smoke contou 10 passos (com "Notifications", PR #1371); `apps/pwa/CLAUDE.md` §4.8 ainda diz "8 target steps + 1 install step". A H-5 decide "sem ação" sobre o recurso, mas o CLAUDE.md ficou falso (§13.11). Corrigir no DOC-1 ou no próximo PR de PWA?
- **L8 — D-12 alcance.** `baselineInstant` também alimenta o atraso acumulado (barra de progresso, 01.9) e o cálculo em `get-live-day.use-case.ts`. O plano fala só do alerta; mudar só o alerta deixa alerta e barra com referências diferentes.
- **L9 — D-13 (a) tem duas opções** sem escolha.
- **L10 — H-4 observações menores** sem decisão de executar.
- **L11 — sessão do inspetor no web (E-5).** "Vale também para quem já está com sessão aberta", mas o backend não muda: o web pode descartar os tokens locais; a sessão continua válida no servidor até expirar (aparece em "Active Sessions"). Confirmar se basta.
- **L12 — D-07 depende do contrato.** Confirmar que `GET /v1/inspector/program` traz `minimumServices`; se não trouxer, a correção vira mudança de contrato (backend + api-types), não só PWA.
- **L13 — D-06 depende do contrato.** Após salvar, a ordem sugerida precisa vir de algum lugar (GET do plano ou recálculo de pré-visualização). Se a GET não expuser a ordem sugerida, a correção pode exigir contrato.
- **L14 — C-1 depende de reteste.** O roteiro de homologação usa resultados de DEV; precisa dos PRs da onda 1 deployados em DEV, do OPS-3 e do VAL-1 — o plano de ação manda fazê-lo "depois do teste B2 + G", sem considerar as correções.
- **L15 — E-2 remove o que o smoke usou para o F06-c.** Depois do PR-14, o roteiro G e o C-1 não podem mais citar "Record opt-out"; o F06-c passa a "previsão não aparece no portal" apenas.
