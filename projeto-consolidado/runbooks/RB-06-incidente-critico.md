# RB-06 - Incidente Crítico (S1)

## 1. Objetivo e escopo

Guiar resposta a incidentes críticos (S1) com impacto alto em produção.

## 2. Pré-requisitos

1. Acesso operacional a logs/métricas/tracing.
2. Acesso de deploy/rollback.
3. Canal oficial de comunicação interna e com cliente.

## 3. Sinais de detecção

1. Queda total/parcial do serviço.
2. Falha em fluxo core (agendamento, aceite, execução, auth).
3. Alertas críticos de erro ou indisponibilidade.

## 4. Diagnóstico

1. Classificar como S1.
2. Identificar domínio impactado (auth, banco, fila, notificação, deploy).
3. Confirmar alcance (todos tenants vs parcial).

## 5. Mitigação

1. Acionar incident commander.
2. Aplicar mitigação mais rápida (rollback/fallback/desligar feature).
3. Restaurar disponibilidade mínima do fluxo crítico.

## 6. Critério de sucesso

1. Serviço estabilizado (health checks OK).
2. Erro e latência em nível aceitável.
3. Fluxo crítico validado por smoke test.

## 7. Rollback

1. Se incidente causado por release, rollback imediato.
2. Se incidente de integração, ativar fallback e conter impacto.

## 8. Comunicação

1. Atualização interna a cada 30 minutos enquanto incidente ativo.
2. Atualização ao cliente com status, mitigação e ETA.
3. Comunicação de encerramento com resumo objetivo.

## 9. Pós-incidente

1. Post-mortem obrigatório em até 48h.
2. Ações corretivas com responsável e prazo.
3. Atualização de runbook e alertas com aprendizado.

## 10. Responsáveis e escalonamento

1. Incident commander: responsável técnico de plantão.
2. Execução técnica: owners de domínio afetado.
3. Escalonamento executivo em indisponibilidade prolongada.
