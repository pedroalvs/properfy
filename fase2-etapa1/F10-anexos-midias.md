# F10 · Arquivos do imóvel e issues

| | |
|---|---|
| **Contrato** | C.1–C.9 (critérios C.A1–C.A5) **+ aditivo "Issues"**, aprovado pelo cliente em 2026-10-30: fotos de problema enviadas pelo inspetor, pela operação/agência e pelo inquilino, com indicativos e "marcar como vista". |
| **Esforço** | Cotação: **13,5 dias** = **6,5 do contrato (C)** + **7,0 do aditivo** · dificuldade **M/A**. Reestimativa de engenharia após validação (2026-11-07): **15,5 dias** — ver "Ajuste de estimativa" em `tarefas/F10-tarefas.md`. |
| **Depende de** | F03-1 (`PlatformSetting`), F03-2 (folha "Não consigo fazer", que ganha fotos), X01 (padrão de menu lateral onde entram os pontos amarelos) |
| **Bloqueia** | – |
| **Status** | ✅ Decisões fechadas com o cliente em 2026-10-30. Pronto para quebra em tarefas. |

## Objetivo

Um repositório de arquivos **centrado no imóvel**:
- Todo arquivo pertence a um imóvel e, **sempre que possível, também a um appointment**. São 4 tipos: **Issue**, **Document**, **Report** e **Other**.
- **Issue** é um registro com **motivo + fotos** de um problema.
- Tanto o **appointment** quanto o **imóvel** têm uma aba **Files** com **subabas por tipo**: **Issues** (principal, abre por padrão), Documents, Reports e Other.
- O que é enviado pelo appointment fica ligado ao appointment **e** ao imóvel. O que é enviado direto no imóvel pode ficar sem appointment, ou ser ligado a um appointment daquele imóvel.
- As issues ainda não vistas ficam **sinalizadas** (ponto amarelo no menu, borda amarela na lista, filtro) até alguém da operação ou da agência **marcar como vista**.

## Como isso cobre o contrato (C)

| Item | Como é atendido |
|---|---|
| C.1 vínculo appointment / imóvel / ambos | Todo arquivo pertence a um imóvel e, de qualquer tipo, pode também pertencer a um appointment do mesmo imóvel. |
| C.2 imagem, documento, PDF; formatos e tamanho configuráveis | Document, Report e Other aceitam imagem, documento e PDF. Issue aceita só imagens. A lista de formatos e o tamanho máximo ficam em "Platform settings". |
| C.3 permissão por agência e perfil | Matriz de RBAC abaixo, com escopo por tenant e `requireTenantScope` para a OP. |
| C.4 visualização e download | Pré-visualização de imagem, PDF em nova aba e download individual, no web e no app. |
| C.5 organização por serviço e imóvel, busca por nome | Aba Files no appointment e no imóvel, com subabas por tipo e busca pelo nome do arquivo. |
| C.6 versionamento | Ação **"New version"** em qualquer arquivo, inclusive foto de issue. A versão anterior continua acessível no drawer "Versions". |
| C.7 auditoria | Envio, nova versão, exclusão, criação de issue, "vista" e exclusão de issue, com autor, data/hora e versão. |
| C.8 retenção configurável | `retentionDays` para arquivos ativos (padrão: manter tudo) e `deletedRetentionDays` para os excluídos (padrão **365**, decisão do cliente). |
| C.9 contagem nas fichas | "Files (n)" no detalhe do appointment e do imóvel, com a contagem também em cada subaba ("Issues (n)" etc.). |

## Decisões tomadas (2026-10-30, resposta do cliente)

