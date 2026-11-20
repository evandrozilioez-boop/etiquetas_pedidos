# Backup e restauração

## O que copiar

| Dado | Onde está | Como copiar |
| --- | --- | --- |
| Eventos, mídias (metadados), autorizações, links | PostgreSQL | Backup automático do Railway + `pg_dump` periódico |
| Originais, prévias, capas, logo | Bucket R2 | Cópia para um segundo bucket (rclone) |
| Dados biométricos | Rekognition | **Não copiar.** São recriados ao religar a busca (dentro do prazo de 90 dias) |
| Selfies | — | Nunca são gravadas |

## Banco

- Railway: ative os backups do PostgreSQL no serviço do banco.
- Cópia própria diária (ex.: de um computador do escritório ou de um job agendado):

```bash
pg_dump "$DATABASE_URL" --format=custom --file=giro360-$(date +%F).dump
```

Restaurar tudo num banco vazio:

```bash
pg_restore --clean --no-owner --dbname="$DATABASE_URL" giro360-AAAA-MM-DD.dump
```

## Arquivos (R2)

Crie um segundo bucket (ex.: `giro360-midias-backup`) e sincronize com o [rclone](https://rclone.org/s3/#cloudflare-r2):

```bash
rclone sync r2:giro360-midias r2:giro360-midias-backup --fast-list
```

## Um evento específico

Copiar um evento (banco + todos os arquivos) para uma pasta:

```bash
npm run backup:event -- <id-do-evento> backups/<nome>
```

Restaurar (mesmos ids: o link do evento e os QRs individuais continuam valendo):

```bash
npm run restore:event -- backups/<nome>
```

O id do evento aparece no endereço do painel (`/admin/eventos/<id>`). A restauração mantém registros que já existem,
reenvia ao bucket só os arquivos que faltam e deixa a busca facial desligada.

Procedimento verificado neste projeto: backup de um evento com 5 mídias (19 arquivos), exclusão do evento no banco e
restauração — mídias voltaram como disponíveis e o link individual continuou ativo.
