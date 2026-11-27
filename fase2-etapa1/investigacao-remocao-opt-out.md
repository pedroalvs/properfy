# Investigação — remoção completa da recusa de consentimento (opt-out)

> Só análise, sem código, sem PR. Base: `origin/develop` em `f68ee253`. Data: 25/11/2026.
> Decisão do Pedro (25/11): remover por inteiro a feature de recusa de consentimento.

## Conclusão (leia isto primeiro)

1. **A remoção é segura para as features reais, com uma condição.** O envio de e-mail e SMS lê a tabela `notification_consents` em toda notificação que não é TRANSACTIONAL, mas só bloqueia quando existe uma linha com `opted_out = true`. Hoje nada no sistema cria essa linha. **Se a tabela estiver vazia (ou sem recusas) em produção, tirar a leitura não muda nenhum envio.**
2. **A condição: pode haver recusas antigas gravadas em produção.** O descadastro por link existiu de 08/04/2026 (`ec2a8737`) a 10/06/2026 (`b6fc27b7`). Quando ele saiu, a migration `20260610000000_remove_unsubscribe_link_consent_source` **não apagou** as recusas: trocou a origem `unsubscribe_link` por `operator_override`. Então quem se descadastrou nesse período **continua bloqueado hoje**. Se a leitura sair, essas pessoas **voltam a receber** lembretes, aviso inicial, link do portal, pesquisa de satisfação e os avisos de chegada (F06). O Pedro precisa contar antes (SQL só leitura na seção 3.4) e decidir se aceita.
3. **Não pode sair junto: o status `SKIPPED_OPT_OUT` e a classe da notificação (`NotificationClass`).** Os nomes sugerem consentimento, mas são usados por features reais. O `SKIPPED_OPT_OUT` também marca o switch da agência "não avisar inquilinos" (com o encaminhamento para a filial e a recuperação automática) e a supressão por tipo de fluxo. A classe decide a isenção de teto diário do `PASSWORD_RESET` e do `INSPECTOR_NOTICE_SMS`.
4. **Banco em duas etapas (expand/contract).** Primeiro o código para de ler e de escrever. Depois que isso estiver em produção, uma migration apaga a tabela `notification_consents` e o enum `ConsentChangeSource`. Fazer tudo no mesmo deploy quebraria o envio durante o rolling deploy, porque a migration roda antes das máquinas antigas saírem.
5. **#1413 (O-19 fatia 3): não reverter, apagar junto com a feature.** O único chamador de `AuthorizationService.assertTenantScope` é o override de consentimento. Quando o override sai, esse método fica sem uso e sai junto. O `isCrossTenantRole`, criado no #1413, **fica**, porque o financeiro (O-19 D8, #1416) usa.
6. **Na tela:** some o item "Consent Lookup" do menu Configuration e a página `/notification-consents`. Os tooltips de classe na tela de templates precisam de texto novo, porque dizem que Operational "respeita o opt-out", e isso deixa de ser verdade. Mock na seção 6.
7. **Escopo e lei:** nem o anexo contratual nem o "Escopo Completo Properfy - CLIENTE.md" falam de consentimento ou descadastro (busca sem resultado). A única base legal citada está na F06 (L-F06-03): os avisos de horário são mensagem factual de serviço, isenta de rodapé de descadastro pelo Spam Act 2003. Para "atender quem pede para parar", a F06 previa o opt-out manual, que já saiu no PR-14. **Sem a feature, sobram três formas de parar alguém**, todas no nível da agência ou do contato. O Pedro já aceitou essa consequência em 24/11 (E-2); a remoção total só a torna definitiva.
8. **Proposta: 3 PRs pequenos**, mais um passo de verificação entre o 2 e o 3.
   - PR-1: tela + rotas + #1413.
   - PR-2: o envio para de ler + textos de classe.
   - PR-3: migration que apaga tabela e enum.

---

## 1. Inventário completo (o que existe hoje)

Caminhos relativos à raiz. Linhas de `origin/develop` (`f68ee253`).

### 1.1 Web

