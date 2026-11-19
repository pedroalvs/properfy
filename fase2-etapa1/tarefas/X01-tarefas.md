# X01 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Total** | **2,25 dias** (Menu 0,75 + Voltar 1,25 + QA/Doc 0,25). O plano previa 2,0; Analytics e Workload deixaram de receber o voltar (−0,25), e a revisão de lacunas de 2026-10-29 somou +0,5 (critério de histórico do `useGoBack`, contrato do `BackButton`, testes do menu sem mocks e ordem canônica: L-X01-01/02/03/08) |
| **Tarefas** | 1 |
| **PRs** | 1 (web, ~40 arquivos, abaixo do limite de 150) |
| **Depende de** | – |
| **Código verificado em** | snapshot de `origin/develop` (`apps/web/src`) |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-X01-1 | Menu "Dashboard" agrupado + botão voltar padrão nas sub telas do web | 2,25 | – |

---

## TASK-X01-1 · Menu "Dashboard" agrupado + botão voltar padrão nas sub telas do web

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1
> - **Desbloqueia:** TASK-F02-2, TASK-F05-2, TASK-F07-3, TASK-F08-3
> - **Pode rodar em paralelo com:** TASK-X02-1, TASK-X03-1, TASK-F00-1, TASK-F03-1
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
1. Reunir as telas de painel no menu lateral, num grupo **"Dashboard"** com os filhos **Overview** (`/dashboard`), **Analytics** (`/analytics`) e **Workload** (`/inspector-workload`). As três passam a ser telas de topo do menu. Os botões de navegação entre elas saem dos três cabeçalhos.
2. Colocar um **botão voltar** padrão (ícone + texto "Back") no canto superior esquerdo de todas as sub telas do web.
   - Com histórico do app, ele volta para a tela anterior.
   - Quando a tela foi aberta direto (link, refresh ou nova aba), vai para a tela pai.

### Contexto no código
Caminhos relativos a `apps/web/src/`.

- **Menu**
  - `components/shell/Sidebar.tsx` tem os tipos `NavItem` e `NavSubmenuItem`, a lista `NAV_ITEMS`, a função `filterNavItems(items, role, clUserPermissions)` e a renderização (`SidebarSubmenu` para itens com `submenu`; `SidebarItem` para os demais).
  - Hoje "Dashboard" é `{ icon: 'mdi-view-dashboard-outline', label: 'Dashboard', to: '/dashboard' }`, sem `roles`. "Users" e "Configuration" já são grupos.
  - `filterNavItems` filtra os filhos por `roles` e descarta grupos sem filhos.
- **Flyout do grupo:** `components/shell/SidebarSubmenu.tsx`.
  - No desktop, o gatilho é um `<button aria-label={label} aria-haspopup="menu" aria-expanded>`. Enter ou Espaço abrem o flyout; Esc fecha e devolve o foco ao gatilho. O flyout tem `role="menu"` e os links `role="menuitem"`. Também abre por hover.
  - No mobile, o grupo é um bloco expandido com os links visíveis.
  - O grupo fica ativo quando `location.pathname.startsWith(item.to)` para algum filho.
- **Testes do menu:** `components/shell/Sidebar.test.tsx`, `components/shell/Sidebar.roles.test.tsx` (MemoryRouter em `/dashboard`) e `components/shell/SidebarSubmenu.test.tsx`. As linhas ~142-163 de `Sidebar.roles.test.tsx` hoje garantem que Analytics e Workload **não** estão no menu.
  - **Os dois arquivos mockam `SidebarSubmenu` e `SidebarItem` como `<div>` sem `role`, `href` nem classes** (`Sidebar.roles.test.tsx:12-30`, `Sidebar.test.tsx:9-13`). Com esses mocks, asserções de `aria-haspopup`, `href`, `menuitem` ou indicador ativo não são possíveis (L-X01-02).
- **Exportações do `Sidebar.tsx`:** hoje nem `NAV_ITEMS` nem `filterNavItems` são exportados, e a assinatura é `filterNavItems(items, role, clUserPermissions: string[] | undefined)` com o terceiro parâmetro obrigatório (`Sidebar.tsx:72-76`). F05 chama `filterNavItems(NAV_ITEMS, 'AM')` (L-X01-03).
- **Papéis das rotas (`app/router.tsx`)**
  - `/dashboard`: sem guard (o INSP cai aqui).
  - `/analytics`: `AuthGuard` com AM, OP, CL_ADMIN e CL_USER.
  - `/inspector-workload`: AM e OP.
- **Botões de cluster a remover**
  - `features/dashboard/pages/DashboardPage.tsx`: as variáveis `canViewAnalytics` e `canViewWorkload`, o array `secondaryActions` e a prop `secondaryActions` do `PageHeader`. O `primaryAction` "New Appointment" fica.
  - `features/analytics/pages/AnalyticsPage.tsx:51-58`: `secondaryActions` "Dashboard" e "Workload" (este só para AM/OP). `useNavigate`, `usePermissions`/`hasRole` e `UserRole` só são usados ali. O comentário das linhas ~48-50 ("With the sidebar entries gone these actions are the only in-cluster navigation") sai junto.
  - `features/inspector-workload/pages/InspectorWorkloadPage.tsx:35-42`: `secondaryActions` "Dashboard" e "Analytics". `useNavigate` só é usado ali. O `<WeekSelector>`, passado como `children`, fica.
  - Testes afetados:
    - `DashboardPage.test.tsx`: "Analytics entry point" ~:314 e "Workload entry point" ~:353;
    - `AnalyticsPage.test.tsx`: "header cross-navigation" ~:149;
    - `InspectorWorkloadPage.test.tsx`: casos ~:156, ~:164 e ~:172.
- **Hook de voltar:** `hooks/useGoBack.ts`, `useGoBack(fallbackPath)`. Se `location.key !== 'default'`, chama `navigate(-1)`; senão, `navigate(fallbackPath)`. Os testes estão em `hooks/useGoBack.test.tsx`. Também é usado pelo `AppErrorBoundary`.
  - **Defeito do critério atual (L-X01-01):** no React Router 6.28 todo `replace` gera uma `key` nova; só a primeira entrada do router tem `'default'`. Depois de um `replace`, o hook chama `navigate(-1)` mesmo com uma única entrada no histórico do app (em aba nova o `history.back()` é no-op; se a aba veio de outro site, sai do app). Isso acontece em: link direto deslogado (`ProtectedRoute` → `<Navigate to="/login" replace>` → `LoginPage.tsx:65` `navigate(…, { replace: true })`); rotas que só redirecionam abertas direto (`/settings/security`, `/appointments/new`, `/appointments/list`, `/service-groups/map`); e estado de URL gravado com `replace: true` na própria sub tela (`hooks/useUrlFilters.ts:61,90`, `AppointmentListPage.tsx:87` ao fechar o drawer `?new=1`, `AccountSettingsPage.tsx:31` na troca de aba).
  - O data router grava `window.history.state.idx`: `0` na primeira entrada, `replace` preserva o índice, `push` incrementa. `MemoryRouter`/`createMemoryRouter` não gravam `idx`.
- **Cabeçalho compartilhado:** `components/layout/PageHeader.tsx`.
  - Props: `title`, `primaryAction` (botão no desktop + FAB fixo no mobile), `secondaryActions` e `children`. **Não tem voltar.**
  - `components/layout/templates/ListFilterTableTemplate.tsx` envolve o `PageHeader` e é usado pelas listas.
  - `components/layout/PageHeader.test.tsx` renderiza **sem router**.
