import { saveRateLimitInfo } from './repoUtils.js';

/**
 * 获取仓库的最新 Release 信息
 */
export async function fetchLatestRelease(repo, env) {
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
  const rateLimit = saveRateLimitInfo(response.headers);
  
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
}

/**
 * 获取 GitHub API 速率限制信息
 */
export async function fetchGitHubRateLimit(env) {
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
    const rateLimit = saveRateLimitInfo(response.headers);
    
    if (response.ok) {
      const data = await response.json();
      console.log("GitHub API 速率限制信息:", data.rate);
      return {
        rateLimit,
        data: data.rate
      };
    } else {
      console.error("获取 GitHub API 速率限制失败:", response.status, response.statusText);
      return { 
        rateLimit,
        error: `${response.status} ${response.statusText}`
      };
    }
  } catch (error) {
    console.error("获取 GitHub API 速率限制出错:", error);
    return { 
      error: error.message 
    };
  }
} 