# F10 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F10 · Arquivos do imóvel e issues (contrato C.1–C.9, critérios C.A1–C.A5 **+ aditivo "Issues"**, aprovado pelo cliente em 2026-10-30) |
| **Total** | **15,5 dias** (plano/cotação: 13,5 = 6,5 C + 7,0 aditivo; **+2,0 da validação de 2026-11-07**, ver "Ajuste de estimativa") |
| **Tarefas / PRs** | 4 (backend+shared → web → PWA → portal), conforme a "Quebra em PRs" do plano |
| **Depende de** | F03-1 (`PlatformSetting`), F03-2 (tabela `inspector_field_events` — FK de `property_issues.cant_do_event_id`), F03-3 (`CantDoSheet` — modificada na F10-3), X01 (ordem só; ver D-X01 abaixo) |
| **Bloqueia** | – |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot do plano) + verificação do working tree em 2026-11-07 (F03-1/2/3/4, F09-1, X01 já mergeadas) |

## Ajuste de estimativa: 13,5 → 15,5 dias (validação de 2026-11-07)

A cotação ao cliente (6,5 C + 7,0 aditivo = 13,5) **não muda**. O número abaixo é a estimativa de engenharia depois da validação da spec (agente Fable + verificação do código). O delta vem de escopo real que o plano não custeava, não de escopo novo.

| Tarefa | Plano | Agora | Delta e motivo |
|---|---|---|---|
| TASK-F10-1 (backend + shared) | 3,75 | **5,25** | **+1,5**: 4 payloads existentes modificados (`hasUnseenIssues` em 2 listas + `fileCounts` em 2 detalhes → repositório + use case + response schema + `openapi.json`/`api-types` + todas as fixtures de teste desses payloads); job de retenção de 3 passos com `deleteObject` real; registro na `role-matrix.ts`; constraints `UNIQUE` + CHECK relaxado (D20); testes RBAC em 5 papéis; limpeza da doc do `InspectionAsset`. QA passa a 0,75. Comparação: a TASK-F03-2 (1 tabela, 3 rotas) custou 4,75. |
| TASK-F10-2 (web) | 5,50 | **5,50** | Sem mudança no número. Passa a incluir a seção "Files" em Platform settings (pequena, F03-4 já tem a página) e o primitivo `SidebarItemBadge` (o X01 não entrega badge por item), compensados pela reutilização do componente nas duas telas. |
| TASK-F10-3 (PWA) | 2,00 | **2,50** | **+0,5**: envio foto a foto com progresso/falha individual + E2E Playwright em Chromium **e** WebKit (input de arquivo/câmera no WebKit é lento para estabilizar). |
| TASK-F10-4 (portal) | 2,25 | **2,25** | Sem mudança. |
| **Total** | **13,5** | **15,5** | **+2,0** = F10-1 +1,5 · F10-3 +0,5 |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F10-1 | Backend + shared: `PropertyIssue`, `PropertyFile`, use cases de arquivo e issue, contagem de não vistas, chave `propertyFiles` no `PlatformSetting`, job de retenção, `hasUnseenIssues`/`fileCounts` nos payloads, role-matrix | 5,25 | F03-1, F03-2 |
| TASK-F10-2 | Web: componente Files com subabas (appointment + imóvel), seção "Files" em Platform settings, `SidebarItemBadge` + pontos amarelos, borda amarela, filtros "With issues", navegação cruzada | 5,50 | TASK-F10-1 (X01 só por ordem) |
| TASK-F10-3 | PWA: seção Files no detalhe do serviço (Issues primeiro, download), "Report issue", fotos opcionais no "Não consigo fazer" | 2,50 | TASK-F10-1, F03-3 |
| TASK-F10-4 | Portal: "Report a problem" antes da confirmação, presign/confirm escopado por token com rate limit por token, Issue com `source=RENTAL_TENANT_PORTAL` | 2,25 | TASK-F10-1 |

## Decisões que valem para as 4 tarefas

