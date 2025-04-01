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
  // 使用项目中的SVG文件作为favicon
  const svgContent = "<?xml version=\"1.0\" standalone=\"no\"?><!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\"><svg t=\"1743434195944\" class=\"icon\" viewBox=\"0 0 1024 1024\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" p-id=\"1283\" width=\"256\" height=\"256\" xmlns:xlink=\"http://www.w3.org/1999/xlink\"><path d=\"M512 512m-512 0a512 512 0 1 0 1024 0 512 512 0 1 0-1024 0Z\" fill=\"#FFFFFF\" p-id=\"1284\"></path><path d=\"M512 0a512 512 0 0 0 0 1024 512 512 0 0 0 0-1024z m-200.874667 867.669333l32.597334-71.168A324.181333 324.181333 0 0 1 188.757333 597.333333v-0.170666a324.949333 324.949333 0 0 1 229.888-397.909334c5.205333-1.365333 10.581333-2.645333 15.872-3.754666l40.362667 84.309333a235.178667 235.178667 0 0 0-93.610667 435.029333l37.461334-81.834666 88.405333 182.613333-196.010667 52.053333z m505.344-218.538666a324.266667 324.266667 0 0 1-211.285333 177.92c-3.754667 1.024-7.594667 1.877333-11.434667 2.816l-40.448-83.712a235.093333 235.093333 0 0 0 90.794667-433.408l-36.181333 78.08-87.722667-182.954667 196.266667-51.456-34.474667 74.581333a324.437333 324.437333 0 0 1 134.485333 418.133334z\" fill=\"#09BB07\" p-id=\"1285\"></path></svg>";
  
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
  // 直接返回JS内容，不使用模板字符串
  const scriptContent = 
