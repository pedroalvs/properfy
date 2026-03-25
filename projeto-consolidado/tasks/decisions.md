# Decisions Log

## 2026-03-06 - Baseline de Arquitetura

1. Backend em Node.js.
2. Arquitetura Clean Architecture.
3. Modelo de deploy monolítico.
4. ORM escolhido: Prisma.
5. Frontend e PWA com React + Vite + Tailwind CSS.
6. Supabase usado apenas como infraestrutura (PostgreSQL + Storage S3-compatible).
7. Autenticação interna, sem Supabase Auth.
8. Aplicação stateless.
9. Isolamento multi-tenant implementado no app como regra principal.
10. RLS opcional, apenas como camada adicional de segurança.

## 2026-03-10 - Documento para Cliente

1. O documento de perguntas pendentes para o cliente será entregue em PDF.
2. A fonte de verdade editorial permanece em Markdown.
3. A geração do PDF será feita por HTML estilizado e exportação via Chrome headless para garantir melhor acabamento visual.

## 2026-03-23 - Compatibilidade de Contratos na Auditoria

1. O backend passa a expor aliases compatíveis para `/v1/billing/invoices*` e `PATCH /v1/financial/entries/:entryId/approve` enquanto o frontend legado React ainda consome esses caminhos.
2. A listagem de sessões ativas foi exposta em `GET /v1/auth/sessions` para suportar a tela existente de settings sem manter um 404 permanente.
3. O contrato canônico continua sendo o definido nos módulos backend/shared; aliases servem apenas como camada de compatibilidade durante a estabilização.

## 2026-03-23 - Hardening do Fluxo do Inspetor e Contrato do Marketplace

1. Os use cases de execução do inspetor passam a validar explicitamente posse da execução e consistência entre `appointmentId`, `assetId` e `inspectorId`, em vez de confiar apenas na existência do recurso.
2. O schema compartilhado de marketplace passa a refletir a shape real retornada pelos use cases backend, e o PWA deve consumir esse contrato sem inferir campos não fornecidos pela API.
3. A UI web de marketplace deve se limitar ao resumo operacional retornado hoje pela API; mapa com pins e lista detalhada de appointments só voltam quando o backend expuser essas coordenadas/detalhes de forma canônica.

## 2026-03-23 - Critério de Produção Real para Infra e Marketplace

1. `staging` e `production` não podem iniciar com fallback para providers `stub` em dependências críticas do fluxo operacional: fila assíncrona, storage S3, e-mail transacional, SMS e geocoding.
2. Download de invoice passa a usar o mesmo storage canônico dos relatórios/arquivos gerados, com presigned URL baseada em `fileKey`, removendo qualquer URL fake no backend.
3. O marketplace deve filtrar elegibilidade geográfica no banco antes da paginação e aplicar exatamente o mesmo predicado no `count`; filtrar depois do `skip/take` é considerado bug de produção.

## 2026-03-23 - Suite de Validação e Gate de Deploy

1. Testes que quebraram nesta rodada por contratos antigos foram corrigidos no nível de fixture/mock quando o contrato canônico da rota/use case já estava válido; não houve relaxamento de schema para acomodar testes legados.
2. O novo gate de ambiente para `MAPBOX_ACCESS_TOKEN` em `staging/production` é considerado comportamento desejado; ausência da variável deve bloquear deploy em vez de reativar geocoding `stub`.
3. No web, a suíte Vitest passa a rodar em `forks` com `maxForks=1` e `12` shards para manter o pico de heap abaixo do limite do ambiente atual; isso é tratado como ajuste de infraestrutura de teste, não mudança de comportamento do produto.
4. `PropertyDetailPage.test.tsx` deve mockar `PropertyFormDrawer` e `PropertyAppointmentsTab`, porque o objetivo desse teste é validar a composição da página e a troca de abas, não reexecutar hooks pesados dos filhos nem a tabela completa de appointments.
5. No PWA, páginas principais passam a ser lazy-loaded pelo router e o fluxo de compressão de imagem é carregado dinamicamente apenas quando o usuário seleciona fotos; o objetivo é reduzir TTI e manter o peso do pipeline HEIC/canvas fora do bundle inicial.

## 2026-03-24 - Remoção de Affordances Falsas em Produção

1. Botões de `Edit` em páginas/drawers só podem permanecer quando houver fluxo real de edição conectado. Onde já existia formulário reutilizável, o botão foi ligado ao drawer correto; onde não existia fluxo canônico, a ação foi removida.
2. No web, a página de detalhe de appointment deve abrir `AppointmentFormDrawer` em modo edição no próprio contexto da página; navegar de volta para a lista ao clicar em `Edit` é considerado bug de produção.
3. No PWA, a aba `Map` da navegação inferior foi removida e `/map` redireciona para `/schedule` até existir um fluxo real; placeholder em navegação principal é comportamento não aceitável para produção.
4. No web, rotas e CTAs de mapa para appointments, properties e service groups foram desativadas via redirect para as listas correspondentes enquanto `MapContainer` continuar sendo apenas placeholder visual, sem mapa operacional real.

## 2026-03-24 - Integridade de Contexto em Billing e Users

1. `CreateManualAdjustmentUseCase` não pode aceitar `tenantId` apenas como metadado de moeda: em produção, tenant precisa existir/estar ativo, `appointmentId` e `referenceEntryId` precisam pertencer ao mesmo tenant, e `inspectorId` precisa existir/estar ativo/elegível ao tenant antes de persistir o lançamento.
2. Para usuários globais (`AM`/`OP`) no web, a criação/edição de usuários é sempre uma operação dentro de tenant explícito; por isso o CTA `New User` fica desabilitado até a agência ser selecionada, em vez de permitir abrir o fluxo e falhar apenas no submit.
3. O mesmo gate de tenant explícito vale para `Pricing Rules` no web: usuários globais só podem abrir criação depois de selecionar a agência na página, e o formulário deve herdar esse tenant em vez de deixá-lo implícito.
4. Notificações de domínio multi-tenant não podem ser criadas com `tenantId` vazio nem em fluxos internos. Alertas operacionais como `INSPECTION_STUCK_ALERT` devem resolver o tenant pelo appointment relacionado antes de persistir a notificação.
5. No web, payloads que o backend modela como `YYYY-MM-DD` não devem ser convertidos para ISO timestamp antes do envio. O caso de `generate invoice` passou a usar as strings do `DateInput` diretamente para evitar drift de timezone e rejeição de schema.
6. No cadastro de `Inspector` no web, `serviceTypes` devem ser escolhidos a partir de entidades canônicas de `Service Type` e enviados como UUIDs válidos; texto livre/comma-separated sem validação não é aceitável em produção.
7. Para `Property` no web, usuários globais (`AM`/`OP`) só podem iniciar criação depois de selecionar a agência, e as opções de branch devem ser carregadas a partir do tenant escolhido; `tenantId` explícito no create é obrigatório para fechar o contrato do backend.
8. Para `Appointment` no web, o fluxo correto para `AM`/`OP` é `tenant -> branch -> property`; property deve ser filtrada pela branch selecionada para evitar combinações cross-tenant que o backend rejeita tardiamente.
9. No `Tenant Portal`, modo `read-only` significa realmente sem mutação operacional pelo inquilino, exceto o fluxo explícito de `unavailability` urgente já previsto. Atualização de contato deve ser bloqueada no frontend e no backend quando o token estiver read-only/expirado ou quando o appointment estiver em estado terminal.
10. No PWA do inspetor, a execução não pode prosseguir sem um `appointment` válido e visível. Se o detalhe do appointment falhar ou não estiver autorizado, a tela deve bloquear o fluxo antes de qualquer `START/FINISH`, inclusive offline.

