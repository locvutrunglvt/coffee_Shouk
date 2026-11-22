import jsQR from "jsqr";

/**
 * Decodes a QR string from an uploaded image file directly in the browser.
 */
export function decodeQrFromFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const maxDim = 900;
        const scale =
          Math.max(img.width, img.height) > maxDim
            ? maxDim / Math.max(img.width, img.height)
            : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const result = jsQR(imgData.data, w, h);
        resolve(result?.data ?? null);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
