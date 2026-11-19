# Fase 2 · Etapa 1 ("O campo equipado") — Análise de Escopo (visão PO) vs Código Atual

**Fonte:** `Anexo-I-Escopo-Properfy-Fase2-Etapa1.pages` (anexo contratual, entregas 00, 01, 03, D, E, C — R$ 36.141,00), lido em conjunto com `orcamento-fase-2-properfy.md`.
**Snapshot do código:** `develop` @ `4c0e2f0e` (2026-10-01).
**Objetivo:** transformar cada item contratado numa definição verificada, mínima e pronta para spec. Toda afirmação sobre o "hoje" foi conferida no código (caminhos indicados). Isto ainda não é spec — é o insumo para o `speckit.specify` (as specs serão escritas em inglês).

**Regra que guia este documento:** entregar exatamente o que os critérios de aceite (`xx.A#`) exigem, com a menor superfície que mantenha a boa experiência. Quando o texto de um item pede mais do que o seu critério de aceite testa, recomenda-se a leitura mínima e a diferença é sinalizada para a conversa com o cliente — nunca construída em silêncio.

**Legenda**
- **Hoje:** ✅ existe · 🟡 parcial (dado ou padrão existe) · ❌ não existe
- **Veredito:** **MANTER** (construir como escrito) · **REDUZIR** (construir a leitura mínima) · **FUNDIR** (mesma feature de outro código — construir uma vez) · **ESCLARECER** (não dá para especificar sem decisão) · **REAPROVEITAR** (já existe, só conectar/polir)
- **Tamanho:** P (≤2 dias) · M (3–5 dias) · G (>1 semana) — esforço relativo, só para planejamento, considerando TDD e as regras de PR do projeto.

---

## 1. Resumo executivo

1. **O anexo tem ~65 itens, mas eles se reduzem a 7 blocos de construção** (seção 2). A maioria dos itens é uma camada fina de UI sobre um desses blocos; construir cada bloco uma única vez é o que mantém o escopo mínimo.
2. **Três fundações não existem e travam quase tudo da 01 e da 03:**
   - um **Plano do Dia** (paradas ordenadas + horário previsto por inspetor por dia) — não há coluna de ordenação, nem modelo de rota, nem uso de Directions/Matrix do Mapbox hoje;
   - uma **duração de serviço** — não existe campo `duration` em lugar nenhum (`ServiceType` não tem);
   - um **canal in-app do inspetor** (caixa de avisos + Web Push) — `NotificationChannel` é só `EMAIL | SMS` e um teste garante que não existe `IN_APP` (`packages/shared/src/enums/notification.test.ts:18`).
3. **Muita coisa já existe e deve ser reaproveitada, não reconstruída:** início/fim com geo + distância até o imóvel (`InspectionExecution`), haversine, banners de instalação (`useInstallPrompt`), geradores XLSX (`exceljs`) e PDF (`pdfkit`), uma camada de mapa de calor (`RegionHeatmap`), filtros de data/agência/inspetor no mapa, isolamento por agência no `/map`, avaliação de satisfação por inspetor, AuditService, pipeline de relatórios, porta de storage S3 com presign/confirm, aprovação no ledger com bloqueio de autoaprovação, calculadora de períodos de faturamento, `settings_json` da agência com atualização auditada e o tick de cron no horário local da agência.
4. **O texto do contrato tem contradições que vão gerar disputa no aceite se for assinado como está** (seção 3). As mais graves:
   - "Cancelamento" pelo inspetor (00.7) colide com a máquina de estados (INSP só pode fazer `SCHEDULED → DONE`).
   - "Sem operação offline" (00) — mas o PWA **já tem** fila offline para início/fim.
   - "Sem rastreamento contínuo" vs estado "em deslocamento" (01.8) e "aviso matinal com base na geolocalização" (01.12-B).
   - Código **01.12** duplicado num documento que declara os códigos "estáveis".
   - "Issues do inquilino com fotos" (C) vs exclusão global de "portal do inquilino com chamados" (§6).
   - Título/corpo da D descrevem um "mapa de rotas em tempo real" que na verdade é o 01.8.
5. **"Cálculo de rota por IA" (01.1) não precisa de LLM.** O próprio limite de carga diária da plataforma é de 3–4 paradas por inspetor (`packages/shared/src/constants/inspector-workload.ts`). Com ≤ ~8 paradas, uma busca exata sobre a Matrix do Mapbox é instantânea e determinística. Recomenda-se redigir como "rota otimizada" e confirmar com o comercial que não foi prometido LLM.
6. **A entrega E é independente e pequena** (janela de datas padrão + configuração por agência no `/map` existente). A dependência "E depende de 01" do anexo não é verdadeira tecnicamente — pode sair primeiro como ganho rápido.
7. **A entrega C é greenfield sobre uma boa infraestrutura** (porta S3, presign/confirm, verificação de magic bytes, bucket privado `inspection-assets` já provisionado e sem uso).

---

## 2. Blocos de construção (construir uma vez, consumir em todo lugar)