## 2026-03-24 - Notification Templates

1. A página web de `Notification Templates` só deve expor filtros que o contrato backend/shared realmente suporta. Nesta rodada, `search`, `status`, `sorting` e paginação interativa foram removidos porque a rota canônica aceita apenas `templateCode`, `channel` e `includeDefaults`.
2. A UI de templates deve distinguir visualmente `Platform Default` de `Agency Override` para não ocultar de qual camada vem o template atualmente editado.
3. A existência de templates globais (`tenantId = null`) permanece como comportamento implementado e operacional no backend atual, sustentado por seed, startup check e fallback de envio. Isso foi mantido nesta rodada e deve ser tratado como decisão de escopo separada antes de qualquer mudança destrutiva.

## 2026-03-24 - Service Groups

1. O wizard web de `Service Groups` deve obedecer exatamente ao `createServiceGroupSchema`: `appointmentIds`, `serviceTypeId`, `scheduledDate`, `timeWindow` e `priorityMode`. `startTime/endTime` separados no payload eram drift de contrato e foram removidos.
2. Para usuários globais (`AM`/`OP`), a criação de `Service Group` passa a exigir agência explícita antes de carregar appointments elegíveis; isso segue o mesmo padrão já aplicado em `Users`, `Properties`, `Pricing Rules` e `Appointments`.
3. O backend não pode aceitar `Service Group` com appointments de tenants diferentes. `CreateServiceGroupUseCase` agora rejeita mistura de tenants como violação de isolamento multi-tenant.
4. A listagem web de `Service Groups` só mantém filtros contratados; o campo `search` foi removido porque a rota canônica não o suporta.

## 2026-03-24 - Availability Slots e Tenant Portal

1. A listagem web de `Availability Slots` só deve expor filtros suportados pela rota canônica. O campo `search` foi removido porque `/v1/availability-slots` aceita apenas `inspectorId`, `status`, `dateFrom`, `dateTo` e paginação/ordenação.
2. No `Tenant Portal`, respostas de comando (`confirm`, `reschedule`, `unavailable`) devem declarar schemas pequenos e fiéis ao output real do use case. Não é aceitável declarar `appointmentResponseSchema` completo quando o comando retorna apenas confirmação de estado.
3. O frontend do `Tenant Portal` continua baseado em `refetch` após mutações; por isso a correção segura foi alinhar o contrato backend/shared ao retorno real, sem inflar os use cases nem criar dependência nova do body da resposta.

## 2026-03-24 - Appointments Import e Status Transition UI

1. O fluxo web de `Appointment Import` deve refletir exatamente o contrato operacional do backend. Nesta rodada, a UI passou a orientar as colunas canônicas do worker (`propertyCode`, `serviceTypeCode`, `tenantName`, `tenantEmail`, `tenantPhone`, `scheduledDate`, `timeSlot`, `notes`) e a consumir `importId/status/successCount/errorCount/errorsJson` reais em vez de inferir `id/progress/errors` inexistentes.
2. Suporte a `.xlsx` continua válido no backend/worker, mas o preview do web fica restrito a `.csv` até existir parser cliente real para XLSX. Expor preview XLSX sem implementação é affordance falsa em fluxo crítico de produção.
3. Em `Appointment` status transitions, a barra de ações do web só pode exibir CTAs que a própria UI consegue completar com todos os campos obrigatórios do backend. Por isso `AWAITING_INSPECTOR -> SCHEDULED` sem `inspectorId` e `SCHEDULED -> DONE` por operador sem `doneCheckedByUserId` foram ocultadas nesta rodada.

## 2026-03-24 - Reports

1. O diálogo genérico de `Generate Report` no web não pode gerar relatório cross-tenant implicitamente para `AM`/`OP` por simples omissão de `tenantId`. Para papéis globais, a agência deve ser escolhida explicitamente antes do submit; relatórios plataforma-wide, se existirem, precisam de affordance deliberada separada.
2. O payload de geração de relatório no web passa a enviar `tenantId` dentro de `filters` quando a agência é escolhida, sem alterar o backend, porque o contrato já suporta esse escopo explícito.

## 2026-03-24 - Financial

1. A tela operacional de `Financial Entries` não deve abrir visão cross-tenant implícita para `AM`/`OP`. Nesta rodada, a UI passou a exigir agência explícita antes de carregar resumo/lista e antes de habilitar `Adjustment` e `Refund`.
2. O web de `Financial Entries` deve seguir exatamente o contrato de listagem canônico: o filtro `entryType` continua sendo estado local da UI, mas a query enviada é `type`, e o campo `search` foi removido porque a API não o suporta.
3. O web de `Invoices` deixou de enviar `sortBy/sortOrder` não suportados pela API e trocou o filtro textual falso de inspetor por seleção canônica de `inspectorId`.
4. `Generate Invoice` no web não pode depender de texto livre para identidade de inspetor. O modal passou a usar seleção canônica de inspetor via `/v1/inspectors`, removendo o affordance enganoso de “Search inspector...” que não resolvia entidade real.

## 2026-03-24 - Tenant Portal Unavailability Notifications

