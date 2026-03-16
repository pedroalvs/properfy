# Properfy - Infra e Tecnologia (Production Ready)

Objetivo: fechar decisões técnicas de infraestrutura e operação antes do desenvolvimento.

Uso:

1. Marcar cada item como `DEFINIDO` ou `PENDENTE`.
2. O que ficar `PENDENTE` vai para validação com o cliente.

## Legenda de status

1. `DEFINIDO` - decisão fechada internamente.
2. `PENDENTE` - falta fechar; se necessário, escalar para cliente.

## Diretriz Global de Aplicação

1. `DEFINIDO`: a aplicação deve ser **stateless**.
2. Implicações:
   - sem sessão em memória local da aplicação;
   - autenticação por tokens (access + refresh com rotação e revogação);
   - múltiplas instâncias devem operar sem afinidade de sessão.

## 1) Ambientes e Deploy

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| Ambientes | `dev`, `staging`, `prod` separados | DEFINIDO | `dev` local; `staging` em VPS com Portainer; `prod` no Fly.io; branch `main` promove para `prod` |
| Estratégia de release | Rolling deploy com health check | DEFINIDO | `prod` no Fly.io com deploy progressivo e health check; `staging` em VPS com Portainer para homologação |
| Rollback | Rollback automático por falha de health check + rollback manual por tag | DEFINIDO | Rollback automático por health check em produção + rollback manual por release/tag em `staging` e `prod` |
| Janela de deploy prod | Janela fixa em horário comercial + bloqueio em fechamento financeiro | DEFINIDO | Deploy em produção a partir de `09:00` (Brasil), referência operacional `23:00` (Sydney) |

## 2) Banco de Dados e Migrações

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| Migração de schema | Prisma Migrate com pipeline obrigatório em staging antes de prod | DEFINIDO | Prisma Migrate com execução obrigatória em `staging`, validação e só depois promoção para `prod` |
| Estratégia sem downtime | Expand/contract (nunca breaking direto) | DEFINIDO | Adotar padrão `expand/contract`: adicionar compatibilidade primeiro, migrar uso da aplicação e remover legado em release posterior |
| Backup | Backup diário + retenção mínima 30 dias | PENDENTE | Será definido com o cliente (frequência, retenção e política de restauração) |
| RPO/RTO | RPO <= 24h, RTO <= 4h (mínimo inicial) | PENDENTE |  |
| Pool de conexão | PgBouncer gerenciado | DEFINIDO | Usar PgBouncer gerenciado para estabilidade de conexões do Prisma/Node em `staging` e `prod` |

## 3) Segurança Técnica

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| Gestão de segredos | Secret manager central (sem segredo em código) | DEFINIDO | Aplicação usa `process.env`; segredos gerenciados pelo provedor (sem arquivo `.env` em `staging`/`prod`) |
| Rotação de segredos | Rotação trimestral para chaves críticas | DEFINIDO | Rotação semestral para chaves e segredos críticos |
| JWT | Access token curto + refresh rotativo + revogação | DEFINIDO | Access token curto + refresh token rotativo com validade de 10 dias + revogação por sessão |
| Assinatura JWT | RS256 com `kid` e rotação de chave | DEFINIDO | Assinatura assimétrica RS256 com `kid` e rotação de chaves |
| Proteção API | Rate limit por IP/tenant + proteção brute force em auth | DEFINIDO | Política híbrida: rate limit na borda + regras por endpoint na aplicação (limites iniciais abaixo) |
| Criptografia | TLS em trânsito + criptografia em repouso | DEFINIDO | Baseline confirmado: TLS obrigatório em trânsito + criptografia em repouso fornecida pelo provedor |

### Limites iniciais de proteção API (baseline)

1. Login (`/auth/login`)
   - por IP: `30 req/min`
   - por conta (email): `5 tentativas falhas / 15 min`
   - ao exceder: lock temporário de `15 min` para a conta
2. Refresh (`/auth/refresh`)
   - por IP: `20 req/min`
   - por sessão/token: `10 req/5 min`
3. Endpoints críticos de operação (ex.: importação, criação em massa)
   - por tenant: `60 req/min`
4. Uploads de arquivos
   - por usuário: `20 req/min`
5. Regras gerais
   - aplicar backoff progressivo em falhas de autenticação
   - registrar eventos de bloqueio em auditoria/segurança

## 4) Observabilidade e SRE

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| Logging | Logs estruturados JSON com `request_id`, `tenant_id`, `user_id` | DEFINIDO | Logging detalhado para debug e gestão: todos os eventos em banco + saída em terminal; em `dev`/`staging` manter logs completos no terminal; em `prod` terminal apenas erros e logs essenciais |
| Métricas | Latência, erro, throughput, fila, notificação | DEFINIDO | Baseline completo obrigatório: métricas técnicas + métricas operacionais de negócio |
| Tracing | OpenTelemetry para fluxos críticos | DEFINIDO | Tracing com OpenTelemetry para API e workers em fluxos críticos |
| Alertas | SLO breach, fila parada, erro de integração, falha de job | DEFINIDO | Alertas automáticos por threshold e indisponibilidade dos fluxos críticos |
| Dashboard | Painel operacional por domínio (auth, agendamento, notificações, financeiro) | DEFINIDO | Dashboards centralizados para operação técnica e visão de negócio |

