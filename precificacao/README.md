# Precificação · Mercado Livre Brasil

Simulador avulso que calcula o **menor preço de anúncio (em centavos) que entrega a sua margem sobre a receita**, separadamente para **Clássico** (`gold_special`) e **Premium** (`gold_pro`). O cálculo considera compra, tarifas do Mercado Livre, frete do vendedor, tributos (Simples Nacional ou Lucro Real), Mercado Ads, cupom/promoção, devoluções e despesas fixas.

O app **só lê dados**: não publica anúncios nem altera preços na sua conta.

```
precificacao/
  src/engine/   motor de cálculo puro (TypeScript + decimal.js), sem interface
  src/server/   API Express: integração Mercado Livre, persistência, modo demonstração
  src/web/      interface React + Material UI (pt-BR, desktop e celular)
  tests/        testes de aceitação (Vitest)
  templates/    modelo CSV da tabela de frete
  data/         configurações gravadas (perfis CNPJ, tabelas) e tokens — fora do git
```

A stack reaproveita a do repositório (Express + TypeScript no servidor, React + Vite + MUI no navegador). A persistência é um arquivo JSON (`data/config.json`), sem banco de dados.

## Como rodar

Requisitos: Node.js 20 ou mais recente.

```bash
cd precificacao
npm install
```