1. `Tenant Portal -> UNAVAILABLE` é evento operacional obrigatório também no caminho normal, não apenas no urgente/read-only. O backend deve disparar a mesma infraestrutura de notificação usada por `CONFIRM` e `RESCHEDULE`, em modo fire-and-forget para não bloquear a ação do inquilino.
2. O template canônico para esse evento permanece `INSPECTION_UNAVAILABILITY_REPORTED`; a correção segura foi completar o fluxo já existente, sem criar canal paralelo nem relaxar contrato.
3. Como `SendNotificationUseCase` já faz fallback `tenant -> platform default`, o seed passou a sincronizar templates obrigatórios também em `tenant_id = null`. Manter apenas templates por tenant no dado inicial deixava um buraco explícito entre fallback implementado e ambiente seedado.

## 2026-03-24 - Notification Templates Platform Defaults

1. `Platform Default` de notification template é funcionalidade de produção, não convenção visual. O repositório de templates deve tratar `tenantId = null` como identidade real do registro global; converter isso para string vazia no `upsert` é bug.
2. A correção segura no backend foi trocar o pseudo-upsert por lookup `tenant_id/template_code/channel` seguido de `update/create` por `id`, preservando o `@@unique` do banco sem migration.
3. Antes de promover esse bloco para produção, vale verificar se staging tem registros antigos com `tenant_id = ''` ou duplicatas anômalas de templates globais para limpeza pontual de dados.

## 2026-03-24 - Inspector Schedule Multi-Tenant

1. O inspetor autenticado não deve depender de `tenantId` do usuário para carregar sua agenda operacional. A agenda canônica é `inspectorId + date`, porque o mesmo inspetor pode estar alocado em appointments de tenants distintos.
2. O isolamento continua garantido pela atribuição/elegibilidade do próprio appointment e pelas validações posteriores de start/detail/finish; usar `tenantId` do JWT do inspetor como filtro primário na agenda é bug.

## 2026-03-24 - PWA Start Inspection State Integrity

1. No PWA do inspetor, falha online no `START` não pode avançar o estado local para `IN_PROGRESS`. Offline já é tratado explicitamente no hook de start; qualquer erro online deve manter a tela em `PRE_START` e exibir erro operacional.
2. O fix seguro foi manter a mudança no nível da página (`ExecutionPage`), sem criar estado novo nem mexer no hook offline. Assim o fluxo continua: sucesso/offline enfileirado -> `IN_PROGRESS`; erro online -> permanece `PRE_START`.

## 2026-03-24 - DONE, Cross-Check e Billing

1. `Billing/Payout` não podem nascer de um `DONE` técnico sem `doneCheckedByUserId`. O side effect financeiro em `ExecuteStatusTransitionUseCase` agora só roda quando o `DONE` já está cross-checked.
2. A correção desta rodada foi deliberadamente conservadora: remover o disparo precoce de billing sem inventar uma ação nova de cross-check pós-`DONE`, porque essa ação canônica ainda não está fechada no dossiê.
3. Estado residual honesto: o ciclo automático `inspetor conclui -> operador cross-check -> billing nasce` ainda não está completo no produto. O sistema agora evita lançamento indevido, mas continua precisando de um comando/fluxo formal para registrar o cross-check posterior.
4. Enquanto esse comando não existir, a UI operacional deve deixar explícito quando um appointment está `DONE` mas ainda sem validação operacional. Tratar esse estado como “concluído por completo” é affordance enganosa.
5. O dashboard operacional passa a contar `DONE` sem `doneCheckedByUserId` como pendência explícita (`pendingOperatorCrossChecks`). Isso não fecha o fluxo, mas torna o gargalo visível para gestão e operação.
6. A listagem operacional de appointments e o bloco de `recentAppointments` também passam a refletir esse estado intermediário. Nesta rodada, o payload listado passou a expor `doneCheckedByUserId/doneCheckedAt`, a tabela web ganhou a coluna `Reviewed`, e o dashboard mostra `Pending review` para `DONE` recentes ainda sem cross-check.

## 2026-03-24 - Agenda Executavel do Inspetor

1. Para `ROUTINE`, a regra de executabilidade do inspetor não vale apenas em `T-1`. Se o appointment estiver no próprio dia mas continuar sem confirmação do inquilino, ou marcado `UNAVAILABLE`, ele também deve sair da agenda executável e bloquear `detail/start`.
2. A exceção operacional mantida é `keyRequired = true`, além dos fluxos `INGOING/OUTGOING` e dos casos já efetivamente confirmados/manual-confirmados.
3. A correção segura foi endurecer o `T1VisibilityService` e deixar `GetInspectorScheduleUseCase`, `GetAppointmentDetailUseCase` e `StartInspectionUseCase` continuarem dependentes dessa regra central, evitando drift entre agenda, detalhe e início de execução.

## 2026-03-24 - Tenant Portal Reschedule e Ciclo do Token

1. O dossiê não fecha explicitamente o comportamento do token após `RESCHEDULE`, mas deixar o token antigo ativo herda um cutoff calculado para a data errada e cria drift operacional claro.
2. Como decisão de engenharia de menor risco, `RESCHEDULE` passa a revogar tokens ativos do portal. Isso é consistente com a semântica de “novo ciclo” já implícita pelo reset de `tenantConfirmationStatus -> PENDING`.
3. A opção de recalcular `expiresAt` do token existente foi descartada nesta rodada por aumentar a complexidade de estado (`ACTIVE/EXPIRED/read-only`) sem respaldo explícito do dossiê.

## 2026-03-24 - Tenant Portal Confirm e Restricoes Herdadas

1. O dossiê não fecha literalmente se uma confirmação posterior sem novas restrições deve limpar automaticamente as restrições antigas, mas manter `tenantConfirmationStatus = CONFIRMED` ao lado de restrições herdadas de `UNAVAILABLE/RESCHEDULE` gera estado contraditório para operação e inspetor.
2. Como decisão de engenharia, `CONFIRM` passa a limpar restrições anteriores do portal antes de persistir novas. Se o tenant confirmar sem mandar novas restrições, o appointment fica confirmado e sem indisponibilidade herdada.
3. A alternativa de preservar restrições antigas por omissão foi descartada porque perpetua exatamente o dado obsoleto que a confirmação deveria superar.

## 2026-03-24 - Resumo Financeiro Consolidado

1. O resumo financeiro não pode somar `PENDING` e `APPROVED` no mesmo agregado de “total” enquanto mantém pendências em card separado; isso distorce a leitura de caixa e repasse.
2. Como decisão de engenharia, `getSummary` passa a agregar valores apenas de `APPROVED`, mantendo `pendingCount` separado para backlog financeiro ainda não consolidado.
3. A UI web foi alinhada a essa semântica renomeando os cards para `Approved Debits`, `Approved Payouts`, `Approved Adjustments` e `Approved Refunds`.