Decisões D1–D19 vêm de **2026-10-30** (respostas do cliente). D20–D29 vêm da **validação de 2026-11-07** (agente Fable + verificação do working tree); cada uma resolve um achado da validação.

- **D1 · Modelo centralizado no imóvel.** Todo arquivo pertence a um `property_id` (com `tenant_id`). O `appointment_id` é opcional em qualquer tipo, mas tudo que for possível fica ligado. Issues criadas num appointment carregam o `appointment_id` da issue **e** do arquivo.
- **D2 · Dois modelos distintos: `PropertyIssue` e `PropertyFile`.** Uma issue agrupa motivo + fotos (`PropertyFile` com `type=ISSUE` e `issue_id`). Outros tipos (Document/Report/Other) existem sem issue.
- **D3 · Versionamento por arquivo com "New version".** Versão anterior continua acessível no drawer "Versions". Aplica-se a todos os tipos, inclusive fotos de issue. Só no web; o PWA só lê e baixa.
- **D4 · Issues são aditivo (cláusula 9.4).** O core de arquivos (base, config, componente, contagens, auditoria, retenção) é do contrato C. Indicativos, "marcar como vista", issue do inquilino no portal, fotos no "Não consigo fazer" e a seção do app são aditivo.
- **D5 · Sem `tenant_id` cross-tenant aqui.** `PropertyIssue` e `PropertyFile` **têm** `tenant_id` (via o imóvel e, quando aplicável, o appointment). Nenhuma entidade nova aqui é platform-scoped.
- **D6 · Escopo no use case, não no repositório.** Acesso a arquivo de outra agência → **404** (não 403), sem revelar que o arquivo existe (C.A2). `requireTenantScope` para OP, `assertTenantScope` para CL (padrão `apps/backend/src/shared/domain/require-tenant-scope.ts`).
- **D7 · "Marcar como vista" por CAS idempotente (ver D23).** Quem vê: AM, OP e CL_ADMIN.
- **D8 · Exclusão lógica com retenção de 365 dias.** Arquivos e issues excluídos mantêm `deleted_at`/`deleted_by_user_id`. O job de retenção apaga do storage depois de `deletedRetentionDays` (padrão 365). Restauração só via admin de banco, não pela UI.
- **D9 · Presign → confirm com magic bytes.** Seguir o padrão existente: presign gera URL temporária (`IStorageService.createSignedUploadUrl`, bucket `inspection-assets`); confirm chama `headObject` (`{ exists, sizeBytes }`), sniff com `file-type` (MIME real compatível com o declarado) e valida `sizeBytes ≤ maxFileSizeMb`. O tamanho real é validado **no confirm** (o presign não impede arquivos maiores). Rejeição vira mensagem clara na UI, no presign e no confirm (C.A5).
- **D10 · Storage bucket existente.** Usar o bucket privado `inspection-assets` já provisionado (`provision-storage-buckets.ts:40-46`). Não criar bucket novo.
- **D11 · `IStorageService` fica onde está (não mover para shared).** Reavaliação da nota do spec (que pedia mover para `shared/domain`): a porta vive em `apps/backend/src/modules/inspector-execution/domain/storage.service.ts`, preexiste à Fase 2 e tem a interface completa (`createSignedUploadUrl`, `headObject`, `createSignedDownloadUrl`, `deleteObject`). A F10 importa a porta existente, não move o arquivo. **O spec foi corrigido para refletir isso** (S:107).
- **D12 · Uma foto por vez com progresso individual.** No app e no portal: presign → upload → confirm em sequência por foto; uma falha não perde as já confirmadas. A issue só é criada quando todas as fotos pretendidas estão `READY`, ou o usuário remove as que falharam.
- **D13 · HEIC é aceito, sem pré-visualização garantida.** Aceitar no backend; na UI, ícone genérico + download quando o browser não renderizar.
- **D14 · Contagem de não vistas por índice parcial (ver D26 para a semântica).** Cache no React Query com `staleTime: 60_000`, invalidado no client ao marcar como vista.
- **D15 · Indicativos nos ícones do menu lateral (só AM/OP/CL_ADMIN, ver D26).** Ponto amarelo no ícone de Appointments (issues não vistas ligadas a appointment) e no de Properties (issues não vistas **sem** appointment). Rótulo acessível `"N unseen issues"`.
- **D16 · Storage não configurado → 503 com mensagem.** O `UnconfiguredStorageService` já devolve 503; a UI mostra a string única `FILE_STORAGE_UNAVAILABLE_MESSAGE` (shared), sem tela quebrada. Mesma string no web, PWA e portal.
- **D17 · Fotos no portal do inquilino: escopo e rate limit por token (ver D21).** A chave de storage é presa ao `appointment_id` do token.
- **D18 · Fotos no "Não consigo fazer": cria Issue automaticamente.** Com fotos na folha "Can't do this job", o PWA envia o `cant_do` e, se houver fotos confirmadas, cria a issue em seguida com `source=INSPECTOR`, `cant_do_event_id` preenchido e motivo = rótulo do motivo + nota. Se a criação da issue falhar, logar e **não** reverter o cant-do (o evento crítico é o cant-do).
- **D19 · Merge order:** TASK-F10-1 → TASK-F10-2, TASK-F10-3, TASK-F10-4 (os três últimos em paralelo; tocam arquivos disjuntos — web features/sidebar, PWA, portal routes + `PortalPage.tsx`; só a F10-4 regenera `openapi.json`/`api-types.ts` depois da F10-1).

