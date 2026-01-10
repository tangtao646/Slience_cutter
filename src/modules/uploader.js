import { getTauriManager } from './tauri-manager.js';

export function getUploader() {
    const tauri = getTauriManager();

    async function startUploadFile(file, onProgress) {
        // 如果没有 invoke，说明可能不在 Tauri 环境或未初始化
        if (!tauri || !tauri.invoke) {
            console.warn('Tauri invoke not found, skipping background upload (falling back to browser path)');
            return URL.createObjectURL(file);
        }
        const chunkSize = 1024 * 1024; // 1MB
        const total = file.size;

        // start session
        const session = await tauri.invoke('start_upload', {
            filename: file.name,
            totalSize: total
        });

        let offset = 0;
        while (offset < total) {
            const end = Math.min(offset + chunkSize, total);
            const slice = file.slice(offset, end);

            // read as data URL then extract base64
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error);
                reader.onload = () => {
                    const result = reader.result;
                    // result is like data:;base64,AAAA
                    const parts = result.split(',');
                    resolve(parts[1]);
                };
                reader.readAsDataURL(slice);
            });

            // upload chunk
            await tauri.invoke('upload_chunk', {
                sessionId: session,
                chunkBase64: base64
            });

            offset = end;
            if (onProgress) onProgress(offset / total, offset, total);
        }

        // finish and get backend path
        const backendPath = await tauri.invoke('finish_upload', { sessionId: session });
        return backendPath;
    }

    return {
        startUploadFile
    };
}