### Campos mínimos de log (baseline)

1. `timestamp`
2. `level`
3. `service`
4. `env`
5. `request_id`
6. `trace_id` (quando houver)
7. `tenant_id` (quando houver)
8. `user_id` (quando houver)
9. `route`
10. `method`
11. `status_code`
12. `duration_ms`

### Regras de segurança de log

1. Não registrar segredos em claro (tokens, senhas, credenciais).
2. Dados sensíveis devem ser mascarados.
3. Monitorar custo/volume de logs em banco no ambiente de produção.

### Observabilidade completa (obrigatória)

1. Coleta de métricas
   - API: latência (`p50/p95/p99`), taxa de erro (`4xx/5xx`), throughput.
   - Workers/fila: tamanho da fila, idade da mensagem, retries, falhas, DLQ.
   - Notificações: enviados, entregues, falhas, tempo médio de entrega.
2. Tracing
   - Instrumentar API e jobs com OpenTelemetry.
   - Correlacionar `trace_id` com logs.
3. Dashboards (visão operacional)
   - API Health.
   - Jobs/Fila.
   - Notificações.
   - Fluxo de negócio (confirmações, reagendamentos, cancelamentos).
4. Alertas automáticos
   - Aumento de `5xx`.
   - Latência acima do limite.
   - Fila parada/acumulada.
   - Falha contínua em provedor externo (SMS/email).
5. Visualização
   - Painel web centralizado para operação técnica e acompanhamento do cliente.

### Observação de escopo

1. Observabilidade completa passa a ser requisito não funcional obrigatório do projeto.

## 5) Resiliência e Integrações

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| Fila de jobs | Processamento assíncrono para notificação, lembretes, invoices, importação | DEFINIDO | Fila obrigatória para notificações, lembretes, importações e geração de invoice — implementada com **pg-boss** (PostgreSQL-backed, sem Redis) |
| Retry | Exponencial com jitter + limite de tentativas | DEFINIDO | Retry com backoff exponencial + jitter; usar `Retry-After` quando provedor informar; ao exceder tentativas, enviar para DLQ |
| Dead Letter Queue | Obrigatória para falhas definitivas | DEFINIDO | DLQ obrigatória para falhas definitivas com política de alerta, retenção e reprocessamento controlado |
| Idempotência | Chave idempotente em operações críticas | DEFINIDO | Idempotência obrigatória em comandos críticos com `Idempotency-Key`/`event_id`, persistência e retorno determinístico |
| Circuit breaker | Aplicar em provedores externos (SMS/email/maps) | DEFINIDO | Aplicar circuit breaker somente em integrações críticas (SMS, email, mapas), com implementação centralizada |
| Fallback | Plano de contingência por provedor indisponível | DEFINIDO | Fallback por domínio: notificação em fila/DLQ, geocode pendente para tratamento operacional e upload com reenvio controlado |

### Baseline de Retry (parâmetros iniciais)

1. Tentativa inicial imediata.
2. Reexecuções com backoff exponencial + jitter.
3. Sequência inicial de referência: `15s`, `45s`, `2min`, `5min`, `15min`.
4. Limite inicial: `6` tentativas no total.
5. Após limite: mover para DLQ + gerar alerta operacional.

### Regras de DLQ (baseline)

1. DLQ por domínio crítico: `notifications`, `imports`, `finance`.
2. Alertar operação quando houver acúmulo acima do limite configurado.
3. Reprocessamento apenas com idempotência ativa.
4. Retenção inicial de mensagens em DLQ: `14 a 30 dias` (ajuste final com cliente, se necessário).

### Regras de Idempotência (baseline)

1. Operações obrigatórias
   - importação/criação em massa;
   - aceite de oferta/grupo;
   - início/finalização de inspeção;
   - envio de notificações;
   - lançamentos financeiros e invoice.
2. Chaves
   - HTTP crítico: `Idempotency-Key`;
   - jobs/eventos: `event_id` único + tipo da operação.
3. Comportamento
   - mesma chave + mesmo payload: retorna o mesmo resultado;
   - mesma chave + payload diferente: `409 Conflict`.
4. Persistência
   - tabela de idempotência com `key`, `scope`, `status`, `result_ref/response_hash`, `expires_at`.
5. TTL inicial
   - comandos síncronos: `24h`;
   - financeiro/notificação crítica: `7 a 30 dias`.
6. Barreira adicional
   - índices únicos no banco para efeitos finais críticos.

### Regras de Fallback (baseline)

1. SMS/Email
   - Em falha: manter em `pending_retry` com retry automático.
   - Ao exceder tentativas: DLQ + alerta operacional.
2. Mapas/Geocoding
   - Em falha de geocode: marcar `pending_geocode` para correção de OP.
   - Permitir ajuste manual de endereço/coordenadas.
3. Storage/Upload
   - Em falha: marcar `upload_failed` e permitir reenvio.
   - Não concluir fluxo que exige evidência mínima sem anexos válidos.