| # | Bloco | Existe hoje | Consumido por | Notas |
|---|---|---|---|---|
| **B1** | **Endereço-base do inspetor + geocodificação** | 🟡 `Inspector.address Json?` (`schema.prisma:483`) passa pela API (`z.record(z.unknown())`, `packages/shared/src/schemas/inspector.ts:50,71`). Sem coordenadas e sem UI no web nem no PWA. | 00.4, 01.2, 01.A3, 01.12-B, 00.A5 | Reusar `branchAddressSchema` (`packages/shared/src/schemas/address.ts`) e o job de geocodificação de imóveis (worker `property.geocode`). Adicionar lat/lng + `geocoding_status`, espelhando `Property`. |
| **B2** | **Caixa de avisos do inspetor + Web Push + fallback SMS** | ❌ Sem push nem VAPID. Inspetores recebem só 3 templates por e-mail (`notify-on-group-inspector-change.subscriber.ts`). | 00.6, 00.9, 00.A2, 00.A4, 00.10, 03.16, 03.17, publicação do plano do dia | Um modelo `InspectorNotice` + `InspectorNoticeRecipient(read_at)`. **Push é um mecanismo de entrega da caixa de avisos, não um novo `NotificationChannel` de templates.** O fallback SMS reusa o provider MobileMessage. Exige service worker customizado (`vite-plugin-pwa` → `injectManifest`). |
| **B3** | **Log de eventos de campo** | 🟡 `InspectionExecution` tem timestamps de início/fim, lat/lng de início/fim e `geolocation_distance_meters` (`schema.prisma:1181-1202`). Audita `inspection.geolocation_mismatch` com 500 m fixos no código. A precisão (accuracy) é capturada no PWA mas nunca enviada. | 00.7, 00.8, 03.1, 03.2, 03.3, 01.8, 01.9, D.1, métricas do índice | Estender, não substituir. Adicionar `accuracy_m` e timestamp do cliente (a fila offline existe). Uma tabela pequena `InspectorFieldEvent` só para os eventos novos: LATE_NOTICE (aviso de atraso) e RELEASE_REQUEST (pedido de liberação). |
| **B4** | **Plano do Dia (rota)** | ❌ Sem sequência, horário previsto ou modelo de rota. O PWA ordena por `timeSlotStart` e depois bairro (`apps/pwa/src/features/schedule/hooks/useScheduleDay.ts:13-16`). | 00.5, 01.1–01.7, 01.9–01.12-B, 01.14 | `DayPlan(inspector_id, date, status, published_at)` + `DayPlanStop(appointment_id, sequence, eta, travel_s)`. **Sem `tenant_id`** — um dia atravessa várias agências (mesmo precedente de `Inspector`; `ServiceGroup` deriva o tenant). Precisa de nota explícita de exceção à regra "tenant_id obrigatório". |
| **B5** | **Duração do serviço** | ❌ Nada. O mais próximo é o `avgExecutionMinutes` por tipo de serviço do analytics (`/v1/dashboard/analytics`). | 01.1, 01.9, 01.12, horário previsto, normalização do índice | `ServiceType.default_duration_minutes` (o "campo editável" do 01.12). Semear com a média medida. Sem override por agência no corte mínimo. |
| **B6** | **Configuração do programa + auditoria** | ✅ padrão: `tenantSettingsSchema` (`.passthrough()`) com deep merge e auditoria `tenant.updated` antes/depois (`update-tenant.use-case.ts`). **Não existe tabela de configuração de plataforma** (`IntegrationSetting` é por provider). | 01.14, raio do 03.2, pesos do 03.4, limites de alerta, E.2, C.2, C.8 | A maioria das configs é **de plataforma** (inspetores são cross-tenant): raio de geofence, pesos do índice, limites de alerta, pesos da rota. Recomenda-se um `PlatformSetting` pequeno (chave/valor + auditoria). Itens por agência (E.2, C.2 se desejado) vão no `settings_json`. |
| **B7** | **Armazenamento de anexos** | 🟡 `IStorageService` (`inspector-execution/domain/storage.service.ts`), presign→confirm com `headObject` (documentos do inspetor), checagem de magic bytes + tamanho (`upload-tenant-logo.use-case.ts`), bucket privado `inspection-assets` provisionado e sem uso (`prisma/provision-storage-buckets.ts:40-46`), `@fastify/multipart`. | C.1–C.9, fotos de issues do inquilino | Novo modelo `Attachment`. `InspectionAsset` nunca entrou no schema v1 — `docs/database-schema.md:618-631` e `docs/runbooks/inspection-asset-retention.md` estão desatualizados. |

**Grafo de dependências (técnico; substitui o §5 do anexo onde diverge):**

```
B1 ─┐
B5 ─┼─> B4 Plano do Dia ──> 01.x (rota no app, painel ao vivo, avisos de horário ao inquilino)
B2 ─┘        │
B3 ──────────┴──────────> 03.x (índice, metas, ranking)   B3 ──> D (densidade)
B6 ──> usado pelas telas de configuração da 01/03/E/C
E  ──> independente (/map existente)         B7 ──> C (independente)
```

---

## 3. Pontos do contrato a resolver ANTES da spec (de preferência antes de assinar)

