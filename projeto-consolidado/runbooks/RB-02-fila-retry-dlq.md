# RB-02 - Fila, Retry e DLQ

## 1. Objetivo e escopo

Resolver incidentes de fila: backlog alto, retries excessivos, DLQ crescendo.

## 2. Pré-requisitos

1. Acesso ao monitor de filas/jobs.
2. Acesso a logs de workers.
3. Acesso a comando de pause/resume/reprocess.

## 3. Sinais de detecção

1. Fila acumulada acima do limite.
2. Idade média da mensagem crescendo.
3. Aumento de mensagens em DLQ.

## 4. Diagnóstico

1. Identificar fila afetada (`notifications`, `imports`, `finance`).
2. Identificar erro dominante.
3. Validar disponibilidade de serviços externos/banco.
4. Verificar configuração de retry/circuit breaker.

## 5. Mitigação

1. Pausar consumo se houver falha sistêmica.
2. Corrigir causa (credencial, endpoint, schema, timeout).
3. Retomar consumo gradual.
4. Reprocessar DLQ com idempotência habilitada.

## 6. Critério de sucesso

1. Backlog retorna ao baseline.
2. DLQ para de crescer.
3. Taxa de sucesso de job estabiliza.

## 7. Rollback

1. Reverter configuração recente de worker.
2. Reverter release de worker/API se regressão.

## 8. Comunicação

1. Notificar operação sobre atraso de processamento.
2. Atualizar cliente em caso de impacto visível.

## 9. Pós-incidente

1. Registrar causa raiz.
2. Ajustar thresholds de retry/DLQ.
3. Criar teste de regressão para o tipo de falha.

## 10. Responsáveis e escalonamento

1. Primário: backend/worker owner.
2. Secundário: infraestrutura.