### Decisões da validação (2026-11-07)

- **D20 · Presign antes da issue + CHECK relaxado (achado B1/8b).** O fluxo cria `PropertyFile` `type=ISSUE` com `status=PENDING` e `issue_id = NULL` antes de a issue existir. O CHECK `issue_id_matches_type` é **relaxado** para permitir isso enquanto PENDING:
  ```sql
  CONSTRAINT issue_id_matches_type CHECK (
    status = 'PENDING'
    OR (type = 'ISSUE' AND issue_id IS NOT NULL)
    OR (type <> 'ISSUE' AND issue_id IS NULL)
  )
  ```
  O `CreatePropertyIssueUseCase` roda numa transação: cria a issue e dá `UPDATE property_files SET issue_id = :issueId, appointment_id = :appointmentId, status = 'READY' WHERE id = ANY(:fileIds) AND status = 'PENDING' AND type = 'ISSUE' AND issue_id IS NULL AND tenant_id = :tenantId`, exigindo que todas as linhas atualizem (senão 409). Fotos PENDING não ligadas a issue viram órfãs e caem no job de retenção (D22).
- **D21 · Rate limit do portal por token (achado B2/6b).** O mecanismo atual do portal é `{ rateLimit: { max: 30, timeWindow: '1 minute' } }` **por IP** (sem `keyGenerator`). As rotas de upload de issue do portal ganham um limite **por token**: `keyGenerator` que usa o token (padrão de `inspector-notice.routes.ts:87`, que usa `userId ?? ip`). Teto: **12 presigns/token/hora** (≥ `PORTAL_MAX_PHOTOS_PER_ISSUE` com margem para reenvio de falha), mantendo o limite genérico de 30/min por IP por cima. Sem isso, 3/h < 5 fotos tornava a feature impossível.
- **D22 · Órfãos PENDING apagam o objeto do storage (achado 6c).** O passo 3 do job de retenção não só faz soft-delete das linhas `PENDING > 24 h`: chama `IStorageService.deleteObject` (ignorando not-found), seta `purged_at` e audita. Sem isso, um upload presignado nunca confirmado deixaria o objeto no bucket para sempre.
- **D23 · Mark-as-seen por CAS (achado 6d).** `UPDATE property_issues SET seen_at = now(), seen_by_user_id = :userId WHERE id = :id AND seen_at IS NULL AND deleted_at IS NULL` e ramificar pelo número de linhas afetadas (0 = já vista, devolve `{ alreadySeen: true }`; 1 = audita `property_issue.seen`). Evita o TOCTOU de dois CL_ADMIN clicando junto (precedente: approve self-approval CAS).
- **D24 · `Idempotency-Key` em comandos críticos (achado 6f).** `POST .../property-issues` (nas 3 superfícies) e o confirm de upload exigem `Idempotency-Key` (§7.7 do CLAUDE.md raiz; precedente F02-2). Um retry do celular após timeout não duplica issue nem arquivo.
- **D25 · Gramática de storage key no shared (achado 6i).** Uma só fonte: `buildPropertyFileStorageKey({ tenantId, propertyId, fileId, ext })` → `files/{tenantId}/{propertyId}/{fileId}.{ext}` e `buildPortalIssueStorageKey({ tenantId, appointmentId, fileId, ext })` → `files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}`, ambas no shared, bucket `inspection-assets`. O confirm valida a chave ↔ linha por essa gramática (não por `.jpg` fixo).
- **D26 · Semântica de `hasUnseenIssues` e escopo dos indicativos (achados 1c/2b).** No payload de **appointment**: `hasUnseenIssues` = existe issue não vista e não excluída ligada ao appointment. No payload de **property**: `hasUnseenIssues` = existe **qualquer** issue não vista e não excluída do imóvel (com ou sem appointment) — é o que acende a **borda** da linha. O **ponto amarelo** do ícone de Properties usa só issues **sem** appointment (índice mais estreito). Por isso há dois índices parciais no imóvel (D-DDL). Os campos e o endpoint de contagem só são preenchidos para **AM/OP/CL_ADMIN**; para CL_USER e INSP o campo vem `false` (não podem marcar como vista).
- **D27 · Expurgo e exclusão de foto de issue (achados 6e/6j).** Uma issue pode existir com 0 fotos (o motivo é o registro mínimo); o card mostra "No photos". Quando o expurgo por `retentionDays` atinge uma foto `READY` de issue, a foto some e o card mostra "Photo removed (retention)"; a issue em si não é excluída.
- **D28 · Visibilidade T-1 do inspetor (achado 2a).** `ListPropertyFilesUseCase`, `GetSignedDownloadUrlUseCase` e a lista de issues do PWA reusam o **predicado de visibilidade inspetor↔appointment já existente** (não um `inspector_id = me` solto), para respeitar a janela T-1 de atribuição.
- **D29 · Uma chave `propertyFiles` no PlatformSetting (achado 7c).** O registry é "uma chave por feature" (`schemas/platform-settings.ts`, `{ schema, defaults, section }`). A F10 acrescenta **uma** chave `propertyFiles` com um objeto Zod de 6 campos (não 6 chaves planas), com `section: 'Property files'`. O path `packages/shared/src/platform-settings/` **não existe** — o arquivo é `packages/shared/src/schemas/platform-settings.ts`.
- **D-X01 · X01 não entrega badge por item.** O X01 só tem o indicador de grupo ativo (`bg-realty`), não um badge por item. A F10-2 cria o primitivo `SidebarItemBadge`. O X01 continua como dependência **de ordem** (evitar conflito no `Sidebar.tsx`), não um bloqueador funcional.

