# RB-01 - Auth e Sessão

## 1. Objetivo e escopo

Responder incidentes de autenticação/sessão: falha de login, refresh inválido em massa, tokens expirando incorretamente.

## 2. Pré-requisitos

1. Acesso ao Fly.io (prod) e VPS/Portainer (staging).
2. Acesso aos logs estruturados e métricas.
3. Permissão para rotação/revogação de chave JWT.

## 3. Sinais de detecção

1. Pico de `401/403` em `/auth/login` ou `/auth/refresh`.
2. Aumento de falhas de refresh.
3. Alertas de brute-force/rate-limit excessivo.

## 4. Diagnóstico

1. Verificar últimas alterações de auth (deploy/migração).
2. Verificar segredo/chave JWT em uso (`kid` ativo).
3. Verificar health do banco (tabela de sessão/refresh).
4. Validar relógio/sincronização temporal do ambiente.

## 5. Mitigação

1. Se problema de chave: restaurar chave anterior e reemitir tokens.
2. Se problema de refresh store: restaurar conectividade e desbloquear fluxo.
3. Se brute-force: endurecer rate-limit temporariamente.
4. Se bug de release: rollback da aplicação.

## 6. Critério de sucesso

1. Taxa de erro auth volta ao baseline.
2. Login e refresh funcionam em smoke test.
3. Sem novos alertas críticos por 15 minutos.

## 7. Rollback

1. Rollback da release no Fly.io.
2. Reverter segredo/chave JWT para versão estável.

## 8. Comunicação

1. Interno: abrir incidente com severidade S1/S2.
2. Cliente: comunicar impacto, mitigação e ETA.

## 9. Pós-incidente

1. Registrar timeline e causa raiz.
2. Abrir ação preventiva (teste/monitor/alerta).
3. Publicar post-mortem para S1/S2.

## 10. Responsáveis e escalonamento

1. Primário: responsável backend.
2. Secundário: responsável infraestrutura.
3. Escalonar para liderança em S1.
