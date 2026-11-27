# Etiquetas de Pedidos

Sistema web para gerenciamento e impressao de etiquetas de pedidos, com o
PostgreSQL como **unica fonte da verdade**: nenhum estado de impressao e
mantido em memoria, variavel global ou cache (Redis ou similar). Toda
impressao, reimpressao e mudanca de status e persistida imediatamente em
uma transacao ACID.

## Arquitetura

```
backend/   API REST em Node.js + Express + TypeScript + Prisma + PostgreSQL
frontend/  SPA em React + Vite + Material UI
```

- **Pedidos**: cadastro central da etiqueta, com hash SHA256 do ZPL para
  evitar duplicidade na reimportacao.
- **Impressoes**: um registro por tentativa de impressao (nunca e apagado);
  contador de copias e resultado (sucesso/erro) sempre gravados.
- **Historico**: log de auditoria de toda acao relevante (importacao,
  atualizacao, impressao, reimpressao, cancelamento, expedicao, login,
  logout, gestao de usuarios).
- **Usuarios**: autenticacao com JWT e 3 niveis de acesso
  (`ADMINISTRADOR`, `OPERADOR`, `CONSULTA`).

A impressao segue este fluxo:
1. O ZPL e enviado ao adaptador de impressora (`mock` em dev, `network` via
   socket TCP porta 9100 em producao) **fora** da transacao de banco, pois
   I/O de rede nao deve segurar locks.
2. O resultado do envio e persistido **atomicamente** dentro de uma unica
   transacao Prisma: grava `Impressoes`, atualiza o `status` do pedido (se
   sucesso) e grava a linha de `Historico` correspondente. Em caso de erro
   o status do pedido permanece inalterado e o erro fica registrado no
   historico.

### Extracao automatica de campos do ZPL

Ao importar um ZPL bruto (upload de planilha com coluna de ZPL ou colagem
direta de texto ZPL), o backend (`backend/src/services/zplParser.ts`)
percorre os blocos `^FO...^FS` do label e tenta identificar:
- Rotulos textuais conhecidos (`PEDIDO:`, `OC:`, `CLIENTE:`, `CIDADE:`,
  `UF:`, `CEP:`, `VOLUME:`, `QUANTIDADE:`, `TRANSPORTADORA:`,
  `MARKETPLACE:`, `CODIGO PRODUTO:`, `DESCRICAO:`, etc.);
  todo o ZPL original e sempre preservado por completo, independentemente
  do que for identificado.
- Comandos de codigo de barras (`^BC`, `^B3`, ...) e QR Code (`^BQ`).

Como o layout real das etiquetas pode variar por empresa/marketplace, os
rotulos reconhecidos estao centralizados nesse arquivo e podem ser
ajustados/estendidos com base em um exemplo real de ZPL.

### Preparado para integracoes futuras

`origemImportacao` no modelo `Pedido` ja distingue `EXCEL`, `CSV`, `ZPL` e
`API`. Uma nova integracao (ERP, Mercado Livre, MadeiraMadeira, etc.) so
precisa produzir linhas no formato `LinhaPedido`
(`backend/src/services/importService.ts`) e chamar `importarLinhas(...)`
— sem alterar o schema do banco ou a logica de deduplicacao/hash.

## Precificação Mercado Livre

A pasta `precificacao/` contém um aplicativo independente de precificação para
vendedores do Mercado Livre Brasil (menor preço de anúncio para atingir a
margem desejada). Instruções em [`precificacao/README.md`](precificacao/README.md).

## Rodando localmente

### Com Docker Compose

```bash
docker compose up --build
```

- Backend: http://localhost:3333
- Frontend: http://localhost:5173
- PostgreSQL: localhost:5432 (postgres/postgres)

O container do backend roda `prisma migrate deploy` e `prisma db seed`
automaticamente, criando o usuario administrador padrao (login `admin`,
senha `admin123` — **troque no primeiro acesso**).

### Manualmente

**Backend**
```bash
cd backend
cp .env.example .env   # ajuste DATABASE_URL/JWT_SECRET conforme necessario
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

O Vite ja proxeia `/api` para `http://localhost:3333` (configuravel via
`VITE_API_PROXY_TARGET`).

### Instalador Windows (single-PC, sem Docker/Node/Postgres manual)

Para instalar em um unico computador Windows sem precisar configurar nada
manualmente (uso tipico: um posto de impressao de etiquetas isolado, sem
outros PCs acessando pela rede), existe um instalador `.exe` que empacota
Node.js, PostgreSQL e a aplicacao, e registra tudo como Servico do Windows
(inicia sozinho com o computador).

Ele e gerado automaticamente pelo GitHub Actions (nao ha binario pronto no
repositorio): va em **Actions -> Build Windows Installer -> Run workflow**,
espere terminar e baixe o artefato `EtiquetasPedidosSetup`. Detalhes de como
ele e montado e o que a instalacao faz estao em `windows-installer/README.md`.

> Esse instalador ainda nao foi validado numa maquina Windows real (foi
> construido e revisado aqui, mas sem acesso a um ambiente Windows para
> testar o `.exe` final). Se algo falhar na instalacao, me mande a mensagem
> de erro (ou os logs em `C:\ProgramData\EtiquetasPedidos\logs`) que eu ajusto.

## Niveis de acesso

| Nivel          | Permissoes                                              |
|----------------|-----------------------------------------------------------|
| ADMINISTRADOR  | Tudo, incluindo gestao de usuarios                        |
| OPERADOR       | Importar, imprimir, reimprimir, cancelar, expedir         |
| CONSULTA       | Apenas visualizar pedidos, historico e dashboard          |

## Variaveis de ambiente (backend)

Veja `backend/.env.example`. Destaque para `PRINT_ADAPTER`:
- `mock`: nao envia nada fisicamente, apenas simula sucesso (uso em dev).
- `network`: envia o ZPL via socket TCP para o endereco `host:porta`
  informado na requisicao de impressao (porta padrao Zebra: 9100).
