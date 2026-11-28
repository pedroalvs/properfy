# Investigação O-19: o Operador (OP) preso a uma agência

Data: 25/11/2026. Só análise; nenhum código alterado e nada acessado em produção.
Base: `origin/develop` (`4e819532`). Também conferi `origin/main` (produção), que tem os mesmos defeitos.

---

## Conclusão

1. **A causa do O-19 não é o trecho `role === 'AM' ? null : actor.tenantId`.** Para o OP, esse trecho dá escopo amplo, porque o OP **sempre** tem `tenantId` nulo. O sintoma vem da linha seguinte, que **compara** a agência de cada linha com a do OP: `rows.filter((r) => r.tenantId === input.actor.tenantId)`. Como o OP não tem agência, nada é igual a nulo e a lista sai vazia.
2. **Para o OP, há dois tipos de código:**
   - **Tipo A, "escopo"** (`AM ? null : actor.tenantId`): com o OP nulo, vira "sem filtro" e **funciona**. São 13 lugares. Está de acordo com a regra DEC-003 (ver (3)). Só os comentários estão errados, dizendo "OP is tenant-scoped".
   - **Tipo B, "comparação"** (`x.tenantId === actor.tenantId` ou `actor.tenantId !== tenantId`, aplicado ao OP): com o OP nulo, **nunca bate**, e o resultado é lista vazia, 403 ou 404. **Estes são os defeitos reais.**
3. **Achei 7 defeitos (tipo B), em 5 áreas.** Todos estão em produção:

   | # | Onde | O que o OP vê hoje | Desde |
   |---|---|---|---|
   | D1 | Grupo › "Send portal link" (diálogo) | "0 total / 0 eligible", botão desabilitado | 30/06/2026 |
   | D2 | Grupo › envio do link | nenhum link enviado (lista vazia, sem erro) | 30/06/2026 |
   | D3 | Grupo › mudar a data com "Resend" | a data muda, mas **nenhum link sai, sem aviso** | 30/06/2026 (efeito de D2) |
   | D4 | Envio do grupo que precisa zerar a confirmação | 404 por agendamento. **Hoje não aparece**, porque D2 esvazia a lista antes; aparece assim que D2 for corrigido | 02/08/2026 |
   | D5 | Usuários › Reactivate (drawer do usuário) | 403 "You can only reactivate users from your own tenant", embora o OP possa **desativar** o mesmo usuário | 26/08/2026 |
   | D6 | Desbloquear usuário (só API, sem botão no web) | 403 "You can only unlock users from your own tenant" | 09/04/2026 |
   | D7 | Notification consents › Override | 403 "Cross-tenant access is forbidden" | 14/04/2026 |

   Há ainda um **defeito de dado errado**, não de bloqueio:

   | # | Onde | O que o OP vê hoje | Desde |
   |---|---|---|---|
   | D8 | Financial › escolher "Agency" (lista e resumo) | o filtro é ignorado: aparecem os lançamentos de **todas** as agências sob o nome da agência escolhida | 16/03/2026 (lista); 01/07/2026 (resumo) |

4. **O OP de DEV não tem agência.** A "Sarah Operator" (`cb4593d2…`) tem `tenant_id` nulo, como está registrado no reteste. O sistema também não deixa um OP ter agência: o cadastro e a edição recusam com "Internal users cannot be assigned to an agency". Por isso o tipo A funciona e o tipo B sempre falha. Se existisse um OP com agência (só por banco ou dado antigo), seria o contrário: o tipo A o prenderia àquela agência.
5. **Proposta:** corrigir em 4 fatias pequenas, uma por área (grupo, usuários, consentimento, financeiro), mais uma 5ª opcional, só de limpeza de comentários e testes. Para OP com agência nula, nenhuma fatia dá ao OP algo que a regra não dê. Em D8 a correção **estreita** o que aparece, para a agência escolhida.

---

## (1) Lista completa

Varri o backend inteiro (`apps/backend/src`) atrás de três formas:
- o ternário AM-only;
- comparações de agência com `actor.tenantId` ou `auth.tenantId`;
- o `assertTenantScope` do `AuthorizationService`, que libera só o AM.

Ficam fora da lista os pontos que comparam só para CL_ADMIN/CL_USER, que é o correto, e os que já tratam AM e OP juntos.