---

## TASK-F10-1 · Backend + shared: modelos, use cases de arquivo e issue, contagem, config, retenção

> **Dependências de execução**
> - **Bloqueada por (precisa estar mergeada antes):** TASK-F03-1 (`PlatformSetting`), TASK-F03-2 (tabela `inspector_field_events`, FK de `cant_do_event_id`)
> - **Desbloqueia:** TASK-F10-2, TASK-F10-3, TASK-F10-4

### Objetivo

Criar a infraestrutura de dados e use cases que as três outras tarefas consomem.

### Escopo

**Migration (1 arquivo, 2 tabelas) — nome é placeholder (D19 do F03), regenerado no `prisma migrate dev`:**

```sql
-- property_issues
CREATE TABLE property_issues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  property_id   UUID NOT NULL REFERENCES properties(id),
  appointment_id UUID REFERENCES appointments(id),
  reason        TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  source        TEXT NOT NULL CHECK (source IN ('INSPECTOR','STAFF','RENTAL_TENANT_PORTAL')),
  created_by_user_id UUID REFERENCES users(id),
  cant_do_event_id UUID REFERENCES inspector_field_events(id),
  seen_at       TIMESTAMPTZ,
  seen_by_user_id UUID REFERENCES users(id),
  deleted_at    TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- property_files
CREATE TABLE property_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  appointment_id  UUID REFERENCES appointments(id),
  issue_id        UUID REFERENCES property_issues(id),
  type            TEXT NOT NULL CHECK (type IN ('ISSUE','DOCUMENT','REPORT','OTHER')),
  version_group_id UUID NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  file_name       TEXT NOT NULL,
  mime            TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  storage_key     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY')),
  uploaded_by_user_id UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users(id),
  purged_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- D20: issue_id obrigatório para ISSUE READY; livre enquanto PENDING; proibido nos demais tipos
  CONSTRAINT issue_id_matches_type CHECK (
    status = 'PENDING'
    OR (type = 'ISSUE' AND issue_id IS NOT NULL)
    OR (type <> 'ISSUE' AND issue_id IS NULL)
  ),
  CONSTRAINT uq_version UNIQUE (version_group_id, version),
  CONSTRAINT uq_storage_key UNIQUE (storage_key)
);

-- índices (CHECK/índices parciais ficam na migration SQL; Prisma não os representa, e o drift check não os derruba)
CREATE INDEX ON property_issues (tenant_id, appointment_id)
  WHERE seen_at IS NULL AND deleted_at IS NULL;
-- ponto amarelo de Properties (issues sem appointment)
CREATE INDEX ON property_issues (tenant_id, property_id)
  WHERE appointment_id IS NULL AND seen_at IS NULL AND deleted_at IS NULL;
-- borda da linha de imóvel (qualquer issue não vista do imóvel) — D26
CREATE INDEX ON property_issues (tenant_id, property_id)
  WHERE seen_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ON property_files (property_id, type) WHERE deleted_at IS NULL;
CREATE INDEX ON property_files (appointment_id, type) WHERE deleted_at IS NULL;
CREATE INDEX ON property_files (issue_id) WHERE deleted_at IS NULL;
-- job de retenção: órfãos PENDING e purga
CREATE INDEX ON property_files (created_at) WHERE status = 'PENDING' AND purged_at IS NULL;
CREATE INDEX ON property_files (deleted_at) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
```

