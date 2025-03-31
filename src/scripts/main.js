// 导出JS内容作为默认导出
export default `
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