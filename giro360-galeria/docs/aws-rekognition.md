# Busca facial com Amazon Rekognition

O site funciona sem IA (`FACE_PROVIDER=none`). Para ligar a busca por selfie:

## 1. Conta e usuário IAM

1. Crie (ou use) uma conta AWS e escolha uma região com Rekognition, por exemplo `us-east-1`.
2. Em **IAM › Users**, crie o usuário `giro360-rekognition` com acesso programático e anexe esta política
   (somente as ações usadas, somente coleções com o prefixo `giro360-`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DeleteCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces"
      ],
      "Resource": "arn:aws:rekognition:*:*:collection/giro360-*"
    },
    { "Effect": "Allow", "Action": "rekognition:DetectFaces", "Resource": "*" }
  ]
}
```

3. Gere a chave de acesso e configure no site **e** no worker:

```
FACE_PROVIDER=rekognition
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
FACE_COLLECTION_PREFIX=giro360
```

## 2. Como é usado

- Uma coleção por evento (`giro360-<id-do-evento>`), criada na primeira indexação. Toda busca usa só a coleção do evento.
- Fotos: `IndexFaces` com até 100 rostos por imagem (grupos incluídos). Vídeos: um `IndexFaces` por quadro extraído.
- Selfie: `DetectFaces` (confere se há exatamente um rosto) + `SearchFacesByImage`. A imagem vai como bytes e não é guardada.
- Despublicar ou excluir mídia chama `DeleteFaces`; o prazo de 90 dias ou o botão “Excluir dados biométricos” chama
  `DeleteCollection`. Falhas ficam pendentes e são repetidas pelo worker (Configurações › Pendências técnicas).

## 3. Calibrar o limite de semelhança

`FACE_MATCH_THRESHOLD` (padrão 90) define a similaridade mínima. Com material de teste **autorizado**:

1. Crie um evento de teste, ligue a busca facial e envie fotos e vídeos de pessoas que autorizaram o teste.
2. Faça buscas com selfies dessas pessoas, em luz boa e ruim, com e sem óculos.
3. Se aparecerem pessoas erradas, aumente o limite (ex.: 93–95). Se faltarem resultados corretos, reduza (mínimo recomendado 85).
4. `VIDEO_FRAME_INTERVAL_SEC` e `VIDEO_MAX_FRAMES` controlam cobertura × custo dos vídeos: um vídeo de 30 s com intervalo
   1,5 s gera 20 quadros (20 chamadas de IA); o máximo padrão é 24 por vídeo.

## 4. O que ainda não foi testado com credenciais reais

A integração com o Rekognition está implementada (`src/lib/faces/rekognition.ts`), mas **não foi executada contra a
AWS** neste ambiente. O fluxo completo foi verificado com o provedor simulado, que usa o mesmo código de indexação,
agrupamento e busca. Antes de usar com convidados, faça o teste do item 3 com credenciais reais.
