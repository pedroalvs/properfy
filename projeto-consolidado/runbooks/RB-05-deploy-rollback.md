# RB-05 - Deploy e Rollback

## 1. Objetivo e escopo

Padronizar deploy seguro em `staging` e `prod`, com rollback rápido.

## 2. Pré-requisitos

1. Pipeline CI verde.
2. Build/version tag pronta.
3. Janela de deploy respeitada (`09:00` Brasil em diante).

## 3. Sinais de detecção

1. Falha em health check pós deploy.
2. Aumento de erro/latência após release.
3. Alertas de negócio (falha em fluxo crítico).

## 4. Diagnóstico

1. Confirmar versão implantada.
2. Verificar logs e métricas após deploy.
3. Identificar regressão funcional/técnica.

## 5. Mitigação

1. Executar rollback imediato para release estável.
2. Validar health check e smoke test.
3. Congelar novas promoções até estabilização.

## 6. Critério de sucesso

1. Aplicação saudável em produção.
2. Métricas de erro/latência normalizadas.
3. Fluxos críticos operando normalmente.

## 7. Rollback

1. Produção (Fly.io): rollback para release/tag anterior.
2. Staging (VPS/Portainer): rollback de imagem/stack anterior.

## 8. Comunicação

1. Informar equipe técnica sobre início/fim de rollback.
2. Se impacto externo, comunicar cliente com ETA.

## 9. Pós-incidente

1. Registrar release com falha e causa.
2. Ajustar testes/gates para prevenir recorrência.

## 10. Responsáveis e escalonamento

1. Primário: responsável de deploy.
2. Secundário: backend owner.
