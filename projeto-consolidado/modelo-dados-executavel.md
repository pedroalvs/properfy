# Properfy - Modelo de Dados Executavel

Objetivo: consolidar as entidades principais, relacionamentos e campos fundamentais para orientar a geracao de codigo e schema do banco.

## 1. Convencoes

1. Banco em `snake_case`
2. Aplicacao em `camelCase`
3. Todas as entidades de negocio devem ter:
   - `id`
   - `created_at`
   - `updated_at`
4. Entidades multi-tenant devem ter:
   - `tenant_id`
5. Entidades operacionais/cadastrais podem usar:
   - `deleted_at`

## 2. Entidades principais

### 2.1 Tenant

Representa a conta da imobiliaria/agencia no sistema.

Campos principais:

1. `id`
2. `name`
3. `legal_name`
4. `status`
5. `timezone`
6. `currency`
7. `settings_json`

Relacionamentos:

1. possui `branches`
2. possui `users`
3. possui `properties`
4. possui `appointments`
5. possui `service_price_rules`

### 2.2 Branch

Filial da imobiliaria.

Campos principais:

1. `id`
2. `tenant_id`
3. `name`
4. `address_json`
5. `status`

### 2.3 User

Usuario autenticado interno.

Campos principais:

1. `id`
2. `tenant_id` (nullable para `AM`)
3. `branch_id` (nullable)
4. `role`
5. `name`
6. `email`
7. `phone`
8. `status`
9. `password_hash`
10. `last_login_at`

Observacao:

1. `role` cobre `AM`, `OP`, `CL_ADMIN`, `CL_USER`

### 2.4 Inspector

Prestador responsavel pelas inspecoes.

Campos principais:

1. `id`
2. `name`
3. `email`
4. `phone`
5. `status`
6. `payment_settings_json`
7. `regions_json`
8. `service_types_json`
9. `client_eligibility_json`

Relacionamentos:

1. possui `availability_slots`
2. pode ter muitos `appointments`
3. pode ter muitos `service_groups`

### 2.5 Property

Imovel vinculado ao tenant.

Campos principais:

1. `id`
2. `tenant_id`
3. `branch_id`
4. `property_code`
5. `type`
6. `street`
7. `address_line_2`
8. `suburb`
9. `postcode`
10. `state`
11. `country`
12. `latitude`
13. `longitude`
14. `notes`
15. `rules_json`

### 2.6 Appointment

Entidade central do negocio.

Campos principais:

1. `id`
2. `tenant_id`
3. `branch_id`
4. `property_id`
5. `service_type_id`
6. `service_group_id` (nullable)
7. `inspector_id` (nullable)
8. `status`
9. `scheduled_date`
10. `time_slot`
11. `key_required`
12. `meeting_location_json`
13. `key_location_json`
14. `tenant_confirmation_status`
15. `rejection_reason_code`
16. `cancellation_reason_code`
17. `created_by_user_id`
18. `done_checked_by_user_id` (nullable)
19. `done_checked_at` (nullable)

Campos de negocio adicionais:

1. `price_amount`
2. `payout_amount`
3. `pricing_rule_snapshot_json`
4. `custom_fields_json`

### 2.7 Appointment Contact

Contato operacional do inquilino para uma inspecao.

Campos principais:

1. `id`
2. `appointment_id`
3. `tenant_name`
4. `primary_email`
5. `secondary_email`
6. `primary_phone`
7. `secondary_phone`

### 2.8 Appointment Restriction

Restricoes e preferencias operacionais da inspecao.

Campos principais:

1. `id`
2. `appointment_id`
3. `is_home`
4. `unavailable_days_json`
5. `unavailable_hours_json`
6. `notes`
7. `source`

### 2.9 Service Type

Catalogo de tipos de servico.

Campos principais:

1. `id`
2. `code`
3. `name`
4. `flow_type`
5. `requires_tenant_confirmation`
6. `status`

### 2.10 Service Price Rule

Tabela de preco por cliente/tipo.

Campos principais:

1. `id`
2. `tenant_id`
3. `service_type_id`
4. `branch_id` (nullable)
5. `price_amount`
6. `payout_type`
7. `payout_value`
8. `bonus_rule_json`
9. `status`

### 2.11 Service Group

Grupo de inspecoes ofertado a inspetores.

Campos principais:

1. `id`
2. `tenant_id`
3. `service_type_id`
4. `status`
5. `group_size`
6. `offered_count`
7. `confirmed_count`
8. `scheduled_date`
9. `time_window`
10. `priority_mode`
11. `priority_expires_at`
12. `assigned_inspector_id` (nullable)

### 2.12 Inspector Availability Slot

