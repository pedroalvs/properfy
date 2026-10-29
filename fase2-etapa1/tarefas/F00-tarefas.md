# F00 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | [F00 · Janela de período do mapa](../F00-janela-periodo-mapa.md) — contrato E.1, E.2 (critérios E.A1, E.A2) |
| **Tarefas** | 1 |
| **Total** | **3,0 dias** (plano 2,0 + 0,25 da ampliação restrita do RBAC da OP, decidida em 2026-10-27, + 0,75 das lacunas L-F00-01/04/05/07 aplicadas em 2026-10-29) |
| **PRs** | 1 (~27 arquivos, contando a regeneração do api-types) |
| **Depende de** | – |
| **Código verificado em** | `origin/develop` @ `042a9674` |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F00-1 | Janela padrão de período no `/map` + `mapWindowDays` por agência (AM/OP) | 3,0 | – |

---

## TASK-F00-1 · Janela padrão de período no `/map` + `mapWindowDays` por agência

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-X01-1, TASK-X02-1, TASK-X03-1, TASK-F03-1
> - **Pista sugerida (time de 6):** D · Web

### Objetivo

Hoje o `/map` abre com todos os appointments. Depois desta tarefa:

- o mapa abre mostrando só o período de **hoje até hoje+N** (inclusive), nos dois modos (appointments e groups);
- N vem da configuração da agência (`mapWindowDays`), com padrão de plataforma **14**;
- AM e OP podem remover a janela pelo chip (visível também com o painel de filtros fechado); CL_ADMIN e CL_USER não podem, mas veem um rótulo estático do período;
- AM e OP podem editar `mapWindowDays` de qualquer agência no drawer de agência; CL_ADMIN não pode.

### Contexto no código (verificado)

**Mapa (web)**
- Rota `/map`: AM/OP/CL_ADMIN/CL_USER (`apps/web/src/app/router.tsx`, `Sidebar.tsx`).
- `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx` (1.529 linhas):
  - estado inicial `useState(DEFAULT_APPOINTMENT_FILTERS)` / `useState(DEFAULT_GROUP_FILTERS)` (~l.323-324);
  - `appointmentParams` envia `fromDate`/`toDate` só quando `dateFrom`/`dateTo` não são vazios (~l.387-388);
  - `groupParams` envia `scheduledDateFrom`/`scheduledDateTo` da mesma forma (~l.428-429);
  - a query de appointments usa `useAllPagesQuery(['appointments-map'], '/v1/appointments', params, { enabled: true, … })`. A de groups usa `enabled: isGlobalRole` (o modo groups é só AM/OP);
  - `isGlobalRole = hasRole('AM','OP')`; `tenantId = user?.tenantId` (CL);
  - o filtro de agência (`appointmentFilters.tenantId`) existe **só no modo appointments**. `GroupModeFilters` não tem `tenantId`.
- `apps/web/src/features/appointments/components/AppointmentMapFilterPanel.tsx`: define `AppointmentModeFilters`, `GroupModeFilters`, `DEFAULT_APPOINTMENT_FILTERS` (statuses `['DRAFT','REJECTED']`, datas `''`) e `DEFAULT_GROUP_FILTERS` (statuses `['PUBLISHED','ACCEPTED']`, datas `''`). Usa `FilterDateRange` (label "Date Range") nos dois modos. **Não existe botão "Limpar"** no painel.
- `apps/web/src/components/filters/FilterDateRange.tsx`: props `label/startDate/endDate/onStartChange/onEndChange`, sem `min/max`. O `DateInput` interno (`apps/web/src/components/forms/DateInput.tsx`) já aceita `min`/`max` (marca o campo como inválido, sem bloquear a digitação).
- **Armadilha:** `hooks/useAppointmentMapData.ts:59` exporta `DEFAULT_MAP_FILTERS`, que é **código morto**. Não editar.
- **Painel de filtros nasce fechado (L-F00-01):** `useMapFilterPersistence` inicia `filtersOpen` com `sessionStorage['appointments-map.filters.open'] === 'true'` (fechado por padrão e em storage bloqueado). O `AppointmentMapPage` renderiza `<MapFilterToggleButton open={filtersOpen} onToggle={toggleFilters} />` (~l.1363) sem `activeFilterCount` (badge nunca aparece). Por isso o chip só no painel é invisível na abertura.
- **Todos os filtros passam pelo mesmo callback (L-F00-07):** o `AppointmentMapFilterPanel` chama `onAppointmentFiltersChange({ ...filters, <campo>: v })` para status, branch, `tenantId`, time, search e datas; a página liga isso direto em `setAppointmentFilters`. Não há sinal de "qual campo mudou".
- **Retry padrão do React Query (L-F00-04):** `apps/web/src/app/QueryProvider.tsx` define `staleTime: 30_000` e `retry: failureCount < 2` para 5xx/rede (4xx não repete). Com `enabled: false`, `isLoading` do React Query v5 é `false`, então a página não mostra carregamento e o cabeçalho exibe "0 appointments".
- **URL (L-F00-08):** o `/map` só lê `?mode=groups` (`useMapFilterPersistence.ts`); não lê parâmetros de data da URL e nenhuma tela (`/appointments`, board, `/service-groups`) navega para ele com datas. `?mode=groups` continua sendo o único parâmetro honrado.
- **Matriz de permissões (L-F00-02):** `packages/shared/src/permissions/role-matrix.ts` ("single source of truth") tem `'tenant.update': { roles: ['AM', 'OP'] }` (~l.52-54), sem noção de escopo por chave; nenhum código de backend/web consome `tenant.update` hoje.
- Testes do mapa: `AppointmentMapFilterPanel.test.tsx` (usa as constantes `DEFAULT_*` nas l.5-6, 37, 39, 272, 274, 284), `AppointmentMapPage.test.tsx`, `AppointmentMapPage.filter.test.ts` etc.
- O GET `/v1/tenants/:id` (`get-tenant.use-case.ts`) é liberado para AM/OP (qualquer agência) e para CL_ADMIN/CL_USER (só a própria). A resposta (`tenantResponseSchema`, `packages/shared/src/schemas/responses.ts`) traz `timezone: string` e `settingsJson: unknown`. O hook `apps/web/src/features/tenants/hooks/useTenantAdminDetail.ts` (`useTenantAdminDetail(id | null)`, query key `['tenant-admins', id]`) já faz essa leitura.

**Datas e fuso**
- `civilDateInTimezone` existe só no backend (`apps/backend/src/shared/domain/timezone-date.ts`). No web, usar `todayInTzDateString(tz)` e `addCivilDays(date, n)` de `packages/shared/src/utils/local-date.ts` (exportados por `@properfy/shared`), além de `isValidIanaTimezone` e `PLATFORM_TIMEZONE` (`'Australia/Sydney'`).
- `Tenant.timezone` no Prisma é `String @default("Australia/Sydney")` (não nulo). Mesmo assim, o front trata valor vazio ou inválido como `PLATFORM_TIMEZONE`.
- `appointments.scheduled_date` é `@db.Date` e não nulo: todo appointment tem data, então o filtro de data não esconde "sem data".
- **Não usar `user.timezone` (L-F00-09):** o `useAuth` expõe `user.timezone` (fuso efetivo: agência para CL_*, pessoal para AM/OP), e as outras telas que calculam "hoje" usam `todayInTzDateString(user.timezone)`. Para AM/OP esse é o fuso **pessoal**; a janela usa o fuso da **agência filtrada** (`tenant.timezone`) ou `PLATFORM_TIMEZONE`. Para CL os dois coincidem, mas a fonte é o GET da agência, para que N e fuso venham do mesmo objeto.
- **Defasagem aceita (L-F00-09):** `useUpdateAgencyTimezone` (settings do CL_ADMIN) não invalida `['tenant-admins', tenantId]`; depois de trocar o fuso da agência, o mapa segue com o anterior até o `staleTime` (30 s) ou reload. Aceito, sem mudança.

**Settings da agência (shared/backend)**
- `tenantSettingsSchema` (`packages/shared/src/schemas/tenant.ts:21-87`) é `.passthrough()`. `updateTenantSchema.settings = tenantSettingsSchema.partial().optional()`. O OpenAPI expõe esse schema (`packages/shared/openapi.json` e `src/api-types.ts` contêm `priorityOfferHours`), então mudar o schema **exige regenerar o api-types**.
- `apps/backend/src/modules/tenant/application/use-cases/update-tenant.use-case.ts`:
  - `CL_ADMIN_SETTINGS_ALLOW_LIST` = `primaryColor, notificationFromName, notificationFromEmail, smsFromName, emailTemplates, contactPhone`;
  - RBAC atual: AM tem acesso total. `CL_ADMIN || OP` só passam **com `actor.tenantId === tenantId`**: as chaves de settings fora da allow-list são **descartadas em silêncio** e os campos do topo ficam restritos a `name/appointmentCodePrefix/timezone`. Qualquer outro caso recebe `ForbiddenError('AUTH_FORBIDDEN')` (403);
  - **achado já tratado aqui:** a OP é cross-tenant e o JWT dela **nunca** traz `tenantId` (`commit-appointment-import.use-case.ts:52-53`), então hoje **recebe 403 em PATCH de qualquer agência**. O teste "should reject OP updating another tenant" (`apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts:321`) e o comentário do `TenantFormDrawer` ("OP cannot PATCH tenants") confirmam isso. O `OP` dentro da condição `(CL_ADMIN || OP) && actor.tenantId === tenantId` é **código morto**, assim como o teste "should allow OP to update own tenant (name + settings only)" (l.309), que monta uma OP com `tenantId: 'tenant-1'`, coisa que não existe em produção;
  - hoje, se depois do filtro de permissão não sobra nada, o use case **ainda chama `update`** (o CL_ADMIN gera `settings: {}` → `settingsJson` reescrito igual) e **audita** `tenant.updated` com antes == depois;
  - depois: bloqueia `logoUrl/logoStorageKey` (`ValidationError`), `findById` (404 `TENANT_NOT_FOUND` se não existe ou está deletado), valida prefixo/timezone, `deepMerge(settingsJson, normalizeRentalTenantNotificationSettings(settings))` (o `deepMerge` **não remove chaves**), `tenantRepo.update`, audita `tenant.updated` com before/after e emite `TENANT_EVENTS.UPDATED`.