## 2026-03-24 - Invoices: Contrato Canonico e Semantica de Fechamento

1. A superficie web de `Invoices` deve refletir exatamente o contrato atual do backend/shared: status `OPEN/CLOSED/PAID`, `periodType`, `fileKey` e metadata de geracao/pagamento. Campos legados como `frequency`, `entryCount`, `entries` e `inspectorName` embutido no payload foram removidos da UI porque nao existem na rota canônica.
2. `CLOSED` significa fechado/apurado; `PAID` significa liquidado. `OPEN` nao pode aparecer com semantica de valor final. O drawer passou a avisar explicitamente que uma invoice `OPEN` ainda pode mudar ate o fechamento.
3. `Download` so deve ficar habilitado quando houver arquivo real (`fileKey`) e a invoice nao estiver `OPEN`. Para sustentar isso sem inventar endpoint novo, `ListInvoicesUseCase` passou a expor `fileKey` tambem na listagem.
4. A composicao detalhada de entries nao foi reintroduzida no drawer nesta rodada porque a API atual nao a entrega e o dossie nao fecha isso como requisito obrigatorio dessa tela. A decisao segura foi remover a affordance falsa e manter a semantica correta de fechamento/liquidacao.

## 2026-03-24 - Tenant Portal Read-Only Sem Mutacao

1. O `guia-properfy` corrigiu a leitura desta superficie: `portal expired/read-only` deve bloquear toda mutacao do inquilino, inclusive `UNAVAILABLE`. O caminho apos o prazo passa a ser operacional, via contato com a agencia, e nao autoatendimento no portal.
2. A implementacao anterior de `urgentMode` em `ReportUnavailabilityUseCase` foi tratada como drift de regra. Nesta rodada, o backend passou a lançar `PortalActionBlockedError` quando o token estiver read-only, alinhando `UNAVAILABLE` ao mesmo gate ja aplicado a `CONFIRM`, `RESCHEDULE` e `CONTACT`.
3. No frontend, a view expirada e os componentes read-only passaram a orientar contato com a agencia diretamente. Manter CTA de “Report Unavailability (Urgent)” no portal teria sido affordance enganosa frente ao dossie atual.

## 2026-03-24 - Inspector Execution: Audit Multi-Tenant e Checklist por Service Type

1. `finish-inspection` precisa carregar o `tenantId` real do appointment tambem no audit log. Deixar `tenantId` como `undefined` justamente na finalizacao da execucao degrada a trilha multi-tenant no ponto em que execucao, status e financeiro se conectam.
2. A validacao de evidencias de `finish-inspection` nao pode depender de cast para `execution.serviceTypeId`, porque a entidade de execucao nao carrega esse campo. A regra canônica vem do `appointment.serviceTypeId`, e o use case passou a carregar esse dado explicitamente antes de aplicar `minPhotos/requiresSignature`.
3. O fallback default de `1 PHOTO` continua existindo apenas quando o `serviceType` realmente nao define checklist. O que foi removido nesta rodada foi o fallback silencioso causado por wiring incorreto, que enfraquecia o gate operacional de `DONE`.

## 2026-03-24 - Billing Automatic Entries: Approval Semantics e Concorrencia

1. Enquanto um `FinancialEntry` estiver em `PENDING`, ele nao deve expor `approvedByUserId`, `approvedAt` nem `approvedByName`. Cross-check operacional do appointment e aprovacao financeira do lancamento sao etapas diferentes e nao podem compartilhar o mesmo metadado.
2. Como o dossie nao formaliza se o auto-lancamento apos cross-check nasce `PENDING` ou `APPROVED`, a decisao desta rodada foi conservadora: manter o status atual e corrigir apenas o que era objetivamente inconsistente, removendo `approvedBy*` dos auto-lancamentos pendentes e mascarando esse metadado nas saidas de lista/detalhe quando `status != APPROVED`.
3. Para reduzir risco de duplicidade em corrida concorrente sem introduzir migracao potencialmente bloqueante sobre dados existentes, `CreateFinancialEntriesOnDoneUseCase` passou a gerar IDs determinísticos por `appointment + entryType` e a tratar colisao/duplicidade como “ja criado” ao reconsultar o repositorio.

## 2026-03-24 - Generate Invoice: Contrato Canônico e Idempotencia Honesta

1. `POST /v1/invoices/generate` nao deve ter campo cosmético no frontend. O seletor de frequencia do web passou a usar o nome canônico `periodType`, e o `generateInvoiceSchema` compartilhado agora aceita esse campo opcional para que a escolha do usuario deixe de ser silenciosamente ignorada.
2. A resposta do comando de gerar invoice deve refletir a shape canônica de invoice, nao um payload parcial ad hoc. O use case backend passou a retornar os campos de `invoiceResponseSchema`, alinhando implementacao, OpenAPI e rota.
3. Em caso de idempotencia por mesmo `inspector + period`, a resposta deve refletir o status real atual do recurso existente. Responder sempre `CLOSED` quando a invoice ja estiver `PAID` e comportamento enganoso e foi corrigido.

## 2026-03-24 - Barrels sem Superficie Placeholder

1. Quando uma rota placeholder ja foi oficialmente removida/redirecionada, o barrel `pages/index.ts` do modulo nao deve continuar exportando essa pagina como superficie publica. Manter export de `MapPage` legada aumenta o risco de reuso acidental de uma tela que o produto ja decidiu retirar de producao.
2. Nesta rodada, `appointments`, `properties` e `service-groups` deixaram de exportar as respectivas `MapPage` pelos barrels de `pages`, sem mexer nos componentes em si. A decisao foi limitar a superficie publica primeiro e adiar qualquer remocao fisica desses arquivos para uma rodada de limpeza dedicada.

## 2026-03-24 - Detail Drawers sem Edit Fantasma

1. Em drawers de detalhe reutilizaveis, a acao `Edit` so pode ser renderizada quando existir `onEdit` real no call-site. Se o fluxo nao foi conectado, o comportamento correto em producao e ocultar a acao, nao manter um botao com toast placebo.
2. O fallback `Editing coming soon` foi removido dos drawers de `appointments`, `properties`, `inspectors`, `users`, `service-groups` e `financial entries`. Isso preserva a honestidade da interface sem criar endpoint ou form novo desnecessariamente.
3. O `Claude Code` confirmou que, nos call-sites produtivos auditados nesta rodada, `onEdit` ja existe; portanto a mudanca e de baixo risco e fecha principalmente a brecha de reuso acidental desses componentes fora do contexto correto.

