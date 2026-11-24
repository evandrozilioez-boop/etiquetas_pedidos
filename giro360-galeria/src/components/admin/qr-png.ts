/** Converte o QR (SVG) em PNG no navegador e baixa o arquivo. */
export async function downloadQrPng(svg: string, filename: string, size = 1024) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao gerar o PNG"));
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    const png = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar o PNG"))), "image/png"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Envia uma imagem direto ao armazenamento: pede a URL assinada, envia e confirma. */
export async function uploadViaSignedUrl(endpoint: string, file: File) {
  const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Não foi possível enviar a imagem.");
  const put = await fetch(j.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!put.ok) throw new Error("O armazenamento recusou a imagem. Tente de novo.");
  const c = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmKey: j.key }) });
  if (!c.ok) throw new Error((await c.json().catch(() => null))?.error ?? "Não foi possível confirmar a imagem.");
}