- Rota `PATCH /v1/tenants/:tenantId` (`apps/backend/src/modules/tenant/interfaces/tenant.routes.ts:154-185`): `authenticate`, valida o body com `updateTenantSchema` (400 `VALIDATION_ERROR`), resposta `200 successResponseSchema(tenantResponseSchema)`.
- Testes: unit `apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts` e integração `apps/backend/tests/integration/tenant/tenant.routes.test.ts` (bloco `PATCH /v1/tenants/:tenantId`, l.245, use case mockado). `apps/backend/tests/integration/rbac/tenants-branches.rbac.test.ts` hoje não tem bloco de PATCH.
- Docs que a sessão futura lê como canônicos (checklist de ampliação de RBAC): `specs/002-tenants-branches/contracts/tenant-endpoints.md` (seção PATCH: "OP (own tenant…)"; as linhas vizinhas ~l.54 list "AM only", ~l.99 GET "OP … own tenant only" e ~l.160 deactivate "OP (own tenant only)" já divergem do código: `list-tenants.use-case.ts:44` aceita AM/OP e o GET libera a OP em qualquer agência), `specs/015-permissions-rbac-matrix/spec.md:98` ("Create/update tenant | AM-only"), `specs/backend/tenant.spec.md`.

**Drawer de agência (web)**
- `apps/web/src/features/tenants/components/TenantFormDrawer.tsx` (272 linhas; já calcula `isDirty` na l.87, mas o botão "Save" (~l.251) não é desabilitado por ele): seções "Agency Information", "Notes" e "Notifications" (esta só para AM, via `hasRole('AM')`, com o comentário "Only AM can change agency settings … OP cannot PATCH tenants").
- `apps/web/src/features/tenants/hooks/useTenantAdminSave.ts`: no PATCH envia `{ ...rest, settings: { rentalTenantNotificationsEnabled, emailSendingEnabled }, appointmentCodePrefix? }` e mapeia caminhos de erro `settings.*` para campos do form.
- `apps/web/src/features/tenants/types/index.ts`: `TenantAdminFormData` e `EMPTY_TENANT_ADMIN_FORM`.
- Quem abre o drawer: `TenantDetailPage` (botão "Edit", sem gate de role; `/tenants/:id` atende AM/OP/CL_ADMIN) e `TenantListPage` (`/tenants`, AM/OP; "New Agency" só para AM).
- PWA: a OP não usa o PWA, então não há nada a mudar lá (o checklist cobre "os dois frontends"; o PWA fica registrado como N/A).

### Decisões aplicáveis

| Data | Tema | Decisão |
|---|---|---|
| 2026-10-27 | Q15 · padrão × limite | **Misto.** AM/OP abrem com a janela e podem removê-la pelo chip. CL (CL_ADMIN, CL_USER) tem a janela fixa, sem chip. **Não há limite no servidor:** o CL já vê os mesmos appointments na lista e na exportação. |
| 2026-10-27 | Início da janela | **Hoje → hoje+N.** Atrasados só aparecem quando AM/OP removem a janela. |
| 2026-10-27 | Q20 · quem edita | **AM e OP.** A OP ganha a ampliação **mais restrita possível**: em **qualquer** agência, grava **só** `mapWindowDays` (lista `OP_EXTRA_SETTINGS_KEYS`, num novo caminho cross-tenant da OP). Todo o resto continua bloqueado para a OP exatamente como hoje. CL_ADMIN não edita. |
| 2026-10-27 | CL_ADMIN enviando `mapWindowDays` | Mantém o comportamento atual: **descartado em silêncio (200)**, como as outras chaves. Sem 403 especial. Critério: o valor não muda e nenhuma auditoria é gravada. |
| 2026-10-27 | PATCH vazio após o filtro | **Aprovado como mudança deliberada de comportamento, para qualquer role:** se depois do filtro de permissão não sobrar nada a gravar, o use case **não chama `update`, não audita e não emite evento**, e devolve o tenant atual (200). Quando algo muda, a auditoria segue normal. |
| 2026-10-27 | Falha no GET da agência no mapa | **Aprovado:** usar N = 14 e o fuso `PLATFORM_TIMEZONE` (Sydney) e liberar a query (o mapa não trava). |
| 2026-10-27 | Várias agências | **Padrão de plataforma 14.** Sem agência filtrada, vale 14. Com uma agência filtrada, vale o `mapWindowDays` dela. CL usa sempre o da própria agência. **O modo groups usa sempre 14** (não tem filtro de agência). |
| 2026-10-27 | Troca de agência | Com a janela ativa, troca da agência filtrada → N e "hoje" são recalculados. Se AM/OP removeram o chip, a janela continua desligada. |
| 2026-10-27 | "Limpar" | Sem botão novo. Só um `resetDates()` interno, que volta para a janela (não para vazio). |
| 2026-10-27 | Datas | `todayInTzDateString`/`addCivilDays` do shared. Fuso = `tenant.timezone`, com fallback `PLATFORM_TIMEZONE`. |
| 2026-10-27 | Interpretação do E.A1 | Remover a janela é uma ação explícita de AM/OP. A spec cita isso como interpretação aprovada. |
| 2026-10-29 | Indicador fora do painel (L-F00-01) | Além do chip no painel, um indicador aparece **fora** do painel, ao lado do `MapFilterToggleButton`, visível com o painel fechado: AM/OP → o mesmo chip removível; CL → rótulo estático sem ✕. Com `windowActive=false`, nada aparece fora do painel. A decisão "CL sem chip" proíbe o chip **removível**; o rótulo de período não remove nada. |
| 2026-10-29 | `role-matrix.ts` (L-F00-02) | Manter `'tenant.update': { roles: ['AM','OP'] }` e acrescentar comentário de escopo (a OP grava só `settings.mapWindowDays`, aplicado no use case). Nenhum `canPerform('tenant.update')` é introduzido no drawer; o gate de seções continua `hasRole`. |
| 2026-10-29 | Contagem de dias e cópia (L-F00-03) | Mantém hoje..hoje+N (N conta os dias **depois** de hoje; o período tem N+1 dias civis; difere de propósito do preset retrospectivo da F09). A cópia passa a dizer o que a conta faz: `Today + {N} days`. |
| 2026-10-29 | GET da agência lento/com erro (L-F00-04) | `retry: false` na leitura da agência pelo mapa (falha → fallback 14/Sydney imediato); enquanto `!windowReady`, a página mostra estado de carregamento ("Loading…") no lugar da contagem. Transição erro → sucesso reaplica a janela se `windowActive` (mesma regra da mudança de N). |
| 2026-10-29 | Datas digitadas pelo CL (L-F00-05) | Clamp no `onChange` para CL (estado = request; o painel sempre mostra o período pedido ao servidor) + texto de ajuda fixo com o período, ligado por `aria-describedby`. `min/max` ficam só como limites do calendário. Substitui o "clamp só na request". |
| 2026-10-29 | Auditoria de PATCH sem mudança (L-F00-06) | Guarda estreita (como já decidido): só não audita quando nada sobra após o filtro de permissão; valores iguais aos atuais continuam gravando e auditando. Para reduzir o ruído antes == depois, o "Save" do drawer fica desabilitado em edição quando `!isDirty` (AM e OP). O plano é corrigido (ver ajustes no fim). |
| 2026-10-29 | Detecção de edição manual (L-F00-07) | Entrada única `onFiltersChange(next)` no hook: troca de `tenantId` → recalcula e reaplica (nunca desliga); mudança de `dateFrom/dateTo` → edição manual (AM/OP desligam; CL clampa); outros campos → passam direto. Reaplicações internas usam setter próprio que não passa pela detecção. AM/OP limpando as duas datas → "sem janela" (equivale ao chip). |
| 2026-10-29 | URL (L-F00-08) | O `/map` não lê datas da URL; `?mode=groups` segue sendo o único parâmetro. A janela vale igual em abertura direta e via `?mode=groups` (groups 14/Sydney; appointments já com `windowActive=true` para a troca de modo). |
| 2026-10-29 | Fonte do fuso (L-F00-09) | Nunca `user.timezone`; sempre `tenant.timezone` do GET (ou `PLATFORM_TIMEZONE`). Defasagem de até 30 s após `useUpdateAgencyTimezone` aceita. |
| 2026-10-29 | Fuso por campo de data (N13 da X00, L-X00-03) | Declarado na seção 4 ("Fuso de cada campo de data"): a janela é data civil no fuso da agência (`tenant.timezone`); sem agência resolvida (AM/OP sem filtro, modo groups, erro no GET) usa `PLATFORM_TIMEZONE`; `users.timezone` nunca entra no cálculo. Não há job nem instante novo. |
| 2026-10-29 | Convivência com a densidade da F09 (L-F09-06) | A camada de densidade da F09 usa `PLATFORM_TIMEZONE` de propósito (Sydney-only por desenho, igual ao backend dela); a janela dos pins da F00 segue `resolveWindowTimezone(tenant.timezone)`. As duas fontes de "hoje" convivem no `AppointmentMapPage` e não devem ser unificadas. |
| 2026-10-29 | Ordem de merge com a F09 (L-F09-09) | A F00 (P2b) e a TASK-F09-1 (P1a, chave `'map.execution_density'`) editam `packages/shared/src/permissions/role-matrix.ts`; quem mergear depois rebaseia e mantém as duas mudanças. |
| 2026-10-29 | Rollout/rollback e docs vizinhos (L-F00-10) | Sem flag. Rollback = revert do PR; sem migration; `mapWindowDays` gravados ficam inertes (`passthrough`) e voltam a valer num re-deploy; sem backfill. O P2b também corrige as linhas da OP em list/GET/deactivate do `tenant-endpoints.md`. |

