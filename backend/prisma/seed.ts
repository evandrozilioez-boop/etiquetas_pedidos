import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const loginAdmin = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const senhaAdmin = process.env.SEED_ADMIN_SENHA ?? "admin123";

  const existente = await prisma.usuario.findUnique({ where: { login: loginAdmin } });
  if (existente) {
    console.log(`Usuario administrador '${loginAdmin}' ja existe, seed ignorado.`);
    return;
  }

  const senhaHash = await bcrypt.hash(senhaAdmin, 10);
  await prisma.usuario.create({
    data: {
      nome: "Administrador",
      login: loginAdmin,
      senhaHash,
      nivel: "ADMINISTRADOR",
    },
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
