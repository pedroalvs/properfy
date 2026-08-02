# Task 2 — Atomic date-change resend eligibility

## Status

Implementada a correção do finding transacional do CodeRabbit para `SEND_AFTER_RESET`.

O snapshot do grupo pode continuar classificando o item como habilitado, mas a execução agora:

1. abre uma única transação por item `SEND_AFTER_RESET`;
2. relê e bloqueia (`FOR UPDATE`) a configuração autoritativa da agência;
3. somente então rotaciona o ciclo;
4. relê a política ainda sob o mesmo lock;
5. cria o token e vincula o ciclo na mesma transação;
6. executa auditorias e o dispatch result-bearing somente após o commit.

`TENANT_NOTIFICATIONS_BLOCKED` antes do commit deixa o ciclo confirmado original, o token e os audits de ciclo intactos.

## RED real

Antes de qualquer mudança de produção, foi adicionado um teste Postgres-real em:

- `apps/backend/tests/integration/db/send-group-portal-links.integration.test.ts`

Comando:

```bash
pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts \
  tests/integration/db/send-group-portal-links.integration.test.ts \
  -t "rolls back a stale-confirmation reset"
```

Resultado RED observado:

```text
FAIL  rolls back a stale-confirmation reset
expected active_confirmation_cycle_id 06626199-... to be dd104ca9-...
Test Files  1 failed
Tests       1 failed | 2 skipped
```

O resultado público já era `TENANT_NOTIFICATIONS_BLOCKED`; a falha demonstrou especificamente que o banco havia substituído o ciclo confirmado por um novo ciclo `PENDING`. Não foi erro de mock ou setup.

Depois do GREEN inicial, o teste foi fortalecido: ele agora persiste a flag real como `false` depois de capturar o snapshot habilitado do grupo, usa `GeneratePortalTokenUseCase` e repositórios Prisma reais, e verifica também que nenhum audit `appointment_confirmation_cycle.*` vazou.

## Arquitetura escolhida

### Fronteira atômica

`SendGroupPortalLinksUseCase` usa o `runInTransaction` existente para compor, sem transação aninhada:

- policy precheck;
- `ConfirmationCycleService.rotateOnDateChange(..., tx, defer)`;
- segundo policy check;
- mint/revogação do portal token;
- `ConfirmationCycleService.createInitial(..., tx, defer)`.

O `PrismaTenantRepository.findById(..., tx, true)` executa `SELECT ... FOR UPDATE`. Assim, um update concorrente da flag espera o commit/rollback da operação e não invalida a decisão durante os writes.

### Efeitos pós-commit

O `TransactionalResult<T>` existente só representa output disponível antes do commit mais efeitos `Promise<void>`. O status do dispatch (`SENT`, `NO_PRIMARY_CONTACT`, `DISPATCH_FAILED`) só existe depois do commit e precisa voltar ao chamador.

Foi adicionada ao mesmo Unit of Work a extensão mínima `AfterCommitResult<T>`/`afterCommitResult()`:

- não expõe um sucesso de dispatch antes de ele ocorrer;
- compartilha exatamente uma execução/Promise entre chamadas repetidas;
- permite que `GeneratePortalTokenUseCase.execute()` preserve seu contrato público;
- mantém notificação/queue fora da transação.

Os audits de `created`, `updated`, `rotated` e `token_generated` também usam `defer` nessa composição. Um rollback descarta todos eles.

### Retry

O retry de colisão de `token_hash` continua envolvendo a unidade inteira. Como uma violação unique aborta a transação PostgreSQL, cada tentativa abre uma nova transação e repete policy check, rotation, mint e cycle link.

## Alternativas avaliadas

1. **Apenas reler a flag antes do reset** — rejeitada: permanece uma janela entre o read e o commit.
2. **Rotacionar e compensar se GeneratePortalToken bloquear** — rejeitada: reconstruir ciclo, token e audits anteriores seria mais frágil que rollback nativo.
3. **Executar GeneratePortalToken em transação aninhada** — rejeitada: usaria outra conexão, não enxergaria writes não commitados e não faria rollback junto.
4. **Enviar notificação dentro da transação** — rejeitada: queue/email são irreversíveis, podem usar outra conexão e podem deadlockar/esgotar pool.
5. **Usar diretamente `TransactionalResult<T>` para o dispatch** — não implementável sem output mutável ou falso sucesso pré-commit; por isso a extensão result-bearing ficou centralizada no Unit of Work.

## Arquivos alterados

### Produção

- `apps/backend/src/main/container.ts`
- `apps/backend/src/shared/application/unit-of-work.ts`
- `apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts`
- `apps/backend/src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case.ts`
- `apps/backend/src/modules/service-group/application/use-cases/send-group-portal-links.use-case.ts`
- `apps/backend/src/modules/tenant/domain/tenant.repository.ts`
- `apps/backend/src/modules/tenant/infrastructure/prisma-tenant.repository.ts`

### Testes

- `apps/backend/src/shared/application/unit-of-work.test.ts`
- `apps/backend/tests/unit/service-group/send-group-portal-links.use-case.test.ts`
- `apps/backend/tests/unit/tenant-portal/generate-portal-token.use-case.test.ts`
- `apps/backend/tests/integration/db/send-group-portal-links.integration.test.ts`

## GREEN / verificação

Resultados observados após a correção final:

- Unit focado de SendGroup + GeneratePortalToken: **46/46**.
- Unit adjacente de UnitOfWork + ConfirmationCycle + GeneratePortalToken: **32/32**.
- Postgres-real do arquivo de integração: **4/4**.
- Backend typecheck: **PASS**.
- Backend build: **PASS**.
- Backend lint: **PASS, 0 errors**; warnings preexistentes do repositório.
- Backend suite ampla: **459 files / 5.505 tests PASS** no gate final antes do commit.
- `git diff --check`: **PASS**.

O teste de integração cobre:

- leitura multitenant existente;
- SEND normal para OP/AM;
- flip real depois do snapshot habilitado e rollback sem cycle/audit leak;
- lock real: update concorrente da policy aguarda o commit da transação.

## Self-review independente

Primeira revisão encontrou três pontos:

1. audit `appointment_confirmation_cycle.updated` ainda antecipado;
2. policy join stale sem lock autoritativo;
3. handle result-bearing local em vez de centralizado no Unit of Work.

Os três foram corrigidos. A re-review final retornou:

```text
No remaining Critical or Important findings.
Verdict: Approve / merge-ready for Task 2.
```

## Commit

Commit Conventional Commit planejado/incluído nesta entrega:

```text
fix(notifications): make date-change resend atomic
```

Sem atribuição a IA.

## Preocupações residuais

1. O lock garante a policy durante os writes e o commit. Ele não pode permanecer depois do commit sem manter a transação aberta durante um efeito irreversível. Se a flag for desligada imediatamente após o commit e antes do worker enviar, o gate autoritativo do `SendNotificationUseCase` ainda falha fechado e suprime a mensagem; o resultado síncrono pode ter sido calculado antes dessa supressão assíncrona.
2. `FOR UPDATE` serializa updates da mesma agência durante a curta transação por item. O loop do grupo é sequencial, limitando contenção, mas grupos grandes com alteração simultânea da configuração podem observar espera momentânea.
3. Os ports de repositório existentes já expõem `Prisma.TransactionClient`; esta mudança seguiu o padrão introduzido em `develop`. Remover Prisma da camada de ports requer refactor arquitetural separado e não foi ampliado nesta correção.
