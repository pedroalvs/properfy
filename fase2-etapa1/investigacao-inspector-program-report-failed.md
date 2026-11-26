# Investigação: relatório "Inspector program" com status Failed em DEV

> Só análise. Nenhum código alterado, nenhum commit. Base: `origin/develop` em `a5531f33` (25/11/2026).
> Leitura em DEV feita só pela API, com a conta seed de operador (`op@`), somente GET. Produção não foi acessada.

## 1. Conclusão (resposta curta)

**Não é defeito do relatório do programa nem falta de dados.** O relatório falhou porque **o DEV não consegue gravar arquivos no Storage**: a mensagem de erro gravada no próprio relatório é **`Bucket not found`**.

- O gerador leu os dados do programa sem erro. A falha veio no passo seguinte, ao enviar o XLSX para o Supabase Storage.
- **Não é exclusivo do F08-5.** O último relatório Appointments pedido em DEV (25/09) falhou com a mesma mensagem. Os relatórios de 29/07 ficaram READY. Ou seja, o Storage de relatórios do DEV está quebrado **desde algum momento entre 29/07 e 25/09**, provavelmente na reestruturação de ambientes (`c8510b67`, 05/08).
- **O que destrava:** corrigir a configuração de Storage do DEV (criar o bucket que falta, ou apontar o DEV para o bucket ou projeto certo) e clicar em "Try again". **Semear prêmios não resolve**: com o bucket quebrado, até um relatório com dados falha. **Nenhuma correção de código é necessária.**
- **Em produção:** pelo código, só acontece se o bucket de produção também não existir. O código é o mesmo em todos os ambientes; o que muda é a configuração. Na seção 5 deixo como o Pedro confirma sem ver segredos.

## 2. Por que falhou: o caminho no código

A geração é assíncrona: a tela cria o pedido como PENDING, e o worker pg-boss `report.generate` (`apps/backend/src/main/workers.ts:105-108`) chama `ProcessReportJobUseCase.execute`.

`apps/backend/src/modules/report/application/use-cases/process-report-job.use-case.ts`:

| Passo | Linha | O que faz |
|---|---|---|
| 1 | :45-53 | Marca PROCESSING |
| 2 | :93-94 | `INSPECTOR_PROGRAM` → `getInspectorProgramRows` (lê fechamentos e prêmios) |
| 3 | :105-106 | Gera o XLSX (exceljs) |
| 4 | :109-111 | **Envia para o Storage**: `reports/platform/INSPECTOR_PROGRAM/<id>.xlsx` |
| 5 | :114 | Marca READY com a contagem de linhas |
| erro | :123-127 | **Qualquer exceção** → `markFailed(mensagem)`, que grava a mensagem em `reports.error_message` |

Esse `catch` é o **único** lugar do sistema que marca relatório como FAILED. Não existe varredura que marque "travado" como falho.

**A mensagem recuperada em DEV**, via `GET /v1/reports?reportType=INSPECTOR_PROGRAM`:

| Criado (UTC) | Tipo | Período pedido | Status | Mensagem | Pedido por |
|---|---|---|---|---|---|
| 24/11 01:40 | INSPECTOR_PROGRAM | 01/11 a 24/11 | FAILED | **Bucket not found** | Sarah Operator (op@) |

"Bucket not found" é o erro devolvido pelo Supabase Storage (API S3) quando o bucket configurado não existe no projeto. Ele só pode surgir no passo 4. Logo, os passos 2 e 3 terminaram sem erro.

A mensagem também aparece na tela: abra o relatório em Reports; o detalhe mostra a linha "Message" (`apps/web/src/features/reports/components/ReportDetailSections.tsx:35`).

### Sintomas conhecidos descartados

