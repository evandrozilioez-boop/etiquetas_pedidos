/**
 * Seed do usuario administrador padrao para o pacote Windows (single-PC).
 * Equivalente em JS puro de prisma/seed.ts: o instalador roda este arquivo
 * diretamente com o Node.js portatil empacotado, sem depender do ts-node/CLI
 * do Prisma em tempo de execucao.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const loginAdmin = process.env.SEED_ADMIN_LOGIN || "admin";
  const senhaAdmin = process.env.SEED_ADMIN_SENHA || "admin123";

  const existente = await prisma.usuario.findUnique({ where: { login: loginAdmin } });
  if (existente) {
    console.log(`Usuario administrador '${loginAdmin}' ja existe, seed ignorado.`);
    return;
  }

  const senhaHash = await bcrypt.hash(senhaAdmin, 10);
  await prisma.usuario.create({
    data: { nome: "Administrador", login: loginAdmin, senhaHash, nivel: "ADMINISTRADOR" },
  });

  console.log(`Usuario administrador '${loginAdmin}' criado. Altere a senha padrao apos o primeiro acesso.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
