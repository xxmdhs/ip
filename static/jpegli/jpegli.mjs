import { WASI, File, OpenFile, ConsoleStdout } from "../wasi/index.js";
import { toImageData } from "../utils.mjs";


async function loadWasm() {
    const args = [];
    const env = [];
    const fds = [
        new OpenFile(new File([])), // stdin
        ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
        ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`)),
    ];
    const wasi = new WASI(args, env, fds);
    const wasm = await WebAssembly.compileStreaming(fetch("jpegli.wasm"));
    const inst = await WebAssembly.instantiate(wasm, {
        "env": { memory: new WebAssembly.Memory({ initial: 256, maximum: 16384, shared: true }) },
        "wasi_snapshot_preview1": wasi.wasiImport,
    });
    wasi.initialize(inst);
    return inst;
}

let inst = null;
async function jpegLiencode(imageData, q) {
    if (inst == null) {
        inst = await loadWasm();
    }
    const memoryBuffer = inst.exports.memory;
    const { malloc: malloc, encode: encode, free: free } = inst.exports;
    const { data: pixelData, width, height } = imageData;
    const {
        quality,
        progressiveLevel,
        DTCMethod,
        adaptiveQuantization,
        fancyDownsampling,
        optimizeCoding,
        standardQuantTables
    } = {
        quality: q * 100,
        progressiveLevel: 2,
        DTCMethod: 0,
        adaptiveQuantization: 1,
        fancyDownsampling: 1,
        optimizeCoding: 1,
        standardQuantTables: 0
    };

    const pixelDataPtr = malloc(pixelData.length);
    new Uint8Array(memoryBuffer.buffer).set(pixelData, pixelDataPtr);
    const encodedSizePtr = malloc(8);
    const encodedDataPtr = encode(
        pixelDataPtr,
        width,
        height,
        2,                       // colorspace
        2,                       // chroma
        encodedSizePtr,
        quality,
        progressiveLevel,
        optimizeCoding,
        adaptiveQuantization,
        standardQuantTables,
        fancyDownsampling,
        DTCMethod
    );
    const encodedSizeArray = new Uint32Array(memoryBuffer.buffer.slice(encodedSizePtr, encodedSizePtr + 8));
    const encodedImageData = new Uint8Array(memoryBuffer.buffer.slice(encodedDataPtr, encodedDataPtr + encodedSizeArray[0]));
    free(pixelDataPtr);
    free(encodedSizePtr);
    free(encodedDataPtr);
    return new Blob([encodedImageData], { type: "image/jpeg" });
}


onmessage = async (message) => {
    try {
        const [image, q, size] = message.data
        const d = await toImageData(image, "jpeg", size ?? 0)
        const result = await jpegLiencode(d, q)
        postMessage(result)
    } catch (e) {
        console.warn(e)
    }
};
