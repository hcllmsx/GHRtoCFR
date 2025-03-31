import { fetchGitHubRateLimit } from '../utils/githubApi.js';
import { getRepoConfigs, saveVersionInfo, clearFilePathsList } from '../utils/repoUtils.js';
import { checkNeedUpdate, deleteRepoFiles, downloadAndUploadAssets } from './syncHandler.js';
import { generateStatusPage } from './pageHandler.js';
import { fetchLatestRelease } from '../utils/githubApi.js';

// 存储上次检查时间的变量
let lastCheckTime = 0;

/**
 * 处理 favicon.svg 请求
 */
export async function handleFavicon() {
  // 使用内联SVG直接提供favicon
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`;
  
  return new Response(svgContent, {
    headers: { 
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400"
    }
  });
}

/**
 * 处理 scripts/main.js 请求
 */
export async function handleMainScript() {
  // 直接返回JS内容，不使用模块导入
  const scriptContent = `
function triggerSyncAll() {
  const syncAllButton = document.getElementById('syncAllButton');
  const syncLog = document.getElementById('syncLog');
  
  syncAllButton.disabled = true;
  syncLog.innerHTML += '开始同步所有仓库...\n';
  
  fetch('/sync')
    .then(function(response) {
      if (!response.body) {
        throw new Error('浏览器不支持流式响应');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // 添加变量跟踪同步状态
      let syncComplete = false;
      let allReposComplete = false;
      
      function readStream() {
        reader.read().then(function(result) {
          if (result.done) {
            if (!syncComplete) {
              syncLog.innerHTML += '\\n读取同步日志流结束，但未收到完成信号。5秒后自动刷新仓库状态...\\n';
              setTimeout(function() { refreshStatus(); }, 5000);
            }
            return;
          }
          
          const text = decoder.decode(result.value, { stream: true });
          syncLog.innerHTML += text;
          syncLog.scrollTop = syncLog.scrollHeight;
          
          // 检查是否包含明确的完成信号
          if (text.includes('所有同步任务完成')) {
            syncComplete = true;
            allReposComplete = true;
            syncLog.innerHTML += '\\n所有仓库同步完成！3秒后自动刷新仓库状态...\\n';
            setTimeout(function() { refreshStatus(); }, 3000);
            return;
          }
          
          // 检查是否有错误信号
          if (text.includes('同步过程中出错')) {
            syncComplete = true;
            syncLog.innerHTML += '\\n同步过程中出错。5秒后自动刷新仓库状态...\\n';
            setTimeout(function() { refreshStatus(); }, 5000);
            return;
          }
          
          // 不要过早地结束日志读取，继续读取流
          readStream();
        }).catch(function(error) {
          syncLog.innerHTML += '\\n日志流读取错误: ' + error.message + '\\n请手动刷新页面查看最新状态...\\n';
          setTimeout(function() { refreshStatus(); }, 5000);
        });
      }
      
      readStream();
    })
    .catch(function(error) {
      syncLog.innerHTML += '\\n启动同步失败: ' + error.message + '\\n请检查网络连接或刷新页面重试...\\n';
      syncAllButton.disabled = false;
    });
}

function triggerSyncRepo(repo) {
  const repoId = repo.replace('/', '-');
  const syncButton = document.getElementById('sync-' + repoId);
  const syncLog = document.getElementById('syncLog');
  
  syncButton.disabled = true;
  syncLog.innerHTML += '开始同步仓库: ' + repo + '...\\n';
  
  fetch('/sync?repo=' + encodeURIComponent(repo))
    .then(function(response) {
      if (!response.body) {
        throw new Error('浏览器不支持流式响应');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // 添加变量跟踪同步状态
      let syncComplete = false;
      
      function readStream() {
        reader.read().then(function(result) {
          if (result.done) {
            if (!syncComplete) {
              syncLog.innerHTML += '\\n读取同步日志流结束，但未收到完成信号。5秒后自动刷新仓库状态...\\n';
              setTimeout(function() { refreshStatus(); }, 5000);
            }
            return;
          }
          
          const text = decoder.decode(result.value, { stream: true });
          syncLog.innerHTML += text;
          syncLog.scrollTop = syncLog.scrollHeight;
          
          // 检查是否包含该仓库的完成信号
          if (text.includes(repo + ' 同步完成')) {
            syncComplete = true;
            syncLog.innerHTML += '\\n仓库 ' + repo + ' 同步完成！3秒后自动刷新仓库状态...\\n';
            setTimeout(function() { refreshStatus(); }, 3000);
            return;
          }
          
          // 检查是否有错误信号
          if (text.includes('同步 ' + repo + ' 时出错') || text.includes('同步过程中出错')) {
            syncComplete = true;
            syncLog.innerHTML += '\\n仓库 ' + repo + ' 同步出错。5秒后自动刷新仓库状态...\\n';
            setTimeout(function() { refreshStatus(); }, 5000);
            return;
          }
          
          // 继续读取流
          readStream();
        }).catch(function(error) {
          syncLog.innerHTML += '\\n日志流读取错误: ' + error.message + '\\n请手动刷新页面查看最新状态...\\n';
          setTimeout(function() { refreshStatus(); }, 5000);
        });
      }
      
      readStream();
    })
    .catch(function(error) {
      syncLog.innerHTML += '\\n启动同步失败: ' + error.message + '\\n请检查网络连接或刷新页面重试...\\n';
      syncButton.disabled = false;
    });
}

function clearSyncLog() {
  document.getElementById('syncLog').innerHTML = '';
}

// 只刷新状态，不刷新整个页面或清空日志
function refreshStatus() {
  const syncAllButton = document.getElementById('syncAllButton');
  const syncLog = document.getElementById('syncLog');
  
  // 从API获取最新状态
  fetch('/api/status')
    .then(response => response.json())
    .then(data => {
      // 更新仓库状态表格
      if (data.repos && data.repos.length > 0) {
        data.repos.forEach(repo => {
          const repoId = repo.repo.replace('/', '-');
          const row = document.getElementById('repo-' + repoId);
          
          if (row) {
            // 更新版本
            row.cells[1].textContent = repo.version;
            
            // 更新日期
            if (repo.date && repo.date !== "-") {
              try {
                const date = new Date(repo.date);
                row.cells[2].textContent = date.toLocaleString('zh-CN', {
                  year: 'numeric', month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                  hour12: false
                });
              } catch (e) {
                row.cells[2].textContent = repo.date;
              }
            }
            
            // 更新状态
            const statusCell = row.cells[4].querySelector('.status');
            if (statusCell) {
              // 移除旧的状态类
              statusCell.classList.remove('status-success', 'status-pending', 'status-error');
              
              // 添加新的状态类和文本
              let statusClass = "";
              let statusText = "";
              
              if (repo.status === "error") {
                statusClass = "status-error";
                statusText = "失败";
              } else if (repo.status === "updated" || repo.status === "latest" || repo.status === "synced") {
                statusClass = "status-success";
                statusText = "最新";
              } else if (repo.status === "pending") {
                statusClass = "status-pending";
                statusText = "待同步";
              } else if (repo.status === "syncing") {
                statusClass = "status-pending";
                statusText = "同步中";
              } else {
                statusClass = "status-pending";
                statusText = repo.status || "未知";
              }
              
              statusCell.classList.add(statusClass);
              statusCell.textContent = statusText;
              
              if (repo.message) {
                statusCell.title = repo.message;
              }
            }
            
            // 更新同步按钮状态
            const syncButton = document.getElementById('sync-' + repoId);
            
            if (syncButton && repo.status !== "syncing") {
              syncButton.disabled = false;
            }
          }
        });
      }
      
      // 更新全局同步状态
      if (!data.isSyncing) {
        syncAllButton.disabled = false;
      }
      
      // 添加更新成功日志
      syncLog.innerHTML += '\\n[' + new Date().toLocaleTimeString() + '] 已刷新仓库状态\\n';
      syncLog.scrollTop = syncLog.scrollHeight;
    })
    .catch(error => {
      syncLog.innerHTML += '\\n刷新状态失败: ' + error.message + '\\n';
      syncLog.scrollTop = syncLog.scrollHeight;
    });
}

let pageIdleTime = 0;
const maxIdleTime = 60;

setInterval(function() {
  const syncAllButton = document.getElementById('syncAllButton');
  
  if (syncAllButton.disabled) {
    pageIdleTime++;
    
    if (pageIdleTime >= maxIdleTime) {
      console.log('同步状态长时间未更新，自动刷新仓库状态');
      refreshStatus();
      pageIdleTime = 0;
    }
  } else {
    pageIdleTime = 0;
  }
}, 1000);
  `;
  
  return new Response(scriptContent, {
    headers: { 
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600"
    }
  });
}

/**
 * 处理 styles/main.css 请求
 */
export async function handleMainStyle() {
  // 直接返回CSS内容，不使用模块导入
  const styleContent = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
h1 {
  text-align: center;
  margin-bottom: 30px;
  color: #2563eb;
}
.btn {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}
.btn:hover {
  background-color: #1d4ed8;
}
.btn:disabled {
  background-color: #93c5fd;
  cursor: not-allowed;
}
.btn-sm {
  padding: 5px 10px;
  font-size: 0.9rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  overflow: hidden;
}
th, td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}
th {
  background-color: #2563eb;
  color: white;
  font-weight: 600;
}
tr:nth-child(even) {
  background-color: #f2f7ff;
}
tr:hover {
  background-color: #e6f0ff;
}
.status {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 500;
}
.status-success {
  background-color: #dcfce7;
  color: #16a34a;
}
.status-pending {
  background-color: #fef3c7;
  color: #d97706;
}
.status-error {
  background-color: #fee2e2;
  color: #dc2626;
}
.sync-log-container {
  margin: 20px 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  background-color: #1a1a1a;
  height: 500px;
  display: flex;
  flex-direction: column;
}
.sync-log {
  flex: 1;
  overflow-y: auto;
  color: #f8f8f8;
  padding: 15px;
  font-family: monospace;
  font-size: 0.9rem;
  white-space: pre-wrap;
  line-height: 1.4;
  background-color: #1a1a1a;
}
.sync-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: #2c2c2c;
  border-bottom: 1px solid #444;
}
.sync-log-title {
  font-weight: bold;
  color: #fff;
  margin: 0;
}
.sync-log-controls {
  display: flex;
  gap: 10px;
}
.sync-log-clear {
  background-color: #555;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.sync-log-clear:hover {
  background-color: #777;
}
.sync-all-btn {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.sync-all-btn:hover {
  background-color: #1d4ed8;
}
.sync-all-btn:disabled {
  background-color: #93c5fd;
  cursor: not-allowed;
}
.error-message {
  background-color: #fee2e2;
  color: #dc2626;
  padding: 15px;
  border-radius: 8px;
  margin: 20px 0;
  text-align: center;
}
.info-message {
  background-color: #f0f9ff;
  color: #0369a1;
  padding: 15px;
  border-radius: 8px;
  margin: 20px 0;
  text-align: center;
}
.footer {
  text-align: center;
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.last-check {
  font-size: 0.9rem;
  color: #666;
}
.api-info {
  font-size: 0.9rem;
  color: #666;
  padding: 8px 16px;
  background-color: #f8fafc;
  border-radius: 6px;
  display: inline-block;
}
.api-count {
  font-weight: 600;
  color: #2563eb;
}
.api-reset {
  font-style: italic;
}
.refresh-btn {
  background-color: #4b5563;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.refresh-btn:hover {
  background-color: #374151;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.sync-complete {
  background-color: #dcfce7;
  color: #166534;
}
@media (max-width: 768px) {
  table {
    display: block;
    overflow-x: auto;
  }
}`;
  
  return new Response(styleContent, {
    headers: { 
      "Content-Type": "text/css",
      "Cache-Control": "public, max-age=3600"
    }
  });
}

/**
 * 处理 API 状态请求
 */
export async function handleApiStatus(worker, env) {
  return new Response(JSON.stringify({
    repos: worker.syncedRepos,
    lastCheck: lastCheckTime ? new Date(lastCheckTime * 1000).toISOString() : null,
    apiRateLimit: worker.apiRateLimit,
    error: worker.errorMessage,
    info: worker.infoMessage,
    isSyncing: worker.isSyncing
  }), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}

/**
 * 处理 GitHub API 速率限制请求
 */
export async function handleGitHubRate(worker, env) {
  const rateLimitInfo = await fetchGitHubRateLimit(env);
  worker.apiRateLimit = rateLimitInfo.rateLimit;
  
  return new Response(JSON.stringify({
    apiRateLimit: worker.apiRateLimit
  }), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}

/**
 * 处理同步日志流
 */
export async function handleSyncLogsStream(request, env) {
  // 创建一个流式响应
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // 获取可能的仓库参数
  const url = new URL(request.url);
  const repoParam = url.searchParams.get('repo');
  
  // 设置环境变量来存储该流的writer，以便后续写入
  env.LOG_WRITER = writer;
  env.LOG_REPO = repoParam;
  
  // 返回EventSource兼容的响应
  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

/**
 * 处理同步日志API
 */
export async function handleSyncLogs() {
  // 返回一个简单的确认响应
  return new Response("同步日志服务就绪", { status: 200 });
}

/**
 * 处理同步请求
 */
export async function handleSync(request, worker, env, ctx) {
  // 检查R2绑定
  if (!env.R2_BUCKET) {
    return new Response("未配置R2存储桶", { status: 500 });
  }
  
  // 处理同步任务
  worker.isSyncing = true; // 设置同步状态
  
  // 获取仓库配置
  const repoConfigs = getRepoConfigs(env);
  
  if (!repoConfigs || repoConfigs.length === 0) {
    worker.isSyncing = false;
    return new Response("未配置任何仓库", { status: 400 });
  }

  // 如果请求中指定了仓库，只同步该仓库
  const url = new URL(request.url);
  const requestedRepo = url.searchParams.get('repo');
  
  const syncTargets = requestedRepo 
    ? repoConfigs.filter(config => config.repo === requestedRepo)
    : repoConfigs;
  
  if (requestedRepo && syncTargets.length === 0) {
    worker.isSyncing = false;
    return new Response(`未找到指定的仓库配置: ${requestedRepo}`, { status: 404 });
  }

  // 设置流式响应
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  
  // 创建一个Promise，在同步完成后解析
  const syncPromise = new Promise(async (resolve, reject) => {
    try {
      for (const config of syncTargets) {
        const { repo, path } = config;
        await writer.write(encoder.encode(`开始同步 ${repo}...\n`));
        
        try {
          // 获取最新版本信息
          const releaseInfo = await fetchLatestRelease(repo, env);
          if (!releaseInfo) {
            await writer.write(encoder.encode(`无法获取 ${repo} 的发布信息\n`));
            continue;
          }
          
          const { tag_name, published_at, assets } = releaseInfo;
          await writer.write(encoder.encode(`${repo} 的最新版本: ${tag_name}, 发布于: ${published_at}\n`));
          
          // 首先检查是否需要更新
          const needUpdate = await checkNeedUpdate(env, repo, tag_name, path);
          if (!needUpdate) {
            await writer.write(encoder.encode(`${repo} 已是最新版本，无需更新\n`));
            // 更新同步状态
            const syncedRepo = {
              repo,
              version: tag_name,
              lastUpdate: new Date().toISOString(),
              status: 'synced',
              path,
              filePaths: [] // 初始化一个空的文件路径数组，会在文件上传时填充
            };
            await saveVersionInfo(env, repo, syncedRepo);
            continue;
          }
          
          // 同步之前先清空旧的filePaths，防止数据混淆
          await clearFilePathsList(env, repo);
          
          // 只有需要更新时才删除旧文件
          await writer.write(encoder.encode(`正在删除 ${repo} 的旧文件...\n`));
          await deleteRepoFiles(env, repo);
          
          // 下载并上传新文件
          await writer.write(encoder.encode(`正在下载 ${repo} 的最新文件...\n`));
          
          // 过滤出有效的资源文件
          const validAssets = assets.filter(asset => {
            return !asset.name.includes("Source code") &&
                   !asset.name.endsWith(".sha256") &&
                   !asset.name.endsWith(".asc");
          });
          
          // 确保文件来源正确
          validAssets.forEach(asset => {
            if (!asset.sourceRepo) {
              asset.sourceRepo = repo;
            }
          });
          
          await writer.write(encoder.encode(`找到 ${validAssets.length} 个有效资源文件\n`));
          
          // 上传所有文件
          const uploadedPaths = await downloadAndUploadAssets(repo, validAssets, path, env);
          
          // 计算每个平台的文件数量
          const platformCounts = {
            Windows: 0,
            macOS: 0,
            Linux: 0,
            Android: 0,
            Other: 0
          };
          
          uploadedPaths.forEach(path => {
            // 根据路径判断平台
            if (path.includes('/Windows/')) platformCounts.Windows++;
            else if (path.includes('/macOS/')) platformCounts.macOS++;
            else if (path.includes('/Linux/')) platformCounts.Linux++;
            else if (path.includes('/Android/')) platformCounts.Android++;
            else platformCounts.Other++;
          });
          
          // 保存版本信息到KV
          const syncedRepo = {
            repo,
            version: tag_name,
            lastUpdate: new Date().toISOString(),
            status: 'synced',
            path,
            filePaths: uploadedPaths
          };
          await saveVersionInfo(env, repo, syncedRepo);
          
          const platformSummary = Object.entries(platformCounts)
            .filter(([_, count]) => count > 0)
            .map(([platform, count]) => `${platform}: ${count}个文件`)
            .join(', ');
          
          await writer.write(encoder.encode(`${repo} 同步完成，版本 ${tag_name}，共上传 ${uploadedPaths.length} 个文件 (${platformSummary})\n`));
        } catch (error) {
          await writer.write(encoder.encode(`同步 ${repo} 时出错: ${error.message}\n`));
          // 更新为错误状态
          const errorRepo = {
            repo,
            status: 'error',
            error: error.message,
            lastUpdate: new Date().toISOString(),
            path: config.path
          };
          await saveVersionInfo(env, repo, errorRepo);
        }
      }
      
      // 所有仓库同步完成，写入完成消息
      await writer.write(encoder.encode("所有同步任务完成\n"));
      resolve();
    } catch (error) {
      await writer.write(encoder.encode(`同步过程中出错: ${error.message}\n`));
      reject(error);
    } finally {
      // 确保流关闭
      try {
        await writer.close();
      } catch (e) {
        console.error("关闭流时出错:", e);
      }
      worker.isSyncing = false; // 重置同步状态
    }
  });
  
  // 使用waitUntil确保即使连接断开，同步任务也会继续完成
  ctx.waitUntil(syncPromise);

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

/**
 * 处理主页请求
 */
export async function handleHome(worker, env) {
  // 检查 R2 绑定
  const hasR2Binding = typeof env.R2_BUCKET !== 'undefined';
  if (!hasR2Binding) {
    worker.errorMessage = "注意: R2 存储桶未绑定，请在 Workers 设置中绑定 R2_BUCKET。当前仅可查看状态，无法执行同步操作。";
  } else {
    // 清除任何之前的错误
    worker.errorMessage = null;
  }
  
  // 如果还没有 API 速率限制信息，先获取一次
  if (!worker.apiRateLimit) {
    const rateLimitInfo = await fetchGitHubRateLimit(env);
    worker.apiRateLimit = rateLimitInfo.rateLimit;
  }
  
  // 获取仓库配置
  const repoConfigs = getRepoConfigs(env);
  
  // 检查路径变更或重置同步状态
  if (env.SYNC_STATUS && repoConfigs.length > 0) {
    for (const config of repoConfigs) {
      const { repo, path } = config;
      const repoKey = `repo:${repo}`;
      
      try {
        const versionInfoJson = await env.SYNC_STATUS.get(repoKey);
        if (versionInfoJson) {
          const versionInfo = JSON.parse(versionInfoJson);
          
          // 检查路径是否变更
          if (versionInfo.path !== path) {
            console.log(`检测到 ${repo} 的路径已从 ${versionInfo.path} 变更为 ${path}，更新状态`);
            
            // 创建新的状态对象
            const updatedInfo = {
              ...versionInfo,
              path: path,
              status: 'pending',
              message: '路径已变更，需要重新同步'
            };
            
            // 保存到KV
            await env.SYNC_STATUS.put(repoKey, JSON.stringify(updatedInfo));
          }
          
          // 检查如果状态为syncing但时间超过20分钟，则重置为error状态
          if (versionInfo.status === 'syncing' && versionInfo.lastUpdate) {
            const lastUpdateTime = new Date(versionInfo.lastUpdate).getTime();
            const currentTime = new Date().getTime();
            const timeDiff = currentTime - lastUpdateTime;
            
            // 如果同步状态超过20分钟，认为同步失败
            if (timeDiff > 20 * 60 * 1000) {
              console.log(`${repo} 的同步状态已持续超过20分钟，重置为错误状态`);
              
              const updatedInfo = {
                ...versionInfo,
                status: 'error',
                message: '同步超时，请重试'
              };
              
              await env.SYNC_STATUS.put(repoKey, JSON.stringify(updatedInfo));
            }
          }
          
          // 检查文件路径是否为空，但状态为已同步
          if (versionInfo.status === 'synced' && 
              (!versionInfo.filePaths || versionInfo.filePaths.length === 0)) {
            
            // 检查R2中是否存在文件
            let hasFiles = false;
            if (env.R2_BUCKET) {
              try {
                // 构建基本的路径前缀
                const prefix = path && path.startsWith("/") ? path.substring(1) : path;
                const basePath = prefix ? `${prefix}/` : "";
                const objects = await env.R2_BUCKET.list({ prefix: basePath });
                
                // 过滤这个仓库的文件
                if (objects && objects.objects && objects.objects.length > 0) {
                  const repoFiles = objects.objects.filter(obj => isFileFromRepo(obj.key, repo));
                  if (repoFiles.length > 0) {
                    hasFiles = true;
                    
                    // 更新文件路径记录
                    const updatedVersionInfo = { ...versionInfo };
                    updatedVersionInfo.filePaths = repoFiles.map(obj => obj.key);
                    await env.SYNC_STATUS.put(repoKey, JSON.stringify(updatedVersionInfo));
                    console.log(`已从R2恢复 ${repo} 的文件路径记录: ${updatedVersionInfo.filePaths.length}个文件`);
                  }
                }
              } catch (error) {
                console.error(`检查R2中文件时出错: ${error.message}`);
              }
            }
            
            // 如果没有找到文件，更新状态为待同步
            if (!hasFiles) {
              console.log(`${repo} 的状态为已同步，但未找到文件记录，标记为待同步`);
              
              const updatedInfo = {
                ...versionInfo,
                status: 'pending',
                message: '需要重新同步'
              };
              
              await env.SYNC_STATUS.put(repoKey, JSON.stringify(updatedInfo));
            }
          }
        }
      } catch (error) {
        console.error(`检查 ${repo} 路径变更时出错:`, error);
      }
    }
  }
  
  // 如果还没有仓库信息，尝试获取配置的仓库并从KV中加载其状态
  if (worker.syncedRepos.length === 0 || worker.syncedRepos.some(repo => repo.status === "pending")) {
    try {
      if (repoConfigs.length > 0) {
        // 从KV加载存储的版本信息
        const updatedRepos = [];
        
        for (const config of repoConfigs) {
          try {
            const repoKey = `repo:${config.repo}`;
            const versionInfoJson = await env.SYNC_STATUS.get(repoKey);
            
            if (versionInfoJson) {
              // 已同步过，加载状态
              const versionInfo = JSON.parse(versionInfoJson);
              
              // 处理状态映射，确保前端显示正确
              let status = versionInfo.status || "latest";
              let message = "";
              
              // 根据状态设置前端显示的消息
              if (status === "synced") {
                status = "latest"; // 在前端将synced映射为latest
                message = "当前已是最新版本";
              } else if (status === "error") {
                message = versionInfo.error || "同步失败";
              } else if (status === "syncing") {
                message = "正在同步中...";
              } else if (status === "pending") {
                message = "等待同步";
              }
              
              // 确保版本信息存在
              const version = versionInfo.version || "未知";
              
              updatedRepos.push({
                repo: config.repo,
                version: version,
                date: versionInfo.lastUpdate || "-",
                path: config.path,
                status: status,
                message: message
              });
            } else {
              // 未同步过，创建临时记录
              updatedRepos.push({
                repo: config.repo,
                version: "未同步",
                date: "-",
                path: config.path,
                status: "pending",
                message: "尚未同步，点击\"同步仓库\"按钮开始同步"
              });
            }
          } catch (error) {
            console.error(`加载仓库 ${config.repo} 状态信息失败:`, error);
            // 如果读取失败，添加一个显示错误的条目
            updatedRepos.push({
              repo: config.repo,
              version: "未知",
              date: "-",
              path: config.path,
              status: "error",
              message: `加载状态失败: ${error.message}`
            });
          }
        }
        
        // 更新内存中的同步状态
        worker.syncedRepos = updatedRepos;
      } else {
        worker.infoMessage = "未检测到有效的仓库配置，请确认已添加 REPO_1、REPO_2 等环境变量";
      }
    } catch (error) {
      console.error("加载仓库状态时出错:", error);
      worker.errorMessage = `加载仓库状态时出错: ${error.message}`;
    }
  }
  
  // 生成并返回状态页面
  return await generateStatusPage(worker, lastCheckTime);
}

/**
 * 更新最后检查时间
 */
export function updateLastCheckTime() {
  lastCheckTime = Math.floor(Date.now() / 1000);
  return lastCheckTime;
}

/**
 * 获取最后检查时间
 */
export function getLastCheckTime() {
  return lastCheckTime;
} 