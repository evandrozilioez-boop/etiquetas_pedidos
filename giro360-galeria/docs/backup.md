# Backup e restauração

## O que copiar

| Dado | Onde está | Como copiar |
| --- | --- | --- |
| Eventos, mídias (metadados), autorizações, links | Cloudflare D1 | **Time Travel** do D1 (automático, 30 dias no plano pago) + exportação periódica |
| Originais, prévias, capas, logo | Cloudflare R2 | Cópia para um segundo bucket ou para fora da Cloudflare |
| Dados biométricos | Rekognition | **Não copiar.** São recriados ao religar a busca (dentro do prazo de 90 dias) |
| Selfies | — | Nunca são gravadas |

## Banco (D1)

O D1 guarda automaticamente o histórico dos últimos 30 dias (**Time Travel**): dá para voltar o banco a qualquer
minuto desse período pelo painel da Cloudflare (D1 › giro360 › Time Travel) ou com:

```bash
npx wrangler d1 time-travel restore giro360 --timestamp=2026-11-20T12:00:00Z
```

Cópia completa em arquivo (para guardar fora da Cloudflare):

```bash
npx wrangler d1 export giro360 --remote --output=giro360-$(date +%F).sql
```

Restaurar um arquivo exportado num banco vazio:

```bash
npx wrangler d1 execute giro360 --remote --file=giro360-AAAA-MM-DD.sql
```

## Arquivos (R2)

Opções, da mais simples à mais completa:

1. **Segundo bucket na Cloudflare:** R2 › giro360-midias › Settings › *Object lifecycle* não apaga nada por padrão;
   para cópia, use o rclone com a chave do R2 ([guia](https://rclone.org/s3/#cloudflare-r2)):

```bash
rclone sync r2:giro360-midias r2:giro360-midias-backup --fast-list
```

2. **Fora da Cloudflare:** o mesmo rclone sincroniza para um HD externo ou outro provedor.

## Um evento específico

Copiar um evento (registros + todos os arquivos) para uma pasta local — usa a chave do R2 em `.dev.vars`:

```bash
npm run backup:event -- <id-do-evento> backups/<nome> --remote
```

Restaurar (mesmos ids: o link do evento e os QRs individuais continuam valendo):

```bash
npm run restore:event -- backups/<nome> --remote
```

O id do evento aparece no endereço do painel (`/admin/eventos/<id>`). A restauração mantém registros que já existem,
reenvia ao bucket só os arquivos que faltam e deixa a busca facial desligada. Mídias que estavam em processamento
voltam como “falhou”: use “Tentar novamente” no painel.