### Especificação detalhada

#### 1. Campo de setting

| Item | Valor |
|---|---|
| Chave | `settings_json.mapWindowDays` (camelCase dentro do JSONB, como as demais) |
| Schema | `mapWindowDays: z.number().int().min(1).max(90).optional()` em `tenantSettingsSchema` |
| Mínimo / máximo | 1 / 90 (inclusive) |
| Padrão | **sem `.default()` no schema** (não grava 14 em toda agência nem altera o parse de settings existentes). Padrão efetivo = constante `MAP_WINDOW_DAYS_DEFAULT = 14`, exportada de `packages/shared/src/schemas/tenant.ts` |
| Tipo no wire | number inteiro. `"14"` (string) é rejeitado (400) |
| Migration | nenhuma (chave nova em JSONB) |
| Leitura tolerante (front) | `resolveMapWindowDays(settingsJson)`: devolve o valor quando `settingsJson?.mapWindowDays` passa no schema; caso contrário (ausente, null, 0, 91, 7.5, string, legado inválido via passthrough) devolve `MAP_WINDOW_DAYS_DEFAULT` |
| Voltar ao padrão | gravar `14` explicitamente (o `deepMerge` não remove chaves; não existe "apagar") |

#### 2. Contrato `PATCH /v1/tenants/:tenantId` (com o novo caminho da OP)

**Request:** sem mudança de forma (`updateTenantSchema`). Exemplo da OP: `{ "settings": { "mapWindowDays": 30 } }`.

**Validação de rota (antes do use case, todos os roles):** `mapWindowDays` fora de inteiro 1..90 → `400 { error: { code: 'VALIDATION_ERROR', … } }`. Para callers fora da rota, o use case revalida com `tenantSettingsSchema.shape.mapWindowDays` e lança `ValidationError` com `field: 'settings.mapWindowDays'`.

**Regra do use case por ator (ordem de avaliação):**

1. `AM` → como hoje (acesso total, qualquer agência, qualquer chave).
2. `OP` (sempre sem `tenantId` no JWT) → **novo caminho cross-tenant restrito**, que substitui a OP na condição atual `(CL_ADMIN || OP) && actor.tenantId === tenantId` (a condição passa a ser só `CL_ADMIN`):
   - qualquer campo do topo presente (`name`, `legalName`, `currency`, `timezone`, `appointmentCodePrefix` com valor ≠ `undefined`) → **403 `AUTH_FORBIDDEN`**;
   - `settings` ausente ou `{}` → **403 `AUTH_FORBIDDEN`** (o caminho só existe para gravar a chave extra);
   - qualquer chave de `settings` fora de `OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']` (inclusive `logoUrl`, `primaryColor`, `rentalTenantNotificationsEnabled`) → **403 `AUTH_FORBIDDEN`**. Aqui não há descarte silencioso: o pedido inteiro é recusado e nada é gravado;
   - só `settings.mapWindowDays` válido → segue o fluxo normal (`findById` → 404 se não existe/deletada → `deepMerge` → `update` → audit → evento).
3. `CL_ADMIN` com `actor.tenantId === tenantId` → como hoje; `mapWindowDays` **não** entra na allow-list e é descartado em silêncio.
4. `CL_ADMIN` de outra agência, `CL_USER`, `INSP` → 403 `AUTH_FORBIDDEN` (como hoje).
5. **Guarda de PATCH vazio (qualquer role, mudança deliberada aprovada em 2026-10-27):** depois do filtro de permissão, `settings` que ficou `{}` vira `undefined`. Se `updateData` ficar vazio (nenhum campo do topo e nenhum settings), o use case **não chama `tenantRepo.update`, não chama `auditService.log`, não emite `TENANT_EVENTS.UPDATED`** e devolve o tenant atual (200, mesma forma). A guarda roda depois do `findById`, então alvo inexistente continua 404. Quando sobra algo, o fluxo e a auditoria seguem como hoje. Efeito colateral aceito: PATCHs vazios (`{}`, `{ settings: {} }`, ou só chaves descartadas) deixam de gerar `tenant.updated` com antes == depois.

**Matriz RBAC por role × chave (PATCH):**

| Role / alvo | `settings.mapWindowDays` | outras chaves de settings | campos do topo |
|---|---|---|---|
| AM / qualquer agência | grava (200 + audit) | grava | grava |
| OP / qualquer agência | **grava (200 + audit)** | **403** | **403** |
| CL_ADMIN / própria agência | **descartado em silêncio (200, sem mudança; sem `update`/audit se nada mais sobrou — guarda 5)** | allow-list grava; o resto é descartado | `name/appointmentCodePrefix/timezone` |
| CL_ADMIN / outra agência | 403 | 403 | 403 |
| CL_USER, INSP | 403 | 403 | 403 |

**Response 200:** sem mudança (`tenantResponseSchema`: `id, name, legalName, status, timezone, currency, appointmentCodePrefix, settingsJson, createdAt, updatedAt`); `settingsJson.mapWindowDays` reflete o valor gravado.

**Erros:** `400 VALIDATION_ERROR` (fora de 1..90, não inteiro, string) · `403 AUTH_FORBIDDEN` (tabela acima) · `404 TENANT_NOT_FOUND` · os já existentes (`TENANT_LEGAL_NAME_CONFLICT`, `TENANT_PREFIX_CONFLICT`) não mudam.

#### 3. Auditoria

O formato é o existente; nada novo:

```
{ action: 'tenant.updated', actorType: 'USER', actorId: <userId do AM/OP>,
  entityType: 'Tenant', entityId: <tenantId alvo>, tenantId: <tenantId alvo>,
  before: { name, legalName, timezone, currency, appointmentCodePrefix, settingsJson: <antes> },
  after:  { …mesmos campos…, settingsJson: <deepMerge com mapWindowDays novo> } }
```

- E.A2 = `before.settingsJson.mapWindowDays` (ausente ou valor anterior) ≠ `after.settingsJson.mapWindowDays`, para ator AM **e** para ator OP.
- 403 da OP → **nenhuma** chamada a `auditService.log` nem a `update`.
- PATCH que fica vazio após o filtro (qualquer role, inclusive o CL_ADMIN mandando só `mapWindowDays`) → **nenhuma** chamada a `update`, `auditService.log` ou ao evento (guarda 5).
- PATCH com mudança real → auditoria normal, como hoje (inclusive quando o CL_ADMIN manda `mapWindowDays` junto de uma chave permitida: o after não contém `mapWindowDays`).
- `metadata.actor_tenant_id` não é adicionado (fora do escopo; o use case não grava isso hoje).

#### 4. Cálculo da janela (web)

**Constantes e funções** (`apps/web/src/features/appointments/lib/map-period-window.ts`, novo):
- `resolveMapWindowDays(settingsJson): number` (seção 1).
- `resolveWindowTimezone(tz?: string | null): string` → `tz` quando `isValidIanaTimezone(tz)`; senão `PLATFORM_TIMEZONE`.
- `computeWindowRange(windowDays, today)` → `{ from: today, to: addCivilDays(today, windowDays) }` (inclusive nas duas pontas; N=14 → 15 dias civis). **N conta os dias depois de hoje** (L-F00-03); a cópia da UI diz `Today + {N} days`. Difere de propósito do `presetRange(N)` da F09 (retrospectivo, N dias exatos).
- `clampRangeToWindow({ dateFrom, dateTo }, range)` → `dateFrom` vazio ou `< range.from` vira `range.from`, e `> range.to` vira `range.to`; `dateTo` vazio ou `> range.to` vira `range.to`, e `< range.from` vira `range.from`. Se depois disso `dateFrom > dateTo`, a saída é o range inteiro.
- `formatWindowLabel(windowDays)` → `Today + {N} days` / `Today + 1 day` (L-F00-03), usado pelo chip, pelo indicador externo e pelo texto de ajuda do CL.
- `buildDefaultAppointmentFilters(windowDays, today)` / `buildDefaultGroupFilters(windowDays, today)` (no `AppointmentMapFilterPanel.tsx`, substituem as constantes `DEFAULT_*`): mesmos campos de hoje, com `dateFrom = from` e `dateTo = to`.

**Fonte de N e de "hoje" por role e modo** (`useMapPeriodWindow`):

| Role | Modo | Agência filtrada? | Agência usada | N | Fuso |
|---|---|---|---|---|---|
| CL_ADMIN / CL_USER | appointments | n/a (sem filtro de agência) | `user.tenantId` | `resolveMapWindowDays` da própria agência | `resolveWindowTimezone(tenant.timezone)` |
| AM / OP | appointments | não | nenhuma (sem fetch) | 14 | `PLATFORM_TIMEZONE` |
| AM / OP | appointments | sim (`appointmentFilters.tenantId`) | a filtrada (GET `/v1/tenants/:id`) | `resolveMapWindowDays` dela | `resolveWindowTimezone(tenant.timezone)` |
| AM / OP | groups | n/a | nenhuma | **sempre 14** | `PLATFORM_TIMEZONE` |
| CL | groups | – | – | modo inacessível para CL (sem mudança) | – |

