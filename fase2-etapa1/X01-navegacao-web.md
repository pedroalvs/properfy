# X01 · Navegação do web (menu Dashboard + botão voltar)

| | |
|---|---|
| **Contrato** | **Fora do Anexo I.** Pedido do dev em 2026-10-27, necessário para dar acesso às telas novas sem mexer nas telas de dashboard. |
| **Esforço** | **1,75 dia** · dificuldade **B** |
| **Depende de** | – (fazer **antes** de F02, F05, F07 e F08, que penduram itens neste menu) |
| **Bloqueia** | Os itens de menu de F02, F05, F07, F08 |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |

## Objetivo

1. Reunir no **menu lateral, dentro de "Dashboard"**, todas as telas de painel: as que já existem (Analytics e Workload) e as novas da Fase 2. Os botões do topo da tela de Dashboard são removidos.
2. Colocar um **botão voltar no canto superior esquerdo de todas as sub telas** do web.

## Regra registrada

**As telas de dashboard que já existem não são alteradas** (conteúdo, gráficos, cards). Se uma feature precisar mexer nelas, é preciso perguntar ao dev explicitamente. A única mudança autorizada é **retirar os botões Analytics/Workload do cabeçalho** do `DashboardPage`, porque eles passam para o menu.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Acesso às telas novas | **Menu lateral, grupo "Dashboard".** |
| Analytics e Workload | **Entram no mesmo grupo.** Os botões de navegação saem do topo do `DashboardPage` **e também do Analytics e do Workload** (autorizado em 2026-10-27). Fora isso, nada muda nessas telas. |
| Grupo × item simples | O grupo só aparece se o usuário enxerga **mais de um** filho. Com um só (ex.: INSP vê só Overview), continua o item simples "Dashboard". |
| Indicador 01.13 (% travado) | Vira uma **seção da tela Dia ao Vivo** (F05). Não vai para o `/analytics`. |
| Botão voltar | **Ícone + texto "Back".** Em **todas as sub telas**. Analytics e Workload viram itens do menu (telas de topo) e por isso **não** recebem voltar. Volta para a **tela anterior**; se a tela foi aberta direto (link ou nova aba), volta para a **tela pai**. Usa o `useGoBack(parentPath)` que já existe. |

## Estado atual (verificado @042a9674)

- **Menu lateral:** `Sidebar.tsx` já tem grupos com filhos ("Users", "Configuration"). "Dashboard" é um item simples (`:32`, `to: '/dashboard'`).
- **Botões do dashboard:** o `DashboardPage.tsx:44-55` monta os botões de cabeçalho Analytics (AM/OP/CL_ADMIN/CL_USER) e Workload (AM/OP), conforme a memória `project_dashboard_cluster_header_nav` (#1104). Analytics e Workload não têm item no menu.
- **Voltar:** `useGoBack(fallbackPath)` (`apps/web/src/hooks/useGoBack.ts`) volta no histórico quando existe e, senão, vai para o fallback. Já é usado em 9 telas: detalhe de appointment, imóvel, contato e grupo; criação de imóvel e de grupo; integrações; e o error boundary.

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| Menu | Transformar "Dashboard" em grupo com os filhos **Overview** (`/dashboard`), **Analytics** e **Workload**, respeitando os papéis atuais de cada um. As features novas acrescentam os seus itens: **Live Day** (F05), **Inspector performance** (F07), **Goals & rewards** (F08) e **Inspector notices** (F02), todos AM/OP. Remover os botões de cabeçalho do `DashboardPage`, sem tocar em nada mais da tela. Atualizar os testes do menu e do dashboard. | B | 0,5 | – |
| Voltar | Prop `backTo` (caminho pai) no cabeçalho de página compartilhado, que renderiza o botão "Back" (ícone + rótulo acessível) no canto superior esquerdo usando `useGoBack(backTo)`. Aplicar em **todas as sub telas** e trocar os botões ad-hoc das 9 telas atuais pelo padrão. Ver o inventário abaixo. | B | 1,25 | – |
| QA | Teste unitário do componente, testes das telas tocadas e smoke de navegação (vindo do mapa, link direto, nova aba). | – | 0,25 | – |

**Inventário de sub telas** (a spec confirma a lista final):

| Tela | Volta para |
|---|---|
| `appointments/list`, `appointments/new`, `appointments/import`, `appointments/board`, `appointments/:id` | map ou lista |
| `properties/new`, `properties/map`, `properties/import`, `properties/:id` | properties |
| `contacts/:id` | contacts |
| `service-groups` (lista vinda do mapa), `service-groups/new`, `service-groups/:id`, `service-groups/map` | map / grupos |
| `tenants/:tenantId` | tenants |
| `integrations/fy-api`, `integrations/:provider` | integrations |
| `settings/account`, `settings/security` | settings |
| `financial` → entries/invoices, se forem sub rotas | financial |
| Telas novas da Fase 2 que forem sub telas (ex.: detalhe de aviso, detalhe de meta) | a tela de origem |

O que **não** recebe botão voltar: as telas de topo do menu e as telas públicas (login, portal).

## Fora do escopo

- Breadcrumbs.
- Redesenhar o cabeçalho.
- Mudar o conteúdo de qualquer dashboard existente.
- Navegação do PWA (já tratada no #1295).

## Riscos e armadilhas

- `useGoBack` depende de `location.key`. Testes que renderizam o cabeçalho precisam de router (`createMemoryRouter`), igual aos que já existem.
- O teste do `DashboardPage` que garante os botões de cabeçalho precisa ser trocado por um teste do menu. Atualizar a memória `project_dashboard_cluster_header_nav` depois do merge.
- `PageHeader` com CTA duplicado em testes: ver a memória `project_pageheader_duplicate_cta_buttons`.

## Quebra em PRs

Um PR (web, ~25 arquivos).
