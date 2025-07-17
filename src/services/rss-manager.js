/**
 * RSS 管理器
 * 对应原 Python 项目的 services/rss/manager.py
 * 使用 Cloudflare KV 存储替代文件系统
 */

import { parseXML, extractURLs, extractSitemapUrls, isValidSitemap } from './xml-parser.js';

export class RSSManager {
  constructor(kvStorage) {
    this.kv = kvStorage;
    this.feedsKey = 'rss_feeds';
  }

  /**
   * 获取所有监控的 feeds
   * @returns {Promise<string[]>} feeds 列表
   */
  async getFeeds() {
    try {
      const feedsJson = await this.kv.get(this.feedsKey);
      return feedsJson ? JSON.parse(feedsJson) : [];
    } catch (error) {
      console.error('读取 feeds 失败:', error);
      return [];
    }
  }

  /**
   * 生成URL的hash值作为唯一标识
   * @param {string} url - URL字符串
   * @returns {string} URL的hash值
   */
  generateUrlHash(url) {
    // 使用简单的hash算法：djb2
    let hash = 5381;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) + hash) + url.charCodeAt(i);
    }
    return (hash >>> 0).toString(36); // 转换为base36字符串，更短
  }

  /**
   * 处理sitemap索引文件，提取并监控所有子sitemap
   * @param {string} indexUrl - sitemap索引URL
   * @param {string} indexContent - sitemap索引内容
   * @returns {Promise<Object>} 处理结果
   */
  async processSitemapIndex(indexUrl, indexContent) {
    try {
      console.log(`处理sitemap索引: ${indexUrl}`);
      
      const subSitemaps = extractSitemapUrls(indexContent);
      console.log(`发现 ${subSitemaps.length} 个子sitemap`);

      if (subSitemaps.length === 0) {
        return {
          success: false,
          errorMsg: "sitemap索引中没有找到子sitemap",
          newUrls: []
        };
      }

      let totalNewUrls = [];
      let successCount = 0;
      let errorCount = 0;

      // 处理每个子sitemap
      for (const subUrl of subSitemaps) {
        try {
          // 确保URL是完整的（处理相对路径）
          let absoluteUrl = subUrl;
          if (!subUrl.startsWith('http')) {
            const baseUrl = new URL(indexUrl);
            absoluteUrl = new URL(subUrl, baseUrl.origin).href;
          }

          console.log(`处理子sitemap: ${absoluteUrl}`);
          const result = await this.downloadSitemap(absoluteUrl);
          
          if (result.success) {
            successCount++;
            if (result.newUrls && result.newUrls.length > 0) {
              totalNewUrls.push(...result.newUrls);
            }
          } else {
            errorCount++;
            console.warn(`子sitemap处理失败: ${absoluteUrl}, 原因: ${result.errorMsg}`);
          }

          // 添加延迟避免频率限制
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          errorCount++;
          console.error(`处理子sitemap失败: ${subUrl}`, error);
        }
      }

      return {
        success: true,
        errorMsg: `处理完成: 成功${successCount}个, 失败${errorCount}个`,
        newUrls: totalNewUrls,
        subSitemaps: subSitemaps.length,
        successCount,
        errorCount
      };

    } catch (error) {
      console.error(`处理sitemap索引失败: ${indexUrl}`, error);
      return {
        success: false,
        errorMsg: `处理sitemap索引失败: ${error.message}`,
        newUrls: []
      };
    }
  }

  /**
   * 下载并保存 sitemap 文件
   * @param {string} url - sitemap 的 URL
   * @param {boolean} forceUpdate - 是否强制更新，忽略每日限制（用于手动触发）
   * @returns {Promise<Object>} 结果对象
   */
  async downloadSitemap(url, forceUpdate = false) {
    try {
      console.log(`尝试下载 sitemap: ${url}${forceUpdate ? ' (强制更新)' : ''}`);

      const urlHash = this.generateUrlHash(url);
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

      // 检查今天是否已经更新过（除非强制更新）
      const lastUpdateKey = `last_update_${urlHash}`;
      const lastUpdate = await this.kv.get(lastUpdateKey);

      if (!forceUpdate && lastUpdate === today) {
        // 今天已经更新过，比较现有文件
        const currentContent = await this.kv.get(`sitemap_current_${urlHash}`);
        const latestContent = await this.kv.get(`sitemap_latest_${urlHash}`);

        if (currentContent && latestContent) {
          const newUrls = this.compareSitemaps(currentContent, latestContent);
          return {
            success: true,
            errorMsg: "今天已经更新过此sitemap, 但没发送",
            datedFile: null,
            newUrls
          };
        }

        return {
          success: true,
          errorMsg: "今天已经更新过此sitemap",
          datedFile: null,
          newUrls: []
        };
      }

      // 下载新文件
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      };

      const response = await fetch(url, {
        method: 'GET',
        headers,
        cf: { cacheTtl: 300 } // 缓存5分钟
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let newContent;
      if (url.endsWith('.gz')) {
        console.log(`解压 gzipped sitemap: ${url}`);
        if (!response.body) {
          throw new Error('Response body is null, cannot decompress.');
        }
        const decompressionStream = new DecompressionStream('gzip');
        const decompressedStream = response.body.pipeThrough(decompressionStream);
        newContent = await new Response(decompressedStream).text();
      } else {
        newContent = await response.text();
      }

      // 检查是否为sitemap索引文件
      const doc = parseXML(newContent);
      const rootTag = doc.documentElement?.tagName?.toLowerCase();

      if (rootTag === 'sitemapindex') {
        console.log(`检测到sitemap索引文件: ${url}`);
        return await this.processSitemapIndex(url, newContent);
      }

      let newUrls = [];

      // 如果存在 current 文件，比较差异
      const currentContent = await this.kv.get(`sitemap_current_${urlHash}`);
      if (currentContent) {
        newUrls = this.compareSitemaps(newContent, currentContent);
        // 将 current 移动到 latest
        await this.kv.put(`sitemap_latest_${urlHash}`, currentContent);
      }

      // 保存新文件
      await this.kv.put(`sitemap_current_${urlHash}`, newContent);
      await this.kv.put(`sitemap_dated_${urlHash}_${today}`, newContent);

      // 更新最后更新日期
      await this.kv.put(lastUpdateKey, today);

      console.log(`sitemap 已保存到 KV: ${url} (hash: ${urlHash})`);
      return {
        success: true,
        errorMsg: "",
        datedFile: `sitemap_dated_${urlHash}_${today}`,
        newUrls
      };

    } catch (error) {
      console.error(`下载 sitemap 失败: ${url}`, error);
      return {
        success: false,
        errorMsg: `下载失败: ${error.message}`,
        datedFile: null,
        newUrls: []
      };
    }
  }

  /**
   * 添加 sitemap 监控
   * @param {string} url - sitemap 的 URL
   * @param {boolean} forceUpdate - 是否强制更新，忽略每日限制（用于手动触发）
   * @returns {Promise<Object>} 结果对象
   */
  async addFeed(url, forceUpdate = false) {
    try {
      console.log(`尝试添加 sitemap 监控: ${url}${forceUpdate ? ' (强制更新)' : ''}`);

      // 验证是否已存在
      const feeds = await this.getFeeds();
      if (!feeds.includes(url)) {
        // 如果是新的 feed，先尝试下载
        const result = await this.downloadSitemap(url, forceUpdate);
        if (!result.success) {
          return result;
        }

        // 添加到监控列表
        feeds.push(url);
        await this.kv.put(this.feedsKey, JSON.stringify(feeds));
        console.log(`成功添加 sitemap 监控: ${url}`);
        return {
          ...result,
          errorMsg: result.errorMsg || "成功添加"
        };
      } else {
        // 如果 feed 已存在，仍然尝试下载（可能是新的一天或强制更新）
        const result = await this.downloadSitemap(url, forceUpdate);
        if (!result.success) {
          return result;
        }
        return {
          ...result,
          errorMsg: forceUpdate ? "强制更新完成" : "已存在的feed更新成功"
        };
      }

    } catch (error) {
      console.error(`添加 sitemap 监控失败: ${url}`, error);
      return {
        success: false,
        errorMsg: `添加失败: ${error.message}`,
        datedFile: null,
        newUrls: []
      };
    }
  }

  /**
   * 删除 RSS 订阅
   * @param {string} url - RSS 订阅链接
   * @returns {Promise<Object>} 结果对象
   */
  async removeFeed(url) {
    try {
      console.log(`尝试删除 RSS 订阅: ${url}`);
      const feeds = await this.getFeeds();

      if (!feeds.includes(url)) {
        console.warn(`RSS 订阅不存在: ${url}`);
        return {
          success: false,
          errorMsg: "该RSS订阅不存在"
        };
      }

      feeds.splice(feeds.indexOf(url), 1);
      await this.kv.put(this.feedsKey, JSON.stringify(feeds));
      console.log(`成功删除 RSS 订阅: ${url}`);
      return {
        success: true,
        errorMsg: ""
      };

    } catch (error) {
      console.error(`删除 RSS 订阅失败: ${url}`, error);
      return {
        success: false,
        errorMsg: `删除失败: ${error.message}`
      };
    }
  }

  /**
   * 比较新旧 sitemap，返回新增的 URL 列表
   * @param {string} currentContent - 当前 sitemap 内容
   * @param {string} oldContent - 旧的 sitemap 内容
   * @returns {string[]} 新增的 URL 列表
   */
  compareSitemaps(currentContent, oldContent) {
    try {
      const currentUrls = extractURLs(currentContent);
      const oldUrls = extractURLs(oldContent);

      const newUrls = currentUrls.filter(url => !oldUrls.includes(url));
      console.log(`发现 ${newUrls.length} 个新 URL`);
      return newUrls;

    } catch (error) {
      console.error(`比较 sitemap 失败:`, error);
      return [];
    }
  }

  /**
   * 获取 sitemap 内容
   * @param {string} url - sitemap URL
   * @param {string} type - 类型 (current, latest, dated)
   * @param {string} date - 日期 (可选，用于 dated 类型)
   * @returns {Promise<string|null>} sitemap 内容
   */
  async getSitemapContent(url, type = 'current', date = null) {
    try {
      const urlHash = this.generateUrlHash(url);
      let key;
      switch (type) {
        case 'current':
          key = `sitemap_current_${urlHash}`;
          break;
        case 'latest':
          key = `sitemap_latest_${urlHash}`;
          break;
        case 'dated':
          if (!date) {
            date = new Date().toISOString().split('T')[0].replace(/-/g, '');
          }
          key = `sitemap_dated_${urlHash}_${date}`;
          break;
        default:
          throw new Error(`未知的 sitemap 类型: ${type}`);
      }

      return await this.kv.get(key);
    } catch (error) {
      console.error(`获取 sitemap 内容失败:`, error);
      return null;
    }
  }
} 