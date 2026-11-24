# Publicar o site (somente GitHub + Cloudflare)

Tudo roda na Cloudflare e é publicado automaticamente pelo GitHub Actions a cada atualização da branch `main`:

| Parte | Serviço Cloudflare |
| --- | --- |
| Site, painel e API | Workers (Next.js via OpenNext) |
| Banco de dados | D1 |
| Fotos e vídeos | R2 (bucket privado) |
| Fila de processamento | Queues |
| Processamento de vídeo e foto (FFmpeg, miniaturas, quadros) | Containers |
| Manutenção (exclusões pendentes, prazo da biometria) | Cron Triggers |

A busca por selfie usa o Amazon Rekognition (AWS) e é opcional: o site funciona sem ela.

## 1. Conta Cloudflare (uma vez)

1. Crie a conta em <https://dash.cloudflare.com/sign-up>.
2. Assine o plano **Workers Paid** (Workers & Pages › Plans; US$ 5/mês). Ele é necessário para filas e containers.
3. Ative o **R2** (menu R2 › “Purchase R2”; não há cobrança até passar da franquia gratuita).
4. Anote o **Account ID** (aparece na lateral da página inicial da conta ou em Workers & Pages).

### Token para o GitHub publicar

My Profile › API Tokens › **Create Token** › modelo **“Edit Cloudflare Workers”** › em *Permissions*, adicione também:

- Account › **D1** › Edit
- Account › **Queues** › Edit
- Account › **Workers R2 Storage** › Edit
- Account › **Cloudflare Containers** (ou “Containers”) › Edit

Em *Account Resources*, escolha a conta da Giro. Crie e copie o token (ele aparece uma vez só).
Se a publicação acusar permissão faltando, edite o token e acrescente a permissão citada na mensagem.

### Chave de acesso ao R2 (para links assinados)

R2 › **Manage R2 API Tokens** › Create API token › permissão **Object Read & Write** › bucket **giro360-midias**
(se o bucket ainda não existir, escolha “Apply to all buckets”). Copie o *Access Key ID* e o *Secret Access Key*.

## 2. Configurar o GitHub (uma vez)

No repositório: **Settings › Secrets and variables › Actions**.

**Secrets** (aba *Secrets*):

| Nome | Valor |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | token criado acima |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | chave do R2 |
| `SESSION_SECRET` | texto aleatório com 48+ caracteres (ex.: gere em <https://www.random.org/strings/> ou use um gerenciador de senhas) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | primeiro usuário do painel (senha com 12+ caracteres) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | opcional, só para a busca por selfie (docs/aws-rekognition.md) |

**Variables** (aba *Variables*):

| Nome | Exemplo |
| --- | --- |
| `APP_URL` | `https://giro360-galeria.SEU-SUBDOMINIO.workers.dev` (depois, o domínio próprio) |
| `WHATSAPP_NUMBER` | `5548999990000` (pedidos de liberação) |
| `REMOVAL_REQUEST_CONTACT` | `privacidade@giro360.com.br` |
| `FACE_PROVIDER` | `none` (sem selfie) ou `rekognition` |

O subdomínio `*.workers.dev` aparece em Workers & Pages › (lado direito) “Your subdomain”.

## 3. Primeira publicação

1. Leve o código para a branch `main` (ou abra **Actions › Giro 360 - publicar › Run workflow**).
2. Na primeira vez, rode manualmente com **“Criar/atualizar o usuário do painel”** marcado.
3. O workflow: roda os testes → cria (se não existirem) o banco D1, o bucket R2 com CORS e as filas → aplica as
   migrações → publica site, worker e container → envia os segredos → confere `APP_URL/api/health`.
4. Acesse `APP_URL/admin` com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

A primeira publicação demora mais (a imagem do container é construída e enviada). A primeira mídia processada
também pode levar alguns segundos a mais enquanto o container liga.

## 4. Domínio próprio (ex.: galeria.giro360.com.br)

1. Adicione o domínio à Cloudflare (Add a site) e troque os servidores DNS no registro (Registro.br etc.).
2. Workers & Pages › **giro360-galeria** › Settings › Domains & Routes › **Add › Custom domain** › `galeria.giro360.com.br`.
3. Atualize a variável `APP_URL` no GitHub e rode o workflow de novo (atualiza links, QR Codes e o CORS do R2).

Defina o domínio definitivo **antes** de imprimir QR Codes: eles usam `APP_URL`.

## 5. Conferência

- `APP_URL/api/health` responde `{"ok":true}`.
- Workers & Pages › giro360-galeria › Logs: mensagens `[fila]` e `[manutenção]`.
- Crie um evento de teste, envie uma foto e um vídeo pelo iPhone (Painel › Enviar arquivos), gere o QR individual
  e baixe pelo celular. Depois exclua o evento de teste.

## Desenvolvimento local

Requer Node 22, FFmpeg e um S3 local (MinIO: `docker compose up -d` ou o binário do MinIO).

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run storage:setup && npm run db:migrate && npm run admin:create
```

Em dois terminais:

```bash
npm run processor
```

```bash
npm run preview
```

Abra <http://localhost:8787/admin>. Para dados de demonstração: `npm run demo:seed` (código **DEMO26**).
O `preview` roda o Worker de verdade (runtime da Cloudflare) com D1 e fila locais; o processamento vai para o
servidor local em `PROCESSOR_URL` em vez do container.