| ID | Onde | Problema (verificado) | Recomendação |
|---|---|---|---|
| **Q1** | 00.7, A3 | **"Cancelamento" pelo inspetor** não tem transição válida. A máquina de estados permite ao INSP apenas `SCHEDULED → DONE` (`appointment/domain/appointment-state-machine.ts:59`). `CANCELLED` significa "o appointment da agência foi cancelado, sem custo" (regra financeira 4). Inspetores aceitam **grupos**, não appointments avulsos (`/v1/marketplace/offers/:groupId/accept`). | Renomear para **"Não posso ir / liberar"**: o inspetor registra um motivo → evento de campo + aviso à OP. A **OP** executa a ação real com as ferramentas existentes (desatribuir / trocar inspetor do grupo). A máquina de estados não muda e o evento alimenta o índice (03.3). Desatribuição self-service é uma mudança maior e separada (consistência do grupo, republicação). |
| **Q2** | 00 "Não incluso" | Diz que **não há fila offline** — mas o PWA já enfileira início/fim no IndexedDB (`apps/pwa/src/features/execution/hooks/useOfflineQueue.ts`, `FailedSyncBanner`). | Reescrever: "a tolerância offline existente de início/fim é preservada; os eventos **novos** (aviso de atraso, liberação, leitura de avisos) exigem conexão". Gravar `client_occurred_at` e `server_received_at` para que o painel ao vivo e o índice não sejam enganados por sincronizações tardias. |
| **Q3** | 00 / 01.8 / 01.12-B | "Sem rastreamento contínuo" vs "em deslocamento para a próxima parada" (01.8) e "aviso matinal **com base na geolocalização**" (01.12-B). | Derivar os estados de eventos + plano, sem rastreamento: **no imóvel** = iniciou e não finalizou; **em deslocamento** = última parada finalizada e a próxima não iniciada; **não iniciado**. Aviso matinal = horário **planejado** a partir do **endereço-base** geocodificado (B1). Trocar a redação para "com base no roteiro planejado". |
| **Q4** | 01.12 ×2 | O código **01.12 aparece duas vezes**, mas o §4 diz que os códigos são estáveis e usados em disputas. | Renumerar antes de assinar: 01.12 (aviso de atraso + campo de duração) e **01.15** (aviso matinal). Este documento chama o segundo de **01.12-B**. |
| **Q5** | D | A seção 2 chama de "Mapa de calor de inspetores". O §4.4 chama de "Mapa de inspetores **e rotas**" e lista "mapa diário de inspetor e rotas em tempo real" em *base existente*. As funcionalidades (D.1–D.4) são só uma camada de densidade. | Remover da D as linhas de "rotas em tempo real". Isso é o 01.8 ("Mapa de Estados dos Inspetores"). Senão o cliente pode cobrar a mesma coisa duas vezes. |
| **Q6** | Dependências de D, E | Ambas dizem que ficam sobre "o mapa operacional entregue na 01". Mas a 01 cria uma tela web **nova** (mapa de estados). O mapa que tem filtros, escopo por agência e pins é o **`/map` da Fase 1** (`AppointmentMapPage.tsx`). | A E se aplica ao `/map`, portanto **não tem dependência** e pode sair primeiro. A D é uma camada liga/desliga no `/map`, que já tem os filtros de período, agência e inspetor. Opcionalmente reusar a mesma camada no mapa de estados da 01. |
| **Q7** | C | Acrescenta "campo de issues no app do inquilino com fotos". O §6 exclui explicitamente "portal do inquilino com … **chamados** e acompanhamento". O próprio objetivo da C são arquivos "produzidos fora da plataforma". | Manter a leitura mínima: no portal **existente**, o inquilino pode anexar até N fotos + uma nota curta. Ficam armazenadas como `Attachment(source=RENTAL_TENANT_PORTAL)` e aparecem somente-leitura para o inspetor (detalhe no PWA) e a operação (detalhe no web). **Sem** status de chamado, respostas ou SLA. Escrever isso explicitamente na C. |
| **Q8** | 01.1 | "Calculada por **inteligência artificial**". O repo não tem SDK de LLM e nenhum critério de aceite exige um. O orçamento atribuiu R$ 7 mil de "IA" à roteirização. | Otimizador determinístico: Matrix do Mapbox → melhor ordem exata respeitando janelas. É ótimo para ≤ 8 paradas; heurística + 2-opt acima disso. Confirmar com o comercial que "IA" = otimização. Se foi prometido LLM, é outro item e adiciona custo recorrente. |
| **Q9** | 00.A2, 01.A1 | **"Publicação do dia"** é usada como gatilho, mas esse conceito não existe na plataforma. | Definir: o plano do dia D+1 é **publicado automaticamente após o job de corte T-1** (`appointment.reject-unconfirmed`, 19:00 no horário da agência). É quando o conjunto do dia fica definitivo. A OP pode republicar manualmente. A publicação dispara push/SMS (00.A2). |
| **Q10** | 03.2 | A frase está truncada: "gera alerta para agendamentos marcados fora de horário e não geram alertas para os inquilinos". O 03.A2 diz "bloqueado **ou** sinalizado". | Ler como: (a) check-in fora do raio → **sinalizar** + alerta à operação; (b) check-in fora da janela acordada → sinalizar para a operação, **nunca** notificar o inquilino. Modo configurável SINALIZAR/BLOQUEAR, **padrão SINALIZAR**. BLOQUEAR é inseguro quando o imóvel não tem coordenadas (`geocoding_status` ≠ OK) ou a precisão do GPS é ruim — nesses casos precisa cair para SINALIZAR. |
| **Q11** | 03.1 | "Chegada, saída e fechamento" são 3 eventos, mas o glossário define check-in/checkout = início/fim (2 eventos). O finish já faz `SCHEDULED → DONE` na mesma transação (`finish-inspection.use-case.ts:98-112`). | Manter **2 ações do inspetor**. "Fechamento" = a transição para DONE que já acontece na mesma transação. Um toque separado de "chegada" adiciona atrito para prestadores autônomos e contraria o objetivo do índice. |
| **Q12** | 03.7, 03.13 | **Bônus em dinheiro**: um `MANUAL_ADJUSTMENT` exige `tenantId` e **não aparece na fatura do inspetor**. As faturas só pegam linhas `INSPECTOR_PAYOUT` com `appointment_id` (`prisma-financial-entry.repository.ts:339,383-395`). O anexo exclui integração com folha/repasse ("o painel apura e aprova; o pagamento segue o processo atual"). | Mínimo: um `RewardAward` com PENDENTE → APROVADO → PAGO_MANUALMENTE, aprovado no painel financeiro de metas (sem autoaprovação, reusando `assertNotSelfApproval`). **Não** é lançamento no ledger. Levar bônus para a fatura vai para o estacionamento (seção 9). |
| **Q13** | 03.7 | **Prioridade de oferta** como benefício. As ofertas são ordenadas por `scheduled_date` para todos, e quem aceita primeiro leva (`prisma-service-group.repository.ts:634-700`, `accept-offer.use-case.ts:98`). A configuração de agência **`priorityOfferHours` (padrão 24) existe mas nada a consome** (`packages/shared/src/schemas/tenant.ts:50`). | Implementar como **janela de acesso antecipado**: um grupo recém-publicado fica visível só para inspetores de nível ≥ X por H horas, depois para todos. Aplicar a mesma checagem no SQL da listagem e no `accept-offer`. Decidir se H é de plataforma (recomendado — o nível é cross-tenant) ou o `priorityOfferHours` por agência que está dormente. |
| **Q14** | 01.A3, 01.1 | **Todo appointment tem janela** (`time_slot_start/end` são NOT NULL, `schema.prisma:546-548`) e os inquilinos recebem essa janela nos avisos. "Horário travado" não tem campo. O melhor proxy é `rental_tenant_confirmation_status = CONFIRMED` (mais os tipos de serviço que não exigem confirmação). | Todas as janelas são **restrições rígidas** para a ordenação, então o otimizador nunca promete um horário fora do que foi informado ao inquilino. "Travado" (CONFIRMED) serve só para a exceção do 01.A3 e para o indicador do 01.13. O otimizador **sugere** e nunca altera uma janela (o orçamento diz o mesmo). |
| **Q15** | E.1, E.A1 | "Exibir só inspeções de hoje a +14 dias" esconde os **atrasados** (data passada, não DONE) que a operação reagrupa no mapa. Também não está claro se é padrão ou limite rígido ("não exibe"). | **Janela padrão** que o usuário pode ampliar explicitamente (chip "Próximos 14 dias ✕"). Limite rígido só para perfis CL, se o cliente insistir. Quando AM/OP veem várias agências ao mesmo tempo, aplicar no servidor a janela da agência de cada linha. |
| **Q16** | 00.9, 00.A2 | Push no iOS só funciona em PWA **instalado** no 16.4+. Push é grátis; o fallback SMS é pago por mensagem (§7). "Crítico" não está definido. | Definir crítico = {plano do dia publicado/alterado, confirmação de liberação, lembrete de conclusão}. O resto vai só para a caixa de avisos. Mostrar o volume projetado de SMS no relatório de custos da homologação (o §7 já exige). |
| **Q17** | telas da 01 | "Configuração de limites de alerta **por inspetor**", enquanto as premissas falam em "limites de alerta" globais. | Padrão de plataforma (B6) + coluna opcional de override por inspetor. A tela de override é uma seção pequena no drawer de inspetor existente, não uma página nova. |
| **Q18** | 03.10/03.11 | A visibilidade dos rankings para **agências** não é mencionada. Inspetores são cross-tenant, e os relatórios das agências já escondem e-mails de inspetores (`prisma-report-data-reader.ts:84-85`). | Ranking completo = **só AM/OP** (mesmo precedente do `/inspector-workload`). Agências não veem nada novo da 03. Deixar explícito na spec. |

---

## 4. Análise item a item

### 4.1 Entrega 00 — Evolução do aplicativo do inspetor

**PWA atual:** Vite + `vite-plugin-pwa` (manifest inline em `apps/pwa/vite.config.ts`, `start_url: /schedule`). Rotas: `/schedule` (home), `/marketplace`, `/earnings`, `/profile` e `/execution/:id`. A barra inferior tem 4 abas (`components/shell/BottomNavBar.tsx`). Autenticação só para INSP (`InspectorAuthGuard`).

