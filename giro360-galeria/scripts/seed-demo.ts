import { localEnv, applyMigrations } from "./local-env";
import { config } from "@/lib/config";
import { q, q1 } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { initUpload, completeUpload, setImageUse, setHighlight } from "@/lib/media";
import { processCoverJob } from "@/lib/jobs";
import { keys, putObject } from "@/lib/storage";
import { demoPhoto, demoVideo } from "@/processor/demo-media";

/**
 * Evento de demonstração (banco LOCAL) com pessoas fictícias: rostos = discos coloridos.
 * Ana (vermelho) aparece em duas fotos e em um vídeo de grupo — o cenário de aceite.
 * Uso: npm run demo:seed
 */
const ANA = 0, BRUNO = 1, CARLA = 2, DIEGO = 3, ELISA = 4, FABIO = 5;

async function main() {
  if (config().APP_ENV === "production") throw new Error("Não crie o evento de demonstração em produção.");
  const env = await localEnv();
  try {
    await applyMigrations(env.env.DB as any);
    const admin = await q1<{ id: string }>("select id from admin_users order by created_at limit 1");
    if (!admin) throw new Error("Crie um usuário do painel antes: npm run admin:create");
    const existing = await q1<{ public_token: string }>("select public_token from events where name = 'Festival Verão Giro (demonstração)'");
    if (existing) {
      console.log(`Evento de demonstração já existe: ${config().APP_URL}/e/${existing.public_token} (código DEMO26)`);
      return;
    }
    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const ev = await createEvent(
      { name: "Festival Verão Giro (demonstração)", eventDate: today, city: "Florianópolis/SC", isPrivate: true, accessCode: "DEMO26", showInPortfolio: true },
      admin.id,
    );
    await q("update events set face_search_enabled=$2 where id=$1", [ev.id, config().FACE_PROVIDER !== "none"]);
    const coverSrc = keys.cover(ev.id, "upload-demo", "jpg");
    await putObject(coverSrc, await demoPhoto([ANA, BRUNO, CARLA, DIEGO, ELISA], 7, "jpeg", [1920, 1200]), "image/jpeg");
    await processCoverJob(ev.id, coverSrc);

    console.log("Gerando fotos e vídeos fictícios…");
    const send = async (buf: Buffer, name: string, type: string) => {
      const plan = await initUpload(ev.id, { filename: name, size: buf.length, contentType: type, fingerprint: `demo-${name}-${buf.length}`, consentGrantedAll: true }, admin.id);
      if (plan.state === "single") {
        const r = await fetch(plan.url, { method: "PUT", body: new Uint8Array(buf), headers: { "Content-Type": type } });
        if (!r.ok) throw new Error(`Falha ao enviar ${name}: ${r.status}`);
        await completeUpload(ev.id, plan.mediaId);
      }
      return plan.mediaId;
    };
    const ids: string[] = [];
    const photos: [number[], number][] = [[[ANA], 1], [[BRUNO, ANA, CARLA], 2], [[BRUNO], 3], [[DIEGO, ELISA], 4], [[FABIO], 5], [[CARLA, FABIO], 6], [[ELISA], 8]];
    let n = 1;
    for (const [people, seed] of photos) ids.push(await send(await demoPhoto(people, seed), `totem_${String(n++).padStart(4, "0")}.jpg`, "image/jpeg"));
    ids.push(await send(await demoVideo([[0, 2, [DIEGO]], [2, 4, [ANA, DIEGO]], [4, 6, [CARLA]], [6, 8, [ANA, CARLA]]]), "giro360_take01.mp4", "video/mp4"));
    ids.push(await send(await demoVideo([[0, 3, [BRUNO, ELISA]], [3, 6, [FABIO]]], { seed: 1 }), "giro360_take02.mp4", "video/mp4"));

    console.log("Processando (miniaturas, prévias, quadros de vídeo e índice facial)…");
    await env.drain();
    await setImageUse(ev.id, [ids[1], ids[3], ids[7]], true, "Demonstração: autorização fictícia", admin.id);
    await setHighlight(ev.id, [ids[1], ids[3], ids[7]], true, admin.id);
    console.log("\nEvento de demonstração pronto.");
    console.log(`  Galeria do convidado: ${config().APP_URL}/e/${ev.public_token}`);
    console.log("  Código de acesso:     DEMO26");
    console.log(`  Selfies de teste:     ${config().APP_URL}/demo/selfies (use a da Ana: 2 fotos + 1 vídeo)`);
  } finally {
    await env.dispose();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