## 2026-03-24 - Dashboard como Superficie Operacional, nao Painel Passivo

1. No dashboard web, componentes que ja se apresentam como backlog operacional (`Recent Appointments`, `Pending Actions`) nao podem ficar passivos quando ja existe destino canônico no produto. Linha clicavel sem handler e card de pendencias sem navegação sao gaps reais de producao.
2. `RecentAppointmentsList` foi ligado ao `navigate` do router (`/appointments/:id` e `/appointments`) em vez de manter callbacks mortos no componente pai.
3. `PendingActionsCard` passou a navegar apenas para destinos canônicos ja existentes: `NO_RESPONSE -> /appointments?tenantConfirmationStatus=NO_RESPONSE`, `pending operator cross-checks -> /appointments?status=DONE`, `pending financial entries -> /financial?status=PENDING` e `processing reports -> /reports?status=PROCESSING`.
4. Para que esses links sejam honestos, os hooks/listagens de `appointments`, `financial` e `reports` passaram a inicializar filtros a partir da querystring suportada. No caso de `appointments`, o filtro `tenantConfirmationStatus` deixou de ficar implícito no backend e foi exposto tambem na UI.

## 2026-03-24 - Notifications por Appointment: Diagnostico Antes de Retry

1. Na superficie atual do produto, notificacoes aparecem no tab do `Appointment Detail`, nao em um notification center geral. Portanto o criterio correto desta rodada foi tornar esse tab operacionalmente util antes de discutir uma UI de retry dedicada.
2. O backend ja expunha `templateCode`, `deliveredAt`, `failedAt`, `failureReason` e `retryCount`. O frontend estava descartando esses campos e deixava a operacao cega justamente nos casos de falha.
3. A decisao desta rodada foi expandir a visibilidade do tab com esses campos, sem adicionar um novo botao de `retry`. O `guia-properfy` tratou isso como minimo seguro de producao; o `Claude Code` considerou retry como etapa separada de menor risco apos a visibilidade basica.

## 2026-03-24 - Timeline de Appointment com Contrato de Audit Log Real

1. O tab de timeline do appointment nao pode depender de campos inventados no frontend (`event`, `actorName`) quando o backend/shared expõem outro contrato (`action`, `actorType`, `actorId`, `beforeJson`, `afterJson`, `reason`). Isso quebra rastreabilidade de producao e pode renderizar `by undefined`.
2. A decisao desta rodada foi alinhar o hook e o componente ao contrato canonico do audit log e exibir um resumo operacional compacto do `before/after`, sem reimplementar a tela global de audit logs dentro do detalhe de appointment.
3. O minimo seguro definido com `guia-properfy` foi: mostrar acao, quando ocorreu, quem fez, motivo e o que mudou. Campos extras como `requestId/ipAddress` continuam reservados para a superficie global de audit logs.

## 2026-03-25 - Invoice Generation: Periodo Canonico vs Janela Financeira Inclusiva

1. Em `GenerateInvoiceUseCase`, `periodStart` e `periodEnd` continuam sendo datas canônicas de negócio (`YYYY-MM-DD`) e não devem ser redefinidos para timestamps de fim de dia só para acomodar a apuração.
2. A soma de payouts aprovados para geração de invoice deve usar o dia final inteiro como janela inclusiva (`23:59:59.999Z`), porque excluir lançamentos aprovados no último dia do período é bug financeiro de produção.
3. A resposta de `generate invoice` deve devolver `periodStart/periodEnd` no mesmo formato canônico usado por `list invoices` e `get invoice` (`YYYY-MM-DD`), evitando drift de timezone e inconsistência de contrato entre endpoints do mesmo recurso.

## 2026-03-25 - Financeiro Web: Datas Canonicas e Semantica de Aprovacao

1. Em superfícies financeiras do web, valores monetários devem sempre usar a `currency` da própria entry; hardcode local de `AUD` é tratado como bug de produção, mesmo quando a maioria do seed atual use essa moeda.
2. `Approved By` e `Approved At` só devem aparecer quando a entry já foi aprovada ou quando o backend realmente devolve esse metadado. Para `PENDING`, a UI deve nomear a pendência de forma explícita, não exibir labels de aprovação vazias.
3. `periodStart/periodEnd` de invoices são datas canônicas, não `date-time`. A renderização no web deve usar formato de data pura e o helper `formatDate` precisa preservar `YYYY-MM-DD` sem deslocar o dia por timezone do navegador.

## 2026-03-25 - Appointments: Edicao So nos Estados Realmente Editaveis

1. O frontend de `Appointments` não deve expor `Edit` em nenhum call-site quando o próprio backend já proíbe atualização para aquele status. Manter o botão visível e deixar a falha aparecer só no submit é affordance falsa de produção.
2. A regra canônica desta rodada foi alinhada ao `UpdateAppointmentUseCase`: `Edit` só permanece para `DRAFT` e `AWAITING_INSPECTOR`. Estados como `SCHEDULED`, `DONE`, `CANCELLED` e outros não editáveis perdem a ação na lista, no drawer e na página de detalhe.
3. Essa decisão não substitui a necessidade de continuar auditando se algum resumo/filtro ainda trata `DONE` pendente de cross-check como “completo”; ela só fecha uma superfície operacional objetivamente enganosa dentro do módulo.

## 2026-03-25 - Inspector Execution: Presign Sem Fallback Implicito de Tenant

1. Em `request-asset-upload`, o `appointment` é parte obrigatória da fonte de verdade para storage path e autorização complementar; se o lookup falhar, o fluxo deve abortar, não fabricar `tenantId = 'unknown'`.
2. Ausência de appointment ou mismatch de `inspectorId` nessa superfície passam a responder com `ExecutionAppointmentNotFoundError`, alinhando o comportamento ao restante do módulo (`start-inspection`/`get-appointment-detail`) e evitando mistura desnecessária de `Forbidden` com estado corrompido.
3. Storage key de asset de inspeção deve sempre nascer de `appointment.tenantId`, preservando rastreabilidade multi-tenant e evitando lixo operacional em paths ambíguos.
4. O mesmo critério vale para `finish-inspection`: `appointment` não pode ser opcional quando ele define `serviceType` para regra de evidência e `tenantId` para audit log. Se esse lookup falhar, o fluxo deve abortar com erro canônico do módulo.

## 2026-03-25 - Pricing Rules: Moeda Vem do Tenant, nao do Frontend

