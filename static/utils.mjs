/**
 * 
 * @param {Uint8Array} uint8Array 
 * @param {string} f 
 * @param {number} size
 * @returns {Promise<ImageData>}
 */
export async function toImageData(uint8Array, f = "", size = 0) {
    const blob = new Blob([uint8Array]);

    const imgBitmap = await createImageBitmap(blob)
    let [w, h] = [imgBitmap.width, imgBitmap.height]
    if (size != 0) {
        const max = size;
        if (w > max || h > max) {
            const scale = max / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }
    }
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high'
    ctx.imageSmoothingEnabled = true

    if (f === "jpeg") {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(imgBitmap, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return imageData
}