Fuso: **nunca** `user.timezone` (L-F00-09). **Convivência com a F09 (L-F09-06):** a camada de densidade de execuções da F09, no mesmo `AppointmentMapPage`, calcula o próprio "hoje" com `todayInTzDateString(PLATFORM_TIMEZONE)` de propósito (Sydney-only por desenho); as duas fontes de "hoje" convivem na página (hoje o efeito é nulo, todas as agências em Sydney) e `resolveWindowTimezone` não deve ser reaproveitado pela F09 nem o contrário. Leitura da agência pelo hook: `useTenantAdminDetail(id, { retry: false })`, com `staleTime` padrão (L-F00-04). Hoje `useTenantAdminDetail(id)` não aceita opções: ganha um segundo parâmetro opcional `options?: { retry?: false }`, repassado ao `useDetailQuery` (que já faz spread de `options`); o drawer continua chamando sem opções (retry padrão).

**Fuso de cada campo de data (N13, L-X00-03):**

| Campo | Tipo | Fuso |
|---|---|---|
| `dateFrom`/`dateTo` → `fromDate`/`toDate` (appointments) | data civil (janela) | agência filtrada ou própria (`tenant.timezone`); sem agência resolvida → `PLATFORM_TIMEZONE` |
| `dateFrom`/`dateTo` → `scheduledDateFrom`/`scheduledDateTo` (groups) | data civil (janela) | `PLATFORM_TIMEZONE` (modo cross-tenant, sem filtro de agência) |
| "hoje" da janela (`todayInTzDateString`) | data civil | o mesmo fuso da linha do modo |
| datas exibidas no texto de ajuda do CL | data civil | exibidas como estão (sem conversão); `users.timezone` não entra |

Sem jobs nem instantes novos nesta tarefa.

**Estado e transições** (`useMapWindowFilters`, no mesmo arquivo do hook; um estado por modo):
- `windowActive[mode]: boolean`, começa `true` para todos os roles.
- **Abertura:** quando o N/fuso do modo resolve, aplica `buildDefault*Filters`. Enquanto resolve (CL, ou AM/OP com agência filtrada), `windowReady = false` e a query de appointments fica com `enabled: windowReady`. Assim **a primeira request já sai com a janela**; nenhuma request sai sem datas.
- **Estado de carregamento (L-F00-04):** o hook expõe `windowReady` à página; enquanto `!windowReady`, o cabeçalho do painel mostra `Loading…` no lugar de `formatPinCountLabel(...)` (nunca "0 appointments") e o auto-fit não roda (lista vazia já retorna cedo, `hasFittedRef` não é marcado).
- **Abertura via `?mode=groups` (L-F00-08):** groups resolve 14/Sydney; o estado de appointments nasce com `windowActive.appointments = true`, de modo que a troca para Appointments dispara a primeira request já com `fromDate/toDate`.
- **Ponto de entrada único `onFiltersChange(next)` (L-F00-07):** a página passa este callback ao painel no lugar de `setAppointmentFilters`/`setGroupFilters`. Regras, em ordem:
  1. `next.tenantId !== prev.tenantId` (só appointments) → troca de agência: recalcula N/hoje; se `windowActive`, sobrescreve `next.dateFrom/dateTo` com a nova janela; **nunca** desliga a janela;
  2. senão, `next.dateFrom !== prev.dateFrom || next.dateTo !== prev.dateTo` → edição manual: AM/OP → `windowActive[mode] = false`; CL → clamp no estado (abaixo);
  3. senão → aplica `next` sem tocar em `windowActive` (status, branch, time, search…).
  Reaplicações internas (abertura, troca de agência, mudança de N, `resetDates`) usam um setter interno que **não** passa pela regra 2. Digitar exatamente a mesma data que já estava não muda nada (não há diferença).
- **Chip ✕ (só AM/OP):** `windowActive[mode] = false` e `dateFrom = dateTo = ''` naquele modo. A próxima request sai sem `fromDate/toDate` (ou sem `scheduledDateFrom/To`) e mostra atrasados e futuros.
- **Edição manual do Date Range por AM/OP:** o valor digitado vale e `windowActive[mode] = false` (as datas passam a ser do usuário; o chip some). Limpar as duas datas à mão → "sem janela" (`windowActive=false`, request sem datas), equivalente ao chip.
- **Edição manual por CL (L-F00-05):** o clamp roda no `onChange`: o estado recebe `clampRangeToWindow(next, range)`, então o painel sempre mostra exatamente o período pedido ao servidor (estado = request). Os inputs recebem `min = range.from`, `max = range.to` só como limites do calendário. Limpar um input → o input volta para a ponta da janela. `dateFrom > dateTo` digitado → estado = range inteiro.
- **Troca de agência filtrada (AM/OP, modo appointments):** com `windowActive.appointments = true`, recalcula N e "hoje" da nova agência (ou 14/Sydney ao limpar o filtro) e reaplica as datas. Com `false`, as datas não mudam.
- **Troca de modo:** cada modo mantém o próprio estado; groups nunca depende da agência.
- **`resetDates(mode)`** (interno, sem UI): `windowActive[mode] = true` e datas = janela atual.
- **Mudança de N com o mapa aberto:** o N vem do cache `['tenant-admins', id]`. Quando essa query refaz o fetch (o save do drawer invalida a key, ou o refetch/stale padrão do React Query) e o N muda, o hook reaplica a janela **se** `windowActive` estiver ligado. Sem push em tempo real.
- **Virada da meia-noite com o mapa aberto:** "hoje" é calculado ao resolver a janela e não avança sozinho. Recarregar ou trocar de agência recalcula (aceito; sem timer).
- **Erro no GET da agência (CL ou agência filtrada):** usa N = 14 e `PLATFORM_TIMEZONE` e libera a query (não trava o mapa). Decisão aprovada em 2026-10-27; um CL cuja agência usa N < 14 vê alguns dias a mais enquanto o erro durar (aceito). Com `retry: false` (L-F00-04) o fallback vale na **primeira** resposta de erro (`fetch` chamado 1 vez). Se um refetch posterior trouxer sucesso, o N/fuso reais entram pela regra de "mudança de N": reaplica se `windowActive`.

#### 5. UI

**Chip da janela** (no `AppointmentMapFilterPanel`, logo acima do "Date Range", nos dois modos):
- Visível só quando `actorRole ∈ {AM, OP}` **e** `windowActive[mode]`.
- Texto: `Today + {N} days` (N=1 → `Today + 1 day`), com ícone `mdi-close` à direita (L-F00-03).
- Elemento: `<button type="button">` com `aria-label="Remove date window: today plus {N} days"` e `title="Show all dates"`. Focável por teclado; Enter/Espaço removem. Depois de remover, o foco vai para o input "From" do Date Range (não se perde).
- Estilo: tokens existentes do design system (classes de filtro de `filter-styles.ts`/`cn`), sem cor nova.
- CL: chip nunca renderiza; o Date Range mostra as datas da janela com `min/max`.
- **Texto de ajuda do CL (L-F00-05):** abaixo do Date Range, só para CL, `Dates are limited to today + {N} days ({from} – {to}).` (datas no formato de exibição do app), ligado por `aria-describedby` aos dois inputs. Ausente para AM/OP. `FilterDateRange` ganha a prop opcional `helperText` (renderiza `<p id=…>` e repassa o id aos dois `DateInput`).

**Indicador fora do painel (L-F00-01)** (`AppointmentMapPage`, junto do `MapFilterToggleButton`, no canto do mapa; visível com o painel aberto ou fechado):
- AM/OP com `windowActive[mode]`: o mesmo chip `Today + {N} days ✕` (mesmo componente, mesma ação e mesmo `aria-label`). Depois de remover pelo indicador externo, o foco vai para o `MapFilterToggleButton`.
- CL: rótulo estático **sem ✕**, `<span>` com texto `Today + {N} days` e `aria-label="Showing today plus {N} days"`; não é focável nem clicável.
- `windowActive[mode] = false` ou `!windowReady`: nada renderiza fora do painel.
- Componente novo `MapWindowChip` (`apps/web/src/features/appointments/components/MapWindowChip.tsx`), com variantes `removable` e `static`, usado nos dois lugares.

**Campo no drawer de agência** (`TenantFormDrawer`, só em modo edição):
- Nova `FormSection title="Map"` com `FormField label="Map window (days)"` e `TextInput type="number" inputMode="numeric" min=1 max=90 step=1`, `aria-label="Map window (days)"`, texto de ajuda `Days ahead of today the map shows by default (1–90). Default: 14 (today through 14 days ahead).` ligado por `aria-describedby` (L-F00-03).
- Prefill: `resolveMapWindowDays(tenant.settingsJson)` (ausente → `14`).
- Erro inline: `Enter a whole number between 1 and 90.` (vazio, 0, 91, 7.5) e mapeamento do `VALIDATION_ERROR` com caminho `settings.mapWindowDays`.
- **AM:** vê todas as seções de hoje + "Map". O payload envia `settings.mapWindowDays` (número) junto com o resto.
- **OP:** vê **só** a seção "Map" (título do drawer continua "Edit Agency"). O payload é **exatamente** `{ settings: { mapWindowDays: <n> } }`, e a validação do form roda só nesse campo. O comentário "OP cannot PATCH tenants" é reescrito para descrever a regra nova (só AM edita os settings gerais; a OP edita só `mapWindowDays`).
- **CL_ADMIN:** não vê a seção "Map"; o payload dele não envia `mapWindowDays` (o resto não muda).
- Criar agência (modo create): sem o campo; a agência nova usa 14.
- O descarte com confirmação ("unsaved changes") continua valendo para o campo novo.
- **"Save" desabilitado sem alteração (L-F00-06):** em modo edição, `disabled={!isDirty || isSaving}` para todos os roles que veem o drawer (AM, OP, CL_ADMIN). Modo create não muda.

