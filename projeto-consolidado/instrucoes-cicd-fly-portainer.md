# Instruções de CI/CD - Properfy (VPS/Portainer + Fly.io)

## 1. Objetivo

Padronizar o fluxo de entrega com gates de qualidade antes de publicar em produção.

## 2. Topologia de ambientes

1. `dev`: local (máquina do desenvolvedor)
2. `staging`: VPS com Portainer (homologação)
3. `prod`: Fly.io (produção)

## 3. Estratégia de branches

1. `feature/*` -> desenvolvimento
2. `main` -> produção

## 4. Pipeline CI (obrigatório em Pull Request)

A cada PR para `main`, executar:

1. `lint`
2. `typecheck`
3. `tests` (unit, integração e e2e relevantes)
4. validação de migração Prisma (dry-run / diff)
5. build da aplicação

Regra:

1. PR só pode ser mergeado com pipeline 100% verde.

## 5. Pipeline CD (após merge em `main`)

Ordem de promoção:

1. Deploy em `staging` (VPS/Portainer)
2. Homologação funcional rápida (smoke test)
3. Deploy em `prod` (Fly.io)

Regra:

1. Sem homologação em `staging`, não sobe para `prod`.

## 6. Deploy em produção (Fly.io)

1. Janela de deploy: a partir de `09:00` Brasil (referência `23:00` Sydney)
2. Estratégia: rolling/progressivo com health check
3. Segredos: injetados por secrets do provedor (sem `.env` em prod)

## 7. Rollback

1. Automático por falha de health check (quando aplicável)
2. Manual por release/tag (staging e prod)

## 8. Migrações de banco

1. Aplicar migração primeiro em `staging`
2. Validar aplicação e smoke tests
3. Promover para `prod`
4. Padrão obrigatório: `expand/contract` (evitar breaking changes diretas)

## 9. Checklist mínimo por release

1. Pipeline CI verde
2. Migração validada em staging
3. Smoke test executado
4. Monitoramento sem alertas críticos
5. Plano de rollback disponível

## 10. Não funcionais obrigatórios

1. App stateless
2. Logs estruturados
3. Métricas e alertas ativos
4. Fila com retry, DLQ e idempotência