"function triggerSyncAll() {\n\
  const syncAllButton = document.getElementById('syncAllButton');\n\
  const syncLog = document.getElementById('syncLog');\n\
  \n\
  syncAllButton.disabled = true;\n\
  syncLog.innerHTML += '开始同步所有仓库...\\n';\n\
  \n\
  fetch('/sync')\n\
    .then(function(response) {\n\
      if (!response.body) {\n\
        throw new Error('浏览器不支持流式响应');\n\
      }\n\
      \n\
      const reader = response.body.getReader();\n\
      const decoder = new TextDecoder('utf-8');\n\
      \n\
      // 添加变量跟踪同步状态\n\
      let syncComplete = false;\n\
      let allReposComplete = false;\n\
      \n\
      function readStream() {\n\
        reader.read().then(function(result) {\n\
          if (result.done) {\n\
            if (!syncComplete) {\n\
              syncLog.innerHTML += '\\n读取同步日志流结束，但未收到完成信号。5秒后自动刷新仓库状态...\\n';\n\
              setTimeout(function() { refreshStatus(); }, 5000);\n\
            }\n\
            return;\n\
          }\n\
          \n\
          const text = decoder.decode(result.value, { stream: true });\n\
          syncLog.innerHTML += text;\n\
          syncLog.scrollTop = syncLog.scrollHeight;\n\
          \n\
          // 检查是否包含明确的完成信号\n\
          if (text.includes('所有同步任务完成')) {\n\
            syncComplete = true;\n\
            allReposComplete = true;\n\
            syncLog.innerHTML += '\\n所有仓库同步完成！3秒后自动刷新仓库状态...\\n';\n\
            setTimeout(function() { refreshStatus(); }, 3000);\n\
            return;\n\
          }\n\
          \n\
          // 检查是否有错误信号\n\
          if (text.includes('同步过程中出错')) {\n\
            syncComplete = true;\n\
            syncLog.innerHTML += '\\n同步过程中出错。5秒后自动刷新仓库状态...\\n';\n\
            setTimeout(function() { refreshStatus(); }, 5000);\n\
            return;\n\
          }\n\
          \n\
          // 不要过早地结束日志读取，继续读取流\n\
          readStream();\n\
        }).catch(function(error) {\n\
          syncLog.innerHTML += '\\n日志流读取错误: ' + error.message + '\\n请手动刷新页面查看最新状态...\\n';\n\
          setTimeout(function() { refreshStatus(); }, 5000);\n\
        });\n\
      }\n\
      \n\
      readStream();\n\
    })\n\
    .catch(function(error) {\n\
      syncLog.innerHTML += '\\n启动同步失败: ' + error.message + '\\n请检查网络连接或刷新页面重试...\\n';\n\
      syncAllButton.disabled = false;\n\
    });\n\
}\n\
\n\
function triggerSyncRepo(repo) {\n\
  const repoId = repo.replace('/', '-');\n\
  const syncButton = document.getElementById('sync-' + repoId);\n\
  const syncLog = document.getElementById('syncLog');\n\
  \n\
  syncButton.disabled = true;\n\
  syncLog.innerHTML += '开始同步仓库: ' + repo + '...\\n';\n\
  \n\
  fetch('/sync?repo=' + encodeURIComponent(repo))\n\
    .then(function(response) {\n\
      if (!response.body) {\n\
        throw new Error('浏览器不支持流式响应');\n\
      }\n\
      \n\
      const reader = response.body.getReader();\n\
      const decoder = new TextDecoder('utf-8');\n\
      \n\
      // 添加变量跟踪同步状态\n\
      let syncComplete = false;\n\
      \n\
      function readStream() {\n\
        reader.read().then(function(result) {\n\
          if (result.done) {\n\
            if (!syncComplete) {\n\
              syncLog.innerHTML += '\\n读取同步日志流结束，但未收到完成信号。5秒后自动刷新仓库状态...\\n';\n\
              setTimeout(function() { refreshStatus(); }, 5000);\n\
            }\n\
            return;\n\
          }\n\
          \n\
          const text = decoder.decode(result.value, { stream: true });\n\
          syncLog.innerHTML += text;\n\
          syncLog.scrollTop = syncLog.scrollHeight;\n\
          \n\
          // 检查是否包含该仓库的完成信号\n\
          if (text.includes(repo + ' 同步完成')) {\n\
            syncComplete = true;\n\
            syncLog.innerHTML += '\\n仓库 ' + repo + ' 同步完成！3秒后自动刷新仓库状态...\\n';\n\
            setTimeout(function() { refreshStatus(); }, 3000);\n\
            return;\n\
          }\n\
          \n\
          // 检查是否有错误信号\n\
          if (text.includes('同步 ' + repo + ' 时出错') || text.includes('同步过程中出错')) {\n\
            syncComplete = true;\n\
            syncLog.innerHTML += '\\n仓库 ' + repo + ' 同步出错。5秒后自动刷新仓库状态...\\n';\n\
            setTimeout(function() { refreshStatus(); }, 5000);\n\
            return;\n\
          }\n\
          \n\
          // 继续读取流\n\
          readStream();\n\
        }).catch(function(error) {\n\
          syncLog.innerHTML += '\\n日志流读取错误: ' + error.message + '\\n请手动刷新页面查看最新状态...\\n';\n\
          setTimeout(function() { refreshStatus(); }, 5000);\n\
        });\n\
      }\n\
      \n\
      readStream();\n\
    })\n\
    .catch(function(error) {\n\
      syncLog.innerHTML += '\\n启动同步失败: ' + error.message + '\\n请检查网络连接或刷新页面重试...\\n';\n\
      syncButton.disabled = false;\n\
    });\n\
}\n\
\n\
function clearSyncLog() {\n\
  document.getElementById('syncLog').innerHTML = '';\n\
}\n\
\n\
// 只刷新状态，不刷新整个页面或清空日志\n\
function refreshStatus() {\n\
  const syncAllButton = document.getElementById('syncAllButton');\n\
  const syncLog = document.getElementById('syncLog');\n\
  \n\
  // 从API获取最新状态\n\
  fetch('/api/status')\n\
    .then(response => response.json())\n\
    .then(data => {\n\
      // 更新仓库状态表格\n\
      if (data.repos && data.repos.length > 0) {\n\
        data.repos.forEach(repo => {\n\
          const repoId = repo.repo.replace('/', '-');\n\
          const row = document.getElementById('repo-' + repoId);\n\
          \n\
          if (row) {\n\
            // 更新版本\n\
            row.cells[1].textContent = repo.version;\n\
            \n\
            // 更新日期\n\
            if (repo.date && repo.date !== \"-\") {\n\
              try {\n\
                const date = new Date(repo.date);\n\
                row.cells[2].textContent = date.toLocaleString('zh-CN', {\n\
                  year: 'numeric', month: 'numeric', day: 'numeric',\n\
                  hour: '2-digit', minute: '2-digit', second: '2-digit',\n\
                  hour12: false\n\
                });\n\
              } catch (e) {\n\
                row.cells[2].textContent = repo.date;\n\
              }\n\
            }\n\
            \n\
            // 更新状态\n\
            const statusCell = row.cells[4].querySelector('.status');\n\
            if (statusCell) {\n\
              // 移除旧的状态类\n\
              statusCell.classList.remove('status-success', 'status-pending', 'status-error');\n\
              \n\
              // 添加新的状态类和文本\n\
              let statusClass = \"\";\n\
              let statusText = \"\";\n\
              \n\
              if (repo.status === \"error\") {\n\
                statusClass = \"status-error\";\n\
                statusText = \"失败\";\n\
              } else if (repo.status === \"updated\" || repo.status === \"latest\" || repo.status === \"synced\") {\n\
                statusClass = \"status-success\";\n\
                statusText = \"最新\";\n\
              } else if (repo.status === \"pending\") {\n\
                statusClass = \"status-pending\";\n\
                statusText = \"待同步\";\n\
              } else if (repo.status === \"syncing\") {\n\
                statusClass = \"status-pending\";\n\
                statusText = \"同步中\";\n\
              } else {\n\
                statusClass = \"status-pending\";\n\
                statusText = repo.status || \"未知\";\n\
              }\n\
              \n\
              statusCell.classList.add(statusClass);\n\
              statusCell.textContent = statusText;\n\
              \n\
              // 更新提示信息\n\
              if (repo.message) {\n\
                statusCell.title = repo.message;\n\
              }\n\
            }\n\
            \n\
            // 启用同步按钮\n\
            const syncButton = document.getElementById('sync-' + repoId);\n\
            if (syncButton) {\n\
              syncButton.disabled = false;\n\
            }\n\
          }\n\
        });\n\
      }\n\
      \n\
      // 启用\"同步所有\"按钮\n\
      syncAllButton.disabled = false;\n\
      \n\
      // 如果有API速率限制信息，更新它\n\
      if (data.apiRateLimit) {\n\
        try {\n\
          const resetTimestamp = data.apiRateLimit.reset;\n\
          const resetDate = new Date(resetTimestamp * 1000);\n\
          const resetTime = resetDate.toLocaleString('zh-CN', {\n\
            year: 'numeric', month: 'numeric', day: 'numeric',\n\
            hour: '2-digit', minute: '2-digit', second: '2-digit',\n\
            hour12: false\n\
          });\n\
          \n\
          const apiInfoElement = document.querySelector('.api-info');\n\
          if (apiInfoElement) {\n\
            apiInfoElement.innerHTML = 'GitHub API 速率: <span class=\"api-count\">' + data.apiRateLimit.remaining + '/' + data.apiRateLimit.limit + '</span> 次 (<span class=\"api-reset\">重置时间: ' + resetTime + '</span>)';\n\
          }\n\
        } catch (e) {\n\
          console.error(\"API速率时间格式化错误:\", e);\n\
        }\n\
      }\n\
    })\n\
    .catch(error => {\n\
      syncLog.innerHTML += '\\n获取状态失败: ' + error.message + '\\n';\n\
      syncAllButton.disabled = false;\n\
    });\n\
}";
  
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
  // 内联CSS内容，避免文件读取问题
  const styleContent = 
    "body {\n" +
    "  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\n" +
    "  max-width: 1200px;\n" +
    "  margin: 0 auto;\n" +
    "  padding: 20px;\n" +
    "  background-color: #fafafa;\n" +
    "  color: #333;\n" +
    "  line-height: 1.5;\n" +
    "}\n" +
    "\n" +
    "h1 {\n" +
    "  border-bottom: 2px solid #ddd;\n" +
    "  padding-bottom: 10px;\n" +
    "  color: #333;\n" +
    "  font-weight: 500;\n" +
    "}\n" +
    "\n" +
    ".repo-table {\n" +
    "  width: 100%;\n" +
    "  border-collapse: collapse;\n" +
    "  margin: 20px 0;\n" +
    "  background-color: white;\n" +
    "  box-shadow: 0 1px 3px rgba(0,0,0,0.1);\n" +
    "  border-radius: 5px;\n" +
    "  overflow: hidden;\n" +
    "}\n" +
    "\n" +
    ".repo-table th, .repo-table td {\n" +
    "  padding: 12px 15px;\n" +
    "  text-align: left;\n" +
    "  border-bottom: 1px solid #eee;\n" +
    "}\n" +
    "\n" +
    ".repo-table th {\n" +
    "  background-color: #f5f5f5;\n" +
    "  font-weight: 500;\n" +
    "  color: #555;\n" +
    "}\n" +
    "\n" +
    ".repo-table tr:last-child td {\n" +
    "  border-bottom: none;\n" +
    "}\n" +
    "\n" +
    ".status {\n" +
    "  display: inline-block;\n" +
    "  padding: 4px 8px;\n" +
    "  border-radius: 3px;\n" +
    "  font-size: 0.85em;\n" +
    "}\n" +
    "\n" +
    ".status-success {\n" +
    "  background-color: #e3f9e5;\n" +
    "  color: #1e7d32;\n" +
    "}\n" +
    "\n" +
    ".status-pending {\n" +
    "  background-color: #fff8e1;\n" +
    "  color: #f57c00;\n" +
    "}\n" +
    "\n" +
    ".status-error {\n" +
    "  background-color: #fdecea;\n" +
    "  color: #c62828;\n" +
    "}\n" +
    "\n" +
    ".btn {\n" +
    "  padding: 8px 16px;\n" +
    "  border: none;\n" +
    "  border-radius: 4px;\n" +
    "  background-color: #1976d2;\n" +
    "  color: white;\n" +
    "  font-size: 14px;\n" +
    "  cursor: pointer;\n" +
    "  transition: background-color 0.2s;\n" +
    "}\n" +
    "\n" +
    ".btn:hover {\n" +
    "  background-color: #1565c0;\n" +
    "}\n" +
    "\n" +
    ".btn:disabled {\n" +
    "  background-color: #bbdefb;\n" +
    "  cursor: not-allowed;\n" +
    "}\n" +
    "\n" +
    ".controls {\n" +
    "  margin: 20px 0;\n" +
    "  display: flex;\n" +
    "  gap: 10px;\n" +
    "}\n" +
    "\n" +
    ".log-container {\n" +
    "  margin-top: 20px;\n" +
    "}\n" +
    "\n" +
    ".log-header {\n" +
    "  display: flex;\n" +
    "  justify-content: space-between;\n" +
    "  align-items: center;\n" +
    "  margin-bottom: 10px;\n" +
    "}\n" +
    "\n" +
    ".sync-log {\n" +
    "  width: 100%;\n" +
    "  height: 300px;\n" +
    "  background-color: #202124;\n" +
    "  color: #fff;\n" +
    "  font-family: 'Consolas', 'Monaco', monospace;\n" +
    "  padding: 15px;\n" +
    "  border-radius: 5px;\n" +
    "  overflow-y: scroll;\n" +
    "  white-space: pre-wrap;\n" +
    "  line-height: 1.4;\n" +
    "}\n" +
    "\n" +
    ".footer {\n" +
    "  margin-top: 40px;\n" +
    "  padding-top: 20px;\n" +
    "  border-top: 1px solid #eee;\n" +
    "  text-align: center;\n" +
    "  font-size: 0.9em;\n" +
    "  color: #666;\n" +
    "}\n" +
    "\n" +
    ".api-info {\n" +
    "  margin-top: 10px;\n" +
    "  padding: 10px;\n" +
    "  background-color: #f5f5f5;\n" +
    "  border-radius: 5px;\n" +
    "  font-size: 0.9em;\n" +
    "}\n" +
    "\n" +
    ".api-count {\n" +
    "  font-weight: bold;\n" +
    "  color: #1976d2;\n" +
    "}\n" +
    "\n" +
    ".api-reset {\n" +
    "  color: #666;\n" +
    "}\n" +
    "\n" +
    ".error-message {\n" +
    "  padding: 10px 15px;\n" +
    "  margin: 20px 0;\n" +
    "  background-color: #fdecea;\n" +
    "  color: #c62828;\n" +
    "  border-radius: 5px;\n" +
    "  border-left: 4px solid #c62828;\n" +
    "}\n" +
    "\n" +
    ".info-message {\n" +
    "  padding: 10px 15px;\n" +
    "  margin: 20px 0;\n" +
    "  background-color: #e3f2fd;\n" +
    "  color: #0277bd;\n" +
    "  border-radius: 5px;\n" +
    "  border-left: 4px solid #0277bd;\n" +
    "}\n" +
    "\n" +
    "@media (max-width: 768px) {\n" +
    "  body {\n" +
    "    padding: 10px;\n" +
    "  }\n" +
    "  \n" +
    "  .repo-table th, .repo-table td {\n" +
    "    padding: 8px 10px;\n" +
    "  }\n" +
    "  \n" +
    "  .controls {\n" +
    "    flex-direction: column;\n" +
    "  }\n" +
    "  \n" +
    "  .btn {\n" +
    "    width: 100%;\n" +
    "  }\n" +
    "}";
  
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
  // 获取最新的仓库配置
  const repoConfigs = getRepoConfigs(env);
  
  // 从KV中获取最新的状态信息
  const updatedRepos = [];
  if (repoConfigs.length > 0) {
    for (const config of repoConfigs) {
      try {
        const repoKey = "repo:" + config.repo;
        const versionInfoStr = await env.SYNC_STATUS.get(repoKey);
        
        if (versionInfoStr) {
          const versionInfo = JSON.parse(versionInfoStr);
          
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
          
          updatedRepos.push({
            repo: config.repo,
            version: versionInfo.version || "未知",
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
        console.error("加载仓库 " + config.repo + " 状态信息失败:", error);
        updatedRepos.push({
          repo: config.repo,
          version: "未知",
          date: "-",
          path: config.path,
          status: "error",
          message: "加载状态失败: " + error.message
        });
      }
    }
  }
  
  // 更新worker中的状态
  worker.syncedRepos = updatedRepos;
  
  return new Response(JSON.stringify({
    repos: updatedRepos,
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
    return new Response("未找到指定的仓库配置: " + requestedRepo, { status: 404 });
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
        await writer.write(encoder.encode("开始同步仓库: " + repo + "...\n"));
        
        try {
          // 获取最新版本信息
          const releaseInfo = await fetchLatestRelease(repo, env);
          if (!releaseInfo) {
            await writer.write(encoder.encode("无法获取 " + repo + " 的发布信息\n"));
            continue;
          }
          
          const { tag_name, published_at, assets } = releaseInfo;
          await writer.write(encoder.encode(repo + " 的最新版本: " + tag_name + ", 发布于: " + published_at + "\n"));
          
          // 首先检查是否需要更新
          const needUpdate = await checkNeedUpdate(env, repo, tag_name, path);
          if (!needUpdate) {
            await writer.write(encoder.encode(repo + " 已是最新版本，无需更新\n"));
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
          await writer.write(encoder.encode("正在删除 " + repo + " 的旧文件...\n"));
          await deleteRepoFiles(env, repo);
          
          // 下载并上传新文件
          await writer.write(encoder.encode("正在下载 " + repo + " 的最新文件...\n"));
          
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
          
          await writer.write(encoder.encode("找到 " + validAssets.length + " 个有效资源文件\n"));
          
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
            .map(([platform, count]) => platform + ": " + count + "个文件")
            .join(', ');
          
          await writer.write(encoder.encode(repo + " 同步完成，版本 " + tag_name + "，共上传 " + uploadedPaths.length + " 个文件 (" + platformSummary + ")\n"));
          await writer.write(encoder.encode("仓库 " + repo + " 同步完成！3秒后自动刷新仓库状态...\n\n"));
        } catch (error) {
          await writer.write(encoder.encode("同步 " + repo + " 时出错: " + error.message + "\n"));
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
      await writer.write(encoder.encode("同步过程中出错: " + error.message + "\n"));
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
      const repoKey = "repo:" + repo;
      
      try {
        const versionInfoJson = await env.SYNC_STATUS.get(repoKey);
        if (versionInfoJson) {
          const versionInfo = JSON.parse(versionInfoJson);
          
          // 检查路径是否变更
          if (versionInfo.path !== path) {
            console.log("检测到 " + repo + " 的路径已从 " + versionInfo.path + " 变更为 " + path + "，更新状态");
            
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
              console.log(repo + " 的同步状态已持续超过20分钟，重置为错误状态");
              
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
                const basePath = prefix ? prefix + "/" : "";
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
                    console.log("已从R2恢复 " + repo + " 的文件路径记录: " + updatedVersionInfo.filePaths.length + "个文件");
                  }
                }
              } catch (error) {
                console.error("检查R2中文件时出错: " + error.message);
              }
            }
            
            // 如果没有找到文件，更新状态为待同步
            if (!hasFiles) {
              console.log(repo + " 的状态为已同步，但未找到文件记录，标记为待同步");
              
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
        console.error("检查 " + repo + " 路径变更时出错:", error);
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
            const repoKey = "repo:" + config.repo;
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
            console.error("加载仓库 " + config.repo + " 状态信息失败:", error);
            // 如果读取失败，添加一个显示错误的条目
            updatedRepos.push({
              repo: config.repo,
              version: "未知",
              date: "-",
              path: config.path,
              status: "error",
              message: "加载状态失败: " + error.message
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
      worker.errorMessage = "加载仓库状态时出错: " + error.message;
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