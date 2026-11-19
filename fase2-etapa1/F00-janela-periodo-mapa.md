# F00 · Janela de período do mapa

| | |
|---|---|
| **Contrato** | E.1, E.2 (critérios E.A1, E.A2) |
| **Esforço** | **3,0 dias** · dificuldade **B** (2,25 + 0,75 das lacunas L-F00-01/04/05/07, 2026-10-29) |
| **Status** | Decisões fechadas em 2026-10-27 (Q15, Q20, multiagência); lacunas L-F00-01..10 aplicadas em 2026-10-29 (detalhe em `tarefas/F00-tarefas.md`) — pronto para spec |
| **Depende de** | – |
| **Bloqueia** | – |
| **Decisões** | Q6 (pendente, só redação do contrato), Q15 ✅, Q20 ✅ |

## Objetivo

Hoje o `/map` abre com todos os appointments. A feature reduz o ruído: o mapa passa a abrir mostrando só o período de **hoje até +N dias** (N = 14 por padrão), com N configurável por agência.

## Estado atual (verificado @042a9674)

- **Rota e perfis:** `/map` atende AM/OP/CL_ADMIN/CL_USER (`apps/web/src/app/router.tsx:186-193`, `Sidebar.tsx:36`).
- **Filtros padrão sem data:** `DEFAULT_APPOINTMENT_FILTERS` e `DEFAULT_GROUP_FILTERS` têm `dateFrom/dateTo: ''` (`AppointmentMapFilterPanel.tsx:45,54-55,62,74-75`).
- **Armadilha:** `hooks/useAppointmentMapData.ts:59-62` exporta um `DEFAULT_MAP_FILTERS` que está **morto**. Não é ele que deve ser editado.
- **Parâmetros de data diferem por modo:** appointments envia `fromDate/toDate` (`AppointmentMapPage.tsx:387-388`); grupos envia `scheduledDateFrom/To` (`:428-429`).
- **Backend sem janela padrão:** `appointment-list-scope.ts:31-38` usa `requireTenantScope` (CL fica preso ao próprio tenant). Esse escopo é compartilhado com a lista e a exportação, então **não** colocar a janela padrão nesse caminho.
- **Settings da agência:** `tenantSettingsSchema` (`packages/shared/src/schemas/tenant.ts:21-87`) é `.passthrough()`. O deep merge e a auditoria `tenant.updated` antes/depois estão em `update-tenant.use-case.ts`. `CL_ADMIN_SETTINGS_ALLOW_LIST` (`:24-31`) também vale para a OP.
- **Admin quase sem settings:** o `TenantFormDrawer` expõe só `rentalTenantNotificationsEnabled`.
- **Quem acessa o cadastro de agências:** `/tenants` é AM/OP; `/tenants/:id` é AM/OP/CL_ADMIN (`router.tsx:386-396`).
- **Allow-list é compartilhada:** `CL_ADMIN_SETTINGS_ALLOW_LIST` (`update-tenant.use-case.ts:24-31`, aplicada em `:98` para `CL_ADMIN || OP`). Por isso colocar a chave nela também liberaria o CL_ADMIN.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Padrão × limite (Q15) | **Misto.** AM/OP abrem com a janela e podem removê-la pelo chip. CL tem a janela fixa, sem chip. |
| Início da janela | **Hoje → hoje+N.** Atrasados só aparecem quando AM/OP removem a janela. |
| Quem edita (Q20) | **AM e OP.** CL_ADMIN **não** edita. **Ampliação de RBAC aprovada (2026-10-27):** hoje a OP recebe 403 em qualquer PATCH de agência (`actor.tenantId` nulo ≠ agência). Entra um caminho próprio da OP que **só permite `mapWindowDays`** (`OP_EXTRA_SETTINGS_KEYS`), em qualquer agência; o resto continua bloqueado (+0,25 dia). CL_ADMIN enviando `mapWindowDays` segue o comportamento das outras chaves: **descartado em silêncio** (200), sem 403. |
| Várias agências | **Padrão de plataforma (14).** Sem agência filtrada vale 14; com uma agência filtrada vale o `mapWindowDays` dela. CL usa sempre o da própria agência. |
| Indicador fora do painel (2026-10-29, L-F00-01) | O painel de filtros nasce fechado, então além do chip no painel há um indicador **fora** dele, ao lado do botão de filtros: AM/OP → o mesmo chip removível; CL → rótulo estático sem ✕. Com a janela removida, nada aparece fora do painel. |
| Cópia (2026-10-29, L-F00-03) | Hoje..hoje+N tem N+1 dias civis; a cópia passa a ser `Today + {N} days` (não "Next N days"). Difere de propósito do preset retrospectivo da F09. |
| GET da agência lento/com erro (2026-10-29, L-F00-04) | `retry: false` na leitura do mapa (fallback 14/Sydney na primeira falha); enquanto a janela não resolve, `Loading…` no lugar da contagem. |
| Edição manual (2026-10-29, L-F00-05, L-F00-07) | Entrada única de mudança de filtros: troca de agência recalcula e nunca desliga a janela; mudar datas é edição manual (AM/OP desligam; CL clampa no `onChange`, com texto de ajuda do período); outros filtros não mexem na janela. |
| Auditoria de PATCH sem mudança (2026-10-29, L-F00-06) | Guarda estreita: só não audita quando nada sobra para gravar após o filtro de permissão; valores iguais aos atuais continuam gravando e auditando. O "Save" do drawer fica desabilitado sem alteração. |

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| E.1a | Transformar os filtros padrão em funções `buildDefault*Filters(windowDays, today)`. Data inicial = hoje (fuso da agência). Data final = hoje + N. **Limpar** volta para a janela, não para vazio. Vale nos dois modos. Entrada única `onFiltersChange` (troca de agência × edição manual × outros filtros, L-F00-07) e `Loading…` enquanto a janela não resolve (L-F00-04). | B | 1,0 | – |
| E.1b | Chip `Today + N days ✕` visível **só para AM/OP**; remover limpa as datas. Para CL a janela é aplicada no front (clamp no `onChange` + texto de ajuda do período, L-F00-05) e o chip removível não aparece. **Indicador fora do painel** (L-F00-01): removível para AM/OP, rótulo estático para CL, visível com o painel fechado. **Sem limite no servidor:** o CL já vê esses mesmos appointments na lista e na exportação, então um corte no servidor só para o mapa não protege nenhum dado e só adiciona código. | B | 0,75 | E.1a |
| E.2 | Criar a chave `mapWindowDays` (int 1–90, padrão 14) no `tenantSettingsSchema`. No backend, separar uma allow-list **só da OP** (`OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']`) somada à atual, para que o CL_ADMIN continue sem acesso. Teste: OP grava; quando o CL_ADMIN envia essa chave, ela é descartada em silêncio, como as demais (200, sem mudança e sem auditoria). No web, campo "Map window (days)" no `TenantFormDrawer`, visível para AM/OP. A auditoria `tenant.updated` já existe. | B | 0,75 | – |
| QA | Testes de unidade dos builders, teste do clamp para CL, smoke no browser com os 4 perfis. | – | 0,25 | – |

