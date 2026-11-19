# X01 · Lacunas

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 8 | 1 | 3 | 4 |

Revisão read-only de `tarefas/X01-tarefas.md` contra `X01-navegacao-web.md`, `README.md`, `decisoes.md`, as tarefas F02/F05/F07/F08 e o snapshot de `origin/develop` (`apps/web/src`). Tudo o que já está nas tabelas "Decisões aplicáveis" foi tratado como fechado e não aparece aqui.

---

## L-X01-01 · O critério `location.key !== 'default'` quebra depois de qualquer navegação `replace` (login, redirects, filtros e abas na URL)

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X01-1 · "Contexto no código" (linha "Login e redirects usam `replace`… o 'anterior' nunca é o login"), seção 2 (tabela de casos do `BackButton`), seção 4 (`AccountSettingsPage`: "vale para `/settings/account?tab=security`"), seção 5 ("Chegar pelo redirect `/appointments/new`…"), smoke 6, 10 e 11.
- **O que falta / está ambíguo:** a tarefa assume que `location.key === 'default'` identifica "tela aberta direto". No React Router 6.28 (`@remix-run/router`), **todo `replace` gera uma `key` nova**; só a primeira entrada do router tem `'default'`. Depois de um `replace`, o `useGoBack` escolhe `navigate(-1)` mesmo quando o histórico do app tem uma única entrada. Casos concretos que a tarefa trata como "fallback" mas que viram `navigate(-1)`:
  1. **Link direto deslogado** (e-mail, sessão expirada): `ProtectedRoute` → `<Navigate to="/login" replace>` → `LoginPage.tsx:65` `navigate(consumePostLoginRedirect(), { replace: true })` → a sub tela chega com `key` aleatória.
  2. **Rotas que só redirecionam** abertas direto: `/settings/security` → `/settings/account?tab=security` (`SecuritySettingsPage.tsx`), `/appointments/new` → `/appointments?new=1`, `/appointments/list`, `/service-groups/map`.
  3. **Estado de URL gravado com `replace: true`** na própria sub tela: `hooks/useUrlFilters.ts:61,90` (usado por `useAppointmentList`, `useAppointmentBoard`, `useContactList`, `usePropertyList`, `useTenantAdminList`), `AppointmentListPage.tsx:87` (fechar o drawer `?new=1`) e `AccountSettingsPage.tsx:31` (troca de aba). Basta mudar um filtro ou uma aba em `/appointments`, `/appointments/board` ou `/settings/account` abertos direto para o Back deixar de ir ao fallback.
  Em aba nova (`history.length === 1`) o `history.back()` é um no-op silencioso: botão morto. Se a aba veio de outro site, o Back sai do app.
- **Por que importa:** o objetivo 2 ("quando a tela foi aberta direto … vai para a tela pai") e os critérios 5 e 9 ficam falsos nos cenários mais comuns de link direto. O smoke 6 ("colar `/appointments/<id>` numa aba nova → Back → `/appointments`") só passa se o usuário já estiver logado e não tocar em nada; o smoke 10 ("entrada direta em `/settings/account` → Back → `/dashboard`") falha assim que a aba Security é aberta; o smoke 11 falha para `/settings/security`. A afirmação "o 'anterior' no histórico nunca é o login nem uma rota de redirect" é verdadeira, mas a conclusão (fallback) não é: o anterior passa a **não existir** e o `useGoBack` mesmo assim chama `navigate(-1)`.
- **Evidência:** `apps/web/src/hooks/useGoBack.ts:22-28`; `apps/web/src/app/ProtectedRoute.tsx:12-14`; `apps/web/src/features/auth/pages/LoginPage.tsx:65`; `apps/web/src/features/settings/pages/SecuritySettingsPage.tsx:9`; `apps/web/src/features/settings/pages/AccountSettingsPage.tsx:31`; `apps/web/src/hooks/useUrlFilters.ts:61,90`; `apps/web/src/features/appointments/pages/AppointmentListPage.tsx:87`; `apps/web/src/app/router.tsx:199,205,218,332,485`. Memória `project_detail_back_button_newtab` descreve só o caso "primeira entrada".
- **Proposta de regra/detalhe:** trocar o critério de "há histórico do app" por **índice da entrada no histórico**, que o data router grava em `window.history.state.idx` (`0` na primeira entrada; `replace` preserva o índice; `push` incrementa). Regra em `useGoBack`: `const idx = window.history.state?.idx; const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';` (o fallback para `key` mantém os testes com `MemoryRouter`/`createMemoryRouter`, que não gravam `idx`). Adicionar em `hooks/useGoBack.test.tsx` dois casos: (a) entrada inicial + `navigate(replace)` → clique → fallback; (b) `idx` stubado em `0` com `key` aleatória → fallback. Reescrever a linha do "Contexto no código" e os casos de borda de `/appointments/new` e `/settings/security` de acordo. Acrescentar ao smoke: "deslogado, colar `/appointments/<id>` → login → Back → `/appointments`" e "entrada direta em `/appointments`, mudar um filtro, Back → `/map`".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Corrigir o `useGoBack` com `history.state.idx` como acima (muda um hook compartilhado, inclusive o `AppErrorBoundary`, mas só no sentido de acertar o fallback; ~0,1 dia).
  2. Manter o critério atual e registrar na tarefa que, após login por link direto, redirect ou mudança de filtro/aba, o Back é no-op em aba nova; ajustar smoke 6/10/11 para "usuário logado, sem tocar em filtros".
  3. Tratar só o login: `LoginPage` navega para o destino com `state: { fromLogin: true }` e o `useGoBack` cai no fallback quando esse `state` existe. Não cobre redirects nem filtros.

