# Fase 2 / Etapa 1 — Validação Consolidada (Executado × Previsto + PWA × Cliente)

_Gerado em 2026-11-12. Código validado no `develop @ ad446080` (PRs #1310–1363, fase 100% mergeada), em worktree limpo e descartável. Dois eixos de validação independentes, cada um com leitura fresca do código (sem receber conclusões prévias do orquestrador)._

**Método:** dois validadores dedicados.
- **Eixo 1 — Executado × Previsto:** um auditor que fez fan-out em 10 cluster-auditores paralelos; cada um extraiu as promessas das `tarefas/<ID>-tarefas.md` + `spec.md` e localizou o código mergeado (`file:line`).
- **Eixo 2 — PWA × Cliente:** um auditor que leu as 12 páginas de `Properfy Inspector App v3.pdf` (o que o cliente enviou), confrontou com o app entregue (`apps/pwa/`) e classificou cada divergência contra as decisões registradas em `README.md`/`decisoes.md`/`estacionamento.md`.

---

## Veredito executivo

| | Eixo 1 (Executado × Previsto) | Eixo 2 (PWA × Cliente) |
|---|---|---|
| **Resultado** | Fase genuinamente ~100% conforme | App honra a visão v3 do cliente |
| **BUG** | 0 | — |
| **GAP** | 0 | 3 (todos LOW) |
| **DESVIO_MENOR** | 4 (todos LOW, documentação/defesa-em-profundidade) | divergências = decisões registradas |
| **Vazamento multi-tenant** | **0 em 44 tarefas** | n/a |

**Conclusão:** execução de alta fidelidade ao planejado e ao pedido do cliente. O maior risco de drift da fase (F04 Plano A → Plano B, ToS-safe) foi tratado corretamente **no código**; o resíduo é apenas texto de spec imutável e uma linha de log append-only no CLAUDE.md raiz. TDD presente em backend/web/pwa/portal. **Nenhum bloqueador de release.**

---

## Eixo 1 — Executado × Previsto (44 tarefas, specs 034–078)

### Tabela de vereditos

| Tarefa | Spec# | Veredito | Resumo |
|---|---|---|---|
| X01 | 034 | CONFORME | BackButton+useGoBack (history-idx); NAV_ITEMS/filterNavItems; collapseIfSingle |
| X02 | 035 | CONFORME | permanent-mode default; account-error fora do breaker; fix bug MANUAL; sync PostGIS |
| X03 | 036 | CONFORME | harness e2e completo; gate `test-pwa-e2e`; kill switch; porta estrita |
| F00 | 037 | DESVIO_MENOR | janela/RBAC/empty-PATCH/tenant-tz corretos; 2 divergências cosméticas de texto/path |
| X02-2 | 044 | CONFORME | `regeocode-permanent.ts` (dry-run default); `ILegacyRegeocodeRepository`; `LEGACY_PERMANENT_NO_RESULT` |
| F01-1 | 039 | CONFORME | base+app-state cols (sem tenant_id); reuso geocode; heartbeat single-SQL; rate-limit por usuário; corte de campo CL |
| F01-2 | 040 | CONFORME | colunas App/Push/Last-seen; badge+filtro "No base address"; formatação pinada em Sydney |
| F01-3 | 041 | CONFORME | BaseAddressBanner 2 variantes; useAppStateHeartbeat (throttle 6h); `__APP_VERSION__` |
| F09-1 | 049 | CONFORME | agregação in-SQL; célula CENTRO (não média); k-anon por escopo; CL preset-lock + inspectorId→403 |
| F09-2 | 050 | CONFORME | DensityLayer só modo Appointments; descarte defensivo p/ CL; lê `minCellCount` da resposta |
| F02-1 | 042 | CONFORME | 3 tabelas platform-scoped (sem tenant_id); pilha delivery/sweep/cap/auto-archive/push; teste de escopo DB |
| F02-2 | 045 | CONFORME | rotas+sidebar AM/OP; ConfirmDialog crítico teto SMS + janela noturna Sydney |
| F02-3 | 046 | CONFORME | sw.ts injectManifest push/notificationclick/pushsubscriptionchange; inbox+unread+resync |
| F03-1 | 038 | CONFORME | PlatformSetting (sem tenant_id); geofence FLAG/BLOCK; flags exec expand-only; máscara coord CL; save hooks |
| F03-2 | 043 | CONFORME | FieldEvent (tenant_id do appt); cant-do→SYS REJECTED; ETA atraso; field-activity corta coord CL; expectedStatus CAS |
| F03-3 | 047 | CONFORME | card check in/out; sheets CantDo/LateNotice; raio geofence do servidor; limpeza fila permanente |
| F03-4 | 048 | CONFORME | bloco field-activity (corte coord CL); labels AuditTimeline; filtro SYSTEM_ONLY; tela platform-settings |
| F04-1 | 051 | CONFORME | optimizer+ports+Mapbox/stub/Dynamic+rate-limiter (sem tenant_id); default_duration_minutes NOT NULL 5-480 + backfill |
| F04-2 | 052 | DESVIO_MENOR | comportamento conforme; spec.md ainda documenta Plano A (superseded por 072/074) |
| F04-5 | 056 | CONFORME | UI de duração do ServiceType + preview routeWeights |
| F04-2b | 071 | CONFORME | PreviewRouteWeights: 1 Matrix, 2 variantes, nada persistido, AM/OP-only |
| F04-planb (no-cache) | 072 | CONFORME | recompute on-demand; resultados nunca persistidos |
| F04-planb (rm routing-input) | 074 | CONFORME | routingInput removido do contrato; 4 colunas dropadas; purge job removido |
| F04-3 | 053 | CONFORME | Today, nav, Route list, origin, links call/navigate; `/today` nos notice patterns |
| F04-4 | 054 | DESVIO_MENOR | entregue via preview no servidor (Plano B), não o recompute local do texto da spec (superseded por 073) |
| F04-3b | 055 | CONFORME | 8+install tour steps; onboardingCompletedAt; "Show app tour"; Playwright E1–E6 |
| F04-planb (PWA reorder) | 073 | CONFORME | reorder lê preview do servidor; routingInput/optimizer totalmente removidos do PWA |
| F06-1 | 057 | CONFORME | projectStopEta compartilhado; 3 templates TENANT_ETA_*; setting nasce desligado; rota opt-out; flag created |
| F06-2 | 058 | CONFORME | um TenantEtaNotifier idempotente; ordem de guards FR-001; dedupe civil-date agency-tz; sem migration/rota |
| F05-1 | 059 | CONFORME | Live Day cross-tenant AM/OP-only; 7 alertas ordenados; geometria reta (Plano B); alert_overrides_json |
| F05-2 | 060 | CONFORME | tela /live-day (guard AM/OP, poll 30s, camada de rota, alertas) |
| F05-3 | 061 | CONFORME | tab locked-time; config alert-limit plataforma + por-inspetor; deep-link ?open=<uuid> |
| F07-1 | 062 | CONFORME | enum 8 métricas, pesos, fórmula de score (bate com exemplos trabalhados), deadline late-notice |
| F07-2 | 063 | CONFORME | snapshot platform-scoped (sem tenant_id); assertRoles-antes-de-ler AM/OP; crons; retenção 400d |
| F07-3 | 064 | CONFORME | página AM/OP; ordem sidebar; StatusTransitionDialog origin-gated; ReliabilityIndexSection |
| F08-1 | 065 | CONFORME | goals/rewards/closures platform-scoped (sem tenant_id); job diário; CAS approve/void |
| F08-2 | 066 | CONFORME | gate early-access em 4 caminhos de oferta; 403 corretamente ausente do OpenAPI; save-hook no composition root |
| F08-3 | 067 | CONFORME | inspector-program web (tabs Goals/Rewards, route guard); E2E |
| F08-4 | 068 | CONFORME | PWA challenges tile + tabs + status chips |
| F08-5 | 069 | CONFORME | relatório INSPECTOR_PROGRAM AM/OP-only; tenant forçado NULL |
| F08-6 | 070 | CONFORME | ledger INSPECTOR_BONUS tenantless; mint-on-approval atômico; void/reversal race-safe; sync de fatura |
| F10-1 | 075 | DESVIO_MENOR | completo; CHECK de tamanho de `reason` no banco removido (enforced no Zod) |
| F10-2 | 076 | CONFORME | PropertyFilesPanel, CreateIssueDrawer, versions, badges, settings; testado+E2E |
| F10-3 | 077 | CONFORME | seção Files read-only online-only; ReportIssueSheet; upload por foto; D18 |
| F10-4 | 078 | CONFORME | 4 rotas token-auth; 12/token/h; validação key↔row D25; DTOs privacy-reduced; E2E |

### Divergências (4 — todas DESVIO_MENOR; nenhum GAP/BUG)

1. **F04-2 (052) + F04-1 (051) — spec.md ainda descreve Plano A; código entrega Plano B. LOW.**
   - Spec descreve StoredRoutingMatrix/PlanRouteInput, `routing_matrix_json`/`leg_travel_json`/`route_geometry` persistidos, `routingInput` retornado, purge diário FR-016, "RESOLVED 2026-11-02 = Plan A".
   - Entregue: Plano B em tudo. Migration `20261107000000_drop_day_plan_route_columns` dropa as 4 colunas; grep delas + `routing_input` = **zero hits**. Contrato `routingInput` + `dayPlanRoutingInputSchema`/`toOptimizerInput`/`buildLegOverrides` removidos. GET recomputa geometria on-demand (só Directions) via `application/recompute-routing.ts`. Purge job removido.
   - Por que importa: reversão expand/contract esperada, explicitamente superseded pelas specs 072/074 e registrada em `decisoes.md`. Quem ler só 051/052 é induzido ao erro. Artefatos spec-kit são imutáveis (ponto no tempo). Não é defeito de código.

2. **F04-4 (054) — texto da spec do reorder PWA desatualizado vs Plano B. LOW.**
   - Spec 054:161-162 promete recompute local via optimizer compartilhado sobre `plan.routingInput` + guard SC-006. Entregue (`reorder-draft.ts:75`, `useReorderPreview.ts`): avaliação do reorder é chamada ao servidor `POST /v1/inspector/day-plans/:date/order/preview`; zero refs vivas a routingInput/evaluateSequence/toOptimizerInput. Mapa ainda lê `plan.geometry` (`RouteMapView.tsx:107`) como exigido.
   - Resultado documentado da task 073 (ToS Mapbox proíbe enviar matriz raw ao cliente). Drift de rastreabilidade apenas.

3. **F10-1 (075) — CHECK de tamanho de `reason` no banco removido. LOW.**
   - `F10-tarefas.md:102` especifica `reason TEXT NOT NULL CHECK (char_length BETWEEN 1 AND 1000)`; migration `20261108000100` entrega `reason TEXT NOT NULL` sem CHECK. Tamanho garantido só no Zod (`property-files.ts:134,222` `PROPERTY_ISSUE_REASON_MAX`).
   - Risco baixo: toda escrita passa pelos use-cases Zod, então um `reason` de 1001 chars não chega ao banco pela API; um writer direto/raw contornaria. O CHECK `source IN(...)` da spec foi implementado **mais forte**, como enum Prisma.

4. **F00 (037) — duas divergências cosméticas de texto/path. LOW.**
   - Helper text CL (`AppointmentMapFilterPanel.tsx:377`): entregue "...days (your agency's map window)." vs spec "...({from} – {to})." Clamp + aria corretos; teste assere só o prefixo.
   - `MapWindowChip` em `components/map/` (spec queria `features/appointments/components/`) com aria-labels simplificados (`MapWindowChip.tsx:44,66`). Ambas variantes + posicionamento corretos.

**+ 2 nits de doc (não são divergências de tarefa):**
- `workers.ts:431` — comentário ainda referencia o job removido "day-plan purge (03:45)".
- **CLAUDE.md raiz "Active Technologies" do F04-2 ainda diz "routingInput + stored geometry/matrix/leg (Plan A)" — hoje FALSO.** O CLAUDE.md do workspace backend JÁ está em Plano B (então §13.11 workspace-sync foi cumprido); só o log append-only raiz atrasou.

### Multi-tenant: **0 vazamentos em 44 tarefas**
- Platform-scoped corretamente SEM tenant_id: PlatformSetting; cols base/app-state do inspetor; 3 tabelas inspector_notice; DayPlan/DayPlanStop/RoutingRateLimitBucket (D10/D16); snapshot de confiabilidade; goals/rewards/closures; entrada INSPECTOR_BONUS; alert_overrides_json/tenantEtaNotices. Cada uma RBAC- + inspectorId-gated, exceção §7.1 documentada.
- Tenant-scoped corretamente filtram + 404 cross-tenant: properties/branches (X02); inspector_field_events (tenant_id do appt); property files/issues (404 não 403, requireTenantScope, sem bug OP-pinning); densidade F09 (join appointments.tenant_id).
- **Inspector raw GPS nunca alcança CL_*** em nenhum caminho: máscara de coord no audit-log p/ CL_ADMIN; field-activity omite lat/lng p/ CL; audits novos F03 não gravam coord; densidade F09 retorna só `{latIndex,lngIndex,count}`+CENTRO da célula com schema strip; Live Day GPS só em endpoints AM/OP-only.
- **Financeiro (F08-6):** INSPECTOR_BONUS é o único tipo de financial_entries tenantless, guardado por CHECK biconditional; mint-on-approval + void/reversal atômicos e race-safe (AM-only re-checado dentro da tx); sync de fatura + auto-PAID/reverse corretos; sem bypass de maker-checker; matemática exata. **CORRETO.**

---

## Eixo 2 — PWA × Cliente (Inspector App v3)

**Veredito: o PWA entregue honra a visão v3 do cliente.** Todas as telas desenhadas existem e navegam (Today, Today's route com reorder, Offers lista+mapa, Schedule, Challenges, Announcements, More/Profile, detalhe, check-in/out, fluxo can't-get-in com os 5 motivos idênticos). Em vários pontos **excede** o desenho para cumprir critérios de aceite (preview de atraso na rota, ranking anônimo, app tour, property files/issues).

### Divergências = decisão nossa, registrada e datada

| Cliente pediu | Nós decidimos | Fonte |
|---|---|---|
| Controle de chaves (#BP-1042) | não construir | README:139 / estacionamento:32 |
| Checklist de manutenção por item | não construir | README:135,138 |
| Foto de entrada no can't-get-in | não construir | README:137 |
| Tela in-progress rica + contador de fotos | só 2-tap check-in/out | **Q11** decisoes:31 |
| "Confirm no access, continue" | solta o job → REJECTED (INSPECTOR_UNABLE), OP reassume | **Q1** decisoes:16 |
| Botão "avisar tenant a caminho" | avisos de ETA automáticos (F06) | README:141 |
| Fotos-sincronizadas / checklist de conclusão | finish = geo+timestamp (sem upload de evidência) | README:136 / PWA CLAUDE.md §8 |
| Challenge "quality reports returned" | conceito não existe no sistema | README:140 |
| Redesign de Earnings | manter telas atuais | README:142 |
| Pinned announcements | não construir | README:143 |
| Só setas de reordenar | drag **+** setas (a11y) | **Q19** decisoes:39 |

### GAPs (cliente pediu, não entregamos, sem decisão que justifique) — **todos LOW**

- **B1 — "Show login details" (credenciais do app de laudo, p.2).** Temos o botão abrir-app (`inspectionAppLink`), não o revelar-credenciais. **É o ÚNICO item do PDF sem registro de decisão** → implementar o reveal ou declarar omissão intencional e parquear. (Possível escolha de segurança; tratar como questão de produto.)
- **B2 — "Mark all read" nos Announcements (p.11).** Temos mark-read por item + badge, falta a ação em massa.
- **B3 — Conclusão não encadeia a próxima parada (p.5).** `DonePanel` só oferece "Back to Schedule"; o PDF empurra next-inspection + Navigate. Suavizaria o loop de campo.

### ⚠️ Alerta para a demo ao cliente
A maior diferença **de experiência** vs o mockup é o modelo **check-in/out 2-tap com job-release-on-rejection** (Q1/Q11): o PDF desenha uma inspeção in-progress guiada (checklist de manutenção, contador de fotos, can't-get-in *após* chegar). É bem documentado e alinhado ao contrato, mas é a divergência mais provável de surpreender o cliente contra o desenho. **Conduza o walkthrough explicando isso antes**, não deixe o cliente descobrir.

---

## Backlog consolidado (ranqueado — tudo LOW, nada bloqueia release)

| # | Item | Tipo | Onde |
|---|---|---|---|
| 1 | CLAUDE.md raiz "Active Technologies" F04-2: trocar linha Plano A pela realidade Plano B | Doc (é a única afirmação FALSA) | root `CLAUDE.md` |
| 2 | "Show login details" (B1): implementar reveal OU parquear com decisão | Produto/Segurança | `JobDetailsSection.tsx` |
| 3 | "Mark all read" nos Announcements (B2) | Feature PWA | `features/announcements/` |
| 4 | Continuação next-inspection no `DonePanel` (B3) | UX PWA | `execution/components/DonePanel.tsx` |
| 5 | CHECK de tamanho de `property_issue.reason` no banco (F10-1) | Defesa-em-profundidade (follow-up migration) | nova migration |
| 6 | Banner "SUPERSEDED BY 072/074 — Plan B" nas spec.md 051/052/054 | Rastreabilidade | specs 051/052/054 |
| 7 | Comentário morto `workers.ts:431` ("day-plan purge 03:45") | Doc | `workers.ts:431` |
| 8 | Texto helper CL + aria-labels do MapWindowChip (F00) | Qualidade a11y | `AppointmentMapFilterPanel.tsx:377`, `MapWindowChip.tsx` |
| 9 | Confirmar teste F02 `/today→false` migrado após F04/F08 ampliarem INSPECTOR_NOTICE_TARGET_PATTERNS | Higiene de teste | suíte F02 |

---

## Reconciliação com a auditoria anterior (45 specs)

A passada anterior (mais rasa) havia sinalizado 3 "MEDIUM" de audit-log: F08-6 `reward_award.paid`/`payment_reversed` e F10-1 `property_file.version_added`. Os cluster-auditores profundos **NÃO confirmaram** esses como defeitos:
- F08: "audit em cada transição de estado"; cita `reward_award.approved`/`reward_award.voided`; mint/void/reversal/paid todos wired e atômicos.
- F10-1: achou apenas o item do CHECK de `reason`; nenhuma menção a `version_added` como gap.

Nenhum dos dois, porém, nomeou **explicitamente** aquelas strings de ação exatas. Provável falso-positivo da passada rasa. Se for desejada certeza regulatória sobre rastreabilidade, um confirm dirigido (grep das strings `reward_award.paid`/`reward_award.payment_reversed`/`property_file.version_added` nos use-cases de invoice-paid, reversal e new-version) fecha o ponto em minutos.

---

## Pendências de validação humana (não bloqueiam merge; bloqueiam promoção a staging/prod)
- Smoke F01 no DEV (4 perfis); Device QA F02 (00.A2/00.A4) em aparelho.
- Secrets VAPID por ambiente antes de promover F02.
- Execução do backfill X02-2 por ambiente, após X02-1 deployado.
- **Mapbox commercial Order (Plano A→B já cobre CI via stub/Plano B):** validar F04 no DEV com roteamento real antes de promover.
- **Bucket Supabase `inspection-assets` (F10):** hoje IMAGENS-only 30MB; ampliar allowed-MIME (PDF/docx/xlsx) + size (default 20MB) no Dashboard em DEV/staging/prod antes de validar F10, senão upload de Document/Report/PDF falha na camada de storage.