| Código | Requisito | Hoje (evidência) | Veredito | Implementação mínima | Tam. |
|---|---|---|---|---|---|
| 00.1 | Ajustes de UX/navegação na tela inicial | ✅ `SchedulePage` é a home: cabeçalho com contagem, banners de instalação, faixa de dias, lista | **REDUZIR → FUNDIR com 00.5** | O "ajuste" *é* tornar a Tela do Dia a home. Rota índice → Tela do Dia; Agenda vira a segunda aba. Sem item separado de redesenho. | P |
| 00.2 | Onboarding de instalação iOS/Android + indicador de adoção por inspetor | 🟡 `useInstallPrompt.tsx` (`beforeinstallprompt`, detecção de standalone, detecção de iOS Safari), `InstallBannerIos/Native`, `InstallAppCard`. **Nada é enviado ao servidor.** | **MANTER (pequeno)** | Transformar os banners num guia de 3 passos (iOS: compartilhar → adicionar; Android: prompt ou instrução manual). Enviar `display_mode` + `push_permission` ao abrir o app → alimenta o 00.10. | P |
| 00.3 | Perfil com dados cadastrais + preferências de notificação | 🟡 `ProfilePage`, `ProfileEditPage` (telefone, fuso). `PATCH /v1/inspectors/me` aceita phone/fullName/paymentSettings. Sem preferências do inspetor (`NotificationConsent` exige `tenant_id`, não serve). | **REDUZIR** | Adicionar endereço-base (B1) e um bloco de preferências. Preferências mínimas = **push sim/não + fallback SMS sim/não para não críticos**. Críticos sempre passam. Guardar em `Inspector.notification_prefs_json`. | P |
| 00.4 | Endereço-base, editável pelo inspetor e pela operação | 🟡 coluna existe, sem uso, sem coordenadas | **MANTER** (B1) | Endereço estruturado + geocodificação no `InspectorFormDrawer` (web) e na edição de perfil do PWA. As duas edições são auditadas (auditoria existente dos `update-inspector*`). | M |
| 00.5 | Tela do Dia: roteiro + eventos de campo + avisos da operação | 🟡 a Agenda abre em hoje no fuso do inspetor e tem blocos de atrasados/travados | **MANTER (FUNDIR 00.1 e lista de rota da 01)** | Uma tela: faixa de progresso → lista ordenada de paradas (B4) → card de avisos não lidos (B2). Eventos de campo aparecem inline em cada parada. | M |
| 00.6 | Central de avisos com marcação de leitura + visão "quem leu" | ❌ | **MANTER** (B2) | Web (AM/OP): escrever aviso → público (todos / inspetores selecionados / região) → marcação de crítico. PWA: caixa de avisos + badge. Lido = aberto. A lista web mostra lidos X/Y com nomes. | M |
| 00.7 | Botões de check-in/checkout/cancelamento na agenda | 🟡 início/fim existem só na página de detalhe (`StartInspectionButton`, `ExecutionPage`). A visão web da operação **não** mostra dados da execução (só o `AuditTimeline`). | **REDUZIR + ESCLARECER (Q1)** | Ação principal em cada card de parada, reusando os fluxos existentes de início/fim (geo + fila offline + travas). "Cancelar" = **pedido de liberação** (Q1). A3 "refletido na visão da operação": adicionar um bloco de execução (iniciou/finalizou/distância/sinalizações) no detalhe do appointment no web + o painel ao vivo (01.8). | M |
| 00.8 | Aviso de atraso com motivo selecionável | ❌ | **FUNDIR com 03.3** | Uma ação "Vou atrasar" → motivo (lista) + minutos estimados opcionais → evento de campo (B3) → a operação vê no painel ao vivo. Pode também disparar o 01.12 para o inquilino. O efeito no índice é especificado na 03. | P |
| 00.9 | Push + fallback automático por SMS em avisos críticos | ❌ push | **MANTER** (B2, Q16) | Web Push (VAPID) com assinatura por dispositivo. Aviso crítico → push se houver assinatura ativa, senão SMS (também SMS se o envio do push falhar com 404/410). Sem perseguir recibo de entrega. | M |
| 00.10 | Painel de adoção: instalações, push habilitado, último acesso | 🟡 `User.last_login_at` e `Session.last_used_at` existem e não são mostrados para inspetores | **MANTER (pequeno)** | Uma tabela na área de Inspetores do web (não um dashboard novo): instalado ✓, push ✓, último acesso, versão do app. Dados vêm do heartbeat do 00.2. | P |

**Revisão dos critérios de aceite**
- **00.A1:** OK.
- **00.A2:** depende do Q9 (definir "publicação").
- **00.A3:** "check-in, checkout **e cancelamento** gravam evento" → com o Q1 vira evento de pedido de liberação.
- **00.A4:** OK.
- **00.A5:** OK (B1 → 01.2).

**Não muda:** telas de ofertas/marketplace e seções do detalhe do serviço (excluídas explicitamente), auth/2FA/sessões, área de ganhos.

### 4.2 Entrega 01 — Roteiro, mapa do dia e acompanhamento em tempo real

**Estado atual:**
- A geocodificação usa só o Mapbox v5 (`property/infrastructure/mapbox-geocoding.service.ts`). Não há chamadas a Directions/Matrix/Optimization.
- Horários: `scheduled_date @db.Date` (data civil) + `time_slot_*` como `HH:mm` puro. Converter para instante com `zonedWallTimeToUtc` (`packages/shared/src/utils/timezone-date.ts:43`). A plataforma é só Sydney (`PLATFORM_TIMEZONE`).
- Não há WebSocket/SSE em lugar nenhum; polling com react-query é o padrão.

