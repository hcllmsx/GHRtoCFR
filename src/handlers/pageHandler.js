// import fs from 'fs';
import { isFileFromRepo } from '../utils/repoUtils.js';

// 获取HTML模板
let HTML_TEMPLATE = null;

/**
 * 加载HTML模板
 */
export async function loadTemplate() {
  try {
    if (!HTML_TEMPLATE) {
      // 在Workers环境中，我们直接返回硬编码的HTML模板
      HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <title>GHRtoCFR - GitHub Releases to Cloudflare R2</title>
  <style>
    {{CSS_CONTENT}}
  </style>
</head>
<body>
  <h1>GitHub Releases to Cloudflare R2</h1>
  {{ERROR_MESSAGE}}
  {{INFO_MESSAGE}}
  
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
  
  <div id="syncLogContainer" class="sync-log-container">
    <div class="sync-log-header">
      <h3 class="sync-log-title">同步日志</h3>
      <div class="sync-log-controls">
        <button class="sync-all-btn" id="syncAllButton" onclick="triggerSyncAll()">同步所有仓库</button>
        <button class="sync-log-clear" onclick="clearSyncLog()">清空日志</button>
        <button class="refresh-btn" onclick="refreshStatus()">刷新状态</button>
      </div>
    </div>
    <div id="syncLog" class="sync-log"></div>
  </div>
  
  <div class="footer">
    <div class="last-check">最后检查时间: {{LAST_CHECK_TIME}}</div>
    <div class="api-info">{{API_RATE_LIMIT}}</div>
  </div>
  
  <script>
    {{JS_CONTENT}}
  </script>
</body>
</html>`;
    }
    return HTML_TEMPLATE;
  } catch (error) {
    console.error("加载HTML模板失败:", error);
    return null;
  }
}

/**
 * 生成状态页面
 */
export async function generateStatusPage(worker, lastCheckTime) {
  let tableRows = "";
  
  if (worker.syncedRepos.length === 0) {
    tableRows = `<tr><td colspan="6" style="text-align: center">暂无同步数据</td></tr>`;
  } else {
    for (const repo of worker.syncedRepos) {
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
          </td>
        </tr>
      `;
    }
  }
  
  // 添加错误信息
  let errorMessageHtml = '';
  if (worker.errorMessage) {
    errorMessageHtml = `<div class="error-message">${worker.errorMessage}</div>`;
  }
  
  // 添加信息消息
  let infoMessageHtml = '';
  if (worker.infoMessage) {
    infoMessageHtml = `<div class="info-message">${worker.infoMessage}</div>`;
  }
  
  // 添加 API 速率限制信息
  let apiRateLimitInfo = "GitHub API 速率: 未知";
  if (worker.apiRateLimit) {
    try {
      // 确保重置时间是时间戳（秒）
      const resetTimestamp = worker.apiRateLimit.reset;
      
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
      
      apiRateLimitInfo = `GitHub API 速率: <span class="api-count">${worker.apiRateLimit.remaining}/${worker.apiRateLimit.limit}</span> 次 (<span class="api-reset">重置时间: ${resetTime}</span>)`;
    } catch (e) {
      console.error("API速率时间格式化错误:", e, worker.apiRateLimit);
      apiRateLimitInfo = `GitHub API 速率: <span class="api-count">${worker.apiRateLimit.remaining}/${worker.apiRateLimit.limit}</span> 次 (重置时间: 格式化错误)`;
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
  
  // 内联CSS和JS代码
  const cssContent = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    background-color: #f5f5f5;
  }
  
  h1 {
    color: #2c3e50;
    margin-bottom: 20px;
    text-align: center;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 30px;
    background-color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    border-radius: 5px;
    overflow: hidden;
  }
  
  th, td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
  }
  
  th {
    background-color: #34495e;
    color: white;
    font-weight: bold;
  }
  
  tr:nth-child(even) {
    background-color: #f9f9f9;
  }
  
  tr:hover {
    background-color: #f1f1f1;
  }
  
  .btn {
    padding: 8px 12px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
  }
  
  .btn:hover {
    background-color: #2980b9;
  }
  
  .btn:disabled {
    background-color: #95a5a6;
    cursor: not-allowed;
  }
  
  .btn-sm {
    padding: 5px 10px;
    font-size: 12px;
  }
  
  .status {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
  }
  
  .status-success {
    background-color: #2ecc71;
    color: white;
  }
  
  .status-error {
    background-color: #e74c3c;
    color: white;
  }
  
  .status-pending {
    background-color: #f39c12;
    color: white;
  }
  
  .error-message {
    padding: 10px 15px;
    background-color: #ffeaea;
    border-left: 4px solid #e74c3c;
    color: #c0392b;
    margin-bottom: 20px;
    border-radius: 3px;
  }
  
  .info-message {
    padding: 10px 15px;
    background-color: #e8f4f8;
    border-left: 4px solid #3498db;
    color: #2980b9;
    margin-bottom: 20px;
    border-radius: 3px;
  }
  
  .sync-log-container {
    background-color: white;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 30px;
  }
  
  .sync-log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    background-color: #34495e;
    color: white;
  }
  
  .sync-log-title {
    margin: 0;
    font-size: 18px;
  }
  
  .sync-log-controls {
    display: flex;
    gap: 10px;
  }
  
  .sync-log {
    height: 300px;
    overflow-y: auto;
    padding: 15px;
    background-color: #2c3e50;
    color: #ecf0f1;
    font-family: monospace;
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.5;
  }
  
  .footer {
    display: flex;
    justify-content: space-between;
    padding: 15px;
    background-color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    border-radius: 5px;
    font-size: 14px;
    color: #7f8c8d;
  }
  
  .api-count {
    font-weight: bold;
    color: #2c3e50;
  }
  
  .api-reset {
    color: #7f8c8d;
  }
  
  .sync-all-btn {
    background-color: #27ae60;
  }
  
  .sync-all-btn:hover {
    background-color: #219d54;
  }
  
  .sync-log-clear {
    background-color: #e74c3c;
  }
  
  .sync-log-clear:hover {
    background-color: #c0392b;
  }
  
  .refresh-btn {
    background-color: #9b59b6;
  }
  
  .refresh-btn:hover {
    background-color: #8e44ad;
  }
  
  @media (max-width: 768px) {
    body {
      padding: 10px;
    }
    
    table {
      font-size: 14px;
    }
    
    th, td {
      padding: 8px 10px;
    }
    
    .footer {
      flex-direction: column;
      gap: 10px;
    }
    
    .sync-log-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    
    .sync-log-controls {
      width: 100%;
      justify-content: space-between;
    }
  }`;
  
  const jsContent = `function triggerSyncAll() {
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
              syncLog.innerHTML += '\n读取同步日志流结束，但未收到完成信号。5秒后自动刷新仓库状态...\n';
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
            syncLog.innerHTML += '\n所有仓库同步完成！3秒后自动刷新仓库状态...\n';
            setTimeout(function() { refreshStatus(); }, 3000);
            return;
          }
          
          // 检查是否有错误信号
          if (text.includes('同步过程中出错')) {
            syncComplete = true;
            syncLog.innerHTML += '\n同步过程中出错。5秒后自动刷新仓库状态...\n';
            setTimeout(function() { refreshStatus(); }, 5000);
            return;
          }
          
          // 不要过早地结束日志读取，继续读取流
          readStream();
        }).catch(function(error) {
          syncLog.innerHTML += '\n日志流读取错误: ' + error.message + '\n请手动刷新页面查看最新状态...\n';
          setTimeout(function() { refreshStatus(); }, 5000);
        });
      }
      
      readStream();
    })
    .catch(function(error) {
      syncLog.innerHTML += '\n启动同步失败: ' + error.message + '\n请检查网络连接或刷新页面重试...\n';
      syncAllButton.disabled = false;
    });
}