- **Voltar improvisado hoje**
  - Cabeçalho próprio (h1 + chips) com `<button aria-label="Go back">`, só com o ícone `mdi-arrow-left text-xl`:
    - `AppointmentDetailPage.tsx` ~:342;
    - `PropertyDetailPage.tsx` ~:91;
    - `ContactDetailPage.tsx` ~:111;
    - `ServiceGroupDetailPage.tsx` ~:193.
  - Os estados de loading e de erro desses detalhes usam `secondaryActions: [{ label: 'Back', icon: 'mdi-arrow-left' }]`.
  - Telas de criação, com `secondaryActions` "Back" mais confirmação de descarte:
    - `PropertyCreatePage.tsx`: `handleBack` (abre a confirmação se `isDirty`) e `forceBack`, que chama o `goBack` da própria página;
    - `ServiceGroupCreatePage.tsx`: `handleNavigateBack` no cabeçalho; `handleBack` é o do wizard, com rótulo "Cancel" no passo 1 e "Back" no passo 2.
  - Link-texto com `useGoBack`: `IntegrationDetailPage.tsx` ("Integrations") e `FyIntegrationPage.tsx` ("API Keys", fallback `/integrations?tab=api-keys`).
  - `AppointmentImportPage.tsx:146-153` tem um `<Link to="/appointments">` "Back to Appointments" no topo. Os passos do wizard têm botões "Back" (~:253, ~:296).
