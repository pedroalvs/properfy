# TODO - Consolidacao de Escopo e Dúvidas

- [x] Revisar `escopo.md` atual
- [x] Consolidar `escopo-v2.md` alinhado às decisões técnicas
- [x] Mapear gaps e ambiguidade de produto/negócio/técnico
- [x] Criar documento de dúvidas para refinamento de backlog
- [x] Registrar riscos residuais e próximos passos

## TODO - PDF para Cliente

- [x] Revisar `regras-negocio-pendentes-cliente.md`
- [x] Reestruturar conteúdo para apresentação executiva
- [x] Gerar PDF com layout profissional
- [x] Validar artefato final para envio ao cliente

## Riscos residuais

- Escopo funcional amplo com regras financeiras ainda em aberto.
- Matriz de permissões detalhada por papel ainda não definida.
- Regras operacionais de confirmação/reagendamento/cancelamento não fechadas.

- PDF depende de renderização local consistente para preservar paginação e tipografia.

## Próximos passos

1. Validar as dúvidas abertas com stakeholders.
2. Converter respostas em histórias com critérios de aceite.
3. Planejar MVP por fluxo crítico ponta a ponta.
4. Enviar o PDF consolidado ao cliente como pauta de alinhamento.

## TODO - Documentação Técnica do Banco

- [x] Revisar o `schema.prisma` real do backend
- [x] Cruzar o schema com `modelo-dados-executavel.md` e `state-machine-executavel.md`
- [x] Documentar a estrutura do banco por domínio e por entidade
- [x] Explicar decisões de schema, relações e trade-offs principais
- [x] Publicar o guia técnico em `projeto-consolidado/tasks/banco-de-dados-properfy.md`

## TODO - Auditoria Full Stack 2026-03-23

- [x] Revisar `CLAUDE.md` raiz e por stack, além de `projeto-consolidado/`
- [x] Mapear endpoints reais do backend e cruzar com specs/contratos principais
- [x] Auditar chamadas críticas do frontend web contra endpoints reais
- [x] Auditar riscos imediatos de PWA/offline/service worker
- [x] Delegar revisão paralela para `Gemini CLI` (frontend/PWA) e `Claude Code` (backend)
- [x] Corrigir inconsistências críticas de backend e contratos web/pwa de baixo risco
- [x] Executar `typecheck` backend/web/pwa e testes web direcionados

## Resultado - Auditoria Full Stack 2026-03-23