function triggerSyncRepo(repo) {
  const repoId = repo.replace('/', '-');
  const syncButton = document.getElementById('sync-' + repoId);
  const syncLog = document.getElementById('syncLog');
  
  syncButton.disabled = true;
  syncLog.innerHTML += '开始同步仓库: ' + repo + '...\n';
  
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
              syncLog.innerHTML += '\n读取同步日志流结束，但未收到完成信号。5秒后自动刷新仓库状态...\n';
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
            syncLog.innerHTML += '\n仓库 ' + repo + ' 同步完成！3秒后自动刷新仓库状态...\n';
            setTimeout(function() { refreshStatus(); }, 3000);
            return;
          }
          
          // 检查是否有错误信号
          if (text.includes('同步 ' + repo + ' 时出错') || text.includes('同步过程中出错')) {
            syncComplete = true;
            syncLog.innerHTML += '\n仓库 ' + repo + ' 同步出错。5秒后自动刷新仓库状态...\n';
            setTimeout(function() { refreshStatus(); }, 5000);
            return;
          }
          
          // 继续读取流
          readStream();
        }).catch(function(error) {
          syncLog.innerHTML += '\n日志流读取错误: ' + error.message + '\n请手动刷新页面查看最新状态...\n';
          setTimeout(function() { refreshStatus(); }, 5000);
        });
      }
      
      readStream();
    })
    .catch(function(error) {
      syncLog.innerHTML += '\n启动同步失败: ' + error.message + '\n请检查网络连接或刷新页面重试...\n';
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
              
              // 更新提示信息
              if (repo.message) {
                statusCell.title = repo.message;
              }
            }
            
            // 启用同步按钮
            const syncButton = document.getElementById('sync-' + repoId);
            if (syncButton) {
              syncButton.disabled = false;
            }
          }
        });
      }
      
      // 启用"同步所有"按钮
      syncAllButton.disabled = false;
      
      // 如果有API速率限制信息，更新它
      if (data.apiRateLimit) {
        try {
          const resetTimestamp = data.apiRateLimit.reset;
          const resetDate = new Date(resetTimestamp * 1000);
          const resetTime = resetDate.toLocaleString('zh-CN', {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
          });
          
          const apiInfoElement = document.querySelector('.api-info');
          if (apiInfoElement) {
            apiInfoElement.innerHTML = \`GitHub API 速率: <span class="api-count">\${data.apiRateLimit.remaining}/\${data.apiRateLimit.limit}</span> 次 (<span class="api-reset">重置时间: \${resetTime}</span>)\`;
          }
        } catch (e) {
          console.error("API速率时间格式化错误:", e);
        }
      }
    })
    .catch(error => {
      syncLog.innerHTML += \`\n获取状态失败: \${error.message}\n\`;
      syncAllButton.disabled = false;
    });
}`;
  
  // 获取HTML模板
  let html = await loadTemplate();
  if (!html) {
    html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GHRtoCFR - Error</title>
      </head>
      <body>
        <h1>Error loading template</h1>
        <p>Could not load the HTML template. Please check the server configuration.</p>
      </body>
      </html>
    `;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  
  // 替换模板中的占位符
  html = html
    .replace(/{{ERROR_MESSAGE}}/g, errorMessageHtml)
    .replace(/{{INFO_MESSAGE}}/g, infoMessageHtml)
    .replace(/{{TABLE_ROWS}}/g, tableRows)
    .replace(/{{LAST_CHECK_TIME}}/g, lastCheckTimeStr)
    .replace(/{{API_RATE_LIMIT}}/g, apiRateLimitInfo)
    .replace(/{{CSS_CONTENT}}/g, cssContent)
    .replace(/{{JS_CONTENT}}/g, jsContent);
  
  // 如果正在同步，添加额外的脚本使同步状态可见
  if (worker.isSyncing) {
    html = html.replace('</script>', `
      document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('syncAllButton').disabled = true;
      });
    </script>`);
  }
  
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

/**
 * 向同步日志流发送消息
 */
export async function sendLogMessage(message, env) {
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
} 