| Hipótese | Por que não é |
|---|---|
| Relatório vazio marcado como Failed | Corrigido em 25/09 (`b55f2827`, PR #1211). Hoje, vazio gera planilha só com cabeçalho e fica **READY** com 0 linhas (:100-103). No programa, sem fechamento no período, o leitor devolve `[]` (`prisma-report-data-reader.ts:368`), o que dá READY. |
| Storage não configurado | Sem credenciais S3, o container usa `StubReportStorageService` (`container.ts:1776-1778`), que **nunca falha**. Aqui há credenciais, mas o bucket não existe. |
| Período sem dados | Mesmo caso do "vazio": termina READY. |
| Template ou aba da planilha | O exceljs gera uma aba "Report" fixa (`exceljs-xlsx-generator.ts`) e não lê template. O erro registrado não vem daí. |
| Datas inválidas | `fromDate` e `toDate` são obrigatórios no schema (`packages/shared/src/schemas/report.ts:16-17`), e o pedido gravado tem os dois. |

## 3. É do programa ou do ambiente? Histórico de todos os relatórios em DEV

`GET /v1/reports` (todos os tipos):

| Criado (UTC) | Tipo | Status | Linhas | Mensagem |
|---|---|---|---|---|
| 24/11 01:40 | INSPECTOR_PROGRAM | FAILED | — | Bucket not found |
| 25/09 11:07 | APPOINTMENTS | FAILED | — | Bucket not found |
| 29/07 23:32 | FINANCIAL | READY | 4 | — |
| 29/07 23:31 | APPOINTMENTS | READY | 10 | — |
| 29/07 23:01 | APPOINTMENTS | READY | 14 | — |

**É do ambiente.** Dois tipos diferentes falham com o mesmo erro. Relatórios funcionavam em 29/07. A reestruturação dev/staging (`c8510b67`) é de 05/08, dentro dessa janela, e é o candidato natural. Não consigo apontar qual dos três está errado: endpoint S3, bucket inexistente no projeto ou nome do bucket. Isso exige ver a configuração do DEV, e não leio valores de segredo.

O nome do bucket vem da variável `SUPABASE_STORAGE_BUCKET` (padrão `properfy-assets`, `apps/backend/src/main/env.ts:29`). Ela não aparece em `fly.dev.toml`, então vem de um secret do Fly ou do padrão.

**Mesmo armazenamento, outras funções que provavelmente também estão quebradas em DEV** (dedução pelo código, não testei): o mesmo `reportStorageService` é usado no arquivo da fatura do inspetor (`billing.generate-invoice-file`, `container.ts:2060`) e no upload do arquivo de importação de agendamentos (`container.ts:2041`, `:2122`, `:2126`). Se a importação ou o PDF de fatura estiverem falhando em DEV, a causa deve ser a mesma.

Fora do escopo: os arquivos de imóvel do F10 usam o bucket fixo `inspection-assets` (`PROPERTY_FILE_STORAGE_BUCKET`), não este.

## 4. O que destrava

1. **Corrigir o Storage do DEV.** É operação de infraestrutura, só em DEV, e fica com o Pedro. Uma de duas:
   - criar no projeto Supabase do DEV um bucket **privado** com o nome que o DEV usa (`properfy-assets`, se o secret não define outro); ou
   - apontar `SUPABASE_STORAGE_BUCKET`, o endpoint ou as chaves S3 do DEV para o bucket ou projeto certo.
2. **Clicar em "Try again"** no relatório, ou pedir um novo. Esperado:
   - se houver fechamento de período entre 01/11 e 24/11: READY com as linhas do programa;
   - se não houver: READY com 0 linhas e planilha só com cabeçalho, sem Failed.
3. **Para ver linhas de verdade:** o DEV tem 1 meta ("Smoke weekly volume"). O relatório conta por fechamento de período (`goal_period_closures.period_end`), feito pelo job diário `inspector-program.daily` às 04:45 Sydney. Sem fechamento no intervalo, o resultado é 0 linhas. Isso é **comportamento correto**, não falha.

**Semear prêmios sem corrigir o bucket não resolve:** o relatório leria os prêmios e cairia no mesmo `Bucket not found` no envio.

**Nenhuma mudança de código é necessária** para o sintoma.

## 5. Em produção aconteceria?

**Pelo código, não.** O F08-5 usa o mesmo caminho dos outros relatórios. Só falharia em produção se o bucket de produção também não existir, e nesse caso **todos** os relatórios, as faturas e a importação de produção estariam falhando, o que provavelmente já teria aparecido.

Como o Pedro confirma sem ler segredos e sem alterar nada:

- **Pela tela:** em Reports de produção, verificar se algum relatório recente está READY e baixa. Se existir FAILED, abrir e ler a linha "Message".
- **Leitura no banco** (somente leitura):
  ```sql
  SELECT report_type, status, count(*), max(created_at)
  FROM reports
  WHERE created_at > now() - interval '90 days'
  GROUP BY 1, 2 ORDER BY 1, 2;

  SELECT created_at, report_type, error_message
  FROM reports
  WHERE status = 'FAILED'
  ORDER BY created_at DESC LIMIT 20;
  ```
  Esperado em produção: nenhuma linha com `Bucket not found`.
- **Configuração:** `fly secrets list -a <app>` mostra só **nomes** e datas, nunca valores. Serve para ver se `SUPABASE_STORAGE_BUCKET` está definido. Em seguida, no painel do Supabase de cada projeto, conferir se o bucket com esse nome existe.

Vale fazer a mesma checagem em **staging** antes da próxima promoção, para não descobrir lá.

## 6. Observação paralela (não pedida; não resolvi)

O e-mail "relatório pronto" ou "relatório falhou" **não é enviado para relatórios de plataforma**: os dois envios saem cedo quando `tenantId` é nulo (`process-report-job.use-case.ts:145` e `:181`). O Inspector program é sempre de plataforma (D12), então quem pede nunca recebe e-mail; só vê o status na tela. Pode ser intencional, porque o template de notificação é por agência. Se o Pedro quiser, isso vai para `estacionamento.md`; não muda nada desta investigação.

## 7. Decisões para o Pedro

1. **Corrigir o Storage do DEV**: criar o bucket ou corrigir a configuração. Recomendo: sim, e depois "Try again" no relatório de 24/11, para reabrir o reteste do F08-5.
2. **Checar staging e produção** com a leitura da seção 5. Recomendo: sim, antes da próxima promoção.
3. **E-mail para relatórios de plataforma** (seção 6): estacionar ou ignorar. Recomendo estacionar.
