# X00 · Lacunas

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 10 | 3 | 4 | 3 |

Revisão feita sobre `tarefas/X00-tarefas.md` (2026-10-28), `X00-claude-md.md`, `README.md`, `decisoes.md`, as tarefas X01/X02/X03/F03/F04 (contratos citados pelas regras novas) e o snapshot read-only de `origin/develop` @ `042a9674`. Conferido: os 77 trechos "atual/problema/evidência" batem com o snapshot nas amostras verificadas (state machine, claims do JWT, TTL 60 min, apps do Fly, 10 jobs do CI, `requireTenantScope`, caches do PWA, `useGoBack`, thresholds 200/500 m, `update-agent-context.sh`). As lacunas abaixo são o que uma sessão ainda teria de adivinhar.

---

## L-X00-01 · Versionar `fase2-etapa1/`: plano e README dizem "no mesmo PR", a tarefa diz "fora do escopo"

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X00-1 — "Fora do escopo" (último item), "Critérios de aceite" 7, bloco R20, regra N8, C08, Risco 4, Achado 1
- **O que falta / está ambíguo:** `X00-claude-md.md` ("Decisões tomadas 2026-10-28": "A pasta `fase2-etapa1/` entra no repositório **no mesmo PR da X00**") e `README.md` (tabela "Tarefas", onda 0: "versiona a pasta `fase2-etapa1/`") decidem versionar. A tarefa faz o oposto: lista "Versionar `fase2-etapa1/`" em "Fora do escopo", exige diff de **7 arquivos** (critério 7), escreve no CLAUDE.md que a pasta "is **not tracked by git**" (R20) e "(The folder is untracked; from a worktree read it through the main checkout, see §14.)" (N8), e deixa a decisão em aberto no Achado 1. Também não diz se `arquivo/`, `tarefas/lacunas/` e os três documentos de escopo da raiz (`Escopo Completo…`, `escopo-cliente-gap-audit.md`, `escopo-pendencias-execucao.md`, citados em R20) entram.
- **Por que importa:** quem implementar segue a tarefa e entrega um PR de 7 arquivos com um CLAUDE.md que ensina a ler a pasta via `git rev-parse --git-common-dir`. Toda sessão `speckit.specify` em worktree ou em clone limpo (CI, nuvem) continua sem o insumo; e se um segundo PR versionar a pasta depois, R20 e N8 viram afirmações falsas no dia seguinte — exatamente o que a X00 existe para evitar.
- **Evidência:** `X00-claude-md.md` §"Decisões tomadas" (linha 40); `README.md` §"Tarefas" (onda 0); `X00-tarefas.md` "Fora do escopo", critério 7, blocos R20/N8, Achado 1. Snapshot: `git ls-files | grep -c '^fase2-etapa1/'` → 0. A pasta tem 33 arquivos / 1,7 MB (cabe no limite de 150 arquivos).
- **Proposta de regra/detalhe:** alinhar a tarefa à decisão mais recente (plano + README): o PR da X00 adiciona `fase2-etapa1/**` (inclusive `tarefas/`, `tarefas/lacunas/`, `arquivo/`, `estacionamento.md`, `decisoes.md`), mantendo o caminho `fase2-etapa1/` para que N8 e todas as tarefas continuem válidas. Em consequência: (a) R20 passa a dizer só que os três documentos de escopo da raiz continuam fora do git (ou também entram — ver decisão); (b) N8 perde a frase "(The folder is untracked…)"; (c) critério 7 vira "7 arquivos de instrução + `fase2-etapa1/**`"; (d) Risco 4 e Achado 1 saem; (e) o "Depois de editar" ganha `git ls-files fase2-etapa1 | wc -l` ≥ 33.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Versionar `fase2-etapa1/` inteira no PR da X00, no caminho atual; os três `escopo-*.md` da raiz também entram (R20 some).
  2. Versionar só `fase2-etapa1/` e manter os `escopo-*.md` fora (R20 fica, restrito a eles).
  3. Manter a tarefa como está (não versionar) e corrigir o plano e o README para refletir isso.

