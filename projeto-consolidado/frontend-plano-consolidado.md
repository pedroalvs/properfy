# Properfy - Plano Consolidado de Frontend

Este documento organiza a implementacao do frontend em uma sequencia que uma IA consiga executar com alta previsibilidade.

Objetivo:

1. reduzir ambiguidade tecnica
2. evitar implementacao fora do padrao visual real
3. permitir execucao por fases com entregaveis verificaveis
4. servir como roteiro direto para Claude Code, Codex ou outra IA de implementacao

## 1. Premissas fechadas

### 1.1 Stack

1. `React`
2. `Vite`
3. `Tailwind CSS`
4. monorepo com `apps/web`, `apps/pwa` e `packages/shared`
5. contratos consumidos a partir de OpenAPI gerado pelo backend

### 1.2 Diretriz de design

1. o frontend novo e uma evolucao do sistema atual, nao um redesign livre
2. a referencia primaria e o comportamento real auditado do app em producao
3. o visual deve evitar aparencia de template genérico de Tailwind

### 1.3 Fonte de verdade

A IA deve considerar como fonte principal:

1. `ui-system-atual.md`
2. `frontend-system-spec.md`
3. `component-inventory.md`
4. `layout-behavior-rules.md`
5. `frontend-auditoria-ui-system.md`

## 2. Ordem obrigatoria de implementacao

A IA nao deve começar por telas finais.

A ordem correta e:

1. tokens e fundacao visual
2. app shell e layout base
3. componentes base
4. estados globais
5. templates de pagina
6. componentes de dominio
7. telas por modulo
8. refinamento responsivo
9. testes visuais e funcionais

## 3. Fase 0 - Fundacao visual

### Objetivo

Criar a base do design system antes de qualquer tela real.

### Entregaveis

1. tema global com tokens CSS
2. configuracao da fonte `Nunito`
3. escala tipografica oficial
4. utilitarios de cores e spacing
5. mapa de status inicial

### Itens obrigatorios

1. tokens para todas as cores oficiais
2. spacing de pagina `24px 32px`
3. sidebar width `75px`
4. tokens de raio e sombras
5. tipografia de page title, dialog title, table header, body, tabs

### Definition of Done

1. existe um arquivo central de tokens
2. a IA nao cria cores hardcoded fora dos tokens sem justificativa
3. existe playground ou pagina de preview com tipografia, cores e buttons

## 4. Fase 1 - Shell da aplicacao

### Objetivo

Montar a moldura principal do sistema.

### Entregaveis

1. `AppShell`
2. `Sidebar`
3. `SidebarItem`
4. `SidebarSubmenu`
5. `SidebarUser`
6. area principal com padding correto

### Regras obrigatorias

1. sidebar fixa de `75px`
2. submenu flutuante com glassmorphism leve
3. item ativo com barra lateral de `4px`
4. variante especial para views de mapa
5. suporte responsivo para drawer mobile

### Definition of Done

1. shell funciona em desktop, tablet e mobile
2. estado ativo de rota esta correto
3. submenu nao quebra layout
4. estrutura visual bate com o legado auditado

## 5. Fase 2 - Primitive components

### Objetivo

Criar a base reutilizavel antes de telas especificas.

### Entregaveis

1. `PrimaryButton`
2. `SecondaryButton`
3. `OutlinedButton`
4. `IconButton`
5. `StatusChip`
6. `BooleanIcon`
7. `InfoBanner`
8. `Snackbar`
9. `Dialog`
10. `DrawerPanel`

### Regras obrigatorias

1. CTA primario sempre coral
2. delete sempre visualmente subordinado
3. `BooleanIcon` usa `mdi-check-bold` e `mdi-close-thick`
4. drawers suportam variantes `480px` e `970px`
5. snackbar suporta erro multiline top-right

### Definition of Done

1. todos os componentes possuem variantes previsiveis por props
2. os componentes possuem stories, exemplos ou pagina de showcase
3. a IA nao implementa versoes paralelas do mesmo componente em tela isolada

## 6. Fase 3 - Sistema de filtros

### Objetivo

Reproduzir corretamente a parte mais facil de sair errada visualmente.

### Entregaveis

1. `FilterBar`
2. `FilterInput`
3. `FilterSelect`
4. `FilterAutocomplete`
5. `FilterDateRange`
6. `FilterBoolean`
7. `FilterLoadingIndicator`

### Regras obrigatorias

1. nao usar input genérico de Tailwind como substituto final
2. replicar o visual de borda via sombra e label customizada
3. suportar grid responsivo `lg/md/sm`
4. filtros booleanos devem usar container com borda propria
5. loading de filtros pode coexistir com loading da tabela

### Definition of Done

1. existe uma tela de exemplo so para os filtros
2. search, select, autocomplete, boolean e date range seguem a mesma linguagem visual
3. filtro em mobile/tablet nao parece improvisado

## 7. Fase 4 - Tabela e estados de tela

### Objetivo

Criar o conjunto base para a maior parte do produto.

### Entregaveis

1. `DataTable`
2. `RowActions`
3. `EntityListCard`
4. `TableSwitch`
5. `EmptyState`
6. `ErrorState`
7. `LoadingState`

### Regras obrigatorias

1. fundo branco e header com peso correto
2. empty state deve diferenciar ausencia total, sem resultado e filtro obrigatorio
3. `TableSwitch` deve poder revelar colunas extras
4. linha clicavel nao pode conflitar com botoes internos
5. loading inicial deve usar skeleton

