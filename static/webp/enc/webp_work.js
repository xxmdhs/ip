import webp_enc from './webp_enc.js'

onmessage = async (message) => {
    try {
        const [image, q] = message.data
        const quality = Math.floor(q * 100)
        const webp = await webp_enc()
        const result = webp.encode(image.data, image.width, image.height, {
            quality: quality,
            target_size: 0,
            target_PSNR: 0,
            method: 4,
            sns_strength: 50,
            filter_strength: 60,
            filter_sharpness: 0,
            filter_type: 1,
            partitions: 0,
            segments: 4,
            pass: 1,
            show_compressed: 0,
            preprocessing: 0,
            autofilter: 0,
            partition_limit: 0,
            alpha_compression: 1,
            alpha_filtering: 1,
            alpha_quality: 100,
            lossless: ((q) => {
                if (q == 100) return 1
                return 0
            })(quality),
            exact: 0,
            image_hint: 0,
            emulate_jpeg_size: 0,
            thread_level: 0,
            low_memory: 0,
            near_lossless: 100,
            use_delta_palette: 0,
            use_sharp_yuv: 0,
        })
        postMessage(result)
    } catch (e) {
        console.warn(e)
    }
};
