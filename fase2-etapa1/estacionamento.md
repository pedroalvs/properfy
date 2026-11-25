# Estacionamento — fora do escopo da Fase 2 · Etapa 1

Estes itens foram encontrados durante a análise. **Nenhum deles entra nas specs F00–F10.** Cada um só pode ser feito por pedido de mudança (§9 do contrato) ou como item técnico separado.

## Encontrados no código

| # | Achado | Evidência | Observação |
|---|---|---|---|
| 1 | Ajustes manuais (`MANUAL_ADJUSTMENT`) nunca chegam à fatura nem aos ganhos do inspetor. Isso inclui o estorno de DONE → REJECTED. | `prisma-financial-entry.repository.ts:126,393,437` | Bug financeiro latente que independe da Fase 2 → abrir issue. |
| 2 | `ServicePriceRule.bonus_rule_json` é salvo e copiado no snapshot, mas nunca avaliado. | `appointment-pricing.service.ts:25` | Decidir se é para remover ou para implementar. |
| 3 | `priorityOfferHours` e `inspectorOfferRadiusKm` nas settings da agência não são usados. | `packages/shared/src/schemas/tenant.ts:50-51` | Se a Q13 for aceita, remover o `priorityOfferHours`. |
| 4 | A OP fica presa ao tenant em `get-property`, o que contraria a CORRECTION-001. | `get-property.use-case.ts:47-53` | O F10 não pode copiar esse padrão. A correção é à parte. |
| 5 | `appointment.reject-unconfirmed` usa 19h fixas e ignora `portalCutoffHour`. | `workers.ts:295` | O F04 assume as 19h. Unificar à parte. |
| 6 | Documentação desatualizada do `InspectionAsset`. | `docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md`, `specs/008-*` | Atualizar no PR do F10 (é barato). |
| 7 | O job `inspection-execution.notify-not-started` na verdade trata "iniciou e não finalizou". | `workers.ts:260` | Renomear à parte. |
| 8 | Não existe exportação de `audit_logs`. | `audit.routes.ts:29` | O F08 só exporta o programa. |
| 9 | O `AppointmentMapPage.tsx` tem 1,5 mil linhas, e o hook mencionado no comentário (`useAppointmentMapState`) não existe. | `hooks/useMapFilterPersistence.ts` | F00 e F09 não crescem o arquivo. Refatorar à parte. |
| 10 | O `DEFAULT_MAP_FILTERS` em `useAppointmentMapData.ts:59-62` é código morto. | – | Remover à parte (ou no F00, se ficar trivial). |
| 11 | Conformidade Mapbox (geocodificação temporária gravada no banco) | `mapbox-geocoding.service.ts:14` | **Promovido a spec: [X02](X02-geocodificacao-permanente.md)**, Onda 1. |
| 12 | Auditorias antigas (`inspection.started`, `inspection.finished`, `geolocation_mismatch` do START) guardam a lat/lng do inspetor. A F03 mascara isso para CL, mas AM/OP ainda veem. | `start-inspection.use-case.ts:212` | Revisar junto com a política de retenção/erasure da auditoria (feature 020). |
| 13 | O renderer escapa HTML também no SMS (`&` vira `&amp;` nos templates SMS atuais). | `send-notification.use-case.ts` (render) | Aberto como tarefa separada ("Fix HTML escaping in SMS notification bodies"). |
| 14 | `VALID_TRANSITIONS` do shared aceita `DRAFT→SCHEDULED`, mas o `TRANSITION_RULES` do backend não tem essa transição. | `packages/shared` × `appointment-state-machine.ts` | Aberto como tarefa separada. |
| 15 | Comentários desatualizados no código e no CI (`properfy-prod`, `pages-deploy.yml`, "51 migrations", `appointment-state-machine.ts:43` "date has passed" quando a regra real é idade de 45 dias). | vários | Limpar à parte. |
| 16 | `accept-offer` não revalida a região do inspetor no aceite; só a listagem filtra por região. | `accept-offer.use-case.ts` / `prisma-service-group.repository.ts` | Possível aceite fora da região via API. Aberto como tarefa separada. |
| 17 | O CLAUDE.md afirmava "SAST mandatory in CI", mas não existe scan de SAST nem de dependências no CI. | `.github/workflows/*` | A X00 corrige o texto; criar o scan fica à parte. |
| 18 | 4 dos 7 CLAUDE.md não passam no `prettier --check`. | CLAUDE.md da raiz e de workspaces | A X00 exige o prettier só nos 3 que passam; reformatar os outros à parte. |
| 19 | (Validação 18/11) Docs de planejamento desatualizados: `INSPECTOR_NOTICE_TARGET_PATTERNS` hoje tem 4 entradas (incl. `/today` da F04 e `/profile/challenges` da F08), mas o texto antigo ainda diz "exactly 2 patterns". | `fase2-etapa1/tarefas/F02-tarefas.md:199`, `specs/046-f02-3-sw-push-inbox/contracts/consumed-routes.md:18` | Histórico, **não é defeito** — o teste `packages/shared/src/constants/inspector-notices.test.ts` já asserta as 4 entradas corretamente. Atualizar os docs à parte só se quiser uniformidade. |
| 20 | (Validação 18/11) Opcional/rastreabilidade: o upload de **nova versão** de arquivo audita como `property_file.uploaded` (com `after.version` no payload), não como uma ação própria `property_file.version_added`. | `confirm-property-file-upload.use-case.ts:132-146` | Hoje um leitor distingue versão por `after.version > 1`. Dar ação própria é cosmético; só se houver exigência regulatória de paridade de nome de ação. Fecha o último "MEDIUM" da auditoria rasa (era falso-positivo). |

