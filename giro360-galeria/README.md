# Giro 360 | Galeria de Eventos

Galeria de fotos do totem e vídeos da Plataforma 360, com busca por selfie, QR Code individual por captura,
portfólio público e painel de operação. Interface em português, pensada primeiro para o celular.

Hospedagem **somente GitHub + Cloudflare** (a busca por selfie usa, opcionalmente, o Amazon Rekognition).

> Este projeto vive na pasta `giro360-galeria/`. O restante do repositório (sistema de etiquetas) não foi alterado.

## Publicar

Passo a passo completo, sem precisar de terminal: **[docs/publicar.md](docs/publicar.md)**.
Resumo: criar a conta Cloudflare (plano Workers Paid), cadastrar tokens e variáveis no GitHub e rodar o workflow
**Actions › Giro 360 - publicar**. A cada atualização da branch `main`, o GitHub testa e publica sozinho.

## Arquitetura

| Parte | Escolha |
| --- | --- |
| Site, painel e API | Next.js 15 + TypeScript rodando em **Cloudflare Workers** (adaptador OpenNext) — `worker.ts` |
| Banco | **Cloudflare D1** (SQLite), migrações em `migrations-d1/` |
| Arquivos | **Cloudflare R2** privado. O navegador envia direto ao bucket por URL assinada (multipart retomável); visualização e download só por URL temporária emitida após autorização |
| Fila | **Cloudflare Queues** (tentativas limitadas + fila de falhas); consumidor em `worker.ts` → `src/lib/jobs.ts` |
| Processamento pesado | **Cloudflare Containers** com Node + FFmpeg + sharp (`Dockerfile.processor`, `src/processor/`): miniaturas, prévia MP4 720p, quadros de vídeo, IA. Não acessa o banco; devolve resultados ao Worker |
| Manutenção | Cron a cada 15 min: exclusões pendentes, apagamento da biometria após 90 dias, envios abandonados, tarefas paradas |
| Busca facial | Amazon Rekognition (uma coleção por evento), chamado pelo container. `FACE_PROVIDER=none` publica sem selfie; `mock` só para demonstração (recusado em produção) |
| Publicação | GitHub Actions (`.github/workflows/giro360-deploy.yml`) |

Decisões principais (detalhes em [docs/decisoes.md](docs/decisoes.md)):

- **Envio retomável e sem duplicação.** Cada arquivo é identificado por uma impressão digital calculada no navegador
  (nome, tamanho, data e amostras do conteúdo). Repetir o envio devolve o mesmo registro e as partes já confirmadas
  pelo armazenamento. Depois do envio, o SHA-256 é calculado: conteúdo idêntico no mesmo evento vira duplicata e o
  segundo original é apagado. Arquivos diferentes com o mesmo nome são preservados (a chave no bucket é o id).
- **Sem cobrança repetida de IA.** Cada foto ou quadro enviado à IA é registrado (`ai_units`) no mesmo lote das
  referências faciais; reprocessar pula o que já foi indexado. O uso por evento aparece no painel e em `npm run cost:estimate`.
- **Disponível ≠ na busca.** O arquivo fica disponível (QR individual, álbum) assim que o processamento termina,
  independentemente da IA; a indexação facial é uma etapa separada, só com autorização registrada e dentro de 90 dias.
- **Vídeos:** quadros distribuídos ao longo do clipe (`VIDEO_FRAME_INTERVAL_SEC`, máximo `VIDEO_MAX_FRAMES`); correspondências
  agrupadas por arquivo, então a pessoa que aparece várias vezes no giro vê um único resultado.
- **Selfie:** só em memória durante a requisição (Worker → container → Rekognition), nunca gravada nem registrada em log.
- **Prazos:** galeria sempre no ar; download liberado por 30 dias e depois bloqueado com botão “Pedir liberação pelo
  WhatsApp”; “Liberar por mais 30 dias” vale para o evento inteiro; biometria apagada após 90 dias.

## Desenvolvimento e testes locais

Requer Node 22, FFmpeg e MinIO (`docker compose up -d`). Detalhes no fim de [docs/publicar.md](docs/publicar.md).

```bash
npm install && cp .dev.vars.example .dev.vars
```

```bash
npm run storage:setup && npm run db:migrate && npm run admin:create && npm run demo:seed
```

```bash
npm run processor
```

```bash
npm run preview
```

- Painel: <http://localhost:8787/admin>
- Evento de demonstração: link impresso pelo `demo:seed`, código **DEMO26**
- Selfies de teste (modo simulado): <http://localhost:8787/demo/selfies> — a da **Ana** encontra 2 fotos e 1 vídeo

Testes (D1 local do wrangler + MinIO + FFmpeg):

```bash
npm test
```

Cobrem: isolamento entre eventos, bloqueio de acesso direto a mídia privada, QR individual (inclusive com a IA fora
do ar), retomada de envio multipart, reprocessamento sem duplicar original nem cobrança de IA, um único resultado por
vídeo, bloqueio após o prazo, liberação de +30 dias, apagamento da biometria após 90 dias e o cenário de aceite
(convidada em duas fotos e um vídeo de grupo).

## Documentação

- [Publicar (GitHub + Cloudflare)](docs/publicar.md)
- [Reconhecimento facial com Amazon Rekognition](docs/aws-rekognition.md)
- [Backup e restauração](docs/backup.md)
- [Estimativa de custos](docs/custos.md)
- [Privacidade: textos e procedimentos para revisar](docs/privacidade.md)
- [Decisões de produto](docs/decisoes.md)
- Protótipo de interface usado na validação: `docs/prototipo.html`

## Comandos úteis (acrescente `--remote` para agir na produção)

| Comando | O que faz |
| --- | --- |
| `npm run admin:create -- email "Nome" "senha"` | Cria ou troca a senha de um usuário do painel |
| `npm run cost:estimate -- --remote` | Estimativa de custo mensal a partir do uso real |
| `npm run backup:event -- <id> [pasta] --remote` | Copia um evento (banco + arquivos) para uma pasta |
| `npm run restore:event -- <pasta> --remote` | Restaura um evento copiado |
| `npm run db:migrate:remote` | Aplica migrações no D1 de produção (o deploy já faz isso) |