**PlatformSetting — uma chave `propertyFiles` (D29):** acrescentar ao `PLATFORM_SETTINGS_REGISTRY` em `packages/shared/src/schemas/platform-settings.ts` um objeto Zod com `section: 'Property files'`:

| Campo | Tipo | Padrão |
|---|---|---|
| `allowedMimes` | `string[]` | `['image/jpeg','image/png','image/heic','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']` |
| `maxFileSizeMb` | `number` int 5–200 | `20` |
| `issueImageMimes` | `string[]` | `['image/jpeg','image/png','image/heic','image/webp']` |
| `maxPhotosPerIssue` | `number` int 1–20 | `10` |
| `retentionDays` | `number int \| null` | `null` (manter tudo) |
| `deletedRetentionDays` | `number` int 30–3650 | `365` |

Shared também: `PORTAL_MAX_PHOTOS_PER_ISSUE = 5` (constante; efetivo no portal = `min(5, maxPhotosPerIssue)`), `FILE_STORAGE_UNAVAILABLE_MESSAGE`, `buildPropertyFileStorageKey` / `buildPortalIssueStorageKey` (D25).

**Use cases de arquivo** (`property-files` module, `application/`):

- `PresignPropertyFileUploadUseCase` → valida MIME (`allowedMimes`, ou `issueImageMimes` quando for foto de issue); gera key via `buildPropertyFileStorageKey`; `createSignedUploadUrl`; grava `PropertyFile` `status=PENDING`; retorna `{ fileId, uploadUrl }`.
- `ConfirmPropertyFileUploadUseCase` → `headObject` (existe + `sizeBytes`), sniff `file-type`, `sizeBytes ≤ maxFileSizeMb`; seta `status=READY` (para não-issue; foto de issue vira READY no create da issue, D20); audita `property_file.uploaded`. Exige `Idempotency-Key` (D24).
- `ListPropertyFilesUseCase` → por `(propertyId, type?)` e `(appointmentId, type?)`, `deleted_at IS NULL`, `status=READY`; contagem total e por tipo; respeita D28 para INSP.
- `GetSignedDownloadUrlUseCase` → `createSignedDownloadUrl` TTL 5 min; valida escopo (D6/D28).
- `AddPropertyFileVersionUseCase` → nova versão no mesmo `version_group_id` com `version = max+1`; na corrida, o `UNIQUE (version_group_id, version)` dá 23505 → retry com `max+1` recomputado; audita `property_file.version_added`.
- `DeletePropertyFileUseCase` → exclusão lógica (AM/OP); audita `property_file.deleted`.

