# Roteiro do reteste final em DEV — onda pós-validação

Criado em 25/11/2026 pelo coordenador, a pedido do Pedro. Executor: Batedor, no navegador, como usuário.

## Para que serve

Depois que a regra de endereço final entrar em DEV, conferir no navegador que as telas mexidas nesta onda e as telas que dependem delas funcionam para quem usa. Vale para a rodada final; a segunda perna (em andamento, roteiro em `reteste-dev-2026-11-24.md`) cobre os PRs anteriores.

## Regras

- Só DEV: web `properfy.pedroalvs.com`, app `pwa-properfy.pedroalvs.com`.
- Testar pela tela, como usuário. Chamada direta à API só para conferir o que a tela não mostra.
- Sem dado? Criar. O ambiente é para isso (decisão do Pedro, 25/11). Anotar o que foi criado na seção de alterações do relatório.
- DEV envia SMS e e-mail de verdade: só contatos fictícios.
- Credenciais só do note "Acessos QA Properfy". Nada de segredo no relatório.
- Resultado por item: passou, falhou ou não testável, com evidência (captura fora do repositório, texto visto na tela, hora UTC).
- Registrar em `reteste-dev-2026-11-24.md`, seção "Rodada final". Sem commit; o coordenador faz.

## Quando começar

Quando o coordenador avisar que a regra de endereço final está publicada em DEV, com prova pelo log da publicação.

## Endereços de teste

Usar a tabela de `bateria-limiar-endereco.md`. Para os casos abaixo, três tipos bastam:

| Tipo | Exemplo | Resultado esperado |
|---|---|---|
| Bom | 200 George Street, Sydney NSW 2000 | Aceito, pino no lugar |
| Subúrbio errado | 345 Military Road, Newtown NSW 2042 | Recusado |
| Inexistente | 10 Main Street, Faketown NSW 2999 | Recusado |
| Rua sem número | Victoria Avenue, Chatswood NSW 2067 | Aceito, com o pino na rua (decisão 36: número de casa não é exigido) |

## Parte 1 — Telas mexidas

### 1.1 Imóvel (web)

1. Criar imóvel com endereço bom: salva, abre o detalhe com pino, sem "Geocoding in progress.".
2. Criar com subúrbio errado: bloco vermelho com o motivo, campos de endereço marcados, nada salvo.
3. Corrigir o endereço na mesma tela e salvar: o erro some e o imóvel é criado.
4. Depois de uma recusa, usar "Set location manually" com latitude e longitude: salva como manual, sem erro.
5. Preencher só latitude: a tela impede salvar.
6. Editar um imóvel existente sem tocar no endereço (trocar outro campo): salva.
7. Editar trocando o endereço por um ruim: recusado; por um bom: salvo, pino no lugar novo.
8. Imóvel antigo com falha de localização: abre com a faixa amarela e salva outros campos.

### 1.2 Imóvel criado dentro do agendamento (web)

9. Novo agendamento criando o imóvel na hora, com endereço bom: agendamento criado.
10. O mesmo com endereço ruim: recusa com o motivo, nada criado (nem imóvel, nem agendamento).

### 1.3 Filial (web, aba "Branches" da agência)

11. Criar filial com endereço bom: salva; a lista mostra o endereço com número.
12. Criar com endereço ruim: bloco vermelho, campos marcados (inclui "Number"), sem botão de pino.
13. Editar filial: o campo "Number" vem preenchido; salvar sem mexer mantém o número na lista.
14. Editar trocando só o nome de uma filial antiga sem localização: salva.

### 1.4 Base do inspetor (web, gaveta do inspetor)

15. Criar inspetor com base boa: salva, sem selo "No base address".
16. Criar com base ruim: a tela rola até o bloco de erro; campos marcados (inclui "Unit / Number"); nada salvo.
17. Editar só o telefone de um inspetor com base localizada: salva.
18. Editar só o telefone de um inspetor antigo sem base localizada: salva, sem erro.
19. Editar trocando a base por uma ruim: recusado; por uma boa: salvo, e o selo "No base address" some.

### 1.5 Base do inspetor (app, perfil)

20. Trocar a base por um endereço ruim: bloco com o motivo, nada salvo.
21. Trocar por um endereço bom: salvo; o cartão da base mostra o endereço novo.
22. Sem conexão: a tela avisa e não tenta salvar.

### 1.6 Ponto de partida do dia (app, "Today")

23. "Start this day from" com endereço ruim: mensagem com o motivo, origem não muda.
24. Com endereço bom: a rota recalcula; o rótulo mostra "Starting from: número rua, subúrbio estado CEP (this day only)".
25. "Use my base address": volta à base.
26. Depois de trocar a origem, "+N min vs. suggested" continua coerente e "Reset to suggested order" volta à ordem sugerida.

## Parte 2 — Telas correlatas