1. `Pricing Rule` pertence ao tenant e, portanto, preço e payout precisam ser exibidos na `currency` configurada da agência. Hardcode em `AUD` no frontend é bug de produção em ambiente multi-tenant real.
2. A correção mínima segura foi enriquecer o contrato de `Pricing Rules` com `currency` do tenant no shared/backend, em vez de inferir moeda localmente em `PricingRuleTable` ou `PricingPreview`.
3. `PricingPreview` de appointments deve consumir o mesmo contrato de `Pricing Rule`; manter uma moeda correta na listagem e outra hardcoded no preview criaria drift operacional dentro do próprio fluxo de agendamento.

## 2026-03-25 - Financial Summary: Cards Agregados Tambem Precisam de Currency

1. Cards agregados de financeiro (`Approved Debits/Payouts/Adjustments/Refunds`) não são exceção ao domínio multi-tenant: quando o resumo é de um tenant, a moeda precisa ser a `currency` configurada desse tenant.
2. A correção mínima segura foi fazer o summary backend/shared carregar `currency` ao resolver o tenant, em vez de manter `AUD` hardcoded no `FinancialSummaryBar`.
3. Quando não houver escopo de tenant resolvido, o summary pode permanecer sem moeda (`null`) de forma honesta; a UI agregada dessa rodada só é usada com tenant explícito para papéis globais, então não houve necessidade de inventar fallback de moeda global.

## 2026-03-25 - Tenant Portal: Corrigir Contrato, Nao Inventar Politica de Gating

1. `GET /v1/tenant-portal/:token` deve devolver `existingResponse` quando já houver interação registrada no portal. O backend já grava `CONFIRM`, `RESCHEDULE` e `UNAVAILABLE_REPORTED`; deixar o frontend modelar/renderizar esse campo sem o backend preenchê-lo é drift de contrato.
2. O resumo de `existingResponse` deve ser de produto, não técnico. Serializar `newValuesJson` cru no response é inadequado; o contrato passou a expor `type`, `createdAt` e `summary` legíveis derivados do histórico.
3. A política fina de gating depois de uma resposta anterior e o comportamento de `UNAVAILABLE` após `7 PM`/token read-only continuam conflitados no dossiê. Nesta rodada, a decisão foi não inventar essa regra: corrigir o contrato e registrar o conflito explicitamente.

## 2026-03-24 - Appointment Financial Tab com Semantica Operacional Mais Clara

1. O endpoint do tab financeiro ja estava correto; o problema era semantico. O frontend descartava `approvedBy*`, `reason` e `relatedEntityName`, justamente os campos que ajudam a responder por que o ciclo financeiro daquele appointment ainda nao fechou.
2. A decisao segura desta rodada foi enriquecer o tab com `counterparty`, `approved by` e `reason`, mantendo a mesma fonte de dados e sem abrir endpoint/acao novos.
3. A empty-state tambem foi endurecida: ausencia de lancamentos nao pode soar como “nao existe nada para cobrar” quando o dominio ja admite o caso “servico feito, mas billing ainda bloqueado por cross-check operacional”.

## 2026-03-24 - Audit Logs com Filtros Canônicos

1. `Audit Logs` e uma superficie critica de investigacao e nao pode operar com filtros inexistentes no backend. O hook web enviava `search`, `startDate` e `endDate`, mas o contrato real aceita `actorId`, `entityId`, `fromDate` e `toDate`.
2. A decisao desta rodada foi remover a busca textual falsa e alinhar a UI a filtros explicitamente suportados pela API: `actorId`, `entityType`, `entityId`, `action` e intervalo `from/to`.
3. `actorId` como campo livre de UUID tem ergonomia pobre, mas foi tratado como compromisso aceitavel de producao nesta rodada por ser semanticamente correto e de baixo risco. Autocomplete/lookup fica como melhoria futura, nao como correcao obrigatoria desta passada.

## 2026-03-24 - Audit Logs com Legibilidade Operacional

1. Depois de alinhar os filtros ao contrato canônico, a próxima correção segura ficou restrita à apresentação: tabela e drawer não podiam continuar exibindo `action`, `actor` e `tenant` de forma crua numa superfície de auditoria operacional.
2. A decisão desta rodada foi formatar `action`, tornar `actor` e `tenant` semanticamente explícitos e adicionar um resumo curto de `before/after` em `Changed Fields`, sem lookup de nomes e sem backend novo.
3. `guia-properfy` tratou isso como o mínimo obrigatório para triagem operacional; enriquecimento com nomes amigáveis continua opcional e depende de catálogo canônico futuro.

## 2026-03-24 - Sessions sem Semantica Falsa de Atividade

1. A tela de `Active Sessions` não pode chamar `createdAt` de `Last Active` quando o backend não persiste atividade real por sessão. Isso é dado enganoso numa superfície de segurança.
2. A correção segura desta rodada foi manter o contrato atual e ajustar apenas a UI web para `Started At`, usando `createdAt` explicitamente.
3. A marcação de `Current` por `ip + user-agent` continua como melhor esforço aceitável por enquanto; ela foi mantida, mas não foi tratada como identificação forte de sessão atual.

## 2026-03-25 - 2FA Dirigido pelo Estado Real do Usuario

1. Se `/v1/me` e o login já expõem `totpEnabled`, a UI de segurança não pode continuar oferecendo `Setup 2FA` para um usuário que já está protegido. Isso é affordance falsa em uma superfície sensível.
2. A correção segura desta rodada foi propagar `totpEnabled` pelo `AuthProvider` e tornar `TotpSetupCard` fiel ao estado atual do usuário, mostrando estado `enabled` quando o fator já estiver ativo.
3. Não foi criado fluxo novo de disable/reset/rekey nesta passada. Quando `totpEnabled = true`, a UI permanece informativa até existir comando canônico para reconfiguração.

## 2026-03-25 - Account Settings com Perfil Mais Fiel ao /me

1. Quando `/v1/me` já expõe `phone`, `lastLoginAt` e `createdAt`, o `AuthProvider` não deve reduzir esse payload a `name/email/role/tenantId` sem necessidade. Isso empobrece a superfície de conta e segurança do próprio usuário.
2. A correção segura desta rodada foi expandir o estado de auth no web com esses campos opcionais e exibir `Phone` e `Last Login` no `Account Settings`, mantendo a página somente leitura.
3. Não foi aberto fluxo de edição de perfil. A decisão foi apenas deixar a UI fiel ao dado já disponível, com baixo risco e sem impacto contratual no backend.