### Tipo B: defeitos (comparação que falha para o OP)

**D1. Plano do envio do grupo**
- Local: `modules/service-group/application/use-cases/get-group-portal-link-plan.use-case.ts:43`
  ```ts
  const inScope = input.actor.role === 'AM' ? rows : rows.filter((r) => r.tenantId === input.actor.tenantId);
  ```
- Tela: Grupo › "Send portal link". O diálogo lê `GET /v1/service-groups/:id/portal-link-plan` (`apps/web/src/features/service-groups/hooks/useGroupPortalLinkPlan.ts:21`).

**D2. Envio do grupo**
- Local: `modules/service-group/application/use-cases/send-group-portal-links.use-case.ts:122`. Mesmo filtro.
- Tela: botão de envio no mesmo diálogo (`useSendGroupPortalLinks.ts:45`).

**D3. Mudança de data do grupo com "Resend"**
- Local: `modules/service-group/application/use-cases/change-group-schedule.use-case.ts:216-226`. Chama o envio do D2 com o ator OP. O resultado vazio não lança erro, e o `try/catch` só registraria log.
- Tela: Grupo › "Change date" › estratégia "Resend".

**D4. Trava da agência no envio que zera a confirmação**
- Local: `modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case.ts:221`
  ```ts
  if (lockTenantId && input.actor.role !== 'AM' && lockTenantId !== input.actor.tenantId) throw NotFound
  ```
  O `lockTenantId` vem do envio do grupo (`send-group-portal-links.use-case.ts:195-199`, caminho `SEND_AFTER_RESET`).
- Tela: a mesma do D2. Hoje fica escondido atrás do D2.

**D5. Reativar usuário**
- Local: `modules/user/application/use-cases/reactivate-user.use-case.ts:44-52`
  ```ts
  if ((actor.role === 'CL_ADMIN' || actor.role === 'OP') && actor.tenantId !== tenantId) throw 403
  ```
- Tela: Users › drawer do usuário inativo › "Reactivate" (`apps/web/src/features/users/components/UserDetailDrawer.tsx:123,175`). A página `/users` é AM/OP (`router.tsx:468`).

**D6. Desbloquear usuário**
- Local: `modules/user/application/use-cases/unlock-user.use-case.ts:34`
  ```ts
  if (actor.role === 'OP' && actor.tenantId !== tenantId) throw 403
  ```
- Tela: nenhuma. Só a rota `POST /v1/tenants/:tenantId/users/:userId/unlock` (`user.routes.ts:341`).

**D7. Override de consentimento**
- Local: `shared/domain/authorization.service.ts:64-90`, `assertTenantScope`: "AM bypasses … All other roles — including OP … — must match". O único chamador é `modules/notification/application/use-cases/override-consent.use-case.ts:48`. A rota já aceita só AM/OP (`:30`).
- Tela: Notification consents › "Override" (`apps/web/src/features/notification-consents/components/ConsentLookup.tsx:37,86,152`, liberado para AM/OP).

**D8. Financeiro: OP ignora a agência escolhida**
- Local da lista: `modules/billing/application/use-cases/list-financial-entries.use-case.ts:98-106`. Grava `filters.tenantId = actor.tenantId!`, que é nulo, e o repositório trata nulo como "sem filtro" (`prisma-financial-entry.repository.ts:62`). O `input.tenantId` nunca é lido para o OP.
- Local do resumo: `get-financial-summary.use-case.ts:28-30`, mesma coisa (`actor.tenantId ?? undefined`).
- Tela: Financial › seletor "Agency". O web manda `tenantId` porque trata o OP como papel global (`FinancialEntriesPage.tsx:28-31`, `FinancialSummaryBar.tsx:33`).

### Tipo A: funcionam para o OP nulo (de acordo com a DEC-003; só os comentários estão errados)

