# Validação de Runbooks (Gate de Produção)

Objetivo: garantir que os runbooks estejam executáveis por qualquer pessoa técnica da equipe em incidente real.

## 1) Critérios obrigatórios por runbook

Cada runbook deve conter:

1. Objetivo e escopo do incidente.
2. Pré-requisitos (acessos, ferramentas, permissões).
3. Sinais de detecção (logs, métricas, alertas).
4. Passo a passo de diagnóstico.
5. Passo a passo de mitigação.
6. Critério de sucesso/normalização.
7. Procedimento de rollback (quando aplicável).
8. Procedimento de comunicação (interno e cliente).
9. Pós-incidente (coleta de evidências e post-mortem).
10. Responsáveis e escalonamento.

## 2) Checklist de aprovação

Marcar `SIM` para aprovação:

1. [ ] O runbook tem comandos claros e reproduzíveis.
2. [ ] Há critérios objetivos de entrada e saída.
3. [ ] Está alinhado com severidades S1/S2/S3.
4. [ ] Está alinhado com infraestrutura real (`staging` VPS/Portainer, `prod` Fly.io).
5. [ ] Inclui validação pós-mitigação (smoke/health checks).
6. [ ] Inclui plano de rollback.
7. [ ] Não depende de conhecimento tácito de uma única pessoa.
8. [ ] Foi testado ao menos 1 vez em ambiente de homologação.

Regra de aprovação:

1. `APROVADO`: todos os itens marcados `SIM`.
2. `REPROVADO`: qualquer item `NÃO`.

## 3) Matriz de runbooks obrigatórios

| ID | Runbook | Dono | Status | Testado em staging |
|---|---|---|---|---|
| RB-01 | Auth e sessão | Backend | APROVADO (conteúdo) | Não |
| RB-02 | Fila, retry e DLQ | Backend | APROVADO (conteúdo) | Não |
| RB-03 | Notificações (SMS/email) | Backend/Operação | APROVADO (conteúdo) | Não |
| RB-04 | Banco (migração/rollback) | Backend/Infra | APROVADO (conteúdo) | Não |
| RB-05 | Deploy/rollback | Infra | APROVADO (conteúdo) | Não |
| RB-06 | Incidente crítico | Engenharia | APROVADO (conteúdo) | Não |

## 4) Critério final de go-live

1. Nenhum runbook obrigatório pode ficar com status `Pendente`.
2. Todos devem estar testados em `staging`.
