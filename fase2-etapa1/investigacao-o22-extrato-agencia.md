# Investigação O-22: débitos da agência somem do extrato do CL_ADMIN

> Só análise, sem código, sem PR. Base: `origin/develop` em `f68ee253`. Data: 25/11/2026.
> Fato: `reteste-dev-2026-11-24.md:800` (B1) e `:817` (O-22).

## Conclusão (leia isto primeiro)

1. **Não é defeito de produto. É a forma dos dados de teste de DEV.**
   - O débito de agência que nasce no DONE é gravado **sem inspetor** (`inspector_id = null`), desde a primeira versão do módulo (16/03/2026).
   - Os dois débitos que somem, SPS-004 ($150, aprovado) e SPS-003 ($160, pendente), não vieram do DONE. Vieram do **seed** (`apps/backend/prisma/seed.ts`), que os grava **com** o inspetor preenchido.
2. **Por que somem.**
   - O extrato da agência esconde todo lançamento que tem inspetor (`inspector_id IS NULL` obrigatório). É assim que a perna do inspetor fica fora do extrato.
   - Um débito de agência com inspetor preenchido cai nesse filtro e some.
   - A tela do OP mostra "Entity" = inspetor pelo mesmo motivo: o campo está preenchido.
3. **Em produção, com um débito real do DONE, não acontece.**
   - O único caminho de código que cria `TENANT_DEBIT` é o DONE (também usado pelo script de backfill), e ele sempre grava `inspector_id = null`.
   - Só um dado inserido fora do código (seed ou carga manual) teria esse formato. A consulta só leitura da seção 3 confirma.
4. **Desde quando.**
   - O seed tem esse formato desde 19/03/2026 (`e8c1cf1c`).
   - O sintoma só aparece desde 29/07/2026 (`371d4521`), quando o extrato passou a esconder lançamentos com inspetor.
   - **Mesma situação na Melbourne:** o débito MRE-003 ($140) do seed também tem inspetor e também some do extrato do CL_ADMIN da Melbourne.
5. **Correção mínima: corrigir o seed, não o filtro.**
   - Gravar `inspector_id: null` nos 3 débitos do seed (fe1, fe3, fe8).
   - Corrigir as linhas que já existem em DEV, porque o seed usa `upsert` com `update: {}` e não reescreve linha existente.
   - Mexer no filtro do extrato **ampliaria** o que a agência vê, sem necessidade, e abriria risco de mostrar a identidade do inspetor.
   - Opcional: uma trava no domínio, ou um CHECK no banco, que impeça débito ou reembolso com inspetor.

---

## 1. Por que a agência não vê esses dois débitos

### O predicado exato

`apps/backend/src/modules/billing/application/use-cases/list-financial-entries.use-case.ts:109-128`. Para CL_ADMIN/CL_USER:
- `filters.tenantId = requireAgencyTenantScope(actor)`, ou seja, a própria agência;
- `filters.excludeInspectorScoped = true` (`:120`);
- `filters.entryTypeIn = AGENCY_VISIBLE_ENTRY_TYPES`, que são `TENANT_DEBIT`, `REFUND` e `MANUAL_ADJUSTMENT` (`packages/shared/src/enums/financial.ts:28-32`).

No repositório (`apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts:78`):

```ts
if (filters.excludeInspectorScoped) where.inspector_id = null;
```

O SQL final da agência é:

```sql
tenant_id = <agência>
AND entry_type IN ('TENANT_DEBIT','REFUND','MANUAL_ADJUSTMENT')
AND inspector_id IS NULL
```

O resumo ("Approved debits", pending) usa o mesmo par de condições, em `getSummary` com `agencyScoped` (`prisma-financial-entry.repository.ts:103-106`). O relatório Financial da agência (`report/infrastructure/prisma-report-data-reader.ts:190-193`) e a exportação (`export-agency-financial.use-case.ts:78`) também.

### Por que um TENANT_DEBIT casa com esse predicado

O filtro não olha o tipo. Olha se há inspetor. O motivo está em `financial.ts:21-23` e `list-financial-entries.use-case.ts:117-119`: um `MANUAL_ADJUSTMENT` ligado a inspetor é a perna do inspetor e passaria pelo filtro de tipo. Por isso a regra é "nenhum lançamento com inspetor", qualquer que seja o tipo.

Funciona porque os débitos e reembolsos criados pelo sistema nunca têm inspetor. Um `TENANT_DEBIT` com `inspector_id` preenchido viola essa premissa e é excluído como se fosse perna do inspetor.

---

## 2. Defeito de produto ou dado de DEV? Como os dois lançamentos foram criados

### Débito gerado no DONE (produto)

`apps/backend/src/modules/billing/application/use-cases/create-financial-entries-on-done.use-case.ts:83-103`:

```ts
const debitEntry = new FinancialEntryEntity({
  id: debitEntryId,
  tenantId: appointment.tenantId,
  appointmentId,
  inspectorId: null,            // ← débito da agência nunca leva inspetor
  entryType: 'TENANT_DEBIT',
  ...
  initiatedByUserId: null,
```