| # | Item | Arquivo:linha |
|---|---|---|
| W1 | Item de menu "Consent Lookup" (Configuration, AM/OP) | `apps/web/src/components/shell/Sidebar.tsx:92` |
| W2 | Rota `/notification-consents` (`AuthGuard` AM/OP) + import lazy | `apps/web/src/app/router.tsx:78`, `:550-556` |
| W3 | Feature inteira `features/notification-consents/` (7 arquivos, ~700 linhas): `ConsentLookup.tsx` (163), `ConsentOverrideModal.tsx` (108, título "Override Opt-Out"), `useConsentLookup.ts` (60), `ConsentLookupPage.tsx`, `index.ts`, 2 testes (239 + 124) | `apps/web/src/features/notification-consents/**` |
| W4 | Rótulo do motivo `CONSENT_OPT_OUT` na aba Notifications do agendamento | `apps/web/src/features/appointments/components/AppointmentNotificationsTab.tsx:29` |
| W5 | Cor/rótulo "Not sent" do status `SKIPPED_OPT_OUT` (comentário cita consentimento) | `apps/web/src/lib/status-colors.ts:189-205` |
| W6 | Tooltip da classe: "Always delivered. Recipients cannot opt out of transactional notifications." / OPERATIONAL "recipient can opt out" | `apps/web/src/features/notification-templates/components/NotificationClassChip.tsx:7,15` (+ teste `:33`) |
| W7 | Tooltip da coluna Type: "…Operational and Marketing messages respect the recipient's notification opt-out." | `apps/web/src/features/notification-templates/components/TemplateTable.tsx:93` |
| W8 | E2E web | **nenhum** (busca em `apps/web/tests` sem resultado) |

O PWA não tem nada. O "opt-out" do PWA (`features/push/`, `push-preference.ts`) é a preferência de push do inspetor no aparelho, outra feature, e **fica**.

### 1.2 Shared

| # | Item | Arquivo:linha |
|---|---|---|
| S1 | Schemas `listConsentsQuerySchema`, `overrideConsentSchema`, `consentRecordResponseSchema`, `listConsentsResponseSchema` | `packages/shared/src/schemas/notification.ts:60-92` |
| S2 | `consentChangeSourceSchema` + tipo | `packages/shared/src/schemas/notification.ts:10-11` |
| S3 | Enum `ConsentChangeSource` | `packages/shared/src/enums/notification.ts:24-28` |
| S4 | Status `SKIPPED_OPT_OUT` (filtro de listagem + enum) | `packages/shared/src/enums/notification.ts:13`, `schemas/notification.ts:17-18`, teste `enums/notification.test.ts:32` |
| S5 | Classes `NotificationClass` + `PROTECTED_TEMPLATE_CLASSIFICATIONS` / `DEFAULT_TEMPLATE_CLASSIFICATIONS` (comentários "consent-checked/bypassed") | `packages/shared/src/constants/notification-templates.ts:340-410` (+ testes `:400`, `:566`) |
| S6 | `api-types` / `openapi.json`: 2 caminhos | `packages/shared/src/api-types.ts:16155` (GET), `:16188` (override); `packages/shared/openapi.json:40555`, `:40564` |
| S7 | role-matrix | **nenhuma entrada** (o RBAC está nos use cases, `assertRoles(['AM','OP'])`) |

### 1.3 Backend