- **Estilo de foco usado no repo:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`.
- **Login e redirects** usam `replace` (`LoginPage.tsx:65`, `<Navigate replace>`). Por isso, o "anterior" no histórico nunca é o login nem uma rota de redirect. Mas, quando a sub tela foi aberta direto, o "anterior" **não existe**, e o critério por `location.key` não percebe isso (ver L-X01-01 acima); o critério passa a ser `history.state.idx`.
- **Telas de criação:** `PropertyCreatePage.tsx:28` e `ServiceGroupCreatePage.tsx:31` têm um `useGoBack` próprio. No `ServiceGroupCreatePage`, o `goBack` também é usado pelo `handleBack` do wizard ("Cancel" do passo 1, `:92-101`) e pelo `forceBack` ("Discard" do diálogo, `:140-143`), que roda depois do clique, num diálogo.
- **Board:** `AppointmentBoardPage.tsx:180-187` tem `secondaryActions` "List" (volta para `/appointments` com `location.search`) e "Map View".
- **Import:** `AppointmentImportPage.tsx:295` tem o botão de passo `disabled={isCommitting}`; o `<Link>` do topo (`:146-153`) fica sempre habilitado.
- **Tenant:** `TenantDetailPage.tsx:69-71` define `handleBack = navigate('/tenants')`, usado pelo `EmptyState` de erro (`:123-126`). Para CL_ADMIN, `/tenants` é negado pelo `AuthGuard` (`router.tsx:386-398`, `AuthGuard.tsx:24-37`: toast "You do not have permission" → `/dashboard`).
- **`/notification-consents`** (`features/notification-consents/pages/ConsentLookupPage.tsx`, AM/OP) não tem item de menu nem link de entrada no web. Só se chega por URL.

### Decisões aplicáveis
- (2026-10-27) **As telas de dashboard que já existem não são alteradas.** A única mudança autorizada é **remover os botões de navegação de cluster** dos cabeçalhos do `DashboardPage`, do `AnalyticsPage` e do `InspectorWorkloadPage`. Ficam como estão: cards, gráficos, `primaryAction` "New Appointment", `IntegrationWarnings`, `WeekSelector` e os filtros de período.
- (2026-10-27, revisão) **Analytics e Workload viram itens do menu lateral**, ou seja, telas de topo, e **não recebem botão voltar**. Isso segue a regra acima: a remoção dos botões de cluster é a única mudança nessas duas telas.
- (2026-10-27) O acesso às telas de painel é pelo **menu lateral, grupo "Dashboard"**, respeitando os papéis atuais de cada rota.
- (2026-10-27) O grupo só aparece quando o usuário vê **mais de um filho**. Com um único filho visível (o INSP só vê Overview), aparece o item simples "Dashboard", como hoje. A flag **`collapseIfSingle` vale só para o grupo Dashboard**.
- (2026-10-27) O botão voltar fica em **todas as sub telas** e usa `useGoBack(parentPath)`. O padrão é um componente novo, **`BackButton`**, usado pelo `PageHeader` (prop `backTo`) e pelos cabeçalhos próprios.
- (2026-10-27) O botão mostra **ícone + texto visível "Back"** (`aria-label="Back"`) e substitui o "Go back" atual em todas as telas.
- (2026-10-27) Telas com confirmação de descarte usam o override opcional **`onBack`**.
- (2026-10-27) O botão de passo anterior dos wizards passa a se chamar **"Previous step"**, para não ter o mesmo nome acessível do "Back" de cabeçalho. Vale para o `AppointmentImportPage` (passos de preview e confirmação) e para o `ServiceGroupCreatePage` (passo 2). O comportamento não muda.
- (2026-10-27) No `TenantDetailPage`, o fallback é **`/dashboard` para CL_ADMIN** e **`/tenants` para AM/OP**.
- (2026-10-27) Decisões aceitas:
  - rotas que só redirecionam ficam fora;
  - `/settings/*` volta para **`/dashboard`**;
  - no financeiro, só **`/financial/invoices`** é sub tela;
  - `AppErrorBoundary` fica como está;
  - `AppointmentImportPage` entra;
  - o clique a mais no flyout do desktop foi aceito.
- (2026-10-27, revisão) **`/notification-consents`** fica fora: não ganha voltar nem item de menu.
- (2026-10-29, L-X01-01) **"Há histórico do app" passa a ser decidido pelo índice da entrada**, não pela `key`. Regra em `useGoBack`: `const idx = window.history.state?.idx; const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';`. Com histórico, `navigate(-1)`; sem histórico, `navigate(fallbackPath)`. O fallback para `key` mantém os testes com `MemoryRouter`/`createMemoryRouter`. A mudança vale para todos os consumidores do hook, inclusive o `AppErrorBoundary`, e só corrige o fallback.
- (2026-10-29, L-X01-02) **`Sidebar.roles.test.tsx` deixa de mockar `SidebarSubmenu` e `SidebarItem`** (mantém os mocks de `useAuth`, `SidebarUser` e `SidebarUserMenu`) e renderiza com `MemoryRouter` + `initialEntries` por caso. Os testes de `filterNavItems` ficam em `Sidebar.test.tsx`, que pode manter os mocks porque não renderiza o menu real. F02, F05, F07 e F08 seguem esse mesmo arranjo.
- (2026-10-29, L-X01-03) **Ordem canônica dos filhos do grupo Dashboard** (operação primeiro, depois análise): Overview · Live Day (F05) · Inspector notices (F02) · Analytics · Workload · Inspector performance (F07) · Goals & rewards (F08). Cada feature insere o seu filho na posição da tabela, sem placeholder. Testes de menu verificam presença por rótulo, nunca índice nem contagem. `NAV_ITEMS` e `filterNavItems` são exportados, e `clUserPermissions` vira opcional (`clUserPermissions?: string[]`).
- (2026-10-29, L-X01-04) O PR do X01 **remove a cláusula de transição de N2/N3 do `apps/web/CLAUDE.md`** (C03 do X00), registra `BackButton`/`backTo` e o grupo Dashboard como estado atual e atualiza a memória `project_dashboard_cluster_header_nav` no próprio PR (não "depois do merge").
- (2026-10-29, L-X01-05) No `AppointmentBoardPage`, as ações **"List" e "Map View" ficam** ao lado do Back (mesma regra do `ServiceGroupListPage`, cuja "Map View" duplica o fallback).
- (2026-10-29, L-X01-06) No `AppointmentImportPage`, o Back de cabeçalho usa o override: **com `isCommitting`, o clique é ignorado** (o botão continua habilitado, sem estado desabilitado); fora do commit, chama o `goBack`.
- (2026-10-29, L-X01-07) No `TenantDetailPage`, o `EmptyState` de erro usa o **mesmo `backTo` por papel** do cabeçalho (`navigate(backTo)`), com rótulo "Back to Agencies" para AM/OP e "Back to Dashboard" para CL_ADMIN.
- (2026-10-29, L-X01-08) **Contrato do override:** `onClick?: (goBack: () => void) => void` no `BackButton` e `onBack?: (goBack: () => void) => void` no `PageHeader`; o `BackButton` passa o seu `goBack` ao override. Nas telas de criação, o `useGoBack` próprio da página fica (o "Discard" roda depois, no diálogo, e o `ServiceGroupCreatePage` também o usa no "Cancel" do wizard), mas **página e `backTo` usam a mesma constante de fallback** (ex.: `const BACK_TO = '/properties'`), para não haver duas fontes de verdade.
- (2026-10-29, L-X01-08) **Regra geral de fallback:** o `backTo` de uma sub tela tem de ser uma rota cujo `AuthGuard` inclua todos os papéis da própria sub tela; se não for possível, calcular por papel como no `TenantDetailPage`. Vale para as sub telas novas de F02/F05/F07/F08. O teste P-b de cada tela roda com o papel mais restrito que acessa a tela.

### Especificação detalhada

#### 1. Estrutura do menu

Item em `NAV_ITEMS`, na mesma posição de hoje (primeiro item):

```ts
{
  icon: 'mdi-view-dashboard-outline',
  label: 'Dashboard',
  collapseIfSingle: true,
  submenu: [
    { icon: 'mdi-view-dashboard-outline', label: 'Overview',  to: '/dashboard' },
    { icon: 'mdi-chart-line',             label: 'Analytics', to: '/analytics',          roles: [AM, OP, CL_ADMIN, CL_USER] },
    { icon: 'mdi-account-clock-outline',  label: 'Workload',  to: '/inspector-workload', roles: [AM, OP] },
  ],
}
```

- Os ícones de Analytics e Workload são os que os botões de cabeçalho usam hoje. Overview usa o ícone atual do Dashboard.
- Os papéis espelham **exatamente** os `AuthGuard` do router. Overview não tem `roles`, como `/dashboard`.
- `NavItem` ganha `collapseIfSingle?: boolean`. Só o item Dashboard usa a flag.
- **Exportações (L-X01-03):** `export const NAV_ITEMS` e `export function filterNavItems(items: NavItem[], role: string | undefined, clUserPermissions?: string[])`. O terceiro parâmetro vira opcional; chamar com dois argumentos equivale a `undefined` (comportamento atual).
- **Regra em `filterNavItems`:**
  - Depois de filtrar os filhos por `roles`:
    - 0 filhos → descarta o item (comportamento atual);
    - 1 filho e `collapseIfSingle` → devolve o item simples `{ icon: item.icon, label: item.label, to: filho.to }`, renderizado por `SidebarItem` com o rótulo "Dashboard";
    - 2 ou mais filhos → grupo (`SidebarSubmenu`).
  - Sem a flag, o comportamento atual fica: "Users" e "Configuration" não mudam.

| Papel | O que vê | Filhos |
|---|---|---|
| AM | grupo "Dashboard" | Overview, Analytics, Workload |
| OP | grupo "Dashboard" | Overview, Analytics, Workload |
| CL_ADMIN | grupo "Dashboard" | Overview, Analytics |
| CL_USER | grupo "Dashboard" | Overview, Analytics (a rota `/analytics` não exige flag) |
| INSP | item simples "Dashboard" → `/dashboard` | – |
| sem usuário (render defensivo) | item simples "Dashboard" → `/dashboard` | – |

- **Estado ativo:** o grupo fica ativo em `/dashboard`, `/analytics` e `/inspector-workload`. Dentro do flyout, o filho da rota atual aparece em destaque (barra lateral + `font-semibold text-realty`), como já faz o `SidebarSubmenu`.
- **Itens futuros:** F05 (Live Day), F07 (Inspector performance), F08 (Goals & rewards) e F02 (Inspector notices) acrescentam filhos AM/OP neste `submenu`, cada uma no seu PR. Não criar placeholders.
- **Ordem canônica do `submenu` (L-X01-03).** Cada feature insere o seu filho na posição abaixo, qualquer que seja a ordem de merge (se um vizinho ainda não existe, fica entre os que já existem, na ordem relativa da tabela). Testes de menu verificam presença por rótulo, nunca índice nem contagem.

| # | Filho | Rota | Papéis | Entra em |
|---|---|---|---|---|
| 1 | Overview | `/dashboard` | todos | X01 |
| 2 | Live Day | `/live-day` | AM, OP | F05 |
| 3 | Inspector notices | `/inspector-notices` | AM, OP | F02 |
| 4 | Analytics | `/analytics` | AM, OP, CL_ADMIN, CL_USER | X01 |
| 5 | Workload | `/inspector-workload` | AM, OP | X01 |
| 6 | Inspector performance | `/inspector-performance` | AM, OP | F07 |
| 7 | Goals & rewards | rota definida na F08 | AM, OP | F08 |

#### 2. API do `BackButton` (novo, `components/layout/BackButton.tsx`)

```ts
interface BackButtonProps {
  /** Tela pai, usada quando não há histórico do app (link direto, refresh, nova aba, entrada após login/redirect). Pode ter query string. */
  to: string;
  /** Override: quando informado, é chamado no lugar da navegação e recebe o `goBack` do próprio botão (mesmo fallback `to`). */
  onClick?: (goBack: () => void) => void;
  className?: string;
}
```

**`useGoBack` corrigido (`hooks/useGoBack.ts`, L-X01-01):**

```ts
export function useGoBack(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';
    if (hasAppHistory) navigate(-1);
    else navigate(fallbackPath);
  }, [location.key, navigate, fallbackPath]);
}
```

- O JSDoc do hook passa a descrever o critério por `idx` e o fallback por `key` só para routers de memória.

| Caso | Condição | Comportamento |
|---|---|---|
| Há histórico do app | `history.state.idx > 0` (chegou por `push` interno); em router de memória, `location.key !== 'default'` | `navigate(-1)` → volta para a tela anterior, preservando a query dela (filtros, `?mode=groups`) |
| Link direto ou refresh | `history.state.idx === 0` (primeira entrada; `replace` preserva o 0) | `navigate(to)` → vai para a tela pai |
| Link direto deslogado (login → destino) ou rota de redirect aberta direto | os `replace` de `ProtectedRoute`, `LoginPage` e `<Navigate replace>` mantêm `idx === 0` | `navigate(to)` |
| Filtro, aba ou drawer gravado na URL com `replace` numa tela aberta direto | `idx` continua `0` | `navigate(to)` |
| Nova aba (`target="_blank"`, `window.open`, Ctrl/Cmd+clique) | igual ao link direto | `navigate(to)` |
| Override `onClick` | prop presente | chama só `onClick(goBack)`. **Não** navega por conta própria. A página decide (abre a confirmação, ignora o clique ou chama o `goBack` recebido) |

- O componente chama `useGoBack(to)` internamente. Ele só deve ser renderizado dentro de um router.
- O `PageHeader` ganha `backTo?: string` e `onBack?: (goBack: () => void) => void`:
  - sem `backTo`, não renderiza `BackButton` nem chama hooks de router;
  - com `backTo`, renderiza `<BackButton to={backTo} onClick={onBack} />` imediatamente antes do `<h1>`, na mesma linha;
  - `onBack` sem `backTo` é ignorado.
- O `ListFilterTableTemplate` ganha `backTo?: string` e o repassa ao `PageHeader`.
- O `components/layout/index.ts` exporta `BackButton`.

#### 3. Texto, acessibilidade e estados visuais
- **Texto:** ícone + texto visível **"Back"**, com `aria-label="Back"`. O nome acessível é igual ao texto visível (WCAG 2.5.3, *label in name*). O rótulo é o mesmo em todas as telas e substitui "Go back", os links-texto ("Integrations", "API Keys", "Back to Appointments") e os `secondaryActions` "Back" de cabeçalho.
- **Elemento:** `<button type="button" aria-label="Back">`, com `<i className="mdi mdi-arrow-left text-xl" aria-hidden="true" />` e `<span>Back</span>`.
- **Teclado:** está na ordem natural do Tab, como **primeiro elemento focável do conteúdo da página** (antes do título e das ações). Enter e Espaço acionam (comportamento nativo do `<button>`).
- **Foco:** anel `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`, sem anel no clique do mouse. Depois da navegação, o foco segue o padrão atual do app; nada de gerenciamento de foco novo. Quando o override abre o diálogo de descarte, o `ConfirmDialog` existente cuida do foco.
- **Estados visuais:**

| Estado | Visual |
|---|---|
| padrão | `inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-text-secondary` |
| hover | `hover:bg-black/5` |
| focus (teclado) | anel `ring-2 ring-primary` |
| ativo/pressionado | sem estilo extra (o nativo basta) |
| desabilitado | não existe: o botão está sempre habilitado |

- **Layout:**
  - `PageHeader`: o `<h1>` vira `<div className="flex items-center gap-3"><BackButton/><h1/></div>`;
  - mobile: a linha botão + título fica no topo, e as ações quebram para baixo como hoje;
  - o FAB do `primaryAction` não muda;
  - cabeçalhos próprios dos detalhes: o `BackButton` ocupa o lugar do botão "Go back" atual.

#### 4. Comportamento por tela

| Tela | Como recebe | Fallback | Observação |
|---|---|---|---|
| `AppointmentListPage` | `ListFilterTableTemplate backTo` | `/map` | as ações Import/Board/Map View/Generate Excel ficam |
| `AppointmentBoardPage` | `PageHeader backTo` | `/appointments` | com histórico, volta para a lista com os filtros (a query vem do histórico); as ações "List" e "Map View" ficam (L-X01-05) |
| `AppointmentImportPage` | `PageHeader backTo` | `/appointments` | remover o `<Link>` "Back to Appointments" do topo; o link de template CSV fica; os botões "Back" de passo (~:253 preview, ~:296 confirmação) passam a se chamar **"Previous step"**, com o mesmo `onClick`; o "Back to Appointments" do passo final fica; `onBack={(goBack) => { if (!isCommitting) goBack(); }}`: durante o commit o clique é ignorado, sem desabilitar o botão (L-X01-06) |
| `AppointmentDetailPage` | `BackButton` no cabeçalho próprio + `backTo` nos estados de loading e de erro | `/appointments` | remover `handleBack` se ficar sem uso |
| `PropertyCreatePage` | `PageHeader backTo` + `onBack={handleBack}` | `/properties` | `forceBack` continua usando o `goBack` da página; `useGoBack(BACK_TO)` e `backTo={BACK_TO}` usam a mesma constante (L-X01-08) |
| `PropertyDetailPage` | `BackButton` no cabeçalho próprio + `backTo` nos estados | `/properties` | o `EmptyState` "Back to Properties" fica |
| `ContactDetailPage` | `BackButton` no cabeçalho próprio | `/contacts` | os "Back to Contacts" de `EmptyState` ficam |
| `ServiceGroupListPage` | `ListFilterTableTemplate backTo` | `/map?mode=groups` | a ação "Map View" fica |
| `ServiceGroupCreatePage` | `PageHeader backTo` + `onBack={handleNavigateBack}` | `/service-groups` | `useGoBack(BACK_TO)` e `backTo={BACK_TO}` usam a mesma constante (L-X01-08); o `handleBack` do wizard não muda; o botão do passo 2 (~:337) muda o texto de "Back" para **"Previous step"**; o "Cancel" do passo 1 (~:260) fica |
| `ServiceGroupDetailPage` | `BackButton` no cabeçalho próprio + `backTo` nos estados | `/service-groups` | – |
| `TenantDetailPage` | `PageHeader backTo` (valor por papel, calculado na página) | `/tenants` (AM/OP) · `/dashboard` (CL_ADMIN) | o `EmptyState` de erro passa a usar o mesmo `backTo` por papel (`navigate(backTo)`), com rótulo "Back to Agencies" (AM/OP) ou "Back to Dashboard" (CL_ADMIN); o `handleBack` fixo em `/tenants` sai (L-X01-07) |
| `IntegrationDetailPage` | `BackButton` no lugar do link-texto | `/integrations` | – |
| `FyIntegrationPage` | `BackButton` no lugar do link-texto | `/integrations?tab=api-keys` | – |
| `AccountSettingsPage` | `PageHeader backTo` | `/dashboard` | vale para `/settings/account?tab=security` (o redirect de `/settings/security` cai aqui com `idx === 0`, então vai para o fallback); a troca de aba com `replace` não muda isso |
| `InvoicesPage` | `ListFilterTableTemplate backTo` | `/financial/entries` | – |

#### 5. Casos de borda
- Sub tela aberta por outra sub tela (detalhe → outro detalhe pelo link de relação): com histórico, volta para o detalhe anterior. É o comportamento esperado do `navigate(-1)`.
- Refresh (F5) numa sub tela: o `history.state.idx` sobrevive ao refresh. Se a sub tela tinha entradas anteriores do app (`idx > 0`), o Back volta para elas; se foi a primeira entrada (`idx === 0`), vai para o fallback. (Antes da L-X01-01, o refresh sempre ia para o fallback.)
- Chegar pelo redirect `/appointments/new` → `/appointments?new=1`: o redirect usa `replace`, que preserva o `idx`. Vindo de outra tela do app, o Back volta para ela; aberto direto (`idx === 0`), vai para o fallback `/map`. Fechar o drawer (`replace`, `AppointmentListPage.tsx:87`) não muda isso.
- `/settings/security` aberto direto → `/settings/account?tab=security` com `idx === 0` → Back → `/dashboard`. Trocar de aba (`replace`) mantém o fallback.
- Link direto deslogado (e-mail, sessão expirada): `/appointments/<id>` → `/login` → destino, tudo com `replace`, `idx === 0` → Back → `/appointments`. O login nunca é o "anterior".
- Filtros gravados com `replace` (`useUrlFilters`) em `/appointments`, `/appointments/board`, `/contacts`, `/properties` abertos direto: o Back continua indo ao fallback depois de mudar um filtro.
- Aba aberta a partir de outro site: `idx === 0` → fallback dentro do app; o Back nunca sai do app nem fica morto.
- `AppErrorBoundary`: usa o mesmo `useGoBack` e passa a acertar o fallback nos mesmos casos; nenhuma outra mudança.
- Import durante o commit: o clique no Back é ignorado (override); a rota não muda e o relatório final aparece. Fora do commit, o Back sai normalmente.
- `TenantDetailPage` com erro de carga: o `EmptyState` leva CL_ADMIN a `/dashboard` (sem toast de permissão) e AM/OP a `/tenants`.
- Board: "List" (com `location.search`) e "Map View" convivem com o Back; não são um "Back" em `secondaryActions` (critério 4), porque têm destino fixo, não "voltar".
- Board aberto direto com query: o fallback é `/appointments`, sem a query. É aceitável, e com histórico a query é preservada.
- O papel não pode abrir o fallback: só o `TenantDetailPage` para CL_ADMIN, já tratado com fallback por papel (cabeçalho e `EmptyState`). Nas outras 14 telas, o fallback aceita os mesmos papéis da sub tela (conferido no router: `router.tsx:178-193,241-293,305-325,353-358,429-450`). A regra vale para sub telas futuras (ver Decisões, L-X01-08).
- Telas de criação com formulário alterado: o Back abre a confirmação. "Discard" navega pelo `goBack` da página; "Cancel" fica na tela.
- Estados de loading e de erro dos detalhes: o Back aparece também, com o mesmo fallback.
- Wizards: no passo 2 do `ServiceGroupCreatePage` e nos passos de preview e confirmação do `AppointmentImportPage`, o "Back" de cabeçalho sai da tela, e o botão do wizard, agora **"Previous step"**, volta ao passo anterior. Cada tela fica com um único botão chamado "Back".
- "Previous step" no `ServiceGroupCreatePage` mantém a lógica atual do `handleBack` (no passo 2, volta ao passo 1 e limpa `serviceRegionId`). No `AppointmentImportPage`, mantém `handleBackFromPreview` (→ passo 0) e `handleBackFromConfirm` (→ passo 1); durante o commit continua `disabled`, e o Back de cabeçalho ignora o clique (L-X01-06).
- INSP: a única sub tela acessível é `/settings/account` → fallback `/dashboard`, que o INSP pode abrir.
- Analytics e Workload: são telas de topo, **sem** Back. Chega-se a elas pelo menu.

### Testes primeiro (TDD)

**`components/layout/BackButton.test.tsx` (novo)**, com `createMemoryRouter` + `RouterProvider` e rotas stub `/list` e `/detail`:

| # | Arrange | Ação | Esperado |
|---|---|---|---|
| B1 | `initialEntries: ['/detail']`, `<BackButton to="/list">` | clique | a tela `/list` aparece (fallback) |
| B2 | `initialEntries: ['/list']`, navega para `/detail` por um botão | clique em Back | volta para `/list` (histórico) |
| B3 | entrada `/detail`, `to="/list?tab=x"` | clique | `router.state.location.pathname === '/list'` e `search === '?tab=x'` |
| B4 | `onClick={spy}`, entrada `/detail` | clique | `spy` é chamado 1x com uma função (`expect.any(Function)`) e a location continua `/detail` |
| B4b | `onClick={(goBack) => goBack()}`, entrada `/detail`, `to="/list"` | clique | a tela `/list` aparece (o `goBack` recebido usa o mesmo fallback) |
| B5 | – | render | `getByRole('button', { name: 'Back' })` existe, tem `type="button"` e contém o texto visível "Back" (`getByText('Back')`); o ícone tem `aria-hidden="true"` |
| B6 | – | `user.tab()` + `user.keyboard('{Enter}')` | o botão recebe foco e navega para o fallback |
| B7 | foco no botão | `user.keyboard(' ')` | navega para o fallback |

**`hooks/useGoBack.test.tsx` (modificar, L-X01-01)**

| # | Arrange | Ação | Esperado |
|---|---|---|---|
| G1 | `createBrowserRouter` no jsdom (grava `idx` em `window.history.state`), depois de `window.history.replaceState(null, '', '/detail')`; o componente chama `navigate('/detail?x=1', { replace: true })` | clique no handler | fallback `/list` (antes ia para `navigate(-1)`) |
| G2 | `window.history.replaceState({ idx: 0 }, '')` stubado; entrada com `key` aleatória (após `replace`) | clique | fallback `/list` |
| G3 | `window.history.state` com `idx: 2` | clique | `navigate(-1)` (rota anterior) |
| G4 | sem `idx` (router de memória), `/list` → push `/detail` | clique | volta para `/list` (caso existente, critério por `key`) |
| G5 | sem `idx`, entrada inicial `/detail` | clique | fallback `/list` (caso existente) |

- Restaurar `window.history.state` no `afterEach` (`replaceState(null, '', '/')`).
- Atenção: com `createMemoryRouter` sem stub, um `replace` gera `key` nova e o critério por `key` ainda escolhe `navigate(-1)`. Por isso G1 usa `createBrowserRouter`, e os testes de página que provam "`replace` + Back → fallback" stubam `window.history.replaceState({ idx: 0 }, '')` antes do render (o router de memória não toca em `window.history`).

**`components/layout/PageHeader.test.tsx` (modificar)**

| # | Arrange | Esperado |
|---|---|---|
| H1 | `render(<PageHeader title="X" />)` **sem router** | sem erro; `queryByRole('button', { name: 'Back' })` é `null` |
| H2 | `backTo="/p"` dentro de router | o botão "Back" existe e vem antes do heading no DOM (`compareDocumentPosition`) |
| H3 | `backTo="/p"` + `onBack={spy}` | clique → `spy` chamado com uma função e sem navegação |
| H4 | `onBack` sem `backTo` | não renderiza "Back" |
| H5 | os casos atuais (primary/secondary/FAB) | continuam verdes; o CTA primário usa `getAllByRole` (desktop + FAB) |

**`components/shell/Sidebar.roles.test.tsx` (modificar)**, com `MemoryRouter` + `initialEntries` por caso e `useAuth` mockado por papel. **Remover os mocks de `SidebarSubmenu` e `SidebarItem`** (`:12-30`); manter os de `useAuth`, `SidebarUser` e `SidebarUserMenu`. Os casos existentes de `getByText` continuam válidos sem os mocks. S1 abre o flyout com `user.click` no gatilho (ou foco + `user.keyboard('{Enter}')`) e lê os `menuitem`; S5/S6 leem o indicador pelo `<span>` irmão do gatilho (classe `bg-realty`) ou por um `data-testid` acrescentado ao indicador (L-X01-02):

| # | Papel / rota | Esperado |
|---|---|---|
| S1 | `it.each(AM, OP)` | botão `{ name: 'Dashboard' }` com `aria-haspopup="menu"`; após `user.click`: `getByRole('menu')` e `menuitem`s Overview (`href="/dashboard"`), Analytics (`/analytics`) e Workload (`/inspector-workload`), achados por rótulo |
| S2 | `it.each(CL_ADMIN, CL_USER)` | o grupo tem Overview e Analytics; `queryByText('Workload')` é `null` |
| S3 | CL_USER sem nenhuma flag | ainda vê Analytics |
| S4 | INSP | `getByRole('link', { name: /Dashboard/ })` com `href="/dashboard"`; nenhum botão com `aria-haspopup`; sem Overview, Analytics ou Workload |
| S5 | AM em `/analytics` | o grupo fica ativo (indicador `bg-realty`) |
| S6 | AM em `/inspector-workload` | o grupo fica ativo |
| S7 | OP | os grupos "Users" e "Configuration" não mudam (regressão) |
| S8 | – | remover os casos antigos "does not show Analytics/Workload" e "Dashboard single entry", e o comentário das linhas ~139-141 |
| S9 | AM, flyout aberto | a ordem relativa dos rótulos presentes segue a tabela canônica (Overview antes de Analytics, Analytics antes de Workload), comparando posições por rótulo, nunca índice absoluto |

**Teste unitário de `filterNavItems`**, em `Sidebar.test.tsx` (importa `NAV_ITEMS` e `filterNavItems` exportados; pode manter os mocks de render):

| # | Entrada | Saída |
|---|---|---|
| F1 | item com `collapseIfSingle`, 3 filhos, papel AM | grupo com 3 filhos |
| F2 | mesmo item, papel INSP | `{ label: 'Dashboard', to: '/dashboard', icon: 'mdi-view-dashboard-outline' }`, sem `submenu` |
| F3 | grupo **sem** `collapseIfSingle` com 1 filho visível | continua grupo com 1 filho (comportamento atual) |
| F4 | qualquer grupo com 0 filhos visíveis | descartado |
| F5 | `filterNavItems(NAV_ITEMS, 'AM')` (dois argumentos) | compila e o grupo Dashboard contém filhos com `to: '/analytics'` e `to: '/inspector-workload'` (presença) |
| F6 | `filterNavItems(NAV_ITEMS, 'CL_USER')` sem permissões | o grupo Dashboard contém `/analytics` e não contém `/inspector-workload` |

**`features/dashboard/pages/DashboardPage.test.tsx` (modificar)**
- D1: `it.each(AM, OP, CL_ADMIN, CL_USER, INSP)` → `queryByRole('button', { name: 'Analytics' })` e `queryByRole('button', { name: 'Workload' })` são `null`.
- D2: quem tem `appointment.create` → `getAllByRole('button', { name: 'New Appointment' }).length === 2`.
- D3: sem a permissão → o botão não aparece (caso existente).
- D4: o título "Dashboard" e os cards continuam (casos existentes).
- D5: não há botão "Back" (tela de topo).

**`features/analytics/pages/AnalyticsPage.test.tsx` (modificar)**
- A1: `it.each(AM, OP, CL_ADMIN, CL_USER)` → sem botões "Dashboard" e "Workload" (substitui "header cross-navigation").
- A2: sem botão "Back" (tela de topo).
- A3: os casos de período, estados e gating de receita continuam verdes, sem mudança.

**`features/inspector-workload/pages/InspectorWorkloadPage.test.tsx` (modificar)**
- W1: sem botões "Dashboard" e "Analytics" (substitui ~:156, ~:164 e ~:172).
- W2: o `WeekSelector` continua no cabeçalho.
- W3: sem botão "Back" (tela de topo).

**Sub telas.** Para cada uma, no `*.test.tsx` ao lado da página:
- P-a: o botão "Back" de cabeçalho existe, com texto visível. Em todas as telas, inclusive as de wizard, `getAllByRole('button', { name: 'Back' }).length === 1`.
- P-b: entrada direta → clique → o fallback da seção 4. Roda com o **papel mais restrito** que acessa a tela (L-X01-08).
- P-c: com histórico (rota stub anterior) → clique → a rota anterior.

| Teste | Casos além de P-a/P-b/P-c |
|---|---|
| `AppointmentListPage.test.tsx` | fallback `/map`; as ações Import/Board/Map View continuam; entrada direta (com `history.state.idx` stubado em `0`) + mudar um filtro (grava com `replace`) → Back → `/map` |
| `AppointmentBoardPage.test.tsx` | fallback `/appointments`; as ações "List" e "Map View" continuam presentes (L-X01-05) |
| `AppointmentImportPage.test.tsx` | o link "Back to Appointments" do topo não existe mais; o link do template CSV continua; **wizard:** no preview, há um botão `{ name: 'Previous step' }` e um único `{ name: 'Back' }`; clicar em "Previous step" volta ao upload (passo 0) sem sair da tela. No passo de confirmação, "Previous step" volta ao preview e fica `disabled` durante o commit. **Commit em andamento** (mutation pendente): clicar no Back de cabeçalho → a rota continua `/appointments/import` e o botão não tem `disabled`; depois do commit, Back → `/appointments` (L-X01-06). Ajustar os casos existentes que clicam no "Back" de passo |
| `AppointmentDetailPage.test.tsx` | trocar `getByLabelText('Go back')` (~:358, ~:365, ~:372) por `getByRole('button', { name: 'Back' })`; "Back" também nos estados de loading e de erro |
| `PropertyCreatePage.test.tsx` | formulário limpo → Back → `/properties`; formulário alterado → Back abre a confirmação e não navega; "Discard" navega (ajustar `getByText('Back')` ~:121, ~:261) |
| `PropertyDetailPage.test.tsx` | trocar "Go back" (~:164); "Back" no estado de loading |
| `ContactDetailPage.test.tsx` | fallback `/contacts` |
| `ServiceGroupListPage.test.tsx` | fallback `/map` com `search === '?mode=groups'` |
| `ServiceGroupCreatePage.test.tsx` | formulário alterado → confirmação. **Wizard:** no passo 2 há `{ name: 'Previous step' }` e um único `{ name: 'Back' }`; clicar em "Previous step" volta ao passo 1 sem navegar e sem abrir a confirmação. O passo 1 continua com "Cancel". Ajustar o caso ~:264 (`getAllByRole('button', { name: 'Back' })`) e o ~:271 |
| `ServiceGroupDetailPage.test.tsx` | trocar "Go back" (~:544, ~:550) |
| `TenantDetailPage.test.tsx` | AM → `/tenants`; OP → `/tenants`; CL_ADMIN → `/dashboard`. **`EmptyState` de erro:** CL_ADMIN → botão "Back to Dashboard" → `/dashboard`; AM → "Back to Agencies" → `/tenants` (L-X01-07) |
| `IntegrationDetailPage.test.tsx` | fallback `/integrations`; o link-texto "Integrations" não existe mais |
| `FyIntegrationPage.test.tsx` (novo) | fallback `/integrations` com `search === '?tab=api-keys'`; o `ApiKeysTab` é renderizado (mock) |
| `AccountSettingsPage.test.tsx` | fallback `/dashboard`; entrada direta (com `history.state.idx` stubado em `0`), trocar para a aba Security (`replace`) → Back → `/dashboard` |
| `InvoicesPage.test.tsx` | fallback `/financial/entries` |

### Escopo / Passos
- [ ] **P1 · Grupo Dashboard no menu** (web/shell, 0,5)
  - `components/shell/Sidebar.tsx` (modificar): item com `submenu` e `collapseIfSingle`; regra em `filterNavItems`; **exportar `NAV_ITEMS` e `filterNavItems`, com `clUserPermissions?: string[]`** (L-X01-03); atualizar o comentário das linhas ~30-32 que diz que Analytics/Workload saem do cabeçalho, e registrar nele a ordem canônica dos filhos.
  - `components/shell/Sidebar.roles.test.tsx` (modificar): **remover os mocks de `SidebarSubmenu` e `SidebarItem`**, render com `MemoryRouter` + `initialEntries` por caso, S1–S9; remover o comentário das linhas ~139-141 (L-X01-02).
  - `components/shell/Sidebar.test.tsx` (modificar): F1–F6 sobre os exports.
- [ ] **P2 · Remover os botões de cluster dos 3 cabeçalhos** (web/dashboard, 0,25)
  - `features/dashboard/pages/DashboardPage.tsx`, `features/analytics/pages/AnalyticsPage.tsx` e `features/inspector-workload/pages/InspectorWorkloadPage.tsx` (modificar). Remover também os imports e comentários que ficarem sem uso. **Nenhuma outra mudança nessas telas.**
  - Os três `*.test.tsx` (modificar).
- [ ] **P3 · `useGoBack` corrigido + `BackButton` + `backTo`** (web/components, 0,5)
  - P3.0 · `hooks/useGoBack.ts` e `hooks/useGoBack.test.tsx` (modificar): critério por `history.state.idx` com fallback por `key`, JSDoc atualizado, G1–G5 (L-X01-01).
  - `components/layout/BackButton.tsx` (novo, `onClick?: (goBack) => void`) e `components/layout/BackButton.test.tsx` (novo).
  - `components/layout/PageHeader.tsx`, `components/layout/PageHeader.test.tsx`, `components/layout/templates/ListFilterTableTemplate.tsx` e `components/layout/index.ts` (modificar).
- [ ] **P4 · Voltar em appointments** (web/pages, 0,25)
  - `AppointmentListPage`, `AppointmentBoardPage`, `AppointmentImportPage`, `AppointmentDetailPage` e os testes de cada uma (modificar).
  - P4.1 · `AppointmentImportPage.tsx` (modificar): texto dos botões de passo (~:253 e ~:296) de "Back" para "Previous step". Os handlers não mudam.
  - P4.2 · `AppointmentImportPage.tsx`: `onBack={(goBack) => { if (!isCommitting) goBack(); }}` (L-X01-06).
  - P4.3 · `AppointmentBoardPage.tsx`: manter "List" e "Map View" em `secondaryActions` (L-X01-05).
- [ ] **P5 · Voltar em properties, contacts e service groups** (web/pages, 0,25)
  - `PropertyCreatePage`, `PropertyDetailPage`, `ContactDetailPage`, `ServiceGroupListPage`, `ServiceGroupCreatePage`, `ServiceGroupDetailPage` e os testes de cada uma (modificar).
  - P5.1 · `ServiceGroupCreatePage.tsx` (modificar): texto do botão do passo 2 (~:337) de "Back" para "Previous step". O handler não muda.
  - P5.2 · `PropertyCreatePage.tsx` e `ServiceGroupCreatePage.tsx`: constante `BACK_TO` única para `useGoBack(BACK_TO)` e `backTo={BACK_TO}` (L-X01-08).
- [ ] **P6 · Voltar em tenants, integrations, settings e invoices** (web/pages, 0,25)
  - `TenantDetailPage`, `IntegrationDetailPage`, `FyIntegrationPage`, `AccountSettingsPage`, `InvoicesPage` e os testes (modificar).
  - `features/integrations/pages/FyIntegrationPage.test.tsx` (novo).
  - P6.1 · `TenantDetailPage.tsx`: o `EmptyState` de erro usa `navigate(backTo)` com rótulo por papel; remover o `handleBack` fixo em `/tenants` (L-X01-07).
- [ ] **P7 · Doc + QA: smoke manual** (QA/doc, 0,25)
  - P7.1 · **Doc (L-X01-04):** em `apps/web/CLAUDE.md`, remover a cláusula de transição de N2 ("The group is introduced by X01; until it merges…") e de N3 ("`BackButton` and `backTo` are introduced by X01. Until X01 merges…"); registrar `BackButton`/`backTo`, o contrato `onBack(goBack)`, o critério `history.state.idx` e o grupo Dashboard (com a ordem canônica) como estado atual. Conferir os comentários de `Sidebar.tsx:30-32` e `Sidebar.roles.test.tsx:139-141` (já tratados em P1). Atualizar a memória `project_dashboard_cluster_header_nav` no mesmo passo (Analytics/Workload agora **estão** na sidebar, no grupo Dashboard).
  - P7.2 · Seguir o roteiro de smoke abaixo.

### Fora do escopo
- Breadcrumbs, redesenho do cabeçalho, tooltip no botão voltar e gerenciamento de foco novo.
- Botão voltar no Overview, no Analytics e no Workload (telas de topo do menu).
- Qualquer mudança de conteúdo nos dashboards além da remoção dos botões de cluster.
- Os itens de menu de F02, F05, F07 e F08, e placeholders para eles.
- Rotas que só redirecionam: `appointments/list|new|map`, `properties/map|import`, `service-groups/map`, `settings`, `settings/security`.
- `/notification-consents`: sem voltar e sem item de menu novo.
- Telas de topo do menu, telas públicas (login, forgot/reset password, 2FA setup, portal), `AppErrorBoundary` e o PWA.
- Os botões "Back to X" dentro de `EmptyState`.
- Mudar o comportamento dos wizards: só o texto do botão de passo muda, para "Previous step".
- `collapseIfSingle` em "Users" ou "Configuration".

### Critérios de aceite
1. O menu segue exatamente a tabela da seção 1, para cada papel.
2. Nenhum item de menu leva a uma rota que o guard bloqueia para o papel logado.
3. `DashboardPage`, `AnalyticsPage` e `InspectorWorkloadPage` não renderizam mais botões "Analytics", "Workload" nem "Dashboard" no cabeçalho, e não têm "Back". O resto da tela fica idêntico; o diff só remove código de cabeçalho, imports e comentários.
4. As 15 sub telas da seção 4 mostram um botão de cabeçalho com ícone + texto "Back" (`aria-label="Back"`) antes do título. Nenhuma mantém um "Go back", um link-texto ou um "Back" em `secondaryActions` no cabeçalho.
5. Com histórico, o Back volta para a tela anterior; sem histórico, vai para o fallback da seção 4 (por papel no `TenantDetailPage`).
6. Nas telas de criação com formulário alterado, o Back abre o diálogo de descarte e não navega.
7. `PageHeader` sem `backTo` funciona fora de router; os testes antigos de `PageHeader.test.tsx` passam sem mudança.
8. Nos wizards (`AppointmentImportPage`, preview e confirmação; `ServiceGroupCreatePage`, passo 2), o botão de passo anterior se chama "Previous step" e mantém o comportamento. Cada tela tem um único botão chamado "Back".
9. O botão é focável por Tab, aciona com Enter e Espaço e mostra o anel de foco no teclado.
10. Lint com `--max-warnings 0`, typecheck e testes do web passam.
11. Depois de login por link direto, de um redirect ou de mudar filtro/aba/drawer gravado com `replace` numa tela aberta direto, o Back vai para o fallback; nunca é no-op nem sai do app (L-X01-01).
12. `NAV_ITEMS` e `filterNavItems` são exportados; `filterNavItems(NAV_ITEMS, 'AM')` compila; a ordem dos filhos segue a tabela canônica; os testes de menu rodam sem mocks de `SidebarSubmenu`/`SidebarItem` (L-X01-02/03).
13. Board mantém "List" e "Map View"; Import ignora o Back durante o commit; o `EmptyState` de erro do `TenantDetailPage` leva CL_ADMIN a `/dashboard` sem toast (L-X01-05/06/07).
14. `apps/web/CLAUDE.md` sem as cláusulas de transição de N2/N3 e memória `project_dashboard_cluster_header_nav` atualizada no próprio PR (L-X01-04).

### Smoke manual (P7)
Pré-requisito: backend e web locais com seed. Usar contas AM, CL_ADMIN e INSP.

1. **AM, menu**
   - O hover ou clique em "Dashboard" abre o flyout com Overview, Analytics e Workload.
   - Cada link abre a tela certa, com o grupo ativo.
   - Tab até o gatilho → Enter abre → Tab percorre os links → Esc fecha e devolve o foco.
2. **CL_ADMIN, menu:** o flyout tem só Overview e Analytics.
3. **INSP, menu:** "Dashboard" é um link simples que vai direto para `/dashboard`.
4. **Os três dashboards**
   - Nenhum botão de cluster e nenhum "Back".
   - Comparando com develop, cards, gráficos, períodos e o seletor de semana estão iguais.
5. **AM, histórico**
   - `/map` → "List view" → `/appointments` → abrir um appointment → Back volta para a lista com os mesmos filtros → Back volta para o mapa.
6. **Link direto:** colar `/appointments/<id>` numa aba nova → Back → `/appointments`.
   - Deslogado: colar `/appointments/<id>` → login → Back → `/appointments` (L-X01-01).
   - Entrada direta em `/appointments`, mudar um filtro → Back → `/map`.
7. **Nova aba:** abrir `/service-groups/<id>` com Ctrl/Cmd+clique na lista → Back na aba nova → `/service-groups`.
8. **Confirmação de descarte:** `/properties/new`, preencher um campo, Back → o diálogo abre → Cancel fica → Discard volta.
9. **Query no fallback:**
   - entrar direto em `/integrations/fy-api` → Back → `/integrations` na aba API Keys;
   - entrar direto em `/service-groups` → Back → mapa no modo grupos.
10. **Settings**
    - Pelo menu do usuário: Account settings → Back → volta para a tela anterior.
    - Entrada direta em `/settings/account` → abrir a aba Security → Back → `/dashboard`.
    - Entrada direta em `/settings/security` (redirect) → Back → `/dashboard`.
11. **Tenants**
    - CL_ADMIN, entrada direta em `/tenants/<id do próprio tenant>` → Back → `/dashboard`, sem toast de permissão.
    - AM, mesma entrada → Back → `/tenants`.
    - CL_ADMIN com erro de carga (ex.: backend parado) → "Back to Dashboard" no `EmptyState` → `/dashboard`, sem toast.
12. **Teclado e foco:** em 3 sub telas, Tab a partir do topo do conteúdo chega primeiro no Back, com o anel de foco visível; Enter navega.
13. **Mobile (375px):** em uma sub tela com `primaryAction`, o Back (ícone + texto) fica à esquerda do título, sem quebrar o título, e o FAB continua.
14. **Import:** no passo de preview, o "Back" de cabeçalho sai para `/appointments` e o "Previous step" volta ao upload. Durante o commit, clicar em Back não sai da tela e o relatório final aparece.
15. **Service group:** no passo 2 de `/service-groups/new`, o "Previous step" volta ao passo 1 e o "Back" de cabeçalho sai (com confirmação se o formulário foi alterado).
16. **Board:** "List" e "Map View" continuam ao lado do Back.
17. **Refresh com histórico:** `/map` → `/appointments/<id>` → F5 → Back → `/map` (o `idx` sobrevive ao refresh).

### Dependências
- Não depende de nada.
- Deve entrar **antes** de F02 (Inspector notices), F05 (Live Day), F07 (Inspector performance) e F08 (Goals & rewards). Essas features acrescentam filhos AM/OP ao `submenu` deste grupo **na posição da ordem canônica** (seção 1), testam o menu sem mocks de `SidebarSubmenu`/`SidebarItem`, e usam `backTo`/`BackButton` nas sub telas novas seguindo a regra de fallback por papel (L-X01-02/03/08).

### Riscos e armadilhas
- O `useGoBack` depende de `history.state.idx` (browser router) e de `location.key` (router de memória). Testes que clicam em "Back" precisam de router (`createMemoryRouter` + `RouterProvider`). Por isso o hook fica no `BackButton`, e não no `PageHeader`.
- Testes de memória que fazem `replace` e esperam o fallback precisam stubar `history.state.idx = 0`; sem o stub, o critério por `key` escolhe `navigate(-1)`. Limpar o stub no `afterEach` para não vazar entre testes.
- A mudança no `useGoBack` atinge todos os consumidores (`AppErrorBoundary`, detalhes, criação). Rodar a suíte inteira do web, não só as páginas tocadas.
- Remover os mocks de `SidebarSubmenu`/`SidebarItem` pode exigir `user.hover`/`user.click` para abrir o flyout e um `matchMedia` de desktop; o mobile mostra os links expandidos.
- O CTA principal duplicado (desktop + FAB) exige `getAllByRole` (memória `project_pageheader_duplicate_cta_buttons`).
- Testes de wizard que hoje procuram o "Back" de passo (`ServiceGroupCreatePage.test.tsx` ~:264/~:271 e os casos de passo do `AppointmentImportPage.test.tsx`) passam a procurar "Previous step". Atualizar no mesmo passo.
- Testes que hoje usam `getByText('Back')` (`PropertyCreatePage.test.tsx` ~:121 e ~:261) continuam achando um único elemento, mas agora dentro do `BackButton`. Conferir.
- Imports órfãos em Analytics, Workload e nos detalhes (`handleBack`, `useNavigate`, `usePermissions`) quebram o lint com zero warnings.
- O cache incremental do typecheck do web pode mentir: rodar limpo.
- O `@properfy/shared` precisa estar buildado antes do typecheck do web.

### Dias · Branch · Verificação
- **Dias:** 2,25 (P1 0,5 · P2 0,25 · P3 0,5 · P4 0,25 · P5 0,25 · P6 0,25 · P7 0,25). Acréscimos de 2026-10-29: P1 +0,25 (testes sem mocks, exports, ordem canônica: L-X01-02/03); P3 +0,25 (critério `idx` no `useGoBack` e contrato `onClick(goBack)`: L-X01-01/08). L-X01-04/05/06/07 cabem nos passos existentes.
- **Branch:** `feat/web-nav-dashboard-group-back-button`, em worktree a partir de `develop`, com PR para `develop`. Commit: `feat(web): dashboard menu group and standard back button`.
- **Verificação:**
  - `pnpm --filter @properfy/shared build`
  - `pnpm --filter web lint`
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test`
  - `git diff --stat origin/develop... | tail -1` (≤ 150)
  - Remove the transition clause of rules N2, N3 from `apps/web/CLAUDE.md` in this PR (X00 L-04). (2026-10-29, L-X00-04; mesmo trabalho do P7.1 e do critério 14. Se o X01 mergear antes da X00, a X00 escreve N2/N3 já no estado final e esta linha é dispensada.)
  - Smoke manual acima.