---

## L-X01-02 · Os testes S1–S6 do menu não podem ser provados nos arquivos indicados: `Sidebar.roles.test.tsx` e `Sidebar.test.tsx` mockam `SidebarSubmenu` e `SidebarItem` como `<div>`

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X01-1 · "Testes primeiro (TDD)" → `Sidebar.roles.test.tsx` (S1–S7) e teste de `filterNavItems` (F1–F4); critério de aceite 1.
- **O que falta / está ambíguo:** S1 exige `button { name: 'Dashboard' }` com `aria-haspopup="menu"` e "ao abrir: links…"; S4 exige `getByRole('link', { name: /Dashboard/ })` com `href`; S5/S6 exigem o indicador `bg-realty`. Nos dois arquivos de teste citados, `SidebarSubmenu` e `SidebarItem` são substituídos por mocks sem `role`, sem `href` e sem classes (`Sidebar.roles.test.tsx:12-30`, `Sidebar.test.tsx:9-13`). Com os mocks, nenhuma dessas asserções é possível; sem os mocks, os testes atuais de visibilidade por papel (`getByText`) continuam funcionando, mas a tarefa não diz para removê-los. O mesmo vale para F02 N1, F05 (item 10) e F07 (teste 1), que esperam `getByRole('link', { name: 'Live Day' })` nesses arquivos.
- **Por que importa:** o implementador ou escreve S1–S6 contra os mocks (passam vazios e não provam o critério 1) ou reescreve o arquivo inteiro sem orientação. Como F02/F05/F07/F08 estendem exatamente esses testes, a escolha vira contrato para quatro PRs.
- **Evidência:** `apps/web/src/components/shell/Sidebar.roles.test.tsx:12-30` (mocks); `apps/web/src/components/shell/Sidebar.test.tsx:9-13`; `apps/web/src/components/shell/SidebarSubmenu.tsx:120-124` (gatilho real com `aria-haspopup`), `:160` (`role="menu"`), `:166` (`role="menuitem"`).
- **Proposta de regra/detalhe:** registrar na tarefa que `Sidebar.roles.test.tsx` **remove os mocks de `SidebarSubmenu` e `SidebarItem`** (mantém os de `useAuth`, `SidebarUser` e `SidebarUserMenu`) e renderiza com `MemoryRouter` + `initialEntries` por caso; S1 abre o flyout com `user.click` no gatilho (ou `user.keyboard('{Enter}')`) e lê os `menuitem`; S5/S6 leem o indicador pelo `data-testid` ou pela classe do `<span>` irmão do gatilho. Os testes existentes de `getByText` ficam válidos sem os mocks. Os casos F1–F4 de `filterNavItems` ficam em `Sidebar.test.tsx`, que pode manter os mocks porque não renderiza. Dizer explicitamente que F02/F05/F07/F08 seguem esse mesmo arranjo.
- **Precisa de decisão do dev?** Não.