Desenvolvimento (API na porta 3340 e interface com recarga automática em http://localhost:5180):

```bash
npm run dev
```

Uso normal (compila a interface e serve tudo em http://localhost:3340):

```bash
npm run build && npm start
```

Testes:

```bash
npm test
```

Sem credenciais, o app abre em **modo demonstração**: barra laranja, avisos em cada resultado, e tarifa, tabela de frete e perfil fiscal marcados como **fictícios**. Esses dados só existem nesse modo; o motor recusa tabelas e perfis fictícios fora dele.

## Exemplo para conferir com a calculadora

Rode em modo demonstração (`npm run build && npm start`, sem `.env`). Na aba **Simulação**, preencha:

| Campo | Valor |
|---|---|
| Categoria | `MLB1626` (Enter) |
| Custo unitário de compra | 600 |
| Frete de entrada / Embalagem | 0 / 0 |
| Margem desejada | 25 |
| CNPJ vendedor | Empresa DEMONSTRAÇÃO (DAS fictício de 7,3% sobre a receita) |
| Modalidade | Mercado Envios Drop Off |
| Caixa 1 | 1 caixa, 3,5 kg, 40 × 30 × 20 cm |
| Frete | Cotação manual da remessa: R$ 50,00, origem "exemplo" |

Clique em **Calcular preço para minha margem**. Resultado: **Clássico R$ 1.156,59** e **Premium R$ 1.269,52**.

Conferência do Clássico (tarifa fictícia de 11,5% no modo demonstração):

```
Estimativa: 650 ÷ (1 − 0,25 − 0,115 − 0,073) = 650 ÷ 0,562 = 1.156,58...
Tarifa   11,5% × 1.156,59 = 133,00785 → R$ 133,01
DAS       7,3% × 1.156,59 =  84,43107 → R$  84,43
Resultado 1.156,59 − 600,00 − 50,00 − 133,01 − 84,43 = R$ 289,15
Meta      25% × 1.156,59 = 289,1475  → 289,15 ≥ 289,1475 ✔
Margem    289,15 ÷ 1.156,59 = 25,00%
Um centavo abaixo (1.156,58): resultado 289,14 < meta 289,145 ✘
```

Premium (tarifa fictícia de 16,5%): tarifa 16,5% × 1.269,52 = 209,47; DAS 92,67; resultado 1.269,52 − 600 − 50 − 209,47 − 92,67 = **R$ 317,38** = 25% × 1.269,52.

Cada componente é arredondado ao centavo (meio para cima). Por isso o preço exato pode ficar um centavo abaixo da estimativa pela fórmula.

## Meus produtos

A aba **Meus produtos** guarda os itens que você revende:

- **Cadastrar produto** grava nome, SKU, categoria, unidades por venda, custo de compra, frete de entrada e embalagem.
- Na simulação, **Salvar produto** grava tudo o que está na tela (custos, caixas, frete, despesas, margem). Se você calculou antes, grava também o preço sugerido de cada cenário.
- **Simular preço** reabre o item na simulação com a data de hoje. **Atualizar custo** troca o custo de compra e guarda o anterior no **Histórico**. Quando o custo muda depois do último cálculo, o card avisa para simular de novo.

Os produtos ficam em `data/config.json`, junto com perfis e tabelas.

## Como o cálculo funciona

1. **Receita do vendedor** = preço anunciado − desconto custeado pela loja. O comprador paga o preço menos o desconto total. A parte custeada pelo Mercado Livre só entra quando você a informa. O cupom é descontado uma única vez.
2. Cada tarifa, tributo e despesa usa a **sua própria base**: preço anunciado, valor pago pelo comprador ou receita do vendedor.
3. **Resultado gerencial** = receita − custo de aquisição − tarifa − frete − tributos líquidos (créditos abatidos) − Ads − reserva de devoluções − despesas fixas − provisão de IRPJ/CSLL.
4. **Margem** = resultado ÷ receita do vendedor.
5. **Busca do preço**: o motor reúne as fronteiras de todas as regras que dependem do preço (faixas de frete, faixas de tarifa) e as converte para preço anunciado. Entre duas fronteiras tudo é afim, então a condição "resultado ≥ margem × receita" é monótona naquele intervalo e uma bissecção **local** é válida. Os intervalos são avaliados em ordem crescente. O primeiro preço que atinge a meta é revalidado e conferido também um centavo abaixo. Não há busca binária global, porque a margem pode cair logo depois de um salto de frete.
6. **Status do preço**:
   - *Menor preço comprovado*: todas as regras dependentes de preço são conhecidas (ajuste manual da tarifa total, ou faixas conhecidas como no modo demonstração).
   - *Preço validado para a meta*: a tarifa veio da API ponto a ponto. Ela foi confirmada no preço final, mas a API não informa a faixa de validade da regra, então o app não afirma que é o menor possível.
   - *Dados pendentes* lista os campos que faltam. *Meta inviável* explica a condição que impede o cálculo.

## Tarifas do Mercado Livre (API oficial)

Base: documentação "Custos por vender" (`developers.mercadolivre.com.br/pt_br/comissao-por-vender`, atualizada em 03/09/2026).

- Chamada: `GET /sites/MLB/listing_prices` com `price`, `category_id`, `listing_type_id`, `currency_id=BRL`, `logistic_type`, `shipping_mode` e `quantity=1`, autenticada com `Authorization: Bearer`.
- `sale_fee_amount` é o **total** da tarifa de venda. `sale_fee_details.fixed_fee` "já está incluído em sale_fee_amount; não o adicione novamente". `percentage_fee`, `financing_add_on_fee` e `gross_amount` só detalham o total. O app desconta a tarifa uma única vez.
- O preço enviado é o preço da venda inteira. "Unidades vendidas no anúncio" multiplica o custo de compra (kit); a tarifa é consultada para uma venda (`quantity=1`).
- Para não consultar a API a cada centavo, o motor usa a regra observada (percentual efetivo + tarifa fixa) para localizar o candidato e depois **consulta de novo no preço final**. Se a regra mudar, repete com a nova regra (até 8 vezes). As respostas ficam em cache por `ML_CACHE_MINUTOS` (padrão 30) e só para o mesmo preço. Uma resposta reutilizada aparece como "(reutilizada, consultada em …)".
- **Ajuste manual** (por tipo de anúncio) com escopo explícito: *tarifa total*, *componente percentual* ou *componente tarifa fixa*, em % ou R$. O ajuste substitui o valor correspondente, e a memória mostra o valor consultado, o ajuste, a fonte e a data.
- **API indisponível**: a simulação fica preenchida, o cenário vira *pendente* com a mensagem de erro e o app pede a tarifa total manual. O app nunca usa zero nem uma comissão inventada.

## Frete por tabela

Na aba **Tabelas de frete**, baixe o **Modelo CSV** (também em `templates/tabela-frete-modelo.csv`; os valores do modelo são ilustrativos). Preencha os metadados: fonte, vigência, modalidades, base da faixa de preço, peso cúbico (divisor e arredondamento), regra de múltiplos volumes e limites de dimensão. Depois cole ou carregue o CSV e clique em **Validar e ver prévia**. A importação só é liberada sem erros: números inválidos, faixas invertidas e faixas sobrepostas bloqueiam.

Formato (separador `;`, vírgula decimal):

```
preco_min;preco_max;peso_min_kg;peso_max_kg;regiao;custo
```

`preco_min` é inclusivo e `preco_max` exclusivo. `peso_min` é exclusivo (0 inclui 0) e `peso_max` inclusivo. Vazio significa sem limite ou qualquer região. `custo` é o frete que cabe ao vendedor.

- O peso cúbico só é aplicado se a tabela mandar (C × L × A ÷ divisor, depois o arredondamento da tabela).
- **Várias caixas**: *por volume* enquadra cada caixa e soma. *Pelo conjunto* soma os pesos faturáveis e enquadra uma vez. *Não define regra* devolve o motivo e pede uma cotação manual. As caixas nunca são fundidas numa caixa fictícia. A memória mostra peso real, cúbico, faturável e enquadramento de cada caixa.
- Tabela fora da vigência, modalidade diferente, excesso de dimensão ou falta de faixa são mostrados como motivo, com a sugestão de **cotação manual da remessa completa** (valor + origem).
- Na API, a tarifa fixa do Mercado Livre faz parte da tarifa de venda e não é somada ao frete.

## Tributos

Na aba **Perfis CNPJ**, cada parâmetro tem quatro situações: **informado**, **zero confirmado**, **não se aplica** e **não informado**. "Não informado" bloqueia o cálculo e aparece como pendência. Nenhum percentual é preenchido automaticamente.

- **Simples Nacional**: alíquota efetiva do DAS, base e parcela da base, lista de tributos já incluídos no DAS e incidências adicionais. Uma incidência adicional de um tributo que já está no DAS é exibida e não somada.
- **Lucro Real**: tributos da operação, créditos recuperáveis e provisão gerencial de IRPJ/CSLL (% do resultado, % da receita ou R$ por venda). Um crédito marcado "já abatido do custo de aquisição" não é aproveitado de novo. Sem critério de provisão, o resultado aparece **antes da provisão** e a margem final fica marcada como pendente.
- **Comparar Simples × Lucro Real** gera os quatro cenários (Clássico/Simples, Premium/Simples, Clássico/Lucro Real, Premium/Lucro Real) com a mesma operação e lista as diferenças de premissas.

## Substituir os dados de demonstração pelos seus

1. **Credenciais do Mercado Livre** (ficam só no servidor):
   ```bash
   cp .env.example .env
   ```
   Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REFRESH_TOKEN` (recomendado, com renovação automática) **ou** apenas `ML_ACCESS_TOKEN`, defina `ML_MODE=producao` e reinicie com `npm start`. O refresh token novo devolvido pelo Mercado Livre é gravado em `data/tokens.json` (permissão 600). Para obter os valores, crie um aplicativo em developers.mercadolivre.com.br e siga "Autenticação e Autorização". Com credenciais válidas, a barra fica azul e o perfil, a tabela e as tarifas fictícios somem.
2. **Tabela de frete**: importe a tabela oficial vigente da sua modalidade ou a da sua transportadora, com fonte e vigência.
3. **Parâmetros do contador**: crie um perfil por CNPJ na aba **Perfis CNPJ**. Preencha a vigência, a base de incidência, o que já está no DAS ou no custo e o critério da provisão.

Configurações e tokens ficam em `data/`, que está no `.gitignore`. Faça backup desse diretório.

## Testes de aceitação cobertos

`npm test` executa 39 testes, entre eles:

- R$ 600 com 40% → R$ 1.000,00 e resultado R$ 400,00; campo vazio vira pendência, não zero.
- Tarifa de 15% e margem de 25% → R$ 1.000,00, tarifa R$ 150,00, resultado R$ 250,00.
- Cupom de R$ 100 (loja R$ 60, Mercado Livre R$ 40) → comprador paga R$ 900,00 e a receita é R$ 940,00, sem desconto duplicado.
- Sofá em duas caixas: por volume (R$ 70 + R$ 40), pelo conjunto (33 kg → R$ 120), peso cúbico, tabela sem regra de volumes, cotação manual e excesso de dimensão. Compra e tarifa contadas uma vez.
- Salto de frete em R$ 79,00: margem antes e depois do limite, primeira faixa que comporta a meta e solução exatamente na fronteira.
- Ajuste manual de componente, iteração com a API, API indisponível, tabela vencida, tabela fictícia bloqueada, dado fiscal ausente, imposto em duplicidade com o DAS, provisão pendente e informada, crédito já descontado do custo e meta inviável.
- Servidor: leitura de `listing_prices`, token só no servidor com renovação em 401, erro HTTP 503, dados fictícios ocultos em produção, prévia e importação de CSV.