## L-X00-02 · Critério 5 (`prettier --check` nos 7 arquivos) falha hoje em 4 deles e exige `pnpm install`

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X00-1 — "Testes/validação primeiro" bloco 2 (última linha), "Critérios de aceite" 5, "Escopo / Passos" 0 ("worktree leve, sem `pnpm install`"), "Dias · Branch · Verificação"
- **O que falta / está ambíguo:** no snapshot, `prettier --check` (3.8.1, `.prettierrc` do repo) **já falha** em `CLAUDE.md`, `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md` e `packages/shared/CLAUDE.md`; só `AGENTS.md`, `AGENT.md` e `apps/pwa/CLAUDE.md` passam. Não há `format:check` no CI (o `ci.yml` não roda prettier em `.md`). Para o critério 5 passar, o PR teria de reformatar os 4 arquivos inteiros (tabelas e listas reflowadas), o que contradiz "só correções e acréscimos; não reescrever" e enterra as 77 correções num diff de formatação. Além disso `pnpm exec prettier` só existe depois de `pnpm install`, que o passo 0 manda pular.
- **Por que importa:** o implementador ou roda `prettier --write` (diff gigante, revisão das 77 correções inviável, numeração `file:line` da auditoria perdida) ou declara o critério 5 "não aplicável" sem regra — e o PR fica com um critério de aceite que não prova nada.
- **Evidência:** snapshot: `node_modules/.bin/prettier --check CLAUDE.md AGENTS.md AGENT.md apps/*/CLAUDE.md packages/shared/CLAUDE.md` → "[warn] Code style issues found in 4 files"; `.github/workflows/ci.yml` sem job/step de prettier; `package.json` raiz tem `format:check` mas o CI não o chama.
- **Proposta de regra/detalhe:** trocar o critério 5 por: "o PR não introduz novos avisos de prettier: `prettier --check` continua passando em `AGENTS.md`, `AGENT.md` e `apps/pwa/CLAUDE.md`; os outros 4 já falhavam em `develop` (registrar a saída no PR)". No bloco "Depois de editar", usar `node_modules/.bin/prettier` do checkout principal ou rodar `pnpm install --filter . --ignore-scripts` só na raiz. Registrar a formatação integral dos 4 arquivos como item do `estacionamento.md`.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Remover o gate de prettier nos 4 arquivos que já falham; manter nos 3 que passam.
  2. Reformatar os 4 arquivos num **commit separado e anterior** (`style: format CLAUDE.md files`) e aplicar as correções depois, re-derivando as referências `file:line`.
  3. Reformatar tudo no mesmo commit (não recomendado: revisão impraticável).

## L-X00-03 · Regra transversal de fuso horário e data civil não existe em nenhum CLAUDE.md, mas a Fase 2 depende dela

