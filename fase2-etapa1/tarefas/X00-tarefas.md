# X00 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Total** | **1,25 dia** (0,5 aplicar as 77 correções + 0,5 regras novas N1–N13, conflitos, cláusulas de transição e versionamento de `fase2-etapa1/` + 0,25 verificação, revisão e PR). O plano previa 1,0; as lacunas de 2026-10-29 (L-X00-01, 03, 04, 09) somam +0,25 (nova regra N13, reescrita de N4–N7/N10, tabela de cláusulas de transição, versionar a pasta e os 3 `escopo-*.md`, editar `estacionamento.md`); L-X00-02 tira o reformat do prettier. |
| **Tarefas** | 1 |
| **PRs** | 1 (só documentação: 7 arquivos de instrução + `fase2-etapa1/**` + 3 `escopo-*.md` da raiz) |
| **Depende de** | – |
| **Bloqueia** | Todas as outras tarefas da Fase 2 (as sessões de implementação leem esses arquivos) |
| **Código verificado em** | snapshot read-only de `origin/develop` @ `042a9674` (2026-10-24), o mesmo do README do plano |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-X00-1 | Revisar os CLAUDE.md (raiz, backend, web, pwa, shared) e os ponteiros AGENTS.md/AGENT.md; acrescentar as regras da Fase 2; versionar `fase2-etapa1/` | 1,25 | – |

### Correções por arquivo

| Arquivo | Correções | Regras novas |
|---|---|---|
| `CLAUDE.md` (raiz) | 23 | 6 blocos (N7, N8, N9, N11, N13 + §15 provedores) |
| `apps/backend/CLAUDE.md` | 21 | 4 blocos (N4, N5, N6, N7/N9) |
| `apps/web/CLAUDE.md` | 8 | 3 blocos (N1, N2, N3) + N9 |
| `apps/pwa/CLAUDE.md` | 12 | 1 bloco (N10) |
| `packages/shared/CLAUDE.md` | 10 | 2 blocos (N6, N13 curta) |
| `AGENTS.md` | 1 | – |
| `AGENT.md` | 1 | – |
| Memória local (fora do PR) | 1 | – |
| **Total** | **77** | **13 regras (N1–N13)** |

---

## TASK-X00-1 · Revisar CLAUDE.md

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** —
> - **Desbloqueia:** TASK-X01-1, TASK-X02-1, TASK-X02-2, TASK-X03-1, TASK-F00-1, TASK-F01-1, TASK-F01-2, TASK-F01-3, TASK-F02-1, TASK-F02-2, TASK-F02-3, TASK-F03-1, TASK-F03-2, TASK-F03-3, TASK-F03-4, TASK-F04-1, TASK-F04-2, TASK-F04-5, TASK-F04-3, TASK-F04-3b, TASK-F04-4, TASK-F05-1, TASK-F05-2, TASK-F05-3, TASK-F06-1, TASK-F06-2, TASK-F07-1, TASK-F07-2, TASK-F07-3, TASK-F08-1, TASK-F08-2, TASK-F08-3, TASK-F08-4, TASK-F08-5, TASK-F09-1, TASK-F09-2
> - **Pode rodar em paralelo com:** —
> - **Pista sugerida (time de 6):** A · Backend crítico · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo

Deixar os 5 `CLAUDE.md` e os 2 ponteiros (`AGENTS.md`, `AGENT.md`) coerentes com o código de `origin/develop` e com as regras definidas no planejamento da Fase 2. Assim, cada sessão que implementar uma tarefa já parte de instruções verdadeiras.

Três resultados:
1. Toda afirmação verificável dos arquivos bate com o código, ou foi corrigida (77 correções, 76 no PR + 1 na memória local, tabelas abaixo).
2. As 13 regras da Fase 2 (N1–N13) entram no arquivo e na seção certos, com o texto exato abaixo.
3. Os 16 conflitos entre regras antigas e novas ficam resolvidos e registrados na descrição do PR.

### Contexto

- **Arquivos auditados** (todos em inglês; o texto proposto segue em inglês):
  - `CLAUDE.md` (426 linhas), `apps/backend/CLAUDE.md` (503), `apps/web/CLAUDE.md` (382), `apps/pwa/CLAUDE.md` (273), `packages/shared/CLAUDE.md` (276).
  - `AGENTS.md` (17) e `AGENT.md` (13): já são **ponteiros** para o `CLAUDE.md` da raiz e listam os mesmos 4 arquivos de workspace. Estão em sincronia entre si. Não existe nenhum outro `CLAUDE.md` no repositório (`find . -name CLAUDE.md -not -path '*/node_modules/*'` → 5 arquivos).
- **O que mudou e os arquivos não acompanharam** (resumo da auditoria):
  - Stack: Node 24 (`package.json:7`, `.nvmrc`, `.node-version`), Prisma 6 (`apps/backend/package.json` → `prisma ^6.19.3`). A seção "Active Technologies" ainda diz Node 20 e Prisma 5.
  - Deploy: os três ambientes do backend estão no **Fly.io** (dev `iad`, staging e prod `syd`) e os frontends na **Vercel**. Os arquivos ainda falam em VPS/Portainer.
  - CI: 10 jobs (`ci.yml`); não existe "migration dry-run", existe `prisma migrate deploy` duas vezes num Postgres limpo, além do gate de frescor do contrato OpenAPI e do E2E do web.
  - **`projeto-consolidado/` não existe mais**: está no `.gitignore:4` e, no checkout principal, só restam 2 arquivos (`agente-consultor-cli.md`, `service-group-exceptions.md`). **Nenhum** dos 14 documentos citados nos CLAUDE.md existe em lugar algum do disco. Há 12 referências mortas nos 5 arquivos.
  - Os documentos de escopo citados na raiz (`escopo-pendencias-execucao.md` etc.) e a pasta `fase2-etapa1/` **não são versionados** hoje: existem só no checkout principal e **não aparecem nos worktrees**, onde a regra §16 manda trabalhar. **Este PR passa a versioná-los** (L-X00-01; ver Decisões).
  - Fuso horário: nenhum CLAUDE.md fala de fuso (a única menção é "Deploy window: from 09:00 Brazil"). O código é Sydney-only: `PLATFORM_TIMEZONE = 'Australia/Sydney'` (`packages/shared/src/constants/timezone.ts:6`), `tenants.timezone` default Sydney (`schema.prisma:167`), `users.timezone` pessoal só para AM/OP/INSP (`schema.prisma:256-258`); helpers `zonedWallTimeToUtc`/`endOfCivilDayInTz` (`packages/shared/src/utils/timezone-date.ts`), `formatCivilDate`/`formatWallTime*` (`packages/shared/src/utils/format-display-date.ts`) e `civilDateInTimezone` (backend, `apps/backend/src/shared/domain/timezone-date.ts`). Ver N13.
  - PWA: a suíte E2E existe (`apps/pwa/tests/e2e`, 4 specs × 4 projetos) mas falha 56/56 e **não roda no CI** (só `test-web-e2e` existe em `ci.yml:205`). A seção §8 descreve um upload de evidências que não existe.
  - Web: o arquivo diz que não há `eslint-plugin-jsx-a11y`, mas ele está ligado na raiz (`.eslintrc.json:4,8`) e o lint do web roda com `--max-warnings 0`.
  - Shared: enums documentados divergem do código (`WHATSAPP` não existe; faltam `TNT`, `SYS`, `SKIPPED`, `SKIPPED_OPT_OUT`); o mapa `VALID_TRANSITIONS` tem `DRAFT → SCHEDULED`.
  - Backend: TTL do access token é 60 min (não 15), os claims do JWT não têm `email`, o nome do app de produção no Fly é `properfy-api` (não `properfy-prod`), não há SAST/dependency scan no CI, e os workers rodam num único processo.
- **Seção "Active Technologies" / "Recent Changes" da raiz:** é gerada pelo `speckit.plan`, que roda `.specify/scripts/bash/update-agent-context.sh claude` (`.claude/commands/speckit.plan.md:142`). O script insere entradas sob esses cabeçalhos e, **se eles não existirem, recria os dois no fim do arquivo** (`update-agent-context.sh:423-511`). Por isso a correção mantém os cabeçalhos e troca o conteúdo (ver C12).

### Decisões aplicáveis