| Código | Requisito | Hoje (evidência) | Veredito | Implementação mínima | Tam. |
|---|---|---|---|---|---|
| 01.1 | Cálculo da rota por IA (distância, deslocamento, duração, janela do inquilino) | ❌ | **REDUZIR (Q8, Q14)** | Porta `IRoutingService` (mesmo padrão do `IGeocodingService` + stub) com adaptador da Matrix do Mapbox. Otimizador: busca exata por permutação ≤ 8 paradas; vizinho viável mais próximo + 2-opt acima. Respeita janelas (rígidas) e durações do B5. Persistido no B4. | G |
| 01.2 | Primeiro serviço pelo endereço-base mais próximo | 🟡 só o dado (B1) | **MANTER** (parte do 01.1) | Origem = coordenadas da base. Restrição do 01.A3: salvo quando uma janela CONFIRMED força outra primeira parada. | — |
| 01.3 | Reordenar arrastando + recálculo imediato + impacto no total | ❌ sem lib de DnD nos dois apps | **MANTER** | Reordenação no PWA (DnD por toque, ex. `@dnd-kit` — primeira dependência de DnD no repo; precisa de alternativa acessível "subir/descer"). Recalcular os tempos **localmente a partir da matriz em cache** (sem chamada de API). Uma chamada de Directions só para redesenhar o traçado. Mostrar "+12 min vs sugerido". Avisar se alguma janela for violada. | M |
| 01.4 | Mapa do roteiro com pontos numerados + traçado | 🟡 o PWA tem mapbox só no `OffersMapView`. O `MapMarker` do web já aceita `label`. | **MANTER** | Aba de mapa na Tela do Dia do PWA: markers numerados + LineString GeoJSON vindo do Directions. Reusar `apps/pwa/src/lib/map-bounds.ts`. Armadilha: nunca setar `style.transform` na raiz do marker (memória `project_map_screen`). | M |
| 01.5 | Cartão de parada: endereço, janela, instruções de acesso, contato, escopo | 🟡 o detalhe do PWA já mostra local da chave/encontro, endereço, contatos, apps, restrições, detalhes do serviço (`AppointmentDetailPage.tsx`) | **REAPROVEITAR** | Card compacto = endereço + janela + horário previsto + local da chave/encontro + botão de ligar para o contato principal. Toque → detalhe existente. **Sem campo novo de "instruções de acesso"** — `key_location`/`meeting_location`/`Property.notes` já cobrem. | P |
| 01.6 | Navegação em um toque abrindo o app de mapas | ✅ link do Google Maps (`PropertyAddressSection.tsx:33-35`) | **REAPROVEITAR (+mínimo)** | Usar `maps.apple.com` no iOS e Google nos demais. Mesmo botão no card da parada. | P |
| 01.7 | Folha de trabalho do dia em PDF + Excel | 🟡 `exceljs` (`IXlsxGenerator`), `pdfkit` (gerador do PDF de fatura) | **MANTER** | Um use case `export-day-sheet(inspectorId, date, format)` reusando os dois geradores. Colunas = nº da parada, janela, horário previsto, endereço, serviço, contato, info da chave. Disponível para o inspetor (PWA) e AM/OP (web). Síncrono — é um dia só. | P |
| 01.8 | Painel da operação: estado do inspetor (no imóvel / em deslocamento) | ❌ (só o `/inspector-workload` semanal e o alerta de travado de 6 h) | **REDUZIR (Q3) → tela "Dia ao Vivo"** | Uma tela web (AM/OP): mapa com os inspetores no **último ponto de evento conhecido** (geo do último início/fim, senão a base) com badge de estado derivado. Atualização por polling (30–60 s). Esta *é* a "Mapa de Estados dos Inspetores" do anexo. | M |
| 01.9 | Barra de progresso por inspetor (concluídos/restantes/atraso acumulado) | ❌ (calculável: índice `[scheduled_date, inspector_id]`) | **FUNDIR no 01.8** | Lista lateral da tela Dia ao Vivo: uma linha por inspetor com barra de progresso e atraso = início real − horário previsto (última parada). É o "Painel de Andamento do Dia" do anexo — mesma tela, visão em lista. | P |
| 01.10 | Ao encerrar uma parada, alertar o inquilino da próxima | ❌ (único subscriber de DONE = convite da pesquisa) | **MANTER (parte do módulo de avisos)** | Subscriber no finish → próxima parada do plano → "o inspetor está a caminho, previsão hh:mm" (SMS ou e-mail conforme o roteamento de templates existente). Novo código de template (~6–8 lugares de registro, ver memória `project_notification_template_registration`). Precisa respeitar o switch da agência `rentalTenantNotificationsEnabled` e o consentimento. | M |
| 01.11 | Visão por exceção (só quem exige atenção) | ❌ | **FUNDIR no 01.8** | Filtro "Exige atenção" no Dia ao Vivo: atraso > limite, aviso de atraso, pedido de liberação, sinalização de geofence, não iniciado no horário previsto + X. Sem tela separada. | P |
| 01.12 | Aviso automático ao próximo inquilino por atraso projetado + duração padrão editável | ❌ | **MANTER** (B5) | Atraso projetado = horário previsto recalculado vs fim da janela. Se passar do limite, envia um aviso por parada por dia (dedupe). Disparado por eventos (finish, aviso de atraso) e por uma varredura horária — sem rastreamento. O campo de duração fica no cadastro de Tipos de Serviço. | M |
| 01.12-B | Aviso matinal de previsão de chegada por geolocalização | ❌ | **REDUZIR (Q3, Q4)** | Tick diário no horário da agência (`TenantCronTick`, como os lembretes) às ex. 07:00 → o inquilino recebe a faixa de horário previsto. Planejado, não por GPS. | P |
| 01.13 | % de serviços com horário travado, por região e por agência | 🟡 `confirmationRate` do analytics (escopo só por agência); regiões têm polígonos PostGIS | **REDUZIR** | Adicionar uma tabela de quebra no `/analytics` (AM/OP: por agência; região via `ST_Intersects(region.geom, property.coordinates)`). "Travado" conforme Q14. Sem tela nova. | P |
| 01.14 | Calibragem dos pesos da rota em sessão conjunta | ❌ | **REDUZIR** | 2–3 pesos no B6 (ex. tempo de deslocamento vs folga da janela vs proximidade da base) + "pré-visualizar recálculo" num dia de um inspetor. A sessão em si é serviço, não funcionalidade. | P |
| tela | Limites de alerta por inspetor (web) | ❌ (os limites de carga são constantes) | **REDUZIR (Q17)** | Padrão de plataforma + override no drawer do inspetor. | P |

**Revisão dos critérios de aceite**
- **01.A1:** depende do Q9.
- **01.A3:** depende do Q14.
- **01.A4:** testável com estados derivados (Q3).
- **01.A5:** "cada tipo de alerta de andamento dispara conforme o limite" — a spec precisa enumerar os tipos: atraso, não iniciado, aviso de atraso, liberação, geofence.
- **01.A2, 01.A6, 01.A7:** OK.

**Custo recorrente (§7):** Matrix (1 por cálculo/recálculo do plano), Directions (1 por plano + 1 por reordenação manual), carregamentos de mapa no PWA e no web. Com 3–4 paradas/dia por inspetor é baixo, mas precisa ser medido na homologação como o §7 exige.

### 4.3 Entrega 03 — Registro em tempo real, metas e ranking