**Use cases de issue** (`property-issues` module, `application/`):

- `CreatePropertyIssueUseCase` → valida `appointmentId` ∈ imóvel + tenant; transação D20 (cria issue + liga as fotos PENDING já confirmadas); `Idempotency-Key` (D24); audita `property_issue.created`.
- `MarkPropertyIssueAsSeenUseCase` → CAS D23; audita `property_issue.seen` só quando afeta 1 linha.
- `DeletePropertyIssueUseCase` → exclusão lógica da issue **e** das fotos (`issue_id`); AM/OP; audita `property_issue.deleted`.

**Contagem e payloads:**

- `GET /v1/property-issues/unseen-count` (AM/OP/CL_ADMIN) → `{ appointmentsWithUnseenIssues, propertiesWithUnseenIssues }` pelos índices parciais (rota estática no módulo de issues, nome não-ambíguo).
- `hasUnseenIssues: boolean` nos payloads de `GET /v1/appointments` e `GET /v1/properties` — semântica D26; `false` para CL_USER/INSP.
- `fileCounts: { total, issues, documents, reports, other }` em `GET /v1/appointments/:id` e `GET /v1/properties/:id`.
- Regenerar `openapi.json` + `api-types.ts` (`pnpm generate:api`) e **atualizar todas as fixtures de teste** desses 4 payloads.

**Role-matrix:** registrar as ações novas em `packages/shared/src/permissions/role-matrix.ts` (precedente F09-1 `map.execution_density`): `property_file.read/upload/version/delete`, `property_issue.create/mark_seen/delete`, `property_issue.unseen_count`.

**Job de retenção** (pg-boss, diário, `property-file-retention.worker.ts`):

1. `deleted_at < now() - deletedRetentionDays` e `status=READY` e `purged_at IS NULL` → `deleteObject` + `purged_at = now()`; audita `property_file.purged`.
2. `retentionDays` não-nulo: ativos com `created_at < now() - retentionDays` → `deleteObject` + `purged_at`; audita. Foto de issue purgada segue D27.
3. `status=PENDING` e `created_at < now() - 24h` e `purged_at IS NULL` → `deleteObject` (ignora not-found) + soft-delete + `purged_at`; audita (D22).

**Docs:** atualizar ou remover a doc do `InspectionAsset` (`docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md`, `specs/008-*`) — modelo que nunca existiu no schema v1 (achado 1b).

**Testes:**

