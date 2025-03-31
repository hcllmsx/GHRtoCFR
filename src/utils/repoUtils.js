/**
 * 从环境变量中获取仓库配置
 */
export function getRepoConfigs(env) {
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
}

/**
 * 获取版本信息的键值
 */
export function getVersionKey(repo, path) {
  const repoId = repo.replace(/\//g, "-");
  const prefix = path && path.startsWith("/") ? path.substring(1) : path;
  const basePath = prefix ? `${prefix}/` : "";
  return `${basePath}${repoId}-version.json`;
}

/**
 * 保存 API 速率限制信息
 */
export function saveRateLimitInfo(headers) {
  try {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');
    
    console.log("GitHub API Headers:", { remaining, limit, reset });
    
    if (remaining && limit && reset) {
      const resetTimestamp = parseInt(reset);
      console.log("Reset timestamp:", resetTimestamp, "Date:", new Date(resetTimestamp * 1000).toISOString());
      
      return {
        remaining: parseInt(remaining),
        limit: parseInt(limit),
        reset: resetTimestamp
      };
    }
    return null;
  } catch (error) {
    console.error("保存API速率限制信息时出错:", error);
    return null;
  }
}

/**
 * 检查文件是否属于特定仓库
 */
export function isFileFromRepo(key, repo) {
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
  
  // 默认情况下，如果无法确定归属，不认为文件属于此仓库
  return false;
}

/**
 * 根据文件名确定操作系统类型
 */
export function determineOSType(filename) {
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
}

/**
 * 保存版本信息到KV存储
 */
export async function saveVersionInfo(env, repo, versionInfo) {
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
}

/**
 * 清空仓库的文件路径列表
 */
export async function clearFilePathsList(env, repo) {
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
} 