## 2026-03-25 - Change Password com Reautenticacao Imediata

1. `ChangePasswordUseCase` revoga todas as sessões do usuário no backend. Portanto, o frontend não pode continuar parecendo autenticado após sucesso até o próximo `401`; isso é semântica falsa numa superfície crítica de segurança.
2. A correção segura desta rodada foi manter o comando atual e alinhar apenas o comportamento do web: após sucesso, o formulário mostra mensagem honesta e chama `logout()` para limpar tokens/estado local, deixando o app redirecionar para login.
3. Não foi criado fluxo novo de “stay signed in” nem exceção para a sessão atual. A UI agora segue exatamente o efeito real do backend.

## 2026-03-25 - PWA Profile Fiel ao /me

1. No PWA do inspetor, `Profile` não precisa ter o mesmo nível de detalhe do web, mas também não deve ignorar dados úteis já disponíveis em `/v1/me`. Reduzir tudo a `name/email/role` empobrece desnecessariamente a superfície.
2. A decisão segura desta rodada foi ampliar o `AuthUser` do PWA com `phone`, `totpEnabled` e `lastLoginAt` e exibir esses campos em `Profile` de forma somente leitura.
3. `branchId` e `createdAt` ficaram de fora por baixo valor para o ator `INSP`; a intenção foi aumentar fidelidade do perfil sem transformar a tela em painel administrativo.

## 2026-03-25 - PWA Earnings com Contrato e Moeda Reais

1. `EarningsPage` não deve manter tipagem paginada própria (`{ data, total, page, pageSize }`) quando a rota canônica já responde `{ data, pagination }`. Mesmo que a UI use só a lista hoje, o tipo local precisa seguir o contrato real.
2. A tela também não pode formatar valores com `BRL` hardcoded quando as entradas financeiras já carregam `currency`. Isso produz leitura financeira errada para o inspetor.
3. A correção segura desta rodada foi alinhar a tipagem local ao envelope `{ data, pagination }` e usar a moeda real das entradas para formatar cards e lista, sem abrir paginação nova nem alterar o filtro atual por `APPROVED`.

## 2026-03-25 - PWA Login com Semantica de Erro Real

1. Em produção, `login` não pode reduzir todo erro a `Invalid email or password` quando o backend já distingue `AUTH_ACCOUNT_LOCKED`, `AUTH_USER_INACTIVE`, `AUTH_TOTP_REQUIRED`, `VALIDATION_ERROR` e `429`. Isso esconde estado real de conta e dificulta troubleshooting.
2. A correção segura desta rodada foi espelhar o padrão do web no PWA: `useAuth.login` passou a lançar `ApiError` com `status/code`, e `LoginPage` agora mapeia mensagens amigáveis por código conhecido.
3. O fallback deliberadamente não mostra `error.message` cru do backend. Para códigos não mapeados, a UI cai em mensagem genérica segura, evitando vazamento de detalhe interno.

## 2026-03-25 - Schedule do Inspetor com Semantica Local de Data e Hora

1. `scheduledDate` e `timeSlot` são os campos canônicos do domínio para agenda do inspetor. Tratar `timeSlotStart/timeSlotEnd` como timestamp UTC absoluto estava mudando o significado do dado e gerando risco real de dia/hora errados na UI e na janela de início.
2. A decisão desta rodada foi alinhar o PWA ao contrato canônico do negócio: `SchedulePage`, `useScheduleDay`, `AppointmentCard`, `AppointmentDetailPage`, `StartInspectionButton` e `ExecutionPage` passaram a usar `scheduledDate + timeSlot` como referência operacional para agrupamento, exibição e gating.
3. Como o drift também estava na própria API, `GetAppointmentDetailUseCase` deixou de serializar `timeSlotStart/timeSlotEnd` com sufixo `Z` para um slot local. O risco foi considerado contido porque esse endpoint hoje é consumido pelo PWA do inspetor.

## 2026-03-25 - Indicador de Risco do Schedule Deve Seguir Executabilidade

1. O ponto de urgência do calendário não deve marcar apenas `UNAVAILABLE`; ele precisa refletir risco operacional real de agenda não executável.
2. Com validação do `guia-properfy`, a regra segura adotada foi: marcar `ROUTINE` não confirmada (`PENDING`, `NO_RESPONSE`, `UNAVAILABLE`) e excluir `INGOING/OUTGOING` e casos com `keyRequired`, porque estes já possuem exceção operacional válida.
3. A UI móvel ficou alinhada à mesma lógica de elegibilidade que já vínhamos endurecendo no backend para `schedule/detail/start`.

## 2026-03-25 - Execution Mobile Deve Preservar Fotos Locais Ate Confirmacao Real

1. Em inspeção mobile, perda de fotos por reload/reabertura é bug de produção severo. O módulo já possuía store `pending-assets` em `IndexedDB`, mas o hook `useAssetUpload` mantinha as fotos só em memória React.
2. A decisão segura desta rodada foi usar a persistência que já existia: assets agora são gravados com `appointmentId` e `blob`, reidratados no mount do hook e removidos apenas após confirmação do upload no backend.
3. A UI também passou a distinguir `Saved locally` de `done`, porque foto capturada no dispositivo não pode parecer upload confirmado. Não foi criado sync offline novo de fotos nesta rodada; o foco foi impedir perda de trabalho e semântica enganosa.

## 2026-03-25 - Data Local Canonica em Superficies Operacionais

1. Em frontend web/PWA, `toISOString().slice(0,10)` não pode ser usado para construir `YYYY-MM-DD` de negócio quando a intenção é “hoje” ou uma chave de dia no timezone do usuário. Isso reintroduz o mesmo `day-drift` já visto antes em agenda.
2. A correção segura desta rodada foi centralizar `toLocalISODate(date)` e substituir apenas os pontos objetivos ainda expostos: `DashboardSummaryCards`, `InspectorDetailSections`, `SlotCalendarView` e `PWA OfferCard`.
3. Não houve mudança de regra de negócio nem de API. A decisão foi apenas alinhar frontend/PWA à semântica local correta para filtros, contagens e badges de data.

## 2026-03-25 - Inspector Execution Offline com Ordem e Estado Honestos