### Critérios de aceite

- **E.A1-1:** ao abrir `/map`, a **primeira** request de `/v1/appointments` de **qualquer** perfil leva `fromDate=hoje` e `toDate=hoje+N` (N e hoje conforme a seção 4). Para AM/OP no modo groups, `/v1/service-groups` leva `scheduledDateFrom=hoje` e `scheduledDateTo=hoje+14`. Nenhuma request de appointments sai sem datas na abertura.
- **E.A1-2:** CL_ADMIN e CL_USER não veem o chip removível. Limpar ou editar o Date Range nunca gera request fora de hoje..hoje+N, e os inputs sempre mostram o período que foi pedido ao servidor (clamp no `onChange`, L-F00-05). O texto `Dates are limited to today + {N} days (…)` aparece abaixo do Date Range.
- **E.A1-3:** AM/OP removem a janela pelo chip (ação explícita, interpretação aprovada em 2026-10-27). A request seguinte sai sem filtro de data.
- **E.A1-4:** AM/OP sem agência filtrada → N = 14. Com agência de `mapWindowDays = 30` filtrada → N = 30. Modo groups → 14.
- **E.A1-5 (L-F00-01):** com o painel de filtros fechado, o indicador da janela é visível para os 4 perfis (AM/OP removível; CL estático). Com a janela removida, nada aparece fora do painel.
- **E.A1-6 (L-F00-04):** enquanto o GET da agência não resolve, o painel mostra `Loading…` (nunca `0 appointments`); falha do GET libera o mapa com 14/Sydney na primeira resposta, sem retry.
- **E.A1-7 (L-F00-07):** mudar status, branch, time ou search não altera `windowActive`; trocar a agência com a janela ligada não a desliga.
- **E.A2-1:** AM grava `mapWindowDays` em qualquer agência → 200 e `tenant.updated` com `before/after.settingsJson.mapWindowDays` diferentes.
- **E.A2-2:** OP grava `mapWindowDays` em **qualquer** agência → 200 e `tenant.updated` com antes/depois.
- **E.A2-3:** OP enviando qualquer outro campo ou chave (sozinho ou junto com `mapWindowDays`) → 403, sem gravação e sem auditoria.
- **E.A2-4:** CL_ADMIN enviando `mapWindowDays` na própria agência → 200, **o valor não muda e nenhuma auditoria é gravada** (quando nada mais mudou).
- **Guarda (P2a):** PATCH sem nada a gravar após o filtro de permissão (qualquer role) → 200 sem `update`, sem `tenant.updated` e sem evento. PATCH com mudança real → `tenant.updated` normal.
- **E.A2-5:** o drawer mostra "Map window (days)" para AM (com o resto) e para OP (sozinho), e não mostra para CL_ADMIN.
- **E.A2-6 (L-F00-06):** em edição, o "Save" do drawer fica desabilitado enquanto nada mudou (AM, OP, CL_ADMIN).

### Casos de borda

- **Painel fechado na abertura (L-F00-01):** sessionStorage vazio/bloqueado → painel fechado; o indicador externo mostra o período mesmo assim.
- **"Today + N days" mostra N+1 dias (L-F00-03):** N=7 cobre hoje + 7 dias (8 dias civis); a cópia diz `Today + 7 days`. N=1 → hoje e amanhã, `Today + 1 day`.
- **GET da agência em 5xx/rede (L-F00-04):** sem retry; fallback 14/Sydney na primeira falha. Se o refetch posterior der certo com N diferente, reaplica com `windowActive` ligado; com desligado, não mexe.
- **GET pendente (L-F00-04):** cabeçalho `Loading…`, nenhuma request de appointments, nenhum indicador externo, auto-fit não marcado.
- **CL digita datas fora da janela (L-F00-05):** `dateFrom = 2026-10-01` com janela `10-27..11-10` → o input passa a mostrar `2026-10-27`; `dateFrom > dateTo` → os dois inputs voltam para o range inteiro.
- **Mesma data digitada de novo (L-F00-07):** sem diferença → `windowActive` não muda.
- **AM/OP limpa as duas datas à mão (L-F00-07):** "sem janela": request sem datas, chip some (dentro e fora do painel).
- **Troca de agência com datas manuais (L-F00-07):** `windowActive=false` → as datas digitadas ficam; só N/hoje são recalculados para um eventual `resetDates`.
- **Abertura por `/map?mode=groups` (L-F00-08):** groups com 14/Sydney; ao trocar para Appointments, a primeira request já leva `fromDate/toDate`. Parâmetros de data na URL (`?fromDate=`) são ignorados.
- **Fuso pessoal ≠ fuso da agência (L-F00-09):** AM em `America/Sao_Paulo` filtrando agência de Perth → "hoje" de Perth.
- **Fuso da agência trocado em settings (L-F00-09):** o mapa usa o anterior por até 30 s (`staleTime`) ou até reload. Aceito.
- **Save sem alteração no drawer (L-F00-06):** botão desabilitado; OP que só abre e fecha o drawer não gera PATCH nem auditoria.
- **OP gravando o mesmo valor atual (L-F00-06):** com o form "dirty" por ida e volta (30 → 31 → 30), `isDirty` é falso e o Save fica desabilitado. Via API, `{ settings: { mapWindowDays: 30 } }` com valor atual 30 grava e audita antes == depois (guarda estreita, comportamento aceito).

### Testes primeiro (TDD)

**P1 · `packages/shared/src/schemas/tenant.test.ts`**

| # | Entrada | Saída esperada |
|---|---|---|
| S1 | `tenantSettingsSchema.parse({ mapWindowDays: 1 })`, idem 14 e 90 | sucesso, valor preservado |
| S2 | `mapWindowDays: 0`, `91`, `7.5`, `"14"`, `null` | falha |
| S3 | settings sem a chave | sucesso; `mapWindowDays` ausente (sem default injetado) |
| S4 | `updateTenantSchema.parse({ settings: { mapWindowDays: 30 } })` | sucesso |
| S5 | `MAP_WINDOW_DAYS_DEFAULT` | `14` |

**P2 · `apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts`** (repo mockado; `findById` → `makeTenant({ settingsJson: { primaryColor: '#000000' } })`)

| # | Ator / payload | Esperado |
|---|---|---|
| B1 | OP `tenantId: null`, alvo `tenant-1`, `{ settings: { mapWindowDays: 30 } }` | 200; `update` chamado com `settingsJson = { primaryColor: '#000000', mapWindowDays: 30 }`; `auditService.log` com `action 'tenant.updated'`, `entityId 'tenant-1'`, `before.settingsJson.mapWindowDays` undefined, `after.settingsJson.mapWindowDays` 30 |
| B2 | OP `tenantId: 'tenant-other'`, mesmo payload | 200, igual a B1 (vale para "qualquer agência") |
| B3 | OP `tenantId: null`, `{ name: 'X' }` (**substitui** "should reject OP updating another tenant") | `ForbiddenError`; `update` e `log` não chamados |
| B4 | OP `tenantId: null`, `{ name: 'X', settings: { mapWindowDays: 30 } }` | `ForbiddenError`; nada gravado |
| B5 | OP `tenantId: null`, `{ settings: { mapWindowDays: 30, primaryColor: '#111111' } }` | `ForbiddenError`; nada gravado |
| B6 | OP `tenantId: null`, `{ settings: { logoUrl: 'https://x' } }` | `ForbiddenError` (não `ValidationError`) |
| B7 | OP `tenantId: null`, `{ settings: {} }` e `{}` | `ForbiddenError` |
| B8 | OP `tenantId: null`, `{ timezone: 'Australia/Perth' }`, `{ appointmentCodePrefix: 'ABC' }`, `{ legalName: 'Y' }`, `{ currency: 'USD' }` | `ForbiddenError` em cada um |
| B9 | OP `tenantId: null`, `{ settings: { mapWindowDays: 0 } }` (caller fora da rota) | `ValidationError` com `field 'settings.mapWindowDays'` |
| B10 | OP `tenantId: null`, alvo inexistente/deletado | `TenantNotFoundError` |
| B11 | o teste existente "should allow OP to update own tenant (name + settings only)" (OP com `tenantId: 'tenant-1'`, que não existe em produção) | **removido**: cobre um ramo morto, e B3/B4 já cobrem a OP mandando `name` |
| B12 | AM, `{ settings: { mapWindowDays: 30 } }` | 200; audit antes/depois (molde de "should record appointmentCodePrefix in the audit before/after") |
| B13 | CL_ADMIN própria, `{ settings: { mapWindowDays: 30 } }` | 200; `update` **não** chamado; `log` **não** chamado; retorno com `settingsJson` igual ao atual (via guarda P2a; ver N1) |
| B14 | CL_ADMIN própria, `{ settings: { mapWindowDays: 30, primaryColor: '#111111' } }` | 200; `update` com `primaryColor` novo e **sem** `mapWindowDays`; audit gravado sem `mapWindowDays` no after |
| B15 | CL_ADMIN outra agência / CL_USER com `mapWindowDays` | `ForbiddenError` (regressão) |
| B16 | regressões: "should filter settings keys for CL_ADMIN", "should NOT filter settings keys for AM", "should deep merge settings" | continuam verdes |

