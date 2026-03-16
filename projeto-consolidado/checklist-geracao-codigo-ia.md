# Properfy - Checklist de Decisões para Geração de Código por IA

Objetivo: fechar as decisões de implementação que impactam diretamente a qualidade e consistência do código gerado por IA.

## Status

1. `PENDENTE` = ainda precisamos decidir
2. `DEFINIDO` = decisão fechada

## 1. Backend e Estrutura

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-01 | Framework backend | `Fastify` ou `NestJS` | DEFINIDO | `Fastify` |
| IA-02 | Estrutura do monólito clean | `modules/domain/application/infrastructure/interfaces` | DEFINIDO | `src/modules/<modulo>/{domain,application,infrastructure,interfaces}` + `src/shared` + `src/main` |
| IA-03 | Gerenciador de pacotes | `pnpm` | DEFINIDO | `pnpm` |
| IA-04 | Organização monorepo | `apps/` + `packages/` | DEFINIDO | `apps/backend`, `apps/web`, `apps/pwa`, `packages/shared` |

## 2. API e Contratos

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-05 | Estilo da API | REST | DEFINIDO | `REST` |
| IA-06 | Versionamento da API | `/v1` | DEFINIDO | prefixo `/v1` |
| IA-07 | Padrão de resposta | resposta direta ou envelope | DEFINIDO | resposta direta para sucesso; resposta paginada com metadados quando aplicável |
| IA-08 | Padrão de erro | formato único para erros | DEFINIDO | envelope padronizado em `error.code`, `error.message`, `error.details` |
| IA-09 | Paginação/filtros | convenção única | DEFINIDO | paginação com `page` e `pageSize`; ordenação com `sortBy` e `sortOrder`; filtros por query string |

## 3. Validação e Tipagem

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-10 | Validação de payload | `zod` | DEFINIDO | `zod` |
| IA-11 | Contratos compartilhados | `packages/shared` com schemas/types | DEFINIDO | `packages/shared` para schemas, types, enums e contratos compartilhados |
| IA-12 | Convenção de nomes | `camelCase` no código, `snake_case` no banco | DEFINIDO | `camelCase` na aplicação Node/TypeScript e `snake_case` no banco PostgreSQL |

## 4. Testes e Qualidade

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-13 | Framework de testes unit/integration | `Vitest` | DEFINIDO | `Vitest` |
| IA-14 | Framework E2E API | `Supertest` | DEFINIDO | `Supertest` |
| IA-15 | Framework E2E frontend | `Playwright` | DEFINIDO | `Playwright` |
| IA-16 | Convenção TDD | teste antes de código em todo PR | DEFINIDO | TDD obrigatório por PR |

## 5. Filas, Jobs e Eventos

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-17 | Tecnologia de fila | `pg-boss` | DEFINIDO | `pg-boss` (PostgreSQL-backed, sem Redis) |
| IA-18 | Convenção de jobs | `domain.action` | DEFINIDO | jobs nomeados como `domain.action` |
| IA-19 | Eventos internos | nomes versionados | DEFINIDO | eventos internos versionados, ex.: `appointment.created.v1` |

## 6. Observabilidade e Auditoria

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-20 | Logger | logger único centralizado | DEFINIDO | logger único centralizado |
| IA-21 | Auditoria | serviço central de audit log | DEFINIDO | serviço central de audit log |
| IA-22 | Correlation id | `request_id` obrigatório | DEFINIDO | `request_id` obrigatório em API e jobs |

## 7. Fronteira Frontend/Backend

| ID | Item | Exemplo de decisão | Status | Decisão final |
|---|---|---|---|---|
| IA-23 | Shared types | sim ou não | DEFINIDO | `packages/shared` para enums, ids, tipos basicos e schemas reutilizaveis |
| IA-24 | Geração de client API | manual ou gerado via OpenAPI | DEFINIDO | client gerado via OpenAPI, com contrato formal como fonte de verdade da API |

## 8. Critério de pronto para IA codar com qualidade

Podemos considerar a fase pronta quando:

1. todos os itens acima estiverem `DEFINIDO`
2. state machine estiver formalizada
3. modelo de dados estiver formalizado
4. RBAC estiver consolidado
5. contratos principais de API estiverem decididos
