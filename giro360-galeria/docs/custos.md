# Estimativa de custos

```bash
npm run cost:estimate
```

Sem argumentos, usa o uso real registrado nos últimos 30 dias (armazenamento atual, fotos e quadros enviados à IA,
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
             + hospedagem (site + worker + banco)
```

Preços de referência usados por padrão (US$, **confira os valores vigentes** antes de orçar; podem ser trocados por
`PRICE_R2_GB_MONTH`, `PRICE_REK_IMAGE`, `PRICE_REK_FACE_MONTH`, `PRICE_HOSTING_MONTH`):

| Item | Valor padrão |
| --- | --- |
| R2, armazenamento | 0,015 por GB/mês (10 GB grátis), sem cobrança por download |
| Rekognition, imagem analisada | 0,001 (primeiro milhão/mês) |
| Rekognition, rosto guardado | 0,00001 por rosto/mês |
| Hospedagem Railway (site + worker + banco) | ~20/mês, varia com uso de CPU |

## Exemplo

Um evento com 600 fotos do totem e 150 vídeos de 20 s (intervalo de 1,5 s → 13 quadros cada), 400 buscas:

- Indexação: 600 + 150 × 13 = 2.550 imagens → US$ 2,55
- Buscas: 400 × 2 = 800 → US$ 0,80
- Armazenamento: 600 × 5 MB + 150 × 80 MB ≈ 15 GB → ~US$ 0,08/mês
- **Total do evento ≈ US$ 3,40 de IA**, mais a hospedagem mensal fixa.

Para reduzir custo de IA: aumente `VIDEO_FRAME_INTERVAL_SEC` ou reduza `VIDEO_MAX_FRAMES`, ou ligue a busca
facial só nos eventos em que ela fará diferença. O uso por evento aparece no painel (Visão geral › Uso da IA).