- **Severidade:** ALTA
- **Tarefa/seção:** "Regras novas da Fase 2" (N1–N12) — regra ausente; `CLAUDE.md` raiz §9 "API conventions" / §7
- **O que falta / está ambíguo:** os cinco CLAUDE.md não dizem uma palavra sobre fuso (a única menção é "Deploy window: from 09:00 Brazil"). O código é explícito: `PLATFORM_TIMEZONE = 'Australia/Sydney'` ("Sydney-only"), `tenants.timezone` (default Sydney), `users.timezone` pessoal só para AM/OP/INSP (CL herda a agência), helpers `civilDateInTimezone`, `zonedWallTimeToUtc`, `formatCivilDate` no shared. As tarefas da Fase 2 decidem regras de fuso repetidamente e pedem que a spec as fixe: F00 ("data no fuso da agência, não a do browser"), F04 ("horários previstos são instantes; janelas são horário de parede da agência; usar sempre `zonedWallTimeToUtc`"), F07, F08 ("a spec deve fixar essa regra"), Q9 ("19:30 horário da agência"). Um `DayPlan` cross-tenant reúne paradas de várias agências e o inspetor tem fuso pessoal: sem regra, cada spec escolhe um referencial diferente.
- **Por que importa:** cenário concreto: a spec da F04 publica o plano às 19:30 no fuso do **inspetor** (`users.timezone`), a da F06 manda o aviso matinal às 07:00 no fuso da **agência**, e a da F08 conta "DONE na semana" pela data do **browser** do AM. Os três passam nos próprios testes e discordam entre si; a X00 é o único lugar onde a regra entra antes das specs.
- **Evidência:** snapshot `packages/shared/src/constants/timezone.ts:1-6`; `apps/backend/prisma/schema.prisma:167,256-258`; `packages/shared/src/schemas/auth.ts:42-46`; `grep -in sydney\|timezone` nos 5 CLAUDE.md → só `CLAUDE.md:245`. Plano: `F00-janela-periodo-mapa.md:63`, `F04-plano-do-dia-roteiro.md:124`, `F07-indice-confiabilidade.md:85`, `F08-metas-recompensas.md:79`, `decisoes.md` Q9.
- **Proposta de regra/detalhe:** acrescentar **N13 · Dates and timezones** ao `CLAUDE.md` raiz §9 (e uma linha curta em `packages/shared/CLAUDE.md` §10): "Civil dates (`YYYY-MM-DD`) and time windows are wall-clock values in the **agency timezone** (`tenants.timezone`, default `Australia/Sydney` = `PLATFORM_TIMEZONE`); instants (`started_at`, ETAs, `created_at`) are UTC ISO strings. Convert only through the shared helpers (`civilDateInTimezone`, `zonedWallTimeToUtc`, `formatCivilDate`/`formatWallTime*`); never `new Date('YYYY-MM-DD')`, never the browser timezone for business rules. Platform jobs ('today', cut-offs) run on `PLATFORM_TIMEZONE`. `users.timezone` (AM/OP/INSP only) is a **display** preference, never a business-rule input. Phase 2 cross-tenant entities (`DayPlan`, goals) use the agency timezone of each appointment; the spec states which timezone every date field is in. Tests that depend on timezone pin `TZ` away from Sydney (see memory `feedback_tz_dependent_test_must_pin_away`)."
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Incluir N13 na X00 com o texto acima (regra genérica; o referencial do `DayPlan` multi-agência fica confirmado na F04).
  2. Incluir só a parte "civil × instante + helpers" e deixar o referencial (agência × plataforma × usuário) para cada spec.
  3. Não incluir na X00; cada feature registra a premissa (risco de divergência entre F04/F06/F08).

## L-X00-04 · As cláusulas "until X merges" não têm dono nas tarefas X01 e X02

- **Severidade:** MÉDIA
- **Tarefa/seção:** "Riscos" 2; regras N2, N3 (X01), N4 (X02), N5 (F04), N6 e N9 (F03-1); C03/C04
- **O que falta / está ambíguo:** o Risco 2 diz que a mitigação é "um item no checklist de cada tarefa dona (X01, X02, F03-1, F04): remove the transition clause from CLAUDE.md". Nas tarefas, isso **não existe**: `X01-tarefas.md` e `X02-tarefas.md` não mencionam `CLAUDE.md` nenhuma vez; `F03-tarefas.md` e `F04-tarefas.md` só citam a exceção ao §7.1. Apenas a X03 prevê ajustar a frase da X00 (Passo 9). A tarefa X00 também não diz quem edita essas tarefas nem quando.
- **Por que importa:** o X01 entra e o `apps/web/CLAUDE.md` continua dizendo "`BackButton` and `backTo` are introduced by X01. Until X01 merges, use `useGoBack` directly" — a próxima sessão cria um botão paralelo em vez de usar o `BackButton`. O mesmo para `IGeocodingService.mode` (X02), `IRoutingService` (F04) e a máscara do audit-log (F03-1).
- **Evidência:** `X00-tarefas.md` "Riscos" 2 e "Regras novas" (6 cláusulas); `grep -in CLAUDE.md tarefas/X01-tarefas.md tarefas/X02-tarefas.md` → 0 ocorrências; `tarefas/X03-tarefas.md:7,10` (único com o passo).
- **Proposta de regra/detalhe:** na X00, acrescentar um passo 6c "Registrar as cláusulas de transição": tabela {regra, arquivo, trecho exato, tarefa dona} na descrição do PR **e** uma linha no checklist de verificação das tarefas X01 (N2, N3), X02 (N4), F03-1 (N6, N9) e F04-1/F04-3 (N5, N10 "from F04"): "Remove the transition clause of rule N# from `<file>` in this PR (X00 L-04)". Como `fase2-etapa1/` passa a ser versionada (L-X00-01), essas linhas entram no mesmo PR da X00. Alternativa sem editar as tarefas: uma única frase em N11 — "A PR that ships something a CLAUDE.md rule marks as 'introduced by <task>' removes that clause".
- **Precisa de decisão do dev?** Não.