O repasse do mesmo DONE é que leva o inspetor (`:147`, `inspectorId: appointment.inspectorId`). O formato é o mesmo desde o commit que criou o módulo (`1dff82bf`, 16/03/2026, `inspectorId: null` na linha 56 daquela versão).

**Todos os outros criadores de lançamento de agência também gravam sem inspetor:**

| Criador | Tipo | `inspectorId` |
|---|---|---|
| DONE (`create-financial-entries-on-done.use-case.ts:89`) | TENANT_DEBIT | `null` |
| Backfill (`src/scripts/backfill-financial-entries-on-done.ts:27,163`) | TENANT_DEBIT | reusa o use case do DONE → `null` |
| Reembolso manual (`create-refund.use-case.ts:133`) | REFUND | `null` |
| Compensação DONE→REJECTED (`compensate-financial-on-done-rejected.handler.ts:70`) | REFUND da agência | `null` (a reversão do repasse, `:120`, leva o inspetor, como deve) |
| Ajuste manual (`create-manual-adjustment.use-case.ts:80`) | MANUAL_ADJUSTMENT | o que o operador escolher; é o caso que o filtro existe para esconder |

A edição de lançamento (`update-financial-entry.use-case.ts:20-23`) só muda valor e descrição. Não muda o inspetor.

### Os dois lançamentos de DEV (seed)

`apps/backend/prisma/seed.ts:1021-1043`:

```ts
// apptDone: approved debit + payout
{ id: IDS.fe1, tenant_id: IDS.tenant, appointment_id: IDS.apptDone, inspector_id: IDS.inspectorLinked,
  entry_type: 'TENANT_DEBIT', amount: 150.00, status: 'APPROVED',
  description: 'Routine inspection at 200 Pacific Hwy, Crows Nest', initiated_by_user_id: IDS.userOP, ... },
// apptDone2: pending debit + payout
{ id: IDS.fe3, tenant_id: IDS.tenant, appointment_id: IDS.apptDone2, inspector_id: IDS.inspectorIndep,
  entry_type: 'TENANT_DEBIT', amount: 160.00, status: 'PENDING',
  description: 'Routine inspection at 5 Blue St, North Sydney', initiated_by_user_id: IDS.userOP },
```

- 200 Pacific Hwy é o imóvel **SPS-004**, e 5 Blue St é o **SPS-003** (`seed.ts:572-573`). Valores e status batem com o reteste.
- O seed grava `inspector_id` preenchido e `initiated_by_user_id = OP`. O DONE grava os dois como `null`. Pelo formato, essas linhas não vieram do DONE.
- O terceiro débito do seed, da Melbourne (`fe8`, `seed.ts:1076-1082`, MRE-003, $140, aprovado), tem o mesmo problema. O CL_ADMIN da Melbourne também vê "Approved debits $0.00".
- O seed usa `prisma.financialEntry.upsert({ where: { id }, update: {}, create: … })` (`seed.ts:1092-1096`). Rodar o seed de novo **não corrige** linha que já existe.

**Veredito:** é dado de teste de DEV com formato que o produto nunca gera. Não é defeito do extrato.

---

## 3. Produção: aconteceria com um débito real do DONE?

**Pelo código, não.** Em `origin/develop`, o único criador de `TENANT_DEBIT` é o DONE (direto ou pelo backfill), e ele grava `inspector_id = null`. Os débitos reais aparecem no extrato da agência.

O código não cobre dado que entrou por fora: seed rodado no ambiente, carga do sistema antigo, SQL manual. Não acessei staging nem produção. Consulta só leitura para o Pedro:

```sql
-- Débitos/reembolsos de agência que o extrato da agência esconderia indevidamente
SELECT entry_type, status, count(*) AS total, sum(amount) AS valor
FROM financial_entries
WHERE entry_type IN ('TENANT_DEBIT', 'REFUND')
  AND inspector_id IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;
```

- Esperado em produção: **nenhuma linha**.
- Em DEV deve listar os 3 débitos do seed: SPS $150 APPROVED, SPS $160 PENDING, MEL $140 APPROVED.
- Se aparecer algo em produção, a agência está deixando de ver débitos reais no extrato, no resumo, na exportação e no relatório. Aí vira defeito de dado em produção, para o Pedro decidir.

---

## 4. Desde quando

| Data | Commit | O que aconteceu |
|---|---|---|
| 16/03/2026 | `1dff82bf` | Módulo financeiro; o DONE já grava débito sem inspetor. |
| 19/03/2026 | `e8c1cf1c` | Seed passa a gravar os débitos `fe1`, `fe3` e `fe8` **com** inspetor. |
| 29/07/2026 | `371d4521` "fix(billing): stop agency reads leaking the platform-inspector leg" | Extrato, resumo, exportação e relatório da agência passam a exigir `inspector_id IS NULL`. **A partir daqui os débitos do seed somem para a agência.** |

