# Estimativa de custos

```bash
npm run cost:estimate -- --remote
```

Com `--remote`, usa o uso real registrado nos últimos 30 dias no banco de produção (armazenamento atual, fotos e quadros enviados à IA,
buscas). Para simular um cenário:

```bash
npm run cost:estimate -- --gb 500 --fotos 20000 --quadros 40000 --buscas 8000
```

## Fórmula

```
custo mensal ≈ (GB armazenados − 10) × preço do GB no R2
             + (fotos indexadas + quadros de vídeo) × preço por imagem do Rekognition
             + buscas × 2 × preço por imagem (cada busca = detecção + pesquisa)
             + rostos guardados × preço de armazenamento de rosto
             + minutos de vídeo processados × custo do container
             + plano Workers Paid (US$ 5/mês, inclui Workers, D1, Queues e franquia de Containers)
```

Preços de referência usados por padrão (US$, **confira os valores vigentes** antes de orçar; podem ser trocados por
`PRICE_R2_GB_MONTH`, `PRICE_REK_IMAGE`, `PRICE_REK_FACE_MONTH`, `PRICE_CF_PLAN_MONTH`, `PRICE_CONTAINER_VIDEO_MIN`):

| Item | Valor padrão |
| --- | --- |
| R2, armazenamento | 0,015 por GB/mês (10 GB grátis), sem cobrança por download |
| Rekognition, imagem analisada | 0,001 (primeiro milhão/mês) |
| Rekognition, rosto guardado | 0,00001 por rosto/mês |
| Cloudflare Workers Paid | 5/mês (inclui franquia de Workers, D1, Queues, Containers) |
| Container além da franquia | ~0,002 por minuto de vídeo processado (estimativa; `PRICE_CONTAINER_VIDEO_MIN`) |

## Exemplo

Um evento com 600 fotos do totem e 150 vídeos de 20 s (intervalo de 1,5 s → 13 quadros cada), 400 buscas:

- Indexação: 600 + 150 × 13 = 2.550 imagens → US$ 2,55
- Buscas: 400 × 2 = 800 → US$ 0,80
- Armazenamento: 600 × 5 MB + 150 × 80 MB ≈ 15 GB → ~US$ 0,08/mês
- **Total do evento ≈ US$ 3,40 de IA**, mais o plano mensal da Cloudflare (US$ 5) e o eventual uso de container além da franquia.

Para reduzir custo de IA: aumente `VIDEO_FRAME_INTERVAL_SEC` ou reduza `VIDEO_MAX_FRAMES`, ou ligue a busca
facial só nos eventos em que ela fará diferença. O uso por evento aparece no painel (Visão geral › Uso da IA).
