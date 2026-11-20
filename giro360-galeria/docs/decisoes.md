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