| Data | Decisão | Fonte |
|---|---|---|
| 2026-10-28 | Os CLAUDE.md são revistos **antes** de qualquer implementação da Fase 2 (onda 0). Só correções e acréscimos; não reescrever nem mudar o tom. | `X00-claude-md.md`, `README.md` ("Regras do dev") |
| 2026-10-27 | Cada feature atualiza o CLAUDE.md do workspace que mudar, como passo do próprio PR. | `README.md` ("Regras do dev"; já está lá) |
| 2026-10-27 | As telas de dashboard que já existem no web **não são alteradas**; para mexer, perguntar ao dev; requisito novo vai para tela nova. Exceção autorizada: o X01 remove os botões de cluster dos cabeçalhos de Dashboard/Analytics/Workload. | `README.md`, `tarefas/X01-tarefas.md` (Decisões) |
| 2026-10-27 | Telas de painel ficam no menu lateral, grupo **Dashboard** (Overview, Analytics, Workload); o grupo colapsa para item simples quando o usuário só vê um filho (`collapseIfSingle`, só nesse grupo). | `tarefas/X01-tarefas.md` |
| 2026-10-27 | Toda sub tela do web tem botão voltar (ícone + texto "Back", `useGoBack(parentPath)`, componente `BackButton`; override `onBack` para confirmação de descarte; "Previous step" nos wizards). Analytics e Workload são telas de topo, sem voltar; `/notification-consents` fica fora. | `tarefas/X01-tarefas.md` |
| 2026-10-27 | Toda coordenada gravada vem de geocodificação em modo **permanente** (`permanent=true`); o autocomplete continua temporário e só serve para exibição; lat/lng digitados (MANUAL) continuam aceitos. | `X02-geocodificacao-permanente.md` |
| 2026-10-27 | Roteiro: **Mapbox** Matrix (`driving-traffic` até 10 pontos, `driving` acima) só para a ordem + Directions com `depart_at` por trecho; nada em beta (sem `depart_at` da Matrix, sem Optimization v2). Google Route Optimization descartado pelos termos (§18.2, proíbe uso com mapa não Google); só entra pelo gatilho medido (erro médio > 10 min em 30 dias), trocando os dois mapas de rota. | `F04-plano-do-dia-roteiro.md`, `decisoes.md` Q8 |
| 2026-10-27 | `PlatformSetting` (config de plataforma auditada, AM/OP) nasce na F03 e é reusado por F04–F10; config por agência continua no `tenantSettingsSchema`. | `F03-eventos-de-campo.md` B6, `tarefas/F03-tarefas.md` D9, `tarefas/F00-tarefas.md` |
| 2026-10-27 | `DayPlan`, `InspectorNotice`, `PlatformSetting`, snapshots do índice, metas e prêmios **não têm `tenant_id`** (inspetor é cross-tenant); cada spec registra a exceção ao §7.1. `Attachment`, `InspectorFieldEvent` e o endpoint de densidade **são** escopados por tenant. | `README.md` (Blocos transversais), `tarefas/F03-tarefas.md` D9 |
| 2026-10-27 | Privacidade: CL_ADMIN/CL_USER nunca veem lat/lng crus do inspetor (só distância, precisão e flags), inclusive no audit-log; audits novos não gravam lat/lng do inspetor. | `F03-eventos-de-campo.md`, `tarefas/F03-tarefas.md` D10 |
| 2026-10-27/28 | 1 tarefa = 1 PR = 1 spec; os insumos ficam em `fase2-etapa1/tarefas/<ID>-tarefas.md`. | `README.md` ("Tarefas") |
| 2026-10-28 | PWA: cache offline mínimo do plano do dia, no mesmo padrão NetworkFirst da agenda; o cache entra em `INSPECTOR_API_CACHES` e é apagado no logout. | `tarefas/F04-tarefas.md` ("Offline (corrigido em 2026-10-28)") |
| 2026-10-28 | A suíte E2E do PWA está quebrada (56/56) e é recuperada pela X03, antes da F04-3b. | `X03-e2e-pwa.md` |
| 2026-10-29 | **Versionar `fase2-etapa1/` inteira no PR da X00**, no caminho atual (inclui `tarefas/`, `tarefas/lacunas/`, `arquivo/`, `estacionamento.md`, `decisoes.md`), e também os três documentos de escopo da raiz (`Escopo Completo Properfy - CLIENTE.md`, `escopo-cliente-gap-audit.md`, `escopo-pendencias-execucao.md`). Consequências: o bloco R20 deixa de existir (nada fica fora do git); N8 perde a frase "(The folder is untracked…)"; o critério 7 vira "7 arquivos de instrução + `fase2-etapa1/**` + 3 `escopo-*.md`"; o Risco 4 e o Achado 1 saem; C08 resolve por versionamento. | L-X00-01 (opção 1, recomendada); `X00-claude-md.md` "Decisões tomadas"; `README.md` onda 0 |
| 2026-10-29 | **Prettier só como gate de não-regressão.** `prettier --check` continua obrigatório só em `AGENTS.md`, `AGENT.md` e `apps/pwa/CLAUDE.md` (passam hoje); `CLAUDE.md`, `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md` e `packages/shared/CLAUDE.md` já falham em `develop` e **não** são reformatados neste PR (o diff fica só com as 77 correções). A saída do check nos 4 arquivos vai para a descrição do PR; a formatação integral deles vira item novo do `estacionamento.md`. Rodar o prettier sem `pnpm install` no worktree: `node_modules/.bin/prettier` do checkout principal, ou `pnpm install --filter . --ignore-scripts` só na raiz. | L-X00-02 (opção 1, recomendada) |
| 2026-10-29 | **Nova regra N13 · Dates and timezones** no `CLAUDE.md` raiz §9 (+ linha curta em `packages/shared/CLAUDE.md` §10, item 11): datas civis e janelas são horário de parede no fuso da **agência**; instantes em UTC; conversão só pelos helpers; jobs de plataforma em `PLATFORM_TIMEZONE`; `users.timezone` é só exibição. O referencial do `DayPlan` multi-agência é confirmado na F04. **Emenda (dev, 2026-10-29):** exceção explícita em N13: "Inspector day plans (DayPlan) use the inspector's timezone" (data civil, publicação das 19:30 e janela de publicação; F04 D14 / L-F04-02). Como a plataforma hoje é Sydney-only, na prática nada muda agora. | L-X00-03 (opção 1, recomendada) |
| 2026-10-29 | **Cláusulas de transição têm dono explícito.** O PR da X00 traz a tabela {regra, arquivo, trecho exato, tarefa dona} (passo 6c) e acrescenta, no checklist de verificação de X01 (N2, N3), X02 (N4), F03-1 (N6, N9) e F04-1/F04-3 (N5, N10), a linha "Remove the transition clause of rule N# from `<file>` in this PR (X00 L-04)". Como `fase2-etapa1/` passa a ser versionada, essas linhas entram no mesmo PR. N11 ganha a frase genérica de remoção. | L-X00-04 |
| 2026-10-29 | **N7(c) corrigido:** `CL_*` alcança entidades de plataforma só (i) em leitura, para defaults de plataforma sem sujeito (os `NotificationTemplate`s de plataforma, catálogo de fallback da agência — `list-notification-templates.use-case.ts:59,73`, `prisma-notification-template.repository.ts:53`) ou (ii) por projeção filtrada pelos appointments da própria agência; nunca uma linha sobre outro inspetor ou outra agência. | L-X00-05 |
| 2026-10-29 | **N5: token Mapbox de rota vem do Integrations Hub**, resolvido a cada chamada (`IntegrationConfigResolver.getConfig('mapbox')`, stub quando não configurado); `MAPBOX_ACCESS_TOKEN` é só o default de bootstrap dessa config (`container.ts:652`, `env.ts:63` `optional()`), nunca lido direto pelos adaptadores. | L-X00-06 |
| 2026-10-29 | **N4 alinhado à X02:** o cliente nunca envia coordenadas do autocomplete (`createPropertySchema` descarta; os formulários de filial/imóvel do web não postam); lat/lng no **update** é input do usuário (`MANUAL` só quando difere do par gravado); coordenada permanente ⇔ `geocoded_permanently_at` preenchido; conta sem modo permanente → `FAILED` + `geocoding_failure_code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`, sem reenfileirar. | L-X00-07; `tarefas/X02-tarefas.md` decisões 1, 2, 6, 8, 9 |
| 2026-10-29 | **Smoke de leitura é evidência, não gate:** worktree na branch do PR; sessão sem memória local (ou com a instrução "answer only from the repository CLAUDE.md files, cite the file and section"); pergunta e resposta em texto na descrição do PR, com os trechos citados; nunca screenshot commitado. | L-X00-08 |
| 2026-10-29 | **Achados 3, 4 e 6 já têm registro** (X03 linha "CI" +0,25; `estacionamento.md` #14 e #15). A X00 só completa o #15 com `appointment-state-machine.ts:43` ("date has passed") e abre o #17 "SAST/dependency scan no CI"; a edição de `estacionamento.md` entra no PR da X00 (pasta versionada). | L-X00-09 |
| 2026-10-29 | **N10 separa o que existe do que é exigido:** os caches atuais (`api-schedule-cache`, `api-appointment-cache`) não definem `cacheableResponse` (default Workbox `0`/`200`); caches novos do inspetor usam `cacheableResponse: { statuses: [200] }`, `maxAgeSeconds` ≤ 12 h, `maxEntries` ≤ 10 (salvo tarefa dizendo outra coisa) e a copy fixa de offline. Aplicar `[200]` aos dois caches existentes fica para o PR da F02-3 (que reescreve `runtime-caching.ts`). | L-X00-10; `tarefas/F04-tarefas.md:1674-1675,2431` |
| 2026-10-29 | **N3 alinhada ao X01:** "sem histórico do app" = primeira entrada do histórico (`history.state.idx === 0`, preservado por `replace`), não mais `location.key === 'default'`; o override de descarte é `onBack(goBack)` (o `BackButton` passa o seu `goBack`); regra geral: o `backTo` tem de ser uma rota que todos os papéis da sub tela abrem, senão é calculado por papel. O critério `idx`, o contrato `onBack(goBack)` e o `BackButton`/`backTo` entram na cláusula de transição de N3 (introduzidos pelo X01). | L-X01-01, L-X01-08; `tarefas/X01-tarefas.md` (Decisões) |
| 2026-10-29 | **N2 traz a ordem canônica do grupo Dashboard:** Overview · Live Day (F05) · Inspector notices (F02) · Analytics · Workload · Inspector performance (F07) · Goals & rewards (F08); cada feature insere o seu filho nessa posição, sem placeholder; testes de menu por rótulo, nunca por índice ou contagem. Escrita como regra (posição relativa), não como documentação das telas futuras. | L-X01-03; `tarefas/X01-tarefas.md` (Decisões) |
| 2026-10-29 | **Divisão com a X03:** o Bloco R22 (build do `@properfy/frontend-standards` na receita do §16) é **dono exclusivo da X00**; a X03 só confere (e só aplica R22 literalmente se a X00 ainda não tiver entrado). Os quatro avisos "56/56 … until X03" gravados aqui (raiz R12, `apps/pwa/CLAUDE.md` §1 P01 e §10 P11, memória) são **revertidos pela X03** (Passo 9 dela), não por esta tarefa. | L-X03-09; `tarefas/X03-tarefas.md` (Decisões, Passo 9) |

### Testes/validação primeiro

Documentação não tem teste automatizado. O "teste" aqui é: **cada afirmação mantida ou nova tem um comando que a prova**, rodado num worktree de `origin/develop` atualizado **antes** de editar (para confirmar que a auditoria continua valendo) e **depois** (para provar o resultado).

**1. Antes de editar (a auditoria ainda vale?)** — rodar na raiz do worktree:

```bash
git fetch origin && git log -1 --format='%h %cd' origin/develop   # se != 042a9674, reconferir as linhas citadas
find . -name CLAUDE.md -not -path '*/node_modules/*'                  # 5 arquivos
node -p "require('./package.json').engines.node"                      # >=24.0.0 <25.0.0
node -p "require('./apps/backend/package.json').devDependencies.prisma" # ^6.x
grep -n "app = \|primary_region" fly.*.toml                           # properfy-api-dev/iad, -staging/syd, properfy-api/syd
grep -n "^  [a-z-]*:$" .github/workflows/ci.yml                       # 10 jobs; nenhum pwa e2e
grep -n "projeto-consolidado" .gitignore                              # linha 4
git ls-files | grep -c "^projeto-consolidado/\|^fase2-etapa1/\|^escopo-" # 0
grep -n "JWT_ACCESS_TOKEN_TTL_MINUTES" apps/backend/src/main/env.ts fly.*.toml   # default 60
grep -n "^enum \(NotificationChannel\|NotificationStatus\|GeocodingStatus\)" -A7 apps/backend/prisma/schema.prisma
sed -n 1,10p packages/shared/src/enums/user.ts                        # TNT, SYS
sed -n 3,10p packages/shared/src/constants/status-transitions.ts      # DRAFT inclui SCHEDULED
grep -n "jsx-a11y" .eslintrc.json                                     # plugin ligado
grep -n "registerType\|strategies\|cacheName" apps/pwa/vite.config.ts # generateSW + 2 caches de API
grep -n "INSPECTOR_API_CACHES" apps/pwa/src/hooks/useAuth.tsx
ls apps/backend/src/modules                                           # 22 módulos, sem marketplace/
grep -in "sydney\|timezone" CLAUDE.md apps/*/CLAUDE.md packages/shared/CLAUDE.md   # só "09:00 Brazil" (raiz) — N13 ainda não existe
sed -n 1,6p packages/shared/src/constants/timezone.ts                 # PLATFORM_TIMEZONE = 'Australia/Sydney'
grep -n "cacheableResponse" apps/pwa/vite.config.ts ; echo "exit=$? (esperado 1: caches atuais sem cacheableResponse)"
grep -n "MAPBOX_ACCESS_TOKEN" apps/backend/src/main/env.ts apps/backend/src/main/container.ts   # optional(); só default do hub
# Linha de base do prettier (L-X00-02): esperado "Code style issues found in 4 files" (raiz, backend, web, shared)
"$(git rev-parse --path-format=absolute --git-common-dir)/../node_modules/.bin/prettier" --check CLAUDE.md AGENTS.md AGENT.md apps/*/CLAUDE.md packages/shared/CLAUDE.md
```

**2. Depois de editar (o resultado está certo?)**:

```bash
# Nenhuma referência morta sobrou
grep -rn "projeto-consolidado\|infra-tecnologia-production-ready\|frontend-system-spec\|component-inventory" --include=CLAUDE.md . ; echo "exit=$? (esperado 1)"
grep -rn "Portainer\|properfy-prod\|Node.js 20\|Prisma 5\|WHATSAPP\|pnpm prisma migrate diff" --include=CLAUDE.md . ; echo "exit=$? (esperado 1)"
grep -rn "no \`eslint-plugin-jsx-a11y\`" apps/web/CLAUDE.md ; echo "exit=$? (esperado 1)"
# As regras novas estão lá (uma linha por regra; cada grep deve achar >= 1)
for p in "Existing dashboard screens are frozen" "Dashboard\` sidebar group" "Every web sub-screen has a Back button" \
         "permanent=true" "### Routing" "PlatformSetting" "Platform-scoped entities" "1 task = 1 PR = 1 spec" \
         "Inspector GPS coordinates are never exposed" "api-day-plan-cache" "updates the CLAUDE.md of every workspace it changes" \
         "Dates and timezones" "removes that transition clause"; do
  printf '%-55s %s\n' "$p" "$(grep -rlF "$p" --include=CLAUDE.md . | tr '\n' ' ')"; done
# O cabeçalho que o speckit usa continua lá (C12)
grep -n "^## Active Technologies\|^## Recent Changes" CLAUDE.md
# Ponteiros em sincronia
diff <(grep -o '`[a-z/.-]*CLAUDE.md`\|`[a-z/.-]*README.md`' AGENTS.md) <(grep -o '`[a-z/.-]*CLAUDE.md`\|`[a-z/.-]*README.md`' AGENT.md) && echo "pointers in sync"
# Regras reescritas (L-X00-05/06/07/10): o texto antigo sumiu
grep -rn "CL_\*\` never reach them\|Server token only (\`MAPBOX_ACCESS_TOKEN\`)\|ignored on save\|PENDING\`/\`FAILED\` with the reason\|The folder is untracked\|not tracked by git" --include=CLAUDE.md . ; echo "exit=$? (esperado 1)"
grep -n "geocoded_permanently_at\|MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE" apps/backend/CLAUDE.md     # >= 1 cada (N4)
grep -n "IntegrationConfigResolver.getConfig('mapbox')" apps/backend/CLAUDE.md                     # >= 1 (N5)
grep -n "statuses: \[200\]" apps/pwa/CLAUDE.md                                                   # >= 1 (N10)
# N2/N3 alinhadas ao X01 (L-X01-01/03/08)
grep -n "location.key === 'default'" apps/web/CLAUDE.md ; echo "exit=$? (esperado 1)"
grep -n "history.state.idx === 0\|onBack(goBack)\|every role of the sub-screen can open" apps/web/CLAUDE.md   # >= 1 cada (N3)
grep -n "Overview · Live Day · Inspector notices · Analytics · Workload · Inspector performance · Goals & rewards" apps/web/CLAUDE.md   # 1 (N2)
# Avisos que a X03 reverte (L-X03-09): presentes agora, com ponteiro para a X03
grep -n "until X03\|56/56" CLAUDE.md apps/pwa/CLAUDE.md                                          # R12, P01, P11
grep -n "frontend-standards build" CLAUDE.md                                                     # >= 1 (R22, dono X00)
# Formatação: só não-regressão (L-X00-02). Esperado: os 3 abaixo passam
PRETTIER="$(git rev-parse --path-format=absolute --git-common-dir)/../node_modules/.bin/prettier"
"$PRETTIER" --check AGENTS.md AGENT.md apps/pwa/CLAUDE.md
# Os outros 4 já falhavam em develop: registrar a saída no PR, sem reformatar
"$PRETTIER" --check CLAUDE.md apps/backend/CLAUDE.md apps/web/CLAUDE.md packages/shared/CLAUDE.md || true
# Versionamento (L-X00-01): a pasta e os 3 escopos entram no PR
git ls-files fase2-etapa1 | wc -l                                      # >= 33
git ls-files "Escopo Completo Properfy - CLIENTE.md" escopo-cliente-gap-audit.md escopo-pendencias-execucao.md | wc -l   # 3
git diff --stat origin/develop... -- . ':!fase2-etapa1' ':!Escopo Completo Properfy - CLIENTE.md' ':!escopo-*.md' | tail -1   # 7 files changed
git diff --stat origin/develop... | tail -1                            # total <= 150 arquivos (limite de PR)
```

**3. Prova de que as regras são lidas** (smoke manual, 5 min; **evidência, não gate** — L-X00-08):
- Estado inicial: worktree **na branch do PR** (`docs/claude-md-phase2-review`, depois do último commit), sessão nova do Claude Code, sem memória local (equivalente a `--no-memory`; se a opção não existir, começar o prompt com "Answer only from the repository CLAUDE.md files; cite the file and section for each claim").
- Entrada: "Where do I store a platform-wide threshold, and can a CL_ADMIN see the inspector's check-in coordinates? And in which timezone is an appointment's civil date?"
- Saída esperada: cita `PlatformSetting` com `apps/backend/CLAUDE.md §7.1 Configuration`; responde "no" citando `CLAUDE.md §7.9` (e/ou `apps/backend/CLAUDE.md §5.7`); responde "agency timezone (`tenants.timezone`)" citando `CLAUDE.md §9` N13.
- Registro: pergunta e resposta **em texto** na descrição do PR, com os trechos citados. Nunca screenshot commitado.

### Escopo / Passos (por arquivo)

0. **Preparação.** Criar branch `docs/claude-md-phase2-review` a partir de `origin/develop`. Pela §16 um PR só de CLAUDE.md dispensa worktree, mas recomenda-se um worktree leve (sem `pnpm install`), para não misturar com os arquivos não versionados do checkout principal. Rodar o bloco "Antes de editar" (inclui a linha de base do prettier pelo `node_modules/.bin/prettier` do checkout principal — L-X00-02).
1. **`CLAUDE.md` (raiz):** aplicar R01–R19 e R21–R23 (**R20 não se aplica**: os documentos passam a ser versionados — L-X00-01); inserir N7 (§7), N8 e N11 (§13), N9 (§7), N13 (§9), bloco de provedores (§15); corrigir a receita de setup (R22); reescrever "Active Technologies"/"Recent Changes" (R23, mantendo os cabeçalhos).
2. **`apps/backend/CLAUDE.md`:** aplicar B01–B21; inserir N4 e N5 (§10), N6 (nova §7.1 "Configuration"), N7/N9 (§5 "Multi-tenant enforcement").
3. **`apps/web/CLAUDE.md`:** aplicar W01–W08; inserir N1 (§12, item 6), N2 (§7 Sidebar), N3 (nova subseção §7 "Back navigation"), N9 (§13, item 12).
4. **`apps/pwa/CLAUDE.md`:** aplicar P01–P12; inserir N10 (§5 Caching).
5. **`packages/shared/CLAUDE.md`:** aplicar S01–S10; inserir a nota de N6 (§10, item 10) e a linha curta de N13 (§10, item 11).
6. **`AGENTS.md` e `AGENT.md`:** aplicar A01/G01 (mesma linha nos dois).
6b. **Memória local:** aplicar M01 (fora do PR).
6c. **Registrar as cláusulas de transição** (L-X00-04). (i) Na descrição do PR, a tabela abaixo. (ii) No checklist de verificação de cada tarefa dona, acrescentar a linha `Remove the transition clause of rule N# from <file> in this PR (X00 L-04)`: `tarefas/X01-tarefas.md` (N2, N3), `tarefas/X02-tarefas.md` (N4), `tarefas/F03-tarefas.md` TASK-F03-1 (N6, N9), `tarefas/F04-tarefas.md` TASK-F04-1 (N5) e TASK-F04-3 (N10 "from F04"). Essas edições entram neste PR e são feitas **depois do passo 6d** (no worktree, as tarefas só existem após a cópia).

    | Regra | Arquivo | Trecho exato a remover | Tarefa dona |
    |---|---|---|---|
    | N2 | `apps/web/CLAUDE.md` §7 Sidebar | "(The group is introduced by X01; until it merges, add new panel screens to the group in the same PR that creates them.)" | X01 |
    | N3 | `apps/web/CLAUDE.md` §7 Back navigation | "`BackButton`, `backTo`, the `onBack(goBack)` contract and the `history.state.idx` criterion are introduced by X01. Until X01 merges, … X01 migrates it." | X01 |
    | N4 | `apps/backend/CLAUDE.md` §10 | "(X02 adds the `mode` option to `IGeocodingService` … do not add any new write path that stores Mapbox coordinates.)" | X02 |
    | N5 | `apps/backend/CLAUDE.md` §10 Routing | "(`IRoutingService`, created by F04)" → "(`IRoutingService`)" | F04-1 |
    | N6 | `apps/backend/CLAUDE.md` §7.1; `packages/shared/CLAUDE.md` §10.10 | "It is created by F03 (TASK-F03-1) and reused by F04–F10." / "(added by F03)" | F03-1 |
    | N9 | `CLAUDE.md` §7.9 | "Known gap until F03 (TASK-F03-1) merges: … carries a coordinate key." (manter só "add a test that fails if a `CL_*` response carries a coordinate key") | F03-1 |
    | N10 | `apps/pwa/CLAUDE.md` §5 | "from F04, " (o `api-day-plan-cache` passa a existir) | F04-3 |
    | R12 · P01 · P11 (N12) | `CLAUDE.md` §11; `apps/pwa/CLAUDE.md` §1 e §10; memória | avisos "56/56 … until X03" (Bloco R12, texto de P01, Bloco P11) e a menção à suíte quebrada na memória | X03 (L-X03-09; a linha já está no Passo 9 e no critério 13 da X03, sem edição em `X03-tarefas.md`) |

6d. **Versionar `fase2-etapa1/` e os escopos** (L-X00-01). Copiar do checkout principal para o worktree, no mesmo caminho, a pasta `fase2-etapa1/` inteira (inclui `tarefas/`, `tarefas/lacunas/`, `arquivo/`, `estacionamento.md`, `decisoes.md`) e os 3 documentos da raiz (`Escopo Completo Properfy - CLIENTE.md`, `escopo-cliente-gap-audit.md`, `escopo-pendencias-execucao.md`); `git add` explícito desses caminhos (nada de `git add -A`, para não levar os outros arquivos soltos do checkout principal: `output/`, `scripts/`, PDFs, `login.png`, propostas). Conferir que nenhum arquivo copiado tem segredo ou dado pessoal (grep por `token`, `password`, `@` de e-mail real) antes do commit. Depois do merge, o checkout principal apaga as cópias não versionadas e passa a usar as do git.
6e. **Estacionamento** (L-X00-09). Em `fase2-etapa1/estacionamento.md` (já versionado neste PR): completar o item #15 com `appointment-state-machine.ts:43` ("date has passed"; a regra real é idade de 45 dias); abrir o #17 "SAST/dependency scan no CI (hoje inexistente; CLAUDE.md corrigido pela X00, B21)"; abrir o #18 "Formatar com prettier `CLAUDE.md`, `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md`, `packages/shared/CLAUDE.md` (já falhavam em `develop`; commit `style:` isolado)" (L-X00-02).
7. Rodar o bloco "Depois de editar" e o smoke do item 3.
8. Commit `docs: refresh CLAUDE.md files and add Phase 2 rules` (sem referência a Claude/IA) para os 7 arquivos de instrução e um segundo commit `docs: track phase 2 planning folder and scope documents` para `fase2-etapa1/**` + os 3 escopos (facilita a revisão); push, PR para `develop`. Na descrição do PR: a tabela de conflitos (C01–C16) com a resolução adotada, a tabela de cláusulas de transição (6c), o resultado dos greps, a saída do prettier nos 4 arquivos que já falhavam e o texto do smoke.

### Correções por arquivo

Convenção: **ID** curto para citar no PR; "atual" é uma citação curta; textos de mais de uma linha estão nos blocos logo abaixo de cada tabela. Caminhos de evidência relativos à raiz do snapshot.

#### `CLAUDE.md` (raiz) — 23 correções

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| R01 | `CLAUDE.md:5-10` | lista de 4 pacotes do monorepo | Falta `packages/frontend-standards`, consumido por web e pwa | `packages/frontend-standards/package.json:2`; `apps/web/package.json:19`; `apps/pwa/package.json:20` | Acrescentar após a linha 10: `` - `packages/frontend-standards/` – Shared non-visual frontend standards (`cn()`, CVA conventions, constants, ESLint config) used by web and pwa `` |
| R02 | `CLAUDE.md:40-42` | "Node.js + Fastify" / "Prisma ORM + PostgreSQL" | Sem versões; o stack mudou (Node 24, Prisma 6) | `package.json:7`; `.nvmrc` = 24; `apps/backend/package.json` (`fastify ^4.28.1`, `prisma ^6.19.3`) | `- Node.js 24 + Fastify 4` / `- Prisma 6 ORM + PostgreSQL (Supabase as infrastructure)` |
| R03 | `CLAUDE.md:50` | "OpenAPI-generated client as source of truth" | Não há cliente gerado: há `openapi-fetch` tipado por `paths` gerados no shared, e o CI falha se o contrato estiver velho | `apps/web/src/services/api.ts:1-9`; `package.json:18`; `.github/workflows/ci.yml:84-112` | Ver bloco R03 |
| R04 | `CLAUDE.md:55-57` | "`staging` – VPS with Portainer" / "`prod` – Fly.io" | Os três ambientes do backend estão no Fly; os frontends na Vercel | `.github/workflows/fly-deploy.yml:3-8`; `.github/workflows/frontend-deploy.yml:1-9`; `fly.dev.toml:6-7`; `fly.staging.toml:4-5`; `fly.production.toml:6-7,13-14` | Ver bloco R04 |
| R05 | `CLAUDE.md:64` | "Workspace structure: `apps/backend`, `apps/web`, `apps/pwa`, `packages/shared`" | Falta `packages/frontend-standards`; falta o orquestrador | `pnpm-workspace.yaml`; `turbo.json`; `package.json:5` | `` - Package manager: `pnpm` 9 (`packageManager: pnpm@9.15.4`), tasks via Turborepo (`turbo run …`) `` / `` - Workspace structure: `apps/backend`, `apps/web`, `apps/pwa`, `packages/shared`, `packages/frontend-standards` `` |
| R06 | `CLAUDE.md:68-91` | bloco de comandos sem build de pacotes nem geração de contrato | Faltam os pré-requisitos que fazem typecheck/teste passar e o comando do contrato | `package.json:18`; `.github/actions/setup/action.yml:47-61`; `apps/backend/package.json` (scripts `prisma:generate`, `test:integration:db`) | Ver bloco R06 |
| R07 | `CLAUDE.md:128` | "`DRAFT` → `REJECTED` \| OP, AM" | O código também permite SYS | `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts:19-24` | Coluna Actor: `OP, AM, SYS` |
| R08 | `CLAUDE.md:130` | "`AWAITING_INSPECTOR` → `SCHEDULED` \| SYS, OP" | O código também permite AM | `appointment-state-machine.ts:33-38` | Coluna Actor: `SYS, OP, AM` |
| R09 | `CLAUDE.md:179` | "`tenant_id` is mandatory on all business entities." | Já é falso hoje: `Inspector` e `IntegrationSetting` não têm `tenant_id`; `ServiceRegion` e `NotificationTemplate` usam `tenant_id = NULL` para registros de plataforma; usuários AM/OP/INSP têm `tenantId` nulo | `apps/backend/prisma/schema.prisma` (`model Inspector`, `model IntegrationSetting:1546`); `apps/backend/src/shared/domain/require-tenant-scope.ts:3-14` | Substituir pelo texto da regra **N7** (seção "Regras novas") |
| R10 | `CLAUDE.md:183,186` | "Repositories are always scoped by tenant." / "No business query without tenant scope." | AM/OP/SYS são cross-tenant por desenho; o padrão do código é resolver o predicado por papel | `require-tenant-scope.ts:23-31,73` | Ver bloco R10 |
| R11 | `CLAUDE.md:219` | "Reminders at 7, 5, 3 days (Email)" | Também existem as variantes SMS | `packages/shared/src/constants/notification-templates.ts:33-38` | `2. Reminders at 7, 5, 3 days (Email, plus SMS variants)` |
| R12 | `CLAUDE.md:233` | "Frontend E2E: `Playwright`" | Só o E2E do web roda no CI; o do PWA está quebrado (56/56) e fora do CI | `ci.yml:205-237` (só `test-web-e2e`); `apps/pwa/tests/e2e/` (4 specs); `X03-e2e-pwa.md` | Ver bloco R12 |
| R13 | `CLAUDE.md:234` | "Coverage: `70%` global minimum, `80%+` …" | Nenhum limite de cobertura está configurado; é meta, não gate | sem `coverage`/`thresholds` em `apps/backend/vitest*.config.ts`, `apps/web/vite.config.ts`, `apps/pwa/vite.config.ts`, `packages/shared/vitest.config.ts` | `` - Coverage target (not enforced by CI today): `70%` global, `80%+` for critical modules (auth, appointments, finance) `` |
| R14 | `CLAUDE.md:235,241` | "CI gate: lint + typecheck + tests + Prisma migration validation + build" / "PR to `main`: … Prisma migration dry-run …" | Os PRs vão para `develop`; o CI roda em PR/push para main, staging e develop; não há dry-run; há gate de contrato, E2E web e integração com banco real | `ci.yml:3-7,20-392` | Ver bloco R14 (substitui §12 itens 1 e a linha 235) |
| R15 | `CLAUDE.md:242` | "After merge: deploy to `staging` → smoke test → deploy to `prod`" | O deploy é por branch, disparado pelo CI verde de cada branch; a promoção é por merge develop → staging → main; `main` também gera tag de release | `fly-deploy.yml:9-13,29-104`; `frontend-deploy.yml:10-14`; `release-tag.yml:13-17` | Ver bloco R14 |
| R16 | `CLAUDE.md:243` | "Migrations: always in `staging` first, then `prod`." | As migrations rodam no `release_command` do Fly de cada ambiente, na ordem DEV → STAGING → PROD | `fly.dev.toml:16`; `fly.staging.toml:14`; `fly.production.toml:13` | `` 3. Migrations: applied by each Fly app's `release_command` (`prisma migrate deploy`), so they reach DEV (develop) first, then STAGING, then PROD. Pattern: expand/contract. `` |
| R17 | `CLAUDE.md:244` | "Rollback: automatic by health check in prod" | Prod usa `strategy = 'rolling'` com health check; manter, só nomear o arquivo | `fly.production.toml:14` | `` 4. Rollback: rolling deploy with health check in prod (`fly.production.toml`); manual by release/tag. `` |
| R18 | `CLAUDE.md:263` | "Consult `projeto-consolidado/` for complete domain documentation" | Pasta ignorada pelo git e esvaziada; nenhum dos documentos existe | `.gitignore:4`; `ls projeto-consolidado` (só 2 arquivos não relacionados) | Ver bloco R18 |
| R19 | `CLAUDE.md:269-281` | 11 linhas `projeto-consolidado/*.md` na tabela de referências | Todas apontam para arquivos inexistentes | idem R18 | Remover as 11 linhas e pôr as do bloco R19 |
| R20 | `CLAUDE.md:282-284` | `Escopo Completo…`, `escopo-cliente-gap-audit.md`, `escopo-pendencias-execucao.md` | Não versionados: existem só no checkout principal e não aparecem em worktrees | `git ls-tree --name-only origin/develop` (ausentes) | **Não se aplica (2026-10-29, L-X00-01):** os 3 documentos e `fase2-etapa1/` passam a ser versionados neste PR (passo 6d), então as linhas da tabela §14 ficam como estão e nenhuma nota de "untracked" é escrita. Conta como correção resolvida por versionamento. |
| R21 | `CLAUDE.md:288-293` | 4 dependências externas | Faltam as plataformas de hospedagem citadas nos workflows | `fly-deploy.yml:1`; `frontend-deploy.yml:1` | Acrescentar: `` 5. Hosting: Fly.io (API, all environments) and Vercel (web + pwa, all environments) `` + bloco de provedores da regra **N5** |
| R22 | `CLAUDE.md:305` | setup do subagente: `pnpm install`, `prisma generate`, `pnpm --filter @properfy/shared build` "(web/pwa typecheck imports the built dist, not source)" | Falta o build do `@properfy/frontend-standards`. Web e pwa só resolvem esse pacote pelo `dist/` (`main`/`types` apontam para `./dist`), então num worktree novo typecheck, lint, testes e o dev server do Vite quebram. A análise da X03 aponta isso como a **causa provável da suíte E2E do PWA quebrada (56/56)**: o `pnpm dev` usado pelo Playwright não carrega o shell sem o `dist` | `packages/frontend-standards/package.json:7-20` (`main`/`module`/`types`/`exports` → `./dist/*`); `.github/actions/setup/action.yml:19-24,52-55` ("so pwa type resolution works"); `ci.yml:43,179,200,222,268` (todo job de web/pwa liga `build-frontend-standards`); `apps/pwa/playwright.config.ts:38-39` (`webServer: pnpm dev`) | Substituir o trecho exato do bloco R22 (abaixo) |
| R23 | `CLAUDE.md:412-426` | "Active Technologies" com Node 20, Prisma 5, `appointment_time_slots`, `email_assets`, `template_image_bindings`; "Recent Changes" = `002-tenants-branches` | Stack velho; as 3 tabelas citadas não existem mais no schema | `schema.prisma` (lista de models: sem `AppointmentTimeSlot`, `EmailAsset`, `TemplateImageBinding`); `package.json:7`; `apps/backend/package.json` | Ver bloco R23 (mantém os 2 cabeçalhos; ver C12) |

**Bloco R03** (substitui `CLAUDE.md:50`):

```markdown
- Typed API client: `openapi-fetch` typed by the `paths` generated into `packages/shared/src/api-types.ts` from `packages/shared/openapi.json` (`pnpm generate:api`). CI fails when the committed contract is stale (`contract-freshness` job), so regenerate and commit both files whenever a route schema changes.
```

**Bloco R04** (substitui `CLAUDE.md:55-57`):

```markdown
- `dev` – local (`docker-compose.yml`) and the DEV environment deployed from `develop` (Fly app `properfy-api-dev`, region `iad`)
- `staging` – deployed from `staging` (Fly app `properfy-api-staging`, region `syd`)
- `prod` – deployed from `main` (Fly app `properfy-api`, region `syd`), rolling deploy + health check
- Frontends (web + pwa) – Vercel, one project per environment, built in CI (`frontend-deploy.yml`)
```

**Bloco R06** (acrescentar ao fim do bloco de comandos, `CLAUDE.md:91`, antes do fecho da cerca):

```bash
# Build workspace packages consumed from dist (required before web/pwa typecheck, lint, test)
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build

# Generate the Prisma client (required before backend typecheck/tests)
pnpm --filter backend prisma:generate

# Regenerate the OpenAPI spec + typed client after any route schema change (CI checks freshness)
pnpm generate:api

# Backend real-database integration tests (testcontainers; excluded from `pnpm --filter backend test`)
pnpm --filter backend test:integration:db
```

**Bloco R10** (substitui `CLAUDE.md:183` e `:186`):

```markdown
5. Repositories accept the tenant predicate from the caller; tenant-pinned roles (`CL_ADMIN`, `CL_USER`) are always filtered by their own `tenantId`. Cross-tenant roles (`AM`, `OP`, `SYS`) legitimately read without a tenant predicate. Resolve the predicate with `requireTenantScope` / `assertTenantScope` (`apps/backend/src/shared/domain/require-tenant-scope.ts`), never with an `if (tenantId)` that silently drops the filter.
8. No business query without an explicit scope decision: tenant (pinned roles), `inspectorId` (`INSP`), portal token (`TNT`), or a documented platform-scoped entity (see rule 1).
```

**Bloco R12** (substitui `CLAUDE.md:233`):

```markdown
- Frontend E2E: `Playwright`. The web suite (`apps/web/tests/e2e`, all API calls stubbed) is a CI gate (`test-web-e2e`). The PWA suite (`apps/pwa/tests/e2e`) is **currently broken (56/56 failing on a clean `develop`) and is not run by CI**; do not treat it as evidence until X03 (`fase2-etapa1/X03-e2e-pwa.md`) restores it.
```

**Bloco R14** (substitui `CLAUDE.md:235` e os itens 1–2 da §12, `:241-242`):

```markdown
- CI gate (`.github/workflows/ci.yml`, on every PR and push to `develop`, `staging`, `main`): lint + typecheck (all four workspaces), OpenAPI ↔ api-types freshness, unit/integration tests (shared, backend, web, pwa), web E2E, Prisma schema validation, `prisma migrate deploy` twice against a fresh PostGIS database, real-database integration tests (testcontainers), and build. Node 24 only.
```

```markdown
1. **PRs target `develop`.** All CI jobs listed in §11 must be green to merge.
2. **Deploys are per branch and gated on a green CI run of that branch:** `develop` → DEV, `staging` → STAGING, `main` → PROD (backend: `fly-deploy.yml`; web + pwa: `frontend-deploy.yml`). Promotion is a merge `develop → staging → main`. A green `main` also creates the release tag (`release-tag.yml`).
```

**Bloco R18** (substitui `CLAUDE.md:263`):

```markdown
9. **Consult the code and `docs/` for domain detail** – `apps/backend/prisma/schema.prisma` (data model), `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts` (transition rules), `packages/shared/src` (contracts), `docs/` (runbooks, database, deploy). The old consolidated-docs folder is git-ignored and no longer exists; do not cite it.
```

**Bloco R19** (substitui as linhas `CLAUDE.md:271-281`):

```markdown
| `apps/backend/prisma/schema.prisma` | Data model (entities, enums, relationships) |
| `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts` | Transition rules (actors, reason, done-check) |
| `packages/shared/openapi.json` | API contract (generated; `pnpm generate:api`) |
| `docs/database-schema.md`, `docs/dev-setup.md`, `docs/fly-deploy-guide.md` | Database, local setup, deploy |
| `docs/runbooks/` | Operational runbooks (auth, queue, notifications, deploy, incidents) |
```

**Bloco R20** — removido em 2026-10-29 (L-X00-01). O texto antigo ("…are **not tracked by git**… read them through the main checkout: `git rev-parse --git-common-dir`…") **não** entra no CLAUDE.md: a pasta e os 3 escopos passam a ser versionados no próprio PR.

**Bloco R22** (dono exclusivo: X00; a X03 só confere — L-X03-09) (em `CLAUDE.md:305`, substituir o trecho que vai de "then `pnpm --filter backend exec prisma generate`" até "(web/pwa typecheck imports the built dist, not source)," por):

```markdown
then `pnpm --filter backend exec prisma generate` (backend tests fail without this — `pnpm install` alone does not run it), `pnpm --filter @properfy/shared build` and `pnpm --filter @properfy/frontend-standards build` (web, pwa and their Vite dev servers resolve both packages only through `dist/`, never source — without these builds typecheck, lint, tests and the Playwright `webServer` fail in a fresh worktree; CI builds both in `.github/actions/setup`),
```

Aplicabilidade fora da raiz:
- **`AGENTS.md` / `AGENT.md`: não se aplica.** São só ponteiros para o `CLAUDE.md` da raiz e não têm receita de setup; continuam corretos depois de R22 (só A01/G01).
- **Memória `feedback_worktree_setup_delegated_haiku`: se aplica** (correção M01). O "How to apply" lista como "dois gaps conhecidos" apenas `prisma generate` e o build do shared; falta o terceiro.

**Bloco R23** (substitui `CLAUDE.md:412-426`; mantém os dois cabeçalhos exatamente como estão):

```markdown
## Active Technologies
<!-- Appended by `speckit.plan` (update-agent-context.sh). Keep this list short: the feature PR prunes entries that are no longer true. -->
- TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo
- Backend: Fastify 4, Prisma 6 (PostgreSQL/Supabase, PostGIS in CI), Zod 3, pg-boss 9, jose (RS256 JWT), Resend, MobileMessage, Mapbox
- Web/PWA: React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3, mapbox-gl 3, openapi-fetch; PWA adds vite-plugin-pwa (Workbox), react-hook-form, lucide-react
- Tests: Vitest 1, Supertest, testcontainers, Playwright

## Recent Changes
- Phase 2 Stage 1 planning (`fase2-etapa1/`): CLAUDE.md refreshed (X00); every feature PR updates the CLAUDE.md of the workspace it changes
```

#### `apps/backend/CLAUDE.md` — 21 correções

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| B01 | `apps/backend/CLAUDE.md:20-29` | "Runtime: Node.js" … "ORM: Prisma" … "Tests: Vitest … + Supertest" | Sem versões; falta o teste com banco real | `package.json:7`; `apps/backend/package.json` (`fastify ^4.28.1`, `prisma ^6.19.3`, `pg-boss ^9.0.3`, `testcontainers ^11.14.0`) | `Runtime: Node.js 24` · `Framework: Fastify 4` · `ORM: Prisma 6` · `Queue: pg-boss 9 (…)` · `` Tests: Vitest (unit/integration) + Supertest (API) + testcontainers (real PostGIS, `test:integration:db`) `` |
| B02 | `apps/backend/CLAUDE.md:58-74` | "`pnpm prisma migrate diff` (dry-run for CI)" e lista de comandos | Não existe dry-run no CI; faltam os scripts reais | `apps/backend/package.json` (scripts); `ci.yml:283-357` | Ver bloco B02 |
| B03 | `apps/backend/CLAUDE.md:86-103` | 13 módulos, inclui `marketplace/`, `user/` … | Existem 22 módulos; `marketplace/` não existe (as rotas do marketplace ficam em `service-group/interfaces/marketplace.routes.ts`) | `ls apps/backend/src/modules`; `service-group/interfaces/marketplace.routes.ts` | Ver bloco B03 |
| B04 | `apps/backend/CLAUDE.md:104-113` | `shared/` (4 camadas) e `main/` (4 arquivos) | Faltam os pontos de entrada que toda feature usa | `src/shared/domain/audit.ts`; `src/shared/domain/require-tenant-scope.ts`; `src/shared/application/unit-of-work.ts`; `src/main/env.ts`; `src/main/workers.ts` | Ver bloco B04 |
| B05 | `apps/backend/CLAUDE.md:114-117` | `prisma/` com `schema.prisma`, `migrations/`, `seed.ts` | Migrations foram consolidadas num baseline; falta o padrão de nome | `ls prisma/migrations` (`20260806000000_v1_baseline` + 7) | `` │   ├── migrations/             # squashed to `20260806000000_v1_baseline`; new ones `YYYYMMDDhhmmss_name` (`prisma migrate dev`) `` |
| B06 | `apps/backend/CLAUDE.md:118-121` | `tests/unit`, `tests/integration`, `tests/e2e` | Não há `tests/e2e`; há `fixtures/`, `helpers/` e `integration/db/` (fora da suíte padrão); `tests/` está fora do `tsconfig` | `ls apps/backend/tests`; `vitest.config.ts` (`exclude: tests/integration/db/**`); `tsconfig.json:11` | Ver bloco B06 |
| B07 | `apps/backend/CLAUDE.md:179` | "Access token: RS256 with `kid`, TTL 15 minutes." | O padrão é 60 min, e os 3 ambientes usam 60 | `src/main/env.ts:11-12`; `fly.*.toml:22` | `` - **Access token:** RS256 with `kid`, TTL `JWT_ACCESS_TOKEN_TTL_MINUTES` (default and all environments: 60 minutes). `` |
| B08 | `apps/backend/CLAUDE.md:181` | "Claims: `userId`, `tenantId` (nullable for AM), `role`, `email`." | Os claims reais são outros; não há `email`; `tenant_id` é nulo para AM, OP e INSP | `src/modules/auth/application/services/jwt.service.ts:5-12,145-147` | `` - Claims: `sub` (user id), `tenant_id` (null for AM, OP and INSP), `role`, `branch_id`, `inspector_id`, `sid` (session id). Mapped to `AuthContext` (`userId`, `tenantId`, `role`, …). `` |
| B09 | `apps/backend/CLAUDE.md:185-191` | tabela de papéis com 5 linhas | Faltam `TNT` e `SYS`, que existem no enum e na máquina de estados | `packages/shared/src/enums/user.ts:1-9` | Acrescentar: `` \| Rental tenant \| `TNT` \| Portal token only \| `` e `` \| System \| `SYS` \| Jobs and automatic transitions (cross-tenant) \| `` |
| B10 | `apps/backend/CLAUDE.md:198` | "(see `infra-tecnologia-production-ready.md` for limits)" | Documento inexistente | `src/modules/auth/interfaces/auth.routes.ts:70,97,304` (`rateLimit`) | `` - Rate limiting on auth endpoints: per-route `rateLimit` config in `auth/interfaces/auth.routes.ts` (see `docs/runbooks/auth-and-sessions.md`). `` |
| B11 | `apps/backend/CLAUDE.md:205` | "Super Admin (AM) can specify tenant explicitly when needed." | OP e SYS também são cross-tenant | `require-tenant-scope.ts:23-31` | `` 4. Cross-tenant roles (`AM`, `OP`, `SYS`) may read without a tenant predicate or target a tenant explicitly; resolve this with `requireTenantScope(actor, action)`, which throws for pinned roles without a tenant and for `INSP`/`TNT` on tenant-dispatching paths. `` |
| B12 | `apps/backend/CLAUDE.md:227` | lista fixa de 6 códigos de erro | O código usa códigos de domínio (`AUTH_FORBIDDEN`, `TENANT_SCOPE_REQUIRED`, …) com o status vindo da classe; existem também 422, 429 e 503 | `src/shared/domain/errors.ts:3-84` | `` - Error codes are domain-specific strings (e.g. `AUTH_FORBIDDEN`, `TENANT_SCOPE_REQUIRED`); the HTTP status comes from the error class in `shared/domain/errors.ts`: `ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, 422 (unprocessable), 429 (rate limit, with `retryAfter`), 503 (storage not configured), 500 otherwise. `` |
| B13 | `apps/backend/CLAUDE.md:243,288,503` | "See `projeto-consolidado/modelo-dados-executavel.md`" / "…`state-machine-executavel.md`…" / "consult `projeto-consolidado/`" | Documentos inexistentes | `.gitignore:4` | `:243` → `` See `prisma/schema.prisma` for complete entity definitions. `` · `:288` → `` See `src/modules/appointment/domain/appointment-state-machine.ts` (`TRANSITION_RULES`) for the full transition table. `` · `:503` → `` For complete business rules, entity definitions and API contracts, see the root `CLAUDE.md`, `prisma/schema.prisma` and `packages/shared/openapi.json`. `` |
| B14 | `apps/backend/CLAUDE.md:254-274` | 19 "core entities", inclui `InspectionAsset` | `InspectionAsset` não existe mais; faltam entidades centrais (Contact, ServiceRegion, AppointmentConfirmationCycle, NotificationTemplate, …) | lista de `model` em `schema.prisma` | Ver bloco B14 |
| B15 | `apps/backend/CLAUDE.md:280-281` | "`notification_channel`: `EMAIL`, `SMS`, `WHATSAPP`" / "`notification_status`: … `FAILED`" | `WHATSAPP` não existe; faltam `SKIPPED` e `SKIPPED_OPT_OUT` | `schema.prisma:1053-1065` | `` - `notification_channel`: `EMAIL`, `SMS` `` / `` - `notification_status`: `PENDING`, `SENT`, `DELIVERED`, `FAILED`, `SKIPPED`, `SKIPPED_OPT_OUT` `` |
| B16 | `apps/backend/CLAUDE.md:345` | "Dedicated workers for: `notifications`, `imports`, `finance`" | Todos os workers são registrados num único processo, em `src/main/workers.ts` | `src/main/workers.ts:88-225` (`boss.work(...)`) | `` - Workers: all `boss.work(...)` registrations live in `src/main/workers.ts` (one worker process per app instance), wrapped with `withJobMetrics`. Recurring jobs that run per agency use `shared/application/tenant-cron-tick.ts`. `` |
| B17 | `apps/backend/CLAUDE.md:395` | "Fallback: mark `pending_geocode` for manual correction" | O estado real é o enum `GeocodingStatus` | `schema.prisma:45-50`; `src/main/workers.ts:216,225` (`property.geocode`, `property.geocode-retry`) | `` - Fallback: `GeocodingStatus` `PENDING` → `SUCCESS`/`FAILED` via the `property.geocode` and `property.geocode-retry` jobs; `MANUAL` when the user types lat/lng. `` (+ regra **N4** logo abaixo) |
| B18 | `apps/backend/CLAUDE.md:441` | "Apply migrations to `staging` first, validate, then promote to `prod`" | A ordem real é DEV → STAGING → PROD via `release_command` | `fly.dev.toml:16`; `fly.staging.toml:14`; `fly.production.toml:13` | `` - Migrations run in each Fly app's `release_command` (`prisma migrate deploy`): DEV (from `develop`) first, then STAGING, then PROD. CI proves a fresh replay plus idempotence (`prisma-migrate-check`). `` |
| B19 | `apps/backend/CLAUDE.md:451` | `fly ssh console -a properfy-prod …` | O app de produção se chama `properfy-api` (o comentário em `tsup.config.ts:19` tem o mesmo erro) | `fly.production.toml:6` | `` fly ssh console -a properfy-api -C "cd /app && node apps/backend/dist/seed-platform-notification-templates.js" `` + a linha `` Production access only on explicit request. `` |
| B20 | `apps/backend/CLAUDE.md:465` | "Coverage: 70% global minimum, 80%+ …" | Não está configurado | sem `coverage` em `apps/backend/vitest*.config.ts` | `` - Coverage target (not enforced by CI today): 70% global, 80%+ for `auth`, `appointments`, `finance` `` |
| B21 | `apps/backend/CLAUDE.md:484` | "SAST and dependency scan mandatory in CI." | Não existe job de SAST nem de dependency scan | `.github/workflows/` (só `ci.yml`, `fly-deploy.yml`, `frontend-deploy.yml`, `release-tag.yml`; nenhum CodeQL/audit) | `` - SAST and dependency scanning are **not wired into CI today** (no such job in `.github/workflows`). PRs get an automated review from CodeRabbit (`.coderabbit.yaml`). Do not claim a scan ran. `` |

**Bloco B02** (substitui `apps/backend/CLAUDE.md:58-74`):

```bash
# Generate Prisma client (required before typecheck/tests)
pnpm prisma:generate

# Create/apply a migration (dev)
pnpm prisma:migrate --name <migration_name>

# Validate the schema (CI also replays every migration twice on a fresh PostGIS DB)
pnpm exec prisma validate

# Unit / route-integration tests (default suite; excludes tests/integration/db)
pnpm test            # or test:unit / test:integration

# Real-database integration tests (testcontainers, serial)
pnpm test:integration:db

# Regenerate the OpenAPI spec (then `pnpm --filter shared generate:types`, or `pnpm generate:api` from the root)
pnpm generate:openapi

# Seed database
pnpm prisma:seed

# Build
pnpm build
```

**Bloco B03** (substitui a lista `apps/backend/CLAUDE.md:92-103`, mantendo o exemplo `auth/` das linhas 87-91):

```text
│   │   ├── app-credential/
│   │   ├── appointment/
│   │   ├── audit/
│   │   ├── billing/
│   │   ├── contact/
│   │   ├── dashboard/
│   │   ├── fy/                     # Fy agent integration (API keys, webhooks)
│   │   ├── inspector/
│   │   ├── inspector-execution/
│   │   ├── integration/            # Integrations Hub (provider config, dynamic providers)
│   │   ├── notification/
│   │   ├── pricing-rule/
│   │   ├── property/
│   │   ├── rental-tenant-portal/
│   │   ├── report/
│   │   ├── satisfaction-survey/
│   │   ├── service-group/          # includes the marketplace routes (marketplace.routes.ts)
│   │   ├── service-region/
│   │   ├── service-type/
│   │   ├── tenant/
│   │   └── user/
```

**Bloco B04** (substitui `apps/backend/CLAUDE.md:104-113`):

```text
│   ├── shared/
│   │   ├── domain/               # Errors, AuditService (audit.ts), requireTenantScope, idempotency, clock
│   │   ├── application/          # Unit of work (runInTransaction), domain event bus, tenant cron tick
│   │   ├── infrastructure/       # Prisma client, logger, pg-boss queue, metrics, circuit breaker, rate limiter
│   │   └── interfaces/           # Error handler, auth/api-key middleware, role guard, response helpers
│   └── main/
│       ├── server.ts             # Fastify server setup
│       ├── env.ts                # Zod-validated environment
│       ├── routes.ts             # Route registration
│       ├── plugins.ts            # Plugin registration
│       ├── container.ts          # Dependency injection setup
│       └── workers.ts            # pg-boss worker registration
```

**Bloco B06** (substitui `apps/backend/CLAUDE.md:118-121`):

```text
├── tests/
│   ├── unit/
│   ├── integration/              # route-level tests (Supertest, in-memory/stubbed deps)
│   │   └── db/                   # real PostGIS via testcontainers — excluded from `pnpm test`, run with `pnpm test:integration:db`
│   ├── fixtures/
│   └── helpers/
```

Acrescentar logo abaixo da árvore: `` `tests/` is outside the backend `tsconfig` include, so `pnpm typecheck` does not type-check tests; a broken test wiring shows up only when the test runs. ``

**Bloco B14** (substitui `apps/backend/CLAUDE.md:254-274`):

```markdown
**Core entities** (authoritative list: `prisma/schema.prisma`):

- Tenancy and access: `Tenant`, `Branch`, `User`, `Session`, `ApiKey`, `IntegrationSetting`
- Inspectors: `Inspector`, `InspectorAvailabilitySlot`, `ServiceRegion`, `InspectorRegion`
- Catalog: `ServiceType`, `ServicePriceRule`, `Property`, `Contact`, `AppCredential`
- Appointments: `Appointment` (state machine), `AppointmentContact`, `AppointmentRestriction`, `AppointmentConfirmationCycle`, `AppointmentImport`, `ServiceGroup`
- Execution: `InspectionExecution` (start/finish with geolocation)
- Rental tenant portal: `RentalTenantPortalToken`, `RentalTenantPortalActivity`, `SatisfactionSurvey`
- Notifications: `Notification`, `NotificationAttempt`, `NotificationTemplate`, `NotificationConsent`
- Finance: `FinancialEntry`, `InspectorInvoice`
- Audit and compliance: `AuditLog` (+ archive, retention, legal hold), `DataSubjectErasureRequest`, `IdempotencyKey`, `Report`
```

#### `apps/web/CLAUDE.md` — 8 correções

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| W01 | `apps/web/CLAUDE.md:17-25` | "Build tool: Vite" … "State: React Query + local component state" | Sem versões; falta o pacote de padrões compartilhado | `apps/web/package.json` (`react ^18.3.1`, `vite ^5.4.11`, `react-router-dom ^6.28.0`, `@tanstack/react-query ^5.90.21`, `tailwindcss ^3.4.15`, `mapbox-gl ^3.20.0`, `openapi-fetch ^0.17.0`, `@properfy/frontend-standards`) | `Build tool: Vite 5` · `Framework: React 18 + React Router 6 (data router)` · `Styling: Tailwind CSS 3` · `Maps: Mapbox (mapbox-gl 3)` · `` HTTP client: `openapi-fetch` typed by `paths` from `@properfy/shared` `` · `State: TanStack Query 5 + local component state` · `` Shared standards: `@properfy/frontend-standards` (`cn()`, constants, ESLint config) `` |
| W02 | `apps/web/CLAUDE.md:26` | "Tests: Vitest (unit) + Playwright (E2E)" | Falta dizer que o E2E é gate de CI, só Chromium e com API stubada | `ci.yml:205-245`; `apps/web/playwright.config.ts:4` | `` - **Tests:** Vitest (unit/component) + Playwright E2E (`tests/e2e`, Chromium only, every API call stubbed; a CI gate — `test-web-e2e`) `` |
| W03 | `apps/web/CLAUDE.md:56-57` | "`pnpm generate:api`" | Não existe esse script no web; ele está na raiz | `apps/web/package.json` (scripts); `package.json:18` | `` # Regenerate OpenAPI spec + typed client (run from the repo root) `` / `` pnpm generate:api `` |
| W04 | `apps/web/CLAUDE.md:67-95` | árvore de `src/` | Faltam `components/forms`, `components/import`, `config/`, `styles/`, `test-utils/`; não existem `types/` nem `assets/`; a lista de features está velha (não há `notifications/`, `billing/`) | `ls apps/web/src`, `ls apps/web/src/components`, `ls apps/web/src/features` | Ver bloco W04 |
| W05 | `apps/web/CLAUDE.md:90,103` | "services/ # API clients (generated from OpenAPI)" / "Services are generated from OpenAPI – do not create manual API clients." | Há um único cliente `openapi-fetch` (com refresh) em `services/api.ts`; nada é gerado ali | `apps/web/src/services/api.ts:1-9` | `:90` → `` │   ├── services/               # api.ts — the single openapi-fetch client (auth header + refresh) `` · `:103` → `` - **API access** goes through `services/api.ts` (typed by `@properfy/shared` `paths`) and `hooks/useApiQuery.ts` – do not create another HTTP client. `` |
| W06 | `apps/web/CLAUDE.md:308-310` | "there is no lint rule here to catch it (no `eslint-plugin-jsx-a11y`, no `axe`) — only tests will." | `jsx-a11y/recommended` está ligado e o web lint roda com `--max-warnings 0`; o que continua verdade é que o lint não prova comportamento de teclado | `.eslintrc.json:4,8,19-21`; `apps/web/package.json` (`lint … --max-warnings 0`) | `` and lint cannot catch it: `eslint-plugin-jsx-a11y` (recommended, `--max-warnings 0`) checks markup, not keyboard behaviour, and there is no `axe` run — only tests will. `` |
| W07 | `apps/web/CLAUDE.md:370,382` | "Read the frontend documentation first: `projeto-consolidado/frontend-system-spec.md`, `component-inventory.md`, …" / "consult `projeto-consolidado/…`" | Nenhum desses documentos existe | `.gitignore:4`; busca no disco sem resultado | `:370` → `` 1. **Read this file and the existing components first** – `components/` is the design system; the visual spec lives in this file (§4–§10). `` · `:382` → remover a linha |
| W08 | `apps/web/CLAUDE.md:335-347` | "## 11. Implementation order — Follow this order strictly – do not start with final pages" | Ordem de bootstrap histórica; todas as fases já foram entregues e a regra hoje confunde | os componentes das fases 0–7 existem (`components/ui`, `filters`, `data`, `layout`, `map`, `shell`) | Substituir o corpo da §11 por: `` All foundation phases (tokens → shell → primitives → filters → data → layout → map → domain components) are shipped. New pages compose the existing components; add a new primitive only when no existing one fits, and put it in `components/`, not in the feature. `` |

**Bloco W04** (substitui `apps/web/CLAUDE.md:67-95`):

```text
│   ├── app/                    # Router (router.tsx), AuthGuard, ProtectedRoute, ErrorBoundary, QueryProvider
│   ├── components/
│   │   ├── shell/              # AppShell, Sidebar, SidebarItem, SidebarSubmenu, SidebarUser(Menu), MobileDrawer
│   │   ├── ui/                 # Design system primitives (Button, Dialog, ConfirmDialog, DrawerPanel, StatusChip, Tooltip, …)
│   │   ├── forms/              # TextInput, SelectInput, DateInput, PhoneInput, AddressLookupInput, FormField, …
│   │   ├── data/               # DataTable, RowActions, EntityListCard, TableSwitch, DetailRow
│   │   ├── filters/            # FilterBar, FilterInput, FilterSelect, FilterMultiSelect, FilterSegmented, FilterDateRange, FilterTimeRange, FilterBoolean
│   │   ├── feedback/           # Snackbar, EmptyState, ErrorState, LoadingState, InfoBanner, NoPermissionState, FilterRequiredState, OfflineBanner
│   │   ├── import/             # ImportWizard steps
│   │   ├── layout/             # PageHeader, PageSectionHeader, TabsNav, FloatingTotalBar, templates
│   │   └── map/                # MapScreenLayout, MapContainer, MapMarker, MapFloatingAction, MapLassoSelect, …
│   ├── features/               # one folder per domain: analytics, appointments, apps, audit-logs, auth, availability-slots,
│   │                           # contacts, dashboard, financial, inspector-workload, inspectors, integrations, marketplace,
│   │                           # notification-consents, notification-templates, pricing-rules, properties, rental-tenant-portal,
│   │                           # reports, service-groups, service-regions, service-types, settings, tenants, users
│   ├── services/               # api.ts — the single openapi-fetch client
│   ├── hooks/                  # useAuth, useApiQuery, useUrlFilters, useGoBack, usePermissions, useSnackbar, …
│   ├── lib/                    # Helpers (format-date, status-colors, permissions, phone-mask, …)
│   ├── config/                 # env
│   ├── styles/
│   ├── test-utils/
│   └── main.tsx
```

#### `apps/pwa/CLAUDE.md` — 12 correções

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| P01 | `apps/pwa/CLAUDE.md:24` | "Tests: Vitest (unit/component) + Playwright (E2E mobile viewport)" | A suíte E2E falha 56/56 e não roda no CI | `apps/pwa/playwright.config.ts:4,20-35` (4 projetos); `apps/pwa/tests/e2e/` (4 specs); `ci.yml` (sem job de E2E do PWA); `X03-e2e-pwa.md` | `` - **Tests:** Vitest (unit/component). Playwright E2E (`tests/e2e`, 4 mobile/tablet projects) exists but is **broken (56/56 failing) and not in CI** until X03 restores it. `` |
| P02 | `apps/pwa/CLAUDE.md:67-69` | "shell/ # PwaLayout (app frame), BottomNavBar, TopBar" / "feedback/ # Snackbar, OfflineBanner, …" | Faltam `TwoPaneLayout` e `WidePaneContext`; não há `Snackbar` em `feedback/` (o snackbar é `hooks/useSnackbar.tsx`) | `ls apps/pwa/src/components/shell`, `ls apps/pwa/src/components/feedback`, `apps/pwa/src/hooks/useSnackbar.tsx` | `` │   │   ├── shell/              # PwaLayout (app frame), BottomNavBar, TopBar, TwoPaneLayout + WidePaneContext (wide master-detail) `` · `` │   │   └── feedback/           # OfflineBanner, EmptyState, LoadingState, ErrorState (snackbar: hooks/useSnackbar) `` |
| P03 | `apps/pwa/CLAUDE.md:78-79` | "hooks/ # … (useGeolocation, useOnlineStatus, useAuth, …)" / "lib/ # … distance, …" | `useOnlineStatus` não existe (é `useIsOnline`); `useGeolocation` fica em `features/execution/hooks`; `distance` é `lib/geo.ts` | `ls apps/pwa/src/hooks`; `ls apps/pwa/src/lib` | `` │   ├── hooks/                  # Shared hooks (useAuth, useApiQuery, useIsOnline, useGoBack, useMediaQuery, useSnackbar, …) `` · `` │   ├── lib/                    # Helpers (format-date, status-colors, geo, idempotency, map-bounds, …) `` |
| P04 | `apps/pwa/CLAUDE.md:82-84` | "public/ ├── manifest.json └── icons/" | Não existe `manifest.json`: o manifest é gerado pelo `vite-plugin-pwa` | `apps/pwa/vite.config.ts:12-20`; `ls apps/pwa/public` (`_headers`, `_redirects`, `icons`, `images`) | `` ├── public/                     # icons/, images/, _headers, _redirects (the web manifest is generated from vite.config.ts) `` |
| P05 | `apps/pwa/CLAUDE.md:100-102` | "`GET /v1/inspector/offers`" | O endpoint é outro | `apps/pwa/src/features/offers` (`'/v1/marketplace/offers'`, `` `/v1/marketplace/offers/${groupId}` ``) | `` - `GET /v1/marketplace/offers` – List available service group offers (`GET /v1/marketplace/offers/:groupId` for one) `` |
| P06 | `apps/pwa/CLAUDE.md:108` | "`GET /v1/inspector/schedule?date=YYYY-MM-DD`" | Falta a visão mensal usada pela agenda | `apps/pwa/src/features/schedule` (`'/v1/inspector/schedule/month'`) | acrescentar: `` - `GET /v1/inspector/schedule/month` – month overview for the calendar `` |
| P07 | `apps/pwa/CLAUDE.md:144-146` | "Profile (route `/profile`) – Inspector details, security (2FA), active sessions, install-app prompt" | O perfil virou grade de tiles com sub-rotas | `apps/pwa/src/app/router.tsx:173-182` | `` - Tile grid with sub-routes: `/profile/account`, `/profile/availability`, `/profile/documents`, `/profile/settings` (security, 2FA, sessions, install app). `/profile/edit` redirects to `/profile/account`. `` |
| P08 | `apps/pwa/CLAUDE.md:159-161` | "API requests: NetworkFirst with fallback cache" / "Critical data: Schedule for today should be aggressively cached" | Genérico; o comportamento real tem caches nomeados, TTLs, ofertas sem cache e limpeza no logout | `apps/pwa/vite.config.ts:55-75`; `apps/pwa/src/hooks/useAuth.tsx:13-28`; `apps/pwa/src/app/QueryProvider.tsx:9-10` | Ver bloco P08 |
| P09 | `apps/pwa/CLAUDE.md:218` | "Validate proximity to property location (backend validates too, but show warning in app)" | Os limites divergem: PWA 200 m, backend 500 m, só auditoria | `apps/pwa/src/features/execution/components/GeoLocationCapture.tsx:12`; `F03-eventos-de-campo.md:40` (`geolocation-distance.service.ts:26`) | `` - Proximity: the app warns above 200 m (`GeoLocationCapture.tsx`), the backend audits above 500 m. The two thresholds differ today; F03 replaces both with the `PlatformSetting` geofence radius served to the app. `` |
| P10 | `apps/pwa/CLAUDE.md:222-227` (+ `:239`) | "## 8. Evidence upload – Photos: camera capture or gallery …; Upload via signed URLs …" | Não existe upload de evidências no PWA nem modelo `InspectionAsset`; a própria UI diz que não há foto | `apps/pwa/src/features/execution/components/InProgressPanel.tsx:62`, `PreStartPanel.tsx:61`; `schema.prisma` (sem `InspectionAsset`) | Substituir a §8 por: `` There is **no evidence or photo upload** in the PWA today: finish is geolocation + timestamp only (§4.3). Attachments are Phase 2 feature F10 (on hold); do not build upload UI outside it. `` · `:239` → `` 5. **Permission denied:** geolocation permission explanation `` |
| P11 | `apps/pwa/CLAUDE.md:243-248` | "E2E (Playwright with mobile viewport): execution flow, accept offer, schedule view" | Mesma situação de P01 | idem P01 | Ver bloco P11 |
| P12 | `apps/pwa/CLAUDE.md:265,271-273` | "Consult `projeto-consolidado/`…" + 3 documentos | Inexistentes | `.gitignore:4` | `:265` → `` 10. **Business rules** (state machine, T-1) live in the root `CLAUDE.md` §5 and in `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts`. `` · `:271-273` → remover as 3 linhas |

**Bloco P08** (substitui `apps/pwa/CLAUDE.md:159-161`):

```markdown
- **Static assets:** precached at build (JS, CSS, HTML, images, fonts); Google Fonts CacheFirst
- **API requests** (`vite.config.ts` `runtimeCaching`):
  - `/v1/inspector/schedule*` → NetworkFirst, `api-schedule-cache` (24 h, 50 entries, 10 s network timeout; no `cacheableResponse` today: Workbox default `0`/`200`)
  - `/v1/inspector/appointments/*` → NetworkFirst, `api-appointment-cache` (5 min, 100 entries; no `cacheableResponse` today: Workbox default `0`/`200`)
  - `/v1/marketplace/offers` → NetworkOnly (offers are never served stale)
- **In memory:** TanStack Query `networkMode: 'offlineFirst'`, `gcTime` 24 h (`QueryProvider.tsx`)
- **Logout wipes inspector data:** every API cache name is listed in `INSPECTOR_API_CACHES` (`hooks/useAuth.tsx`) and deleted on logout together with the offline queue, so a shared device never shows the previous inspector's data. A new inspector cache MUST be added to that list.
```

**Bloco P11** (substitui `apps/pwa/CLAUDE.md:246`):

```markdown
- **E2E** (Playwright, `tests/e2e`, mobile/tablet projects, API mocked with `page.route`): **currently broken — every spec fails on a clean `develop` (56/56) and the suite is not run by CI.** Do not cite it as verification. X03 (`fase2-etapa1/X03-e2e-pwa.md`) restores it before F04-3b; until then prove PWA behaviour with Vitest component tests and a manual browser check.
```

#### `packages/shared/CLAUDE.md` — 10 correções

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| S01 | `packages/shared/CLAUDE.md:14` | "Build: tsup or tsc (emit `.d.ts` + ESM)" | É tsup, CJS + ESM + d.ts; os consumidores leem o `dist` | `packages/shared/tsup.config.ts`; `packages/shared/package.json:7-17` | `` - **Build:** tsup (CJS + ESM + `.d.ts`). web, pwa and backend typecheck resolve `@properfy/shared` from `dist/`, so **build after every change** (`pnpm --filter @properfy/shared build`). Backend Vitest aliases the source (`apps/backend/vitest.config.ts`), so backend tests can pass while typecheck still sees the old `dist`. `` |
| S02 | `packages/shared/CLAUDE.md:18-35` | comandos sem geração de tipos | Falta `generate:types` | `packages/shared/package.json` (scripts) | acrescentar: `` # Regenerate src/api-types.ts from openapi.json (prefer `pnpm generate:api` at the root) `` / `` pnpm generate:types `` |
| S03 | `packages/shared/CLAUDE.md:41-82` | árvore com `enums/appointment-status.ts`, `constants/rate-limits.ts`, `utils/validators.ts`, `types/pagination.ts` | Esses arquivos não existem; faltam `lib/`, `permissions/`, `api-types.ts`, `openapi.json` | `ls -R packages/shared/src` | Ver bloco S03 |
| S04 | `packages/shared/CLAUDE.md:119-124` | `NotificationChannel` com `WHATSAPP` | Não existe | `packages/shared/src/enums/notification.ts:1-4` | remover a linha `WHATSAPP: 'WHATSAPP',` |
| S05 | `packages/shared/CLAUDE.md:129-134` | `NotificationStatus` com 4 valores | Faltam `SKIPPED`, `SKIPPED_OPT_OUT` | `packages/shared/src/enums/notification.ts:7-14` | acrescentar `SKIPPED: 'SKIPPED',` e `SKIPPED_OPT_OUT: 'SKIPPED_OPT_OUT',` |
| S06 | `packages/shared/CLAUDE.md:151-157` | `UserRole` com 5 papéis | Faltam `TNT` e `SYS` | `packages/shared/src/enums/user.ts:1-9` | acrescentar `TNT: 'TNT',         // Rental tenant (portal token)` e `SYS: 'SYS',         // System (jobs, automatic transitions)` |
| S07 | `packages/shared/CLAUDE.md:193-195` | "`paginationParamsSchema`" / "`errorEnvelopeSchema`" | O schema se chama `paginationSchema`; `errorEnvelopeSchema` não existe (o envelope é tratado em `utils/api-error.ts`) | `packages/shared/src/schemas/pagination.ts:3`; `packages/shared/src/utils/api-error.ts:51` | `` - **Pagination:** `paginationSchema` (`page`, `pageSize`, `sortBy`, `sortOrder`); response meta: `paginationMetaSchema` (`schemas/responses.ts`) `` · `` - **Error:** the `{ error: { code, message, details } }` envelope is parsed by `utils/api-error.ts` (no exported Zod schema) `` |
| S08 | `packages/shared/CLAUDE.md:204-211` | `DRAFT: ['AWAITING_INSPECTOR', 'REJECTED', 'CANCELLED']` | O código inclui `SCHEDULED` | `packages/shared/src/constants/status-transitions.ts:3-10` | `DRAFT: ['AWAITING_INSPECTOR', 'SCHEDULED', 'REJECTED', 'CANCELLED'],` (ver Achado 4) |
| S09 | `packages/shared/CLAUDE.md:199-201,228-240` | "used by both backend (validation) and frontend" + exemplo de backend com `VALID_TRANSITIONS` | O backend **não** usa `VALID_TRANSITIONS`: valida por `TRANSITION_RULES` (atores, motivo, done-check); o mapa é usado por web e pwa para UI | `apps/backend/src/modules/appointment/domain/appointment-state-machine.ts:9`; uso de `VALID_TRANSITIONS` só em `apps/web/src/features/appointments/lib/transitions.ts` e `apps/pwa/src/features/execution/lib/execution-state-machine.ts` | `:201` → `` The valid transition map is defined here and used by the frontends (web, pwa) to decide which actions to offer. The backend authority is `TRANSITION_RULES` in `appointment-state-machine.ts` (actors, reason, done-check); keep both in sync. `` · `:228-240` → trocar o exemplo de backend por `` const parsed = createAppointmentSchema.parse(input); // transitions are validated by AppointmentStateMachine, not by VALID_TRANSITIONS `` |
| S10 | `packages/shared/CLAUDE.md:276` | "Consult `projeto-consolidado/modelo-dados-executavel.md` … `api-contratos-principais.md`" | Inexistentes | `.gitignore:4` | `` 9. **Entity definitions** live in `apps/backend/prisma/schema.prisma`; the API contract is `openapi.json` (generated — never hand-edit it or `src/api-types.ts`; run `pnpm generate:api`). `` |

**Bloco S03** (substitui `packages/shared/CLAUDE.md:41-82`):

```text
packages/shared/
├── src/
│   ├── enums/          # one file per domain (appointment.ts, notification.ts, user.ts, financial.ts, reason-codes.ts, …) + index.ts
│   ├── schemas/        # Zod schemas per domain (appointment.ts, tenant.ts — incl. tenantSettingsSchema, property.ts, …) + index.ts
│   ├── types/          # entities.ts, api.ts, auth.ts, events.ts, rental-tenant-portal.ts
│   ├── constants/      # status-transitions.ts (VALID_TRANSITIONS), notification-templates.ts, inspector-workload.ts, phone.ts, timezone.ts
│   ├── permissions/    # role-matrix.ts (RBAC matrix shared by backend and frontends)
│   ├── lib/            # appointment-transitions, marker-collision, plottable-point, rating
│   ├── utils/          # date/timezone, currency, SMS length, idempotency key, api-error, overdue, …
│   ├── api-types.ts    # GENERATED from openapi.json (pnpm generate:api) — do not edit
│   └── index.ts        # Main barrel export
├── openapi.json        # GENERATED by the backend (generate:openapi) — do not edit
├── tsup.config.ts
└── package.json
```

#### `AGENTS.md` e `AGENT.md` — 1 correção cada

Os dois já são ponteiros, estão em sincronia entre si e não duplicam conteúdo. O `speckit.plan` só atualiza o `CLAUDE.md` (`update-agent-context.sh claude`), então os ponteiros não são sobrescritos (ver Risco 3).

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| A01 | `AGENTS.md:14-17` | lista de 4 arquivos de workspace | Falta o pacote `frontend-standards` (que tem README, sem CLAUDE.md) | `packages/frontend-standards/README.md` | acrescentar `` - `packages/frontend-standards/README.md` `` |
| G01 | `AGENT.md:10-13` | idem | idem | idem | idem (mesma linha, para os dois continuarem iguais) |

#### Memória local (fora do PR) — 1 correção

Não é arquivo do repositório: aplicar no checkout local, junto do PR, para que as sessões que usam a memória não repitam o setup incompleto.

| ID | file:line | Atual | Problema | Evidência | Texto proposto |
|---|---|---|---|---|---|
| M01 | `~/.claude/projects/-Users-pedro-Code-GitHub-properfy/memory/feedback_worktree_setup_delegated_haiku.md` ("How to apply") | "Fold in [[project_worktree_practices]]'s two known gaps …: `pnpm --filter backend exec prisma generate` and `pnpm --filter @properfy/shared build`." | Mesmo gap de R22: falta o build do `@properfy/frontend-standards` | idem R22 | `` Fold in [[project_worktree_practices]]'s three known gaps the subagent must also run or its baseline will false-fail: `pnpm --filter backend exec prisma generate`, `pnpm --filter @properfy/shared build` and `pnpm --filter @properfy/frontend-standards build` (web/pwa resolve both packages only via `dist/`; missing the latter is the probable cause of the broken PWA E2E suite, see X03). `` |

### Regras novas da Fase 2

Cada regra traz o arquivo, a seção e o texto exato. Todas são **regras para o trabalho daqui para frente**: nenhuma documenta uma feature que ainda não existe; quando citam algo que outra tarefa cria (`BackButton`, `PlatformSetting`, `IRoutingService`), dizem qual tarefa cria e o que fazer até lá (ver C03/C04).

**N1 · Dashboards existentes congelados** → `apps/web/CLAUDE.md`, §12 "Decisions already closed", novo item 6 (depois da linha 362):

```markdown
6. **Existing dashboard screens are frozen (Phase 2 rule, 2026-10-27).** Do not change `DashboardPage` (`/dashboard`), `AnalyticsPage` (`/analytics`) or `InspectorWorkloadPage` (`/inspector-workload`): cards, charts, filters, `WeekSelector`, `IntegrationWarnings` and the "New Appointment" action stay as they are. If a task seems to need a change there, **stop and ask the developer explicitly**. A new requirement goes into a **new screen**. The only authorized change is X01's removal of the cross-navigation buttons from those three headers.
```

**N2 · Telas de painel no grupo Dashboard do menu** → `apps/web/CLAUDE.md`, §7 "Sidebar", depois da linha 244:

```markdown
- **Panel screens live in the `Dashboard` sidebar group** (`NAV_ITEMS` in `components/shell/Sidebar.tsx`): Overview (`/dashboard`), Analytics (`/analytics`), Workload (`/inspector-workload`), plus any new panel screen (e.g. Phase 2 "Live Day"). Children follow one canonical order (operations first, then analysis): Overview · Live Day · Inspector notices · Analytics · Workload · Inspector performance · Goals & rewards. A PR that adds a child inserts it at its position in this order (between the children that already exist), never as a placeholder; menu tests assert presence and relative order by label, never by index or count. Each child's `roles` must mirror the route's `AuthGuard` exactly. The group collapses to a plain "Dashboard" item when the user can see only one child (`collapseIfSingle`, used by this group only). Panel screens are top-level: no Back button, no cross-navigation buttons in their headers. (The group is introduced by X01; until it merges, add new panel screens to the group in the same PR that creates them.)
```

**N3 · Botão voltar em toda sub tela do web** → `apps/web/CLAUDE.md`, §7, nova subseção "Back navigation" logo depois de "Page header" (depois da linha 198):

```markdown
### Back navigation

- **Every web sub-screen has a Back button** in the top-left of its header: icon + visible text "Back" (`aria-label="Back"`), via the shared `BackButton` (or `PageHeader`'s `backTo` prop), which calls `useGoBack(parentPath)` (`hooks/useGoBack.ts`): previous in-app screen when history exists, otherwise the parent screen (first history entry: `history.state.idx === 0`, kept by `replace`, e.g. a fresh tab, a direct link or a login redirect).
- A sub-screen is any screen that is not a sidebar destination: detail, create, import and settings sub-pages. Top-level screens (sidebar items, including Analytics and Workload) have no Back button. `/notification-consents` and redirect-only routes are out of scope.
- `backTo` must be a route every role of the sub-screen can open; otherwise compute it per role. Test the direct-entry fallback with the most restricted role that opens the screen.
- Screens with unsaved changes pass `onBack(goBack)` to show the discard confirmation instead of navigating; the override receives the button's `goBack` and calls it after the user confirms. The page's own `useGoBack` and `backTo` use the same fallback constant.
- Wizard "previous step" buttons are labelled **"Previous step"**, never "Back", so they never share the header button's accessible name.
- `BackButton`, `backTo`, the `onBack(goBack)` contract and the `history.state.idx` criterion are introduced by X01. Until X01 merges, a new sub-screen uses `useGoBack(parentPath)` directly with the same icon + "Back" text; X01 migrates it.
```

**N4 · Geocodificação permanente** → `apps/backend/CLAUDE.md`, §10 "Maps/Geocoding", depois da linha 396:

```markdown
- **Every coordinate written to the database comes from permanent geocoding** (`permanent=true`, Mapbox terms). Temporary geocoding (the default mode, and the address autocomplete in `mapbox-address-lookup.service.ts`) is for display only and must never be persisted. Clients never send autocomplete coordinates (`createPropertySchema` strips them; the web branch/property forms do not post them); the backend geocodes the address in permanent mode. A latitude/longitude in an **update** body is user input: stored as `MANUAL` only when it differs from the stored pair, otherwise the current status is kept. A stored coordinate is permanent iff `geocoded_permanently_at` is set. If the account rejects permanent mode (`MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`), store no coordinate, set `FAILED` with `geocoding_failure_code`, and do not re-enqueue (the retry sweep skips coded failures). (X02 adds the `mode` option to `IGeocodingService` with `permanent` as the default; until it merges, do not add any new write path that stores Mapbox coordinates.)
```

**N5 · Provedor de rota** → `apps/backend/CLAUDE.md`, §10, nova subseção "Routing" depois de "Maps/Geocoding"; e uma linha em `CLAUDE.md` §15, depois do item 3:

```markdown
### Routing

- Provider: **Mapbox**, behind a routing port (`IRoutingService`, created by F04) with a haversine stub for tests, wired through the Integrations Hub `mapbox` config like geocoding.
- **Matrix** (`driving-traffic` up to 10 coordinates, `driving` above) is used **only to choose the stop order**. **Directions** (GA) computes the final ETAs and the geometry, **one call per leg with `depart_at`** = that leg's planned departure.
- **No beta APIs:** no Matrix `depart_at`, no Optimization API v2.
- **Server-side token only**, resolved per call from the Integrations Hub `mapbox` config (`IntegrationConfigResolver.getConfig('mapbox')`, stub when unset); `MAPBOX_ACCESS_TOKEN` is only the bootstrap default for that config, never read directly by adapters. Never expose it to the PWA — geometry reaches clients as GeoJSON from the backend.
- **Google is a measured exit, not an option.** Google Route Optimization's terms forbid using its output with a non-Google map, so switching means replacing the routing adapter **and** both route maps (PWA route and web Live Day) with Google Maps. It happens only if the measured ETA error (planned stop time vs. actual start) averages above 10 minutes over 30 days. Do not mix providers.
```

Linha para `CLAUDE.md` §15:

```markdown
5. Routing: Mapbox Matrix (stop order) + Directions with per-leg `depart_at` (ETAs, geometry); no beta APIs; Google only through the measured exit described in `apps/backend/CLAUDE.md` §10
```

(Com R21, o item de hospedagem vira o 6.)

**N6 · Configuração de plataforma × por agência** → `apps/backend/CLAUDE.md`, nova §7.1 "Configuration" no fim da §7 (depois da linha 282); e uma linha em `packages/shared/CLAUDE.md` §10, novo item 10:

```markdown
### Configuration: platform vs. agency

- **Platform-wide settings** (thresholds, radii, weights, onboarding values that apply to every agency or to inspectors) go into **`PlatformSetting`**: one row per key, value validated by the typed registry in `packages/shared` (`PLATFORM_SETTINGS_REGISTRY`), read through the `IPlatformSettingsReader` port with a short cache, written only by AM/OP via `/v1/platform-settings/:key` with an audit entry (`platform_setting.updated`, `tenantId: null`). It is created by F03 (TASK-F03-1) and reused by F04–F10. Never add an env var or a hard-coded constant for a value the operation must tune.
- **Per-agency settings** stay in `tenants.settings_json`, validated by `tenantSettingsSchema` (`packages/shared/src/schemas/tenant.ts`); add new fields as optional so existing rows keep parsing.
- A per-inspector override, when a feature needs one, lives on the inspector record and falls back to the platform value.
```

Linha para `packages/shared/CLAUDE.md` §10:

```markdown
10. **Settings schemas live here:** per-agency fields in `tenantSettingsSchema` (`schemas/tenant.ts`, always optional), platform-wide keys in the `PlatformSetting` registry (added by F03). Every key has a Zod schema and defaults that pass that schema, with tests.
```

**N7 · Entidades de plataforma sem `tenant_id`** → `CLAUDE.md` §7, substitui o item 1 (`:179`, ver R09):

```markdown
1. `tenant_id` is mandatory on every agency-owned entity (appointments, properties, contacts, branches, financial entries, attachments, field events, …). **Documented exception — platform-scoped entities** have no `tenant_id` (or a nullable one meaning "platform") because their subject is cross-tenant: `Inspector`, `IntegrationSetting`, global `ServiceRegion`s, platform `NotificationTemplate`s, and the Phase 2 `PlatformSetting`, `DayPlan`, `InspectorNotice`, reliability-index snapshots, goals and rewards. For these, scope is guaranteed by (a) RBAC: only `AM`/`OP` read or write them across inspectors; (b) `INSP` access always filtered by its own `inspectorId`; (c) `CL_*` reach them only (i) read-only, for platform **defaults without a subject** (platform `NotificationTemplate`s, used as the agency's fallback catalog), or (ii) through a projection filtered by the agency's own appointments; never any row about another inspector or another agency; (d) an integration test proving a `CL_*`/`INSP` actor cannot read another subject's rows. Every spec that adds such an entity records this exception and the scoping test.
```

Em `apps/backend/CLAUDE.md` §5 "Multi-tenant enforcement", novo item 6 (depois da linha 206):

```markdown
6. Platform-scoped entities (no `tenant_id`; list in the root `CLAUDE.md` §7.1) are guarded by role and `inspectorId`, never by an absent tenant filter. Add the scoping integration test in the same PR as the entity.
```

**N8 · 1 tarefa = 1 PR = 1 spec** → `CLAUDE.md` §13, novo item 10 (depois da linha 263):

```markdown
10. **Phase 2: 1 task = 1 PR = 1 spec.** Each task in `fase2-etapa1/tarefas/<ID>-tarefas.md` (for example `TASK-F03-1`) is the self-contained input for one `speckit.specify` run and ships as exactly one PR targeting `develop`. Do not merge two tasks into one PR or split one task across PRs without updating the task file first. Anything outside a task's minimal scope goes to `fase2-etapa1/estacionamento.md`, not into the spec.
```

**N9 · GPS do inspetor nunca exposto aos perfis CL** → `CLAUDE.md` §7, novo item 9 (depois da linha 186); repetido como regra curta em `apps/backend/CLAUDE.md` §5 (item 7) e `apps/web/CLAUDE.md` §13 (item 12):

```markdown
9. **Inspector GPS coordinates are never exposed to `CL_ADMIN` or `CL_USER`** — not in API responses, exports, the web UI, notifications, nor the audit log. Agency roles see only derived values (distance to the property, accuracy, flags). New audit entries never store the inspector's raw latitude/longitude; legacy entries are masked on read for `CL_*`. Raw inspector coordinates are visible only to `AM`/`OP` (and to the inspector). Known gap until F03 (TASK-F03-1) merges: `GET /v1/audit-logs` returns `inspection.started` metadata with raw coordinates to `CL_ADMIN` — do not add any new leak, and add a test that fails if a `CL_*` response carries a coordinate key.
```

Versão curta para `apps/backend/CLAUDE.md` §5 (item 7):

```markdown
7. Never return or audit the inspector's raw latitude/longitude to/for `CL_*` roles (root `CLAUDE.md` §7.9): expose distance, accuracy and flags only.
```

Versão curta para `apps/web/CLAUDE.md` §13 (item 12):

```markdown
12. **Never render inspector GPS coordinates for `CL_ADMIN`/`CL_USER`** (root `CLAUDE.md` §7.9). Show distance, accuracy and flags; coordinates are `AM`/`OP` only.
```

**N10 · Cache offline do plano do dia no PWA** → `apps/pwa/CLAUDE.md`, §5 "Caching", ao fim do bloco P08:

```markdown
- **Today's work must stay readable offline.** Any inspector read endpoint that the day depends on (today's schedule, appointment detail and, from F04, the day plan `GET /v1/inspector/day-plans/:date` in `api-day-plan-cache`) uses NetworkFirst with a 10 s network timeout, like the existing caches. **Required for every new inspector cache** (the two existing caches do not set `cacheableResponse` today): `cacheableResponse: { statuses: [200] }` (an error such as "not published" is never cached as data), `maxAgeSeconds` ≤ 12 h and `maxEntries` ≤ 10 unless the task says otherwise, its cache name added to `INSPECTOR_API_CACHES`, and the fixed offline copy in the UI: "Offline · showing your last saved <thing>" with cache, "You're offline. Connect to load <thing>." + Retry without. Write actions keep using the offline queue; new write actions require a connection unless their task says otherwise. Downloads (e.g. the route sheet) and AM/OP routes are never cached.
```

**N11 · Regra de manutenção** → `CLAUDE.md` §13, novo item 11; e uma frase em §17 "Document as you go":

```markdown
11. **Every PR updates the CLAUDE.md of every workspace it changes**, as a step of that same PR (Phase 2 rule, 2026-10-27): new routes, screens, entities, settings keys, jobs, caches, commands or conventions are reflected in the matching `CLAUDE.md` before the PR is opened. A PR that makes a CLAUDE.md statement false must fix it; a PR that ships something a CLAUDE.md rule marks as "introduced by <task>" / "until <task> merges" removes that transition clause. Reviewers check this like a failing test.
```

Em §17 "Document as you go", acrescentar: `` - If your change makes any CLAUDE.md statement false, fix that statement in the same PR (see §13.11). ``

O README do plano **já** tem essa regra ("Regras do dev"); não precisa de edição.

**N12 · Verdade sobre testes** → coberta por R12, P01 e P11 (E2E do PWA quebrado, com ponteiro para a X03). Não há bloco separado.

**N13 · Datas e fusos** (2026-10-29, L-X00-03) → `CLAUDE.md` §9 "API conventions", novo item ao fim da lista; e uma linha curta em `packages/shared/CLAUDE.md` §10, novo item 11:

```markdown
- **Dates and timezones.** Civil dates (`YYYY-MM-DD`) and time windows are wall-clock values in the **agency timezone** (`tenants.timezone`, default `Australia/Sydney` = `PLATFORM_TIMEZONE` in `packages/shared/src/constants/timezone.ts`); instants (`started_at`, ETAs, `created_at`) are UTC ISO strings. Convert only through the shared helpers (`zonedWallTimeToUtc`, `endOfCivilDayInTz` in `packages/shared/src/utils/timezone-date.ts`; `formatCivilDate`/`formatWallTime*` in `utils/format-display-date.ts`; backend `civilDateInTimezone` in `apps/backend/src/shared/domain/timezone-date.ts`); never `new Date('YYYY-MM-DD')`, never the browser timezone for business rules. Platform jobs ("today", cut-offs) run on `PLATFORM_TIMEZONE`. `users.timezone` (AM/OP/INSP only) is a **display** preference, never a business-rule input (except for the `DayPlan` exception below). **Exception: inspector day plans (`DayPlan`) use the inspector's timezone** (`users.timezone ?? PLATFORM_TIMEZONE`) for the plan's civil date, the 19:30 publication and the publication window, because the plan is per inspector and spans agencies; each stop's time window stays in its appointment's agency timezone. Other Phase 2 cross-tenant entities (goals) use the agency timezone of each appointment; every spec states which timezone each date field is in. Tests that depend on the timezone pin `TZ` away from Sydney.
```

Linha para `packages/shared/CLAUDE.md` §10:

```markdown
11. **Dates:** civil dates and windows are agency wall-clock (`tenants.timezone`), except inspector day plans (`DayPlan`), which use the inspector's timezone; instants are UTC; convert only with the helpers in `utils/timezone-date.ts` and `utils/format-display-date.ts` (root `CLAUDE.md` §9, "Dates and timezones").
```

### Conflitos e resolução

| ID | Regra existente | Regra nova / fato | Conflito | Resolução proposta |
|---|---|---|---|---|
| C01 | Raiz §7.1 "`tenant_id` is mandatory on all business entities" e §13.3 "always include `tenant_id` in queries" | N7 (entidades de plataforma sem `tenant_id`) + fato: `Inspector`, `IntegrationSetting` já não têm | Contradição direta; uma sessão seguindo §7.1 adicionaria `tenant_id` a `DayPlan` | Reescrever §7.1 com a exceção documentada e os 4 mecanismos de escopo (N7); §7.5/§7.8 passam a "decisão explícita de escopo" (R10); §13.3 vira: `` 3. **Maintain multi-tenant safety** – make an explicit scope decision on every query (§7.5, §7.8); never let a missing tenant silently remove the filter. `` |
| C02 | N1 "dashboards existentes não são alterados" | X01 remove os botões de cluster dos 3 cabeçalhos e move as telas para o menu | Pareceria que o X01 viola a regra | O texto de N1 nomeia a remoção do X01 como **única exceção autorizada** |
| C03 | Plano X00: "não documentar features que ainda não existem" | N2/N3 citam o grupo Dashboard e o `BackButton`, que só o X01 cria | Documentar algo inexistente | N2/N3 são escritas como **regras** com cláusula de transição ("introduced by X01; until it merges…"). O PR do X01 remove a cláusula (regra N11) |
| C04 | Mesmo princípio | N4/N5/N6/N9 citam `IGeocodingService` com `mode`, `IRoutingService`, `PlatformSetting`, máscara do audit-log (X02, F04, F03) | Idem | Mesma técnica: regra + tarefa dona + o que fazer até lá. Cada tarefa dona apaga a cláusula de transição no próprio PR |
| C05 | N9 "GPS nunca exposto ao CL" | Fato: `list-audit-logs.use-case.ts:74` dá acesso ao CL_ADMIN e devolve `metadataJson` sem máscara; `start-inspection.use-case.ts:176` grava lat/lng | A regra seria falsa no dia do merge | N9 registra o **gap conhecido** e a tarefa que o fecha (TASK-F03-1); proíbe novos vazamentos e pede teste de não vazamento |
| C06 | PWA §8 "Evidence upload" (fotos, URLs assinadas) | F10 (anexos) em espera; nada disso existe | Uma sessão poderia "completar" um upload inexistente fora da F10 | P10 apaga a §8 e diz que anexos são a F10, em espera |
| C07 | Raiz §11 "Frontend E2E: Playwright" e PWA §10 "E2E … execution flow, accept offer" | Suíte do PWA 56/56 vermelha e fora do CI (X03) | Sessões citariam o E2E do PWA como verificação | R12/P01/P11 dizem a verdade e apontam para a X03; a X03 atualiza o texto ao terminar |
| C08 | Raiz §14 cita `escopo-*.md`; N8 cita `fase2-etapa1/tarefas/` | Esses arquivos não são versionados e não existem nos worktrees (§16 manda trabalhar em worktree) | A regra aponta para um caminho que a sessão não enxerga | **Resolvido por versionamento (2026-10-29, L-X00-01):** este PR adiciona `fase2-etapa1/**` e os 3 `escopo-*.md` no caminho atual (passo 6d); R20 e a frase "untracked" de N8 saem |
| C09 | Raiz §13.9, backend §7/§8/§15, web §13.1, pwa §11.10, shared §10.9 mandam consultar `projeto-consolidado/` | A pasta não existe | Instrução impossível; sessões perdem tempo ou inventam conteúdo | R18/R19, B13, W07, P12, S10 trocam por fontes que existem (schema, state machine, `openapi.json`, `docs/`) |
| C10 | Raiz §15 "Maps and geocoding: Mapbox" | N5 menciona o Google como saída | Uma sessão poderia propor Google como alternativa livre | N5 diz que o Google só entra pelo gatilho medido e trocando os dois mapas; nunca misturar provedores |
| C11 | Raiz §16 "Skip worktrees only for … CLAUDE.md updates" | N11: cada feature atualiza CLAUDE.md no próprio PR | Nenhum conflito real: dentro de uma feature a edição já acontece no worktree da feature | Sem mudança; registrar no PR que a exceção da §16 vale só para PRs **só** de CLAUDE.md |
| C12 | Raiz "Active Technologies"/"Recent Changes" (stale) | O `speckit.plan` (`update-agent-context.sh claude`) escreve nessas seções e as **recria no fim do arquivo** se não existirem | Apagar as seções não resolve: o próximo `speckit.plan` as traz de volta, fora de lugar | Manter os dois cabeçalhos com conteúdo verdadeiro e um comentário HTML pedindo poda (bloco R23); N11 obriga o PR da feature a podar entradas falsas |
| C13 | PWA §5 "Strategy: `generateSW`" | O F02/F04 planeja `injectManifest` (`src/sw/runtime-caching.ts`, `src/sw/push-handlers.ts`) | Ficará falso quando o F02 entrar | Hoje é verdade (`vite.config.ts:10`, sem `strategies`): manter. O PR do F02 atualiza a §5 (N11). Registrado como Achado 5 |
| C14 | Web §10.7 "no `eslint-plugin-jsx-a11y`" | `.eslintrc.json:4,8` liga o plugin; lint web com `--max-warnings 0` | Regra baseada em fato falso pode levar alguém a "adicionar" o plugin ou a ignorar avisos | W06 corrige o fato e mantém a mensagem (lint não prova teclado) |
| C15 | N3 "todas as sub telas têm voltar" | Decisões do X01: Analytics/Workload sem voltar; `/notification-consents` fora; `/settings/*` volta para `/dashboard`; TenantDetail com fallback por papel | Uma leitura literal poria voltar em telas de topo | N3 define sub tela e lista as exceções; os fallbacks específicos ficam no X01 (não no CLAUDE.md); só a regra geral "`backTo` abre para todos os papéis da sub tela, senão por papel" entra em N3 (L-X01-08) |
| C16 | Shared §6 "VALID_TRANSITIONS … used by backend (validation)" | Backend usa `TRANSITION_RULES`; o mapa tem `DRAFT → SCHEDULED`, que `TRANSITION_RULES` não tem | Duas fontes de verdade divergentes | S08/S09 descrevem o estado real e mandam manter as duas em sincronia; a divergência de código vai para Achados (Achado 4), fora do escopo deste PR |

### Casos de borda

- **Prettier nos 4 arquivos que já falham** (L-X00-02): o check deles continua vermelho depois do PR; não é regressão. Regressão é qualquer aviso novo em `AGENTS.md`, `AGENT.md` ou `apps/pwa/CLAUDE.md`. Se a X03 (ou outra tarefa) reformatar algum desses arquivos antes, rebasear e reaplicar por trecho citado.
- **Prettier sem `pnpm install`**: se o checkout principal também não tiver `node_modules/.bin/prettier`, rodar `pnpm install --filter . --ignore-scripts` só na raiz do worktree; nunca instalar o monorepo inteiro para isso.
- **Pasta versionada com arquivo grande ou binário** (L-X00-01): `fase2-etapa1/` tem ~33 arquivos / 1,7 MB, todos `.md`; se aparecer binário (PDF, imagem) ou arquivo > 1 MB, não versionar e registrar no PR. O total do PR fica ≤ 150 arquivos.
- **`fase2-etapa1/` mudou no checkout principal entre a cópia e o merge** (outras sessões continuam editando o plano): antes do push, recopiar e conferir com `diff -r` contra o checkout principal; depois do merge, as edições do plano passam a ser commits normais.
- **Smoke influenciado pela memória local** (L-X00-08): se a sessão não puder ser iniciada sem memória, a resposta só vale se citar arquivo e seção do CLAUDE.md; resposta sem citação = smoke inconclusivo, registrado como tal (não bloqueia o PR).
- **Tarefa dona já mergeada antes da X00** (L-X00-04): se X01/X02/F03-1/F04 entrar antes, a cláusula de transição da regra correspondente **não** é escrita (a regra entra já no estado final) e a linha do checklist da tarefa dona é dispensada.
- **X03 mergeada antes da X00** (L-X03-09): a X03 terá aplicado o Bloco R22 literalmente e o E2E do PWA já é gate (`test-pwa-e2e`). Então R22 vira só conferência, e R12/P01/P11 **não** gravam os avisos "56/56 … until X03": entram já no estado final que a X03 define ("a CI gate (`test-pwa-e2e`)"). M01 perde a frase "probable cause of the broken PWA E2E suite".
- **X01 mergeado antes da X00** (L-X01-01/03/08): N2 e N3 entram sem cláusula de transição (borda de L-X00-04), descrevendo `history.state.idx`, `onBack(goBack)` e a ordem canônica como estado atual; conferir no `useGoBack.ts` e no `NAV_ITEMS` do `develop`.
- **Fuso numa entidade multi-agência** (N13): `DayPlan` com paradas de agências em fusos diferentes usa o fuso da agência de cada appointment para as janelas das paradas; a data civil do plano, a publicação das 19:30 e a janela de publicação seguem o **fuso do inspetor** (exceção de N13, decisão do dev de 2026-10-29, confirmada na F04 D14 / L-F04-02). A plataforma é Sydney-only hoje, então na prática nada muda agora.

### Fora do escopo

- Qualquer mudança de código, inclusive os comentários desatualizados encontrados em código (`tsup.config.ts:19` com `properfy-prod`; `ci.yml:279` citando `pages-deploy.yml`; `ci.yml:314` "all 51 migrations"; `appointment-state-machine.ts:43` "date has passed" quando a regra é 45 dias de idade). Vão para Achados.
- Corrigir a divergência `VALID_TRANSITIONS` × `TRANSITION_RULES` (`DRAFT → SCHEDULED`).
- Reescrever os arquivos inteiros, mudar o tom ou a ordem das seções.
- Conferir regras de negócio que não têm afirmação técnica verificável (regras financeiras §8, regras de notificação além dos códigos, janela de deploy "09:00 Brazil"). Ficam como estão.
- Documentar telas, rotas, entidades ou caches da Fase 2 além das regras N1–N11; cada feature faz isso no próprio PR (N11).
- Criar `CLAUDE.md` para `packages/frontend-standards` (o README basta; A01/G01 apontam para ele).
- Reformatar com prettier os 4 CLAUDE.md que já falham em `develop` (vai para o `estacionamento.md`, item #18; L-X00-02).
- Aplicar `cacheableResponse: [200]` aos caches existentes do PWA (código; fica no PR da F02-3; L-X00-10).
- Mover `fase2-etapa1/` para outro caminho (por exemplo `docs/phase2/`): a pasta é versionada no caminho atual para que N8 e todas as tarefas continuem válidas.

### Critérios de aceite

1. As 77 correções (R01–R23, B01–B21, W01–W08, P01–P12, S01–S10, A01, G01, M01) foram aplicadas, ou cada uma que não foi tem o motivo na descrição do PR.
2. O bloco "Depois de editar" passa: nenhuma ocorrência de `projeto-consolidado`, `Portainer`, `properfy-prod`, `Node.js 20`, `Prisma 5`, `WHATSAPP`, `migrate diff` nos `CLAUDE.md`; cada uma das 13 frases-chave das regras N1–N13 (inclui "Dates and timezones" e "removes that transition clause") aparece no arquivo esperado; os textos antigos de N4/N5/N7/N8 e de R20 ("not tracked by git", "The folder is untracked") não aparecem.
3. `## Active Technologies` e `## Recent Changes` continuam existindo na raiz, com conteúdo verdadeiro (Node 24, Prisma 6).
4. `AGENTS.md` e `AGENT.md` listam os mesmos arquivos.
5. O PR não introduz novos avisos de prettier: `prettier --check` continua passando em `AGENTS.md`, `AGENT.md` e `apps/pwa/CLAUDE.md`; os outros 4 já falhavam em `develop` e a saída do check deles está registrada na descrição do PR (L-X00-02).
6. A descrição do PR traz a tabela C01–C16 com a resolução adotada, a tabela de cláusulas de transição (passo 6c) e o texto do smoke de leitura (pergunta, resposta e trechos citados; evidência, não gate — L-X00-08).
7. O diff toca **só** os 7 arquivos de instrução + `fase2-etapa1/**` + os 3 `escopo-*.md` da raiz: `git diff --stat` excluindo esses dois grupos → 7 files; `git ls-files fase2-etapa1 | wc -l` ≥ 33; total ≤ 150 arquivos (L-X00-01).
8. `fase2-etapa1/tarefas/X01-tarefas.md`, `X02-tarefas.md`, `F03-tarefas.md` (TASK-F03-1) e `F04-tarefas.md` (TASK-F04-1, TASK-F04-3) têm a linha "Remove the transition clause of rule N# …" no checklist (L-X00-04).
9. `fase2-etapa1/estacionamento.md` tem o #15 completado com `appointment-state-machine.ts:43` e os novos #17 (SAST/dependency scan) e #18 (prettier dos 4 CLAUDE.md) (L-X00-09, L-X00-02).
10. N3 usa o critério `history.state.idx === 0`, o contrato `onBack(goBack)` e a regra de `backTo` por papel; N2 traz a ordem canônica do grupo Dashboard; o texto `location.key === 'default'` não aparece em `apps/web/CLAUDE.md` (L-X01-01/03/08).
11. A tabela de cláusulas (passo 6c) registra a X03 como dona da reversão dos avisos "56/56" (R12, P01, P11, memória); R22 está aplicado por este PR (L-X03-09).

### Riscos

1. **Deriva até o merge.** O `develop` anda rápido (merges diários). Se `origin/develop` não estiver mais em `042a9674`, os números de linha mudam e alguma afirmação pode ter mudado de novo. Mitigação: rodar o bloco "Antes de editar" e ajustar; aplicar por trecho citado, não por número de linha.
2. **Regras com cláusula de transição esquecidas.** N2, N3, N4, N5, N6, N9 e N10 têm "until X merges" / "from X". Se as tarefas donas não apagarem a cláusula, ela vira mentira. Mitigação: frase genérica em N11 + tabela do passo 6c + linha no checklist de X01, X02, F03-1, F04-1 e F04-3, gravada neste PR (L-X00-04). Os avisos "56/56 … until X03" (R12, P01, P11) seguem a mesma regra, com a X03 como dona (L-X03-09).
3. **Ponteiros sobrescritos.** O `update-agent-context.sh` sem argumento, ou com `codex`/`opencode`, reescreveria o `AGENTS.md` com entradas de stack. Hoje o `speckit.plan` passa `claude`. Mitigação: não rodar o script com outro agente; se rodar, restaurar o ponteiro.
4. **Tamanho dos arquivos.** As regras novas somam ~70 linhas; o `CLAUDE.md` da raiz já tem 426. Mitigação: texto denso, sem exemplos longos; as regras de backend/web/pwa ficam nos arquivos de workspace, a raiz só recebe as transversais.

### Dias · Branch · Verificação

| | |
|---|---|
| **Dias** | **1,25** = 0,5 aplicar R/B/W/P/S/A/G/M (77 trechos com texto pronto) + 0,5 inserir N1–N13 (N13 nova; N4, N5, N7, N8, N10, N11 reescritas), reconferir C01–C16, tabela e checklists das cláusulas de transição, versionar `fase2-etapa1/` + 3 escopos, editar `estacionamento.md` + 0,25 greps, prettier (só não-regressão), smoke de leitura, PR. Os alinhamentos de 2026-10-29 com X01 (N2 ordem canônica, N3 `idx`/`onBack(goBack)`/`backTo` por papel) e X03 (dono de R22, reversão dos avisos "56/56") são texto pronto e cabem nos 0,5 das regras novas |
| **Branch** | `docs/claude-md-phase2-review` a partir de `origin/develop` (worktree leve, sem `pnpm install`; prettier pelo checkout principal) |
| **Commit** | `docs: refresh CLAUDE.md files and add Phase 2 rules` + `docs: track phase 2 planning folder and scope documents` (Conventional Commits, sem referência a Claude/IA) |
| **PR** | para `develop`; 7 arquivos de instrução + `fase2-etapa1/**` + 3 `escopo-*.md` (≤ 150 arquivos); descrição com C01–C16, tabela de cláusulas de transição, saída dos greps, prettier dos 4 arquivos já vermelhos e texto do smoke |
| **Verificação** | blocos "Antes de editar" e "Depois de editar" desta tarefa; `prettier --check` só nos 3 arquivos que passam hoje; smoke de leitura numa sessão nova (evidência). O CI do PR roda normalmente (nenhum job depende desses arquivos; um vermelho seria problema preexistente de `develop`) |

---

## Achados para revisão

1. ~~`fase2-etapa1/` e os documentos de escopo não são versionados~~ — **decidido em 2026-10-29 (L-X00-01):** versionados neste PR, no caminho atual (passo 6d).
2. **`projeto-consolidado/` sumiu** (no `.gitignore` e esvaziado; nenhum dos 14 documentos existe no disco). Se o conteúdo ainda for necessário (escopo v2, contratos, decisões internas), ele precisa ser recuperado de algum backup; caso contrário, as 12 referências são simplesmente removidas por esta tarefa.
3. **Job de E2E do PWA inexistente no CI** — já absorvido pela X03 (`X03-tarefas.md`, decisão de 2026-10-28 "O job de E2E do PWA não existe no CI e é criado aqui", +0,25). Nada a acrescentar pela X00 (L-X00-09).
4. **Divergência de código `VALID_TRANSITIONS` × `TRANSITION_RULES`** (`DRAFT → SCHEDULED`) — já registrada no `estacionamento.md` #14 ("Aberto como tarefa separada"). Nada a acrescentar pela X00 (L-X00-09).
5. **O F02 vai trocar o service worker do PWA para `injectManifest`** (as tarefas F02/F04 já citam `src/sw/runtime-caching.ts`). O `apps/pwa/CLAUDE.md` §5 diz `generateSW`, o que é verdade hoje; o PR do F02 precisa atualizar a §5 e o bloco P08 (regra N11). Vale um item explícito no checklist da tarefa do F02 (ver "Ajustes necessários em outras tarefas").
6. **Comentários desatualizados em código e CI** — já registrados no `estacionamento.md` #15 (`properfy-prod`, `pages-deploy.yml`, "51 migrations"). A X00 **completa** o #15 com `appointment-state-machine.ts:43` ("date has passed", a regra real é idade de 45 dias) e **abre** o #17 "SAST/dependency scan no CI" (a afirmação "SAST and dependency scan mandatory in CI" era falsa; B21). Ambos no passo 6e (L-X00-09).

## Ajustes necessários em outras tarefas (para reconciliar)

- `tarefas/X01-tarefas.md` — checklist de verificação: "Remove the transition clause of rules N2, N3 from `apps/web/CLAUDE.md` in this PR (X00 L-04)". Por quê: L-X00-04. (encaminhado: X01 P7.1)
- `tarefas/X02-tarefas.md` — checklist: "Remove the transition clause of rule N4 from `apps/backend/CLAUDE.md`"; e conferir que o texto final de N4 (L-X00-07) bate com as decisões 1, 2, 6, 8, 9 da X02. Por quê: L-X00-04, L-X00-07.
- `tarefas/F03-tarefas.md` (TASK-F03-1) — checklist: remover as cláusulas de N6 (`apps/backend/CLAUDE.md` §7.1, `packages/shared/CLAUDE.md` §10.10) e de N9 (`CLAUDE.md` §7.9, "Known gap until F03…"). Por quê: L-X00-04.
- `tarefas/F04-tarefas.md` (TASK-F04-1 / TASK-F04-3) — checklist: remover "created by F04" de N5 e "from F04" de N10; o adaptador de rota lê o token só via `IntegrationConfigResolver.getConfig('mapbox')`; confirmar o fuso do `DayPlan` multi-agência segundo N13. Por quê: L-X00-04, L-X00-06, L-X00-03. (fuso do `DayPlan` resolvido 2026-10-29: exceção de N13, fuso do inspetor; F04 D14 / L-F04-02 confirmados)
- `tarefas/F02-tarefas.md` (TASK-F02-3) — ao reescrever `src/sw/runtime-caching.ts`, aplicar `cacheableResponse: { statuses: [200] }` a `api-schedule-cache` e `api-appointment-cache` e atualizar P08/§5 do `apps/pwa/CLAUDE.md` (inclui `injectManifest`). Por quê: L-X00-10 (+ Achado 5).
- `estacionamento.md` — completar #15 com `appointment-state-machine.ts:43`; novos #17 (SAST/dependency scan) e #18 (prettier dos 4 CLAUDE.md); feito no PR da X00, passo 6e. Por quê: L-X00-09, L-X00-02.
- `README.md` — X00 passa de 1,0 para 1,25 dia: atualizar "Total de desenvolvimento" (110,25 → 110,5; "+1,25 do X00") e a linha da onda 0 ("versiona `fase2-etapa1/` e os 3 `escopo-*.md`"). Por quê: L-X00-01, L-X00-03, L-X00-04.
- `tarefas/F06-tarefas.md`, `tarefas/F08-tarefas.md` (e F00/F07) — cada spec declara o fuso de cada campo de data conforme N13 (agência para datas civis/janelas, `PLATFORM_TIMEZONE` para jobs, `users.timezone` só exibição). Por quê: L-X00-03.
