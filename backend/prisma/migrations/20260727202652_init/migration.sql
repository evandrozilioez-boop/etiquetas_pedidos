-- CreateEnum
CREATE TYPE "NivelUsuario" AS ENUM ('ADMINISTRADOR', 'OPERADOR', 'CONSULTA');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('AGUARDANDO_IMPRESSAO', 'EM_IMPRESSAO', 'IMPRESSO', 'REIMPRESSO', 'CANCELADO', 'EXPEDIDO');

-- CreateEnum
CREATE TYPE "AcaoHistorico" AS ENUM ('IMPORTACAO', 'ATUALIZACAO', 'IMPRESSAO', 'REIMPRESSAO', 'ERRO_IMPRESSAO', 'CANCELAMENTO', 'EXPEDICAO', 'LOGIN', 'LOGOUT', 'CRIACAO_USUARIO', 'ATUALIZACAO_USUARIO');

-- CreateEnum
CREATE TYPE "ResultadoImpressao" AS ENUM ('SUCESSO', 'ERRO');

-- CreateEnum
CREATE TYPE "OrigemImportacao" AS ENUM ('EXCEL', 'CSV', 'API', 'ZPL');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "nivel" "NivelUsuario" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "pedido" TEXT NOT NULL,
    "oc" TEXT,
    "produto" TEXT,
    "descricao" TEXT,
    "cliente" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "volume" TEXT,
    "quantidade" INTEGER,
    "transportadora" TEXT,
    "marketplace" TEXT,
    "codigoBarras" TEXT,
    "qrCode" TEXT,
    "zplOriginal" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'AGUARDANDO_IMPRESSAO',
    "origemImportacao" "OrigemImportacao" NOT NULL DEFAULT 'EXCEL',
    "dataImportacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impressoes" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressora" TEXT,
    "ipMaquina" TEXT,
    "copias" INTEGER NOT NULL DEFAULT 1,
    "resultado" "ResultadoImpressao" NOT NULL,
    "mensagemErro" TEXT,

    CONSTRAINT "impressoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT,
    "acao" "AcaoHistorico" NOT NULL,
    "usuarioId" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detalhes" TEXT,

    CONSTRAINT "historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_hash_key" ON "pedidos"("hash");

-- CreateIndex
CREATE INDEX "pedidos_pedido_idx" ON "pedidos"("pedido");

-- CreateIndex
CREATE INDEX "pedidos_oc_idx" ON "pedidos"("oc");

-- CreateIndex
CREATE INDEX "pedidos_status_idx" ON "pedidos"("status");

-- CreateIndex
CREATE INDEX "pedidos_cliente_idx" ON "pedidos"("cliente");

-- CreateIndex
CREATE INDEX "pedidos_cidade_idx" ON "pedidos"("cidade");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- CreateIndex
CREATE INDEX "pedidos_marketplace_idx" ON "pedidos"("marketplace");

-- CreateIndex
CREATE INDEX "pedidos_dataImportacao_idx" ON "pedidos"("dataImportacao");

-- CreateIndex
CREATE INDEX "impressoes_pedidoId_idx" ON "impressoes"("pedidoId");

-- CreateIndex
CREATE INDEX "impressoes_usuarioId_idx" ON "impressoes"("usuarioId");

-- CreateIndex
CREATE INDEX "impressoes_dataHora_idx" ON "impressoes"("dataHora");

-- CreateIndex
CREATE INDEX "historico_pedidoId_idx" ON "historico"("pedidoId");

-- CreateIndex
CREATE INDEX "historico_acao_idx" ON "historico"("acao");

-- CreateIndex
CREATE INDEX "historico_dataHora_idx" ON "historico"("dataHora");

-- AddForeignKey
ALTER TABLE "impressoes" ADD CONSTRAINT "impressoes_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressoes" ADD CONSTRAINT "impressoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico" ADD CONSTRAINT "historico_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico" ADD CONSTRAINT "historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