**P2a · `apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts`** (guarda de PATCH vazio; mesmo `makeTenant`; espiar `eventBus.emit`)

| # | Ator / payload | Esperado |
|---|---|---|
| N1 | CL_ADMIN própria, `{ settings: { mapWindowDays: 30 } }` (só chave descartada) | 200; `update`, `auditService.log` e `eventBus.emit` **não** chamados; retorno = tenant atual (`settingsJson` sem `mapWindowDays`) |
| N2 | CL_ADMIN própria, `{ settings: { billingPeriod: 'WEEKLY' } }` (chave fora da allow-list) | igual a N1 |
| N3 | AM, `{}` | 200; nada chamado; retorno = tenant atual |
| N4 | AM, `{ settings: {} }` | 200; nada chamado |
| N5 | CL_ADMIN própria, `{ settings: { primaryColor: '#111111' } }` | `update` chamado; `log` com `before.settingsJson.primaryColor '#000000'` → `after '#111111'`; evento emitido (auditoria normal) |
| N6 | AM, `{ name: 'Novo' }` | `update` + `log` + evento, como hoje |
| N7 | CL_ADMIN própria, `{ name: 'Novo', settings: { mapWindowDays: 30 } }` | `update` só com `name`; `log` gravado; `after.settingsJson` sem `mapWindowDays` |
| N8 | AM, `{}` com alvo inexistente | `TenantNotFoundError` (a guarda roda depois do `findById`) |

**P2 · `apps/backend/tests/integration/tenant/tenant.routes.test.ts`** (bloco PATCH): R1 `settings.mapWindowDays: 0` → 400 `VALIDATION_ERROR`; R2 `91` → 400; R3 `"14"` → 400; R4 `30` com o use case mockado → 200 e `res.body.data.settingsJson.mapWindowDays === 30`. Checklist RBAC: `grep -rn "OP" apps/backend/tests/integration/**/tenant*.test.ts apps/backend/tests/integration/rbac/*.test.ts` para garantir que nenhum teste de rota com use case mockado afirme 403 da OP no PATCH (o gate real é o unit acima).

**P3 · `TenantFormDrawer.test.tsx` / `useTenantAdminSave.test.ts`**

| # | Caso | Esperado |
|---|---|---|
| W1 | AM, edição, `settingsJson.mapWindowDays: 30` | campo "Map window (days)" visível com `30`; seções "Agency Information"/"Notifications" visíveis |
| W2 | AM, edição, sem a chave | campo com `14` |
| W3 | OP, edição | só a seção "Map" visível; "Name"/"Legal Name"/"Timezone" ausentes |
| W4 | CL_ADMIN, edição | campo ausente |
| W5 | create (AM) | campo ausente |
| W6 | o teste atual "hides the tenant notifications toggle for non-AM roles (OP)" | continua verde |
| W7 | `save` AM com `mapWindowDays: '30'` | PATCH com `settings.mapWindowDays === 30` (number) junto com os outros campos |
| W8 | `save` OP | body do PATCH **exatamente** `{ settings: { mapWindowDays: 30 } }` |
| W9 | validação `''`, `'0'`, `'91'`, `'7.5'` | erro `Enter a whole number between 1 and 90.`; `save` não chamado |
| W10 | backend responde `VALIDATION_ERROR` em `settings.mapWindowDays` | erro inline no campo |
| W11 | AM / OP / CL_ADMIN, edição, form sem alteração (L-F00-06) | botão "Save" `disabled`; ao mudar o campo para `31`, habilitado; ao voltar para `30`, desabilitado de novo |
| W12 | texto de ajuda do campo (L-F00-03) | `Days ahead of today the map shows by default (1–90). Default: 14 (today through 14 days ahead).` ligado por `aria-describedby` |

**P4 · `apps/web/src/features/appointments/lib/map-period-window.test.ts`** (novo)

| # | Entrada | Saída |
|---|---|---|
| L1 | `computeWindowRange(14, '2026-10-27')` | `{ from: '2026-10-27', to: '2026-11-10' }` |
| L2 | `computeWindowRange(14, '2026-12-25')` | `to: '2027-01-08'` |
| L3 | `computeWindowRange(1, '2028-02-28')` / `(90, '2026-10-27')` | `'2028-02-29'` / `'2027-01-25'` |
| L4 | `clampRangeToWindow({ '', '' }, R)` | `R` |
| L5 | `{ '2026-10-01', '2026-11-05' }` com `R = 10-27..11-10` | `{ '2026-10-27', '2026-11-05' }` |
| L6 | `{ '2026-10-30', '2026-12-31' }` | `{ '2026-10-30', '2026-11-10' }` |
| L7 | `{ '2026-11-01', '2026-11-03' }` | sem mudança |
| L8 | `{ '2026-12-01', '2026-12-05' }` (tudo depois) | `R` |
| L9 | `resolveMapWindowDays({ mapWindowDays: 30 })` / `{}` / `null` / `{ mapWindowDays: 0 }` / `{ mapWindowDays: '30' }` | 30 / 14 / 14 / 14 / 14 |
| L10 | `resolveWindowTimezone('Australia/Perth')` / `''` / `null` / `'Not/AZone'` | `'Australia/Perth'` / Sydney / Sydney / Sydney |
| L11 | `clampRangeToWindow({ '2026-11-08', '2026-11-02' }, R)` (invertido, L-F00-05) | `R` |
| L12 | `formatWindowLabel(14)` / `formatWindowLabel(1)` (L-F00-03) | `'Today + 14 days'` / `'Today + 1 day'` |

**P4 · `AppointmentMapFilterPanel.test.tsx`:** F1 `buildDefaultAppointmentFilters(14,'2026-10-27')` → statuses `['DRAFT','REJECTED']`, `dateFrom '2026-10-27'`, `dateTo '2026-11-10'`, demais campos iguais aos defaults antigos. F2 `buildDefaultGroupFilters` → statuses `['PUBLISHED','ACCEPTED']` com as mesmas datas. F3 os testes existentes migram das constantes para os builders e continuam verdes.

**P5/P6 · `useMapPeriodWindow.test.tsx`** (novo; `vi.setSystemTime('2026-10-27T15:00:00Z')`, quando já é 28/10 em Sydney e ainda é 27/10 em UTC)

| # | Caso | Esperado |
|---|---|---|
| H1 | AM, sem agência, appointments | sem fetch de tenant; N 14; today `'2026-10-28'`; `windowReady` true imediato |
| H2 | AM/OP, agência filtrada `{ timezone: 'Australia/Perth', settingsJson: { mapWindowDays: 30 } }` | N 30; today `'2026-10-27'` (Perth 23h); `windowReady` false até o GET resolver |
| H3 | CL_USER, própria agência `mapWindowDays: 7` | N 7; usa `user.tenantId` |
| H4 | agência sem a chave / timezone inválido | N 14 / fuso Sydney |
| H5 | GET da agência com erro | N 14, Sydney, `windowReady` true |
| H5b | GET da agência responde 500 (L-F00-04) | `windowReady` true na primeira resposta; `fetch` de `/v1/tenants/:id` chamado **1** vez (sem retry) |
| H6 | AM, modo groups com agência filtrada em appointments | groups usa N 14 |
| H7 | estado inicial dos dois modos | datas da janela |
| H8 | AM troca a agência (sem → agência 30) com janela ativa | `dateTo` vira `today+30` |
| H9 | AM remove o chip e depois troca a agência | datas continuam `''` |
| H10 | AM edita `dateTo` à mão via `onFiltersChange({ ...prev, dateTo: '2026-11-20' })` | `windowActive` false; `dateTo '2026-11-20'` |
| H11 | `resetDates('appointments')` depois de remover | datas = janela; `windowActive` true |
| H12 | N muda no cache (`['tenant-admins', id]` 30 → 45) com janela ativa / desligada; idem transição erro → sucesso (fallback 14 → 30) | reaplica `today+45` (ou `today+30`) / não mexe |
| H13 | CL limpa as datas (P7) | **estado** e params com `dateFrom=today`, `dateTo=today+N` (L-F00-05) |
| H14 | CL, `onFiltersChange` com `dateTo '2026-12-31'` / `dateFrom '2026-10-01'` (janela `10-28..11-04`, N 7) (P7) | **estado** `dateTo '2026-11-04'` / `dateFrom '2026-10-28'`; params iguais ao estado; `windowActive` continua true |
| H15 | AM com janela ativa, `onFiltersChange({ ...prev, statuses: ['DRAFT'] })` (L-F00-07) | `windowActive` true; datas inalteradas |
| H16 | AM com janela ativa, `onFiltersChange({ ...prev, tenantId: 't-30', dateFrom: prev.dateFrom })` (L-F00-07) | `windowActive` true; `dateTo = today+30` (sobrescrito pela nova janela) |
| H17 | AM, `onFiltersChange({ ...prev, dateFrom: '', dateTo: '' })` (L-F00-07) | `windowActive` false; params sem `fromDate/toDate` |
| H18 | AM, `onFiltersChange` com as mesmas datas já presentes (L-F00-07) | `windowActive` true |

