import { createClient } from "@/lib/supabase/client";

/**
 * Compresses an image file in the browser (max 640px) and uploads to
 * Supabase Storage bucket `taoi-images` if available, or falls back to
 * a compact JPEG data URL so uploads work immediately with zero setup.
 */
export async function compressAndUploadImage(
  file: File,
  folder: string
): Promise<string> {
  const dataUrl = await compressImageToDataUrl(file, 640, 0.8);

  try {
    const supabase = createClient();
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const fileName = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`;

    const { error } = await supabase.storage
      .from("taoi-images")
      .upload(fileName, blob, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (!error) {
      const { data } = supabase.storage.from("taoi-images").getPublicUrl(fileName);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }
  } catch {
    // Fallback to compressed base64 data URL
  }

  return dataUrl;
}

function compressImageToDataUrl(
  file: File,
  maxWidth: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Invalid image"));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