- Unidade: MIME/tamanho, CHECK relaxado D20 (PENDING sem issue_id passa; READY type=ISSUE sem issue_id falha), CAS do "vista" (D23, 2 chamadas concorrentes → 1 audita), `version` sequencial + corrida no `UNIQUE`, cross-tenant 404 (arquivo, issue e download).
- Integração (supertest): RBAC nas 5 funções incl. **INSP não lê arquivos/issues de appointment de outro inspetor** e **CL_USER não faz presign** (achado 2d); fluxo presign→confirm com storage stub; job de retenção (mover `created_at`/`deleted_at` e verificar `deleteObject` chamado + `purged_at`); **C.A4: asserts no payload dos audits `property_file.uploaded/.version_added/.deleted`** (autor, data, versão); **C.A1: upload via appointment → `GET files?propertyId` devolve o arquivo com `appointmentId`**; **C.A3: URL assinada de v1 e v2**; **C.A5: confirm recusa `sizeBytes > max` e magic-bytes divergente**; **filtro "With issues" no `GET /v1/appointments` e `/v1/properties`** (com issue × com issue não vista).

---

## TASK-F10-2 · Web: componente Files, Platform settings, indicativos no menu, borda e filtros

> **Dependências de execução**
> - **Bloqueada por:** TASK-F10-1
> - **Ordem (não bloqueador funcional):** mergear depois do X01 para evitar conflito no `Sidebar.tsx` (D-X01)
> - **Pode rodar em paralelo com:** TASK-F10-3, TASK-F10-4

### Objetivo

UI completa de arquivos e issues no web, a seção de config em Platform settings e os indicativos visuais.

### Escopo

**Componente `<PropertyFilesPanel>` (reutilizado no appointment e no imóvel):**

- Aba **Files (n)** com subabas: **Issues (n)** (padrão) · Documents (n) · Reports (n) · Other (n). Busca por nome na subaba ativa.
- **Issue card:** motivo, origem (badge "Inspector"/"Staff"/"Tenant"), autor, data/hora, fotos em grid (ícone + download quando HEIC não renderiza, D13), status "Seen by {name} · {dd/mm hh:mm}" ou **"Mark as seen"** (AM/OP/CL_ADMIN); "No photos" / "Photo removed (retention)" conforme D27.
- **Document/Report/Other card:** nome, tipo (badge), autor, data, pré-visualização (imagem inline; PDF em nova aba), download, "v{n}".
- **Upload:** por subaba; drawer de criação de issue (motivo obrigatório + fotos, `Idempotency-Key` D24); input de arquivo para outros tipos; no imóvel, seletor opcional de appointment do imóvel.
- **"New version"** + drawer "Versions" (download de cada versão). **Excluir** (AM/OP) com `ConfirmDialog` (optimistic).
- 503 de storage → `FILE_STORAGE_UNAVAILABLE_MESSAGE` (D16).

**Seção "Files" em Platform settings** (achado 1a): nova `PropertyFilesSettingsSection` em `apps/web/src/features/platform-settings/`, reusando `usePlatformSetting('propertyFiles')` (padrão da F03-4), exposta na `PlatformSettingsPage`.

**Encaixe no appointment detail (`AppointmentDetailPage.tsx`):** nova aba **"Files"** após "Portal Activity"; botão **"View all property files"** (→ aba Files do imóvel, same tab) e, na subaba Issues, **"View all property issues"**.

**Encaixe no property detail:** nova aba **"Files"** após "Appointments"; em cada item ligado a appointment, badge **"Appointment #{code}"** + **"Open appointment"**.

**Indicativos:** `GET /v1/property-issues/unseen-count` (staleTime 60 s, invalidado no mark-seen); primitivo novo **`SidebarItemBadge`** (ponto amarelo, D-X01) nos ícones Appointments e Properties com rótulo `"N unseen issues"`; `hasUnseenIssues` → borda amarela na linha (appointment e property, semântica D26); filtro **"With issues"** nas duas listas.