### Definition of Done

1. existe pelo menos uma tabela de showcase cobrindo todos os estados
2. chips, boolean icons e row actions funcionam juntos
3. a tabela e utilizavel em desktop e aceitavel em tablet/mobile

## 8. Fase 5 - Navegacao de conteudo e templates

### Objetivo

Criar os templates que suportam o maior numero de telas.

### Entregaveis

1. `PageHeader`
2. `TabsNav`
3. template lista com filtros + tabela
4. template tabs + conteudo
5. template tabela direta sem filtros
6. template grouped list

### Regras obrigatorias

1. `PageHeader` suporta um ou mais botoes
2. tabs usam ativa azul escuro e slider coral
3. grouped list suporta titulos de periodo e secoes

### Definition of Done

1. os templates cobrem pelo menos 70% das paginas mapeadas
2. a IA consegue criar paginas novas sem reinventar layout

## 9. Fase 6 - Templates especiais

### Objetivo

Cobrir os layouts de maior risco e maior diferenca do sistema legado.

### Entregaveis

1. `MapScreenLayout`
2. `MapFiltersPanel`
3. `MapFloatingAction`
4. `BoardKanban`
5. `BoardViewSwitcher`
6. `FloatingTotalBar`
7. `InvoiceTrackingGroupedList`

### Regras obrigatorias

1. mapa usa painel de `480px` com transicao lateral
2. board usa colunas por status e scroll horizontal
3. `FloatingTotalBar` suporta gradiente animado
4. grouped invoice list suporta agrupamento por periodo

### Definition of Done

1. mapa, board e invoice tracking estao representados em ao menos uma tela real ou demo
2. as interacoes especiais estao claras e nao improvisadas

## 10. Fase 7 - Componentes de dominio

### Objetivo

Só agora entrar nas estruturas especificas do produto.

### Entregaveis sugeridos

1. `AppointmentStatusChip`
2. `AppointmentFilters`
3. `GroupOfferCard`
4. `InspectorCard`
5. `TenantConfirmationPanel`
6. `FinancialSummaryCard`
7. `PaymentTypeCell`
8. `IntegrationIcon`

### Regras obrigatorias

1. usar sempre os componentes base antes de criar wrappers de dominio
2. nao duplicar implementacao de chip, botao ou tabela em componentes de dominio

### Definition of Done

1. componentes de dominio so encapsulam comportamento/contexto, nao refazem a base visual

## 11. Fase 8 - Telas do produto

### Ordem sugerida

1. telas de lista simples
2. telas com tabs
3. telas financeiras
4. telas de usuario com drawer
5. telas de mapa
6. board/kanban

### Regras obrigatorias

1. cada tela deve declarar qual template usa
2. cada tela deve usar os componentes oficiais do inventario
3. toda tela deve possuir loading, error e empty state

## 12. Gaps que precisam ser fechados antes ou durante a implementacao

### Gaps funcionais/visuais ainda abertos

1. mapa final de status visual incluindo `REJECTED` e `DONE`
2. confirmacao se o board faz parte do novo escopo
3. lista final de assets SVG a reaproveitar
4. comportamento real do `TableSwitch` por tela
5. estrategia para manter ou simplificar snackbar tecnico com payload completo

### Regra para a IA

Se algum desses pontos ainda estiver aberto no momento da implementacao:

1. a IA deve registrar a assuncao explicitamente
2. a IA nao deve inventar um comportamento sofisticado sem marcar como assuncao provisoria

## 13. Checklist de implementacao para IA

Antes de gerar codigo de uma fase, a IA deve responder internamente:

1. quais arquivos do dossie sao fonte de verdade desta fase
2. quais componentes base ja existem e devem ser reutilizados
3. quais regras visuais sao obrigatorias
4. quais estados de tela precisam ser cobertos
5. quais breakpoints precisam ser validados
6. quais partes ainda sao assuncao temporaria

## 14. Prompt-base para implementar o frontend

```text
Implemente a fase X do frontend do Properfy usando os documentos do diretorio `projeto-consolidado` como fonte de verdade.

Arquivos obrigatorios para leitura:
1. `projeto-consolidado/frontend-system-spec.md`
2. `projeto-consolidado/component-inventory.md`
3. `projeto-consolidado/layout-behavior-rules.md`
4. `projeto-consolidado/frontend-auditoria-ui-system.md`

Regras:
1. nao redesenhe a interface livremente
2. preserve os tokens e padroes auditados do sistema atual
3. reutilize componentes base antes de criar variacoes por tela
4. implemente loading, empty, error e permission states
5. respeite a responsividade descrita nos documentos
6. se alguma regra ainda estiver aberta, declare a assuncao no resultado

Entregue:
1. codigo
2. breve resumo do que foi implementado
3. assuncoes feitas
4. validacao executada
```

## 15. Proxima ordem ideal de execucao

Se a implementacao comecar agora, a melhor sequencia e:

1. Fase 0 - Fundacao visual
2. Fase 1 - Shell da aplicacao
3. Fase 2 - Primitive components
4. Fase 3 - Sistema de filtros
5. Fase 4 - Tabela e estados de tela
6. Fase 5 - Navegacao de conteudo e templates
7. decidir board, status faltantes e assets SVG
8. Fase 6 - Templates especiais
9. Fase 7 - Componentes de dominio
10. Fase 8 - Telas do produto