O PR #1416 (O-19 D8, mergeado hoje) não mexeu no ramo da agência. O O-22 apareceu no reteste desse PR porque foi a primeira vez que alguém comparou a tela do OP com a do CL_ADMIN lado a lado.

---

## 5. Correção mínima, testes e risco de vazamento

### Correção recomendada (só dados de teste)

1. **Seed:** `inspector_id: null` em `fe1`, `fe3` e `fe8`, como o DONE grava. Também `initiated_by_user_id: null`, para o seed imitar o sistema. Os repasses `fe2`, `fe4` e `fe9` continuam com inspetor.
2. **Linhas que já existem em DEV:** o `upsert` com `update: {}` não as corrige. Há duas opções; a escolha é do Pedro (decisão 1):
   - (a) acertar as 3 linhas em DEV uma única vez (`UPDATE financial_entries SET inspector_id = NULL WHERE entry_type = 'TENANT_DEBIT' AND inspector_id IS NOT NULL`), **só em DEV**, por quem tem acesso;
   - (b) fazer o `upsert` desses lançamentos atualizar `inspector_id` no `update`, e rodar o seed de novo em DEV.

**Tamanho:** 1 arquivo (`seed.ts`) + 1 teste. Nenhuma mudança de produto, de contrato ou de tela.

**Resultado esperado em DEV depois da correção:**
- CL_ADMIN SPS: 5 lançamentos, com os 2 débitos. Approved debits $150, pending 2.
- O OP com a SPS escolhida continua vendo 7, agora com os débitos sem "Entity" de inspetor.
- CL_ADMIN Melbourne: Approved debits $140.

### Opcional: trava para não depender só da disciplina (decisão 2)

- **No domínio:** `FinancialEntryEntity` recusa `TENANT_DEBIT` ou `REFUND` com `inspectorId` preenchido. Pequeno, cobre todo o código.
- **No banco:** `CHECK (entry_type NOT IN ('TENANT_DEBIT','REFUND') OR inspector_id IS NULL)`. Cobre também seed e SQL manual. Antes, precisa da consulta da seção 3 dar zero em **todos** os ambientes; senão a migration falha no deploy. Em DEV, só depois do passo 2.

### O que NÃO fazer

Trocar o predicado da agência por algo como "`inspector_id IS NULL` **ou** `entry_type = 'TENANT_DEBIT'`":
- **Amplia** a visibilidade da agência sem necessidade: em produção não há débito real com inspetor.
- A resposta do extrato carrega `inspectorId` e `relatedEntityName` (`list-financial-entries.use-case.ts:27-50`). Um débito com inspetor passaria a mostrar à agência **quem é o inspetor** e o nome dele na coluna "Entity". O repasse continuaria escondido, mas é uma exposição que não existe hoje.

### Risco de vazar a perna do inspetor

Com a correção recomendada, **nenhum**:
- O filtro da agência não muda: continua exigindo tipo da lista permitida **e** `inspector_id IS NULL`.
- Repasse (`INSPECTOR_PAYOUT`) e bônus (`INSPECTOR_BONUS`, sem `tenant_id`) continuam fora pelos dois critérios.
- Ajuste ligado a inspetor continua fora pelo `inspector_id`.
- As linhas que passam a aparecer são débitos da própria agência, sem inspetor.

### Testes

1. **Prova do produto (integração em banco).** DONE de um agendamento da agência A → `ListFinancialEntriesUseCase` e `GetFinancialSummaryUseCase` como CL_ADMIN da A. O débito aparece, entra em "Approved debits" depois de aprovado e vem com `inspectorId = null`. O repasse do mesmo DONE **não** aparece. Fecha a pergunta "um débito real some?" com teste, não só com leitura de código.
2. **Guarda contra regressão da perna do inspetor** (mantém o que já existe): como CL_ADMIN, nenhum `INSPECTOR_PAYOUT`, nenhum `INSPECTOR_BONUS` e nenhum `MANUAL_ADJUSTMENT` com inspetor, nem com `type` forçado na query (403 para os tipos fora da lista).
3. **Forma do seed:** um teste que lê os lançamentos do seed (ou roda o seed em banco de teste) e falha se algum `TENANT_DEBIT` ou `REFUND` tiver `inspector_id`.
4. Se a trava opcional entrar: teste de unidade da entidade recusando `TENANT_DEBIT` com inspetor; teste da migration (CI roda `migrate deploy` 2×).

---

## 6. Decisões para o Pedro

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Como acertar as 3 linhas que já existem em DEV: `UPDATE` único só em DEV, ou `upsert` do seed que atualiza `inspector_id` | `upsert` que atualiza: fica no código e serve para qualquer DEV recriado. |
| 2 | Trava contra débito ou reembolso com inspetor: nenhuma, no domínio ou no banco (CHECK) | No domínio, junto com o seed. O CHECK no banco só depois da consulta da seção 3 dar zero em staging e produção. |
| 3 | Rodar a consulta da seção 3 em staging e produção | Sim, só leitura, antes de fechar o O-22 como "dado de DEV". |