## L-X00-05 · N7(c) contradiz o código: `CL_ADMIN` lê diretamente os `NotificationTemplate`s de plataforma

- **Severidade:** MÉDIA
- **Tarefa/seção:** Regra N7 (raiz §7 item 1), mecanismo (c); R09/C01
- **O que falta / está ambíguo:** N7 lista `platform NotificationTemplate`s como entidade de plataforma e afirma que "(c) `CL_*` never reach them, or reach only a projection filtered through the agency's own appointments". No código, `ListNotificationTemplatesUseCase` autoriza `CL_ADMIN` e o repositório devolve `OR [{tenant_id: <agência>}, {tenant_id: null}]` — o CL lê os defaults de plataforma como catálogo de fallback, sem projeção por appointment. Para `ServiceRegion` global a lista é AM/OP/INSP (ok). O mecanismo (c), como escrito, é falso para um dos cinco precedentes que ele mesmo cita.
- **Por que importa:** uma spec que siga N7 ao pé da letra (por exemplo a F02, avisos com templates de plataforma, ou qualquer "default de plataforma com override por agência") bloqueia o CL de ler o default, ou — pior — um revisor "corrige" a listagem de templates para excluir `tenant_id = null`, quebrando a herança de templates que já funciona.
- **Evidência:** snapshot `apps/backend/src/modules/notification/application/use-cases/list-notification-templates.use-case.ts:59,73`; `apps/backend/src/modules/notification/infrastructure/prisma-notification-template.repository.ts:53`; `apps/backend/src/modules/service-region/application/use-cases/list-service-regions.use-case.ts:40`.
- **Proposta de regra/detalhe:** reescrever (c): "`CL_*` reach them only (i) read-only, for platform **defaults without a subject** (platform `NotificationTemplate`s, used as the agency's fallback catalog), or (ii) through a projection filtered by the agency's own appointments; never any row about another inspector or another agency". Manter (a), (b) e (d) como estão.
- **Precisa de decisão do dev?** Não.

## L-X00-06 · N5 diz "Server token only (`MAPBOX_ACCESS_TOKEN`)", mas o token vem do Integrations Hub e o env é só fallback opcional

- **Severidade:** MÉDIA
- **Tarefa/seção:** Regra N5 "Routing" (backend §10), 3º bullet; linha N5 para raiz §15
- **O que falta / está ambíguo:** `env.MAPBOX_ACCESS_TOKEN` é `optional()` e só alimenta o default do hub (`container.ts:652`: `mapbox: compactConfig({ accessToken: env.MAPBOX_ACCESS_TOKEN })`, com aviso "geocoding relies on Integrations Hub settings (stub service until configured)"). A F04 decide o mesmo para rota: `DynamicRoutingService` chama `resolver.getConfig('mapbox')` a cada chamada e cai no stub quando `null`. O 1º bullet de N5 diz "wired through the Integrations Hub `mapbox` config like geocoding", mas o 3º nomeia o env como **a** fonte ("Server token only (`MAPBOX_ACCESS_TOKEN`)"). N6 ainda proíbe "env var … for a value the operation must tune".
- **Por que importa:** o implementador da F04-1 lê `env.MAPBOX_ACCESS_TOKEN` direto no adaptador (ou torna o env obrigatório), contornando o hub: em staging/prod, onde a chave está gravada no `IntegrationSetting`, a rota responde com stub haversine sem erro visível; o teste de conexão do hub não cobre rota.
- **Evidência:** snapshot `apps/backend/src/main/env.ts:63,178-179`; `apps/backend/src/main/container.ts:652`; `apps/backend/src/modules/integration/infrastructure/dynamic-providers.ts`; `tarefas/F04-tarefas.md:371` (`DynamicRoutingService`).
- **Proposta de regra/detalhe:** trocar o 3º bullet por: "**Server-side token only**, resolved per call from the Integrations Hub `mapbox` config (`IntegrationConfigResolver.getConfig('mapbox')`, stub when unset); `MAPBOX_ACCESS_TOKEN` is only the bootstrap default for that config, never read directly by adapters. Never expose it to the PWA — geometry reaches clients as GeoJSON from the backend."
- **Precisa de decisão do dev?** Não.

