import { WASI, File, OpenFile, ConsoleStdout } from "https://esm.sh/@bjorn3/browser_wasi_shim";


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
    const { quality, progressiveLevel, DTCMethod, adaptiveQuantization, fancyDownsampling } = {
        quality: q * 100,
        progressiveLevel: 1,
        DTCMethod: 0,
        adaptiveQuantization: 1,
        fancyDownsampling: 1,
    };
    const pixelDataPtr = malloc(pixelData.length);
    new Uint8Array(memoryBuffer.buffer).set(pixelData, pixelDataPtr);
    const encodedSizePtr = malloc(8);
    const encodedDataPtr = encode(pixelDataPtr, width, height, 2, 2, encodedSizePtr, quality, progressiveLevel, adaptiveQuantization, fancyDownsampling, DTCMethod);
    const encodedSizeArray = new Uint32Array(memoryBuffer.buffer.slice(encodedSizePtr, encodedSizePtr + 8));
    const encodedImageData = new Uint8Array(memoryBuffer.buffer.slice(encodedDataPtr, encodedDataPtr + encodedSizeArray[0]));
    free(pixelDataPtr);
    free(encodedSizePtr);
    free(encodedDataPtr);
    return new Blob([encodedImageData], { type: "image/jpeg" });
}


onmessage = async (message) => {
    try {
        const [image, q] = message.data
        const result = await jpegLiencode(image, q)
        postMessage(result)
    } catch (e) {
        console.warn(e)
    }
};