Total: 2,75 dias da tabela + 0,25 da ampliação restrita do RBAC da OP = **3,0 dias**.

**AM/OP sem agência selecionada:** usar o padrão 14, que é constante de plataforma. Com uma agência selecionada, usar o `mapWindowDays` dela.

## Fora do escopo

- Aplicar a janela na lista, na exportação ou em relatórios (o contrato exclui).
- Recortes por outros critérios.
- Persistir os filtros do mapa.

## Critérios de aceite → como provar

- **E.A1:** ao abrir o mapa, nenhum perfil vê inspeções fora de hoje..+N. O CL não tem como remover a janela. Provar com teste de componente por perfil + smoke.
  - Remover a janela é uma ação explícita de AM/OP. A spec deve citar isso como interpretação do E.A1 aprovada em 2026-10-27.
  - **E.A1-5 (L-F00-01):** com o painel de filtros fechado, o indicador da janela é visível para os 4 perfis (AM/OP removível; CL estático). Com a janela removida, nada aparece fora do painel.
  - **E.A1-6 (L-F00-04):** enquanto o GET da agência não resolve, o painel mostra `Loading…` (nunca `0 appointments`); falha do GET libera o mapa com 14/Sydney na primeira resposta, sem retry.
  - **E.A1-7 (L-F00-07):** mudar status, branch, time ou search não desliga a janela; trocar a agência com a janela ligada não a desliga.
- **E.A2:** alterar `mapWindowDays` (por AM ou OP) gera `tenant.updated` com antes/depois. Provar com o teste existente do padrão + um caso novo; o CL_ADMIN tem a chave descartada em silêncio, sem mudança e sem auditoria. Um PATCH em que nada sobra para gravar após o filtro de permissão não grava auditoria; valores iguais aos atuais continuam gravando e auditando, como hoje (decisão de 2026-10-27, guarda estreita confirmada em 2026-10-29, L-F00-06).

## Riscos e armadilhas

- `deepMerge` não remove chaves, então "voltar ao padrão" precisa ser um valor explícito.
- Usar a data no fuso da agência (`civilDateInTimezone`), não a do browser.
- `AppointmentMapPage.tsx` tem 1,5 mil linhas. A lógica nova vai para um hook/arquivo novo, não para dentro dele.

## Quebra em PRs

Um PR (shared + backend + web, ~8 arquivos).
