/**
 * GHRtoCFR - 从 GitHub Releases 同步文件到 Cloudflare R2
 */

import {
  handleFavicon,
  handleApiStatus,
  handleGitHubRate,
  handleSyncLogsStream,
  handleSyncLogs,
  handleSync,
  handleHome,
  updateLastCheckTime,
  getLastCheckTime
} from './handlers/routeHandler.js';

import { getRepoConfigs } from './utils/repoUtils.js';

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
        return handleFavicon();
      }
      
      // 处理同步日志流
      if (pathname === "/api/sync-logs-stream") {
        return handleSyncLogsStream(request, env);
      }
      
      // 处理同步日志API
      if (pathname === "/api/sync-logs") {
        return handleSyncLogs();
      }
      
      // 处理同步API请求
      if (pathname === "/sync") {
        return handleSync(request, this, env, ctx);
      }
      
      // 如果请求路径是 /api/status，返回 JSON 格式的状态信息
      if (pathname === "/api/status") {
        return handleApiStatus(this, env);
      }
      
      // 如果请求路径是 /api/github-rate，获取 GitHub API 速率限制信息
      if (pathname === "/api/github-rate") {
        return handleGitHubRate(this, env);
      }
      
      // 默认情况下，返回主页面
      return handleHome(this, env);
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
      const checkInterval = parseInt(env.CHECK_INTERVAL || 604800); // 默认7天
      const lastCheckTime = getLastCheckTime();
      
      // 检查是否到达检查间隔
      if (now - lastCheckTime >= checkInterval) {
        this.isSyncing = true;
        try {
          // 创建一个模拟请求，用于复用handleSync函数
          const mockRequest = new Request('https://example.com/sync');
          await handleSync(mockRequest, this, env, ctx);
          updateLastCheckTime();
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
   * 获取配置的仓库列表
   */
  getConfiguredRepos(env) {
    return getRepoConfigs(env);
  }
}; 