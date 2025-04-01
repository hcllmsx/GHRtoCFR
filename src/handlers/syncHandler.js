import { getRepoConfigs, isFileFromRepo, clearFilePathsList, saveVersionInfo, determineOSType } from '../utils/repoUtils.js';
import { fetchLatestRelease } from '../utils/githubApi.js';

/**
 * 删除特定仓库的旧文件
 */
export async function deleteRepoFiles(env, repo) {
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
    const repoConfig = getRepoConfigs(env).find(config => config.repo === repo);
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
      if (isFileFromRepo(object.key, repo)) {
        // 额外安全检查：确保不会删除其他仓库的文件
        let belongsToOtherRepo = false;
        
        // 获取所有配置的仓库
        const allRepos = getRepoConfigs(env);
        for (const otherConfig of allRepos) {
          if (otherConfig.repo !== repo && isFileFromRepo(object.key, otherConfig.repo)) {
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
}

/**
 * 检查是否需要更新
 */
export async function checkNeedUpdate(env, repo, currentVersion, path) {
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
        
        // 获取该仓库在GitHub的最新发布信息，以检查文件数量
        let expectedAssetCount = 0;
        try {
          const releaseInfo = await fetchLatestRelease(repo, env);
          if (releaseInfo && releaseInfo.assets) {
            const validAssets = releaseInfo.assets.filter(asset => {
              return !asset.name.includes("Source code") &&
                     !asset.name.endsWith(".sha256") &&
                     !asset.name.endsWith(".asc");
            });
            expectedAssetCount = validAssets.length;
            console.log(`${repo} 在GitHub最新版本中有 ${expectedAssetCount} 个有效资源文件`);
          }
        } catch (error) {
          console.error(`获取GitHub最新发布信息失败: ${error.message}`);
          // 如果无法获取GitHub信息，我们将继续使用已有的版本比较逻辑
        }
        
        // 检查文件是否存在于R2中
        let actualFileCount = 0;
        let hasCompleteFiles = false;
        let filesExistInR2 = false;
        
        if (env.R2_BUCKET) {
          try {
            // 构建基本的路径前缀
            const prefix = path && path.startsWith("/") ? path.substring(1) : path;
            const basePath = prefix ? `${prefix}/` : "";
            console.log(`检查R2中 ${basePath} 路径下是否存在 ${repo} 的文件`);
            
            // 列出存储桶中可能属于该仓库的文件
            const objects = await env.R2_BUCKET.list({ prefix: basePath });
            
            if (objects && objects.objects && objects.objects.length > 0) {
              // 过滤这个仓库的文件
              const repoFiles = objects.objects.filter(obj => isFileFromRepo(obj.key, repo));
              actualFileCount = repoFiles.length;
              console.log(`在R2中找到 ${actualFileCount} 个属于 ${repo} 的文件`);
              
              // 判断是否确实存在文件
              if (actualFileCount > 0) {
                filesExistInR2 = true;
                console.log(`确认在R2中存在 ${repo} 的文件`);
                
                // 更新文件路径记录(如果需要)
                if (!storedVersionInfo.filePaths || storedVersionInfo.filePaths.length !== repoFiles.length) {
                  const updatedVersionInfo = { ...storedVersionInfo };
                  updatedVersionInfo.filePaths = repoFiles.map(obj => obj.key);
                  await env.SYNC_STATUS.put(key, JSON.stringify(updatedVersionInfo));
                  console.log(`已更新 ${repo} 的文件路径记录: ${updatedVersionInfo.filePaths.length}个文件`);
                }
              } else {
                console.log(`在R2中未找到任何属于 ${repo} 的文件，需要重新同步`);
              }
              
              // 判断文件是否完整
              const referenceCount = expectedAssetCount > 0 ? expectedAssetCount : 
                                   (storedVersionInfo.filePaths && storedVersionInfo.filePaths.length > 0 ? 
                                    storedVersionInfo.filePaths.length : 0);
              
              if (referenceCount > 0 && actualFileCount >= referenceCount) {
                hasCompleteFiles = true;
                console.log(`${repo} 在R2中有 ${actualFileCount} 个文件，符合或超过预期的 ${referenceCount} 个文件`);
              } else if (referenceCount > 0) {
                console.log(`${repo} 在R2中只有 ${actualFileCount} 个文件，少于预期的 ${referenceCount} 个文件，需要重新同步`);
              }
            } else {
              console.log(`在R2中未能列出任何 ${repo} 相关文件，需要重新同步`);
            }
            
            // 如果KV记录了文件路径，但实际上文件不存在，则需要重新同步
            if (storedVersionInfo.filePaths && storedVersionInfo.filePaths.length > 0 && !filesExistInR2) {
              console.log(`KV记录了 ${storedVersionInfo.filePaths.length} 个文件路径，但实际上R2中不存在文件，需要重新同步`);
              return true;
            }
          } catch (error) {
            console.error(`检查R2中文件时出错: ${error.message}`);
            // 出错时保守处理，假设需要重新同步
            return true;
          }
        }
        
        // 如果版本相同，再检查文件是否完整且存在
        if (storedVersionInfo.version === currentVersion) {
          // 如果GitHub上的期望文件数量大于0，且R2中的实际文件数量小于期望数量，表明需要重新同步
          if (expectedAssetCount > 0 && actualFileCount < expectedAssetCount) {
            console.log(`${repo} 的版本 ${currentVersion} 相同，但文件不完整(${actualFileCount}/${expectedAssetCount})，需要重新同步`);
            return true;
          }
          
          // 如果没有找到任何文件，也需要重新同步
          if (!filesExistInR2) {
            console.log(`${repo} 版本相同但在R2中未找到文件，需要重新同步`);
            return true;
          }
          
          // 如果文件路径记录为空或文件数量为0，但状态为synced
          if (storedVersionInfo.status === 'synced' && 
              (!storedVersionInfo.filePaths || 
               storedVersionInfo.filePaths.length === 0 || 
               actualFileCount === 0)) {
            console.log(`${repo} 版本相同但文件记录为空或文件不存在，需要重新同步`);
            return true;
          }
          
          console.log(`${repo} 的版本 ${currentVersion} 已经是最新的，且文件完整存在，无需更新`);
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
        const repoId = repo.replace(/\//g, "-");
        const prefix = path && path.startsWith("/") ? path.substring(1) : path;
        const basePath = prefix ? `${prefix}/` : "";
        const versionKey = `${basePath}${repoId}-version.json`;
        
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
}

/**
 * 下载并上传单个资源文件
 */
export async function downloadAndUploadAsset(asset, repo, path, platform, env) {
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
          if (isFileFromRepo(storagePath, repo)) {
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
}

/**
 * 下载并上传资源文件
 */
export async function downloadAndUploadAssets(repo, assets, path, env) {
  try {
    // 过滤出有效的资源文件（排除源代码、校验文件等）
    const validAssets = assets.filter(asset => {
      return !asset.name.includes("Source code") &&
             !asset.name.endsWith(".sha256") &&
             !asset.name.endsWith(".asc");
    });
    
    if (validAssets.length === 0) {
      console.warn("未找到有效资源文件");
      return [];
    }
    
    const uploadedPaths = [];
    
    // 处理每个资源文件
    for (let i = 0; i < validAssets.length; i++) {
      const asset = validAssets[i];
      try {
        console.log(`正在处理第 ${i + 1}/${validAssets.length} 个文件: ${asset.name}`);
        const platform = determineOSType(asset.name);
        console.log(`文件 ${asset.name} 属于 ${platform} 平台`);
        const uploadedPath = await downloadAndUploadAsset(asset, repo, path, platform, env);
        if (uploadedPath) {
          uploadedPaths.push(uploadedPath);
          console.log(`文件 ${asset.name} 处理完成\n`);
        }
      } catch (error) {
        console.error(`处理文件 ${asset.name} 失败:`, error);
        console.log(`\n`); // 添加空行
      }
    }
    
    return uploadedPaths;
  } catch (error) {
    console.error("下载上传资源文件时出错:", error);
    throw error;
  }
} 