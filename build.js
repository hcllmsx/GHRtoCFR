import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// 确保dist目录存在
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist', { recursive: true });
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

try {
  // 使用esbuild打包
  const result = await esbuild.build({
    entryPoints: ['./src/index.js'],
    bundle: true,
    outfile: './dist/index.js',
    format: 'esm',
    minify: false,
    sourcemap: false,
    platform: 'browser',
    target: ['es2022'],
  });

  console.log('构建成功!');
} catch (error) {
  console.error('构建失败:', error);
  process.exit(1);
} 