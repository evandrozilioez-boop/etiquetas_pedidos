# Publicar o site

Arquitetura recomendada para colocar no ar:

- **Railway**: dois serviços a partir do mesmo repositório e do mesmo `Dockerfile` (site e worker) + PostgreSQL gerenciado.
- **Cloudflare R2**: bucket privado para fotos e vídeos (sem cobrança por download).
- **Domínio**: por exemplo `galeria.giro360.com.br`, apontado para o serviço do site no Railway.

Qualquer hospedagem que rode contêineres Docker com Node e FFmpeg serve (Render, Fly.io, uma VPS com Docker Compose).

## 1. Cloudflare R2

1. No painel da Cloudflare: **R2 › Create bucket** → nome `giro360-midias`, localização automática. Deixe **sem acesso público**.
2. **R2 › Manage R2 API Tokens › Create API token** com permissão *Object Read & Write* só nesse bucket.
   Anote *Access Key ID*, *Secret Access Key* e o endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. CORS do bucket (para o navegador enviar direto): o comando `npm run storage:setup` aplica a regra automaticamente
   com as origens de `S3_CORS_ORIGINS` (ou `APP_URL`). Para conferir à mão, em **Settings › CORS policy**:

```json
[{ "AllowedOrigins": ["https://galeria.giro360.com.br"], "AllowedMethods": ["GET", "PUT", "HEAD"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
```

Variáveis:

```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
S3_BUCKET=giro360-midias
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## 2. Railway

1. Crie um projeto e adicione **PostgreSQL** (Railway › New › Database › PostgreSQL).
2. Adicione um serviço a partir do repositório GitHub, com **Root Directory** `giro360-galeria`. Ele usa o `Dockerfile`.
   - Comando de início: `npm run start:web` (aplica migrações e sobe o site).
   - Health check: `/api/health`.
   - Gere um domínio (ou conecte o seu, item 3).
3. Adicione um **segundo serviço** do mesmo repositório e pasta, com comando de início `npm run worker` e sem domínio.
4. Em ambos os serviços, configure as variáveis (Railway › Variables), com referência ao banco:

```
APP_ENV=production
APP_URL=https://galeria.giro360.com.br
SESSION_SECRET=<gere com: openssl rand -base64 48>
TRUST_PROXY=true
DATABASE_URL=${{Postgres.DATABASE_URL}}
FACE_PROVIDER=none            # troque para rekognition quando configurar a AWS
WHATSAPP_NUMBER=55DDNUMERO
REMOVAL_REQUEST_CONTACT=privacidade@giro360.com.br
# + as variáveis S3_* do item 1
```

5. Primeiro acesso: no serviço do site, abra o **Shell** (ou `railway run`) e execute:

```bash
npm run storage:setup
```

```bash
npm run admin:create -- voce@giro360.com.br "Seu Nome" "uma-senha-forte-com-12+-caracteres"
```

## 3. Domínio

No Railway, **Settings › Networking › Custom Domain** → informe `galeria.giro360.com.br` e crie no seu DNS o registro
CNAME indicado. Atualize `APP_URL` e `S3_CORS_ORIGINS` com o endereço final e rode `npm run storage:setup` de novo.
O QR Code do evento usa `APP_URL`: defina o domínio definitivo antes de imprimir QRs.

Para colocar o portfólio no site atual da Giro, use um link para `https://galeria.giro360.com.br/portfolio`.

## 4. Conferência após publicar

- `https://SEU-DOMINIO/api/health` responde `{"ok":true}`.
- Logs do worker mostram `[worker] iniciado ... reconhecimento: none` (ou `rekognition`).
- Crie um evento de teste, envie uma foto e um vídeo pelo iPhone (Painel › Enviar arquivos), gere o QR individual
  e baixe pelo celular. Depois exclua o evento de teste.

## Escala

- O worker processa `WORKER_CONCURRENCY` arquivos ao mesmo tempo (padrão 2). Vídeos longos em 4K consomem CPU na
  geração da prévia: aumente a CPU do serviço do worker ou rode mais de uma instância (a fila evita trabalho duplicado).
- O site é sem estado (sessões no banco); pode ter várias instâncias.
