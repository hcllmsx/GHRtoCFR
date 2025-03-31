/**
 * GHRtoCFR - 从 GitHub Releases 同步文件到 Cloudflare R2
 */

// 存储上次检查时间的全局变量
let lastCheckTime = 0;

// 默认检查间隔（7天，单位：秒）
const DEFAULT_CHECK_INTERVAL = 604800;

// HTML 模板
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <title>GHRtoCFR - GitHub Releases to Cloudflare R2</title>
  <style>
    body {
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
    .action-bar {
      display: flex;
      justify-content: center;
      margin-bottom: 25px;
      gap: 15px;
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
    .sync-log {
      max-height: 300px;
      overflow-y: auto;
      background-color: #1a1a1a;
      color: #f8f8f8;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
      font-family: monospace;
      font-size: 0.9rem;
      white-space: pre-wrap;
      line-height: 1.4;
    }
    .sync-log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
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
    .sync-status {
      display: none;
      align-items: center;
      gap: 10px;
      background-color: #dbeafe;
      color: #1e40af;
      padding: 15px;
      border-radius: 8px;
      margin: 20px auto;
      max-width: 600px;
      text-align: center;
    }
    .spinner {
      border: 3px solid rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      border-top: 3px solid #2563eb;
      width: 20px;
      height: 20px;
      animation: spin 1s linear infinite;
      display: inline-block;
    }
    .sync-row-status {
      display: none;
      font-size: 0.85rem;
      margin-top: 5px;
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
    }
  </style>
</head>
<body>
  <h1>GitHub Releases to Cloudflare R2</h1>
  {{ERROR_MESSAGE}}
  {{INFO_MESSAGE}}
  
  <div class="action-bar">
    <button id="syncAllButton" class="btn" onclick="triggerSyncAll()">同步所有仓库</button>
  </div>
  
  <div id="syncStatus" class="sync-status">
    <div class="spinner"></div>
    <span>正在同步仓库，请稍候...</span>
  </div>
  
  <div id="syncLogContainer" style="display: none;">
    <div class="sync-log-header">
      <h3 class="sync-log-title">同步日志</h3>
      <div class="sync-log-controls">
        <button class="sync-log-clear" onclick="clearSyncLog()">清空日志</button>
      </div>
    </div>
    <div id="syncLog" class="sync-log"></div>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>仓库</th>
        <th>最新版本</th>
        <th>更新日期</th>
        <th>存储路径</th>
        <th>状态</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      {{TABLE_ROWS}}
    </tbody>
  </table>
  
  <div class="footer">
    <div class="last-check">最后检查时间: {{LAST_CHECK_TIME}}</div>
    <div class="api-info">{{API_RATE_LIMIT}}</div>
  </div>
  
  <script>
    function triggerSyncAll() {
      const syncAllButton = document.getElementById('syncAllButton');
      const syncStatus = document.getElementById('syncStatus');
      const syncLogContainer = document.getElementById('syncLogContainer');
      const syncLog = document.getElementById('syncLog');
      
      syncAllButton.disabled = true;
      syncStatus.style.display = 'flex';
      syncLogContainer.style.display = 'block';
      syncLog.innerHTML = '开始同步所有仓库...\\n';
      
      fetch('/sync')
        .then(function(response) {
          if (!response.body) {
            throw new Error('浏览器不支持流式响应');
          }
          
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          
          function readStream() {
            reader.read().then(function(result) {
              if (result.done) {
                syncLog.innerHTML += '\\n同步已完成，3秒后自动刷新页面...\\n';
                setTimeout(function() { window.location.reload(); }, 3000);
                return;
              }
              
              const text = decoder.decode(result.value, { stream: true });
              syncLog.innerHTML += text;
              syncLog.scrollTop = syncLog.scrollHeight;
              
              if (text.includes('所有同步任务完成') || 
                  text.includes('同步过程中出错') || 
                  text.includes('同步失败')) {
                syncLog.innerHTML += '\\n同步已完成，3秒后自动刷新页面...\\n';
                setTimeout(function() { window.location.reload(); }, 3000);
                return;
              }
              
              readStream();
            }).catch(function(error) {
              syncLog.innerHTML += '\\n日志流读取错误: ' + error.message + '\\n请刷新页面查看最新状态...\\n';
              setTimeout(function() { window.location.reload(); }, 5000);
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
      const syncRowStatus = document.getElementById('sync-status-' + repoId);
      const syncLogContainer = document.getElementById('syncLogContainer');
      const syncLog = document.getElementById('syncLog');
      
      syncButton.disabled = true;
      syncRowStatus.style.display = 'block';
      syncLogContainer.style.display = 'block';
      syncLog.innerHTML = '开始同步仓库: ' + repo + '...\\n';
      
      fetch('/sync?repo=' + encodeURIComponent(repo))
        .then(function(response) {
          if (!response.body) {
            throw new Error('浏览器不支持流式响应');
          }
          
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          
          function readStream() {
            reader.read().then(function(result) {
              if (result.done) {
                syncLog.innerHTML += '\\n同步已完成，3秒后自动刷新页面...\\n';
                setTimeout(function() { window.location.reload(); }, 3000);
                return;
              }
              
              const text = decoder.decode(result.value, { stream: true });
              syncLog.innerHTML += text;
              syncLog.scrollTop = syncLog.scrollHeight;
              
              if (text.includes('同步完成') || 
                  text.includes('同步过程中出错') || 
                  text.includes('同步失败')) {
                syncLog.innerHTML += '\\n同步已完成，3秒后自动刷新页面...\\n';
                setTimeout(function() { window.location.reload(); }, 3000);
                return;
              }
              
              readStream();
            }).catch(function(error) {
              syncLog.innerHTML += '\\n日志流读取错误: ' + error.message + '\\n请刷新页面查看最新状态...\\n';
              setTimeout(function() { window.location.reload(); }, 5000);
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
    
    let pageIdleTime = 0;
    const maxIdleTime = 60;
    
    setInterval(function() {
      if (document.getElementById('syncStatus').style.display === 'flex') {
        pageIdleTime++;
        
        if (pageIdleTime >= maxIdleTime) {
          console.log('同步状态长时间未更新，自动刷新页面');
          window.location.reload();
        }
      } else {
        pageIdleTime = 0;
      }
    }, 1000);
  </script>
</body>
</html>`;

/**
 * 处理 Workers 的所有请求
 */
export default {
  // 存储已经同步的仓库信息
  syncedRepos: [],
  
  // 存储 API 速率限制信息
  apiRateLimit: null,
  
  // 存储错误信息
  errorMessage: null,
  
  // 存储信息消息
  infoMessage: null,
  
  // 是否正在进行同步
  isSyncing: false,

  /**
   * 处理 HTTP 请求
   */
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      
      // 处理 favicon.svg 请求
      if (pathname === "/favicon.svg") {
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
      
      // 处理同步日志流
      if (pathname === "/api/sync-logs-stream") {
        // 创建一个流式响应
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        
        // 获取可能的仓库参数
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
      
      // 处理同步日志API
      if (pathname === "/api/sync-logs") {
        // 返回一个简单的确认响应
        return new Response("同步日志服务就绪", { status: 200 });
      }
      
      // 添加一个变量来跟踪同步开始时间，用于超时处理
      let syncStartTime = null;
      
      // 处理同步API请求
      if (pathname === "/sync") {
        // 检查R2绑定
        if (!env.R2_BUCKET) {
          return new Response("未配置R2存储桶", { status: 500 });
        }
        
        // 处理同步任务
        this.isSyncing = true; // 设置同步状态
        syncStartTime = Date.now(); // 记录开始时间
        
        // 创建一个Promise，如果同步超过10分钟，则自动超时
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('同步任务超时（10分钟限制）'));
          }, 10 * 60 * 1000); // 10分钟超时
        });
        
        // 运行同步任务或返回超时错误
        try {
          // 创建同步任务Promise和超时Promise的竞争
          const syncPromise = this.handleSync(request, env, ctx);
          return await Promise.race([syncPromise, timeoutPromise]);
        } catch (error) {
          console.error("同步过程出错:", error);
          
          // 更新同步状态为错误
          const repoConfigs = this.getConfiguredRepos(env);
          for (const config of repoConfigs) {
            await this.saveVersionInfo(env, config.repo, {
              repo: config.repo,
              status: 'error',
              error: error.message,
              lastUpdate: new Date().toISOString(),
              path: config.path
            });
          }
          
          return new Response(`同步失败: ${error.message}`, { status: 500 });
        } finally {
          this.isSyncing = false; // 无论如何都重置同步状态
        }
      }
      
      // 如果请求路径是 /api/status，返回 JSON 格式的状态信息
      if (pathname === "/api/status") {
        return new Response(JSON.stringify({
          repos: this.syncedRepos,
          lastCheck: lastCheckTime ? new Date(lastCheckTime * 1000).toISOString() : null,
          apiRateLimit: this.apiRateLimit,
          error: this.errorMessage,
          info: this.infoMessage,
          isSyncing: this.isSyncing
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      }
      
      // 如果请求路径是 /api/github-rate，获取 GitHub API 速率限制信息
      if (pathname === "/api/github-rate") {
        await this.fetchGitHubRateLimit(env);
        return new Response(JSON.stringify({
          apiRateLimit: this.apiRateLimit
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      }
      
      // 默认情况下，返回主页面
      return this.handleHome(env);
    } catch (error) {
      console.error("处理请求时出错:", error);
      return new Response("服务器错误", { status: 500 });
    }
  },

  /**
   * 处理定时任务触发
   */
  async scheduled(event, env, ctx) {
    try {
      // 检查 R2 绑定
      if (!env.R2_BUCKET) {
        console.error("R2 存储桶未绑定");
        return;
      }
      
      // 检查是否已经有正在进行的同步任务
      if (this.isSyncing) {
        console.log("已有同步任务正在进行，跳过本次定时触发");
        return;
      }
      
      const now = Math.floor(Date.now() / 1000);
      const checkInterval = parseInt(env.CHECK_INTERVAL || DEFAULT_CHECK_INTERVAL);
      
      // 检查是否到达检查间隔
      if (now - lastCheckTime >= checkInterval) {
        this.isSyncing = true;
        try {
          await this.handleSync(env);
          lastCheckTime = now;
        } finally {
          this.isSyncing = false;
        }
      }
    } catch (error) {
      console.error("定时任务执行出错:", error);
      this.isSyncing = false;
    }
  },

  /**
   * 处理同步任务
   */
  async handleSync(request, env, ctx) {
    if (!env.R2_BUCKET) {
      return new Response("未配置R2存储桶", { status: 500 });
    }

    let infoMessage = "";
    const repoConfigs = this.getConfiguredRepos(env);
    
    if (!repoConfigs || repoConfigs.length === 0) {
      infoMessage = "未配置任何仓库";
      return new Response(infoMessage, { status: 400 });
    }

    // 如果请求中指定了仓库，只同步该仓库
    const url = new URL(request.url);
    const requestedRepo = url.searchParams.get('repo');
    
    const syncTargets = requestedRepo 
      ? repoConfigs.filter(config => config.repo === requestedRepo)
      : repoConfigs;
    
    if (requestedRepo && syncTargets.length === 0) {
      return new Response(`未找到指定的仓库配置: ${requestedRepo}`, { status: 404 });
    }

    // 设置流式响应
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    
    ctx.waitUntil(
      (async () => {
        try {
          for (const config of syncTargets) {
            const { repo, path } = config;
            await writer.write(encoder.encode(`开始同步 ${repo}...\n`));
            
            try {
              // 获取最新版本信息
              const releaseInfo = await this.fetchLatestRelease(repo, env);
              if (!releaseInfo) {
                await writer.write(encoder.encode(`无法获取 ${repo} 的发布信息\n`));
                continue;
              }
              
              const { tag_name, published_at, assets } = releaseInfo;
              await writer.write(encoder.encode(`${repo} 的最新版本: ${tag_name}, 发布于: ${published_at}\n`));
              
              // 首先检查是否需要更新
              const needUpdate = await this.checkNeedUpdate(env, repo, tag_name, path);
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
                await this.saveVersionInfo(env, repo, syncedRepo);
                continue;
              }
              
              // 同步之前先清空旧的filePaths，防止数据混淆
              await this.clearFilePathsList(env, repo);
              
              // 只有需要更新时才删除旧文件
              await writer.write(encoder.encode(`正在删除 ${repo} 的旧文件...\n`));
              await this.deleteRepoFiles(env, repo);
              
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
              
              // 跟踪平台文件上传情况
              const platformCounts = {
                Windows: 0,
                macOS: 0,
                Linux: 0,
                Android: 0,
                Other: 0
              };
              
              // 保存已确认属于此仓库的文件路径
              const confirmedFilePaths = [];
              
              let uploadedCount = 0;
              for (let i = 0; i < validAssets.length; i++) {
                const asset = validAssets[i];
                await writer.write(encoder.encode(`处理资源 (${i+1}/${validAssets.length}): ${asset.name}\n`));
                
                try {
                  const platform = this.determineOSType(asset.name);
                  const uploadedPath = await this.downloadAndUploadAsset(asset, repo, path, platform, env);
                  if (uploadedPath) {  // 只有实际上传成功的文件才计数
                    platformCounts[platform]++;
                    uploadedCount++;
                    confirmedFilePaths.push(uploadedPath);
                    await writer.write(encoder.encode(`成功上传: ${asset.name} → ${platform}\n`));
                  } else {
                    await writer.write(encoder.encode(`跳过: ${asset.name}，不属于当前仓库\n`));
                  }
                } catch (assetError) {
                  await writer.write(encoder.encode(`资源处理失败: ${asset.name} - ${assetError.message}\n`));
                }
              }
              
              // 保存版本信息到KV
              const syncedRepo = {
                repo,
                version: tag_name,
                lastUpdate: new Date().toISOString(),
                status: 'synced',
                path,
                filePaths: confirmedFilePaths // 使用确认的文件路径列表
              };
              await this.saveVersionInfo(env, repo, syncedRepo);
              
              const platformSummary = Object.entries(platformCounts)
                .filter(([_, count]) => count > 0)
                .map(([platform, count]) => `${platform}: ${count}个文件`)
                .join(', ');
              
              await writer.write(encoder.encode(`${repo} 同步完成，版本 ${tag_name}，共上传 ${uploadedCount} 个文件 (${platformSummary})\n`));
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
              await this.saveVersionInfo(env, repo, errorRepo);
            }
          }
          
          await writer.write(encoder.encode("所有同步任务完成\n"));
        } catch (error) {
          await writer.write(encoder.encode(`同步过程中出错: ${error.message}\n`));
        } finally {
          await writer.close();
        }
      })()
    );

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  },

  /**
   * 清空仓库的文件路径列表
   */
  async clearFilePathsList(env, repo) {
    if (!env.SYNC_STATUS) {
      console.error('KV存储未绑定，无法清空文件路径列表');
      return;
    }
    
    try {
      const repoKey = `repo:${repo}`;
      const versionInfoStr = await env.SYNC_STATUS.get(repoKey);
      
      if (versionInfoStr) {
        const versionInfo = JSON.parse(versionInfoStr);
        
        // 清空文件路径列表，但保留其他信息
        versionInfo.filePaths = [];
        versionInfo.status = 'syncing'; // 更新状态为正在同步
        versionInfo.lastUpdate = new Date().toISOString();
        
        await env.SYNC_STATUS.put(repoKey, JSON.stringify(versionInfo));
        console.log(`已清空 ${repo} 的文件路径列表`);
      }
    } catch (error) {
      console.error(`清空文件路径列表失败: ${error.message}`);
    }
  },

  /**
   * 从环境变量中获取仓库配置
   */
  getRepoConfigs(env) {
    const configs = [];
    
    try {
      // 遍历所有环境变量，查找仓库配置
      for (const key in env) {
        if (key.startsWith("REPO_")) {
          const value = env[key];
          
          // 解析配置格式: 用户名/仓库名:存储路径
          const parts = value.split(":");
          const repo = parts[0];
          const path = parts.length > 1 ? parts.slice(1).join(":") : "";
          
          if (repo) {
            configs.push({ repo, path });
          }
        }
      }
    } catch (error) {
      console.error("获取仓库配置出错:", error);
    }
    
    return configs;
  },

  /**
   * 获取仓库的最新 Release 信息
   */
  async fetchLatestRelease(repo, env) {
    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    
    const headers = {
      "User-Agent": "GHRtoCFR-Worker",
      "Accept": "application/vnd.github.v3+json"
    };
    
    // 如果配置了 GitHub Token，添加到请求头中
    if (env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${env.GITHUB_TOKEN}`;
    }
    
    console.log(`正在获取仓库 ${repo} 的最新发布信息...`);
    const response = await fetch(apiUrl, { headers });
    
    // 保存 API 速率限制信息
    this.saveRateLimitInfo(response.headers);
    
    if (!response.ok) {
      throw new Error(`获取 GitHub Release 失败: ${response.status} ${response.statusText}`);
    }
    
    const releaseInfo = await response.json();
    console.log(`成功获取仓库 ${repo} 的最新发布信息，版本: ${releaseInfo.tag_name}`);
    
    // 为每个资源添加仓库标识，防止混淆
    if (releaseInfo.assets && Array.isArray(releaseInfo.assets)) {
      releaseInfo.assets.forEach(asset => {
        asset.sourceRepo = repo; // 添加源仓库信息到资源对象
      });
    }
    
    return releaseInfo;
  },

  /**
   * 检查是否需要更新
   */
  async checkNeedUpdate(env, repo, currentVersion, path) {
    try {
      // 首先检查KV中是否有版本信息
      if (env.SYNC_STATUS) {
        const key = `repo:${repo}`;
        const storedVersionInfoStr = await env.SYNC_STATUS.get(key);
        
        if (storedVersionInfoStr) {
          const storedVersionInfo = JSON.parse(storedVersionInfoStr);
          console.log(`KV中 ${repo} 的版本信息: ${storedVersionInfoStr}`);
          
          // 检查存储路径是否发生变化
          if (storedVersionInfo.path !== path) {
            console.log(`${repo} 的存储路径已从 ${storedVersionInfo.path} 变更为 ${path}，需要重新同步`);
            return true;
          }
          
          // 如果存储路径没变，检查文件是否存在
          if (storedVersionInfo.filePaths && 
              Array.isArray(storedVersionInfo.filePaths) && 
              storedVersionInfo.filePaths.length === 0 && 
              storedVersionInfo.status === 'synced') {
            console.log(`${repo} 的文件路径记录为空，可能未正确同步，需要重新同步`);
            return true;
          }
          
          // 如果KV中已有版本信息，直接比较版本
          if (storedVersionInfo.version === currentVersion) {
            // 额外检查：如果文件路径记录为空，但状态为synced，可能需要重新同步
            if (storedVersionInfo.filePaths && 
                Array.isArray(storedVersionInfo.filePaths) && 
                storedVersionInfo.filePaths.length === 0 && 
                storedVersionInfo.status === 'synced') {
              // 检查R2中是否有实际文件
              let hasFiles = false;
              if (env.R2_BUCKET) {
                try {
                  // 构建基本的路径前缀
                  const prefix = path && path.startsWith("/") ? path.substring(1) : path;
                  const basePath = prefix ? `${prefix}/` : "";
                  const objects = await env.R2_BUCKET.list({ prefix: basePath });
                  // 如果在R2中找不到对应路径的文件，需要重新同步
                  if (!objects || !objects.objects || objects.objects.length === 0) {
                    console.log(`${repo} 在R2中未找到文件，需要重新同步`);
                    return true;
                  }
                  
                  // 过滤这个仓库的文件
                  const repoFiles = objects.objects.filter(obj => this.isFileFromRepo(obj.key, repo));
                  if (repoFiles.length === 0) {
                    console.log(`${repo} 在R2中未找到与该仓库相关的文件，需要重新同步`);
                    return true;
                  }
                  
                  hasFiles = true;
                  // 更新文件路径记录
                  const updatedVersionInfo = { ...storedVersionInfo };
                  updatedVersionInfo.filePaths = repoFiles.map(obj => obj.key);
                  await env.SYNC_STATUS.put(key, JSON.stringify(updatedVersionInfo));
                  console.log(`已从R2恢复 ${repo} 的文件路径记录: ${updatedVersionInfo.filePaths.length}个文件`);
                } catch (error) {
                  console.error(`检查R2中文件时出错: ${error.message}`);
                }
              }
              
              if (!hasFiles) {
                console.log(`${repo} 版本相同但文件记录为空，需要重新同步`);
                return true;
              }
            }
            
            console.log(`${repo} 的版本 ${currentVersion} 已经是最新的，无需更新`);
            return false;
          }
          
          console.log(`${repo} 需要从版本 ${storedVersionInfo.version} 更新到 ${currentVersion}`);
          return true;
        }
        
        console.log(`KV中未找到 ${repo} 的版本信息，将进行首次同步`);
        return true; // 首次同步
      }
      
      // 如果KV未绑定，尝试从R2中获取版本信息（兼容旧版本）
      if (env.R2_BUCKET) {
        try {
          const versionKey = this.getVersionKey(repo, path);
          const versionObj = await env.R2_BUCKET.get(versionKey);
          
          if (versionObj) {
            const versionInfo = await versionObj.json();
            console.log(`R2中 ${repo} 的版本信息: ${JSON.stringify(versionInfo)}`);
            
            if (versionInfo.version === currentVersion) {
              console.log(`${repo} 的版本 ${currentVersion} 已经是最新的，无需更新`);
              return false;
            }
            
            console.log(`${repo} 需要从版本 ${versionInfo.version} 更新到 ${currentVersion}`);
            return true;
          }
        } catch (error) {
          console.error(`从R2获取版本信息失败: ${error.message}`);
        }
      }
      
      // 如果都没有找到版本信息，则进行首次同步
      console.log(`未找到 ${repo} 的版本信息，将进行首次同步`);
      return true;
    } catch (error) {
      console.error(`检查更新失败: ${error.message}`);
      return true; // 出错时默认执行更新
    }
  },

  /**
   * 获取版本信息的键值
   */
  getVersionKey(repo, path) {
    const repoId = repo.replace(/\//g, "-");
    const prefix = path && path.startsWith("/") ? path.substring(1) : path;
    const basePath = prefix ? `${prefix}/` : "";
    return `${basePath}${repoId}-version.json`;
  },

  /**
   * 删除旧文件
   */
  async deleteOldFiles(repo, path, env) {
    try {
      const prefix = path.startsWith("/") ? path.slice(1) : path;
      
      // 列出存储桶中的文件
      const options = prefix ? { prefix: `${prefix}/` } : undefined;
      const listed = await env.R2_BUCKET.list(options);
      
      // 删除所有匹配的文件
      const promises = [];
      for (const object of listed.objects) {
        // 跳过版本信息文件
        if (object.key.endsWith(`${repo.replace(/\//g, "-")}-version.json`)) {
          continue;
        }
        
        // 如果文件在指定路径下，则删除
        if (!prefix || object.key.startsWith(`${prefix}/`)) {
          promises.push(env.R2_BUCKET.delete(object.key));
        }
      }
      
      await Promise.all(promises);
      console.log(`已删除旧文件`);
    } catch (error) {
      console.error("删除旧文件时出错:", error);
      throw new Error(`删除旧文件时出错: ${error.message}`);
    }
  },

  /**
   * 下载并上传单个资源文件
   */
  async downloadAndUploadAsset(asset, repo, path, platform, env) {
    try {
      // 确保资源确实来自当前仓库
      if (asset.sourceRepo && asset.sourceRepo !== repo) {
        console.warn(`跳过不属于当前仓库的资源: ${asset.name}，它属于 ${asset.sourceRepo}`);
        return null;
      }
      
      console.log(`开始下载资源 ${asset.name} 来自仓库 ${repo}...`);
      const response = await fetch(asset.browser_download_url);
      if (!response.ok) {
        throw new Error(`下载文件失败: ${response.status} ${response.statusText}`);
      }
      
      // 构建存储路径
      let storagePath = path.startsWith("/") ? path.slice(1) : path;
      if (storagePath && !storagePath.endsWith("/")) {
        storagePath += "/";
      }
      
      // 按平台分类
      if (platform !== "Other") {
        storagePath += `${platform}/`;
      }
      
      // 添加仓库标识到文件名，防止不同仓库文件名相同导致覆盖
      const repoName = repo.split('/')[1];
      let fileName = asset.name;
      
      // 只有当文件名中不包含仓库名时才添加前缀
      if (!fileName.includes(repoName)) {
        // 获取文件扩展名
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex > 0) {
          // 在文件名和扩展名之间插入仓库标识
          const baseName = fileName.substring(0, lastDotIndex);
          const extension = fileName.substring(lastDotIndex);
          fileName = `${baseName}_${repoName}${extension}`;
        } else {
          // 没有扩展名的情况
          fileName = `${fileName}_${repoName}`;
        }
      }
      
      // 更新存储路径使用修改后的文件名
      storagePath += fileName;
      
      console.log(`上传资源 ${asset.name} 到路径 ${storagePath}`);
      // 上传到 R2 存储桶
      await env.R2_BUCKET.put(storagePath, response.body);
      console.log(`已上传文件 ${asset.name} 到 ${storagePath}`);
      
      // 记录上传的文件路径，方便后续删除时识别
      if (env.SYNC_STATUS) {
        const repoKey = `repo:${repo}`;
        try {
          const versionInfoStr = await env.SYNC_STATUS.get(repoKey);
          if (versionInfoStr) {
            const versionInfo = JSON.parse(versionInfoStr);
            
            // 确保filePaths是一个数组
            if (!versionInfo.filePaths) {
              versionInfo.filePaths = [];
            } else if (!Array.isArray(versionInfo.filePaths)) {
              versionInfo.filePaths = [];
            }
            
            // 对比文件名，确保只添加属于当前仓库的文件
            const uploadedFileName = storagePath.split('/').pop();
            const repoBaseName = repo.split('/')[1].toLowerCase();
            
            // 额外验证确保文件确实属于当前仓库
            if (this.isFileFromRepo(storagePath, repo)) {
              // 避免重复添加同一路径
              if (!versionInfo.filePaths.includes(storagePath)) {
                versionInfo.filePaths.push(storagePath);
                await env.SYNC_STATUS.put(repoKey, JSON.stringify(versionInfo));
                console.log(`已将 ${storagePath} 添加到 ${repo} 的文件路径记录中，现有 ${versionInfo.filePaths.length} 个文件`);
              }
            } else {
              console.warn(`跳过添加可能不属于仓库 ${repo} 的文件路径: ${storagePath}`);
            }
          } else {
            // 如果KV中没有信息，创建一个初始记录
            const initialInfo = {
              repo,
              status: 'syncing',
              path,
              filePaths: [storagePath]
            };
            await env.SYNC_STATUS.put(repoKey, JSON.stringify(initialInfo));
            console.log(`为 ${repo} 创建初始文件路径记录: ${storagePath}`);
          }
        } catch (err) {
          console.error(`更新文件路径记录失败: ${err.message}`);
          
          // 如果处理出错，尝试创建新的记录
          try {
            const fallbackInfo = {
              repo,
              status: 'syncing',
              path,
              filePaths: [storagePath]
            };
            await env.SYNC_STATUS.put(repoKey, JSON.stringify(fallbackInfo));
            console.log(`为 ${repo} 创建备用文件路径记录: ${storagePath}`);
          } catch (fallbackErr) {
            console.error(`创建备用文件路径记录也失败: ${fallbackErr.message}`);
          }
        }
      }
      
      return storagePath;
    } catch (error) {
      console.error(`下载上传资源文件失败: ${asset.name}`, error);
      throw error;
    }
  },

  /**
   * 下载并上传资源文件
   */
  async downloadAndUploadAssets(repo, assets, path, env) {
    try {
      // 过滤出有效的资源文件（排除源代码、校验文件等）
      const validAssets = assets.filter(asset => {
        return !asset.name.includes("Source code") &&
               !asset.name.endsWith(".sha256") &&
               !asset.name.endsWith(".asc");
      });
      
      if (validAssets.length === 0) {
        console.warn("未找到有效资源文件");
        return;
      }
      
      // 处理每个资源文件
      for (const asset of validAssets) {
        const platform = this.determineOSType(asset.name);
        await this.downloadAndUploadAsset(asset, repo, path, platform, env);
      }
    } catch (error) {
      console.error("下载上传资源文件时出错:", error);
      throw error;
    }
  },

  /**
   * 根据文件名确定操作系统类型
   */
  determineOSType(filename) {
    const lowerName = filename.toLowerCase();
    
    // 基于文件名和扩展名特征识别操作系统
    // Android 应用特征
    if (lowerName.includes("android") || 
        lowerName.endsWith(".apk") ||
        lowerName.includes("_android_") ||
        lowerName.includes("mobile")) {
      return "Android";
    }
    
    // Windows 应用特征
    if (lowerName.includes("windows") || 
        lowerName.includes("win") || 
        lowerName.endsWith(".exe") || 
        lowerName.endsWith(".msi") || 
        lowerName.includes("win64") || 
        lowerName.includes("win32") ||
        lowerName.includes("desktop")) {
      return "Windows";
    }
    
    // macOS 应用特征
    if (lowerName.includes("macos") || 
        lowerName.includes("darwin") || 
        lowerName.includes("mac") || 
        lowerName.endsWith(".dmg") || 
        lowerName.endsWith(".pkg")) {
      return "macOS";
    }
    
    // Linux 应用特征
    if (lowerName.includes("linux") || 
        lowerName.endsWith(".deb") || 
        lowerName.endsWith(".rpm") || 
        lowerName.endsWith(".appimage") ||
        lowerName.includes("_linux_")) {
      return "Linux";
    }
    
    // 如果无法确定，返回 Other
    return "Other";
  },

  /**
   * 保存版本信息到KV存储
   */
  async saveVersionInfo(env, repo, versionInfo) {
    try {
      if (!env.SYNC_STATUS) {
        console.error('KV存储未绑定，无法保存版本信息');
        return;
      }
      
      // 如果没有设置文件路径属性，添加一个默认的空数组
      if (!versionInfo.filePaths && versionInfo.status === 'synced') {
        versionInfo.filePaths = [];
      }
      
      // 使用repo作为键前缀，确保不同仓库的数据互不干扰
      const key = `repo:${repo}`;
      await env.SYNC_STATUS.put(key, JSON.stringify(versionInfo));
      console.log(`已保存 ${repo} 的版本信息到KV: ${JSON.stringify(versionInfo)}`);
    } catch (error) {
      console.error(`保存版本信息到KV失败: ${error.message}`);
    }
  },

  /**
   * 保存 API 速率限制信息
   */
  saveRateLimitInfo(headers) {
    try {
      const remaining = headers.get('x-ratelimit-remaining');
      const limit = headers.get('x-ratelimit-limit');
      const reset = headers.get('x-ratelimit-reset');
      
      console.log("GitHub API Headers:", { remaining, limit, reset });
      
      if (remaining && limit && reset) {
        const resetTimestamp = parseInt(reset);
        console.log("Reset timestamp:", resetTimestamp, "Date:", new Date(resetTimestamp * 1000).toISOString());
        
        this.apiRateLimit = {
          remaining: parseInt(remaining),
          limit: parseInt(limit),
          reset: resetTimestamp
        };
      }
    } catch (error) {
      console.error("保存API速率限制信息时出错:", error);
    }
  },

  /**
   * 获取 GitHub API 速率限制信息
   */
  async fetchGitHubRateLimit(env) {
    const apiUrl = "https://api.github.com/rate_limit";
    
    const headers = {
      "User-Agent": "GHRtoCFR-Worker",
      "Accept": "application/vnd.github.v3+json"
    };
    
    // 如果配置了 GitHub Token，添加到请求头中
    if (env.GITHUB_TOKEN) {
      headers["Authorization"] = `token ${env.GITHUB_TOKEN}`;
    }
    
    try {
      const response = await fetch(apiUrl, { headers });
      this.saveRateLimitInfo(response.headers);
      
      if (response.ok) {
        const data = await response.json();
        console.log("GitHub API 速率限制信息:", data.rate);
      } else {
        console.error("获取 GitHub API 速率限制失败:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("获取 GitHub API 速率限制出错:", error);
    }
  },

  /**
   * 生成状态页面
   */
  async generateStatusPage() {
    let tableRows = "";
    
    if (this.syncedRepos.length === 0) {
      tableRows = `<tr><td colspan="6" style="text-align: center">暂无同步数据</td></tr>`;
    } else {
      for (const repo of this.syncedRepos) {
        let statusClass = "";
        let statusText = "";
        
        if (repo.status === "error") {
          statusClass = "status-error";
          statusText = "失败";
        } else if (repo.status === "updated") {
          statusClass = "status-success";
          statusText = "已更新";
        } else if (repo.status === "latest" || repo.status === "synced") {
          statusClass = "status-success";
          statusText = "最新";
        } else if (repo.status === "pending") {
          statusClass = "status-pending";
          statusText = "待同步";
        } else {
          // 未知状态，显示实际状态名称以便调试
          statusClass = "status-pending";
          statusText = repo.status || "未知";
        }
        
        // 处理日期显示
        let dateStr = repo.date;
        if (repo.date && repo.date !== "-") {
          try {
            // 使用中国时区格式化日期
            dateStr = new Date(repo.date).toLocaleString('zh-CN', {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
              timeZone: 'Asia/Shanghai'
            });
          } catch (e) {
            console.error("日期格式化错误:", e);
          }
        }
        
        const repoId = repo.repo.replace(/\//g, '-');
        
        tableRows += `
          <tr id="repo-${repoId}">
            <td>${repo.repo}</td>
            <td>${repo.version}</td>
            <td>${dateStr}</td>
            <td>${repo.path || "/"}</td>
            <td><span class="status ${statusClass}" title="${repo.message || ''}">${statusText}</span></td>
            <td>
              <button id="sync-${repoId}" class="btn btn-sm" onclick="triggerSyncRepo('${repo.repo}')">同步</button>
              <div id="sync-status-${repoId}" class="sync-row-status">
                <div class="spinner" style="width: 12px; height: 12px;"></div>
                <span>同步中...</span>
              </div>
            </td>
          </tr>
        `;
      }
    }
    
    // 添加错误信息
    let errorMessageHtml = '';
    if (this.errorMessage) {
      errorMessageHtml = `<div class="error-message">${this.errorMessage}</div>`;
    }
    
    // 添加信息消息
    let infoMessageHtml = '';
    if (this.infoMessage) {
      infoMessageHtml = `<div class="info-message">${this.infoMessage}</div>`;
    }
    
    // 添加 API 速率限制信息
    let apiRateLimitInfo = "GitHub API 速率: 未知";
    if (this.apiRateLimit) {
      try {
        // 确保重置时间是时间戳（秒）
        const resetTimestamp = this.apiRateLimit.reset;
        
        // 正确格式化重置时间（使用中国时区）
        const resetDate = new Date(resetTimestamp * 1000);
        const resetTime = resetDate.toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Shanghai'
        });
        
        apiRateLimitInfo = `GitHub API 速率: <span class="api-count">${this.apiRateLimit.remaining}/${this.apiRateLimit.limit}</span> 次 (<span class="api-reset">重置时间: ${resetTime}</span>)`;
      } catch (e) {
        console.error("API速率时间格式化错误:", e, this.apiRateLimit);
        apiRateLimitInfo = `GitHub API 速率: <span class="api-count">${this.apiRateLimit.remaining}/${this.apiRateLimit.limit}</span> 次 (重置时间: 格式化错误)`;
      }
    }
    
    // 处理最后检查时间
    let lastCheckTimeStr = "未检查";
    if (lastCheckTime) {
      try {
        // 使用中国时区格式化最后检查时间
        lastCheckTimeStr = new Date(lastCheckTime * 1000).toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Shanghai'
        });
      } catch (e) {
        console.error("最后检查时间格式化错误:", e);
        lastCheckTimeStr = new Date(lastCheckTime * 1000).toLocaleString();
      }
    }
    
    // 替换模板中的占位符
    let html = HTML_TEMPLATE
      .replace("{{ERROR_MESSAGE}}", errorMessageHtml)
      .replace("{{INFO_MESSAGE}}", infoMessageHtml)
      .replace("{{TABLE_ROWS}}", tableRows)
      .replace("{{LAST_CHECK_TIME}}", lastCheckTimeStr)
      .replace("{{API_RATE_LIMIT}}", apiRateLimitInfo);
    
    // 如果正在同步，添加额外的脚本使同步状态可见
    if (this.isSyncing) {
      html = html.replace('</script>', `
        document.addEventListener('DOMContentLoaded', function() {
          document.getElementById('syncAllButton').disabled = true;
          document.getElementById('syncStatus').style.display = 'flex';
          document.getElementById('syncLog').style.display = 'block';
        });
      </script>`);
    }
    
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  },

  /**
   * 向同步日志流发送消息
   */
  async sendLogMessage(message, env) {
    try {
      if (env.LOG_WRITER) {
        // 检查是否有仓库过滤
        if (env.LOG_REPO && !message.includes(env.LOG_REPO)) {
          // 如果指定了仓库过滤且消息与该仓库无关，则不发送
          return;
        }
        
        const encoder = new TextEncoder();
        const data = encoder.encode(`data: ${message}\n\n`);
        await env.LOG_WRITER.write(data);
      }
    } catch (error) {
      console.error("发送日志消息失败:", error);
    }
  },

  /**
   * 删除特定仓库的旧文件
   */
  async deleteRepoFiles(env, repo) {
    try {
      const bucket = env.R2_BUCKET;
      if (!bucket) {
        console.log(`删除文件失败: 未找到R2存储桶`);
        return;
      }

      console.log(`开始为仓库 ${repo} 清理旧文件...`);
      
      // 尝试从KV中获取该仓库的文件列表
      let recordedFilePaths = [];
      if (env.SYNC_STATUS) {
        const repoKey = `repo:${repo}`;
        try {
          const versionInfoStr = await env.SYNC_STATUS.get(repoKey);
          if (versionInfoStr) {
            const versionInfo = JSON.parse(versionInfoStr);
            recordedFilePaths = versionInfo.filePaths || [];
            console.log(`从KV中获取到 ${repo} 的 ${recordedFilePaths.length} 个文件记录`);
          }
        } catch (err) {
          console.error(`获取文件路径记录失败: ${err.message}`);
        }
      }

      // 获取存储路径，用于更精确的文件筛选
      const repoConfig = this.getRepoConfigs(env).find(config => config.repo === repo);
      const storagePath = repoConfig ? repoConfig.path : '';
      const pathPrefix = storagePath && storagePath.startsWith("/") ? storagePath.substring(1) : storagePath;
      const basePath = pathPrefix ? `${pathPrefix}/` : "";
      console.log(`仓库 ${repo} 的存储路径前缀: "${basePath}"`);
      
      // 先尝试只列出该仓库存储路径下的文件
      let objects;
      try {
        if (basePath) {
          objects = await bucket.list({ prefix: basePath });
          console.log(`在路径 "${basePath}" 下找到 ${objects.objects ? objects.objects.length : 0} 个文件`);
        } else {
          objects = await bucket.list();
          console.log(`在根目录下找到 ${objects.objects ? objects.objects.length : 0} 个文件`);
        }
      } catch (error) {
        console.error(`列出R2对象失败: ${error.message}`);
        return;
      }
      
      if (!objects || !objects.objects || objects.objects.length === 0) {
        console.log(`R2存储桶为空或未找到符合条件的文件`);
        return;
      }

      // 准备需要删除的文件列表
      const filesToDelete = [];
      const repoName = repo.split('/')[1]; // 提取仓库名称部分
      
      for (const object of objects.objects) {
        // 跳过不在当前仓库存储路径下的文件
        if (basePath && !object.key.startsWith(basePath)) {
          continue;
        }
        
        // 优先检查文件是否在已记录的路径列表中
        if (recordedFilePaths.includes(object.key)) {
          filesToDelete.push(object.key);
          console.log(`标记删除已记录的文件: ${object.key}`);
          continue;
        }
        
        // 如果不在记录中，使用更严格的规则判断
        const fileName = object.key.split('/').pop() || '';
        
        // 1. 检查文件名是否包含明确的仓库标识
        if (fileName.includes(`_${repoName}.`) || fileName.includes(`_${repoName}_`)) {
          filesToDelete.push(object.key);
          console.log(`标记删除含仓库标识的文件: ${object.key}`);
          continue;
        }
        
        // 2. 使用isFileFromRepo进行更全面的判断
        if (this.isFileFromRepo(object.key, repo)) {
          // 额外安全检查：确保不会删除其他仓库的文件
          let belongsToOtherRepo = false;
          
          // 获取所有配置的仓库
          const allRepos = this.getRepoConfigs(env);
          for (const otherConfig of allRepos) {
            if (otherConfig.repo !== repo && this.isFileFromRepo(object.key, otherConfig.repo)) {
              belongsToOtherRepo = true;
              console.log(`跳过可能属于仓库 ${otherConfig.repo} 的文件: ${object.key}`);
              break;
            }
          }
          
          if (!belongsToOtherRepo) {
            filesToDelete.push(object.key);
            console.log(`标记删除属于仓库 ${repo} 的文件: ${object.key}`);
          }
        }
      }
      
      // 执行删除操作
      let deletedCount = 0;
      for (const key of filesToDelete) {
        try {
          await bucket.delete(key);
          console.log(`已删除文件: ${key}`);
          deletedCount++;
        } catch (error) {
          console.error(`删除文件 ${key} 失败: ${error.message}`);
        }
      }
      
      // 更新KV中的文件路径记录
      if (env.SYNC_STATUS) {
        const repoKey = `repo:${repo}`;
        try {
          const versionInfoStr = await env.SYNC_STATUS.get(repoKey);
          if (versionInfoStr) {
            const versionInfo = JSON.parse(versionInfoStr);
            versionInfo.filePaths = []; // 清空文件列表
            await env.SYNC_STATUS.put(repoKey, JSON.stringify(versionInfo));
            console.log(`已清空仓库 ${repo} 的文件路径记录`);
          }
        } catch (err) {
          console.error(`清空文件路径记录失败: ${err.message}`);
        }
      }
      
      console.log(`总共删除了 ${deletedCount} 个属于仓库 ${repo} 的文件`);
    } catch (error) {
      console.error("删除旧文件时出错:", error);
      throw new Error(`删除旧文件时出错: ${error.message}`);
    }
  },
  
  /**
   * 检查文件是否属于特定仓库
   */
  isFileFromRepo(key, repo) {
    const repoName = repo.split('/')[1]; // 从repo格式 "owner/name" 中提取name部分
    const repoOwner = repo.split('/')[0]; // 提取owner部分
    
    // 文件名部分
    const fileName = key.split('/').pop();
    if (!fileName) return false;
    
    // 首先，如果文件路径中同时包含拥有者和仓库名，则非常可能属于该仓库
    if (key.includes(`${repoOwner}/${repoName}/`) || key.includes(`${repoOwner}-${repoName}`)) {
      return true;
    }
    
    // 如果文件名中包含了添加的仓库标识（例如filename_repoName.exe）
    if (fileName.includes(`_${repoName}.`) || fileName.includes(`_${repoName}_`)) {
      return true;
    }
    
    // 检查文件是否在仓库对应的平台文件夹中
    const platforms = ["Windows", "macOS", "Linux", "Android", "Other"];
    for (const platform of platforms) {
      // 如果文件路径包含平台和仓库名，则很可能属于该仓库
      if (key.includes(`${platform}/${repoName}`) || 
          key.includes(`${repoName}/${platform}`) || 
          key.includes(`${platform}/${repoName}-`)) {
        return true;
      }
    }
    
    // 检查文件名是否明确包含仓库名称
    if (key.includes(`/${repoName}/`) || key.includes(`/${repoName}-`) || key.includes(`-${repoName}.`)) {
      return true;
    }
    
    // 检查是否是仓库的版本信息文件
    const repoId = repo.replace(/\//g, "-");
    if (key.endsWith(`${repoId}-version.json`)) {
      return true;
    }
    
    // 基于文件扩展名和仓库名特征进行智能匹配
    
    // 检查仓库名是否包含某些关键词
    const isAndroidRepo = repoName.toLowerCase().includes('android') || 
                          repoName.toLowerCase().includes('mobile') || 
                          repoName.toLowerCase().includes('app');
                          
    const isWindowsRepo = repoName.toLowerCase().includes('win') || 
                         repoName.toLowerCase().includes('desktop') || 
                         repoName.toLowerCase().includes('pc');
    
    // 如果文件是Android APK，优先归属给Android相关仓库
    if ((key.endsWith('.apk') || key.includes('/Android/') || key.toLowerCase().includes('android')) && 
        isAndroidRepo) {
      return true;
    }
    
    // 如果文件是Windows可执行文件，优先归属给Windows相关仓库
    if ((key.endsWith('.exe') || key.endsWith('.msi') || key.includes('/Windows/') || key.toLowerCase().includes('win')) && 
        isWindowsRepo) {
      return true;
    }
    
    // 这里可以添加更多的文件类型判断规则
    // ...
    
    // 默认情况下，如果无法确定归属，不认为文件属于此仓库
    return false;
  },

  /**
   * 处理主页请求
   */
  async handleHome(env) {
    // 检查 R2 绑定
    const hasR2Binding = typeof env.R2_BUCKET !== 'undefined';
    if (!hasR2Binding) {
      this.errorMessage = "注意: R2 存储桶未绑定，请在 Workers 设置中绑定 R2_BUCKET。当前仅可查看状态，无法执行同步操作。";
    } else {
      // 清除任何之前的错误
      this.errorMessage = null;
    }
    
    // 如果还没有 API 速率限制信息，先获取一次
    if (!this.apiRateLimit) {
      await this.fetchGitHubRateLimit(env);
    }
    
    // 获取仓库配置
    const repoConfigs = this.getRepoConfigs(env);
    
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
                    const repoFiles = objects.objects.filter(obj => this.isFileFromRepo(obj.key, repo));
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
    if (this.syncedRepos.length === 0 || this.syncedRepos.some(repo => repo.status === "pending")) {
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
          this.syncedRepos = updatedRepos;
        } else {
          this.infoMessage = "未检测到有效的仓库配置，请确认已添加 REPO_1、REPO_2 等环境变量";
        }
      } catch (error) {
        console.error("加载仓库状态时出错:", error);
        this.errorMessage = `加载仓库状态时出错: ${error.message}`;
      }
    }
    
    // 生成并返回状态页面
    return this.generateStatusPage();
  },

  /**
   * 获取配置的仓库列表
   */
  getConfiguredRepos(env) {
    return this.getRepoConfigs(env);
  }
}; 