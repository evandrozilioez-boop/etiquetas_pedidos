# Decisões de produto

Registro das decisões tomadas com a Giro 360. Elas substituem o que o pedido original dizia sobre prazos.

## Armazenamento

- Fotos e vídeos ficam no **Cloudflare R2** (privado, links temporários assinados).
- **Google Drive não será usado**, nem como armazenamento principal nem como cópia.
  Motivos: não tem links assinados com prazo (o download teria de ser público ou passar
  pelo servidor), tem cotas de download e de envio diário e não foi feito para servir galerias.

## Prazos

| O quê | Prazo | Depois do prazo |
| --- | --- | --- |
| Galeria (capa, nome, data, cidade, destaques) | Sem prazo | Continua no ar |
| Acesso dos convidados (busca, álbum completo, download, QR individual) | 30 dias após o evento | Bloqueia e mostra o botão "Pedir liberação pelo WhatsApp" |
| Cada liberação feita no painel | +30 dias | Vale para **todos os convidados do evento**; conta do fim do prazo atual ou de hoje, o que for mais tarde |
| Busca por selfie e índice facial | 90 dias após o evento | Busca desligada e índice facial apagado no provedor; a galeria continua |
| Originais e prévias | Enquanto o evento existir | Só são apagados quando a Giro excluir o evento |

- O botão do WhatsApp abre uma conversa com o número configurado no painel, com a mensagem
  pronta contendo o nome e a data do evento.
- Quem quiser só a própria foto depois do bloqueio pode receber um QR individual novo da Giro,
  mas o QR individual também segue o prazo de acesso do evento.

## Portfólio

- Página pública `/portfolio` para o site da Giro, com os eventos marcados como "Exibir no portfólio".
- Cada evento mostra capa e **destaques escolhidos pela Giro**, nunca o álbum completo.
- Só pode virar destaque a mídia com **autorização de uso de imagem para divulgação** registrada.
  Essa autorização é separada da autorização de busca facial. Em evento corporativo, inclui o cliente contratante.
- Destaques aparecem mesmo com o download bloqueado, apenas para visualização.

## Autorizações (três tipos, independentes)

1. Indexação para busca facial (por captura; em grupo, todos os participantes).
2. Uso da selfie na busca (por convidado, a cada busca; a selfie é descartada).
3. Uso de imagem para divulgação no portfólio (por captura).

Os textos dos termos precisam de revisão jurídica da Giro antes do uso com convidados reais.

## Envio pelo iPhone

Os vídeos da Plataforma 360 ficam no app Fotos do iPhone e são enviados tanto no 4G quanto no Wi-Fi.

**Etapa 1 (agora): painel de envio pelo Safari**, adicionável à tela de início.
- Escolha de vários vídeos e fotos direto do app Fotos.
- Formatos aceitos ampliados: **MOV e MP4 (H.264 e HEVC)** e **JPEG, PNG e HEIC**. O original é guardado
  como veio; a prévia leve para o celular é convertida para MP4 H.264 no processamento.
- Envio em partes de 16 MB com retomada; opção de manter a tela ligada (Wake Lock).
- Limitações do iOS no navegador: o envio pausa ao bloquear a tela ou trocar de app (retoma ao voltar),
  e o Safari não informa se a conexão é 4G ou Wi-Fi, então não há "enviar só no Wi-Fi".
- A verificar no primeiro teste real: se o Safari entrega o vídeo original do app Fotos ou uma versão
  recomprimida. Se recomprimir, o app nativo passa a ser obrigatório para manter a qualidade original.

**Etapa 2: app iOS "Giro 360 Envio"** (só envio, usa a mesma API do painel).
- Envio em segundo plano com a tela bloqueada, fila que sobrevive a fechar o app,
  "Compartilhar → Giro 360" no app Fotos e opção de enviar vídeos só no Wi-Fi.
- Compilado na nuvem (Expo/EAS), sem precisar de Mac; distribuído pelo TestFlight ou como app não listado.
- **Pré-requisito: conta Apple Developer da Giro** (cerca de US$ 99/ano). A Giro ainda não tem.
  Para conta de empresa a Apple exige o número D-U-N-S da empresa (gratuito, pode levar alguns dias),
  site e e-mail com o domínio da empresa.

## Implementação (registro)

- Fotos HEIC do iPhone: o seletor do Safari converte para JPEG ao enviar (o campo aceita só JPEG/PNG/MP4/MOV),
  então o servidor não precisa decodificar HEIC.
- Vídeos MOV/HEVC são aceitos e guardados como vieram; a prévia é sempre MP4 H.264 (até 720p) para tocar em qualquer celular.
- O site pode ir ao ar sem IA (`FACE_PROVIDER=none`): galeria, QR individual, downloads, portfólio e envio funcionam;
  a busca por selfie aparece como indisponível.
- A logo oficial está incluída em `public/brand/`; uma logo enviada em Configurações tem prioridade.
