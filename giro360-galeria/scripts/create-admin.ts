import "./load-env";
import { hashPassword } from "@/lib/auth";
import { args, isRemote, lit, sqlFile } from "./d1";

/**
 * Cria ou atualiza um usuário do painel.
 *   npm run admin:create -- email@giro360.com.br "Nome" "senha-forte"            (banco local)
 *   npm run admin:create -- email@giro360.com.br "Nome" "senha-forte" --remote   (produção)
 */
async function main() {
  const [email = process.env.ADMIN_EMAIL, name = "Equipe Giro 360", password = process.env.ADMIN_PASSWORD] = args();
  if (!email || !password) throw new Error("Informe e-mail e senha (argumentos ou ADMIN_EMAIL/ADMIN_PASSWORD).");
  if (password.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.");
  const hash = await hashPassword(password);
  sqlFile([
    `insert into admin_users(id, email, name, password_hash) values (${lit(crypto.randomUUID())}, ${lit(email.trim().toLowerCase())}, ${lit(name)}, ${lit(hash)})
     on conflict (email) do update set name=excluded.name, password_hash=excluded.password_hash`,
  ]);
  console.log(`Usuário do painel pronto: ${email} (${isRemote() ? "produção" : "banco local"})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
