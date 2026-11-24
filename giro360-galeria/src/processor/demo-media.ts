import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { MOCK_PERSONAS } from "@/lib/faces/personas";

/**
 * Gera mídias fictícias para a demonstração e para os testes: "pessoas" com rostos representados por discos
 * coloridos (reconhecidos pelo provedor simulado). Nunca usa imagens de pessoas reais.
 */

function sceneSvg(w: number, h: number, personas: number[], seed: number, offset = 0) {
  const tones = [["#6b6680", "#2d2a3a"], ["#8a7f74", "#3a3330"], ["#71828c", "#26323a"], ["#857590", "#332a38"]][seed % 4];
  const n = Math.max(1, personas.length);
  const people = personas
    .map((p, i) => {
      const s = Math.min(h * 0.24, w / (n * 3.2));
      const x = w * ((i + 0.5) / n) + offset * w;
      const base = h * 0.98;
      return `<ellipse cx="${x}" cy="${base}" rx="${s * 1.15}" ry="${s * 1.7}" fill="#16141c"/>
        <circle cx="${x}" cy="${base - s * 2.15}" r="${s * 0.78}" fill="${MOCK_PERSONAS[p].color}"/>`;
    })
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tones[0]}"/><stop offset="1" stop-color="${tones[1]}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${people}</svg>`);
}

export async function demoPhoto(personas: number[], seed = 1, format: "jpeg" | "png" = "jpeg", size = [1600, 1067]) {
  const img = sharp(sceneSvg(size[0], size[1], personas, seed));
  return format === "png" ? img.png().toBuffer() : img.jpeg({ quality: 88 }).toBuffer();
}

/** Selfie de teste: um único "rosto" grande. */
export async function demoSelfie(persona: number) {
  return sharp(sceneSvg(600, 750, [persona], 2)).jpeg({ quality: 90 }).toBuffer();
}

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-500)))));
  });
}

/**
 * Vídeo de giro: cada pessoa aparece em intervalos (entra e sai de cena), como na Plataforma 360.
 * timeline: lista de [segundo inicial, segundo final, pessoas visíveis].
 */
export async function demoVideo(timeline: [number, number, number[]][], opts: { fps?: number; bitrate?: string; seed?: number } = {}) {
  const fps = opts.fps ?? 4;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "giro360-demo-"));
  try {
    const duration = Math.max(...timeline.map((t) => t[1]));
    const frames = Math.round(duration * fps);
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      const visible = timeline.find(([a, b]) => t >= a && t < b)?.[2] ?? [];
      const offset = Math.sin(t * 1.3) * 0.04;
      await sharp(sceneSvg(640, 640, visible, opts.seed ?? 3, offset)).png().toFile(path.join(dir, `f${String(i).padStart(4, "0")}.png`));
    }
    const out = path.join(dir, "out.mp4");
    const extra = opts.bitrate ? ["-b:v", opts.bitrate, "-maxrate", opts.bitrate, "-bufsize", opts.bitrate, "-vf", "noise=alls=40:allf=t"] : ["-crf", "26"];
    await ffmpeg(["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(dir, "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "24", ...extra, "-movflags", "+faststart", out]);
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
