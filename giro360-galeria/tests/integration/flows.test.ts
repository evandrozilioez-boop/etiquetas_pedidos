import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { q, q1, closePool } from "@/lib/db";
import { demoPhoto, demoSelfie, demoVideo } from "@/lib/demo-media";
import { setFaceProviderForTests } from "@/lib/faces";
import { MockFaceProvider } from "@/lib/faces/mock";
import { FaceProviderError } from "@/lib/faces/types";
import { adminCookie, call, cookieFrom, createEvent, drain, fingerprint, housekeeping, resetAll, upload } from "./helpers";

import * as session from "@/app/api/e/[token]/session/route";
import * as search from "@/app/api/e/[token]/search/route";
import * as guestMedia from "@/app/api/e/[token]/media/route";
import * as guestDownload from "@/app/api/e/[token]/media/[mediaId]/download/route";
import * as shareRoute from "@/app/api/admin/media/[id]/share/route";
import * as shareDownload from "@/app/api/m/[token]/download/route";
import * as actions from "@/app/api/admin/events/[id]/actions/route";
import * as mediaActions from "@/app/api/admin/events/[id]/media/actions/route";
import { listHighlights } from "@/lib/access";

const ANA = 0, BRUNO = 1, CARLA = 2, DIEGO = 3;

let cookie: string;
let evA: Awaited<ReturnType<typeof createEvent>>;
let evB: Awaited<ReturnType<typeof createEvent>>;
const ids: Record<string, string> = {};
let videoBuf: Buffer;

async function guestCookie(ev: { public_token: string }, code = "TESTE1") {
  const r = await call(session.POST, `/api/e/${ev.public_token}/session`, { params: { token: ev.public_token }, body: { code } });
  expect(r.status).toBe(200);
  return cookieFrom(r);
}

async function selfieSearch(ev: { public_token: string }, gc: string, persona: number) {
  const form = new FormData();
  form.set("consent", "yes");
  form.set("selfie", new Blob([new Uint8Array(await demoSelfie(persona))], { type: "image/jpeg" }), "selfie.jpg");
  return call(search.POST, `/api/e/${ev.public_token}/search`, { params: { token: ev.public_token }, cookie: gc, form });
}

beforeAll(async () => {
  await resetAll();
  cookie = await adminCookie();
  evA = await createEvent(cookie, { name: "Festival A" });
  evB = await createEvent(cookie, { name: "Convenção B", accessCode: "OUTRO2" });
  for (const ev of [evA, evB]) {
    const r = await call(actions.POST, "/x", { cookie, params: { id: ev.id }, body: { action: "face_on" } });
    expect(r.status).toBe(200);
  }

  // Evento A: Ana em duas fotos (uma de grupo) e em um vídeo de grupo, aparecendo em dois momentos do giro.
  ids.anaSolo = (await upload(cookie, evA.id, await demoPhoto([ANA], 1), "totem_0001.jpg", "image/jpeg")).mediaId;
  ids.anaGroup = (await upload(cookie, evA.id, await demoPhoto([BRUNO, ANA, CARLA], 2), "totem_0002.jpg", "image/jpeg")).mediaId;
  ids.bruno = (await upload(cookie, evA.id, await demoPhoto([BRUNO], 3), "totem_0003.jpg", "image/jpeg")).mediaId;
  videoBuf = await demoVideo([[0, 2, [DIEGO]], [2, 4, [ANA, DIEGO]], [4, 6, [CARLA]], [6, 8, [ANA, CARLA]]], { bitrate: "14M" });
  expect(videoBuf.length).toBeGreaterThan(10 * 1024 * 1024); // força multipart (partes de 5 MB)
  ids.video = (await upload(cookie, evA.id, videoBuf, "giro360_take01.mp4", "video/mp4")).mediaId;
  // Evento B: Ana também aparece — mas buscas no evento A nunca podem encontrar isto.
  ids.anaInB = (await upload(cookie, evB.id, await demoPhoto([ANA], 9), "outro_evento.jpg", "image/jpeg")).mediaId;
  await drain();
}, 240_000);