**P6 · `AppointmentMapPage.test.tsx`:** M1 AM sem agência → a primeira chamada a `/v1/appointments` contém `fromDate=<hoje>&toDate=<hoje+14>`. M2 CL_USER com agência de N=7 → nenhuma chamada a `/v1/appointments` antes do GET da agência; a primeira contém `toDate=<hoje+7>`. M3 AM em `?mode=groups` → `/v1/service-groups` com `scheduledDateFrom/To` de 14 dias. M3b (L-F00-08) AM abre `/map?mode=groups` e troca para Appointments → a primeira chamada a `/v1/appointments` contém `fromDate=<hoje>&toDate=<hoje+14>`. M2b (L-F00-04) CL_USER com GET da agência pendente → o painel não contém `0 appointments` e contém `Loading…`. M4 (L-F00-01) painel fechado (sessionStorage vazio): AM → botão `Remove date window: today plus 14 days` visível fora do painel; clicar → próxima chamada sem `fromDate/toDate` e o indicador some; CL_USER (N 7) → texto `Today + 7 days` visível, sem botão de remoção. M5 (L-F00-07) AM muda o filtro de status no painel → a chamada seguinte ainda leva `fromDate/toDate`.

**P7 · `AppointmentMapFilterPanel.test.tsx` / `FilterDateRange.test.tsx`**

| # | Caso | Esperado |
|---|---|---|
| C1 | AM, `windowActive`, N 14 | botão com nome acessível `Remove date window: today plus 14 days` e texto `Today + 14 days` (L-F00-03) |
| C2 | OP, idem | visível |
| C3 | N 1 | texto `Today + 1 day` |
| C4 | clique no ✕ (appointments) | `onAppointmentFiltersChange` com `dateFrom ''` e `dateTo ''`; callback de remoção chamado |
| C5 | clique no ✕ (groups) | `onGroupFiltersChange` com datas vazias |
| C6 | teclado: Tab até o chip + Enter | mesmo efeito de C4; o foco vai para o input "From" |
| C7 | CL_ADMIN / CL_USER | chip ausente |
| C8 | AM com `windowActive` false | chip ausente |
| C9 | `FilterDateRange` com `min/max` | atributos `data-min`/`data-max` presentes nos dois `DateInput` |
| C10 | CL | Date Range recebe `min=today`, `max=today+N` |
| C11 | CL, N 7, janela `2026-10-28..2026-11-04` (L-F00-05) | texto `Dates are limited to today + 7 days (…)` presente e referenciado por `aria-describedby` nos dois inputs; AM/OP → texto ausente |
| C12 | `MapWindowChip` variante `static` (L-F00-01) | `<span>` com texto `Today + 7 days` e `aria-label="Showing today plus 7 days"`; sem `button` |
| C13 | `MapWindowChip` variante `removable`, clique (L-F00-01) | callback de remoção chamado; foco no elemento indicado por `returnFocusRef` |

### Escopo / Passos

| ✓ | Passo | Camada | Arquivos | Dias |
|---|---|---|---|---|
| [ ] | P1 · Chave `mapWindowDays`, `MAP_WINDOW_DAYS_DEFAULT`, api-types regenerado | shared | `packages/shared/src/schemas/tenant.ts` (modify) · `packages/shared/src/schemas/tenant.test.ts` (modify) · `packages/shared/openapi.json` (regen) · `packages/shared/src/api-types.ts` (regen) | 0,25 |
| [ ] | P2 · `OP_EXTRA_SETTINGS_KEYS` + caminho cross-tenant restrito da OP (tirar `OP` da condição `CL_ADMIN \|\| OP`) + revalidação do valor | backend | `apps/backend/src/modules/tenant/application/use-cases/update-tenant.use-case.ts` (modify) · `apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts` (modify) · `apps/backend/tests/integration/tenant/tenant.routes.test.ts` (modify) | 0,25 |
| [ ] | P2a · Guarda de PATCH vazio após o filtro (qualquer role; mudança deliberada de comportamento): sem `update`, audit nem evento | backend | `update-tenant.use-case.ts` · `update-tenant.use-case.test.ts` (modify) | 0,25 |
| [ ] | P2b · Docs canônicos de RBAC + matriz (junto com P2) | docs/shared | `specs/002-tenants-branches/contracts/tenant-endpoints.md` · `specs/015-permissions-rbac-matrix/spec.md` (l.98) · `specs/backend/tenant.spec.md` (modify): a OP grava só `mapWindowDays` em qualquer agência; a linha "OP (own tenant…)" sai; documentar a guarda de PATCH vazio (estreita: valores iguais continuam auditando) e a nota de rollback; no `tenant-endpoints.md`, corrigir também as linhas da OP em list (~l.54), GET (~l.99) e deactivate (~l.160) para refletir o código ("OP (any tenant)") (L-F00-10) · `packages/shared/src/permissions/role-matrix.ts` (modify): manter `'tenant.update': { roles: ['AM','OP'] }` e acrescentar `// OP: only settings.mapWindowDays, enforced in update-tenant.use-case.ts (OP_EXTRA_SETTINGS_KEYS); every other field is AM-only` (L-F00-02). Checklist: nenhum `canPerform('tenant.update')` no drawer; o gate de seções continua `hasRole` | (em P2) |
| [ ] | P3 · Campo "Map window (days)" no drawer (AM tudo, OP só o campo) + "Save" desabilitado sem `isDirty` em edição (L-F00-06) | web | `apps/web/src/features/tenants/types/index.ts` · `components/TenantFormDrawer.tsx` · `components/TenantFormDrawer.test.tsx` · `hooks/useTenantAdminSave.ts` · `hooks/useTenantAdminSave.test.ts` (modify) | 0,25 |
| [ ] | P4 · Lib pura da janela + builders `buildDefault*Filters` | web | `apps/web/src/features/appointments/lib/map-period-window.ts` (novo) · `lib/map-period-window.test.ts` (novo) · `components/AppointmentMapFilterPanel.tsx` · `components/AppointmentMapFilterPanel.test.tsx` (modify) | 0,25 |
| [ ] | P5 · Hook `useMapPeriodWindow` (N + fuso + `windowReady`; GET com `retry: false`, L-F00-04) | web | `apps/web/src/features/appointments/hooks/useMapPeriodWindow.ts` (novo) · `hooks/useMapPeriodWindow.test.tsx` (novo) · `hooks/index.ts` (modify) · `apps/web/src/features/tenants/hooks/useTenantAdminDetail.ts` (modify: `options` opcional) | 0,25 |
| [ ] | P6 · `useMapWindowFilters` com entrada única `onFiltersChange` (detecção troca de agência × edição manual × outros campos, setter interno para reaplicações; L-F00-07) + fiação no `AppointmentMapPage` (estado inicial, `enabled: windowReady`, `Loading…` no cabeçalho enquanto `!windowReady` (L-F00-04), troca de agência, `resetDates`, abertura via `?mode=groups` (L-F00-08)) | web | `hooks/useMapPeriodWindow.ts` · `hooks/useMapPeriodWindow.test.tsx` · `pages/AppointmentMapPage.tsx` (≤ ~20 linhas) · `pages/AppointmentMapPage.test.tsx` (modify) | 0,5 |
| [ ] | P7 · Chip AM/OP no painel + janela fixa do CL (`min/max` + clamp no `onChange` + texto de ajuda `helperText`; L-F00-05) + cópia `Today + {N} days` (L-F00-03) | web | `components/AppointmentMapFilterPanel.tsx` · `components/AppointmentMapFilterPanel.test.tsx` · `apps/web/src/components/filters/FilterDateRange.tsx` · `FilterDateRange.test.tsx` · `hooks/useMapPeriodWindow.ts` · `hooks/useMapPeriodWindow.test.tsx` (modify) | 0,5 |
| [ ] | P7b · Indicador da janela fora do painel (`MapWindowChip` removível para AM/OP, estático para CL) ao lado do `MapFilterToggleButton` (L-F00-01) | web | `components/MapWindowChip.tsx` (novo) · `components/MapWindowChip.test.tsx` (novo) · `components/AppointmentMapFilterPanel.tsx` (usa o componente) · `pages/AppointmentMapPage.tsx` · `pages/AppointmentMapPage.test.tsx` (modify) | 0,25 |
| [ ] | P8 · QA: smoke dos 4 perfis + gates + descrição do PR | QA | – | 0,25 |
| | **Total** | | ~27 arquivos | **3,0** |

Ordem: P1 → (build do shared) → P2 → P2a → P3; P4 → P5 → P6 → P7 → P7b (P4 só depende de P1) → P8.

### Fora do escopo

- Janela na lista, na exportação ou em relatórios; qualquer limite de datas no servidor para o mapa ou para CL.
- Filtro de agência no modo groups; N por agência no modo groups.
- Persistir os filtros ou o estado do chip do mapa (sessionStorage/URL); ler datas da URL do `/map` (L-F00-08).
- Botão "Limpar" visível; outros recortes (status, região etc.).
- Qualquer outra chave liberada para a OP; liberar `mapWindowDays` para CL_ADMIN; 403 especial para CL_ADMIN.
- `metadata.actor_tenant_id` na auditoria; remover o código morto `DEFAULT_MAP_FILTERS`.
- Campo no modo create do drawer; mudanças no PWA.
- Escopo por chave dentro de `role-matrix.ts` (ex.: `scope?: 'settings.mapWindowDays'`) ou ação separada `tenant.update_map_window` (L-F00-02).
- Invalidar `['tenant-admins', id]` em `useUpdateAgencyTimezone` (defasagem de 30 s aceita, L-F00-09).
- Guarda de auditoria por diff de valor (L-F00-06).
- Abrir o painel de filtros por padrão (L-F00-01).

