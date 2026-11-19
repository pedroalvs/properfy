# F10 · Anexos e mídias

| | |
|---|---|
| **Contrato** | C.1–C.9 + "issues do inquilino com fotos" (critérios C.A1–C.A5) |
| **Esforço** | **10,0 dias** · dificuldade **M/A** |
| **Depende de** | – (`PlatformSetting` do F03; se F10 vier antes, F10 cria o `PlatformSetting`) |
| **Bloqueia** | – |
| **Status** | ⏸️ **EM ESPERA: toda a parte de imagens e arquivos será revista após uma validação que virá do cliente** (dev, 2026-10-27). As decisões abaixo são **provisórias**. Não escrever a spec antes dessa validação. |
| **Decisões** | Q7 provisória; ver o quadro abaixo |

## Objetivo

Guardar arquivos (fotos, documentos, PDFs) produzidos **fora** da plataforma, vinculados ao serviço e/ou ao imóvel. O acesso respeita agência e perfil, com versão, auditoria e retenção. Além disso, o inquilino pode enviar fotos e uma nota pelo portal existente.

## Decisões provisórias (2026-10-27), a revalidar com o cliente

| Tema | Decisão provisória |
|---|---|
| Portal do inquilino (Q7) | Nota (até 500 caracteres) + até 5 fotos. Sem status, respostas ou SLA. |
| Quem envia, versiona e exclui no web | AM/OP em qualquer agência; CL_ADMIN/CL_USER na própria. A exclusão é lógica, com auditoria. |
| Upload pelo inspetor | **Em aberto**: depende da validação do cliente. Hoje o plano prevê só visualização. |
| Retenção (C.8) | Manter tudo por padrão (sem expurgo), com prazo configurável. Os excluídos são apagados do storage depois de 7 dias. |

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
- **Retenção:** há worker de retenção da auditoria com legal hold e `report.expire-files`, que servem de padrão para o expurgo.

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| C.1 / C.6 / C.7 | Modelo `Attachment(tenant_id, appointment_id?, property_id?, version_group_id, version, file_name, mime, size_bytes, storage_key, status PENDING\|READY, source STAFF\|RENTAL_TENANT_PORTAL, uploaded_by_user_id?, deleted_at)`. Upload a partir do appointment grava **também** o `property_id` (C.A1). Use cases: presign, confirm (`headObject` + magic bytes + tamanho), list, download (URL assinada de 5 min), soft-delete e "nova versão" (mesmo `version_group_id`, versão + 1). Auditoria `attachment.uploaded`, `attachment.version_added` e `attachment.deleted`. Bucket `inspection-assets`, chave `tenants/{t}/attachments/{uuid}.{ext}`. | A | 3,5 | – |
| C.2 / C.8 | Config no `PlatformSetting`: MIMEs aceitos, tamanho máximo e `retentionDays` (null = mantém tudo). Recusa com mensagem clara (C.A5). Job diário: apaga do storage os soft-deletados há mais de 7 dias e expurga o que passou da retenção, com auditoria. Um job de limpeza também remove os PENDING órfãos com mais de 24 h. | M | 1,5 | B6 |
| C.4 / C.5 / C.9 | Web: aba **"Files (n)"** no detalhe do appointment e no do imóvel. O imóvel mostra os próprios arquivos e os dos appointments dele, agrupados. Inclui upload (arrastar ou escolher), filtro por nome, pré-visualização de imagem, PDF em nova aba, download, "New version", drawer de versões e excluir. A contagem vem no payload do detalhe. | M | 2,5 | C.1 |
| PWA | Seção **somente leitura** "Files" no detalhe do serviço, abaixo do "Tenant Note": fotos do inquilino e arquivos do appointment. | B | 0,5 | C.1 |
| Portal (Q7) | "Report something about the property": nota de até 500 caracteres + até 5 imagens, com presign/confirm **escopado pelo token**, rate limit e somente imagens. Vira `Attachment(source=RENTAL_TENANT_PORTAL)` + nota, visível para a OP (aba Files) e o inspetor (PWA). Sem status nem respostas. | M | 2,0 | C.1 |

## Fora do escopo

- Ler, extrair ou classificar o conteúdo dos arquivos.
- Edição, anotação ou assinatura.
- Conversão ou compressão.
- Pastas.
- Retenção por categoria.
- Versionamento automático por nome igual.
- Upload pelo inspetor (não está no contrato).
- Fluxo de chamado no portal.

## RBAC

| Perfil | Pode |
|---|---|
| AM/OP | tudo, cross-tenant (via `requireTenantScope`) |
| CL_ADMIN / CL_USER | listar, enviar, versionar e excluir no próprio tenant |
| INSP | ler, só nos appointments atribuídos (respeitando a regra de visibilidade T-1) |
| TNT (token) | enviar e ver só os próprios envios do portal |

## Critérios de aceite → como provar

- **C.A1:** o arquivo aparece vinculado ao appointment e ao imóvel corretos.
- **C.A2:** um usuário de outra agência recebe 404, sem expor a existência do arquivo.
- **C.A3:** uma nova versão preserva a anterior, e as duas podem ser baixadas.
- **C.A4:** a auditoria registra autor, data e versão no envio, na nova versão e na exclusão.
- **C.A5:** formato ou tamanho fora da configuração é recusado com mensagem clara, tanto no presign quanto no confirm.

## Riscos e armadilhas

- **Limite de tamanho:** o presign contorna o limite de 10 MB do multipart, então o tamanho **real** é validado no confirm.
- **Content-type falso:** usar o sniff com `file-type` no confirm.
- **Storage não configurado:** o 503 tem que aparecer na UI como mensagem, não como tela quebrada.
- **Porta do storage:** mora em `inspector-execution`. Mover para `shared/domain` é recomendado (decisão da spec).
- **Documentação desatualizada:** atualizar ou remover a doc do `InspectionAsset` no mesmo PR do modelo.
- **HEIC (iPhone):** aceitar o upload, mas o browser pode não pré-visualizar. Nesse caso, mostrar ícone + download.

## Quebra em PRs

1. Backend (modelo, use cases, jobs).
2. Web (abas Files).
3. Portal + PWA.