afterAll(async () => {
  setFaceProviderForTests(null);
  await closePool();
});

describe("processamento", () => {
  it("cada arquivo fica disponível com miniatura, prévia e biometria indexada", async () => {
    const rows = await q("select id, status, face_status, thumb_key, preview_key, kind, duration_sec from media order by created_at");
    for (const r of rows) {
      expect(r.status).toBe("ready");
      expect(r.face_status).toBe("indexed");
      expect(r.thumb_key).toBeTruthy();
      expect(r.preview_key).toBeTruthy();
    }
    const v = rows.find((r) => r.id === ids.video);
    expect(Number(v.duration_sec)).toBeCloseTo(8, 0);
    // vídeo: vários quadros enviados à IA, distribuídos ao longo do clipe (não só o primeiro)
    const units = await q("select unit_key from ai_units where media_id=$1 order by unit_key", [ids.video]);
    expect(units.length).toBe(8);
  });
});

describe("aceite: convidada em duas fotos e um vídeo de grupo", () => {
  it("encontra os três registros, com um único resultado para o vídeo, e baixa o vídeo completo", async () => {
    const gc = await guestCookie(evA);
    const r = await selfieSearch(evA, gc, ANA);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.status).toBe("matches");
    const found = j.items.map((i: any) => i.id).sort();
    expect(found).toEqual([ids.anaSolo, ids.anaGroup, ids.video].sort());
    expect(j.items.filter((i: any) => i.id === ids.video)).toHaveLength(1);
    // O vídeo tem rostos da Ana em vários quadros, mas vira um só resultado.
    const anaFramesInVideo = await q1(
      `select count(*) as n from face_records fr join mock_face_index mf on mf.face_id = fr.face_id
       where fr.media_id=$1 and mf.persona=$2`,
      [ids.video, ANA],
    );
    expect(Number(anaFramesInVideo.n)).toBeGreaterThan(1);

    const dl = await call(guestDownload.GET, "/x", { params: { token: evA.public_token, mediaId: ids.video }, cookie: gc });
    expect(dl.status).toBe(302);
    const file = await fetch(dl.headers.get("location")!);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.equals(videoBuf)).toBe(true);
  });

  it("sem navegação completa, o convidado só vê o que a própria busca liberou", async () => {
    const gc = await guestCookie(evA);
    let list = await (await call(guestMedia.GET, "/x", { params: { token: evA.public_token }, cookie: gc })).json();
    expect(list.items).toHaveLength(0);
    await selfieSearch(evA, gc, BRUNO);
    list = await (await call(guestMedia.GET, "/x", { params: { token: evA.public_token }, cookie: gc })).json();
    expect(list.items.map((i: any) => i.id).sort()).toEqual([ids.anaGroup, ids.bruno].sort());
    const blocked = await call(guestDownload.GET, "/x", { params: { token: evA.public_token, mediaId: ids.anaSolo }, cookie: gc });
    expect(blocked.status).toBe(404);
  });
});

describe("isolamento entre eventos", () => {
  it("a busca no evento B só encontra mídias do evento B", async () => {
    const gc = await guestCookie(evB, "OUTRO2");
    const j = await (await selfieSearch(evB, gc, ANA)).json();
    expect(j.items.map((i: any) => i.id)).toEqual([ids.anaInB]);
  });

  it("sessão de um evento não abre mídia de outro evento", async () => {
    const gcB = await guestCookie(evB, "OUTRO2");
    const r = await call(guestDownload.GET, "/x", { params: { token: evB.public_token, mediaId: ids.anaSolo }, cookie: gcB });
    expect(r.status).toBe(404);
    const r2 = await call(guestDownload.GET, "/x", { params: { token: evA.public_token, mediaId: ids.anaSolo }, cookie: gcB });
    expect(r2.status).toBe(401);
  });

  it("cada evento usa a própria coleção facial", async () => {
    const cols = await q("select face_collection_id from events");
    expect(new Set(cols.map((c) => c.face_collection_id)).size).toBe(2);
  });
});

