# RB-03 - Notificações (SMS/Email)

## 1. Objetivo e escopo

Mitigar falhas de envio de notificações (email/SMS), atrasos e baixa taxa de entrega.

## 2. Pré-requisitos

1. Acesso aos dashboards de notificação.
2. Acesso a logs de provider.
3. Acesso à fila de notificações e DLQ.

## 3. Sinais de detecção

1. Queda de `delivered` ou pico de `failed`.
2. Atraso acima do SLA de envio.
3. Erros 4xx/5xx do provedor.

## 4. Diagnóstico

1. Separar problema por canal (SMS vs Email).
2. Validar credenciais/API key.
3. Verificar limite/rate-limit do provedor.
4. Verificar template inválido ou payload incompleto.

## 5. Mitigação

1. Ativar fallback de envio na fila (retry+DLQ).
2. Corrigir credenciais/templates.
3. Reprocessar pendências seguras por prioridade.
4. Se provedor indisponível, degradar para canal alternativo quando aplicável.

## 6. Critério de sucesso

1. Taxa de entrega retorna ao baseline.
2. Fila de notificação normalizada.
3. Sem erros críticos contínuos por 15 minutos.

## 7. Rollback

1. Reverter configuração de template/provedor.
2. Reverter release que alterou pipeline de notificação.

## 8. Comunicação

1. Avisar operação sobre impacto no contato com inquilino/inspetor.
2. Comunicar cliente quando houver atraso relevante.

## 9. Pós-incidente

1. Revisar templates e validações de payload.
2. Ajustar políticas de retry/rate limit.
3. Documentar incidente e ações preventivas.

## 10. Responsáveis e escalonamento

1. Primário: owner de integrações.
2. Secundário: operação.