---

## L-X01-03 · Contrato com F02/F05/F07/F08: ordem dos filhos futuros, exportações (`NAV_ITEMS`) e assinatura de `filterNavItems` não estão fixados

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X01-1 · seção 1 ("Itens futuros"), "Escopo / Passos" P1, "Dependências".
- **O que falta / está ambíguo:**
  1. **Ordem dos filhos.** F02 (N1) diz que "Inspector notices" vem "depois de Workload"; F07 (passo 3) diz que "Inspector performance" vem "depois de Workload"; F05 (item 10) só exige presença; F08 não diz nada. As quatro features entram em ondas diferentes (F02 na 2, F05 na 4, F07/F08 na 5), então "depois de Workload" vai significar posições diferentes conforme a ordem de merge, e os testes de F02 e F07 podem se contradizer. O X01, dono do grupo, não fixa a ordem final nem a regra de inserção.
  2. **Exportações.** O X01 manda exportar só `filterNavItems`. F05 (item 10) chama `filterNavItems(NAV_ITEMS, 'AM')`: precisa de `NAV_ITEMS` exportado e de `clUserPermissions` opcional. Hoje o terceiro parâmetro é obrigatório (`string[] | undefined`), então a chamada com dois argumentos não compila.
- **Por que importa:** cada feature vai decidir a posição sozinha e os testes de uma podem quebrar os da outra (F07 já registra esse risco em "Riscos e armadilhas": "comparar por rótulo, não por índice"). Um `NAV_ITEMS` não exportado força F05 a mudar o `Sidebar.tsx` além do próprio item.
- **Evidência:** `tarefas/F02-tarefas.md:873` ("depois de Workload"); `tarefas/F07-tarefas.md:1052` ("depois de 'Workload'") e `:1133`; `tarefas/F05-tarefas.md:1040` (`filterNavItems(NAV_ITEMS, 'AM')`); `tarefas/F08-tarefas.md:887`; snapshot `apps/web/src/components/shell/Sidebar.tsx:72-76` (assinatura de `filterNavItems`, `NAV_ITEMS` não exportado).
- **Proposta de regra/detalhe:** acrescentar à seção 1 uma tabela com a **ordem canônica** do `submenu` e a regra "cada feature insere o seu filho na posição da tabela, sem placeholder; testes de menu asseguram presença por rótulo, nunca índice". Exportar `NAV_ITEMS` e `filterNavItems`, e tornar `clUserPermissions` opcional (`clUserPermissions?: string[]`). Registrar que F02 N1 e F07 passo 3 passam a seguir a tabela.
- **Precisa de decisão do dev?** Sim (só a ordem).
  1. **(Recomendada)** Operação primeiro, depois análise: Overview · Live Day (F05) · Inspector notices (F02) · Analytics · Workload · Inspector performance (F07) · Goals & rewards (F08).
  2. Ordem de entrega: Overview · Analytics · Workload · Inspector notices · Live Day · Inspector performance · Goals & rewards.
  3. Ordem alfabética depois de Overview.

---