1. Em inspeção mobile, `FINISH` offline não pode se apresentar como `DONE` definitivo nem limpar o estado local antes do replay real no backend. Isso cria falso positivo para o inspetor e pode apagar exatamente o contexto necessário para retomar a sincronização.
2. A correção mínima desta rodada foi: ordenar `queued-actions` por `createdAt`, devolver `QUEUED` no `useFinishInspection` offline, manter o `execution-state` local até a sincronização real de `FINISH` e tornar o `DonePanel` explícito sobre “saved locally / syncing in background”.
3. Em rodada seguinte, o `processQueue` também deixou de bloquear appointments independentes: a fila passou a ser processada por `appointmentId`, com ordem serial interna e isolamento de falha por grupo. Assim, um `START` inválido de um appointment não impede a sincronização de outro serviço válido atrás dele.

## 2026-03-25 - Retry de Fotos Deve Reusar o Blob Local

1. Em execução mobile, um CTA chamado `Retry failed photos` não pode simplesmente apagar os assets em erro. Isso contradiz a UX e força o inspetor a refazer trabalho que o app já preservou localmente.
2. A correção mínima desta rodada foi extrair/reusar a lógica de upload para que `retryFailed()` recupere o `blob` persistido no IndexedDB e repita `presign + upload + confirm` com o mesmo `localId/blobUrl`, removendo o registro local apenas após sucesso real.
3. Não foi criado mecanismo novo de cleanup para presigns órfãos não confirmados. Isso permanece dependente da estratégia backend/storage já existente para ativos não confirmados.

## 2026-03-25 - Dashboard deve Respeitar DONE Ja Revisado

1. Depois de endurecer `DONE` pendente de cross-check em detalhe, lista e backlog, o dashboard não pode continuar renderizando `DONE` revisado como `Review Required` por omissão de prop. Isso reintroduz semântica errada justo na superfície executiva.
2. A correção mínima desta rodada foi apenas propagar `doneCheckedByUserId` de `RecentAppointmentsList` para `AppointmentStatusChip` e adicionar cobertura específica para `Done (Review)`.
3. Não foi criada nova regra nem novo endpoint. O backend já devolvia o campo; o problema era exclusivamente de wiring no frontend.

## 2026-03-25 - Cross-check Pos-DONE Como Comando Explicito

1. A regra formalizada com `guia-properfy` foi implementada como comando explícito, sem criar novo status top-level: `DONE` continua sendo o status principal, e a pendência operacional continua derivada de `doneCheckedAt = null`.
2. A decisão técnica de menor risco foi criar `POST /v1/appointments/:id/cross-check-done` em vez de tentar encaixar o cross-check como pseudo-transição `DONE -> DONE` na state machine existente.
3. Como o schema atual do appointment ainda não persiste `doneByUserId`, a implementação usa o audit log `appointment.status_transition` para descobrir quem marcou `DONE` e bloquear auto-aprovação (`done actor !== checker`). Se a trilha não existir, o backend falha fechado.
4. O comando só aceita `OP/AM`, exige `status = DONE`, `doneCheckedAt = null` e valida evidência mínima real (`execution` finalizada + `minPhotos/requiresSignature`) antes de preencher `doneCheckedByUserId/doneCheckedAt`.
5. O side effect financeiro continua fora do endpoint HTTP e foi mantido no handler interno já existente (`onDoneHandler`) depois do cross-check persistido e auditado.

## 2026-03-25 - Tenant Portal Restrito com Excecao de UNAVAILABLE Tardio

1. A decisão formalizada foi implementada sem reabrir `CONFIRM` nem `RESCHEDULE`: após o cutoff, o portal entra em modo restrito e a única mutação permitida continua sendo `UNAVAILABLE`.
2. A autorização tardia de `UNAVAILABLE` não ignora o início em campo. Se já existir `inspection execution`, o backend volta a bloquear a mutação do portal com erro explícito.
3. No caminho tardio, o backend retorna `urgentMode = true` e a UI passou a manter a ação disponível também quando já houver resposta anterior do tenant, porque a indisponibilidade urgente pode sobrepor uma confirmação feita antes do cutoff.

## 2026-03-25 - FASE 1 Deve Ser Provada em Duas Camadas

1. Para fechar a `FASE 1`, a decisão correta foi separar `prova de superfícies` de `prova operacional integrada`. CRUD, telas e autenticação não bastam sozinhos para provar o aceite.
2. A regra validada com `guia-properfy` é que o appointment só pode ser considerado legitimamente visível na agenda do inspetor se houver elo explícito de `oferta/atribuição` entre o agendamento e a agenda.
3. Por isso, a auditoria final da fase passou a exigir um teste integrado próprio, [`apps/backend/tests/unit/acceptance/fase1-integrated-flow.test.ts`](/Users/pedro/Code/GitHub/properfy/apps/backend/tests/unit/acceptance/fase1-integrated-flow.test.ts), além da matriz documental em [`projeto-consolidado/tasks/fase1-audit.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/tasks/fase1-audit.md) e da prova explicada em [`projeto-consolidado/tasks/fase1-proof.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/tasks/fase1-proof.md).

## 2026-03-25 - Definition of Done Exige Homologacao Real

1. A leitura validada com `guia-properfy` e confirmada pelo `Claude` foi manter interpretação literal do `escopo-v2`: o item “fluxo completo validado em ambiente de homologação” não pode ser promovido para `Atendido` só com testes locais, ainda que a prova integrada automatizada esteja forte.
2. Por isso, no fechamento do `DoD`, a classificação correta foi `Parcial` para homologação real e `Atendido` para os demais itens sustentados por teste e documentação.
3. Para `documentação técnica mínima por módulo`, a decisão pragmática foi considerar `Atendido` com base no conjunto consolidado [`escopo-v2.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/escopo-v2.md), [`state-machine-executavel.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/state-machine-executavel.md), [`api-contratos-principais.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/api-contratos-principais.md) e [`fluxo-operacional.md`](/Users/pedro/Code/GitHub/properfy/projeto-consolidado/fluxo-operacional.md), deixando explícito que isso não equivale a README isolado por pasta.

## 2026-03-25 - Estabilidade Final da FASE 1 Exige Suite Ampla Verde

1. Para chamar a `FASE 1` de concluída e estável, não bastou a prova dirigida da fase; a decisão correta foi exigir também `typecheck`, `build` e suíte completa verdes em `backend`, `web` e `pwa`.
2. Os resíduos encontrados nessa checagem ampla eram de baixo risco e foram corrigidos no próprio round: um harness de integração de `pricing-rules` que não refletia o campo obrigatório `currency`, e um teste de `AppointmentStatusChip` desatualizado após a introdução da semântica de review em `DONE`.
3. Com isso, o fechamento de estabilidade da fase passou a ficar apoiado não só no fluxo de aceite, mas também na saúde completa das stacks relevantes do monorepo.