| Arquivo:linha (em `modules/`) | Uso | Por que funciona |
|---|---|---|
| `appointment/.../commit-appointment-import.use-case.ts:54` | confirmar importação | `importRepo.findById(id, null)` não filtra (`prisma-appointment-import.repository.ts:8-10`) |
| `appointment/.../export-appointment-import-errors.use-case.ts:48` | baixar erros da importação | idem |
| `appointment/.../get-import-status.use-case.ts:42` | status da importação | idem |
| `appointment/.../execute-status-transition.use-case.ts:177` | mudar status do agendamento | `appointmentRepo.findById(id, null)` não filtra |
| `appointment/.../update-appointment.use-case.ts:181` | editar agendamento | idem |
| `appointment/.../bulk-edit-appointments.use-case.ts:120` | edição em massa | idem (`actor.tenantId` nulo) |
| `rental-tenant-portal/.../generate-portal-token.use-case.ts:224` | Send / Generate and copy | idem, fora do caminho do grupo (D4) |
| `rental-tenant-portal/.../get-portal-link.use-case.ts:36` | Copy Portal Link | idem; a defesa extra da `:50` vale só para CL_ADMIN |
| `rental-tenant-portal/.../list-portal-activities.use-case.ts:31` | aba Portal Activity | idem |
| `service-group/.../add-appointments-to-group.use-case.ts:79` | adicionar ao grupo | `groupRepo.findById` **ignora** o escopo (`prisma-service-group.repository.ts:239-242`) |
| `service-group/.../check-appointments-eligibility-for-group.use-case.ts:50` | checar elegibilidade | idem |
| `service-group/.../get-group-portal-link-plan.use-case.ts:34` e `send-group-portal-links.use-case.ts:114` | carregar o grupo | idem; o defeito é a linha seguinte (D1/D2) |
| `property/.../get-property.use-case.ts:64-67` | detalhe do imóvel | `findByIdWithBranch(id, null)` não filtra (`prisma-property.repository.ts:141`) |

**Risco do tipo A:** um OP com agência ficaria preso a ela. Hoje o sistema impede que isso exista (ver (4)). O risco é baixo, mas o código engana quem o lê.

Também conferi pontos que **não** são defeito:
- `force-confirm-group:74` só prende CL;
- `property-scope.service:38` e `create-property-issue:184` tratam AM e OP juntos;
- `report-access:77` vale só para a agência;
- `list-audit-logs:256` é máscara de dado pessoal por papel, não escopo de agência;
- `update-tenant:107` tem caminho próprio para o OP;
- `list-pricing-rules:63-68` já corrigido;
- `update-user:73` e `deactivate-user:43` já tratam o OP como entre agências;
- serviços de região usam `actor.tenantId ?? null`, que é nulo para o OP e funciona.

---

## (2) O que o OP vê hoje e desde quando

| # | Tela | Sintoma | Commit de origem | Em produção |
|---|---|---|---|---|
| D1 | Diálogo "Send portal link" do grupo | 0 total / 0 eligible / 0 already confirmed; envio desabilitado | `9ba1fc34` feat(service-groups): add group "Send portal link" action, 30/06/2026 | sim |
| D2 | Envio do grupo (pela API, ou se o botão habilitasse) | resposta sem itens; nenhum link | `9ba1fc34`, 30/06/2026 | sim |
| D3 | "Change date" com "Resend" | a data muda e os avisos não saem; nada na tela indica isso | via D2 | sim |
| D4 | Envio do grupo com `SEND_AFTER_RESET` | 404 `APPOINTMENT_NOT_FOUND` por agendamento (latente) | `a518b21c` fix(notifications): serialize date-change resends, 02/08/2026 | sim |
| D5 | Users › Reactivate | 403 "You can only reactivate users from your own tenant" | `9b2ff2d8` feat(users): add reactivate action, 26/08/2026 | sim |
| D6 | (API) unlock | 403 "You can only unlock users from your own tenant" | `48a6a3df` feat(permissions): centralize RBAC…, 09/04/2026 | sim |
| D7 | Consents › Override | 403 `TENANT_SCOPE_VIOLATION` "Cross-tenant access is forbidden", mais um `authorization.denied` na auditoria | `48a6a3df` (09/04/2026) + `0859eb33` (14/04/2026) | sim |
| D8 | Financial › Agency | mostra todas as agências sob o nome da escolhida | lista `1dff82bf` (16/03/2026); resumo `7628c42a` (01/07/2026) | sim |

A presença em produção foi conferida assim: os commits são ancestrais de `origin/main`, e as linhas defeituosas existem em `origin/main`. D3 e D4 não foram reproduzidos; seguem do código. D1 foi reproduzido em DEV pelo reteste (Group 29 e Group 26).

