# Giro 360 | Galeria de Eventos

Galeria de fotos do totem e vídeos da Plataforma 360, com busca por selfie, QR Code individual por captura,
portfólio público e painel de operação. Interface em português, pensada primeiro para o celular.

> Este projeto vive na pasta `giro360-galeria/`. O restante do repositório (sistema de etiquetas) não foi alterado.

## Começar em 5 minutos (Docker)

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

```bash
docker compose run --rm web npm run demo:seed
```

- Painel: <http://localhost:3000/admin> (e-mail e senha de `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`)
- Portfólio público: <http://localhost:3000/portfolio>
- Evento de demonstração: o comando `demo:seed` imprime o link; código **DEMO26**
- Selfies de teste (modo simulado): <http://localhost:3000/demo/selfies> — a da **Ana** encontra 2 fotos e 1 vídeo
- Console do armazenamento local (MinIO): <http://localhost:9001> (giroadmin / giroadmin-secret)

### Testar no celular na mesma rede Wi-Fi

Troque `localhost` pelo IP do computador em `APP_URL`, `S3_PUBLIC_ENDPOINT` (no `.env` e no `docker-compose.yml`)
e em `MINIO_API_CORS_ALLOW_ORIGIN`, reinicie e abra `http://SEU-IP:3000/e/<token>` no celular.
A câmera do navegador exige HTTPS fora de `localhost`; sem HTTPS, use “Escolher uma foto” (que também abre a câmera no celular).

## Sem Docker (desenvolvimento)

Requer Node 20+, PostgreSQL 14+, FFmpeg e um S3 compatível (MinIO).

```bash
npm install
```

```bash
npm run db:migrate && npm run storage:setup && npm run admin:create
```

```bash
npm run dev
```

```bash
npm run worker
```

## Testes

```bash
npm test
```

Os testes de integração usam o banco `giro360_test` e o bucket `giro360-teste` no MinIO local
(variáveis em `tests/setup-env.ts`). Cobrem: isolamento entre eventos, bloqueio de acesso direto a mídia privada,
entrega por QR individual (inclusive com a IA fora do ar), retomada de envio multipart, reprocessamento sem
duplicar original nem cobrança de IA, um único resultado por vídeo, bloqueio após o prazo, apagamento da biometria
após 90 dias e o cenário de aceite (convidada em duas fotos e um vídeo de grupo).

## Como funciona

| Parte | Escolha |
| --- | --- |
| Aplicação | Next.js 15 (App Router) + TypeScript; páginas e API no mesmo serviço |
| Banco | PostgreSQL, SQL puro com migrações em `migrations/` (`npm run db:migrate`) |
| Arquivos | Bucket **privado** S3/R2. O navegador envia direto ao bucket por URL assinada; downloads e prévias só por URL temporária emitida após autorização |
| Processamento | Worker separado (`npm run worker`) com fila persistente no PostgreSQL (`FOR UPDATE SKIP LOCKED`), tentativas limitadas e espera exponencial |
| Mídia | `sharp` para miniaturas/prévias de fotos; FFmpeg para pôster, prévia MP4 720p e quadros de vídeo |
| Busca facial | Amazon Rekognition, uma coleção por evento. Modo `mock` só para demonstração (recusado em produção) e `none` para operar sem IA |

Decisões principais (detalhes em [docs/decisoes.md](docs/decisoes.md)):

- **Envio retomável e sem duplicação.** Cada arquivo é identificado por uma impressão digital calculada no navegador
  (nome, tamanho, data e amostras do conteúdo). Repetir o envio devolve o mesmo registro e as partes já confirmadas
  pelo armazenamento (`ListParts`). Arquivos grandes vão em partes de 16 MB, três em paralelo, com repetição por parte.
  Depois do envio o worker calcula o SHA-256: conteúdo idêntico no mesmo evento vira duplicata e o segundo original é apagado.
  Arquivos diferentes com o mesmo nome são preservados (a chave no bucket é o id, não o nome).
- **Sem cobrança repetida de IA.** Cada foto ou quadro enviado à IA é registrado (`ai_units`) na mesma transação das
  referências faciais. Reprocessar pula o que já foi indexado. O uso por evento fica em `ai_usage` (painel e `npm run cost:estimate`).
- **Disponível ≠ na busca.** Cada arquivo fica disponível (QR individual, álbum) assim que o processamento termina,
  independentemente da IA. A indexação facial é uma etapa separada e só acontece com busca ligada no evento,
  autorização registrada da captura e dentro do prazo de 90 dias.
- **Vídeos:** quadros distribuídos ao longo do clipe (`VIDEO_FRAME_INTERVAL_SEC`, máximo `VIDEO_MAX_FRAMES`);
  as correspondências são agrupadas por arquivo, então a pessoa que aparece várias vezes no giro vê um único resultado.
- **Selfie:** processada só em memória durante a requisição, nunca gravada, enviada ao bucket ou registrada em log.
- **Prazos:** a galeria nunca sai do ar; o download fica liberado por 30 dias e depois bloqueia com botão
  “Pedir liberação pelo WhatsApp”; “Liberar por mais 30 dias” vale para o evento inteiro; a biometria é apagada após 90 dias.

## Documentação

- [Publicar (Railway + Cloudflare R2 + domínio)](docs/publicar.md)
- [Reconhecimento facial com Amazon Rekognition](docs/aws-rekognition.md)
- [Backup e restauração de eventos](docs/backup.md)
- [Estimativa de custos](docs/custos.md)
- [Privacidade: textos e procedimentos para revisar](docs/privacidade.md)
- [Decisões de produto](docs/decisoes.md)
- Protótipo de interface usado na validação: `docs/prototipo.html`

## Comandos úteis

| Comando | O que faz |
| --- | --- |
| `npm run admin:create -- email "Nome" "senha"` | Cria ou troca a senha de um usuário do painel |
| `npm run demo:seed` | Cria o evento de demonstração (não roda em produção) |
| `npm run cost:estimate` | Estimativa de custo mensal a partir do uso real ou de números informados |
| `npm run backup:event -- <id> [pasta]` | Copia um evento (banco + arquivos) para uma pasta |
| `npm run restore:event -- <pasta>` | Restaura um evento copiado |