### Deploy / rollout / rollback (L-X01-04)
- Só front (web). Sem migração, sem endpoint, sem dado novo, sem flag.
- O grupo Dashboard e o Back aparecem no próximo carregamento do app; o `stale chunk retry` cobre os imports lazy das páginas.
- Rollback: reverter o PR. Nada a desfazer em banco ou storage; o `apps/web/CLAUDE.md` volta junto com o revert.

---

## Inventário de sub telas

| rota | página (arquivo em `apps/web/src/features/`) | já tem voltar? | volta para (fallback) |
|---|---|---|---|
| `/appointments` | `appointments/pages/AppointmentListPage.tsx` | não | `/map` |
| `/appointments/board` | `appointments/pages/AppointmentBoardPage.tsx` | não | `/appointments` |
| `/appointments/import` | `appointments/pages/AppointmentImportPage.tsx` | `<Link>` improvisado | `/appointments` |
| `/appointments/:id` | `appointments/pages/AppointmentDetailPage.tsx` | sim, `useGoBack` improvisado | `/appointments` |
| `/properties/new` | `properties/pages/PropertyCreatePage.tsx` | sim, `useGoBack` + confirmação de descarte | `/properties` |
| `/properties/:id` | `properties/pages/PropertyDetailPage.tsx` | sim, `useGoBack` improvisado | `/properties` |
| `/contacts/:id` | `contacts/pages/ContactDetailPage.tsx` | sim, `useGoBack` improvisado | `/contacts` |
| `/service-groups` | `service-groups/pages/ServiceGroupListPage.tsx` | não | `/map?mode=groups` |
| `/service-groups/new` | `service-groups/pages/ServiceGroupCreatePage.tsx` | sim, `useGoBack` + confirmação de descarte | `/service-groups` |
| `/service-groups/:id` | `service-groups/pages/ServiceGroupDetailPage.tsx` | sim, `useGoBack` improvisado | `/service-groups` |
| `/tenants/:tenantId` | `tenants/pages/TenantDetailPage.tsx` | não (só no `EmptyState`) | `/tenants` (AM/OP) · `/dashboard` (CL_ADMIN) |
| `/integrations/fy-api` | `integrations/pages/FyIntegrationPage.tsx` | sim, link-texto | `/integrations?tab=api-keys` |
| `/integrations/:provider` | `integrations/pages/IntegrationDetailPage.tsx` | sim, link-texto | `/integrations` |
| `/settings/account` | `settings/pages/AccountSettingsPage.tsx` | não | `/dashboard` |
| `/financial/invoices` | `financial/pages/InvoicesPage.tsx` | não | `/financial/entries` |