| Tema | Decisão |
|---|---|
| Natureza | **Aditivo** (cláusula 9.4): issues do inspetor, indicativos, "marcar como vista" e issue do inquilino no portal. A base de arquivos (C) é do contrato. |
| Modelo | Issues são **um tipo dentro dos arquivos**. **Tudo que for possível fica ligado ao appointment** (dev, 2026-10-30). O appointment e o imóvel têm a aba **Files** com subabas por tipo; **Issues é a subaba principal**. |
| Tipos | **Issue, Document, Report, Other.** Todos podem ter vínculo com appointment. Só Issue tem motivo e "marcar como vista". |
| Versionamento | **"New version" por arquivo** (C.6/C.A3), só no web. O histórico de issues sozinho não atenderia ao contrato. |
| Quem cria issue | **INSP** pelo app (nos appointments dele); **AM, OP e CL_ADMIN** pelo detalhe do appointment ou direto no imóvel; **inquilino** pelo portal, antes de confirmar. |
| Quem envia Document/Report/Other | **AM, OP e CL_ADMIN**, pelo appointment ou pelo imóvel. |
| "Não consigo fazer" | A issue é **independente do status** (o inspetor segue a vistoria). A folha "Não consigo fazer" (F03) também passa a aceitar fotos opcionais; com fotos, gera uma Issue com o mesmo motivo e nota. |
| Quem marca como vista | **AM, OP e CL_ADMIN.** Grava quem marcou e a data/hora, e audita. |
| Quem vê | **Todos que têm acesso ao appointment ou ao imóvel**, incluindo CL_USER e o inspetor atribuído. |
| Quem exclui | **AM e OP.** A exclusão é lógica e mantida por **1 ano**; depois disso o arquivo é apagado do storage. |
| Issue do inquilino | Antes de confirmar, o inquilino pode reportar um problema no portal: motivo + até 5 fotos. Vira uma Issue do appointment com origem **"Rental tenant"**, com os mesmos indicativos. |
| Indicativos (appointments) | **Ponto amarelo** no canto superior direito do ícone de **Appointments** no menu lateral quando há issue não vista ligada a appointment; **borda amarela** na linha do appointment com issue não vista; filtro **"With issues"**. |
| Indicativos (imóveis) | **Ponto amarelo** no ícone de **Properties** quando há issue não vista **sem appointment**; borda amarela no imóvel com qualquer issue não vista; filtro "With issues" na lista de imóveis. |
| Navegação | Aba Files do appointment → botão **"View all property files"** (abre a aba Files do imóvel na mesma subaba; na de Issues: "View all property issues"). No imóvel, todo arquivo ou issue ligado a appointment **mostra a referência do appointment** e tem o botão **"Open appointment"**. |

## Estado atual (verificado @042a9674)

- **Modelo de arquivo:** não existe. `InspectionAsset` nunca existiu no schema v1. A documentação está desatualizada em `docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md` e `specs/008-*`.
- **Storage:** a porta `IStorageService` (`inspector-execution/domain/storage.service.ts:12-15`) oferece upload assinado, `headObject`, download assinado e delete. A implementação é Supabase, e `UnconfiguredStorageService` → 503.
- **Bucket:** o bucket privado **`inspection-assets` já está provisionado e não é usado** (`provision-storage-buckets.ts:40-46`).
- **Padrões a copiar:**
  - presign → confirm com regex vinculando a chave (`confirm-inspector-document-upload.use-case.ts:15`);
  - checagem de magic bytes (`file-type`) e tamanho (`upload-tenant-logo.use-case.ts`);
  - download assinado de 5 min.
