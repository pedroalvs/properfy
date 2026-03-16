# Properfy - Component Inventory

Inventario inicial de componentes para o novo frontend, derivado do sistema atual em producao.

Objetivo:

1. definir o que deve virar componente reutilizavel
2. separar base visual de logica de produto
3. ajudar IA a nao reinventar a UI a cada tela

## 1. App Shell

### 1.1 `AppShell`

Responsabilidade:

1. compor sidebar
2. definir area principal
3. aplicar background e espacamento global

Props esperadas:

1. `children`
2. `routeName`
3. `sidebarVariant`

### 1.2 `Sidebar`

Responsabilidade:

1. navegacao principal
2. estado ativo
3. expansao/colapso em responsivo

Subcomponentes:

1. `SidebarLogo`
2. `SidebarItem`
3. `SidebarSubmenu`
4. `SidebarUser`

## 2. Cabecalho e acoes

### 2.1 `PageHeader`

Responsabilidade:

1. titulo principal
2. subtitulo opcional
3. acoes primarias e secundarias

Props esperadas:

1. `title`
2. `description?`
3. `primaryAction?`
4. `secondaryActions?`

### 2.2 `PageSectionHeader`

Responsabilidade:

1. subtitulo de bloco
2. acao contextual pequena

## 3. Filtros e formularios

### 3.1 `FilterBar`

Responsabilidade:

1. organizar filtros em layout padrao
2. suportar search/select/autocomplete/date

Subcomponentes:

1. `SearchField`
2. `FilterSelect`
3. `FilterAutocomplete`
4. `FilterDateField`
5. `FilterToggle`
6. `FilterBoolean`
7. `FilterLoadingIndicator`

### 3.2 `FormField`

Responsabilidade:

1. padronizar campos text/select/autocomplete
2. aplicar variantes `dense` e `default`

### 3.3 `FilterInput`

Responsabilidade:

1. encapsular o visual real dos filtros do legado
2. suportar notch de label, borda via sombra e icones internos escalados

### 3.4 `FilterDateRange`

Responsabilidade:

1. exibir intervalo ou preset de data
2. abrir date picker/range picker

### 3.5 `FilterBoolean`

Responsabilidade:

1. checkbox em container com borda
2. padronizar filtros booleanos do legado

### 3.6 `FormActions`

Responsabilidade:

1. agrupar acoes de salvar/cancelar
2. padronizar alinhamento e hierarquia

## 4. Feedback e estado

### 4.1 `StatusChip`

Responsabilidade:

1. mapear status para classes e cores oficiais

Props:

1. `status`
2. `size?`
3. `variant?`

### 4.2 `InfoBanner`

Responsabilidade:

1. informar pre-condicao ou instrucoes
2. exibir alertas de baixa severidade

### 4.3 `EmptyState`

Responsabilidade:

1. representar ausencia de dados
2. opcionalmente guiar proxima acao

### 4.4 `ErrorState`

Responsabilidade:

1. erro recuperavel
2. CTA de retry

### 4.5 `LoadingState`

Responsabilidade:

1. skeleton ou loading visual consistente

### 4.6 `Snackbar`

Responsabilidade:

1. feedback global top-right
2. suporte a mensagens multilinha

## 5. Tabelas e listas

### 5.1 `DataTable`

Responsabilidade:

1. tabela base
2. colunas, ordenacao, paginacao, empty state, loading

Subcomponentes:

1. `DataTableToolbar`
2. `DataTableHeader`
3. `DataTableRowActions`

### 5.2 `RowActions`

Responsabilidade:

1. padronizar acoes `view`, `edit`, `delete`, `more`

### 5.3 `EntityListCard`

Responsabilidade:

1. encapsular lista/tabela com borda, fundo e padding corretos

### 5.4 `TableSwitch`

Responsabilidade:

1. revelar colunas extras
2. manter barra cinza de toggle acima da tabela

### 5.5 `BooleanIcon`

Responsabilidade:

1. renderizar verdadeiro/falso com semantica visual correta do legado

## 6. Navegacao de contexto

### 6.1 `TabsNav`

Responsabilidade:

1. tabs com estilo legado
2. controle de conteudo associado

### 6.2 `Breadcrumbs`

Responsabilidade:

1. opcional em telas profundas do novo produto

## 7. Overlays

### 7.1 `Dialog`

Responsabilidade:

1. modal base
2. titulo, conteudo, acoes e fechamento

Subcomponentes:

1. `DialogHeader`
2. `DialogBody`
3. `DialogFooter`

### 7.2 `ConfirmDialog`

Responsabilidade:

1. confirmar acoes destrutivas ou sensiveis

### 7.3 `DrawerPanel`

Responsabilidade:

1. painel lateral para contextos operacionais, especialmente mapa

Variantes:

1. `sm`: `480px`
2. `lg`: `970px`

### 7.4 `FloatingTotalBar`

Responsabilidade:

1. barra fixa de totais em invoices
2. gradiente animado com hover e active

## 8. Botoes

### 8.1 `PrimaryButton`

Visual:

1. coral
2. texto branco
3. radius `4px`

### 8.2 `SecondaryButton`

Visual:

1. cinza claro
2. texto escuro

### 8.3 `OutlinedButton`

Visual:

1. borda `primary`
2. fundo transparente

### 8.4 `IconButton`

Visual:

1. neutro por padrao
2. variante delete em `error`

## 9. Map view

### 9.1 `MapScreenLayout`

Responsabilidade:

1. compor mapa fullscreen
2. painel lateral
3. acoes flutuantes

### 9.2 `MapFilterPanel`

Responsabilidade:

1. filtros operacionais do mapa

### 9.3 `MapFloatingAction`

Responsabilidade:

1. CTA ou contador flutuante coral

### 9.4 `MapFiltersPanel`

Responsabilidade:

1. painel lateral com slide-in a partir da esquerda
2. largura `480px` e transicao padronizada

### 9.5 `BoardKanban`

Responsabilidade:

1. colunas por status
2. scroll horizontal
3. badges de contagem
4. informacoes contextuais por coluna

## 10. Dominio

Estes componentes nao pertencem ao design system base, mas ao produto:

1. `AppointmentStatusChip`
2. `AppointmentFilters`
3. `GroupOfferCard`
4. `InspectorCard`
5. `TenantConfirmationPanel`
6. `FinancialSummaryCard`
7. `InvoiceTable`
8. `OperationMapDrawer`
9. `InvoiceTrackingGroupedList`
10. `PaymentTypeCell`
11. `IntegrationIcon`
12. `BoardViewSwitcher`

## 11. Prioridade de implementacao

### Fase 1 - Base obrigatoria

1. `AppShell`
2. `Sidebar`
3. `PageHeader`
4. `FilterBar`
5. `FilterInput`
6. `FilterBoolean`
7. `StatusChip`
8. `BooleanIcon`
9. `DataTable`
10. `Dialog`
11. `TabsNav`
12. `PrimaryButton`
13. `SecondaryButton`
14. `OutlinedButton`
15. `InfoBanner`
16. `EmptyState`
17. `ErrorState`
18. `LoadingState`
19. `Snackbar`
20. `DrawerPanel`

### Fase 2 - Operacao

1. `DrawerPanel`
2. `MapScreenLayout`
3. `MapFilterPanel`
4. `MapFloatingAction`
5. `FloatingTotalBar`
6. `TableSwitch`

### Fase 3 - Dominio

1. componentes especificos de appointments
2. componentes especificos de grupo/oferta
3. componentes especificos de financeiro
4. componentes especificos de tenant portal
5. `BoardKanban`
6. `InvoiceTrackingGroupedList`