Disponibilidade operacional do inspetor.

Campos principais:

1. `id`
2. `inspector_id`
3. `date`
4. `start_time`
5. `end_time`
6. `region_json`
7. `capacity`
8. `status`

### 2.13 Tenant Portal Token

Token de acesso ao portal do inquilino.

Campos principais:

1. `id`
2. `appointment_id`
3. `token_hash`
4. `expires_at`
5. `status`
6. `last_accessed_at`

### 2.14 Tenant Portal Activity

Historico de interacoes no portal do inquilino.

Campos principais:

1. `id`
2. `appointment_id`
3. `tenant_portal_token_id`
4. `action`
5. `previous_values_json`
6. `new_values_json`
7. `ip_address`
8. `user_agent`
9. `created_at`

### 2.15 Notification

Registro de notificacao enviada.

Campos principais:

1. `id`
2. `tenant_id`
3. `appointment_id`
4. `recipient`
5. `channel`
6. `template_code`
7. `status`
8. `provider_name`
9. `provider_message_id`
10. `sent_at`
11. `delivered_at`
12. `failed_at`
13. `failure_reason`

### 2.16 Inspection Execution

Registro de execucao da inspecao.

Campos principais:

1. `id`
2. `appointment_id`
3. `inspector_id`
4. `started_at`
5. `finished_at`
6. `start_latitude`
7. `start_longitude`
8. `finish_latitude`
9. `finish_longitude`
10. `checklist_json`
11. `notes`

### 2.17 Inspection Asset

Arquivos/evidencias da execucao.

Campos principais:

1. `id`
2. `appointment_id`
3. `inspection_execution_id`
4. `storage_key`
5. `mime_type`
6. `size_bytes`
7. `kind`
8. `uploaded_by`

### 2.18 Financial Entry

Lancamentos financeiros da plataforma.

Campos principais:

1. `id`
2. `tenant_id`
3. `appointment_id`
4. `entry_type`
5. `amount`
6. `currency`
7. `status`
8. `description`
9. `effective_at`
10. `approved_by_user_id` (nullable)

### 2.19 Inspector Invoice

Fechamento financeiro do inspetor.

Campos principais:

1. `id`
2. `inspector_id`
3. `period_start`
4. `period_end`
5. `status`
6. `total_amount`
7. `file_key` (nullable)

### 2.20 Audit Log

Trilha funcional e sensivel do sistema.

Campos principais:

1. `id`
2. `tenant_id` (nullable)
3. `actor_type`
4. `actor_id`
5. `entity_type`
6. `entity_id`
7. `action`
8. `reason`
9. `before_json`
10. `after_json`
11. `request_id`
12. `created_at`

## 3. Enums principais

1. `appointment_status`
   - `DRAFT`
   - `AWAITING_INSPECTOR`
   - `SCHEDULED`
   - `REJECTED`
   - `CANCELLED`
   - `DONE`
2. `tenant_confirmation_status`
   - `PENDING`
   - `CONFIRMED`
   - `UNAVAILABLE`
   - `NO_RESPONSE`
3. `notification_channel`
   - `EMAIL`
   - `SMS`
   - `WHATSAPP`
4. `notification_status`
   - `PENDING`
   - `SENT`
   - `DELIVERED`
   - `FAILED`
5. `financial_entry_type`
   - `TENANT_DEBIT`
   - `INSPECTOR_PAYOUT`
   - `REFUND`
   - `MANUAL_ADJUSTMENT`

## 4. Relacionamentos fundamentais

1. `tenant` 1:N `branches`
2. `tenant` 1:N `users`
3. `tenant` 1:N `properties`
4. `tenant` 1:N `appointments`
5. `tenant` 1:N `service_price_rules`
6. `branch` 1:N `properties`
7. `branch` 1:N `appointments`
8. `property` 1:N `appointments`
9. `service_group` 1:N `appointments`
10. `inspector` 1:N `appointments`
11. `appointment` 1:1 `appointment_contact`
12. `appointment` 1:1 `appointment_restriction`
13. `appointment` 1:N `notifications`
14. `appointment` 1:1 `inspection_execution`
15. `appointment` 1:N `inspection_assets`
16. `appointment` 1:N `financial_entries`
17. `appointment` 1:N `tenant_portal_activities`

## 5. Decisoes de modelagem

1. `tenant_id` obrigatorio em toda entidade de negocio multi-tenant
2. `service_type` dirige fluxo operacional e notificacoes
3. `price` e `payout` devem ser snapshotados no `appointment`
4. `audit_log` e `financial_entry` sao registros imutaveis
5. `notifications` precisam persistir status tecnico e funcional