- **Inconsistência de OP:** `get-property.use-case.ts:47-53` ainda prende a OP ao tenant. **Não copiar:** usar `requireTenantScope`.
- **Abas do web:** detalhe do appointment = Overview, Contact, Notifications, Timeline, Financial, Portal Activity (`AppointmentDetailPage.tsx:47-54`). Detalhe do imóvel = Overview, Appointments.
- **Portal:** rotas `:token`, confirm, survey, contact, unavailable, available-groups, join-group. Sem upload. A nota do inquilino já aparece no PWA (#1303, card "Tenant Note").
- **Menu lateral:** `Sidebar.tsx`, que a X01 reorganiza. Não existe badge por item hoje.
- **Retenção:** há worker de retenção da auditoria com legal hold e `report.expire-files`, que servem de padrão para o expurgo.

## Modelo

- **`PropertyIssue`**, sem tabela de tipo à parte:

  | Campo | Regra |
  |---|---|
  | `tenant_id`, `property_id` | Obrigatórios |
  | `appointment_id` | Opcional |
  | `reason` | Texto, 1–1000 caracteres |
  | `source` | `INSPECTOR` \| `STAFF` \| `RENTAL_TENANT_PORTAL` |
  | `created_by_user_id` | Nulo para o inquilino |
  | `cant_do_event_id` | Opcional (vínculo com o evento da F03) |
  | `seen_at`, `seen_by_user_id` | Preenchidos ao marcar como vista |
  | `deleted_at`, `deleted_by_user_id` | Exclusão lógica |

  O `appointment_id` precisa pertencer ao mesmo `property_id` e ao mesmo tenant (validado no use case).

- **`PropertyFile`**:

  | Campo | Regra |
  |---|---|
  | `tenant_id`, `property_id` | Obrigatórios |
  | `appointment_id` | Opcional, em qualquer tipo. Numa foto de issue, é igual ao da issue |
  | `issue_id` | Obrigatório se `type = ISSUE`, proibido nos demais tipos |
  | `type` | `ISSUE` \| `DOCUMENT` \| `REPORT` \| `OTHER` |
  | `version_group_id`, `version` | Controle de versão |
  | `file_name`, `mime`, `size_bytes`, `storage_key` | Metadados do arquivo |
  | `status` | `PENDING` \| `READY` |
  | `uploaded_by_user_id` | Nulo para o inquilino |
  | `deleted_at`, `deleted_by_user_id` | Exclusão lógica |

- **Índices:**
  - parcial em issues não vistas e não excluídas `(tenant_id, appointment_id)` e `(tenant_id, property_id)`, para os indicativos e filtros;
  - `(property_id, type)` e `(appointment_id, type)` para as subabas.

## Escopo mínimo

| Item | O que fazer | Origem | Dif. | Dias | Depende de |
|---|---|---|---|---|---|
| Base de arquivos | Modelos acima + migration. Use cases: presign, confirm (`headObject` + magic bytes + tamanho), listar, download assinado de 5 min, "New version", excluir (lógica, AM/OP). Auditoria `property_file.uploaded` / `.version_added` / `.deleted`. Importar a porta `IStorageService` existente (`apps/backend/src/modules/inspector-execution/domain/storage.service.ts`), **sem mover o arquivo** (revisão de 2026-11-07: a porta preexiste à Fase 2 e já tem a interface completa). Atualizar ou remover a doc do `InspectionAsset`. | C | M | 2,25 | – |
| Config e retenção | Chaves no `PlatformSetting`: `allowedMimes` (padrão jpg/png/heic/webp/pdf/docx/xlsx), `maxFileSizeMb` (20), `issueImageMimes` (jpg/png/heic/webp), `maxPhotosPerIssue` (10), `retentionDays` (null), `deletedRetentionDays` (365). Seção "Files" em "Platform settings". Job diário: apaga do storage os excluídos além de `deletedRetentionDays`, expurga os ativos além de `retentionDays` e remove os PENDING órfãos com mais de 24 h, tudo auditado. | C | M | 0,5 | F03-1 |
| Componente Files com subabas | Componente único usado no appointment e no imóvel: aba "Files (n)" com subabas **Issues (principal) / Documents / Reports / Other**, cada uma com contagem; busca por nome; upload na subaba ativa (Issue pede motivo + fotos; no imóvel, seletor opcional de appointment do imóvel); pré-visualização, PDF em nova aba, download; "New version" e drawer "Versions"; excluir (AM/OP). As issues aparecem como cartão (motivo, origem, autor, data, fotos, status "Seen by X · dd/mm hh:mm") com "Mark as seen". | C + aditivo | M | 2,25 | Base |
| Files no appointment e no imóvel | Encaixe do componente no detalhe do appointment (nova aba) e no do imóvel. No appointment: botão **"View all property files / issues"**. No imóvel: **referência do appointment sempre visível** em cada item ligado e botão **"Open appointment"**. Contagens no payload dos dois detalhes. | C + aditivo | B/M | 1,25 | Componente |
| Issue: regras | Use cases de criar issue (com 1..`maxPhotosPerIssue` fotos), marcar como vista (idempotente: a 2ª chamada não sobrescreve quem marcou), excluir issue (exclui as fotos juntas). Auditoria `property_issue.created` / `.seen` / `.deleted`. Contagens de não vistas por escopo (usadas pelos indicativos). | Aditivo | M | 0,75 | Base |
| Indicativos e filtros | Endpoint leve de contagem de issues não vistas (appointments × imóveis sem appointment), no escopo do usuário. **Ponto amarelo** nos ícones de Appointments e Properties do menu lateral (com rótulo acessível "N unseen issues"); **borda amarela** na linha de appointment/imóvel com issue não vista (campo `hasUnseenIssues` no payload das listas); filtro **"With issues"** nas duas listas (com issue × com issue não vista). Os indicativos aparecem para AM, OP e CL_ADMIN. | Aditivo | M | 1,5 | Issue: regras, X01 |
| App do inspetor | Seção **"Files"** no detalhe do serviço, com **Issues em primeiro** e os demais tipos do appointment logo abaixo, só leitura: lista as issues (incluindo as do inquilino e da operação) e os documentos com **download**; botão **"Report issue"**: motivo (obrigatório) + fotos pela câmera ou galeria, com progresso de envio por foto e mensagem clara de falha. Precisa de conexão (sem fila offline). | Aditivo | M | 1,5 | Issue: regras |
| Fotos no "Não consigo fazer" | A folha da F03 ganha "Add photos" opcional. Com fotos, cria uma Issue (`source=INSPECTOR`, motivo = rótulo do motivo + nota, `cant_do_event_id`) ligada ao appointment. A rejeição continua igual. | Aditivo | B | 0,5 | App do inspetor, F03-2 |
| Issue do inquilino (portal) | Na tela de confirmação do portal, **antes de confirmar**, a opção "Report a problem with the property": motivo (até 1000 caracteres) + até 5 fotos, com presign/confirm **escopado pelo token**, rate limit e só imagens. Vira Issue com `source=RENTAL_TENANT_PORTAL`. O inquilino vê os próprios envios; não há resposta nem status de chamado. | Aditivo | M | 2,0 | Issue: regras |
| QA | Unidade (validação de tipo, vínculo appointment↔imóvel, versão, retenção, idempotência do "vista"), integração dos uploads e do RBAC (C.A2). **As suites Playwright são herméticas (API stubada, root CLAUDE.md §11), então não há E2E cross-surface real** — a prova end-to-end é um supertest de backend (criar issue como INSP → contagem → marcar vista → contagem 0) + E2E por superfície com stub. | C + aditivo | – | 0,75 | todos |

**Divisão de dias:** contrato (C) = base 2,25 + config 0,5 + componente Files (parte C ~1,75) + encaixe nas duas fichas (parte C ~1,5) + QA ~0,5 ≈ **6,5** · aditivo ≈ **7,0**.

## RBAC

| Perfil | Ver e baixar | Criar issue | Enviar Document/Report/Other | New version | Marcar como vista | Excluir |
|---|---|---|---|---|---|---|
| AM / OP | tudo, cross-tenant (`requireTenantScope`) | appointment e imóvel | sim, pelo appointment ou imóvel | sim | sim | sim (lógica) |
| CL_ADMIN | próprio tenant | appointment e imóvel | sim | sim | sim | não |
| CL_USER | próprio tenant | não | não | não | não | não |
| INSP | arquivos e issues dos appointments atribuídos a ele (respeitando a visibilidade T-1) | no app, nos appointments dele | não | não | não | não |
| Inquilino (token) | só os próprios envios | no portal, antes de confirmar | não | não | não | não |

Acesso a arquivo de outra agência → **404**, sem revelar que ele existe (C.A2).

## Fora do escopo

- Ler, extrair ou classificar o conteúdo dos arquivos.
- Edição, anotação, conversão ou compressão de imagens.
- Pastas e retenção por tipo.
- Fluxo de chamado: status, respostas ou SLA da issue. Só existe "vista / não vista".
- Envio offline de fotos no app.
- Download em lote (zip).
- Restaurar arquivo ou issue excluídos pela UI. Fica só no banco durante o ano de retenção.

## Critérios de aceite → como provar

- **C.A1:** um arquivo (de qualquer tipo) enviado no appointment aparece na aba Files do appointment e na do imóvel certo, na mesma subaba, com a referência do appointment.
- **C.A2:** um usuário de outra agência recebe 404 no arquivo, na issue e no download.
- **C.A3:** "New version" preserva a versão anterior, e as duas podem ser baixadas.
- **C.A4:** a auditoria registra autor, data e versão no envio, na nova versão e na exclusão.
- **C.A5:** formato ou tamanho fora da configuração é recusado com mensagem clara, no presign e no confirm.
- **Aditivo:**
  - uma issue não vista acende o ponto amarelo e a borda;
  - "Mark as seen" grava quem e quando, e apaga os indicativos para todos;
  - o filtro "With issues" lista só os registros com issue;
  - um arquivo excluído some da UI e é apagado do storage depois de 365 dias.

## Riscos e armadilhas

- **Limite de tamanho:** o presign contorna o limite de 10 MB do multipart, então o tamanho **real** é validado no confirm.
- **Content-type falso:** usar o sniff com `file-type` no confirm.
- **HEIC (iPhone):** aceitar o upload, mas o browser pode não pré-visualizar. Nesse caso, mostrar ícone + download.
- **Fotos grandes do celular em rede móvel:** enviar uma foto por vez com progresso; uma falha não perde as fotos já enviadas (a issue só é criada quando todas confirmam, ou o usuário remove as que falharam).
- **Ponto amarelo e desempenho:** a contagem roda em toda tela. Usar o índice parcial e cache curto no React Query (staleTime ~60 s), invalidado ao marcar como vista.
- **Storage não configurado:** o 503 tem que aparecer na UI como mensagem, não como tela quebrada.
- **Portal:** o upload pelo token é a superfície mais exposta. Rate limit, só imagens, tamanho máximo e chave do storage presa ao appointment do token.
- **Custo de storage:** pela cláusula 7 do contrato, é do contratante. A retenção de 1 ano dos excluídos aumenta o volume guardado.

## Quebra em PRs (tarefas)

1. **Backend + shared:** modelos, base de arquivos, issues, "vista", contagens, config, jobs de retenção.
2. **Web:** componente Files com subabas (appointment e imóvel), indicativos no menu, bordas e filtros.
3. **PWA:** seção Files (Issues primeiro), "Report issue" e fotos no "Não consigo fazer".
4. **Portal:** issue do inquilino antes da confirmação.