| 21 | (Validação 24/11, PR-18) `day-plan-origin.use-case.ts` (~L123-130) usa o resultado de geocodificação como origem da rota **sem** o gate da regra A (place_type/relevance do PR-18); um resultado grosseiro/baixa-relevância vira origem de rota errada. | `apps/backend/src/modules/day-plan/application/use-cases/day-plan-origin.use-case.ts` | **Decisão do Pedro 24/11: fica DE FORA do follow-up de cobertura do PR-18.** É input transiente digitado pelo inspetor, que ele vê na hora (não é SUCCESS persistido em entidade). Gatear exige decidir o que o app faz quando o endereço digitado não é encontrado (recusar vs avisar-e-seguir) → mudança de tela/UX, tarefa de produto separada. |

| 22 | (Reteste DEV 24/11) Observações O-3 a O-7 para o DOC-1 (decisão do Pedro: estacionar): O-3 limite de 20 MB por arquivo não aplicado no upload web (arquivo de 55 MB chegou ao storage, que barrou); O-4 plurais errados ("Complete 1 inspections", "0 of 1 services"); O-5 Live Day mostra "On time" no cabeçalho com a próxima parada já atrasada; O-6 horário previsto desatualizado no card "Next inspection" do app (9:23 vs 10:08 no Live Day); O-7 arquivos de teste não confirmados ficaram no imóvel SPS-007 (a limpeza automática deve tratar). | `fase2-etapa1/reteste-dev-2026-11-24.md` (seção Observações) | O-1 e O-2 NÃO entram aqui — vão para o validador (O-1→V-4, O-2→V-2). O-3..O-7 ficam estacionados; consolidar no DOC-1. |