---

## (3) Defeito ou intencional?

**A regra vigente diz que o OP atua entre agências:**
- `CLAUDE.md` §6 ("Operator, cross-tenant") e §7.5 (AM/OP leem sem predicado de agência).
- Constituição v1.3.0, `.specify/memory/constitution.md:22,29`: "`AM` and `OP` are the cross-tenant roles … may act on any tenant's data when an explicit `tenantId` is supplied"; a correção `correction-op-tenant-scope.md` está "CLOSED-REJECTED".
- **`specs/DECISIONS.md` DEC-003 (19/04/2026)**: "OP is cross-tenant … Supersedes every 'OP is tenant-scoped' / 'Sprint 1 W-4-IMPL (CORRECTION-001 close-it)' note". Ela permite (a) honrar `?tenantId=` ou (b) prender a `actor.tenantId` **quando ele existir**, e é isso que torna o tipo A aceitável.
- O helper canônico `shared/domain/require-tenant-scope.ts:24-32` classifica `OP: 'cross-tenant'`.

**Classificação de cada defeito:**

| # | Evidência de "intencional" | Veredito |
|---|---|---|
| D1/D2 | Comentário "OP is tenant-scoped: only act on appointments belonging to their tenant" (`get-group-portal-link-plan:41`); testes `get-group-portal-link-plan.use-case.test.ts:120` "OP only sees its own tenant rows", `send-group-portal-links.use-case.test.ts:298`, `send-group-portal-links.integration.test.ts:279` "OP acts only on its own tenant". **Os testes usam um OP com agência, que o sistema não deixa existir.** | **Defeito.** O código é de 30/06, posterior à DEC-003 (19/04), e a contraria. Os testes provam um cenário impossível |
| D3 | nenhuma | **Defeito** (consequência de D2) |
| D4 | nenhuma específica; segue o mesmo raciocínio AM-only | **Defeito** |
| D5 | Comentário "RBAC mirrors deactivate-user… CL_ADMIN and OP are scoped to their own tenant"; teste `reactivate-user.use-case.test.ts:151` "should throw AUTH_FORBIDDEN when OP reactivates a tenant user" | **Defeito.** O comentário diz espelhar o deactivate, mas o deactivate (`deactivate-user.use-case.ts:43`) trata o OP como entre agências. O OP desativa e não consegue reativar |
| D6 | Comentário "OP can unlock users in own tenant only"; testes `unlock-user.use-case.test.ts:113,126` com OP com agência | **Defeito** (regra da era CORRECTION-001, revogada pela DEC-003). Sem tela hoje, então o impacto é baixo |
| D7 | Docstring "including OP per Sprint 1 W-4-IMPL (CORRECTION-001 close-it)"; teste `override-consent.use-case.test.ts:159` "blocks OP from overriding another tenants consent" | **Defeito.** Citação expressamente revogada pela DEC-003. Contradiz também o PR-16, em que a consulta de consentimento passou a ser entre agências para AM/OP (`apps/backend/CLAUDE.md:625`): o OP acha o consentimento e não consegue sobrepor |
| D8 | Comentário "OP is tenant-scoped per CORRECTION-001"; teste `list-financial-entries.use-case.test.ts:389` "should force OP to their own tenantId (CORRECTION-001 close-it)" | **Defeito**, já decidido antes. A decisão de set/2026 (memória "CORRECTION-001 ruling") manda alinhar `list-financial-entries` ao OP entre agências, num PR próprio com contra-testes ("PR-6"), que ainda não foi feito |

Nenhum dos oito tem spec vigente que o sustente. Todas as evidências de "intencional" são comentários ou testes que citam a CORRECTION-001, revogada.

---

## (4) O tenantId do OP em DEV, e por que isso importa

- **DEV:** o OP "Sarah Operator" (`cb4593d2…`) tem `tenant_id` **nulo**, conforme o reteste (`fase2-etapa1/reteste-dev-2026-11-24.md:738`). O seed faz o mesmo (`apps/backend/prisma/seed.ts:311`, `tenant_id: null`).
- **O sistema não deixa um OP ter agência:**
  - criação: `create-user.use-case.ts:103-106`, "Internal users cannot be assigned to an agency";
  - edição e troca de papel: `update-user.use-case.ts:131-136`, mesma recusa quando o papel final é AM/OP.
