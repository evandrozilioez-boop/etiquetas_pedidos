import "./load-env";
import { q1, closePool } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

/**
 * Cria ou atualiza um usuário do painel.
 * Uso: npm run admin:create -- email@giro360.com.br "Nome" "senha-forte"
 * Sem argumentos, usa ADMIN_EMAIL / ADMIN_PASSWORD do ambiente.
 */
async function main() {
  const [email = process.env.ADMIN_EMAIL, name = "Equipe Giro 360", password = process.env.ADMIN_PASSWORD] = process.argv.slice(2);
  if (!email || !password) throw new Error("Informe e-mail e senha (argumentos ou ADMIN_EMAIL/ADMIN_PASSWORD).");
  if (password.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.");
  const row = await q1<{ id: string }>(
    `insert into admin_users(email, name, password_hash) values ($1,$2,$3)
     on conflict (email) do update set name=excluded.name, password_hash=excluded.password_hash returning id`,
    [email.trim().toLowerCase(), name, await hashPassword(password)],
  );
  console.log(`Usuário do painel pronto: ${email} (${row!.id})`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