## L-X00-07 · N4 é mais vaga que a X02 nos dois pontos que importam: o que fica gravado quando o modo permanente falha, e o que acontece com lat/lng no update

- **Severidade:** MÉDIA
- **Tarefa/seção:** Regra N4 (backend §10 "Maps/Geocoding"); B17
- **O que falta / está ambíguo:** (i) N4: "If the account/token rejects permanent mode, store **no** coordinate and leave the record `PENDING`/`FAILED` with the reason". A X02 decidiu: `FAILED` + `geocoding_failure_code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`, **sem** reenfileirar (o sweep filtra `geocoding_failure_code IS NULL`); no create síncrono passa por `PENDING` → worker → `FAILED`. "PENDING/FAILED" permite deixar o imóvel em `PENDING` e ser reenfileirado a cada 10 min para sempre. (ii) N4: "Coordinates sent by a client from an autocomplete suggestion are ignored on save". Isso vale para o create (`createPropertySchema` descarta lat/lng) e para filiais (X02 item 3), mas no **update** de imóvel a X02 manda gravar `MANUAL` quando lat/lng do body diferem do gravado — o backend não distingue autocomplete de digitação; a garantia é que o **web não envia** coordenadas do autocomplete (X02 passo 6, "travar com testes"). N4 também não cita a marcadora `geocoded_permanently_at`, que é a prova de conformidade.
- **Por que importa:** uma sessão seguindo N4 mantém o imóvel em `PENDING` e o `property.geocode-retry` tenta a cada 10 min contra uma conta sem modo permanente (custo e log); outra "ignora" lat/lng no update e quebra o override MANUAL que a X02 preserva e trava com teste.
- **Evidência:** `tarefas/X02-tarefas.md:105-115` (decisões 1, 2, 6, 8, 9), `:122-124` (colunas), `:313-314` (CA1/CA2), `:421`, `:484-487`; snapshot `apps/backend/src/modules/property/application/use-cases/update-property.use-case.ts:182-190`.
- **Proposta de regra/detalhe:** reescrever N4 nesses dois pontos: "Clients never send autocomplete coordinates (`createPropertySchema` strips them; the web branch/property forms do not post them). A latitude/longitude in an **update** body is user input: stored as `MANUAL` only when it differs from the stored pair, otherwise the current status is kept. A stored coordinate is permanent iff `geocoded_permanently_at` is set. If the account rejects permanent mode (`MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`), store no coordinate, set `FAILED` with `geocoding_failure_code`, and do not re-enqueue (the retry sweep skips coded failures)."
- **Precisa de decisão do dev?** Não.

## L-X00-08 · O "smoke de leitura" (critério 6) não tem estado inicial nem forma de registro definidos

- **Severidade:** BAIXA
- **Tarefa/seção:** "Testes/validação primeiro" item 3; "Critérios de aceite" 6
- **O que falta / está ambíguo:** "abrir uma sessão nova do Claude Code dentro de um worktree limpo e perguntar …; a resposta precisa citar `PlatformSetting` e 'no'". Não diz: em que branch/commit o worktree está (antes ou depois do merge?), se a memória local (`~/.claude/projects/...`) conta (ela já sabe de `PlatformSetting` pelo plano, o que vicia o teste), qual modelo, nem o formato do registro no PR (texto da resposta? screenshot? — a memória `feedback_review_screenshots_never_commit` proíbe commitar screenshots).
- **Por que importa:** o teste pode passar por causa da memória local e não dos CLAUDE.md, e o PR fica com um "smoke OK" que não prova a leitura das regras.
- **Evidência:** `X00-tarefas.md` item 3 e critério 6.
- **Proposta de regra/detalhe:** fixar: worktree na branch do PR; sessão iniciada com `claude --no-memory`-equivalente (ou pedir explicitamente "answer only from the repository CLAUDE.md files, cite the file and section"); registrar na descrição do PR a pergunta e a resposta em texto, com os trechos citados (`CLAUDE.md §7.1`, `apps/backend/CLAUDE.md §7.1 Configuration`, `§5.7`). Manter como evidência, não como gate.
- **Precisa de decisão do dev?** Não.