- **Como isso muda o sintoma:**

  | | OP sem agência (o real) | OP com agência (só por banco ou dado antigo) |
  |---|---|---|
  | Tipo A (escopo) | funciona: vê todas as agências | **preso** à própria agência |
  | Tipo B (comparação) | **bloqueado** em tudo: vazio, 403 ou 404 | funciona só na própria agência |
  | D8 financeiro | vê tudo, ignorando o filtro | vê só a própria agência e ignora o filtro |

- **Para o Pedro conferir em staging e produção** (somente leitura):
  ```sql
  SELECT count(*) FROM users WHERE role = 'OP' AND tenant_id IS NOT NULL AND deleted_at IS NULL;
  ```
  Se der 0, que é o esperado, os defeitos D1–D8 atingem todos os OPs de produção da forma descrita.

---

## (5) Proposta de correção em fatias

Regra comum a todas as fatias: usar o helper canônico (`requireTenantScope` / a classificação `ROLE_TENANT_SCOPE`) em vez de testar `role === 'AM'`. Assim o OP entra como entre agências por construção, e um papel novo não escapa.

### Fatia 1: grupo, envio do link (D1, D2, D3, D4), prioridade

- **O que muda:**
  - `get-group-portal-link-plan:43` e `send-group-portal-links:122`: AM e OP veem todos os membros; filtrar só se um dia um papel preso chegar aqui (hoje a rota é AM/OP).
  - `generate-portal-token:221`: o OP também passa pela trava, que fica valendo só para papéis presos.
  - D3 se resolve sozinho.
- **Arquivos:** 3 use cases, mais os testes de unidade de plano, envio e geração e o teste de integração `send-group-portal-links.integration.test.ts`. Cerca de 7 arquivos, só backend. Sem contrato, sem tela, sem migração.
- **Ampliação real:** o OP passa a mandar link a inquilinos de todas as agências do grupo. Está de acordo com a regra.
- **Proteções que continuam:** o bloqueio por agência com aviso ao inquilino desligado (regra 2 do `portal-link-eligibility.ts:16-19`); a idempotência por dia; a auditoria com a agência do agendamento (`send-group-portal-links:294`).
- **Interação com o O-11:** o envio do grupo zera CONFIRMED sem ciclo (`SEND_AFTER_RESET`). Liberar o OP aumenta quem pode disparar isso. Convém que a correção do O-11 (B, que dá ciclo a toda confirmação) já esteja em `develop`. Se não estiver, a ordem é O-11 primeiro.
- **Risco:** baixo a médio. É o único ponto que manda mensagens de verdade a inquilinos.

### Fatia 2: usuários (D5, D6)

- **O que muda:**
  - `reactivate-user:44-52`: espelhar de fato o `deactivate-user`. O OP atua em qualquer agência; usuários internos continuam só com o AM (`:55`).
  - `unlock-user:34`: o mesmo.
- **Tamanho:** 2 use cases e 2 testes. Pequeno.
- **Ampliação:** o OP reativa e desbloqueia usuários de agência. Ele já cria, edita e desativa esses usuários.
- **Ponto de atenção:** o unlock não tem rota interna. Não abrir para usuários internos.
- **Risco:** baixo.

### Fatia 3: consentimento (D7)

- **O que muda:** `AuthorizationService.assertTenantScope` passa a liberar os papéis entre agências (AM e OP), pela mesma classificação do helper. O docstring da CORRECTION-001 sai.
- **Tamanho:** 1 serviço, 1 use case de teste e o teste do serviço. Pequeno. Hoje o único chamador é o override.
- **Ampliação:** o OP sobrepõe consentimento de qualquer agência. A tela já mostra o botão ao OP, e a rota já é AM/OP. A auditoria do override continua.
- **Risco:** baixo. Como o serviço é compartilhado, o teste precisa provar que CL_ADMIN e CL_USER continuam presos.

### Fatia 4: financeiro (D8), o "PR-6" já decidido

