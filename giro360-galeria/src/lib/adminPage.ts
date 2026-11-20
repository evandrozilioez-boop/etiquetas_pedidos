import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, getAdminFromToken } from "./auth";

/** Para páginas do painel (componentes de servidor): exige login ou redireciona. */
export async function requireAdminPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const admin = await getAdminFromToken(token);
  if (!admin) redirect("/admin/login");
  return admin;
}