| 23 | (25/11, PR #1397) DEV idle-shutdown adiado: o PR de egress do Supabase propunha `min_machines_running = 0` em DEV (desliga a maquina ociosa), mas foi mantido em `1` ate depois de 30/11/2026. | `fly.dev.toml` (raiz) | **Follow-up (DOC-1): religar o idle-shutdown de DEV (min_machines_running = 0) depois de 30/11/2026.** Motivo da espera: 3 verificacoes do reteste dependem de tarefas agendadas rodando de madrugada (publicacao 19:30 Sydney, aviso da manha/varredura, premios e bonus). PGBOSS_NEW_JOB_CHECK_INTERVAL_SECONDS=15 em DEV/staging fica. |
| 24 | (25/11, Batedor 2a perna, O-10) App preso no pacote antigo do service worker — com o bundle antigo a recusa da base do inspetor não mostra mensagem (a tela nova do V-3 não aparece até o SW atualizar). | PWA (service worker / cache do bundle) | **Parqueado (Pedro 25/11).** Follow-up: estratégia de atualização/skipWaiting do SW ou invalidação de cache para forçar o bundle novo; validar que a mensagem de recusa da base aparece após deploy. |
| 25 | (25/11, Batedor 2a perna, O-8) PATCH da agência aceita chave de configuração DESCONHECIDA (settings) sem rejeitar. | backend (update agency/tenant settings) | **Parqueado (Pedro 25/11).** Follow-up: validar o corpo do PATCH de settings contra o schema conhecido (rejeitar chave desconhecida com 400), sem quebrar chaves válidas existentes. |
| 26 | (25/11, Batedor 2a perna, O-13) Logs do `properfy-api-dev` marcados com env `staging`. | infra/deploy (env tag nos logs do DEV) | **Parqueado (Pedro 25/11).** Follow-up: corrigir a tag de ambiente nos logs do DEV (deve ser `dev`), provavelmente var de ambiente/secret de logging herdada de staging. |
| 27 | (25/11, Batedor 2a perna) `backfill-inspector-base-coords.ts` sem `validateEnv()` — mesmo defeito latente corrigido no regeocode (#1401); o script nunca rodou e lançaria "Environment not validated". | `apps/backend/src/scripts/backfill-inspector-base-coords.ts` | **Parqueado (Pedro 25/11).** Follow-up: adicionar `validateEnv()` antes de `createContainer()` (espelhar o #1401) + empacotar no tsup se for rodar; sem runbook hoje. |

## Encontrados no design v3 (fora do contrato)

- Itens de manutenção a checar, fotos da inspeção sincronizadas, foto de entrada ou interfone.
- Tela "Inspection in progress" com checklist.
- Controle de chave (número, coletada, devolvida).
- Botão manual "avisar inquilino que estou a caminho".
- Desafio "relatórios devolvidos pela agência" (o conceito não existe no sistema).
- Avisos fixados.
- Redesenho da tela de ganhos.
- (F02-3 #1322, 30/10) Expiração de sessão (`redirectToLogin`) não desassina o push no PWA — follow-up fora de escopo da F02-3; a assinatura revogada é auto-recuperada no próximo boot/resync, mas vale um unsubscribe explícito no logout por expiração.
- (F03-3 #1328, 02/11) START transiente-esgotado: repetidos 5xx/rede até `MAX_RETRIES` marca `FAILED` mas NÃO limpa o estado local / FINISH encadeado → card fica preso em "Check out" até Retry manual. Mesma classe do D21, mas FORA do escopo 4xx dele (pré-existente). Follow-up PWA pequeno: estender o cleanup do D21 para o caso de esgotamento transiente.
- (F03-2 #1325, 02/11) `StartInspectionUseCase` (restart de execução abandonada) NÃO é transacional / não pega o `FOR UPDATE` lock do appointment. Start + cant-do concorrentes no MESMO appointment reofertado podem deixar `REJECTED` + execução `in-progress` órfã. Baixo impacto (sem efeito financeiro; finish dá 409 pelo CAS; no máximo ruído de stuck-alert). Fix limpo = tornar `StartInspectionUseCase` transacional + injetar `fieldEventRepo` p/ o lock + re-checar status sob lock. Follow-up próprio (toca use case muito usado); agendar como task pequena de backend após a Onda 2. Identificado por Pilar no review de segurança do F03-2; 2a ("ler execução com tx") foi REFUTADO (o FOR UPDATE serializa, provado pela suíte de concorrência).
- (F10-4 #1353, 08/11) Guard de status terminal no backend ausente: a confirmação/upload de issue do inquilino pelo portal é bloqueada só no front (web) e é own-scope; falta um guard no backend que recuse quando o appointment já está em status terminal. Cross-cutting da feature F10 (vale também p/ F10-1..F10-3). Follow-up pequeno de backend. Identificado por Crivo no review do F10-4.
- (F10-4 #1353, 08/11) TOCTOU de re-upload do signed URL herdado do presign/confirm do F10-1: entre o presign e o confirm o objeto pode ser re-enviado. Herdado do F10-1 (não introduzido pelo portal). Baixo impacto; magic-bytes + headObject no confirm mitigam parcialmente. Follow-up cross-cutting F10 a avaliar junto com o guard de status terminal.

## GAPs cliente × PWA — da validação 18/11 (decisões tomadas 18/11)

Confrontando o `Properfy Inspector App v3.pdf` com o app entregue, 3 itens foram pedidos pelo cliente e **não** entregues, sem registro de decisão (todos LOW, nenhum bloqueia release). Detalhe completo em `VALIDACAO-consolidada.md` (Eixo 2). **Decisão do PO (18/11): parquear o B1; construir B2 e B3.**

- (Validação 18/11) **B1 — "Show login details" (credenciais do app de laudo, PDF p.2).** O PWA tem o botão abrir-app (`inspectionAppLink`, `JobDetailsSection.tsx`), mas **não** revela credenciais. **DECIDIDO 18/11: PARQUEAR (não construir).** Motivo: segurança — não expor credenciais do app de laudo no cliente PWA; mantém-se só o deep-link de abrir-app. Reabrir só por pedido de mudança com um desenho de segurança (origem do dado, mascaramento, superfície de exposição).
- (Validação 18/11) **B2 — "Mark all read" nos Announcements (PDF p.11).** Há mark-read por item + badge de não-lidos; faltava a ação em massa. **✅ CONSTRUÍDO E MERGEADO — PR #1369.** Endpoint `POST /v1/inspectors/me/notices/read-all` (INSP-only, `updateMany` escopado ao próprio `inspector_id`, 403 `INSP_ONLY` p/ CL/AM, teste de isolamento cross-inspector) + botão na inbox que invalida `['inspector-notices']` (limpa lista+badge) + api-types regenerado. TDD, CI verde.
- (Validação 18/11) **B3 — Conclusão não encadeia a próxima parada (PDF p.5).** `DonePanel` só oferecia "Back to Schedule"; o PDF empurra next-inspection + Navigate. **✅ CONSTRUÍDO E MERGEADO — PR #1368.** PWA-only: na fase DONE lê o day-plan de hoje (`useDayPlan`) e deriva a próxima parada (`nextStopAfter`/`isLastActiveStop`), mostrando card "Up next on your route" (abrir detalhe + Navigate via F04); "All done for today" no último job; fallback "Back to Schedule" intacto quando não há plano publicado. TDD, CI verde.

## Regeocode DEV — rodada 2 (25/11, pós regra final #1406)

STEP 1 dry-run: 2 requisições, US$0.01. STEP 2 --apply (exit 0, US$0.01): properties scanned 1 / updated 1 (Line 2 duplicado → dedup → passou a regra final, suburbio bateu; lineTwoOmitted 1); 0 rejeições (coarse/low-relevance/suburb-mismatch); falseManual: PROP-0020 (low_relevance, deixado MANUAL p/ revisão) + PROP-0017 (sem audit property.updated, não auto-restaurável).

**Os 8 LOW_RELEVANCE da rodada 1 NÃO entram no sweep** — `findLegacyCoordinateCandidates` (prisma-property.repository.ts:617) exclui `geocoding_failure_code='LEGACY_PERMANENT_NO_RESULT'` (código gravado por `markLegacyNoResult`). `--retry-failed-permanent` também não os pega (só `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`). Caminho sem mudança de código = botão **Retry Geocoding** (GeocodePropertyUseCase → PENDING + code null → worker re-geocodifica sob a regra atual).

**Follow-up operacional (Batedor / Pedro):** reprocessar via Retry Geocoding os 7 imóveis DEV (devem passar na regra final): IMP-2A412183A9 (Brighton-le-sands), IMP-6238CD8E93 (Penshurst), IMP-748F05CA28 (Carlton), IMP-90EC930570 (Bexley), IMP-D45E7C3CEF (Hurstville), IMP-FF4AB720F8 (Hurstville), SPS-006 (Chatswood). (IMP-D3CE99EF20/Bexley já saiu do estado entre rodadas.) PROP-0017 + PROP-0020: revisão manual.

## Parqueados — rodada final Batedor (25/11, decisões Pedro)

- **O-14 (busca × salvamento):** a busca da tela (`AddressLookupInput` → `GET /v1/address/suggestions` → `mapbox-address-lookup.service.ts:82-86`, TEMPORARY + autocomplete=true + types=address + limit 5, texto cru) sugere endereços que o salvamento (permanent + query estruturada + limit 1) recusa (ex.: 346 Military Rd Mosman → Vaucluse 2030). A busca não aplica a regra A. **Parqueado (Pedro 25/11).** Follow-up: alinhar a busca ao modo permanent, ou avisar que a sugestão ainda será verificada no save. (A refinação da REGRA de suburbio CBD é PR próprio aprovado, não é este parqueamento.)
- **O-17 (Live Day):** a linha do Live Day só aparece após recarregar no primeiro clique. **Parqueado (Pedro 25/11).** Follow-up web: invalidar/refetch a query do Live Day no primeiro clique em vez de exigir reload.
- **O-18 (Notes da agência):** o campo Notes da agência é descartado ao salvar. **Parqueado (Pedro 25/11).** Follow-up: persistir/enviar o Notes no PATCH da agência (conferir schema + use case + form).
- **O-16 (aviso de distância no cartão do app):** não aparece no cartão do PWA → **análise do Prumo** (não mexer nesta onda).
- **'Rural property?'** (texto junto ao 'Set location manually'): Pedro vai mandar proposta própria → não mexer.

## Follow-up — rename GeocodingResult.suburb → locality (25/11)

Na regra O-14 (#1409) o campo `GeocodingResult.suburb` passou a guardar SOMENTE o `locality` devolvido pelo Mapbox (place e postcode viraram campos separados). Mantido o nome `suburb` por ora (evita churn de 42 fixtures), **com comentário explícito no campo** dizendo que guarda o locality. **Follow-up (Pedro/CC#3 25/11): renomear `suburb`→`locality` em `GeocodingResult` + ajustar as fixtures/consumidores** — trivial, só nomenclatura, sem mudança de comportamento.

## Nota — retry token-only no SendGroupPortalLinks depende do lock do tenant (25/11)

No caminho de reset do grupo (`send-group-portal-links.use-case.ts:187-188`) o `retryOnUniqueConflict` externo cobre SÓ `TOKEN_HASH_COLUMN`, não os alvos de ciclo (`CYCLE_UNIQUE_CONSTRAINT_COLUMNS`). Isso é correto HOJE **porque** o caminho é serializado por um lock pessimista `SELECT … FROM tenants … FOR UPDATE` (`prepareInTransaction` → `generate-portal-token.use-case.ts:225-226` → `prisma-tenant.repository.ts:75-90`): uma 2ª resend concorrente no mesmo tenant bloqueia, re-lê, re-classifica (deixa de ser `SEND_AFTER_RESET` → SKIP) e nunca chama `rotateOnDateChange` de novo → sem colisão de ciclo. **Caveat (não é gap):** se esse `FOR UPDATE` do tenant for removido um dia, o retry token-only no :187 deixaria de cobrir `appointment_active_cycle_unique`/`cycle_number` e um P2002 vazaria ao operador. Follow-up trivial opcional: comentário de 1 linha no :187 amarrando o retry token-only ao lock do tenant. (Confirmado por V3-inspbase com file:line; CC#3 aceitou 25/11.)
