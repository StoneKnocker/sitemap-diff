/**
 * Discord 机器人模块
 * 对应原 Python 项目的 apps/discord_bot.py
 * 使用 Discord Webhook 或 Bot API
 */

import { discordConfig } from '../config.js';

/**
 * 发送消息到 Discord
 * @param {string} channelId - 频道 ID
 * @param {string} content - 消息内容
 * @param {Object} options - 其他选项
 * @returns {Promise<Object>} API 响应
 */
export async function sendDiscordMessage(channelId, content, options = {}) {
  try {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const data = {
      content: content,
      ...options
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${discordConfig.token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('发送 Discord 消息失败:', error);
    throw error;
  }
}

/**
 * 发送文件到 Discord
 * @param {string} channelId - 频道 ID
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} message - 附加消息
 * @returns {Promise<Object>} API 响应
 */
export async function sendDiscordFile(channelId, content, filename, message = '') {
  try {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

    // 创建 FormData
    const formData = new FormData();
    formData.append('file', new Blob([content], { type: 'application/xml' }), filename);
    if (message) {
      formData.append('content', message);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${discordConfig.token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('发送 Discord 文件失败:', error);
    throw error;
  }
}

/**
 * 处理 Discord 交互
 * @param {Object} interaction - Discord 交互对象
 * @param {RSSManager} rssManager - RSS 管理器实例
 * @returns {Promise<Object>} 响应对象
 */
export async function handleDiscordInteraction(interaction, rssManager) {
  try {
    if (interaction.type === 1) { // PING
      return { type: 1 }; // PONG
    }

    if (interaction.type === 2) { // APPLICATION_COMMAND
      const command = interaction.data.name;
      const options = interaction.data.options || [];

      console.log(`收到 Discord 命令: ${command}`);

      let response = '';

      switch (command) {
        case 'rss':
          response = await handleDiscordRSSCommand(options, rssManager);
          break;

        case 'news':
          response = await handleDiscordNewsCommand(rssManager);
          break;

        default:
          response = '未知命令，请使用 /help 查看帮助';
      }

      return {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: response
        }
      };
    }

    return { success: true };
  } catch (error) {
    console.error('处理 Discord 交互失败:', error);
    return {
      type: 4,
      data: {
        content: '处理命令时发生错误，请稍后重试'
      }
    };
  }
}

/**
 * 处理 Discord RSS 命令
 * @param {Array} options - 命令选项
 * @param {RSSManager} rssManager - RSS 管理器实例
 * @returns {Promise<string>} 响应消息
 */
async function handleDiscordRSSCommand(options, rssManager) {
  if (options.length === 0) {
    return '请使用以下命令：\n' +
      '/rss list - 显示所有监控的sitemap\n' +
      '/rss add URL - 添加sitemap监控\n' +
      '/rss del URL - 删除sitemap监控';
  }

  const subCommand = options[0].name;

  switch (subCommand) {
    case 'list':
      const feeds = await rssManager.getFeeds();
      if (feeds.length === 0) {
        return '当前没有RSS订阅';
      }

      const feedList = feeds.map(feed => `- ${feed}`).join('\n');
      return `当前RSS订阅列表：\n${feedList}`;

    case 'add':
      const url = options[0].options?.[0]?.value;
      if (!url) {
        return '请提供sitemap.xml的URL';
      }

      if (!url.toLowerCase().includes('sitemap')) {
        return 'URL必须包含sitemap关键词';
      }

      const result = await rssManager.addFeed(url);
      if (result.success) {
        return `成功添加sitemap监控：${url}`;
      } else {
        return `添加sitemap监控失败：${url}\n原因：${result.errorMsg}`;
      }

    case 'del':
      const delUrl = options[0].options?.[0]?.value;
      if (!delUrl) {
        return '请提供要删除的RSS订阅链接';
      }

      const delResult = await rssManager.removeFeed(delUrl);
      if (delResult.success) {
        return `成功删除RSS订阅：${delUrl}`;
      } else {
        return `删除RSS订阅失败：${delUrl}\n原因：${delResult.errorMsg}`;
      }

    default:
      return '未知的RSS命令，请使用 /rss 查看帮助';
  }
}

/**
 * 处理 Discord 新闻命令
 * @param {RSSManager} rssManager - RSS 管理器实例
 * @returns {Promise<string>} 响应消息
 */
async function handleDiscordNewsCommand(rssManager) {
  try {
    const feeds = await rssManager.getFeeds();
    if (feeds.length === 0) {
      return '当前没有监控的sitemap';
    }

    const allNewUrls = [];
    for (const url of feeds) {
      try {
        // 使用 addFeed 方法强制更新，忽略每日限制
        const result = await rssManager.addFeed(url, true);
        if (result.success && result.newUrls && result.newUrls.length > 0) {
          allNewUrls.push(...result.newUrls);
          console.log(`发现 ${result.newUrls.length} 个新URL from ${url}`);
        }
      } catch (error) {
        console.error(`处理 sitemap 失败: ${url}`, error);
      }
    }

    if (allNewUrls.length === 0) {
      return '没有发现新的内容';
    }

    const keywords = extractKeywords(allNewUrls);
    return `📊 关键词汇总\n` +
      `------------------------------------\n` +
      `今日新增内容: ${allNewUrls.length} 条\n` +
      `主要关键词: ${keywords.join(', ')}\n` +
      `------------------------------------\n` +
      `时间: ${new Date().toLocaleString('zh-CN')}`;

  } catch (error) {
    console.error('处理 Discord 新闻命令失败:', error);
    return '处理新闻命令失败，请稍后重试';
  }
}

/**
 * 提取关键词（简化版本）
 * @param {string[]} urls - URL 列表
 * @returns {string[]} 关键词列表
 */
function extractKeywords(urls) {
  const keywords = new Set();

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // 简单的关键词提取逻辑
      const segments = path.split('/').filter(segment => segment.length > 2);
      for (const segment of segments) {
        if (segment.length > 3 && !segment.includes('-')) {
          keywords.add(segment);
        }
      }
    } catch (error) {
      // 忽略无效 URL
    }
  }

  return Array.from(keywords).slice(0, 10); // 最多返回10个关键词
} 