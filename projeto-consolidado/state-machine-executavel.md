# Properfy - State Machine Executavel

Objetivo: formalizar status, transicoes, atores autorizados e side effects operacionais.

## 1. Status oficiais

1. `DRAFT`
2. `AWAITING_INSPECTOR`
3. `SCHEDULED`
4. `REJECTED`
5. `CANCELLED`
6. `DONE`

Observacao:

1. `OPEN` deve ser tratado como alias historico de `AWAITING_INSPECTOR`

## 2. Regras gerais

1. Toda transicao deve registrar auditoria
2. Transicoes sensiveis exigem motivo
3. Transicoes por `SYS` devem registrar evento de sistema
4. Toda transicao deve validar escopo de tenant e permissao do ator

## 3. Tabela de transicoes

| Origem | Destino | Ator permitido | Motivo obrigatorio | Regra/condicao | Side effects principais |
|---|---|---|---|---|---|
| `DRAFT` | `AWAITING_INSPECTOR` | `OP`, `SYS` | Nao | dados minimos validados | disponibilizar para agrupamento/oferta |
| `DRAFT` | `REJECTED` | `OP`, `AM` | Sim | servico invalido ou impossivel | registrar motivo |
| `DRAFT` | `CANCELLED` | `OP`, `CL_ADMIN`, `CL_USER` autorizado, `AM` | Sim | cancelamento antes da oferta | registrar motivo |
| `AWAITING_INSPECTOR` | `SCHEDULED` | `SYS`, `OP` | Nao | aceite valido de inspetor ou atribuicao manual | vincular inspetor, agenda, disparar notificacao |
| `AWAITING_INSPECTOR` | `CANCELLED` | `OP`, `CL`, `AM` | Sim | cancelamento antes do aceite | registrar motivo |
| `AWAITING_INSPECTOR` | `REJECTED` | `OP`, `AM` | Sim | inviabilidade operacional | registrar motivo |
| `SCHEDULED` | `DONE` | `INSP`, `OP` | Nao | execucao concluida e evidencias validas | gerar financeiro, auditoria, notificacoes |
| `SCHEDULED` | `CANCELLED` | `OP`, `CL`, `AM` | Sim | cancelamento apos aceite | registrar motivo e ajustar agenda |
| `SCHEDULED` | `REJECTED` | `OP`, `SYS` | Sim | impossibilidade de executar por indisponibilidade/falta de resposta | registrar motivo, retirar da agenda executavel |
| `REJECTED` | `DRAFT` | `OP`, `AM` | Sim | reabertura para correcao | limpar bloqueios necessarios e reabrir fluxo |
| `REJECTED` | `AWAITING_INSPECTOR` | `OP`, `AM` | Sim | reabertura direta para oferta | republicar servico |
| `CANCELLED` | `DRAFT` | `OP`, `AM` | Sim | reabertura excepcional | recolocar no fluxo |
| `DONE` | `DRAFT` | `AM` | Sim | reabertura excepcional | exigir auditoria reforcada |
| `DONE` | `REJECTED` | `AM` | Sim | servico marcado como feito mas nao executado | possivel estorno/ajuste financeiro |

## 4. Regras especiais por fluxo

### 4.1 Confirmacao manual do inquilino

1. Pode ser forçada por:
   - `OP`
   - `AM`
   - `CL_USER`
2. Deve gerar:
   - auditoria
   - motivo
   - atualizacao do status de confirmacao

### 4.2 `SCHEDULED -> REJECTED`

Casos aceitos:

1. `Tenant unresponsive`
2. `Tenant unavailable`
3. `Tenant declined inspection`

Requisitos:

1. historico de tentativas de comunicacao
2. motivo obrigatorio

### 4.3 Reabertura de `DONE`

1. Somente `AM`
2. Motivo obrigatorio
3. Deve gerar auditoria reforcada
4. Se houver financeiro gerado, avaliar lancamento de ajuste/estorno

## 5. Regras de confirmacao por tipo de servico

1. `Routine Inspection`
   - depende de confirmacao do inquilino
   - T-1 so aparece no app se confirmado ou encaixado em excecao
2. `Ingoing Inspection`
   - nao depende de confirmacao do inquilino
   - `SCHEDULED` ja e considerado operacionalmente confirmado
3. `Outgoing Inspection`
   - nao depende de confirmacao do inquilino
   - `SCHEDULED` ja e considerado operacionalmente confirmado

## 6. Excecoes T-1

1. `key_required = true`
2. confirmacao manual por `OP`
3. `Ingoing/Outgoing` em `SCHEDULED`

## 7. Side effects obrigatorios por dominio

### Oferta/agendamento

1. vincular inspetor
2. atualizar agenda
3. publicar/retirar do marketplace

### Confirmacao/rejeicao

1. registrar evento do portal/inquilino
2. registrar notificacoes disparadas

### Finalizacao

1. validar evidencias minimas
2. registrar execucao e geolocalizacao
3. criar lancamentos financeiros
4. registrar auditoria

### Cancelamento/reabertura

1. motivo obrigatorio
2. auditoria obrigatoria
3. possivel recalculo operacional/financeiro
