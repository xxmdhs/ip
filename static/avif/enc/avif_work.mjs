import avif_enc from './avif_enc.mjs'

onmessage = async (message) => {
    try {
        const [image, q] = message.data
        const avif = await avif_enc()
        const cq = Math.floor((100 - q * 100) * 0.63)
        const result = avif.encode(image.data, image.width, image.height, {
            cqLevel: cq,
            cqAlphaLevel: -1,
            denoiseLevel: 0,
            tileColsLog2: 0,
            tileRowsLog2: 0,
            speed: 6,
            subsample: 1,
            chromaDeltaQ: false,
            sharpness: 0,
            tune: 0,
        })
        postMessage(result)
    } catch (e) {
        console.warn(e)
    }
};