| Código | Requisito | Hoje (evidência) | Veredito | Implementação mínima | Tam. |
|---|---|---|---|---|---|
| 03.1 | Evoluir registros de chegada/saída/fechamento | 🟡 início/fim + geo + distância + auditorias | **REDUZIR (Q11)** | Enviar `accuracy_m` + `client_occurred_at` (já capturados em `useGeolocation.ts:38`). Calcular a distância também no **finish**. Sem 3º evento. | P |
| 03.2 | Geofence no início com raio configurável; fora de horário sinalizado, sem alerta ao inquilino | 🟡 haversine existe. Limites fixos no código e **inconsistentes**: backend 500 m (`geolocation-distance.service.ts:26`), PWA 200 m (`GeoLocationCapture.tsx:7`). | **MANTER (Q10)** | Um raio configurável (B6), servido ao PWA para os dois lados concordarem. Modo SINALIZAR/BLOQUEAR (padrão SINALIZAR; cai automaticamente para SINALIZAR sem coordenadas ou com precisão > raio). Persistir as flags `out_of_radius` / `out_of_window` na execução. Flags → lista de exceção do Dia ao Vivo. | M |
| 03.3 | Aviso de atraso afeta o índice | ❌ | **FUNDIR com 00.8** | O índice conta avisos de atraso **antecipados** (dados antes do horário previsto) como positivos frente ao atraso silencioso. Pedidos de liberação tardios (Q1) contam negativamente. | — |
| 03.4 | Índice de Confiabilidade, ≤ 8 métricas, pesos configuráveis | ❌ (insumos existem: nota da pesquisa, métricas do relatório PERFORMANCE, execuções) | **MANTER** | Job noturno → `InspectorReliabilitySnapshot(período)`. Métricas propostas, todas de dados existentes ou do B3: 1) início pontual vs janela/previsto · 2) conformidade de geofence · 3) conclusão na mesma visita (sem travamento) · 4) nota de satisfação · 5) proporção de avisos de atraso antecipados · 6) liberações tardias · 7) volume de aceites vs ofertas da região · 8) incidentes de DONE→REJECTED/reabertura. Pesos no B6. Recalcula ao mudar a config (03.A1). | G |
| 03.5 | Normalizar por distância, dificuldade, tipo de serviço | 🟡 tipo de serviço sim. Sem dificuldade, sem distância de deslocamento armazenada. | **REDUZIR** | Normalizar por tipo de serviço (+ `ServiceType.difficulty_weight` opcional) e pelo tempo de deslocamento planejado do B4. Não inventar um modelo de dificuldade do imóvel. | P |
| 03.6 | Metas por período, região, tipo de serviço por inspetor | ❌ (dimensões existem: `ServiceRegion`, `InspectorRegion`, períodos de faturamento) | **MANTER** | `Goal(período, métrica, alvo, escopo: todos/região/tipo de serviço/inspetor)`. Métrica = quantidade de DONE ou índice ≥ X. CRUD no web (AM/OP). | M |
| 03.7 | Benefícios: bônus em dinheiro, prioridade de oferta | 🟡 aprovação no ledger existe. Prioridade ❌, mas `priorityOfferHours` está dormente. | **REDUZIR (Q12, Q13)** | Tipos de benefício = DINHEIRO (RewardAward, pagamento manual) e PRIORIDADE_DE_OFERTA (janela de acesso antecipado por nível). | M |
| 03.8 | Regras: participantes, o que conta, fechamento, desempate | 🟡 padrão de fechamento de período (`billing-period.service.ts`) | **REDUZIR** | Regras = campos do programa/meta: participantes (inspetores ativos no escopo), métrica de contagem, fim do período, desempate (índice, depois quem atingiu primeiro). Sem motor de regras. | P |
| 03.9 | Níveis com benefícios progressivos + sequência | ❌ | **REDUZIR** | Níveis = faixas do índice (ex. 3 níveis) com benefícios associados. Sequência = períodos fechados consecutivos com meta atingida. Ambos derivados — sem tabelas novas além da config. | P |
| 03.10 | Ranking anônimo no app | ❌ | **MANTER** | PWA: posição própria + lista de pontuações sem nomes/ids (03.A3). Nível plataforma, por período. | P |
| 03.11 | Ranking completo com nomes (operação) | ❌ | **MANTER** | Tabela web AM/OP (Q18). Mesma consulta do 03.10. | P |
| 03.12 | Painel de confiabilidade (operação) | ❌ | **FUNDIR com 03.11** | Uma página "Desempenho dos Inspetores": tabela de ranking + drawer com a quebra das métricas por inspetor. Evita duas telas quase idênticas. | P |
| 03.13 | Painel financeiro de metas — prometido vs atingido, com aprovação | ❌ (padrão de aprovação existe) | **MANTER** | Por período: prometido (soma dos benefícios em dinheiro das metas ativas) vs atingido (prêmios gerados) → aprovar / marcar pago. Sem autoaprovação. | M |
| 03.14 | Trilha de auditoria + exportação completa do programa | ✅ AuditService + pipeline de relatórios (XLSX, assíncrono) | **REAPROVEITAR** | Auditar toda alteração de meta/peso/benefício/prêmio (03.A5). Exportação = novo `ReportType` (ex. `INSPECTOR_PROGRAM`) no fluxo de relatórios existente. Armadilha: o enum vive em vários lugares (ver memória `project_satisfaction_survey_module`). | P |
| 03.15 | Telas do inspetor: desafios, meus resultados, meu índice/nível, recompensas | ❌ (padrão: ganhos) | **REDUZIR** | **Uma** aba "Desempenho" no PWA com 3 seções: meu índice + nível + sequência · metas ativas com progresso · histórico de recompensas. Ela abriga o ranking do 03.10. Posição (5ª aba da barra inferior vs seção dentro do Perfil) é decisão de UX da spec; a barra não pode passar de 5 abas. | M |
| 03.16 | Lembrete automático de conclusão não registrada | 🟡 o worker de travados manda e-mail para **OP/AM** após 6 h (`notify-stuck.worker.ts`, com o nome enganoso `notify-not-started`). SCHEDULED com data passada sem início: nada. | **MANTER (pequeno)** | Reusar o worker: o inspetor recebe push/SMS crítico (B2) em horário previsto + duração + X. A operação continua recebendo o alerta existente. | P |
| 03.17 | Mensagens automáticas de desempenho no app | ❌ | **REDUZIR → B2** | Avisos de autoria do sistema na caixa de avisos em 3 gatilhos: subiu/desceu de nível, meta atingida, sequência em risco. Texto fixo (um idioma, conforme premissas). | P |

**Revisão dos critérios de aceite**
- **03.A1–03.A5:** OK e testáveis.
- **03.A4:** fala em "painel de rewards" — mapear para o 03.13.

**Não-objetivos já explícitos no anexo:** valores das recompensas, folha de pagamento, tributação, identidades no ranking do app. Acrescentar **visibilidade para agências** como não-objetivo (Q18).

### 4.4 Entrega D — Mapa de densidade de inspetores