## L-X00-09 · Achados 3, 4 e 6 já estão registrados em outros arquivos; a tarefa pede para "sugerir" de novo

- **Severidade:** BAIXA
- **Tarefa/seção:** "Achados para revisão" 3, 4, 6; "Fora do escopo"; `X00-claude-md.md` "Decisões tomadas" ("Comentários desatualizados … vão para o estacionamento")
- **O que falta / está ambíguo:** o Achado 3 (job de E2E do PWA não existe no CI) já foi absorvido pela X03 (`X03-e2e-pwa.md:30`, +0,25 dia); o Achado 4 (`VALID_TRANSITIONS` × `TRANSITION_RULES`) é o item 14 do `estacionamento.md`; o Achado 6 (comentários `properfy-prod`, `pages-deploy.yml`, "51 migrations") é o item 15. A tarefa ainda diz "sugerir um item no `estacionamento.md`" e "fora do escopo; sugerir uma limpeza curta", e o plano manda para o estacionamento — sem dizer que já está lá nem se o comentário de `appointment-state-machine.ts:43` ("date has passed") e "SAST mandatory" entram no item 15.
- **Por que importa:** duplicação ou, ao contrário, uma sessão que conclui que "já está parado" e não acrescenta os dois achados que **não** estão (comentário :43 e o gate de SAST como tarefa nova).
- **Evidência:** `estacionamento.md` itens 14 e 15; `X03-e2e-pwa.md:30`; `X00-tarefas.md` Achados 3, 4, 6.
- **Proposta de regra/detalhe:** nos Achados, apontar para o registro existente (X03 linha "CI", estacionamento #14 e #15) e dizer o que a X00 ainda acrescenta: completar o #15 com `appointment-state-machine.ts:43` e abrir o #17 "SAST/dependency scan no CI (hoje inexistente; CLAUDE.md corrigido pela X00)". Como `estacionamento.md` passa a ser versionado (L-X00-01), essa edição entra no PR da X00.
- **Precisa de decisão do dev?** Não.

## L-X00-10 · N10 apresenta como "padrão existente" detalhes que só a F04 introduz (`cacheableResponse` 200, textos de offline)

- **Severidade:** BAIXA
- **Tarefa/seção:** Regra N10 (pwa §5 "Caching"); bloco P08
- **O que falta / está ambíguo:** N10 diz que todo endpoint de leitura "follows the existing pattern: NetworkFirst … `cacheableResponse` limited to `200` … an explicit offline state in the UI ('Offline · showing your last saved …')". No snapshot os dois caches atuais (`api-schedule-cache`, `api-appointment-cache`) **não** definem `cacheableResponse` (default do Workbox NetworkFirst: status `0` e `200`, ou seja, respostas opacas também entram) e não há esse texto de offline na agenda. Os valores concretos ("3 entradas, 12 h, só 200") estão na F04 (`F04-tarefas.md:2431`) e os textos em `:1674-1675`, mas N10 deixa "a short TTL, a small `maxEntries`" sem número e cita a frase genérica "showing your last saved …".
- **Por que importa:** uma sessão que leia só o CLAUDE.md acha que o `api-schedule-cache` já filtra 200 e não corrige; outra inventa TTL e copy diferentes dos da F04 (que o QA da F04 verifica literalmente: "Offline · showing your last saved route").
- **Evidência:** snapshot `apps/pwa/vite.config.ts:55-75` (sem `cacheableResponse`); `tarefas/F04-tarefas.md:1674-1675,1800-1801,2431`.
- **Proposta de regra/detalhe:** em P08, acrescentar "(no `cacheableResponse` today: Workbox default `0`/`200`)" nas duas linhas de cache; em N10, separar "existing" de "required for new caches": "New inspector caches set `cacheableResponse: { statuses: [200] }`, `maxAgeSeconds` ≤ 12 h and `maxEntries` ≤ 10 unless the task says otherwise; the offline copy is 'Offline · showing your last saved <thing>' / 'You're offline. Connect to load <thing>.' + Retry". Opcional: aplicar `cacheableResponse: [200]` aos dois caches existentes no PR da F02-3 (que já reescreve `runtime-caching.ts`), registrando no checklist dela.
- **Precisa de decisão do dev?** Não.