- **O que muda:** em `list-financial-entries:98-106` e `get-financial-summary:28-30`, o OP passa a honrar `input.tenantId` como o AM. Sem agência escolhida, continua vendo tudo.
- **Ponto de atenção:** o `includePlatformBonus` do OP (`:105`). Com a agência escolhida, o repositório já faz "essa agência **ou** o bônus da plataforma" (`prisma-financial-entry.repository.ts:62-67`). Manter.
- **Auditoria:** registrar `financial_entry.cross_tenant_list` também para o OP, como para o AM (`:83-95`).
- **Tamanho:** 2 use cases e testes. Pequeno.
- **Não amplia nada:** hoje o OP já vê tudo. Passa a ver **só** a agência escolhida, ou seja, a correção estreita o resultado.
- **Risco:** baixo.

### Fatia 5 (opcional): limpeza do tipo A

- **O que muda:** trocar os 13 `role === 'AM' ? null : actor.tenantId` por `requireTenantScope` e apagar os comentários "OP is tenant-scoped / CORRECTION-001".
- **Comportamento:** nenhuma mudança para OP sem agência. Muda só para o OP com agência, que hoje não existe.
- **Tamanho:** cerca de 13 use cases e testes. Médio em número de arquivos, baixo em risco. Pode ir no fim, ou ser estacionado.

### Checklist de ampliação de RBAC (vale para as fatias 1, 2 e 3)

1. **Teste de rota com a afirmação contrária:** procurar `OP` nos testes de rota de cada endpoint (`apps/backend/tests/integration/**`). Os testes que mocam o use case continuam verdes mesmo provando o oposto. Corrigir ou apagar.
2. **Testes com OP com agência** (`unlock-user.test:113,126`, `reactivate-user.test:151`, `override-consent.test:159`, `get-group-portal-link-plan.test:120`, `send-group-portal-links.test:298`, `send-group-portal-links.integration.test:279`, `list-financial-entries.test:389`): reescrever com **OP `tenantId: null`**, que é o real.
3. **Par positivo e negativo em cada fatia:**
   - OP nulo atua em uma agência X e em uma agência Y;
   - **CL_ADMIN da agência X continua recebendo 404/403 na Y**;
   - INSP e CL_USER continuam fora.
   - Mock de repositório fiel ao nulo: `tenantId == null || tenantId === x`.
4. **Mutação em 2 estágios** onde há defesa em profundidade: tirar o filtro, depois tirar o filtro e a guarda, e ver os testes negativos quebrarem.
5. **Coordenadas:** nenhuma dessas fatias expõe lat/lng; manter a regra do §7.9.
6. **Docs que uma sessão futura leria como regra e usaria para desfazer a correção:**
   - os docstrings e comentários citados em (3);
   - `specs/015-permissions-rbac-matrix/spec.md` e as specs listadas na DEC-003, nos trechos que ainda dizem "OP tenant-scoped";
   - `docs/superpowers/specs/2026-05-24-portal-inquilino-redesign.md:420` ("OP/CL_ADMIN/CL_USER own tenant").
   - Atualizar no mesmo PR de cada fatia. O `CLAUDE.md` do backend ganha uma linha se a convenção "usar `requireTenantScope`, nunca `role === 'AM'`" for adotada.
7. **Smoke em DEV** como OP sem agência, para cada tela: diálogo do grupo com membros de 2 agências; Reactivate; Override; Financial com agência escolhida. Só com contatos fictícios.

### Ordem sugerida

**Fatia 1** (após o O-11 em `develop`) → **Fatia 3** → **Fatia 2** → **Fatia 4** → Fatia 5 opcional.

Cada fatia é um PR, só de backend, de 2 a 7 arquivos de código mais os testes. Nenhuma mexe em tela nem em contrato, então não passam pelo gate de design nem pela fila do api-types.

### Decisões para o Pedro

1. **Corrigir D1–D4 já, depois do O-11?** Recomendo sim. É o caso que travou o reteste, e o OP é quem opera os grupos.
2. **D6 (unlock, sem tela):** corrigir junto com D5, ou estacionar? Recomendo junto, porque é uma linha e evita outra divergência.
3. **Fazer a fatia 5 de limpeza agora ou estacionar?** Recomendo estacionar. Não muda comportamento.
4. **Rodar a consulta de (4) em staging e produção** antes da fatia 1, para confirmar que não há OP com agência.
