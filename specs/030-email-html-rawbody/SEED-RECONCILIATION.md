# SEED RECONCILIATION — tarefa do Executor (separada da feature de email)

> Coordenação: GUIA. NÃO toque na feature de email (já validada). Esta é manutenção da DEMO SEED, dessincronizada com mudanças acumuladas do develop. Ao terminar, handoff "Ready for QA" → GUIA. Sem peer-to-peer.

## Objetivo
Fazer `pnpm --filter backend prisma:seed` **E** `pnpm --filter backend prisma:refresh-demo` rodarem **100% até o fim** contra o schema atual (merged com develop). Reportar contagens finais (appointments, service_groups, contacts, financial_entries, etc.).

## Causa raiz
A demo seed (`apps/backend/prisma/seed.ts` e `refresh-demo-seed.ts`) referencia shapes/campos antigos. Mudanças do develop que quebram: 021-contacts (appointment_contacts virou junção/snapshot), #37 (ServiceGroup perdeu tenant_id), pricing ganhou `currency`, Branch não tem @@unique([tenant_id,name]).

## JÁ corrigido por Guia (NÃO-commitado, em disco em seed.ts)
- 4 upserts de Branch: `where: { id: IDS.branchX }` (antes usavam `tenant_id_name` inexistente).
- 6 upserts de ServiceGroup: removido `tenant_id` do create (campo não existe mais).
- Pricing rules: `create: { ...pr, currency: 'AUD' }` (2 lugares).
Resultado atual: a seed avança até appointments (14 criados ✅, 10 properties ✅) e morre em appointment_contacts.

## Remanescente a corrigir (cascata)
1. **appointment_contacts** (seed.ts ~750): usa `where:{appointment_id}` (não-unique) + create `{appointment_id, tenant_name, primary_email, primary_phone}` — shape ANTIGO. O model mudou (021-contacts: junção contacts + appointment_contacts snapshot). Reconcilie com o model atual (veja schema.prisma + a feature 021-contacts). Provavelmente precisa criar `contacts` e ligar via `appointment_contacts`.
2. **refresh-demo-seed.ts:~170**: `prisma.serviceGroup.count({where:{tenant_id:...}})` — ServiceGroup não tem tenant_id. Ajuste a contagem/deleção de service-groups demo (cross-tenant) — ex: contar por relação a appointments/created_by, ou remover o filtro tenant_id.
3. Rode e corrija qualquer mismatch ADICIONAL que aparecer (financials, notifications, availability, etc.) até ambos os scripts completarem.

## Notas de ambiente
- PostGIS: já re-habilitado (CREATE EXTENSION postgis). O schema usa tipo `geometry`.
- Sem `_prisma_migrations` (schema via `prisma db push`, não migrate). Use `prisma db push` se precisar sincronizar.
- DB atual tem dados parciais (14 appts, 10 props, 1 template EMAIL de teste criado pelo Guia). `refresh-demo` limpa o conjunto demo e re-semeia — é o caminho idempotente.
- Credenciais demo: todos os users com senha `Admin@1234`.

## Verificação final
`prisma:seed` e `prisma:refresh-demo` rodam até o fim sem erro. Reporte contagens via psql. lint/typecheck do backend verdes. Handoff → GUIA.