## L-X01-04 · Falta o passo de documentação exigido por X00/README: remover a cláusula de transição de `apps/web/CLAUDE.md` e atualizar a memória no próprio PR

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X01-1 · "Escopo / Passos" (P1–P7) e "Dias · Branch · Verificação".
- **O que falta / está ambíguo:** o README ("Regras do dev") diz que "cada feature atualiza o CLAUDE.md do workspace que mudar, como passo do próprio PR". O X00 (conflito C03) escreve as regras N2 (grupo Dashboard) e N3 (Back navigation) no `apps/web/CLAUDE.md` com uma cláusula "introduced by X01; until it merges…" e determina que **"o PR do X01 remove a cláusula"**. O X01 não tem esse passo, não cita o `apps/web/CLAUDE.md` e deixa a memória `project_dashboard_cluster_header_nav` (que hoje diz "não recolocar Analytics/Workload na sidebar") para "depois do merge". Também não há seção de deploy/rollout/rollback, que as outras tarefas trazem.
- **Por que importa:** depois do merge o CLAUDE.md do web fica com uma regra "até o X01 entrar" já vencida, e a memória continua orientando o contrário do que o código faz (um agente futuro pode reverter o grupo, como a memória manda).
- **Evidência:** `README.md:9` ("cada feature atualiza o CLAUDE.md…"); `tarefas/X00-tarefas.md:655` (C03: "O PR do X01 remove a cláusula (regra N11)"); `tarefas/X01-tarefas.md` P7 ("Depois do merge, atualizar a memória"); memória `project_dashboard_cluster_header_nav`; comparação com `tarefas/F07-tarefas.md:1055,1136-1139` (passo "Doc (X00)" e seção de deploy).
- **Proposta de regra/detalhe:** acrescentar **P6.1 · Doc**: em `apps/web/CLAUDE.md`, remover a cláusula de transição de N2/N3 e registrar `BackButton`/`backTo` e o grupo Dashboard como estado atual; atualizar o comentário de `Sidebar.tsx:30-32` (já previsto) e o de `Sidebar.roles.test.tsx:139-141`. Acrescentar uma seção "Deploy / rollout / rollback": só front; o item do menu aparece no próximo carregamento (`stale chunk retry` cobre o lazy import); rollback = reverter o PR, sem migração nem dado. A memória pode ser atualizada no mesmo passo, não "depois do merge".
- **Precisa de decisão do dev?** Não.

---

## L-X01-05 · `AppointmentBoardPage`: não diz se as ações "List" e "Map View" ficam ao lado do Back

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X01-1 · seção 4, linha `AppointmentBoardPage`; critério 3/4.
- **O que falta / está ambíguo:** para `AppointmentListPage` e `ServiceGroupListPage` a tabela diz quais `secondaryActions` ficam. Para o Board só diz o fallback. Hoje o Board tem `secondaryActions` "List" (volta para `/appointments` com `location.search`) e "Map View". "List" faz o mesmo que o Back com histórico, e o implementador pode tanto removê-la (para não duplicar) quanto mantê-la.
- **Por que importa:** o critério 4 proíbe "um 'Back' em `secondaryActions`", e "List" é um voltar com outro nome; sem regra, o diff do Board varia e o teste P-a/`AppointmentBoardPage.test.tsx` não sabe o que esperar.
- **Evidência:** `apps/web/src/features/appointments/pages/AppointmentBoardPage.tsx:180-187`.
- **Proposta de regra/detalhe:** acrescentar na linha do Board: "as ações 'List' e 'Map View' ficam (mesma regra do `ServiceGroupListPage`, cuja 'Map View' duplica o fallback)". Teste: as duas ações continuam presentes.
- **Precisa de decisão do dev?** Não.

---

## L-X01-06 · `AppointmentImportPage`: o Back de cabeçalho fica habilitado durante o commit, enquanto o "Previous step" é desabilitado

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X01-1 · seção 3 ("desabilitado: não existe"), seção 5 ("durante o commit continua `disabled`").
- **O que falta / está ambíguo:** o botão de passo é `disabled={isCommitting}` justamente para impedir sair do passo durante a importação. O Back de cabeçalho, por decisão, nunca é desabilitado e não tem override nessa tela, então navega para `/appointments` com o commit em andamento. O `<Link>` atual tem o mesmo defeito, mas a tarefa transforma esse comportamento em padrão sem o registrar.
- **Por que importa:** o usuário sai da tela no meio do commit e perde o relatório final (importados × falhas); o commit continua no servidor, sem feedback.
- **Evidência:** `apps/web/src/features/appointments/pages/AppointmentImportPage.tsx:295` (`disabled={isCommitting}`), `:146-153` (Link sempre habilitado).
- **Proposta de regra/detalhe:** registrar como comportamento aceito ("igual ao Link atual") **ou** usar o override: `onBack` que, com `isCommitting`, não navega (o `BackButton` continua habilitado, só ignora o clique) e, no mais, chama `goBack`. Teste: no passo de confirmação com commit em andamento, clicar em Back mantém a rota.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Override `onBack` ignorando o clique durante `isCommitting` (sem mudar a regra "sem estado desabilitado").
  2. Aceitar e registrar que o Back navega durante o commit, como o Link de hoje.

---