**Fora do inventário:**

| rota | motivo |
|---|---|
| `/dashboard`, `/analytics`, `/inspector-workload` | telas de topo do menu (grupo Dashboard). Analytics e Workload só perdem os botões de cluster, conforme a regra "dashboards existentes não mudam, exceto a remoção autorizada" |
| `/notification-consents` (`notification-consents/pages/ConsentLookupPage.tsx`, AM/OP) | fora do escopo: não tem item de menu nem link de entrada no web (só URL direta). Não ganha voltar nem item de menu nesta tarefa |
| `appointments/list`, `appointments/new`, `appointments/map`, `properties/map`, `properties/import`, `service-groups/map`, `settings`, `settings/security` | só redirecionam (`<Navigate replace>`) |
| demais telas de topo (`/map`, `/properties`, `/contacts`, `/financial/entries`, `/my-financial`, `/reports`, listas de Users/Configuration, `/marketplace`, `/availability-slots`, `/audit-logs`) | telas de topo do menu |
| telas públicas e `AppErrorBoundary` | fora do escopo por decisão |

## Achados para revisão

- Nenhum achado em aberto. (Os totais do X01 e do README, de 2,0 para 2,25 depois das lacunas de 2026-10-29, serão atualizados pelo coordenador.)

## Ajustes necessários em outras tarefas (para reconciliar)

