// Keep animations and small images untouched; never crop the uploaded picture.
export async function optimizeImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size < 32_768 || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap | undefined;
  try {
    if (file.type === 'image/png') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // APNG contains an animation control chunk before the image data.
      for (let i = 8; i + 12 <= bytes.length;) {
        const length = new DataView(bytes.buffer).getUint32(i);
        if (bytes[i + 4] === 97 && bytes[i + 5] === 99 && bytes[i + 6] === 84 && bytes[i + 7] === 76) return file;
        if (bytes[i + 4] === 73 && bytes[i + 5] === 68 && bytes[i + 6] === 65 && bytes[i + 7] === 84) break;
        i += length + 12;
      }
    }
    bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .9));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {type: blob.type});
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
