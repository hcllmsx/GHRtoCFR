import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 确保dist目录存在
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist', { recursive: true });
}

// 确保dist/styles目录存在
if (!fs.existsSync('./dist/styles')) {
  fs.mkdirSync('./dist/styles', { recursive: true });
}

// 创建public目录用于存放静态资源
if (!fs.existsSync('./public')) {
  fs.mkdirSync('./public', { recursive: true });
}

// 复制CSS文件到public目录
if (fs.existsSync('./src/styles')) {
  fs.readdirSync('./src/styles').forEach(file => {
    if (file.endsWith('.css')) {
      fs.copyFileSync(
        path.join('./src/styles', file),
        path.join('./public', file)
      );
      console.log(`已复制 ${file} 到 public 目录`);
    }
  });
}

/**
 * 递归复制源文件夹到目标文件夹
 */
function copyFolderSync(from, to) {
  // 如果目标目录不存在，则创建它
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }

  // 读取源目录中的文件和子目录
  fs.readdirSync(from).forEach(element => {
    const stats = fs.statSync(path.join(from, element));
    
    if (stats.isFile()) {
      // 复制文件
      fs.copyFileSync(path.join(from, element), path.join(to, element));
      console.log(`已复制文件 ${element} 到 ${to}`);
    } else if (stats.isDirectory()) {
      // 递归复制子目录
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

try {
  // 直接复制src目录到dist
  copyFolderSync('./src', './dist');
  console.log('构建成功!');
} catch (error) {
  console.error('构建失败:', error);
  process.exit(1);
} 