## L-X01-07 · `TenantDetailPage` para CL_ADMIN: o `EmptyState` "Back to Agencies" continua levando a `/tenants`, rota que o guard nega

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X01-1 · seção 4 (linha `TenantDetailPage`: "o `EmptyState` 'Back to Agencies' fica"), seção 5 ("O papel não pode abrir o fallback: só o `TenantDetailPage` para CL_ADMIN, já tratado"), smoke 11 ("sem toast de permissão").
- **O que falta / está ambíguo:** a tarefa calcula o fallback por papel para o `BackButton`, mas mantém o `handleBack` da página (`navigate('/tenants')`) no `EmptyState` de erro. Para CL_ADMIN (único papel que chega nesta tela sem passar por `/tenants`), o erro de carga leva a `/tenants` → `AuthGuard` → toast "You do not have permission" → `/dashboard`.
- **Por que importa:** contradiz o espírito do critério 2 e do smoke 11 ("sem toast de permissão") na mesma tela; é defeito pré-existente, mas a tarefa passa a ter o valor por papel calculado na página e não o reaproveita.
- **Evidência:** `apps/web/src/features/tenants/pages/TenantDetailPage.tsx:69-71,123-126`; `apps/web/src/app/router.tsx:386-398`; `apps/web/src/app/AuthGuard.tsx:24-37`.
- **Proposta de regra/detalhe:** o `EmptyState` usa o mesmo `backTo` por papel calculado para o cabeçalho (`navigate(backTo)`), com rótulo "Back to Agencies" para AM/OP e "Back to Dashboard" para CL_ADMIN. Teste: CL_ADMIN em erro → clique → `/dashboard`. Se preferir não tocar, registrar explicitamente como fora do escopo.
- **Precisa de decisão do dev?** Não.

---

## L-X01-08 · `BackButton` com `onClick`: não diz se o `type`, o foco e a prop `to` continuam obrigatórios, nem o que acontece se `to` for uma rota de outro papel

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X01-1 · seção 2 (API) e seção 5 ("Nas outras telas, o fallback aceita os mesmos papéis da sub tela (conferido no router)").
- **O que falta / está ambíguo:** (a) com `onClick`, `to` continua obrigatório, mas o componente ainda chama `useGoBack(to)` — e a tarefa não diz se o `onClick` recebe o `goBack` como argumento (as páginas de criação precisam chamar o próprio `goBack` com o mesmo fallback: hoje `PropertyCreatePage.tsx:28` e `ServiceGroupCreatePage.tsx:31` têm um `useGoBack` próprio, o que gera dois hooks com o mesmo caminho e duas fontes de verdade para o fallback); (b) a afirmação "o fallback aceita os mesmos papéis" foi conferida no router e está correta para as 15 telas (`/map`, `/appointments`, `/properties`, `/contacts`, `/service-groups`, `/integrations`, `/financial/entries`, `/dashboard`), mas a tarefa não a transforma em teste nem em regra para F02/F05/F07/F08, que vão criar sub telas novas com `backTo`.
- **Por que importa:** sem (a), as páginas com confirmação de descarte mantêm `useGoBack` duplicado e o `to` do `BackButton` pode divergir do `goBack` da página; sem (b), uma feature futura pode apontar `backTo` para uma rota que o papel não abre, repetindo o problema do `TenantDetailPage`.
- **Evidência:** `apps/web/src/features/properties/pages/PropertyCreatePage.tsx:28,160-170`; `apps/web/src/features/service-groups/pages/ServiceGroupCreatePage.tsx:31,92-109`; `apps/web/src/app/router.tsx:178-193,241-293,305-325,353-358,429-450`.
- **Proposta de regra/detalhe:** (a) definir `onClick?: (goBack: () => void) => void`: o `BackButton` passa o seu `goBack` para o override, e as páginas de criação usam esse `goBack` no "Discard" (removendo o `useGoBack` próprio) — ou registrar que o `useGoBack` duplicado é aceito. (b) Acrescentar regra geral: "o `backTo` de uma sub tela tem de ser uma rota cujo `AuthGuard` inclua todos os papéis da própria sub tela; se não for possível, calcular por papel como no `TenantDetailPage`", e um caso de teste por tela (P-b já cobre, basta dizer que roda com o papel mais restrito que acessa a tela).
- **Precisa de decisão do dev?** Não.
