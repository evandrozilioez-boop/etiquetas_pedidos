# Privacidade: o que a Giro precisa revisar antes de usar com convidados reais

O sistema implementa os controles técnicos, mas **os textos e prazos abaixo são provisórios** e precisam de revisão
jurídica (LGPD — dados biométricos são dados pessoais sensíveis).

## Textos para revisar

| Onde | Arquivo | Conteúdo |
| --- | --- | --- |
| Galeria do evento, antes da selfie | `src/components/guest/GuestApp.tsx` (“Como sua foto será usada”) | Explicação e autorização do uso da selfie |
| Página de privacidade | `src/app/privacidade/page.tsx` | Como os dados são tratados, prazos, pedido de remoção |
| Termo de busca facial (coletado no estande) | a criar pela Giro | Autorização para indexar o rosto nas capturas do evento |
| Termo de uso de imagem (portfólio) | a criar pela Giro | Autorização para divulgação; em evento corporativo, também do cliente |
| Rodapé das galerias | Configurações › Canal para pedidos de remoção | E-mail/telefone do encarregado |

Registre a versão de cada termo no painel (Autorizações › Versão do termo).

## Prazos implementados (configuráveis)

| Dado | Prazo | Variável |
| --- | --- | --- |
| Download pelos convidados | 30 dias após o evento, +30 a cada liberação | `ACCESS_DAYS`, `ACCESS_EXTENSION_DAYS` |
| Índice facial (biometria) | 90 dias após o evento, depois apagado automaticamente | `FACE_DAYS` |
| Selfie de busca | Não é guardada (só memória durante a requisição) | — |
| Originais e prévias | Enquanto o evento existir (excluir evento apaga tudo) | — |
| Registros de autorização | Mantidos com o evento (prova da autorização) | — |
| Pedidos de remoção | Mantidos até serem marcados como atendidos | — |

Decidam: por quanto tempo guardar originais de eventos antigos; por quanto tempo guardar os registros de autorização
depois de apagar o evento; quem atende pedidos de remoção e em quanto tempo.

## Procedimentos operacionais

1. **Antes da captura:** coletar a autorização de busca facial (e, se for o caso, de uso de imagem) e registrar no painel
   (evento › Autorizações). Em capturas de grupo, só marcar a mídia como autorizada se **todos** autorizaram.
   Na dúvida, não marcar: o arquivo continua disponível por QR individual, sem biometria.
2. **Ligar a busca facial** no evento só depois de ter autorizações registradas.
3. **Pedido de remoção:** Configurações › Pedidos de remoção → localizar o arquivo em Mídias → **Excluir**
   (apaga original, prévias, links e dados faciais) → marcar como atendido.
4. **Revogação de autorização:** em Mídias, selecione e use “Retirar autorização facial” (remove os dados faciais
   daquela captura) ou retire o destaque/uso de imagem.
5. **Encerrar a biometria antes do prazo:** evento › Visão geral › Excluir dados biométricos.

## Controles técnicos implementados

- Bucket privado; cada visualização/download passa por autorização no servidor e URL temporária (10 min).
- Coleção facial separada por evento; a busca só considera rostos do evento acessado.
- Eventos privados exigem código; 5 tentativas a cada 15 min por IP; busca limitada a 10 por sessão a cada 10 min.
- Links individuais com token aleatório de 128 bits (só o hash fica no banco), revogáveis, sujeitos ao prazo do evento.
- Resultado da busca tratado como sugestão (texto na tela); sem navegação completa, o convidado só vê o que a própria
  busca liberou.
- IPs não são guardados em texto; os limites de tentativa usam um hash com segredo.
- Exclusões no provedor que falham ficam registradas e são repetidas (Configurações › Pendências técnicas).