Usar os imóveis, a filial e o inspetor criados na parte 1.

### 2.1 Importação de agendamentos (web)

27. Importar planilha com uma linha de endereço bom e uma de endereço ruim: o preview abre (o bucket `s3_app` existe), a linha ruim **não** é bloqueada e fica marcada como não localizada.
28. Confirmar a importação: os dois agendamentos são criados; o imóvel da linha ruim fica com a faixa amarela e é corrigível pela edição (itens 7 e 4).

### 2.2 Mapa (web, "Map")

29. Os imóveis aceitos aparecem no ponto certo; o imóvel com pino manual aparece no ponto informado.
30. Imóvel sem localização não aparece com pino em lugar errado.
31. Camada "Activity density" liga e desliga sem erro.

### 2.3 Grupos e ofertas

32. Criar grupo de serviço com agendamentos dos imóveis novos e publicar: a oferta aparece no app para o inspetor de teste que atende a região (web "Service Groups", app "Offers").
33. No app, o mapa da oferta mostra os pontos nos lugares certos.
34. Aceitar a oferta: os agendamentos vão para "Schedule".

### 2.4 Plano do dia e rota (app)

35. "Today" e "Route" (lista e mapa) abrem com as paradas dos imóveis novos, na ordem sugerida, partindo da base nova do inspetor.
36. "Navigate" abre o endereço certo no aplicativo de mapas.
37. Check-in e check-out em uma parada: o aviso de distância do imóvel se comporta como antes (só avisa, não bloqueia).

### 2.5 Operação (web)

38. "Live Day": o inspetor de teste aparece com a rota em linha reta entre os pontos certos.
39. Lista de inspetores: o filtro "No base address" lista só quem está sem base localizada.
40. Detalhe do agendamento: bloco "Field activity" mostra a distância até o imóvel; para usuário de agência não aparece coordenada do inspetor.

### 2.6 Notificações e consentimento (web)

41. "Consent Lookup" está no menu depois de "Notification Templates"; AM/OP precisam escolher a agência; não existe "Record opt-out".
42. Formulário da agência salva e não mostra os dois campos de oferta removidos.

### 2.7 Arquivos (web, app, portal)

43. Enviar imagem e PDF em "Files" do imóvel e do agendamento; baixar; nova versão; apagar.
44. Criar issue com foto no web; "Report issue" com foto no app; reportar problema com foto no portal do inquilino.

### 2.8 Regra final nos casos reais de DEV (web, detalhe do imóvel)

45. Nos imóveis abaixo, recusados na medição anterior, usar "Retry Geocoding" e anotar status, motivo e coordenada antes e depois. A coordenada antiga não pode sumir quando a recusa se repete.

| Imóvel | Subúrbio | Resultado esperado |
|---|---|---|
| IMP-2A412183A9 | Brighton-le-sands | Aceito (o complemento repetido deixa de ir ao mapa; hífen no subúrbio não atrapalha) |
| IMP-748F05CA28 | Carlton | Aceito |
| IMP-90EC930570 | Bexley | Aceito |
| IMP-D3CE99EF20 | Bexley | Aceito |
| IMP-D45E7C3CEF | Hurstville | Aceito |
| IMP-FF4AB720F8 | Hurstville | Aceito |
| IMP-6238CD8E93 | Penshurst | Recusado (CEP errado no cadastro: o mapa devolve outro subúrbio) |
| SPS-006 | Chatswood | Recusado (o mapa devolve a rua em outro subúrbio) |

46. Criar um imóvel com "Address Line 2" legítimo (por exemplo "Unit 5") e outro com o complemento repetindo a rua: os dois são aceitos e continuam sendo imóveis distintos de um terceiro na mesma rua sem complemento.
47. Editar só o "Address Line 2" de um imóvel para o mesmo texto de outro imóvel da mesma rua: aparece o aviso de endereço duplicado, não um erro interno.
48. Filial antiga depois de salva: conferir se a lista mostra o endereço com ", AU" no fim e se as outras filiais aparecem do mesmo jeito.

## Parte 3 — Verificações com data

| Item | Quando | O que conferir |
|---|---|---|
| Aviso "Your route for tomorrow is ready" (PR-06 parte 2) | Depois de 25/11 08:30 UTC | O inspetor INS-0104 recebe o aviso com o plano publicado |
| Rotina de prêmios (P3) | 30/11, depois de 04:45 de Sydney | Períodos fechados e prêmios pendentes criados |
| Texto do ranking (PR-04) | Quando houver inspetor fora do ranking | Texto dos desafios com o mínimo de serviços; depois voltar "Minimum services to be ranked" para 10 |

## Entrega

Relatório com a contagem (passou, falhou, não testável), a lista de falhas com passo a passo para reproduzir, e os dados criados em DEV. Falha em tela mexida volta para o coordenador na hora, sem esperar o fim.