| # | Item | Arquivo:linha |
|---|---|---|
| B1 | Rota `GET /v1/notifications/consents` | `apps/backend/src/modules/notification/interfaces/notification.routes.ts:279-294` (imports `:12-13`, tipos do container `:79-80`) |
| B2 | Rota `POST /v1/notifications/consents/:consentId/override` | `notification.routes.ts:296-316` |
| B3 | `ListConsentsByRecipientUseCase` | `notification/application/use-cases/list-consents-by-recipient.use-case.ts` (107 linhas) |
| B4 | `OverrideConsentUseCase` (chama `assertTenantScope` em `:48`) | `notification/application/use-cases/override-consent.use-case.ts` (97 linhas) |
| B5 | Entidade `NotificationConsentEntity` (`markOptedOut` sem chamador desde o PR-14) | `notification/domain/notification-consent.entity.ts` |
| B6 | Porta `INotificationConsentRepository` | `notification/domain/notification-consent.repository.ts` |
| B7 | `PrismaNotificationConsentRepository` (e-mail sem diferenciar maiúsculas, F06-2) | `notification/infrastructure/prisma-notification-consent.repository.ts` |
| B8 | Erros `NotificationConsentNotFoundError` (`CONSENT_NOT_FOUND`) e `ConsentTenantScopeError` (**sem uso nenhum** hoje) | `notification/domain/notification.errors.ts:43-57` |
| B9 | **Leitura no envio**: `isBlockedByConsent` (chamado em `:425`), dep `consentRepo` (`:16,110,160,182`), motivo `CONSENT_OPT_OUT` | `notification/application/use-cases/send-notification.use-case.ts:657-705` |
| B10 | Comentários do envio que citam consentimento (ordem das fases, mirror) | `send-notification.use-case.ts:215,239,402,487,609-611` |
| B11 | `NotificationEntity.getEffectiveClass()` / `isTransactional()` (comentários "consent") | `notification/domain/notification.entity.ts:70-83` |
| B12 | Guarda F06: `TENANT_ETA_*` presos em OPERATIONAL "so tenants can opt out" (mensagem de erro visível na API) | `notification/application/use-cases/upsert-notification-template.use-case.ts:175-190` |
| B13 | Comentários "consent-blocked" nos templates de plataforma | `notification/domain/platform-notification-templates.ts:45,487,524,535,546,556,663` |
| B14 | Comentário de dedupe/retry sobre `CONSENT_OPT_OUT` | `notification/infrastructure/prisma-notification.repository.ts:67-77` |
| B15 | Comentário no notificador F06 | `tenant-eta/application/tenant-eta-notifier.service.ts:261` |
| B16 | Wiring no container | `apps/backend/src/main/container.ts:1847` (repo), `:1855` (dep do envio), `:1919-1927` (use cases), `:2528-2529` (rotas) |
| B17 | `AuthorizationService.assertTenantScope` (#1413), **único chamador = B4** | `apps/backend/src/shared/domain/authorization.service.ts:60-90` |
| B18 | `isCrossTenantRole` (#1413) — **usado também pelo financeiro** | `apps/backend/src/shared/domain/require-tenant-scope.ts:41`; `billing/.../list-financial-entries.use-case.ts:76`, `get-financial-summary.use-case.ts:30` |
| B19 | Seeds / `provision-qa-users.ts` | **nenhuma referência** |

### 1.4 Banco

| # | Item | Arquivo:linha |
|---|---|---|
| D1 | Tabela `notification_consents` (model `NotificationConsent`, `@@unique([recipient, channel, tenant_id, notification_class])`, índice `tenant_id`, FK `changed_by_user_id → users ON DELETE SET NULL`) | `apps/backend/prisma/schema.prisma:1832-1852`; baseline `migrations/20260806000000_v1_baseline/migration.sql:1110,1771-1780,2589,3493` |
| D2 | Relação reversa no `User`: `consent_changes` | `schema.prisma:308` |
| D3 | Enum `ConsentChangeSource` (`operator_override`, `re_opt_in`) | `schema.prisma:1220-1223`; baseline `:137` |
| D4 | Enum `NotificationStatus.SKIPPED_OPT_OUT` | `schema.prisma:1211` |
| D5 | Enum `NotificationClass` + colunas `notification_class` em templates e notificações | `schema.prisma:1214-1218,1616,1653` |
| D6 | Doc do banco | `docs/database-schema.md:54,809,835-848` (ainda lista `unsubscribe_link`, que já não existe) |

### 1.5 Testes

| Arquivo | O que tem de consentimento |
|---|---|
| `apps/backend/tests/unit/notification/list-consents-by-recipient.use-case.test.ts` | inteiro |
| `apps/backend/tests/unit/notification/override-consent.use-case.test.ts` | inteiro (inclui os testes do #1413) |
| `apps/backend/tests/integration/notification/consent-endpoints.routes.test.ts` | inteiro |
| `apps/backend/tests/integration/db/consent-email-case.integration.test.ts` | inteiro (prova do F06-2) |
| `apps/backend/tests/integration/rbac/notifications.rbac.test.ts` | bloco `GET /v1/notifications/consents` (`:12,35,148+`) |
| `apps/backend/tests/unit/notification/send-notification.use-case.test.ts` | mock `consentRepo` (`:97,155,171`) e casos `:752,786,817,853,873,891,908,1081,1658,2193` |
| `apps/backend/tests/unit/shared/authorization.service.test.ts` | bloco `assertTenantScope` (`:71-105`) |
| `apps/backend/tests/helpers/mock-container.ts:311-312`, `tests/integration/notification/mobile-message-webhook-token.routes.test.ts:30-31`, `src/modules/appointment/interfaces/__tests__/appointment.routes.integration.test.ts:93-94` | stubs dos 2 use cases no container |
| `apps/backend/tests/integration/db/agency-forward-end-to-end.integration.test.ts:22,69` | instancia o repo real para montar o envio |
| `tests/integration/db/notification-dedupe-suppressed.integration.test.ts:139-192`, `notification-find-retryable.integration.test.ts:83-92` | usam linhas `SKIPPED_OPT_OUT/CONSENT_OPT_OUT` como **dado histórico** |
| `tests/integration/db/tenant-eta-morning.integration.test.ts:6-7`, `platform-notification-null-tenant.integration.test.ts:180`, `unit/notification/upsert-notification-template.use-case.test.ts:197,734`, `platform-notification-templates.test.ts:48,78,108,302`, `unit/satisfaction-survey/survey-template-registration.test.ts:38` | comentários/títulos que citam consentimento |
| Web: `ConsentLookup.test.tsx`, `ConsentOverrideModal.test.tsx`, `NotificationClassChip.test.tsx:33`, `AppointmentNotificationsTab.test.tsx:40` | ver W3, W4 e W6 |

### 1.6 Documentação

| Arquivo:linha | Conteúdo |
|---|---|
| `CLAUDE.md:459-460,500` | F06-1/F06-2 citam o opt-out e o consentimento por e-mail sem diferenciar maiúsculas |
| `apps/backend/CLAUDE.md:475` | lista a entidade `NotificationConsent` |
| `apps/backend/CLAUDE.md:622,625-633` | seção "Tenant arrival-notice prediction & consent opt-out": postura de compliance, PR-16, O-19 fatia 3, e-mail F06-2 |
| `apps/web/CLAUDE.md:81,197,393` | pasta `notification-consents`, exceção de Back da tela, item 24 (PR-16) |
| `docs/database-schema.md:54,809,835-848` | tabela e enum |
| `fase2-etapa1/tarefas/F06-tarefas.md:103,211-219`, `F06-avisos-horario-inquilino.md:24,45,58`, `decisoes.md:41` (Q21 "Respeitar … o consentimento"), `specs/057-…/research.md:31` | decisões históricas da F06 |

---

## 2. Remover, manter ou adaptar

| Item | Ação | Por quê |
|---|---|---|
| W1, W2, W3 | **Remover** | É a tela da feature. |
| W4 (rótulo `CONSENT_OPT_OUT`) | **Manter** | Linhas antigas com esse motivo continuam na aba Notifications dos agendamentos (histórico). Sem o rótulo, apareceria o código cru (regra "no raw ids in UI"). O texto continua verdadeiro para o passado. |
| W5 (`SKIPPED_OPT_OUT` "Not sent") | **Manter**; ajustar só o comentário | O status é do switch da agência e do tipo de fluxo. |
| W6, W7 (tooltips de classe) | **Adaptar** (gate de tela) | Deixam de ser verdade. Mock na seção 6. |
| S1, S2, S3, S6 | **Remover** + `pnpm generate:api` | Contrato das rotas que saem. |
| S4 (`SKIPPED_OPT_OUT`) | **Manter** | Feature real (seção 3.1). |
| S5 (classes) | **Manter**; ajustar comentários | A classe ainda decide o teto diário e a proteção de templates (seção 3.1). |
| B1-B4 | **Remover** | Rotas e use cases da feature. |
| B5-B7, B9 | **Remover** (PR-2) | A leitura no envio e todo o acesso à tabela. |
| B8 | **Remover** | `CONSENT_NOT_FOUND` só existe para o override; `ConsentTenantScopeError` já não tem uso. |
| B10, B11, B13-B15 | **Adaptar** os comentários | Comentário que passa a mentir. Sem mudança de lógica. |
| B12 (guarda `TENANT_ETA_*`) | **Manter a guarda**, trocar a mensagem e o comentário | Sem consentimento, OPERATIONAL e TRANSACTIONAL só diferem, para linhas de agência, em nada. Manter a guarda custa zero e evita mudar contrato. A mensagem atual ("so tenants can opt out") fica falsa. Sugestão: "Tenant arrival-time notices must stay OPERATIONAL". Decisão do Pedro se prefere tirar a guarda (seção 8). |
| B16 | **Remover** o wiring correspondente | — |
| B17 (`assertTenantScope` do `AuthorizationService`) | **Remover** junto com o override | Sem chamador. Regra "delete dead code". |
| B18 (`isCrossTenantRole`) | **Manter** | Usado pelo financeiro (#1416). |
| D1, D2, D3 | **Remover** na etapa contract (PR-3) | Ver seção 4. |
| D4, D5 | **Manter** | Features reais. |
| D6 | **Adaptar** no PR-3 | Tirar a tabela e o enum do doc. |
| Testes | Seguem o item que testam | Testes inteiros da feature saem. Casos de consentimento em `send-notification` saem. Os testes de dedupe/retry com `CONSENT_OPT_OUT` **ficam**: provam o tratamento de linha histórica, que continua existindo no banco. |
| CLAUDE.md (3 workspaces + raiz) | **Adaptar** em cada PR que torna a frase falsa | Regra §13.11. |
| `fase2-etapa1/*`, `specs/*` | **Não mexer** no histórico; registrar a decisão nova em `decisoes.md` | A Q21 e a L-F06-03 ficam superadas pela decisão de 25/11. Quem registra é o Pedro ou o coordenador. |

---

## 3. O que é feature real e não pode quebrar

### 3.1 O envio consulta consentimento?

Sim. Ordem das fases em `send-notification.use-case.ts:405-440`:

1. template;
2. tipo de fluxo (`isSuppressedByFlowType`);
3. switch da agência (`checkAgencyOccupantSwitch`);
4. **consentimento (`isBlockedByConsent`, `:425`)**;
5. teto diário;
6. validação do telefone;
7. envio.

O que a fase 4 faz (`:664-705`):
- **TRANSACTIONAL:** pula a checagem, não lê nada.
- **OPERATIONAL:** 1 consulta a `notification_consents`. Bloqueia **só** se achar linha com `opted_out = true`. Sem linha, envia.
- **MARKETING:** bloqueia se não houver linha com opt-in explícito. Mas `create-notification.use-case.ts:74` já recusa MARKETING (422 `MARKETING_DISPATCH_DISABLED`), então nenhuma notificação MARKETING chega ao envio, salvo linha legada.

**O que depende do mesmo vocabulário e NÃO pode sair:**
- **Status `SKIPPED_OPT_OUT`.** É gravado também por:
  - o switch "agência não avisa inquilinos", com motivo `AGENCY_TENANT_NOTIFICATIONS_DISABLED` (`:626`). Esse caminho inclui o encaminhamento para a filial e a recuperação pelo poller (`prisma-notification.repository.ts:118-135`).
  - a supressão por tipo de fluxo, com `FLOW_TYPE_NO_OCCUPANT_CODE` (`:584`).
  - O dedupe "já enviado" (`NOT_SUPPRESSED`, `:77`) e o retry também dependem dele.
- **Classe (`NotificationClass`).** `isOverDailyBudget` isenta do teto diário a linha de plataforma TRANSACTIONAL (`tenantId = null`), que são o `PASSWORD_RESET` e o `INSPECTOR_NOTICE_SMS`. A proteção `PROTECTED_TEMPLATE_CLASSIFICATIONS` impede que alguém reclassifique esses templates e os coloque sob o teto. A coluna "Type" da tela de templates e o bloqueio de MARKETING também usam a classe.

### 3.2 O que muda no envio se a leitura sair

| Cenário | Muda? |
|---|---|
| Tabela sem nenhuma linha `opted_out = true` | **Nada muda no que é enviado.** Sai uma consulta ao banco por notificação OPERATIONAL. |
| Há recusas antigas (descadastro por link, abr-jun/2026) | **Muda:** essas pessoas voltam a receber todas as notificações OPERATIONAL ao inquilino: aviso inicial, lembretes 7/5/3 (e-mail e SMS), `TENANT_SMS_ALERT`, `TENANT_PORTAL_LINK`, pesquisa de satisfação, `TENANT_ETA_*`. Também voltam a receber `PROPERTY_MANAGER_ESCALATION`, `REPORT_READY` e `REPORT_FAILED`, se a pessoa recusada for gestor ou usuário da agência. |
| Linhas antigas `SKIPPED_OPT_OUT` + `CONSENT_OPT_OUT` em `notifications` | Ficam como histórico. Continuam sem contar para o dedupe (o filtro é pelo status). O poller não as reenvia, porque só reenvia motivos do switch. **Nenhum reenvio retroativo.** |
| F06 (avisos de chegada) | A F06 não lê consentimento por conta própria (`tenant-eta/` só cita `SKIPPED_OPT_OUT` num comentário). Ela confia na fase 4. Sem a fase 4, os avisos seguem as outras travas: tipo de fluxo, switch da agência, flag `tenantEtaNoticesEnabled` da agência, chave de plataforma `tenantEtaNotices`, confirmação do inquilino e teto. **O código da F06 não muda.** |

### 3.3 Como parar alguém depois da remoção

O código da F06 (`apps/backend/CLAUDE.md:630`) chamava o consentimento de "único mecanismo de parada". Sem ele:
1. **Desligar os avisos de chegada da agência** (`tenantEtaNoticesEnabled`, AM no formulário da agência). Vale para todos os inquilinos daquela agência, e só para os avisos de chegada.
2. **Desligar "notificar inquilinos" da agência** (`rentalTenantNotificationsEnabled`). Para tudo que vai ao inquilino; as mensagens viram cópia para a filial.
3. **Tirar o e-mail ou o telefone do contato do agendamento.** É por pessoa, mas apaga o dado do contato.

O Pedro aceitou essa consequência em 24/11, ao remover o "Record opt-out" (`plano-acao-pos-validacao.md:456`). Esta remoção só tira também o override, que nunca criava recusa: ele só desfazia recusas que já existiam.

### 3.4 Há recusas gravadas? Como contar (somente leitura)

**DEV:** o reteste de 24/11 registrou "nenhum destinatário com registro de consentimento em DEV" (`reteste-dev-2026-11-24.md:289`). Não acessei staging nem produção.

SQL só leitura para o Pedro rodar em staging e produção:

```sql
-- 1) Recusas ativas: estas são as pessoas que voltariam a receber
SELECT channel, notification_class, change_source, count(*) AS total
FROM notification_consents
WHERE opted_out = true
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- 2) Tamanho total da tabela (inclui opt-in desfeito pelo override)
SELECT opted_out, count(*) FROM notification_consents GROUP BY 1;

-- 3) Quantos envios a leitura de consentimento bloqueou de fato nos últimos 90 dias
SELECT channel, template_code, count(*) AS total
FROM notifications
WHERE status = 'SKIPPED_OPT_OUT'
  AND failure_reason = 'CONSENT_OPT_OUT'
  AND created_at > now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

Se a consulta 1 der zero em produção, a remoção não muda nenhum envio. Se der maior que zero, é decisão do Pedro (seção 8, D1).

### 3.5 TRANSACTIONAL × OPERATIONAL e regras de escopo ou lei

- **Anexo contratual** (`fase2-etapa1/arquivo/anexo-I-texto-extraido.txt`): nenhuma menção a consentimento, opt-out, descadastro, STOP ou privacidade. O único "recusado" é de arquivo (C.A5).
- **"Escopo Completo Properfy - CLIENTE.md":** nenhuma menção.
- **Specs:**
  - A **Feature 018** (abril/2026) criou classe, consentimento, link de descadastro, consulta e override. É da fase 1 e não está no escopo contratual.
  - A **F06 L-F06-03** (`F06-tarefas.md:103`, `specs/057-…/research.md:31`) classificou os avisos de horário como factuais (Spam Act 2003: isentos de rodapé de descadastro) e criou o opt-out manual para atender pedidos de parada. Esse opt-out já saiu (PR-14).
  - A decisão **Q21** (`decisoes.md:41`) diz "Respeitar o switch da agência e o consentimento".
  - Essas três ficam superadas pela decisão de 25/11. **Precisa de registro em `decisoes.md`** (não registrei: está fora da minha alçada).
- **Depois da remoção, o que a classe ainda significa:**
  - **TRANSACTIONAL:** sem teto diário quando é de plataforma, e não pode ser reclassificado.
  - **OPERATIONAL:** respeita o teto diário.
  - **MARKETING:** não pode ser criado.
  - O "respeita opt-out" sai de todos os textos.

---

## 4. Banco: o que fica, o que sai e em que ordem

| Objeto | Destino |
|---|---|
| Tabela `notification_consents` (+ índice, unique, FK para `users`) | **Sai**, na etapa contract |
| Relação `User.consent_changes` (só Prisma, sem coluna em `users`) | **Sai** junto com a tabela |
| Enum `ConsentChangeSource` | **Sai** junto (só a tabela usa) |
| `NotificationStatus.SKIPPED_OPT_OUT` | **Fica** (switch, tipo de fluxo, dedupe, retry) |
| `NotificationClass` e colunas `notification_class` | **Ficam** (teto, proteção, coluna Type, bloqueio de MARKETING) |
| Linhas antigas `CONSENT_OPT_OUT` em `notifications` | **Ficam** (histórico de envio; `failure_reason` é texto livre, sem migration) |

**Ordem (expand/contract):**
1. **PR-2 em produção:** nenhum código lê ou escreve a tabela. Prisma ainda tem o model, sem uso.
2. **Verificar** em produção que nada mais toca a tabela, por log ou pela ausência de erro, e rodar a contagem da seção 3.4 uma última vez.
3. **PR-3:** migration `DROP TABLE notification_consents;` e depois `DROP TYPE "ConsentChangeSource";`. Remove o model, o enum e a relação no `schema.prisma`.
   - Não precisa de backup de dados para o sistema funcionar.
   - Os dados são e-mail e telefone de recusas (dado pessoal). Apagar reduz exposição.
   - Se o Pedro quiser guardar prova de quem recusou, exportar **antes** (decisão D2).

**Por que não no mesmo PR:** o `release_command` do Fly aplica a migration antes das máquinas novas entrarem. No rolling deploy, as máquinas antigas ainda rodam `findByScope` em cada envio OPERATIONAL. Com a tabela apagada, o envio falharia (erro de Prisma) até a troca terminar. A notificação ficaria PENDING e o retry pegaria depois, mas com erro em log e risco de atraso em lembrete.

---

## 5. Proposta de PRs

### PR-1 — Tela, rotas e #1413 (web + shared + backend)

- **Tira:** W1-W3; S1-S3; S6 (`pnpm generate:api`); B1-B4, B8; B16 (só os 2 use cases e as rotas); B17 (`assertTenantScope` + bloco de teste `authorization.service.test.ts:71-105`); stubs dos 3 arquivos de teste que montam o container; testes inteiros de list/override/routes; bloco RBAC de `GET /v1/notifications/consents`.
- **Fica:** a leitura no envio (B9), a entidade e os repositórios. O envio continua respeitando recusas antigas até o PR-2.
- **Docs:** `apps/web/CLAUDE.md:81,197,393`; `apps/backend/CLAUDE.md:631-632` (PR-16 e O-19 fatia 3 saem; a linha 630 vira "sem mecanismo de parada por pessoa", ver D1); `packages/shared/CLAUDE.md` se citar os schemas.
- **Riscos:**
  - Baixo. Ninguém usa a tela (só abria pelo endereço até o PR-16, e a busca dava erro até lá).
  - Web e backend têm deploys separados (Vercel × Fly). Se o backend subir antes, a tela dá 404 por alguns minutos. Mitigação: o menu e a rota somem no mesmo PR.
- **Testes:**
  - Web: o menu Configuration de AM e OP não tem "Consent Lookup"; `/notification-consents` cai na rota "não encontrada" ou no padrão do router; o teste do `Sidebar` atualizado.
  - Backend: `GET /v1/notifications/consents` e `POST …/override` → 404 (teste de rota que **falha** se a rota voltar).
  - `typecheck` prova que nada mais importa `assertTenantScope` do `AuthorizationService`.
  - Testes do financeiro com `isCrossTenantRole` continuam verdes.

### PR-2 — O envio para de ler consentimento (backend + 2 textos web)

- **Pré-requisito:** o Pedro rodou a contagem da seção 3.4 e decidiu a D1.
- **Tira:** B9 (`isBlockedByConsent` e dep `consentRepo`); B5, B6, B7; B16 (repo + dep do envio); `consent-email-case.integration.test.ts`; os casos de consentimento em `send-notification.use-case.test.ts`; o repo real em `agency-forward-end-to-end.integration.test.ts`.
- **Adapta:**
  - comentários B10, B11, B13-B15;
  - mensagem e comentário da guarda B12;
  - comentários do shared S5;
  - tooltips W6 e W7 (gate de tela, seção 6);
  - comentário de W5;
  - docs: `CLAUDE.md:459-460,500`, `apps/backend/CLAUDE.md:475,622,625-633`.
- **Riscos:**
  - **Médio:** muda comportamento se houver recusas em produção (seção 3.2).
  - Risco técnico baixo: tira um passo do meio do pipeline, sem mexer na ordem das outras fases.
  - Atenção ao comentário `:402`, que diz que a ordem importa. O teto reusa as settings carregadas pelo switch, e isso não depende da fase de consentimento.
- **Testes** (TDD; os dois primeiros falham antes da mudança):
  - Teste novo: OPERATIONAL **é enviado** mesmo havendo, no mock antigo, uma recusa. Na prática: o envio não recebe nem chama nenhum repositório de consentimento.
  - MARKETING legado no envio: decidir o comportamento (D3). Recomendo **marcar SKIPPED** com motivo próprio, para não abrir uma porta de envio de marketing.
  - Continuam verdes:
    - switch da agência → `SKIPPED_OPT_OUT` + encaminhamento;
    - tipo de fluxo → `SKIPPED_OPT_OUT`;
    - dedupe ignora `SKIPPED_OPT_OUT` (inclusive linha com `CONSENT_OPT_OUT`);
    - teto isenta `PASSWORD_RESET` e `INSPECTOR_NOTICE_SMS`;
    - `TENANT_ETA_*` presos em OPERATIONAL;
    - integração F06 (`tenant-eta-morning`).
  - Suíte de integração em banco (`pnpm --filter backend test:integration:db`), porque o PR mexe em testes de banco.

### Passo de verificação (sem PR)

Depois do PR-2 em produção: confirmar que não há erro de envio e repetir a consulta 1 da seção 3.4. Se o Pedro quiser, exportar a tabela (D2).

### PR-3 — Contract: apagar a tabela e o enum (backend + doc)

- **Tira:** D1-D3 (migration nova + `schema.prisma`); D6 (`docs/database-schema.md:54,809,835-848`, também tira o `unsubscribe_link` velho).
- **Riscos:** baixo depois do PR-2 em produção. A migration é destrutiva: sem volta sem backup.
  - Aplicar localmente e rodar `prisma migrate deploy` duas vezes (o CI já faz isso).
  - Checar se `prisma migrate diff` não "dropa índice `Unsupported()`" (memória `project_prisma_drift_drops_unsupported_indexes`).
- **Testes:** CI de migration (2× em banco PostGIS limpo); `prisma validate`; suíte de banco verde. Nenhum teste de aplicação deveria mudar, porque nada mais usa a tabela.

**Tamanho:**
- PR-1 ≈ 30 arquivos, a maior parte deletada.
- PR-2 ≈ 20 arquivos.
- PR-3 ≈ 4 arquivos.

Os três ficam bem abaixo de 150.

---

## 6. O que muda na tela (para mostrar ao Pedro antes)

### 6.1 Menu Configuration (AM e OP)

```
Antes                          Depois
Configuration                  Configuration
  Service Types (AM)             Service Types (AM)
  Service Regions                Service Regions
  Pricing Rules                  Pricing Rules
  Notification Templates         Notification Templates
  Consent Lookup        ← sai    Integrations (AM)
  Integrations (AM)              Platform Settings
  Platform Settings
```

### 6.2 Página `/notification-consents`

Some inteira: a busca por agência, e-mail ou telefone, a tabela de registros e o modal "Override Opt-Out". Quem abrir o endereço guardado vai para o comportamento padrão de rota inexistente do web.

### 6.3 Tela de templates (texto, entra no PR-2)

| Onde | Hoje | Proposta |
|---|---|---|
| Chip TRANSACTIONAL (tooltip) | "Always delivered. Recipients cannot opt out of transactional notifications." | "Always delivered. Not counted against the daily sending cap when sent platform-wide." |
| Chip OPERATIONAL (tooltip) | (comentário "recipient can opt out") | "Counts against the agency's daily sending cap." |
| Coluna Type (tooltip) | "How the message is treated for delivery: Transactional messages are always sent; Operational and Marketing messages respect the recipient's notification opt-out." | "How the message is treated for delivery: Transactional messages are always sent; Operational messages count against the daily sending cap. Marketing messages are not sent." |

O texto final é decisão do Pedro. O que não pode é manter "respect the recipient's notification opt-out".

### 6.4 Não muda

- A aba Notifications do agendamento continua mostrando "Not sent" e, em linhas antigas, "Recipient opted out of this notification class". É histórico verdadeiro.
- O filtro por status continua com `SKIPPED_OPT_OUT`.

---

## 7. O que fazer com o #1413

**Não reverter. Apagar junto com a feature, no PR-1.**

O #1413 (`58e5e40b`, mergeado em 25/11) mudou 2 arquivos de código:
- `authorization.service.ts`: o `assertTenantScope` passou de "só AM passa" para `isCrossTenantRole` (AM, OP, SYS).
- `require-tenant-scope.ts`: criou o `isCrossTenantRole`.

| Opção | Resultado |
|---|---|
| Reverter o #1413 | Volta a regra errada (OP preso à própria agência, CORRECTION-001 revogada pela DEC-003) num serviço compartilhado. Quebra o financeiro (#1416), que importa `isCrossTenantRole`. **Não recomendado.** |
| Apagar com a feature (recomendado) | O override sai, o `AuthorizationService.assertTenantScope` fica sem chamador e sai junto, com o bloco de teste `:71-105`. O `isCrossTenantRole` fica (financeiro). A linha `apps/backend/CLAUDE.md:632` sai. |
| Manter `assertTenantScope` sem uso | Código morto, contra a regra "delete dead code". O próximo que usar herda um helper sem dono. |

Atenção: há **dois** símbolos `assertTenantScope`. O do `require-tenant-scope.ts`, citado no `CLAUDE.md` §7.5, **fica**. Sai só o método do `AuthorizationService`.

---

## 8. Decisões para o Pedro

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Se a consulta 1 (seção 3.4) achar recusas em produção: aceitar que essas pessoas voltem a receber? | Rodar a consulta antes do PR-2. Se der zero, seguir. Se der mais que zero: aceitar, porque o anexo não pede consentimento e os avisos são factuais, ou parar a remoção no PR-1, mantendo a leitura até as recusas serem tratadas de outro jeito. |
| D2 | Exportar `notification_consents` antes do PR-3? | Só se houver recusas e o Pedro quiser prova histórica. Senão, apagar (reduz dado pessoal guardado). |
| D3 | MARKETING legado que chegue ao envio: SKIPPED ou enviar? | SKIPPED com motivo próprio, preservando o bloqueio que já existe na criação. |
| D4 | A guarda `TENANT_ETA_*` → OPERATIONAL fica? | Fica, só com a mensagem nova. Tirar a guarda é mudança de comportamento sem ganho. |
| D5 | Texto dos tooltips de classe (seção 6.3) | Aprovar ou ajustar antes do PR-2. |
| D6 | Registrar em `decisoes.md` que a Q21 ("respeitar o consentimento") e a L-F06-03 ficam superadas por 25/11 | Sim, no mesmo commit de docs da entrega. |
