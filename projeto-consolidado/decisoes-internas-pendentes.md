# Properfy - Decisões Internas Pendentes (Guia de Fechamento)

Objetivo: fechar decisões técnicas/operacionais internas que não dependem de regra de negócio do cliente.

Como usar:

1. Decidir item a item aqui no chat.
2. Atualizar `Status` para `DEFINIDO`.
3. Preencher `Decisão final` com valor objetivo.

Legenda de status:

1. `PENDENTE` = falta decidir internamente.
2. `DEFINIDO` = decisão fechada.

---

## 1) Plataforma Backend

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-01 | Framework HTTP | Fastify (com arquitetura clean em módulos) | DEFINIDO | `Fastify` |
| INT-02 | Estrutura de projeto | Monorepo com `apps/` e `packages/` | DEFINIDO | Backend em estrutura clean por módulos: `src/modules/<modulo>/{domain,application,infrastructure,interfaces}` + `src/shared` + `src/main` |
| INT-03 | Gerenciador de pacotes | `pnpm` | DEFINIDO | `pnpm` |
| INT-04 | Validação de entrada | `zod` (DTO/validação de payload) | DEFINIDO | `zod` |
| INT-05 | Mapeamento ORM | Prisma + SQL raw apenas quando necessário | DEFINIDO | Prisma como padrão; SQL raw apenas para consultas críticas ou complexas |

## 2) Auth e Segurança de Aplicação

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-06 | TTL access token | 15 minutos | DEFINIDO | `15 minutos` |
| INT-07 | Sessão/refresh | Tabela de sessões + rotação de refresh token (10 dias já definido) | DEFINIDO | Tabela de sessões + refresh token rotativo com validade de 10 dias |
| INT-08 | Política de senha | mínimo 10 caracteres + complexidade mínima | DEFINIDO | mínimo de 8 caracteres + maiúscula + minúscula + número + caractere especial + blacklist de senhas comuns + sem expiração forçada |
| INT-09 | 2FA para Admin Master | habilitar no MVP (sim/não) | DEFINIDO | 2FA obrigatório para `Admin Master` desde a primeira versão |
| INT-10 | Auditoria de segurança | log de login, falha, lock, revoke, troca de senha | DEFINIDO | Auditar login, falha, lock, revoke, refresh e troca de senha |

## 3) Dados e Persistência

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-11 | Estratégia de multi-tenant no DB | `tenant_id` obrigatório + filtros por repositório | DEFINIDO | `tenant_id` obrigatório nas entidades de negócio + escopo obrigatório nos repositórios |
| INT-12 | Convenção de soft delete | `deleted_at` para entidades operacionais | DEFINIDO | usar `deleted_at` em entidades operacionais e cadastrais; não usar em tabelas naturalmente imutáveis/auditáveis |
| INT-13 | Índices críticos | índices para busca por status/data/tenant e auditoria | DEFINIDO | índices críticos definidos por padrão para `tenant_id`, `status`, `scheduled_at/date`, `service_type`, `inspector_id`, `branch_id` e auditoria por entidade/data |
| INT-14 | Estratégia de seed | seed mínima para dev/staging | DEFINIDO | seed mínima para `dev` e `staging`; sem seed em `prod` |

## 4) Fila, Jobs e Integrações

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-15 | Tecnologia de fila | Redis + BullMQ | DEFINIDO | `Redis + BullMQ` |
| INT-16 | Separação de workers | worker dedicado para notifications/imports/finance | DEFINIDO | Workers dedicados para `notifications`, `imports` e `finance` |
| INT-17 | Protocolo de eventos internos | contratos versionados (nome + payload + versão) | DEFINIDO | Eventos internos versionados por nome e payload |
| INT-18 | Estratégia de upload | URL assinada + validação de MIME/size no backend | DEFINIDO | Upload com URL assinada e validação de tipo/tamanho no backend |

## 5) Qualidade, Testes e CI

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-19 | Framework de testes | Vitest (unit/integration) + Playwright (E2E web) | DEFINIDO | `Vitest` para unit/integration; `Supertest` para API; `Playwright` para frontend/PWA |
| INT-20 | Estrutura TDD | red-green-refactor obrigatório por PR | DEFINIDO | TDD obrigatório por PR |
| INT-21 | Qualidade de PR | template de PR + checklist técnico obrigatório | DEFINIDO | template de PR + checklist obrigatório com objetivo, impacto, testes, riscos, migração e observações operacionais |
| INT-22 | Convenção de commits | Conventional Commits (sim/não) | DEFINIDO | `Conventional Commits` |

## 6) Observabilidade (Implementação)

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-23 | Stack de métricas/tracing | OpenTelemetry + Prometheus/Grafana | DEFINIDO | `OpenTelemetry + Prometheus/Grafana` |
| INT-24 | Armazenamento de logs aplicacionais | tabela de logs (resumo) + agregador externo para análise | DEFINIDO | banco da aplicação para auditoria e logs funcionais resumidos; observabilidade externa para logs técnicos completos |
| INT-25 | Padrão de correlação | `request_id` obrigatório em API e jobs | DEFINIDO | `request_id` obrigatório em API e jobs |

## 7) Operação e Entrega

| ID | Item | Opção recomendada | Status | Decisão final |
|---|---|---|---|---|
| INT-26 | Estratégia de versão | versionamento semântico por release | DEFINIDO | Versionamento semântico por release |
| INT-27 | Estratégia de feature flag | flag simples por env/tabela para rollout seguro | DEFINIDO | Não adotar feature flags nesta fase; introduzir apenas se surgir necessidade real |
| INT-28 | Critério de pronto técnico por módulo | code + testes + docs + runbook atualizado | DEFINIDO | Código + testes + docs + runbook atualizado |
| INT-29 | Simulação de runbooks em staging | executar tabletop técnico antes de go-live | DEFINIDO | Tabletop técnico obrigatório em `staging` antes de go-live |

---

## 8) Fora deste documento (já enviado ao cliente)

1. Regras de negócio (status, financeiro, reagendamento, notificações de negócio, permissões funcionais).
2. Pendências contratuais de infra: backup e RPO/RTO.
