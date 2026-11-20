/** Reduz a selfie no próprio celular (economiza dados no 4G) e mede o brilho para orientar antes de enviar. */
export async function prepareSelfie(source: Blob | HTMLCanvasElement): Promise<{ blob: Blob; preview: string; brightness: number }> {
  let canvas: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    canvas = source;
  } else {
    const bmp = await loadImage(source);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  const small = document.createElement("canvas");
  small.width = 48;
  small.height = 48;
  const sc = small.getContext("2d")!;
  sc.drawImage(canvas, 0, 0, 48, 48);
  const d = sc.getImageData(0, 0, 48, 48).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const brightness = sum / (48 * 48);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao preparar a foto"))), "image/jpeg", 0.88),
  );
  return { blob, preview: canvas.toDataURL("image/jpeg", 0.6), brightness };
}

async function loadImage(blob: Blob): Promise<HTMLImageElement | ImageBitmap> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* cai para <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não conseguimos abrir essa imagem"));
    };
    img.src = url;
  });
}
