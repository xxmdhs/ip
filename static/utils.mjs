/**
 * 
 * @param {Uint8Array} uint8Array 
 * @param {string} f 
 * @returns {Promise<ImageData>}
 */
export async function toImageData(uint8Array, f = "") {
    const blob = new Blob([uint8Array]);

    const imgBitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
    const ctx = canvas.getContext('2d');

    if (f === "jpeg") {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(imgBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, imgBitmap.width, imgBitmap.height);
    return imageData
}