- `tarefas/X00-tarefas.md` (N3): trocar "`location.key === 'default'` on a fresh tab or direct load" por "first history entry (`history.state.idx === 0`, kept by `replace`)" e escrever `onBack(goBack)`; acrescentar a N3 a regra "`backTo` must be a route every role of the sub-screen can open, otherwise compute per role" e a N2 a ordem canônica do grupo Dashboard (L-X01-01/03/08).
- `tarefas/F05-tarefas.md` (passo 4 do menu e teste 10): Live Day entra **logo depois de Overview**, não "depois de Workload"; `Sidebar.roles.test.tsx` sem mocks de `SidebarSubmenu`/`SidebarItem` (L-X01-02/03).
- `tarefas/F02-tarefas.md` (N1 e passo "Menu"): Inspector notices entra **entre Live Day e Analytics**, não "depois de Workload"; asserção por rótulo, testes sem mocks (L-X01-02/03).
- `tarefas/F07-tarefas.md` (passo 3 e teste 1): Inspector performance fica depois de Workload e antes de Goals & rewards, conforme a tabela canônica; testes sem mocks (L-X01-02/03).
- `tarefas/F08-tarefas.md` (menu): Goals & rewards é o último filho do grupo Dashboard; testes de menu por rótulo, sem mocks (L-X01-02/03).
- `tarefas/F02-tarefas.md`, `F05-tarefas.md`, `F07-tarefas.md`, `F08-tarefas.md` (sub telas novas com `backTo`): aplicar a regra de fallback por papel e rodar o teste P-b com o papel mais restrito; overrides usam `onBack(goBack)` (L-X01-08).
