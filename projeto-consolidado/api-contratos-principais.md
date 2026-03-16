# Properfy - Contratos Principais de API

Objetivo: definir os contratos principais de API para orientar a geracao do backend e do client frontend.

## 1. Convencoes gerais

1. Estilo: `REST`
2. Prefixo: `/v1`
3. Sucesso:
   - resposta direta
   - listas paginadas com metadados
4. Erro:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

5. Paginacao:
   - `page`
   - `pageSize`
   - `sortBy`
   - `sortOrder`

## 2. Auth

### `POST /v1/auth/login`

Objetivo:

1. autenticar usuario interno

Request:

1. `email`
2. `password`

Response:

1. `accessToken`
2. `refreshToken`
3. `user`

### `POST /v1/auth/refresh`

Objetivo:

1. renovar sessao

Request:

1. `refreshToken`

Response:

1. `accessToken`
2. `refreshToken`

### `POST /v1/auth/logout`

Objetivo:

1. revogar sessao atual

## 3. Users e Tenants

### `GET /v1/me`

Objetivo:

1. retornar usuario autenticado e permissoes basicas

### `GET /v1/tenants/:tenantId/users`

Objetivo:

1. listar usuarios do tenant

### `POST /v1/tenants/:tenantId/users`

Objetivo:

1. criar usuario do tenant

## 4. Properties

### `GET /v1/properties`

Objetivo:

1. listar imoveis do tenant

Filtros principais:

1. `branchId`
2. `type`
3. `search`

### `POST /v1/properties`

Objetivo:

1. criar imovel

Payload principal:

1. `branchId`
2. `propertyCode`
3. `type`
4. `street`
5. `addressLine2`
6. `suburb`
7. `postcode`
8. `state`
9. `country`
10. `notes`

### `PATCH /v1/properties/:propertyId`

### `DELETE /v1/properties/:propertyId`

## 5. Appointments

### `GET /v1/appointments`

Objetivo:

1. listar appointments

Filtros principais:

1. `status`
2. `serviceTypeId`
3. `branchId`
4. `inspectorId`
5. `search`
6. `fromDate`
7. `toDate`

### `POST /v1/appointments`

Objetivo:

1. criar appointment manual

Payload principal:

1. `branchId`
2. `propertyId` ou dados de criacao de propriedade
3. `serviceTypeId`
4. `scheduledDate`
5. `timeSlot`
6. `contact`
7. `restrictions`
8. `keyRequired`
9. `meetingLocation`
10. `keyLocation`
11. `notes`

### `GET /v1/appointments/:appointmentId`

### `PATCH /v1/appointments/:appointmentId`

### `POST /v1/appointments/:appointmentId/status-transitions`

Objetivo:

1. executar transicao de status formal

Payload:

1. `targetStatus`
2. `reason` (quando obrigatorio)

### `POST /v1/appointments/import`

Objetivo:

1. importar appointments por arquivo

Response:

1. `importId`
2. `acceptedCount`
3. `warningCount`
4. `errorCount`

## 6. Service Groups e Marketplace

### `GET /v1/service-groups`

### `POST /v1/service-groups`

Objetivo:

1. criar grupo com appointments elegiveis

Payload:

1. `appointmentIds`
2. `serviceTypeId`
3. `scheduledDate`
4. `timeWindow`
5. `priorityMode`

### `POST /v1/service-groups/:groupId/publish`

### `POST /v1/service-groups/:groupId/assign`

Objetivo:

1. atribuicao manual para inspetor

### `GET /v1/marketplace/offers`

Objetivo:

1. listar ofertas elegiveis para inspetor

### `POST /v1/marketplace/offers/:groupId/accept`

Objetivo:

1. aceite do grupo

Requisitos:

1. `Idempotency-Key`

## 7. Tenant Portal

### `GET /v1/tenant-portal/:token`

Objetivo:

1. consultar dados do portal do inquilino

### `POST /v1/tenant-portal/:token/confirm`

### `POST /v1/tenant-portal/:token/reschedule`

Payload:

1. `newDate`
2. `newTimeSlot`
3. `restrictions`

### `PATCH /v1/tenant-portal/:token/contact`

Payload:

1. `primaryEmail`
2. `secondaryEmail`
3. `primaryPhone`
4. `secondaryPhone`

## 8. Inspector App

### `GET /v1/inspector/offers`

### `GET /v1/inspector/schedule`

Filtros:

1. `date`

### `GET /v1/inspector/appointments/:appointmentId`

### `POST /v1/inspector/appointments/:appointmentId/start`

Payload:

1. `latitude`
2. `longitude`

### `POST /v1/inspector/appointments/:appointmentId/finish`

Payload:

1. `latitude`
2. `longitude`
3. `checklist`
4. `notes`
5. `assets`

## 9. Notifications

### `GET /v1/notifications`

Objetivo:

1. listar notificacoes por appointment/tenant

Filtros:

1. `appointmentId`
2. `channel`
3. `status`
4. `templateCode`

### `POST /v1/notifications/:notificationId/retry`

Objetivo:

1. reprocessar notificacao falha

## 10. Financial

### `GET /v1/financial/entries`

### `POST /v1/financial/entries/:entryId/adjust`

Objetivo:

1. ajuste financeiro manual

### `POST /v1/financial/entries/:entryId/refund`

### `GET /v1/invoices`

### `POST /v1/invoices/generate`

Objetivo:

1. gerar invoice por periodo

## 11. Reports

### `POST /v1/reports`

Objetivo:

1. solicitar geracao de relatorio

Payload:

1. `reportType`
2. `filters`
3. `format`

### `GET /v1/reports/:reportId`

### `GET /v1/reports/:reportId/download`

## 12. Audit

### `GET /v1/audit-logs`

Objetivo:

1. consultar trilha de auditoria

Filtros:

1. `entityType`
2. `entityId`
3. `actorId`
4. `action`
5. `fromDate`
6. `toDate`