**Testes:** Vitest/RTL (MIME inválido recusado, mark-as-seen idempotente na UI, borda aparece/some, "New version" preserva anterior, badge do sidebar, filtro "With issues"); Playwright E2E **hermético** (todas as chamadas stubadas): row com `hasUnseenIssues:true` → borda + ponto amarelo → "Mark as seen" (stub) → borda e ponto somem; property panel renderiza badge "Appointment #code" + "Open appointment" (C.A1 no lado web).

---

## TASK-F10-3 · PWA: seção Files, "Report issue" e fotos no "Não consigo fazer"

> **Dependências de execução**
> - **Bloqueada por:** TASK-F10-1, TASK-F03-3 (`CantDoSheet` — modificada aqui)
> - **Pode rodar em paralelo com:** TASK-F10-2, TASK-F10-4

### Objetivo

Leitura de arquivos e criação de issues pelo inspetor no PWA.

### Escopo

**Seção "Files" no detalhe do serviço:** subabas Issues (primeira) → Documents → Reports → Other; Issues lista todas as issues do appointment (incl. inquilino e operação) com download das fotos; demais tipos com download. Só leitura; respeita D28. Precisa de conexão (não entra no cache de dados do service worker, só o schema da rota).

**"Report issue" (online-only):** botão na subaba Issues; sheet com "Reason" (obrigatório 1–1000) + "Add photos" (câmera/galeria), envio foto a foto com progresso/erro por foto (D12); submit chama `CreatePropertyIssueUseCase` com `Idempotency-Key` (D24); sem fila offline, sem retry automático; 503 → `FILE_STORAGE_UNAVAILABLE_MESSAGE`.

**Fotos no "Não consigo fazer" (`CantDoSheet`, da F03-3):** seção "Add photos (optional)"; mesma UX foto a foto; no submit, envia o `cant-do` e, com fotos, cria a issue (D18).

**Testes:** Vitest (envio foto a foto, falha individual, mocks de presign/confirm); Playwright PWA E2E **hermético**, Chromium **e** WebKit (stubs de input de arquivo/câmera): "Report issue" com 1 foto → issue aparece na lista (stubada); "Can't do" com foto → chamada de criação de issue disparada.

---

## TASK-F10-4 · Portal: issue do inquilino antes da confirmação

> **Dependências de execução**
> - **Bloqueada por:** TASK-F10-1
> - **Pode rodar em paralelo com:** TASK-F10-2, TASK-F10-3

### Objetivo

Permitir que o inquilino reporte um problema no imóvel pelo portal, antes de confirmar a inspeção.

### Escopo

**Rotas de portal (token)** — rate limit por token (D21): `keyGenerator` pelo token, **12 presigns/token/hora**, mantendo o 30/min por IP genérico por cima.

- `POST /v1/portal/:token/property-issues/presign` → valida `issueImageMimes` + `maxFileSizeMb`; key via `buildPortalIssueStorageKey` (D25).
- `POST /v1/portal/:token/property-issues/confirm-upload` → `headObject` + magic bytes + tamanho; `Idempotency-Key` (D24).
- `POST /v1/portal/:token/property-issues` → cria issue `source=RENTAL_TENANT_PORTAL`, `created_by_user_id=null`, máx `min(PORTAL_MAX_PHOTOS_PER_ISSUE, maxPhotosPerIssue)` fotos; `Idempotency-Key`; audita.
- `GET /v1/portal/:token/property-issues` → só as issues do `appointment_id` do token com `source=RENTAL_TENANT_PORTAL`.

**UI do portal:** seção "Report a problem with the property" **antes** do botão de confirmar; "Describe the issue" (até 1000) + "Add photos" (até 5, foto a foto com progresso); "Submit report" separado da confirmação; lista read-only dos próprios envios; sem resposta/status/notificação; requer conexão.

**Testes:** Vitest (rate limit por token 12/h, escopo do token — não vê issue de outro appointment, MIME inválido recusado); Playwright E2E portal **hermético**: submeter issue com 2 fotos → chamada de criação disparada (stubada).