4. Regra geral
   - Degradação controlada (fail gracefully), sem perder rastreabilidade.
   - Registrar evento de fallback em auditoria.

## 6) Qualidade e Segurança de Código

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| Cobertura de testes | Unit + integração + E2E nos fluxos críticos | DEFINIDO | Estratégia TDD obrigatória: testes antes da implementação, com foco em unit/integration/e2e dos fluxos críticos |
| Gate de CI | Build, testes, lint, migração dry-run obrigatórios | DEFINIDO | Gate obrigatório em PR: lint + typecheck + testes + validação de migração Prisma + build; merge bloqueado sem pipeline verde |
| SAST/Dependências | Scan de segurança em CI | DEFINIDO | Scan de segurança estática e dependências vulneráveis obrigatório no pipeline de CI |
| Teste de carga | Cenários de pico em criação/aceite/notificação | DEFINIDO | Incluir teste de carga no escopo inicial para fluxos críticos: criação, aceite e notificação |

### Estratégia de Testes (TDD)

1. Regra principal
   - escrever teste antes de implementar regra/endpoint/comando.
2. Pirâmide de testes
   - unitário para domínio e use-cases;
   - integração para persistência, auth, fila e integrações;
   - E2E para fluxos ponta a ponta críticos.
3. Fluxos críticos obrigatórios em E2E
   - criação de serviço;
   - agrupamento/oferta/aceite;
   - confirmação de inquilino;
   - execução/finalização;
   - lançamento financeiro e notificação.
4. Qualidade mínima
   - cobertura global mínima inicial de `70%`;
   - módulos críticos (`auth`, `appointments`, `finance`) com `80%+`.

## 7) Operação e Suporte

| Item | Recomendação | Status | Decisão final |
|---|---|---|---|
| On-call | Escala mínima para incidentes críticos | DEFINIDO | On-call para incidentes críticos com escalonamento técnico e responsável de negócio |
| Classificação de incidente | S1/S2/S3 com SLA por severidade | DEFINIDO | Modelo S1/S2/S3 com tempos de resposta e resolução definidos no baseline abaixo |
| Runbooks | Runbook para auth, fila, notificação, banco, deploy | DEFINIDO | Runbooks obrigatórios para resposta operacional padronizada |
| Hotfix | Processo formal com validação mínima e pós-mortem | DEFINIDO | Fluxo de hotfix com validação mínima, rollback pronto e post-mortem obrigatório em incidente crítico |

### Baseline de severidade e SLA operacional

1. `S1` (crítico)
   - Exemplo: indisponibilidade de login, queda total da API, falha generalizada de agendamento.
   - Tempo de resposta: até `15 min`.
   - Mitigação inicial: até `60 min`.
2. `S2` (alto)
   - Exemplo: falha parcial em notificação ou módulo com degradação relevante.
   - Tempo de resposta: até `60 min`.
   - Mitigação inicial: até `4 h`.
3. `S3` (médio/baixo)
   - Exemplo: bug sem bloqueio operacional imediato.
   - Tempo de resposta: até `1 dia útil`.
   - Correção planejada: próximo ciclo.

### Runbooks obrigatórios (mínimo)

1. Autenticação e sessão (JWT/refresh/revogação).
2. Fila, retry e DLQ (incluindo reprocessamento seguro).
3. Notificações (SMS/email) e fallback.
4. Banco de dados (migração, rollback, restauração).
5. Deploy e rollback (`staging`/`prod`).
6. Incidente crítico (triagem, comunicação, recuperação).

### Fluxo de hotfix (mínimo)

1. Abrir incidente e classificar severidade.
2. Criar branch de hotfix com alteração mínima.
3. Executar validação mínima (lint, testes relevantes, smoke test).
4. Deploy na janela definida ou imediatamente para `S1`.
5. Monitorar métricas/logs pós-release.
6. Publicar post-mortem para `S1`/`S2`.

## 8) Itens para escalar ao cliente (se permanecerem pendentes)

1. SLA esperado (resposta e resolução por severidade).
2. Janela de manutenção aceitável.
3. Política de backup (frequência, retenção, restauração) e RPO/RTO contratuais.
4. Retenção de dados e logs exigida pelo negócio.
5. Requisitos específicos de compliance/LGPD.
6. Política de comunicação em incidentes.

## 9) Checklist de saída (go/no-go para iniciar desenvolvimento)

| Item | Status |
|---|---|
| Ambientes e pipeline definidos | ATENDIDO |
| Estratégia de migração e rollback definida | ATENDIDO |
| Segurança de autenticação e segredos definida | ATENDIDO |
| Observabilidade mínima definida | ATENDIDO |
| Estratégia de filas/retry/idempotência definida | ATENDIDO |
| Critérios de qualidade em CI definidos | ATENDIDO |
| Itens pendentes claramente separados para validação com cliente | ATENDIDO |

### Resultado de go/no-go (início de desenvolvimento)

1. **GO técnico interno: APROVADO**.
2. Pendências para alinhamento contratual com cliente permanecem na seção 8.