### Dependências

- Nenhuma feature anterior. Dentro do PR: `pnpm --filter @properfy/shared build` depois de P1 e antes de backend/web.
- **Ordem de merge com a F09 (L-F09-09):** a TASK-F09-1 (P1a) acrescenta `'map.execution_density'` ao `ROLE_ACTION_MATRIX` em `packages/shared/src/permissions/role-matrix.ts`, o mesmo arquivo do comentário de escopo de `tenant.update` (P2b); as duas também mexem no `AppointmentMapPage.tsx`/`FilterDateRange.tsx`. Quem mergear depois rebaseia e mantém as duas mudanças; rodar `role-matrix.test.ts` depois do rebase.
- Regenerar o api-types: `generate:openapi` → `generate:types` (ver `reference_generate_openapi_env`), commitando `openapi.json` e `api-types.ts`.

### Riscos e armadilhas

- **Ampliação de RBAC:** testes de rota com use case mockado ficam verdes mesmo afirmando o contrário. O gate real são os unit B1–B16 e N1–N8. Atualizar os 3 docs de specs (P2b), senão uma sessão futura "restaura" o bloqueio da OP.
- **O JWT da OP nunca tem `tenantId`** (`commit-appointment-import.use-case.ts:52-53`): o caminho novo não pode depender de `actor.tenantId`. B2 (`tenantId: 'tenant-other'`) existe só para garantir que a regra não olha esse campo. Tirar `OP` da condição `(CL_ADMIN || OP) && actor.tenantId === tenantId` (ramo morto).
- **Guarda de PATCH vazio é mudança deliberada de comportamento (P2a):** antes, PATCH vazio ou só com chaves descartadas gravava e auditava antes == depois; agora não grava nada. Registrar na descrição do PR e no contrato (`tenant-endpoints.md`). Sem a guarda, o CL_ADMIN mandando só `mapWindowDays` viola E.A2-4.
- **`deepMerge` não remove chaves:** "voltar ao padrão" é gravar 14.
- **`.default(14)` no schema seria um erro:** passaria a injetar 14 em todo parse de settings e mudaria payloads ou snapshots existentes.
- **Fuso:** nunca usar `new Date().toISOString().slice(0,10)` (dá o dia anterior em Sydney por ~10h). Testes com relógio fixo em instante onde UTC e Sydney divergem.
- **Primeira request sem janela:** sem `enabled: windowReady`, o CL dispara uma request sem datas (ou com 14) antes do GET da agência, o que viola E.A1.
- **`AppointmentMapPage.tsx` tem 1,5 mil linhas:** a lógica vai para o hook e a lib; a página só recebe a fiação.
- **Código morto `DEFAULT_MAP_FILTERS`:** não editar nem usar.
- **Query key compartilhada `['tenant-admins', id]`:** é a mesma do drawer. O save invalida a key e o mapa recebe o N novo (comportamento desejado, coberto por H12). O `retry: false` é opção do observador do mapa; o drawer mantém o retry padrão.
- **Matriz `role-matrix.ts` (L-F00-02):** diz `tenant.update: ['AM','OP']` sem escopo. Usar `canPerform('tenant.update')` para liberar o drawer inteiro à OP gera 403 em `name`/`timezone`; "corrigir" para `['AM']` esconderia a seção "Map" da OP num futuro gate. O comentário de escopo (P2b) evita os dois.
- **Detecção de edição manual (L-F00-07):** comparar só "datas ≠ janela" desliga a janela na reaplicação programática (H8/H12/H16 quebram). Reaplicações internas nunca passam pelo `onFiltersChange`.
- **`user.timezone` é a armadilha natural (L-F00-09):** as outras telas usam esse padrão; aqui ele daria o "hoje" do fuso pessoal do AM/OP. H2 falha se a fonte estiver errada.
- **Rollout/rollback (L-F00-10):** sem flag; o deploy segue develop → staging → prod. Rollback = revert do PR; sem migration; chaves `mapWindowDays` existentes ficam inertes (schema `passthrough`) e voltam a valer num re-deploy; nenhum backfill. Depois de um revert, a OP volta a receber 403 no PATCH e o mapa volta a abrir sem janela. Registrar na descrição do PR.

### Dias · Branch · Verificação

- **Dias:** 3,0 (P1 0,25 · P2 0,25 · P2a 0,25 · P3 0,25 · P4 0,25 · P5 0,25 · P6 0,5 · P7 0,5 · P7b 0,25 · P8 0,25). Lacunas de 2026-10-29: +0,25 em P6 (L-F00-07 entrada única + L-F00-04 loading), +0,25 em P7 (L-F00-05 clamp no `onChange` + ajuda), +0,25 em P7b (L-F00-01); L-F00-02/03/06/08/09/10 cabem nos passos existentes.
- **Branch:** `feat/map-period-window` a partir de `develop`, em worktree; PR → `develop`. Commits (Conventional Commits, sem referência a IA): `feat(shared): add mapWindowDays tenant setting` · `feat(backend): let OP set mapWindowDays on any agency` · `fix(backend): skip tenant update and audit when nothing is left to save` · `docs(specs): document OP mapWindowDays permission` · `feat(web): map window field in agency drawer` · `feat(web): default map period window with AM/OP chip` · `feat(web): show map window indicator outside the filter panel` · `fix(web): disable agency drawer save when nothing changed`.
- **Gates (no worktree):** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test` · `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test` · `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test` · `git diff --stat origin/develop... | tail -1` (< 150 arquivos; esperado ~27).
- **Smoke no browser (P8, backend + web locais, seed padrão; screenshots fora do commit):**
  1. **AM:** abrir `/map` com o painel **fechado** → o indicador `Today + 14 days ✕` aparece no canto do mapa (E.A1-5). Abrir o painel → "Date Range" hoje..hoje+14 e o chip `Today + 14 days`; mudar o status → a request ainda leva datas; pins só no período (conferir a request na aba Network). Filtrar uma agência e, em outra aba, gravar `Map window (days) = 30` no drawer dessa agência → voltar e trocar de agência e voltar → `toDate = hoje+30`. Clicar no ✕ → o chip some, a request sai sem datas e aparecem atrasados. Trocar a agência → as datas continuam vazias. Modo Groups → chip `Today + 14 days` e `scheduledDateFrom/To` de 14 dias. Abrir `/map?mode=groups` e trocar para Appointments → a primeira request leva `fromDate/toDate`. No DevTools, bloquear `/v1/tenants/*` e filtrar uma agência → `Loading…` curto e depois janela de 14 (uma única tentativa na aba Network).
  2. **OP:** `/tenants/:id` de qualquer agência → "Edit" → o drawer mostra **só** "Map window (days)"; "Save" desabilitado até mudar o valor. Gravar 21 → snackbar de sucesso. Conferir em audit logs um `tenant.updated` com `settingsJson.mapWindowDays` antes/depois. Via devtools/curl com o token da OP, `PATCH { name: 'X' }` → 403. No `/map`, filtrar essa agência → `Today + 21 days`; o chip funciona como para o AM.
  3. **CL_ADMIN:** `/tenants/<própria>` → "Edit" → sem a seção "Map". `PATCH { settings: { mapWindowDays: 60 } }` → 200, o valor no GET continua o anterior e não há nova entrada `tenant.updated`. No `/map`: sem chip removível; rótulo estático `Today + {N} days` com o painel fechado; Date Range da janela da agência com o texto `Dates are limited to …`; digitar uma data além do fim → o input volta para a ponta da janela e a request continua dentro dela.
  4. **CL_USER:** `/map` → sem chip removível, rótulo estático visível com o painel fechado; limpar as duas datas → a request sai com hoje..hoje+N da agência; sem acesso a `/tenants`.
- **Descrição do PR:** critérios E.A1-1..7 e E.A2-1..6 com evidência (testes + smoke), a nota da interpretação do E.A1 aprovada em 2026-10-27, a guarda de auditoria estreita (L-F00-06) e a nota de rollback (L-F00-10).

---

## Achados para revisão

Nenhum achado em aberto. As decisões de 2026-10-27 (guarda de PATCH vazio, fallback de 14 dias em Sydney e remoção do ramo morto da OP) e as lacunas L-F00-01..10 (decididas em 2026-10-28, aplicadas em 2026-10-29) estão incorporadas acima.

## Ajustes necessários em outras tarefas (para reconciliar)

- (encaminhado) `fase2-etapa1/F00-janela-periodo-mapa.md` (Critérios de aceite, E.A2): trocar "Um PATCH que não muda nada não grava auditoria" por "um PATCH em que nada sobra para gravar após o filtro de permissão não grava auditoria; valores iguais aos atuais continuam gravando e auditando, como hoje" (L-F00-06).
- (encaminhado) `fase2-etapa1/F00-janela-periodo-mapa.md` (E.1b e critérios): cópia do chip `Next N days ✕` → `Today + N days ✕`; registrar o indicador fora do painel (removível AM/OP, estático CL) e E.A1-5..7 (L-F00-01, L-F00-03, L-F00-04, L-F00-07).
- (encaminhado no plano; README pendente) `fase2-etapa1/F00-janela-periodo-mapa.md` e `fase2-etapa1/README.md` (tabela de features, l.48): estimativa da F00 2,25 → 3,0 dias (L-F00-01/04/05/07).
- `fase2-etapa1/tarefas/F09-tarefas.md` (cópia dos presets de densidade no `/map`): registrar que "N dias" da F09 é retrospectivo e exato, e o da F00 é `Today + N days` (N+1 dias), para não unificar as cópias por engano (L-F00-03).