| Código | Requisito | Hoje (evidência) | Veredito | Implementação mínima | Tam. |
|---|---|---|---|---|---|
| D.1 | Camada de densidade sobre os eventos de execução | 🟡 a camada `RegionHeatmap` existe (`features/analytics/components/RegionHeatmap.tsx:53-72`), mas usa centroides de bairro dos imóveis. A geo da execução é armazenada mas não exposta. `InspectionExecution` **não tem `tenant_id`**. | **MANTER** | `GET /v1/map/execution-density` (período, tenantId, inspectorId) fazendo join execuções → appointments para o escopo. Retorna pontos (geo do início). Camada de calor liga/desliga no `/map`, reusando `HEATMAP_RAMP`. | M |
| D.2 | Recorte por período | ✅ o `/map` já envia `fromDate`/`toDate` | **REAPROVEITAR** | A camada segue o filtro de datas existente. | — |
| D.3 | Filtro por agência e inspetor | ✅ AM/OP (PR #948) | **REAPROVEITAR** | Mesmos filtros. Usuários de agência só têm o próprio tenant. | — |
| D.4 | Mesmo mapa da 01 | — | **ESCLARECER (Q6)** | Entregar no `/map`. Opcionalmente o mesmo toggle no Dia ao Vivo. | — |
| D.A3 | Isolamento entre agências | ✅ o `/map` usa `resolveAppointmentListTenantScope` → `requireTenantScope` | **REAPROVEITAR** | O endpoint novo precisa usar o mesmo resolver. Inspetores são cross-tenant, então a agência vê só as execuções **dos próprios appointments**. | — |

### 4.5 Entrega E — Recorte de período no mapa

| Código | Requisito | Hoje (evidência) | Veredito | Implementação mínima | Tam. |
|---|---|---|---|---|---|
| E.1 | Exibir só inspeções de hoje a +14 dias | ❌ os padrões são vazios (`AppointmentMapFilterPanel.tsx:44-59,73`). Sem padrão no backend. | **MANTER (Q15)** | Janela padrão hoje → hoje+N nos dois modos do mapa. Limite no servidor para perfis CL (um padrão só no front pode ser burlado). Chip removível para AM/OP. | P |
| E.2 | Configuração por agência, auditada | 🟡 o padrão `settings_json` + auditoria `tenant.updated` existem. O `TenantFormDrawer` expõe quase nenhuma configuração. | **MANTER** | `mapWindowDays` (padrão 14) no `tenantSettingsSchema`. Editado pelo AM (e pelo CL_ADMIN se entrar na `CL_ADMIN_SETTINGS_ALLOW_LIST` — decidir). A auditoria vem de graça. | P |

**Pode sair primeiro** — sem dependência da 01 (Q6).

### 4.6 Entrega C — Armazenamento de mídias

| Código | Requisito | Hoje (evidência) | Veredito | Implementação mínima | Tam. |
|---|---|---|---|---|---|
| C.1 | Upload vinculado ao appointment, ao imóvel ou a ambos | ❌ modelo. 🟡 porta de storage + presign/confirm | **MANTER** (B7) | `Attachment(tenant_id, appointment_id?, property_id?, file_name, mime, size, storage_key, version_group_id, version, uploaded_by, source, deleted_at)`. Presign → upload direto ao S3 → confirm (rechecagem de tamanho/mime via `headObject`). Bucket privado `inspection-assets`. Quando enviado a partir de um appointment, vincular também o imóvel (C.A1). | M |
| C.2 | Formatos aceitos + limite de tamanho, configuráveis | ❌ (constantes por fluxo) | **MANTER** | Config de plataforma (B6): lista de mimes permitidos + tamanho máximo em MB. Validar no presign (declarado) e no confirm (tamanho real + magic bytes via `file-type`). Mensagem clara (C.A5). Override por agência não é necessário para o aceite. | P |
| C.3 | Acesso por agência e perfil, com isolamento | 🟡 padrões de escopo por tenant. ⚠️ `get-property.use-case.ts:46-71` prende a **OP** ao próprio tenant, inconsistente com a CORRECTION-001. | **MANTER** | Matriz: AM/OP tudo · CL_ADMIN/CL_USER próprio tenant · INSP somente leitura nos appointments atribuídos a ele · TNT envia/lê só os próprios uploads do portal. URLs de download assinadas (TTL 5 min, como nos documentos do inspetor). | P |
| C.4 | Visualização/download | ❌ | **MANTER** | Pré-visualização de imagem (URL assinada no `<img>`), PDF abre em nova aba (download é exceção permitida de `_blank`), demais baixam. | P |
| C.5 | Organização por serviço/imóvel, listagem + busca por nome | ❌ | **REDUZIR** | Aba "Arquivos" no detalhe do appointment e no detalhe do imóvel. A aba do imóvel lista também os arquivos dos appointments dele (agrupados). Campo de filtro por nome (`FilterInput`). Sem pastas. | P |
| C.6 | Versionamento | ❌ | **REDUZIR** | Ação explícita **"Enviar nova versão"** num arquivo → mesmo `version_group_id`, versão+1. A lista mostra a última versão, com drawer de histórico listando todas as versões para download (C.A3). Enviar um arquivo com o mesmo nome **não** versiona automaticamente — regra implícita surpreende o usuário. | P |
| C.7 | Auditoria: autor, data, versão em envio/substituição/exclusão | ✅ AuditService | **REAPROVEITAR** | `attachment.uploaded` / `.version_added` / `.deleted` com metadata `{version, fileName}`. | P |
| C.8 | Política de retenção configurável | 🟡 worker de retenção de auditoria + padrão de legal hold | **REDUZIR** | Configuração de plataforma `attachmentRetentionDays` (null = manter para sempre). Job diário: arquivos com soft-delete mais antigos que X são apagados do storage, e arquivos além da retenção são expurgados (com linha de auditoria). Sem retenção por categoria. | P |
| C.9 | Contagem de arquivos na ficha do serviço e do imóvel | ❌ | **MANTER** | Rótulo da aba "Arquivos (n)" via `TabsNav`. Contagem retornada junto com o payload do detalhe. | P |
| C-extra | "Issues" do inquilino com fotos, visíveis ao inspetor e à operação | ❌ (só `rental_tenant_note`, mostrado à operação, **não** ao inspetor) | **REDUZIR (Q7)** | Portal: "Informar algo sobre o imóvel" → nota (≤ 500 caracteres) + até 5 fotos. Presign/confirm escopado pelo token, com rate limit, só imagens. Exibido no detalhe do appointment no PWA e numa seção do detalhe no web. Sem status/respostas. | M |

**Critérios de aceite:** C.A1–C.A5 são todos testáveis com a leitura mínima.

---

## 5. Mapa de fusões (mesma feature escrita mais de uma vez)

| Feature construída uma vez | Códigos do anexo que ela atende |
|---|---|
| Tela do Dia (home do PWA) | 00.1, 00.5, "Roteiro do Dia" da 01, "Agenda alterada" da 01 |
| Card da parada + ações de início/fim/liberação | 00.7, 01.5, 01.6, 03.1 |
| Aviso de atraso | 00.8, 03.3 (+ gatilho do 01.12) |
| Caixa de avisos do inspetor + push + fallback SMS | 00.6, 00.9, 03.16, 03.17, publicação do plano do dia (00.A2) |
| Heartbeat de instalação + tabela de adoção | 00.2 (indicador), 00.10 |
| Dia ao Vivo (web): mapa de estados + lista de progresso + filtro "exige atenção" | 01.8, 01.9, 01.11, "rotas em tempo real" do cabeçalho da D |
| Módulo de avisos de horário ao inquilino (1 módulo, 3 gatilhos) | 01.10, 01.12, 01.12-B |
| Desempenho dos Inspetores (web): ranking + quebra do índice | 03.11, 03.12 |
| Aba Desempenho (PWA): índice/nível/sequência + metas + recompensas + ranking anônimo | 03.9 (exibição), 03.10, 03.15 |
| Configuração do programa (plataforma) | 01.14, raio do 03.2, pesos do 03.4, limites de alerta, C.2, C.8 |

---

## 6. RBAC e multi-tenant das superfícies novas

| Superfície | AM | OP | CL_ADMIN | CL_USER | INSP | TNT |
|---|---|---|---|---|---|---|
| Publicar avisos / ver leituras | ✓ | ✓ | – | – | lê os próprios | – |
| Editar endereço-base do inspetor | ✓ | ✓ | – | – | o próprio | – |
| Ver / reordenar / exportar plano do dia | ✓ (ver, exportar, republicar) | ✓ | – | – | o próprio | – |
| Tela Dia ao Vivo | ✓ | ✓ | – | – | – | – |
| Configuração do programa (pesos, raio, limites, pesos da rota, limites de mídia, retenção) | ✓ | ✓ (decidir) | – | – | – | – |
| Metas, benefícios, aprovação de prêmios, ranking completo, desempenho | ✓ | ✓ | – | – | ranking anônimo + dados próprios | – |
| Camada de densidade no `/map` | ✓ todas | ✓ todas | próprio tenant | próprio tenant | – | – |
| Configuração da janela do mapa (E.2) | ✓ | ? | ? (decisão da allow-list) | – | – | – |
| Anexos | ✓ | ✓ | próprio tenant | próprio tenant | leitura nos atribuídos | próprios uploads do portal |

- **Entidades de plataforma (sem `tenant_id`):** `DayPlan`, `InspectorNotice`, snapshots de confiabilidade, metas, prêmios, `PlatformSetting`. Seguem o precedente de `Inspector` e precisam de nota explícita em cada spec frente ao §7.1 do CLAUDE.md.
- **Escopadas por tenant:** `Attachment`, a configuração da E.2 e o endpoint de densidade (via join).
- A regra de RBAC de transições vive em 5 lugares (memória `project_appointment_transition_rbac_multisource`). A recomendação do Q1 evita mexer nela.

---

## 7. Fatias de spec recomendadas (insumos para o `speckit.specify`)

Ordenadas por dependência. Cada fatia deve ficar abaixo do limite de 150 arquivos por PR, empilhando backend → shared → web/PWA quando necessário. As specs serão escritas em inglês.

| # | Spec | Códigos | Depende de |
|---|---|---|---|
| S0 | **Janela de período do mapa** (ganho rápido) | E.1, E.2 | – |
| S1 | **Fundações do inspetor**: endereço-base + geocodificação, preferências no perfil, onboarding de instalação + heartbeat, tabela de adoção | 00.2, 00.3, 00.4, 00.10 | – |
| S2 | **Caixa de avisos do inspetor + Web Push + fallback SMS** | 00.6, 00.9 | S1 (preferências) |
| S3 | **Eventos de campo**: ações na parada, pedido de liberação, aviso de atraso, precisão/horário do cliente, config de geofence + flags, bloco de execução no detalhe web, lembrete de conclusão | 00.7, 00.8, 03.1, 03.2, 03.3 (evento), 03.16 | S2 |
| S4 | **Plano do dia e roteirização**: duração do serviço, porta de roteirização + Matrix/Directions, otimizador, publicação após o T-1, Tela do Dia, mapa do roteiro, reordenação, exportação da folha, pesos da rota | 00.1, 00.5, 01.1–01.7, 01.14 | S1, S3 |
| S5 | **Dia ao Vivo (operação)** + limites de alerta | 01.8, 01.9, 01.11 | S3, S4 |
| S6 | **Avisos de horário ao inquilino** | 01.10, 01.12, 01.12-B | S4 |
| S7 | **Índice de confiabilidade** + página Desempenho dos Inspetores | 03.4, 03.5, 03.11, 03.12 | S3, S4 |
| S8 | **Programa de metas e recompensas** + aba Desempenho no PWA + mensagens automáticas + exportação | 03.6–03.10, 03.13–03.15, 03.17 | S7, S2 |
| S9 | **Camada de densidade** + indicador de horário travado | D.1–D.4, 01.13 | S3 |
| S10 | **Anexos** + fotos de issues do inquilino | C.1–C.9, C-extra | – (em paralelo) |

---

## 8. Decisões necessárias (cliente / sessão de onboarding)

**Redação do escopo (antes de assinar):** Q1, Q2, Q3, Q4, Q5, Q7, Q8.

**Regras de produto:** Q9 momento da publicação, Q10 modo do geofence, Q11 eventos, Q12 tratamento do bônus, Q13 janela de prioridade (plataforma vs agência), Q14 janelas rígidas, Q15 janela padrão vs limite, Q16 conjunto de críticos, Q17 limites, Q18 visibilidade para agências.

**Valores de onboarding (o §3 do anexo já inclui a sessão):**
- raio do geofence;
- pesos do índice e faixas de nível;
- limites de atraso / não iniciado;
- horário de envio do aviso matinal;
- pesos da rota;
- lista de formatos de mídia, tamanho máximo e dias de retenção;
- durações padrão por tipo de serviço;
- horas de acesso antecipado.

---

## 9. Estacionamento — encontrado na auditoria, FORA deste escopo

Registrado para não se perder. **Não incluir nas specs da Fase 2 sem pedido de mudança.**

1. Bônus nas faturas do inspetor: linhas `MANUAL_ADJUSTMENT` nunca chegam às faturas nem aos ganhos (`prisma-financial-entry.repository.ts:339,383-395`).
2. `ServicePriceRule.bonus_rule_json` é armazenado e copiado no snapshot, mas **nunca avaliado** (`appointment-pricing.service.ts`).
3. `priorityOfferHours` e `inspectorOfferRadiusKm` nas configurações da agência: o primeiro não é usado. Se o Q13 escolher janela de plataforma, avaliar remover a config morta.
4. Inconsistências de OP presa ao tenant frente à CORRECTION-001:
   - `get-property.use-case.ts:46-71`;
   - `AuthorizationService.assertTenantScope` (bypass só para AM);
   - `list-audit-logs.use-case.ts:91`.

   A spec do C.3 precisa decidir o comportamento da OP para arquivos de imóvel.
5. Docs desatualizados descrevendo `InspectionAsset`: `docs/database-schema.md:618-631`, `docs/runbooks/inspection-asset-retention.md`.
6. Nome do worker: `inspection-execution.notify-not-started` na verdade trata "iniciado e não finalizado".
7. `rental_tenant_note` não é exposto ao inspetor (PWA). Pode ser útil no card da parada, mas não foi pedido — só considerar se a exibição do C-extra for construída e incluir for trivial.
8. Exportação da auditoria: não existe exportação de `audit_logs` (o 03.14 só precisa da exportação do programa).