describe("acesso direto a mídia privada", () => {
  it("o armazenamento recusa acesso sem assinatura", async () => {
    const m = await q1("select storage_key, thumb_key from media where id=$1", [ids.anaSolo]);
    for (const key of [m.storage_key, m.thumb_key]) {
      const r = await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`);
      expect(r.status).toBe(403);
    }
  });

  it("código errado não abre sessão e há limite de tentativas", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await call(session.POST, "/x", { params: { token: evB.public_token }, body: { code: "ERRADO" }, headers: { "x-test": String(i) } });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    await q("delete from rate_limits");
  });

  it("sem sessão, o download é negado", async () => {
    const r = await call(guestDownload.GET, "/x", { params: { token: evA.public_token, mediaId: ids.anaSolo } });
    expect(r.status).toBe(401);
  });
});

describe("QR individual", () => {
  it("entrega o arquivo mesmo com a IA fora do ar e para de funcionar ao revogar", async () => {
    const created = await (await call(shareRoute.POST, "/x", { cookie, params: { id: ids.bruno } })).json();
    expect(created.url).toMatch(/\/m\//);
    expect(created.qr).toMatch(/^data:image\/png;base64,/);
    const token = created.url.split("/m/")[1];

    setFaceProviderForTests({
      ...new MockFaceProvider(),
      name: "mock",
      ensureCollection: async () => { throw new FaceProviderError("IA fora do ar"); },
      deleteCollection: async () => { throw new FaceProviderError("IA fora do ar"); },
      indexFaces: async () => { throw new FaceProviderError("IA fora do ar"); },
      detectFaces: async () => { throw new FaceProviderError("IA fora do ar"); },
      searchByImage: async () => { throw new FaceProviderError("IA fora do ar"); },
      deleteFaces: async () => { throw new FaceProviderError("IA fora do ar"); },
    });
    try {
      const dl = await call(shareDownload.GET, "/x", { params: { token } });
      expect(dl.status).toBe(302);
      expect((await fetch(dl.headers.get("location")!)).status).toBe(200);
      // e a busca, nesse momento, informa falha temporária (não "nenhuma correspondência")
      const gc = await guestCookie(evA);
      const s = await selfieSearch(evA, gc, BRUNO);
      expect(s.status).toBe(503);
      expect((await s.json()).code).toBe("search_unavailable");
    } finally {
      setFaceProviderForTests(null);
    }

    await call(shareRoute.DELETE, "/x", { method: "DELETE", cookie, params: { id: ids.bruno }, body: { linkId: created.id } });
    expect((await call(shareDownload.GET, "/x", { params: { token } })).status).toBe(404);
    expect((await call(shareDownload.GET, "/x", { params: { token: "token-inventado-qualquer-123" } })).status).toBe(404);
  });

  it("despublicar retira o acesso pelo QR e a participação em novas buscas", async () => {
    const created = await (await call(shareRoute.POST, "/x", { cookie, params: { id: ids.anaSolo } })).json();
    const token = created.url.split("/m/")[1];
    await call(mediaActions.POST, "/x", { cookie, params: { id: evA.id }, body: { action: "unpublish", mediaIds: [ids.anaSolo] } });
    expect((await call(shareDownload.GET, "/x", { params: { token } })).status).toBe(404);
    const gc = await guestCookie(evA);
    const j = await (await selfieSearch(evA, gc, ANA)).json();
    expect(j.items.map((i: any) => i.id)).not.toContain(ids.anaSolo);
    const pend = await q1("select count(*) as n from deletion_tasks where target='faces' and status='pending'");
    expect(Number(pend.n)).toBeGreaterThan(0);
    await housekeeping();
    const done = await q1("select count(*) as n from deletion_tasks where target='faces' and status='pending'");
    expect(Number(done.n)).toBe(0);
    await call(mediaActions.POST, "/x", { cookie, params: { id: evA.id }, body: { action: "publish", mediaIds: [ids.anaSolo] } });
    await drain();
  });
});

describe("envio retomável e sem duplicação", () => {
  it("retoma um envio multipart interrompido a partir das partes já confirmadas", async () => {
    const big = Buffer.concat([await demoPhoto([CARLA], 5, "png", [2600, 2600]), Buffer.alloc(0)]);
    const noise = await import("sharp").then((s) =>
      s.default({ create: { width: 2600, height: 2600, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png({ compressionLevel: 0 }).toBuffer(),
    );
    const buf = noise.length > big.length ? noise : big;
    expect(buf.length).toBeGreaterThan(10 * 1024 * 1024);
    const fp = fingerprint(buf, "grande.png");
    const first = await upload(cookie, evA.id, buf, "grande.png", "image/png", { stopAfterParts: 2, fp });
    expect(first.completed).toBe(false);
    const again = await upload(cookie, evA.id, buf, "grande.png", "image/png", { fp });
    expect(again.mediaId).toBe(first.mediaId);
    expect(again.plan.completedParts.map((p: any) => p.partNumber)).toEqual([1, 2]);
    expect(await q("select id from media where client_fingerprint=$1", [fp])).toHaveLength(1);
    await drain();
    expect((await q1("select status from media where id=$1", [first.mediaId])).status).toBe("ready");
  });

  it("reprocessar não duplica o original nem cobra a IA de novo", async () => {
    const before = await q1("select count(*) as n, sum(units) as u from ai_usage where event_id=$1", [evA.id]);
    // repetir o envio do mesmo arquivo: devolve o mesmo registro, sem novo upload
    const vid = await upload(cookie, evA.id, videoBuf, "giro360_take01.mp4", "video/mp4");
    expect(vid.plan.state).toBe("already");
    expect(vid.mediaId).toBe(ids.video);
    // repetir indexação/processamento (ex.: tarefa reexecutada após queda do worker)
    await q("update media set face_status='queued' where id=$1", [ids.video]);
    await q("insert into jobs(type, payload) values ('index_faces', $1), ('process_media', $1)", [JSON.stringify({ mediaId: ids.video })]);
    await drain();
    const after = await q1("select count(*) as n, sum(units) as u from ai_usage where event_id=$1", [evA.id]);
    expect(after.u).toBe(before.u);
  });

  it("mesmo conteúdo com outro nome vira duplicata (um só original); mesmo nome com conteúdo diferente é preservado", async () => {
    const dup = await upload(cookie, evA.id, await demoPhoto([BRUNO], 3), "copia_renomeada.jpg", "image/jpeg");
    const other = await upload(cookie, evA.id, await demoPhoto([DIEGO], 4), "totem_0001.jpg", "image/jpeg");
    await drain();
    const d = await q1("select status, duplicate_of from media where id=$1", [dup.mediaId]);
    expect(d.status).toBe("duplicate");
    expect(d.duplicate_of).toBe(ids.bruno);
    await housekeeping();
    const key = (await q1("select storage_key from media where id=$1", [dup.mediaId])).storage_key;
    const { headObject } = await import("@/lib/storage");
    expect(await headObject(key)).toBeNull();
    const o = await q1("select status, original_filename from media where id=$1", [other.mediaId]);
    expect(o.status).toBe("ready");
    expect(await q("select id from media where event_id=$1 and original_filename='totem_0001.jpg' and status='ready'", [evA.id])).toHaveLength(2);
  });
});

describe("prazos", () => {
  it("após o prazo de acesso, busca, download e QR bloqueiam; destaques continuam visíveis", async () => {
    await q("update media set image_use=true where id=$1", [ids.anaGroup]);
    await call(mediaActions.POST, "/x", { cookie, params: { id: evA.id }, body: { action: "highlight", mediaIds: [ids.anaGroup] } });
    const created = await (await call(shareRoute.POST, "/x", { cookie, params: { id: ids.anaGroup } })).json();
    const token = created.url.split("/m/")[1];
    const gc = await guestCookie(evA);

    await call(actions.POST, "/x", { cookie, params: { id: evA.id }, body: { action: "block_access" } });
    const s = await call(session.POST, "/x", { params: { token: evA.public_token }, body: { code: "TESTE1" } });
    expect(s.status).toBe(403);
    expect((await s.json()).code).toBe("access_closed");
    expect((await selfieSearch(evA, gc, ANA)).status).toBe(403);
    expect((await call(guestDownload.GET, "/x", { params: { token: evA.public_token, mediaId: ids.anaGroup }, cookie: gc })).status).toBe(403);
    expect((await call(shareDownload.GET, "/x", { params: { token } })).status).toBe(403);
    expect((await listHighlights(evA.id)).map((m) => m.id)).toEqual([ids.anaGroup]);

    // "Liberar por mais 30 dias" vale para o evento inteiro
    const ext = await (await call(actions.POST, "/x", { cookie, params: { id: evA.id }, body: { action: "extend_access" } })).json();
    const days = (new Date(ext.event.access_until).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect((await call(shareDownload.GET, "/x", { params: { token } })).status).toBe(302);
  });

  it("destaque exige autorização de uso de imagem", async () => {
    const r = await call(mediaActions.POST, "/x", { cookie, params: { id: evA.id }, body: { action: "highlight", mediaIds: [ids.bruno] } });
    expect(r.status).toBe(409);
  });

  it("após o prazo da busca facial, a biometria do evento é apagada e a busca é recusada", async () => {
    await q("update events set face_until = now() - interval '1 minute' where id=$1", [evB.id]);
    const col = (await q1("select face_collection_id from events where id=$1", [evB.id])).face_collection_id;
    await housekeeping();
    const e = await q1("select face_search_enabled, face_collection_id, face_purged_at from events where id=$1", [evB.id]);
    expect(e.face_search_enabled).toBe(false);
    expect(e.face_collection_id).toBeNull();
    expect(e.face_purged_at).not.toBeNull();
    expect(Number((await q1("select count(*) as n from face_records where event_id=$1", [evB.id])).n)).toBe(0);
    expect(Number((await q1("select count(*) as n from mock_face_index where collection_id=$1", [col])).n)).toBe(0);
    const gc = await guestCookie(evB, "OUTRO2");
    expect((await selfieSearch(evB, gc, ANA)).status).toBe(409);
    // a galeria e os arquivos continuam
    expect((await q1("select status from media where id=$1", [ids.anaInB])).status).toBe("ready");
  });
});

describe("validação da selfie", () => {
  it("orienta quando há mais de um rosto ou a foto está escura", async () => {
    await q("update events set access_until = now() + interval '1 day' where id=$1", [evA.id]);
    const gc = await guestCookie(evA);
    const send = async (buf: Buffer) => {
      const form = new FormData();
      form.set("consent", "yes");
      form.set("selfie", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), "s.jpg");
      return call(search.POST, "/x", { params: { token: evA.public_token }, cookie: gc, form });
    };
    expect((await (await send(await demoPhoto([ANA, BRUNO], 1))).json()).code).toBe("multiple_faces");
    const sharp = (await import("sharp")).default;
    const dark = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#050505" } }).jpeg().toBuffer();
    expect((await (await send(dark)).json()).code).toBe("too_dark");
    const noFace = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#888888" } }).jpeg().toBuffer();
    expect((await (await send(noFace)).json()).code).toBe("no_face");
    const form = new FormData();
    form.set("selfie", new Blob([new Uint8Array(await demoSelfie(ANA))]), "s.jpg");
    const r = await call(search.POST, "/x", { params: { token: evA.public_token }, cookie: gc, form });
    expect((await r.json()).code).toBe("need_consent");
  });
});