- Corrigidos aliases/contratos críticos de billing e sessão para destravar o web atual.
- Corrigido o interceptador 401 do PWA para não entrar em fluxo de refresh sobre endpoints de auth.
- Corrigido o contrato do marketplace mobile para consumir o envelope paginado e apenas campos realmente retornados pelo backend.
- Corrigida a tela roteada de marketplace no web para consumir apenas os dados realmente retornados pelo backend, removendo dependência de appointments/coords inexistentes.
- Fechadas falhas de autorização em `finish-inspection`, `request-asset-upload` e `confirm-asset-upload`, com testes unitários cobrindo posse da execução/asset.
- Ainda não há evidência suficiente para afirmar aderência completa de escopo sem homologação ponta a ponta, regressão mais ampla e validação funcional dos fluxos críticos com integrações externas.
- Backend endurecido para produção real: `staging/production` agora falham no startup se dependências críticas cairiam em `stub` (`queue`, `storage`, `email`, `sms`, `geocoding`).
- `DownloadInvoiceUseCase` passou a gerar presigned URL no storage real a partir de `invoice.fileKey`, removendo URL fake hardcoded.
- O marketplace backend passou a filtrar ofertas por região no banco antes da paginação e a usar o mesmo critério no `count`, corrigindo totais/páginas inconsistentes em web e PWA.
- A suíte completa do backend fechou verde após alinhar fixtures/mocks desatualizados aos contratos canônicos atuais: `164` arquivos e `1550` testes.
- O web `typecheck` fechou verde e a suíte completa do web voltou a fechar `0` após estabilizar o runner do Vitest com `forks`, `maxForks=1`, `12` shards e simplificar `PropertyDetailPage.test.tsx` para mockar filhos pesados que não eram alvo da asserção.
- Risco operacional residual confirmado antes de deploy: `MAPBOX_ACCESS_TOKEN` agora é obrigatório em `staging/production`; sem essa variável o backend falha no startup por decisão intencional de hardening.
- O PWA passou a usar code splitting por rota e lazy import do pipeline de compressão de imagem; o chunk inicial caiu de ~`1.76 MB` para ~`352 kB`, e o peso residual ficou concentrado em `useImageCompression` como chunk on-demand do fluxo de foto.
- No web, o botão de edição da página de detalhe de appointment passou a abrir o `AppointmentFormDrawer` em modo edição, em vez de retornar incorretamente para a lista.
- O drawer de contato do inquilino deixou de expor ação falsa de edição sem fluxo correspondente.
- O `FinancialEntriesPage` passou a conectar a edição real do drawer ao `FinancialEntryFormDrawer`, removendo outro affordance placebo.
- No PWA, a aba `Map` foi removida da bottom nav e `/map` passou a redirecionar para `/schedule`, porque a tela era apenas placeholder.
- No web, as CTAs e rotas de mapas de appointments/properties/service groups foram removidas/redirecionadas, já que `MapContainer` ainda é um placeholder e não um mapa operacional real.
- O backend de billing foi endurecido em `CreateManualAdjustmentUseCase`: tenant agora precisa existir/estar ativo, `appointmentId` e `referenceEntryId` precisam pertencer ao mesmo tenant, e `inspectorId` precisa existir/estar ativo/elegível ao tenant do lançamento.
- No web, `UserListPage` para AM/OP passou a exigir agência selecionada antes de abrir `New User`, removendo o fluxo inválido que só falhava no submit com `No tenant context`.
- No web, `PricingRuleListPage` passou a exigir agência selecionada antes de abrir `New Pricing Rule`, e o `PricingRuleFormDrawer` agora valida `tenantId`, herda o tenant selecionado e voltou a receber `branchOptions` reais.
- No backend, o worker `notify-stuck` deixou de tentar criar `Notification` com `tenantId` vazio; ele resolve o tenant pelo appointment travado e o `CreateNotificationUseCase` agora rejeita `tenantId` em branco.
- No web, a geração de invoices deixou de enviar `periodStart/periodEnd` como ISO timestamp; o modal agora envia `YYYY-MM-DD`, que é o contrato real de `generateInvoiceSchema`, com testes atualizados.
- No web, o cadastro de inspectors deixou de aceitar `serviceTypes` como texto livre; o formulário agora usa opções canônicas de `Service Type`, o hook valida UUIDs reais e o detail traduz IDs para nomes.
- No web, `PropertyListPage` e `PropertyCreatePage` passaram a exigir agência explícita para AM/OP, usar opções reais de branch por tenant e enviar `tenantId` explícito no create.
- No web, `AppointmentCreatePage` passou a exigir agência explícita para AM/OP, filtrar branches por tenant e properties por branch, evitando combinações cross-tenant que o backend só rejeitava no submit.
- No tenant portal, `ContactForm` deixou de permitir edição em modo read-only ou em appointments terminais, e o backend de `update-contact` passou a bloquear mutações nesses cenários.
- No PWA, `ExecutionPage` agora bloqueia a execução quando o appointment do inspetor não puder ser carregado/autorizado, evitando iniciar ou enfileirar inspeção “no escuro”.
- No web, `Notification Templates` deixou de expor filtros/paginação/ordenação sem suporte contratual; a tela agora envia apenas `templateCode`, `channel` e `includeDefaults`, e passou a distinguir visualmente `Platform Default` de `Agency Override`.
- A divergência entre dossiê e implementação para templates globais de notificação foi mantida documentada como risco de escopo: o backend atual usa defaults globais (`tenantId=null`) em seed/startup-check/fallback, então essa decisão não foi quebrada sem consenso formal.
- No backend, `CreateServiceGroupUseCase` passou a rejeitar grupos com appointments de tenants diferentes, fechando uma violação real de isolamento multi-tenant.
- No web, o wizard de `Service Groups` agora exige agência explícita para AM/OP, filtra appointments elegíveis por tenant, envia o payload canônico (`scheduledDate` + `timeWindow`) e removeu o filtro falso `search` da listagem.
- No web, `Availability Slots` deixou de expor o filtro falso `search`; a listagem agora só usa filtros realmente suportados pela API (`inspectorId`, `status`, `dateFrom`, `dateTo`).
- No tenant portal, os contratos de resposta de `confirm`, `reschedule` e `unavailable` foram alinhados ao retorno real dos comandos no backend, eliminando schemas enganadores que declaravam payload diferente do executado.
- No web, o fluxo de `Appointment Import` foi alinhado ao contrato real do backend: a tela passou a orientar as colunas canônicas (`propertyCode`, `serviceTypeCode`, `tenantName` etc.), o preview ficou restrito a CSV até existir parser real de XLSX no cliente, e o polling agora usa `importId`, `status`, `successCount`, `errorCount` e `errorsJson` reais em vez de esperar `id/progress/errors` inexistentes.
- No web, a barra de `Appointment` deixou de expor transições que a UI atual não consegue completar validamente: `AWAITING_INSPECTOR -> SCHEDULED` (sem `inspectorId`) e `SCHEDULED -> DONE` por operador (sem `doneCheckedByUserId`) foram ocultadas para evitar CTAs que só falhavam no backend.
- No web, `Generate Report` para usuários globais (`AM`/`OP`) passou a exigir agência explícita antes do submit; o payload agora envia `tenantId` em `filters`, evitando export global cross-tenant por omissão no diálogo genérico.
- No web, `Financial Entries` para `AM`/`OP` passou a exigir agência explícita antes de carregar dados ou habilitar `Adjustment`/`Refund`, e a listagem foi alinhada ao contrato real (`type`, sem `search`).
- No web, `Invoices` deixou de expor affordances falsas: a listagem não envia mais `sortBy/sortOrder` nem busca textual de inspetor inexistente, e o modal de geração passou a usar seleção canônica de inspetor em vez de texto livre.
- No backend, `Tenant Portal -> UNAVAILABLE` passou a notificar também no caminho normal, não só no urgente, fechando o desvio operacional em que o inquilino marcava indisponibilidade sem gerar alerta interno.
- O seed de `Notification Templates` passou a sincronizar os templates obrigatórios também em `tenant_id = null` (platform defaults), alinhando o dado inicial com o fallback real de `SendNotificationUseCase` e com o startup check.
- No backend, `PrismaNotificationTemplateRepository.upsert` deixou de usar `tenantId ?? ''` para templates globais; platform defaults agora usam lookup real por `tenant_id = null` antes de `update/create`, removendo o bug que podia quebrar a edição de templates globais por `AM`.
- No backend, `GetInspectorScheduleUseCase` deixou de filtrar a agenda do inspetor por `tenantId` do usuário autenticado. A agenda agora usa `inspectorId + date`, o que evita esconder appointments válidos de inspetores globais (`tenantId = null` no JWT/seed).
- No PWA, `ExecutionPage` deixou de avançar para `IN_PROGRESS` quando o `START` falha online. O app agora permanece em `PRE_START` e mostra erro operacional, evitando divergência entre estado local e backend.
- No backend, `ExecuteStatusTransitionUseCase` deixou de disparar billing no `DONE` do inspetor sem `doneCheckedByUserId`. O side effect financeiro agora só roda quando já existe cross-check explícito.
- Risco residual explícito: o dossiê ainda não fecha a ação canônica de cross-check pós-`DONE`. Hoje o sistema já evita billing indevido, mas ainda precisa de comando/fluxo formal para registrar `doneCheckedByUserId` depois que o inspetor conclui.
- No web, o detalhe de appointment agora diferencia `DONE` validado de `DONE` ainda pendente de cross-check operacional, evitando a leitura enganosa de que o ciclo financeiro já está pronto.
- Dashboard backend/web agora expõe `pendingOperatorCrossChecks`, contando appointments `DONE` ainda sem `doneCheckedByUserId` como pendência operacional explícita.
- A listagem de appointments backend/web agora expõe `doneCheckedByUserId/doneCheckedAt` também no payload listado, e a tabela web passou a mostrar a coluna `Reviewed` para `DONE`, deixando visível quais inspeções concluídas ainda aguardam validação operacional.
- O dashboard web deixou de tratar `DONE` recente como bloco homogêneo: `recentAppointments` agora carrega o estado de review e mostra `Pending review` para `DONE` ainda sem cross-check.
- A regra central de executabilidade do inspetor foi endurecida: `ROUTINE` não confirmada ou marcada `UNAVAILABLE` no próprio dia também sai da agenda executável e bloqueia `detail/start`, salvo exceções operacionais como `keyRequired`, `INGOING/OUTGOING` e confirmação já efetivada.
- O ciclo de vida do `Tenant Portal` foi endurecido em `RESCHEDULE`: ao reagendar, o backend agora revoga tokens ativos do portal para não herdar o cutoff (`7 PM` do dia anterior) da data antiga para a nova data.
- O `CONFIRM` do portal agora limpa restrições antigas antes de regravar novas. Isso evita que um appointment confirmado continue exibindo indisponibilidade obsoleta para operação e inspetor.
- O resumo financeiro deixou de misturar valores `PENDING` com `APPROVED`: os totais agregados agora representam apenas valores aprovados/consolidados, e o card `Pending` continua separado para o backlog financeiro.
- O web de `Invoices` foi realinhado ao contrato canônico do backend: status `OPEN/CLOSED/PAID`, `periodType` em vez de `frequency`, `fileKey` para gating real de download, e remoção de campos legados sem contrato (`entries`, `entryCount`, `inspectorName` vindo da API).
- O drawer de invoice agora deixa explícito quando a invoice ainda está `OPEN` e pode mudar até o fechamento, evitando leitura de valor “final” antes da hora.
- No `Tenant Portal`, o modo `read-only/expired` voltou a bloquear também `UNAVAILABLE`: a exceção de “urgent mode” foi removida do backend e a UI passou a orientar contato direto com a agência para qualquer mudança após o prazo.
- No bloco do inspetor, `finish-inspection` voltou a gravar `tenantId` real no audit log e deixou de depender de um cast impossível para aplicar checklist de `serviceType`; `minPhotos/requiresSignature` agora voltam a valer com base no `appointment`.
- No backend de billing, os lançamentos automáticos criados após `DONE` cross-checked deixaram de gravar `approvedByUserId/approvedAt` enquanto seguem `PENDING`; lista/detalhe agora mascaram metadados de aprovação para entradas ainda não aprovadas, evitando leitura financeira enganosa.
- O fluxo automático `DONE -> financial entries` passou a usar IDs determinísticos por `appointment + entryType` e tratar colisão como “já criado”, reduzindo o risco de duplicidade em corrida concorrente sem abrir migração arriscada nesta rodada.
- O comando `Generate Invoice` foi corrigido em três frentes: `periodType` passou a ser aceito no schema compartilhado e enviado pelo web, o use case backend passou a devolver a shape canônica completa da invoice, e a resposta idempotente agora reflete o status real da invoice existente (`PAID` continua `PAID`, por exemplo).
- No web, os barrels `pages/index.ts` de `appointments`, `properties` e `service-groups` deixaram de exportar as antigas `MapPage` placeholders, reduzindo o risco de reuso acidental dessas superfícies fora do router já redirecionado.
- Nos detail drawers de `appointments`, `properties`, `inspectors`, `users`, `service-groups` e `financial entries`, a ação `Edit` deixou de aparecer quando não existe `onEdit` real; o fallback `Editing coming soon` foi removido para não manter affordance enganosa em superfície reutilizável.
- No dashboard web, `Recent Appointments` deixou de ser click-dead: as linhas agora navegam para o detalhe e `View all` para `/appointments`.
- `PendingActionsCard` passou a linkar para destinos canônicos já existentes (`appointments`, `financial`, `reports`) e os hooks/listagens desses módulos agora inicializam filtros a partir da querystring.
- `Appointments` passou a expor `Tenant Response` também na UI de filtros, alinhando o que o backend já suportava com os deep links operacionais do dashboard.
- No tab de notificações por appointment, o web passou a mostrar `template`, `delivered/failed at`, `failureReason` e `retryCount`, deixando a superfície útil para diagnóstico operacional sem criar fluxo novo de retry nesta rodada.
- No tab de timeline por appointment, o web passou a usar o contrato real do audit log e a mostrar `action`, ator identificado, `reason` e um resumo de `before/after`, em vez de depender de campos fantasmas como `actorName`.
- No tab financeiro por appointment, o web passou a mostrar `counterparty`, `approved by` e `reason`, além de uma empty-state mais honesta quando ainda não há lançamentos porque o ciclo pode estar pendente de cross-check.
- Na tela global de `Audit Logs`, o web deixou de mandar `search/startDate/endDate` inexistentes e passou a usar apenas `actorId`, `entityType`, `entityId`, `action`, `fromDate` e `toDate`, alinhando filtros e contrato real.
- Na superfície global de `Audit Logs`, a tabela e o drawer passaram a formatar `action`, explicitar `actor/tenant` com semântica mais clara e resumir `before/after` em `Changed Fields`, tornando a investigação operacional mais legível sem adicionar lookup de nomes ou contrato novo.
- Em `Settings > Active Sessions`, o web deixou de chamar `createdAt` de `Last Active`; a coluna passou a ser `Started At`, que é a semântica correta enquanto o backend não persiste atividade real por sessão.
- Em `Settings > Two-Factor Authentication`, o web passou a dirigir o card pelo estado real `totpEnabled` do usuário autenticado, ocultando `Setup 2FA` quando o fator já está ativo.
- Em `Settings > Account`, o web passou a preservar no auth state e exibir `phone` e `lastLoginAt` já retornados por `/v1/me`, em vez de reduzir a superfície de perfil a `name/email/role`.
- Em `Settings > Change Password`, o web passou a encerrar a sessão local após sucesso, alinhando a UI ao backend que já revoga todas as sessões do usuário nessa operação.
- No `PWA > Profile`, o auth state e a tela passaram a refletir melhor `/v1/me`, exibindo `phone`, `2FA status` e `last login` de forma somente leitura para o inspetor.
- No `PWA > Earnings`, a tela foi alinhada ao contrato paginado real de `/v1/financial/entries` e deixou de exibir moeda hardcoded, usando a `currency` retornada pela API.
- No `PWA > Login`, o fluxo passou a preservar `ApiError` e a exibir mensagens coerentes com os códigos reais do backend, em vez de tratar tudo como credencial inválida.
- No `PWA > Schedule/Execution`, a fonte de verdade para dia/horário passou a ser `scheduledDate + timeSlot`, não mais a interpretação de `timeSlotStart/timeSlotEnd` como UTC absoluto; isso corrigiu agrupamento diário, contagem, marcador de risco, horário exibido e janela de `Start Inspection`.
- No backend de `Inspector Execution`, `get-appointment-detail` deixou de serializar `timeSlotStart/timeSlotEnd` com sufixo `Z` para um `time slot` de negócio local, removendo o drift técnico de timezone já na resposta da API.
- No `PWA > Execution`, o hook de upload de fotos passou a usar de fato a store `pending-assets` do `IndexedDB`: assets agora são persistidos por `appointmentId`, reidratados após reload/reabertura e removidos só depois de confirmação real do upload no backend.
- No `PWA > Execution`, thumbnails passaram a diferenciar `Saved locally` de `upload confirmado`, reduzindo o risco operacional de o inspetor achar que a foto já sincronizou quando ela ainda está apenas no dispositivo.
- No `PWA > Execution`, a fila offline de `START/FINISH` deixou de depender da ordem implícita do IndexedDB com chave aleatória; o replay agora respeita `createdAt`, evitando `FINISH` antes de `START` após reconexão.
- No `PWA > Execution`, `FINISH` offline deixou de fingir `DONE`: o hook retorna `QUEUED`, o estado local só é limpo após sync real e o `DonePanel` passou a comunicar “saved locally / syncing” em vez de sucesso definitivo.
- No `PWA > Execution`, falha de sync de um appointment deixou de travar a fila inteira: `useOfflineQueue` agora isola o erro por `appointmentId`, preserva a ordem interna do mesmo appointment e continua processando appointments independentes.
- No `PWA > Execution`, o CTA `Retry failed photos` passou a realmente tentar de novo com o `blob` salvo localmente; antes ele só removia os assets em erro e forçava nova captura.
- Em `Generate Invoice`, o backend deixou de cortar payouts aprovados no último dia do período por interpretar `periodEnd` como meia-noite do dia final; a apuração agora usa fim inclusivo do dia apenas no cálculo financeiro, sem mudar a identidade canônica do período persistido.
- Em `Generate Invoice`, `periodStart` e `periodEnd` da resposta foram normalizados para `YYYY-MM-DD`, alinhando geração, listagem e detalhe de invoices e removendo drift semântico de timezone no payload.
- No `web > Financial`, `FinancialTable` e `FinancialEntryDetailSections` deixaram de hardcodear `AUD`; a formatação de valor agora respeita `entry.currency`.
- No `web > Financial`, entries `PENDING` deixaram de mostrar metadados de aprovação como placeholders ruidosos; o detalhe agora informa explicitamente `Pending financial approval` até existir aprovação real.
- No `web > Financial`, `Invoice Detail` e o helper `formatDate` foram ajustados para preservar datas canônicas `YYYY-MM-DD` sem deslocamento por timezone em fusos negativos.
- Em `web > Appointments`, a affordance de `Edit` foi alinhada ao backend: lista, drawer e página de detalhe deixaram de expor edição para statuses que o `UpdateAppointmentUseCase` já rejeita (`SCHEDULED`, `DONE`, `CANCELLED` e afins).
- No `Tenant Portal`, `GET /v1/tenant-portal/:token` passou a devolver `existingResponse` derivado do histórico real de interações (`tenant_portal_activity`), alinhando backend, schema compartilhado e o `ResponseConfirmationCard` já existente no frontend.
- No `web`, os cálculos de `YYYY-MM-DD` usados por `DashboardSummaryCards`, `InspectorDetailSections` e `SlotCalendarView` deixaram de depender de `toISOString().slice(0,10)`; essas superfícies agora usam data local canônica para evitar filtros/contagens deslocados pela virada UTC.
- No `web > Dashboard`, `RecentAppointmentsList` deixou de tratar todo `DONE` como pendente: o chip agora recebe `doneCheckedByUserId`, então appointments já revisados voltam a aparecer corretamente como `Done (Review)`.
- No `PWA > Offers`, o badge `TODAY` deixou de comparar `scheduledDate` com `new Date().toISOString().split('T')[0]`; a comparação agora usa data local do dispositivo, alinhada ao restante da semântica operacional de agenda.
- No backend de `Inspector Execution`, `request-asset-upload` deixou de aceitar `appointment` opcional para montar storage key: agora o presign exige o appointment real, usa `tenantId` canônico e responde `ExecutionAppointmentNotFoundError` quando o vínculo do inspetor não fecha, sem fallback `unknown`.
- No backend de `Inspector Execution`, `finish-inspection` passou a exigir `appointment` real também para resolver `serviceType` e `tenantId` do audit log, removendo o último fallback opcional nessa borda entre execução, status e financeiro.
- Em `Pricing Rules`, o contrato shared/backend passou a expor `currency` do tenant e o web deixou de hardcodear `AUD` em `PricingRuleTable` e `PricingPreview`, corrigindo exibição errada de preço/payout em tenants de outra moeda.
- Em `Financial Summary`, o backend/shared passou a expor `currency` do tenant e o `FinancialSummaryBar` deixou de hardcodear `AUD`, alinhando os cards agregados ao restante do domínio financeiro multi-tenant.
- O blocker canônico de cross-check pós-`DONE` foi implementado: existe ação explícita `POST /v1/appointments/:id/cross-check-done`, com bloqueio de auto-aprovação, exigência de evidência mínima e liberação financeira só depois de preencher `doneCheckedByUserId/doneCheckedAt`.
- O blocker canônico do `Tenant Portal` após cutoff também foi implementado: depois do cutoff, o portal fica restrito, mas `UNAVAILABLE` tardio continua permitido até o início efetivo da visita; após o início em campo, volta a ficar bloqueado para mutações.
- Risco residual desta rodada: o cross-check depende da trilha `appointment.status_transition -> DONE` no audit log para impedir auto-aprovação. Para dados legados sem essa trilha, o backend falha fechado.
- A auditoria da `FASE 1` foi consolidada em [`projeto-consolidado/tasks/fase1-audit.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/tasks/fase1-audit.md) com status por item e parecer final.
- A prova integrada da `FASE 1` foi formalizada em [`projeto-consolidado/tasks/fase1-proof.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/tasks/fase1-proof.md) e reforçada pelo teste [`apps/backend/tests/unit/acceptance/fase1-integrated-flow.test.ts`](/Users/pedro/Code/GitHub/properfy/apps/backend/tests/unit/acceptance/fase1-integrated-flow.test.ts), cobrindo `agendamento -> oferta/atribuição -> agenda do inspetor`.
- A auditoria global do escopo core foi consolidada em [`projeto-consolidado/tasks/escopo-core-audit.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/tasks/escopo-core-audit.md): `Marketplace`, `Tenant Portal`, `Inspector Execution`, `Billing`, `Notifications`, `Reports` e `Multi-tenant Isolation` ficaram `Atendidos`.
- O `Definition of Done` do `escopo-v2` ficou com um único item ainda `Parcial`: falta evidência explícita de validação do fluxo core em ambiente real de homologação. Os demais itens do DoD ficaram sustentados por testes e documentação consolidada.
- Na validação ampla pós-fechamento da `FASE 1`, `typecheck`, `build` e suíte completa passaram para `backend`, `web` e `pwa`.
- Os dois resíduos encontrados nessa rodada foram corrigidos:
  - `apps/backend/tests/integration/pricing-rule/pricing-rule.routes.test.ts` foi alinhado ao contrato real de resposta de `pricing-rules`, que agora exige `currency`;
  - `apps/web/src/features/appointments/components/AppointmentStatusChip.test.tsx` foi alinhado à semântica atual de `DONE`, distinguindo `Done (Review Required)` e `Done (Review)`.
- Na auditoria de responsivo mobile do `web`, os principais gaps reais foram corrigidos nos componentes-base:
  - `Sidebar/AppShell/MobileDrawer` passaram a ter navegação mobile própria, com labels visíveis, submenus expandidos e ações de settings/logout dentro do drawer;
  - `MapScreenLayout` deixou de forçar split horizontal em telas estreitas e passou a empilhar painel + mapa no mobile;
  - `DataTable`, `DetailRow` e `PageHeader` passaram a aceitar melhor stacking/wrapping no mobile, reduzindo overflow estrutural;
  - `OfferDetailPanel`, `GenerateInvoiceModal` e `GroupSummaryCard` deixaram de usar grids fixos desktop-first em telas pequenas.
- A validação dessa rodada fechou com `pnpm --filter web exec vitest run src/components/shell/Sidebar.test.tsx src/components/layout/PageHeader.test.tsx src/components/data/DetailRow.test.tsx src/components/data/DataTable.test.tsx src/components/map/MapScreenLayout.test.tsx src/features/marketplace/pages/MarketplacePage.test.tsx src/features/financial/components/GenerateInvoiceModal.test.tsx src/features/service-groups/components/GroupSummaryCard.test.tsx` e `pnpm --filter web typecheck`.
- No `PWA`, o fluxo de instalação ganhou fonte global de verdade via `InstallPromptProvider` montado no `App`; o `InstallAppCard` na `ProfilePage` passou a depender desse estado em vez de tentar capturar o evento tarde demais.
- No `web > Inspectors`, o campo `CPF/document` foi removido integralmente de tipos, formulário, detalhe e payload, alinhando o frontend ao schema real do backend.
- No backend, foi criada a rota `GET /v1/address/suggestions` com lookup server-side em Mapbox e fallback `stub`, incluindo testes de integração em `property.routes.test.ts`.
- No `web > Properties`, `PropertyFormDrawer` e `PropertyCreatePage` passaram a usar `AddressLookupInput` com base verificada; os campos estruturais do endereço ficaram preenchidos pela seleção e não mais por digitação livre.
- No `web > Branches`, `BranchFormDrawer` passou a usar o mesmo lookup e a salvar endereço estruturado no `address_json` já existente do backend; `useBranchList` agora formata esse JSON para exibição na tabela.
- A geração de contratos foi sincronizada com `pnpm generate:api`, atualizando `packages/shared/openapi.json` e `packages/shared/src/api-types.ts` para incluir o novo endpoint de sugestões.
- As duas observações do Claude sobre endereço foram aplicadas:
  - `Property` agora permite ajuste manual de `street/suburb/postcode/state/country` depois da seleção do endereço verificado;
  - o backend/shared deixaram de descartar sugestões parciais sem `suburb/postcode`, permitindo que o formulário complete esses campos quando o provedor vier incompleto.
- Em `Branch`, a edição fina também passou a existir sobre o objeto estruturado de endereço, mantendo a base verificada e evitando regressão para texto livre.
- Validação complementar desta rodada:
  - `pnpm --filter @properfy/backend test -- tests/integration/property/property.routes.test.ts`
  - `pnpm --filter web exec vitest run src/features/properties/components/PropertyFormDrawer.test.tsx src/features/properties/pages/PropertyCreatePage.test.tsx src/features/tenants/components/BranchFormDrawer.test.tsx`
  - `pnpm --filter @properfy/shared typecheck`
  - `pnpm --filter @properfy/backend typecheck`
  - `pnpm --filter web typecheck`
- Validação desta rodada:
  - `pnpm --filter @properfy/backend test -- tests/integration/property/property.routes.test.ts`
  - `pnpm --filter web exec vitest run src/features/inspectors/hooks/useInspectorSave.test.ts src/features/inspectors/components/InspectorFormDrawer.test.tsx src/features/inspectors/components/InspectorDetailSections.test.tsx src/features/inspectors/components/InspectorDetailDrawer.test.tsx src/features/properties/components/PropertyFormDrawer.test.tsx src/features/properties/pages/PropertyCreatePage.test.tsx src/features/tenants/hooks/useBranchSave.test.ts src/features/tenants/hooks/useBranchList.test.ts src/features/tenants/components/BranchFormDrawer.test.tsx src/features/tenants/components/BranchSection.test.tsx`
  - `pnpm --filter pwa exec vitest run src/features/profile/components/__tests__/InstallAppCard.test.tsx src/features/profile/pages/__tests__/ProfilePage.test.tsx`
  - `pnpm --filter @properfy/shared typecheck`
  - `pnpm --filter @properfy/backend typecheck`
  - `pnpm --filter web typecheck`
  - `pnpm --filter pwa typecheck`

## TODO - Auditoria Create/Edit de Appointment 2026-03-26

- [x] Revisar telas web de criação e edição manual de appointment
- [x] Cruzar campos da UI com schema shared/backend e documentação canônica
- [x] Validar classificação campo a campo com `guia-properfy` e `Claude Code`
- [x] Corrigir bug funcional de filtro de `property` por `branch` no drawer
- [x] Alinhar inputs de contato da create page aos componentes canônicos
- [x] Publicar matriz em `projeto-consolidado/tasks/appointment-create-edit-audit.md`

## Resultado - Auditoria Create/Edit de Appointment 2026-03-26

- `branchId` e `propertyId` foram confirmados como listas cadastráveis com telas existentes.
- `serviceTypeId` e `timeSlot` foram confirmados como catálogos/listas canônicas; `timeSlot` não precisa tela própria se continuar fechado no sistema.
- `restriction` e `property inline` ficaram confirmados como gaps reais entre UI e contrato/documentação do create manual, e foram corrigidos nesta rodada.
- `customFields` foi classificado como contrato técnico/configurável, sem exigência funcional explícita nesta fase.
- O drawer de appointment passou a filtrar `property` por `branch` e a limpar `propertyId` quando a branch muda.
- A `AppointmentCreatePage` passou a usar `PhoneInput` e `EmailInput`, reduzindo drift de UX/validação em relação ao drawer.
- O create page e o drawer de appointment ganharam seção inline de `Restrictions`, com `source=OPERATOR`, `isHome` e `notes`, incluindo limpeza da restrição no edit quando o usuário desmarca a seção.
- O create manual de appointment passou a oferecer criação contextual de property via `PropertyFormDrawer`, herdando `tenant` e `branch` e retornando o `propertyId` salvo para o formulário de appointment.

## TODO - Auditoria Appointment Time Slots 2026-03-26

- [x] Revisar implementação do Claude para catálogo configurável de `timeSlot`
- [x] Eliminar risco de tenant novo sem slots padrão
- [x] Eliminar escopo indevido do endpoint efetivo para `INSP`
- [x] Fechar validação de import para property sem `branchId`
- [x] Adicionar regressão para o worker de import
- [x] Publicar matriz em `projeto-consolidado/tasks/appointment-time-slots-audit.md`

## TODO - PWA Account Hub 2026-03-27

- [x] Revisar padrões reais de login/perfil para app PWA de operação em campo
- [x] Validar direção de produto com `Claude Code`
- [x] Converter `ProfilePage` em hub real de conta sem self-edit falso
- [x] Ligar ações reais de segurança: senha, 2FA, sessões, instalação e logout
- [x] Alinhar a semântica de sessões do PWA ao contrato real do backend
- [x] Validar perfil/login do PWA com testes focados e `typecheck`

## TODO - Restore Route After Session Expiry 2026-03-27

- [x] Mapear como `PWA` e `web` tratam `401` e redirecionamento para login
- [x] Implementar persistência segura da rota corrente antes do redirect para `/login`
- [x] Restaurar a rota anterior após login bem-sucedido em `PWA` e `web`
- [x] Limpar redirect persistido em logout explícito
- [x] Validar helpers, login e guards com testes focados e `typecheck`

## Resultado - Auditoria Appointment Time Slots 2026-03-26

- `appointment.time_slot` permaneceu string snapshot e o catálogo configurável ficou corretamente separado em `appointment_time_slots`.
- A resolução efetiva `branch -> tenant default` foi mantida no backend e consumida pelo web sem fallback hardcoded no create/edit manual.
- `CreateTenantUseCase` passou a semear os slots padrão do tenant, evitando catálogo vazio para tenants novos.
- O endpoint de slots efetivos deixou de aceitar `INSP`, removendo uma superfície administrativa que dependia de `actor.tenantId!` de forma insegura.
- O import de appointments agora valida `timeSlot` também contra o default do tenant quando a property não tem `branchId`.
- A auditoria encontrou e corrigiu um bug adicional no worker de import: linhas inválidas estavam sendo contadas como sucesso.

## TODO - Refino de UI do PWA 2026-03-26

- [x] Revisar shell e páginas centrais do PWA
- [x] Melhorar hierarquia visual do shell (`TopBar`, `BottomNavBar`, `PwaLayout`)
- [x] Refinar `LoginPage`, `SchedulePage`, `AppointmentDetailPage`, `MarketplacePage`, `EarningsPage` e `ProfilePage`
- [x] Manter compatibilidade funcional com os testes existentes
- [x] Validar `pwa typecheck` e testes dirigidos

## Resultado - Refino de UI do PWA 2026-03-26

- O shell do PWA ficou mais coeso, com `TopBar` sticky, badge de conexão mais legível, navegação inferior em pill state e layout geral com sensação mais próxima de app instalado.
- `LoginPage` ganhou hero mais forte, melhor enquadramento do formulário e mensagem contextual mais clara sem alterar o fluxo de autenticação.
- `SchedulePage`, `AppointmentDetailPage` e `MarketplacePage` ganharam headers/hero cards e cartões mais intencionais, melhorando leitura de agenda, detalhe e ofertas.
- `EarningsPage` e `ProfilePage` ficaram alinhadas ao shell novo, com resumo superior e cartões mais consistentes visualmente.
- A validação desta rodada passou em `pnpm --filter pwa typecheck` e em um bloco de `48` testes dirigidos do PWA.

## TODO - Login TOTP no PWA 2026-03-27

- [x] Revisar contrato real de login TOTP no backend/shared
- [x] Estender `useAuth` do PWA para aceitar `totpCode`
- [x] Transformar `AUTH_TOTP_REQUIRED` em segunda etapa real na `LoginPage`
- [x] Cobrir `AUTH_TOTP_REQUIRED` e `AUTH_TOTP_INVALID` com testes
- [x] Validar `pwa typecheck` e testes focados de login

## TODO - Responsivo Estrutural do Web 2026-03-27

- [x] Auditar shell mobile e componentes-base que forçam largura horizontal
- [x] Corrigir `AppShell` para não expandir o viewport em telas pequenas
- [x] Trocar `DataTable` de tabela larga por cards empilhados no mobile
- [x] Ajustar filtros que quebravam em largura pequena (`FilterDateRange`)
- [x] Validar com testes focados e `web typecheck`

## TODO - Endurecer IDs Seedados e Exposição de UUID 2026-03-27

- [x] Verificar no código e no banco se havia sequência/autoincrement para `id`
- [x] Remover derivação de código visível a partir de `id.slice(...)`
- [x] Trocar UUIDs artificiais sequenciais do `seed` por UUIDs estáveis com aparência aleatória
- [x] Validar backend com testes focados do dashboard e `typecheck`
- [x] Preparar script de refresh seletivo do dataset demo sem reset total
- [x] Validar o script com `dry-run` contra o banco atual

## TODO - Corrigir Migrations Pendentes no Fly 2026-03-27

- [x] Verificar no banco real se `appointment_time_slots` faltava por migration não aplicada
- [x] Aplicar a migration `20260326000000_add_appointment_time_slots` no banco atual
- [x] Confirmar tabela criada e slots padrão inseridos para os tenants atuais
- [x] Ajustar deploy para carregar pasta `prisma/` na imagem
- [x] Configurar `release_command` no Fly para rodar `prisma migrate deploy`
- [x] Validar `backend typecheck`

## Resultado - Corrigir Migrations Pendentes no Fly 2026-03-27

- A ausência de `appointment_time_slots` no banco atual não era bug do seed nem do script de refresh; a migration `20260326000000_add_appointment_time_slots` simplesmente não havia sido aplicada no ambiente.
- A migration foi aplicada com sucesso via `prisma migrate deploy` e o banco passou a registrar `appointment_time_slots` com `4` linhas, `2` por tenant demo atual.
- A causa raiz do drift ficou explícita: o deploy via Fly não rodava migrations e a imagem nem carregava a pasta `prisma/` para permitir um `release_command`.
- O `Dockerfile` agora copia `apps/backend/prisma/` para a imagem final, instala `prisma` CLI e o `fly.toml` passou a executar `prisma migrate deploy` antes de subir a nova release.

## TODO - Refino do Login Web 2026-03-27

- [x] Auditar a tela atual de login do `web`
- [x] Validar a direção de UX com o Claude
- [x] Melhorar a hierarquia visual da tela sem criar fluxo placebo
- [x] Adicionar suporte real a `TOTP` no login do `web`
- [x] Validar testes focados e `web typecheck`

## Resultado - Refino do Login Web 2026-03-27

- A tela de login do `web` deixou de ser um card genérico no centro da tela e passou a usar um layout mais maduro para produto B2B operacional: painel lateral de contexto em desktop, cabeçalho enxuto no mobile e formulário com hierarquia mais forte.
- O login agora incorpora `TOTP` condicional de verdade, em linha com o contrato já existente do backend, evitando drift entre ativação de 2FA e experiência de acesso.
- O suporte operacional ficou explícito por texto estático honesto, sem links/placeholders para fluxos inexistentes.

## TODO - Corrigir Time Slots Efetivos em Produção 2026-03-27

- [x] Inspecionar logs do `properfy-prod` para a rota `/v1/time-slots/effective`
- [x] Confirmar se o `500` era banco/migration ou bug de resolução de tenant
- [x] Corrigir backend para derivar `tenantId` a partir da `branch` quando o ator global não o informar
- [x] Alinhar o `web` para enviar `tenantId` explícito quando já houver tenant selecionado no create/edit manual
- [x] Validar com teste unitário focado e `typecheck`

## TODO - Endereco Multi-Pais e Remocao de Multi-Idioma 2026-03-27

- [x] Auditar o lookup de endereço e a infraestrutura de idiomas atual
- [x] Remover o filtro hardcoded de Austrália na busca de endereços
- [x] Manter filtro por país como opção explícita, sem obrigá-lo
- [x] Remover a UI e a infraestrutura morta de troca de idioma no `web`
- [x] Validar com testes focados e `typecheck`
