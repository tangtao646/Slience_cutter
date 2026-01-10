// 文件处理和管理
export class FileHandler {
    constructor() {
        console.log('FileHandler initialized');
    }
    
    async selectFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.aac';
            input.multiple = false;
            
            input.onchange = (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    resolve({
                        name: file.name,
                        file: file,
                        path: URL.createObjectURL(file),
                        isTauriFile: false
                    });
                } else {
                    resolve(null);
                }
            };
            
            input.click();
        });
    }
    
    async handleFileDrop(event) {
        event.preventDefault();
        
        if (event.dataTransfer.files.length > 0) {
            const file = event.dataTransfer.files[0];
            
            if (!this.isMediaFile(file)) {
                throw new Error('请选择支持的媒体文件 (MP4, MOV, AVI, MKV, WebM, MP3, WAV, AAC)');
            }
            
            return {
                name: file.name,
                file: file,
                path: URL.createObjectURL(file),
                isTauriFile: false
            };
        }
        
        return null;
    }
    
    isMediaFile(file) {
        const mediaTypes = [
            'video/mp4',
            'video/quicktime',
            'video/x-msvideo',
            'video/x-matroska',
            'video/webm',
            'audio/mpeg',
            'audio/wav',
            'audio/x-wav',
            'audio/aac',
            'audio/x-aac'
        ];
        
        const mediaExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.aac'];
        
        if (mediaTypes.includes(file.type)) {
            return true;
        }
        
        const fileName = file.name.toLowerCase();
        return mediaExtensions.some(ext => fileName.endsWith(ext));
    }
    
    getFileExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }
}

// 单例模式导出
let fileHandlerInstance = null;

export function getFileHandler() {
    if (!fileHandlerInstance) {
        fileHandlerInstance = new FileHandler();
    }
    return fileHandlerInstance;
}