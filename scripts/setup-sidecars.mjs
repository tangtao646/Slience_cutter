import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const binariesDir = path.join(rootDir, 'src-tauri', 'binaries');

const platformMap = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu'
};

const currentPlatform = `${process.platform}-${process.arch}`;
const triple = platformMap[currentPlatform];

async function setup() {
  console.log(`🚀 正在为平台 ${currentPlatform} (${triple}) 准备 Sidecar...`);

  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const ext = isWin ? '.exe' : '';
  
  const ffmpegTarget = path.join(binariesDir, `ffmpeg-${triple}${ext}`);
  const ffprobeTarget = path.join(binariesDir, `ffprobe-${triple}${ext}`);

  // 1. 检查是否已经存在且体积正常
  if (fs.existsSync(ffmpegTarget) && fs.existsSync(ffprobeTarget)) {
    const stats = fs.statSync(ffmpegTarget);
    if (stats.size > 5 * 1024 * 1024) {
      console.log(`✅ Sidecar 二进制文件已存在 (${(stats.size/1024/1024).toFixed(1)}MB)，跳过。`);
      return;
    }
    console.log('ℹ️ 现有 Sidecar 文件体积异常，将重新准备...');
  }

  // 2. 尝试从系统全局路径拷贝
  try {
    const ffmpegPath = execSync(isWin ? 'where ffmpeg' : 'which ffmpeg').toString().trim().split('\n')[0];
    const ffprobePath = execSync(isWin ? 'where ffprobe' : 'which ffprobe').toString().trim().split('\n')[0];

    if (ffmpegPath && ffprobePath && fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
      const stats = fs.statSync(ffmpegPath);
      // 如果文件小于 5MB，通常是动态库版本或占位符，不适合做 Sidecar
      if (stats.size > 5 * 1024 * 1024) {
        console.log(`📦 从系统路径发现 FFmpeg: ${ffmpegPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
        fs.copyFileSync(ffmpegPath, ffmpegTarget);
        fs.copyFileSync(ffprobePath, ffprobeTarget);
        if (!isWin) {
          fs.chmodSync(ffmpegTarget, 0o755);
          fs.chmodSync(ffprobeTarget, 0o755);
        }
        console.log('✅ 成功从系统路径同步 Sidecar。');
        return;
      } else {
        console.log(`ℹ️ 系统路径的 FFmpeg 体积较小 (${(stats.size / 1024).toFixed(0)}KB)，由于不是静态编译版本，将尝试重新下载静态版...`);
      }
    }
  } catch (e) {
    console.log('ℹ️ 系统路径中未发现 FFmpeg，进入下载流程...');
  }

  // 3. 自动下载逻辑
  try {
    const tempDir = path.join(binariesDir, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    console.log('🌐 正在为您从官方源下载 FFmpeg (这可能需要几分钟)...');

    if (process.platform === 'darwin') {
      // Mac 下载
      console.log('🌐 正在为您从 evermeet.cx 下载 FFmpeg 静态编译版...');
      
      const ffmpegUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip';
      const ffprobeUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip';

      const ffmpegZip = path.join(tempDir, 'ffmpeg.zip');
      const ffprobeZip = path.join(tempDir, 'ffprobe.zip');
      
      execSync(`curl -L "${ffmpegUrl}" -o "${ffmpegZip}"`);
      execSync(`curl -L "${ffprobeUrl}" -o "${ffprobeZip}"`);
      
      console.log('📦 解压中...');
      execSync(`unzip -o "${ffmpegZip}" -d "${tempDir}"`);
      execSync(`unzip -o "${ffprobeZip}" -d "${tempDir}"`);
      
      // evermeet.cx 的 zip 里面直接就是二进制文件
      const downloadedFfmpeg = path.join(tempDir, 'ffmpeg');
      const downloadedFfprobe = path.join(tempDir, 'ffprobe');
      
      if (fs.existsSync(downloadedFfmpeg)) {
        fs.renameSync(downloadedFfmpeg, ffmpegTarget);
      }
      if (fs.existsSync(downloadedFfprobe)) {
        fs.renameSync(downloadedFfprobe, ffprobeTarget);
      }
    } else if (process.platform === 'win32') {
      // Windows 下载
      const winZip = path.join(tempDir, 'ffmpeg.zip');
      console.log('⏬ 下载 ffmpeg-release-essentials.zip...');
      execSync(`curl -L https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip -o "${winZip}"`);
      
      console.log('📦 解压中...');
      // Windows tar 支持解压 zip
      execSync(`tar -xf "${winZip}" -C "${tempDir}"`);
      
      // 查找解压后的 bin 文件夹下的 exe
      const files = execSync(`dir /s /b "${tempDir}\\ffmpeg.exe"`).toString().trim().split('\n');
      const ffprobeFiles = execSync(`dir /s /b "${tempDir}\\ffprobe.exe"`).toString().trim().split('\n');
      
      if (files[0] && ffprobeFiles[0]) {
        fs.copyFileSync(files[0].trim(), ffmpegTarget);
        fs.copyFileSync(ffprobeFiles[0].trim(), ffprobeTarget);
      }
    }

    // 清理
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (fs.existsSync(ffmpegTarget)) {
      if (!isWin) {
        fs.chmodSync(ffmpegTarget, 0o755);
        fs.chmodSync(ffprobeTarget, 0o755);
      }
      console.log('\n✅ 自动下载并设置 Sidecar 成功！');
      return;
    }
  } catch (err) {
    console.error('❌ 自动下载失败:', err.message);
  }

  // 4. 最后提示手动下载
  console.log(`请手动下载 FFmpeg 并放入: ${ffmpegTarget}`);
  console.log('推荐下载地址:');
  console.log('- Mac: https://evermeet.cx/ffmpeg/');
  console.log('- Windows: https://www.gyan.dev/ffmpeg/builds/');
}

setup().catch(console.error);
