importScripts("./ffmpeg.js")
async function loadFfmpeg() {

    const ffmpeg = new FFmpeg({
        mainName: 'main',
        corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
        logger: e => {
            postMessage({ type: "log", data: e });
        },
        progress: e => postMessage({ type: "progress", data: e })
    });
    await ffmpeg.load();
    return ffmpeg;
}
onmessage = async (message) => {
    const [flag, d, fname] = message.data
    const ffmpeg = await loadFfmpeg()
    ffmpeg.writeFile('1.gif', d)
    await ffmpeg.run(...flag);
    const r = ffmpeg.readFile(fname)
    ffmpeg.unlink('1.gif')
    ffmpeg.unlink(fname)
    postMessage({ type: "r", data: r });
};