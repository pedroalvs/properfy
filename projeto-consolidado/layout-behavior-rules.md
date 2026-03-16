# Properfy - Layout and Behavior Rules

Este documento define comportamento esperado da interface alem da aparencia.

Objetivo:

1. evitar que a implementacao fique visualmente parecida, mas funcionalmente inconsistente
2. padronizar estados de interacao
3. guiar IA ou equipe ao implementar as telas

## 1. Regras gerais

1. toda pagina deve deixar claro o objetivo principal em no maximo um header
2. a CTA principal deve ser unica e visualmente dominante
3. filtros nao devem competir visualmente com a CTA
4. a hierarquia entre leitura, acao e estado deve ser consistente

## 2. Regras de carregamento

### 2.1 Loading inicial

1. nao mostrar tela vazia enquanto dados ainda carregam
2. usar skeletons ou placeholders com dimensao proxima do conteudo final
3. evitar spinner sozinho em areas grandes

### 2.2 Loading de acao

1. botao clicado entra em estado de processamento
2. desabilitar repeticao da mesma acao enquanto ela estiver em progresso
3. manter contexto visivel; nao esconder o formulario inteiro

### 2.3 Loading de filtros

1. durante fetch disparado por filtros, pode existir indicador circular posicionado dentro do bloco de filtros
2. esse indicador nao substitui o loading principal da tabela
3. o posicionamento pode variar por breakpoint

## 3. Regras de erro

### 3.1 Erro de pagina

1. mostrar mensagem clara
2. permitir retry
3. nao apagar completamente a estrutura da tela quando isso piorar a experiencia
4. quando o sistema usar snackbar global, a mensagem deve complementar e nao disputar com o erro principal

### 3.2 Erro de formulario

1. exibir erro junto ao campo quando possivel
2. manter mensagem geral apenas quando houver erro sistemico
3. `hide-details` do legado nao impede exibicao contextual de erro no novo sistema

### 3.3 Erro de acao em linha

1. feedback deve aparecer perto da acao acionada
2. nao usar alerta global para erro pequeno de linha sem necessidade

### 3.4 Snackbar global

1. erros globais podem usar snackbar no topo direito
2. suportar multiline quando a mensagem for maior
3. em ambiente de suporte interno, pode exibir payload tecnico quando isso fizer parte do comportamento atual

## 4. Regras de empty state

1. empty state deve diferenciar:
2. sem dados ainda
3. nenhum resultado para o filtro
4. pre-condicao nao atendida
5. quando houver acao sugerida, incluir CTA relevante
6. o texto deve ser curto e utilitario
7. telas com filtro obrigatorio devem preferir mensagem contextual como `Apply a filter...`

## 5. Regras de permissao

1. acoes sem permissao nao devem aparecer como habilitadas
2. quando fizer sentido de produto, a acao pode aparecer desabilitada com tooltip explicativa
3. a tela deve ter fallback para perfil sem acesso total

## 6. Regras de tabela

1. colunas devem priorizar leitura operacional
2. acoes por linha devem ser poucas e previsiveis
3. delete nunca deve ser acao primaria visual
4. linha clicavel so quando isso nao conflitar com botoes internos
5. bulk actions so aparecem quando ha selecao
6. tabelas podem usar `TableSwitch` para revelar colunas extras
7. colunas booleanas devem usar `BooleanIcon`
8. a celula de tipo de pagamento pode usar icone SVG ou MDI, conforme o caso

## 7. Regras de dialog

1. dialog deve ser usado para acao focada e curta
2. formulario longo deve preferir page ou drawer
3. acao primaria fica a direita
4. cancelamento nunca deve competir com a acao primaria

## 7.1 Regras de drawer

1. drawer `480px` para contexto simples ou detalhes de usuario
2. drawer `970px` para contexto complexo e operacional
3. drawer sobrepoe o conteudo em vez de redimensionar a tela

## 8. Regras de sidebar

1. item ativo precisa ser imediatamente identificavel
2. submenu deve abrir sem ruir o layout
3. em touch/mobile, hover deve ser substituido por clique ou expansao explicita
4. a navegacao deve preservar senso de localizacao do usuario
5. sidebar deve desaparecer em modo de impressao

## 9. Regras de filtros

1. filtros mais usados devem aparecer primeiro
2. busca textual deve aparecer antes de filtros secundarios
3. filtros nao podem crescer sem padronizacao de ordem
4. limpar filtros deve ser simples e visivel
5. o estilo do filtro deve reproduzir a linguagem visual do legado, nao apenas usar input comum
6. boolean filters usam container com borda propria
7. grid responsivo de filtros deve respeitar as larguras `lg`, `md` e `sm`

## 10. Regras de mapa

1. mapa e ferramenta de operacao, nao elemento decorativo
2. painel lateral deve permitir acao sem esconder contexto geografico desnecessariamente
3. clusters, marcadores e selecao devem ter semantica visual clara
4. estado vazio no mapa deve instruir o operador
5. painel de filtros do mapa deve usar transicao de entrada/saida lateral

## 10.1 Regras de board

1. board e um template oficial do produto
2. colunas representam status
3. cada coluna usa linha lateral colorida coerente com o status
4. o board deve rolar horizontalmente quando exceder largura
5. deve existir mecanismo de troca entre board e tabela quando essa funcionalidade existir na tela

## 11. Regras de responsividade

### 11.1 Desktop

1. principal experiencia de operacao
2. foco em produtividade e densidade controlada
3. grid de filtros prioriza configuracao ampla em `lg`

### 11.2 Tablet

1. sem perda de funcionalidade
2. adaptacao de layout antes de simplificacao de conteudo
3. grid de filtros pode reorganizar em duas colunas

### 11.3 Mobile

1. priorizar tarefas realmente executadas em mobilidade
2. evitar forcar tabelas amplas sem estrategia
3. drawers e bottom sheets podem substituir modais grandes
4. titulo principal pode reduzir para `20px`

## 12. Regras de consistencia visual

1. botao primario sempre coral
2. tabs com slider coral e ativa azul escuro
3. estados de status respeitam paleta oficial
4. tipografia principal sempre baseada em Nunito
5. layout nunca deve parecer um dashboard generico escuro ou roxo
6. falsos booleanos usam `mdi-close-thick`, nao o icone de fechar de dialog

## 13. Regras de implementacao

1. componentes base devem ser controlados por props previsiveis
2. estilos devem priorizar tokens e variantes, nao overrides soltos por pagina
3. nao duplicar componente visual com nomes diferentes para o mesmo padrao
4. toda tela nova deve ser montada preferencialmente a partir do inventario oficial
