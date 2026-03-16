# RB-04 - Banco (Migração e Rollback)

## 1. Objetivo e escopo

Executar migrações com segurança e recuperar rapidamente em caso de falha.

## 2. Pré-requisitos

1. Acesso ao banco `staging` e `prod`.
2. Prisma CLI e scripts de migração.
3. Janela de deploy aprovada.

## 3. Sinais de detecção

1. Erro após migração (API 5xx, query falhando).
2. Timeout/anomalia após release.
3. Alertas de saúde de banco.

## 4. Diagnóstico

1. Identificar migração aplicada por último.
2. Verificar compatibilidade de schema com versão do app.
3. Validar locks longos e queries críticas.

## 5. Mitigação

1. Interromper novas migrações.
2. Aplicar rollback da aplicação se incompatibilidade.
3. Se necessário, executar rollback de schema planejado (expand/contract).
4. Restaurar serviço com versão estável.

## 6. Critério de sucesso

1. Health checks estáveis.
2. Queries críticas executando sem erro.
3. Latência e erro dentro do baseline.

## 7. Rollback

1. Rollback de release no Fly.io.
2. Reversão de migração conforme plano versionado.

## 8. Comunicação

1. Atualizar operação e equipe técnica imediatamente.
2. Comunicar cliente se houver indisponibilidade perceptível.

## 9. Pós-incidente

1. Registrar causa raiz.
2. Ajustar migração para padrão expand/contract.
3. Criar teste de migração em staging.

## 10. Responsáveis e escalonamento

1. Primário: responsável por banco/backend.
2. Secundário: infraestrutura.
