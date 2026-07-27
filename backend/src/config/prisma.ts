import { PrismaClient } from "@prisma/client";

// Instancia unica do Prisma Client. Nao ha nenhum cache de dominio aqui:
// toda consulta de status/impressao vai direto ao PostgreSQL.
export const prisma = new PrismaClient();
