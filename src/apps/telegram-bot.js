/**
 * Telegram 机器人模块
 * 对应原 Python 项目的 apps/telegram_bot.py
 * 使用 Telegram Bot API 的 HTTP 接口
 */

import { telegramConfig } from '../config.js';

/**
 * 发送消息到 Telegram
 * @param {string} chatId - 聊天 ID
 * @param {string} text - 消息文本
 * @param {Object} options - 其他选项
 * @returns {Promise<Object>} API 响应
 */
export async function sendMessage(chatId, text, options = {}) {
  try {
    const url = `https://api.telegram.org/bot${telegramConfig.token}/sendMessage`;
    const data = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: options.disableWebPagePreview !== false,
      ...options
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('发送 Telegram 消息失败:', error);
    throw error;
  }
}

/**
 * 发送文档到 Telegram
 * @param {string} chatId - 聊天 ID
 * @param {string} document - 文档内容
 * @param {string} filename - 文件名
 * @param {string} caption - 说明文字
 * @returns {Promise<Object>} API 响应
 */
export async function sendDocument(chatId, document, filename, caption = '') {
  try {
    const url = `https://api.telegram.org/bot${telegramConfig.token}/sendDocument`;

    // 创建 FormData
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', new Blob([document], { type: 'application/xml' }), filename);
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('发送 Telegram 文档失败:', error);
    throw error;
  }
}

/**
 * 发送 sitemap 更新通知
 * @param {string} url - sitemap URL
 * @param {string[]} newUrls - 新增的 URL 列表
 * @param {string} sitemapContent - sitemap 内容
 * @param {string} targetChat - 目标聊天 ID
 * @returns {Promise<void>}
 */
export async function sendUpdateNotification(url, newUrls, sitemapContent, targetChat = null) {
  const chatId = targetChat || telegramConfig.targetChat;
  if (!chatId) {
    console.error('未配置发送目标，请检查 TELEGRAM_TARGET_CHAT 环境变量');
    return;
  }

  const domain = new URL(url).hostname;

  // 静默模式：只有在有新URL时才发送通知
  if (!newUrls || newUrls.length === 0) {
    console.log(`静默模式：${domain} 无更新，跳过通知`);
    return;
  }

  try {
    // 构造标题消息
    const headerMessage =
      `✨ <b>${domain}</b> ✨\n` +
      `------------------------------------\n` +
      `发现新增内容！ (共 ${newUrls.length} 条)\n` +
      `来源: ${url}\n`;

    // 发送 sitemap 文件
    if (sitemapContent) {
      const filename = `${domain}_sitemap_${new Date().toISOString().split('T')[0]}.xml`;
      await sendDocument(chatId, sitemapContent, filename, headerMessage);
      console.log(`已发送 sitemap 文件: ${filename} for ${url}`);
    } else {
      // 没有文件时，发送文本消息
      await sendMessage(chatId, headerMessage);
    }

    // 发送新增的 URL
    console.log(`开始发送 ${newUrls.length} 个新URL for ${domain}`);

    for (const url of newUrls) {
      await sendMessage(chatId, url, { disableWebPagePreview: false });
      console.log(`已发送URL: ${url}`);
      // 添加延迟避免频率限制
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 发送更新结束消息
    await new Promise(resolve => setTimeout(resolve, 1000));
    const endMessage = `✨ ${domain} 更新推送完成 ✨\n------------------------------------`;
    await sendMessage(chatId, endMessage);
    console.log(`已发送更新结束消息 for ${domain}`);

  } catch (error) {
    console.error(`发送 URL 更新消息失败 for ${url}:`, error);
  }
}

/**
 * 发送详细变更报告
 * @param {Object[]} sitemapChanges - 每个sitemap的变更信息数组
 * @param {string} targetChat - 目标聊天 ID
 * @returns {Promise<void>}
 */
export async function sendDetailedReport(sitemapChanges, targetChat = null) {
  const chatId = targetChat || telegramConfig.targetChat;
  if (!chatId) {
    console.error('未配置发送目标，请检查 TELEGRAM_TARGET_CHAT 环境变量');
    return;
  }

  if (!sitemapChanges || sitemapChanges.length === 0) {
    console.log('没有变更，跳过报告');
    return;
  }

  try {
    let totalNewUrls = 0;
    
    // 发送报告标题
    const reportTitle =
      `📊 <b>站点变更报告</b>\n` +
      `====================================\n` +
      `时间: ${new Date().toLocaleString('zh-CN')}\n` +
      `共检测到 ${sitemapChanges.length} 个sitemap有变更\n`;
    
    await sendMessage(chatId, reportTitle);

    // 处理每个有变更的sitemap
    for (const change of sitemapChanges) {
      const { url, newUrls, domain } = change;
      totalNewUrls += newUrls.length;

      // 发送sitemap变更摘要
      const sitemapSummary =
        `🔍 <b>${domain}</b>\n` +
        `来源: ${url}\n` +
        `新增页面: ${newUrls.length} 个\n` +
        `------------------------------------`;
      
      await sendMessage(chatId, sitemapSummary);

      // 发送新增页面列表
      if (newUrls.length > 0) {
        const urlList = newUrls.map((url, index) => `${index + 1}. ${url}`).join('\n');
        
        // 如果URL列表太长，分批发送
        if (urlList.length > 4000) {
          const chunks = splitLongMessage(urlList);
          for (const chunk of chunks) {
            await sendMessage(chatId, chunk, { disableWebPagePreview: true });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          await sendMessage(chatId, urlList, { disableWebPagePreview: true });
        }
      }

      // 添加间隔
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 发送汇总信息
    const finalSummary =
      `✅ <b>报告完成</b>\n` +
      `====================================\n` +
      `总计新增页面: ${totalNewUrls} 个\n` +
      `涉及sitemap: ${sitemapChanges.length} 个\n` +
      `数据更新时间: ${new Date().toLocaleString('zh-CN')}`;

    await sendMessage(chatId, finalSummary);
    console.log(`已发送详细变更报告，共 ${totalNewUrls} 个新页面`);

  } catch (error) {
    console.error('发送详细变更报告失败:', error);
  }
}

/**
 * 分割长消息
 * @param {string} message - 长消息文本
 * @returns {string[]} 分割后的消息数组
 */
function splitLongMessage(message) {
  const maxLength = 4000;
  const chunks = [];
  let currentChunk = '';
  
  const lines = message.split('\n');
  
  for (const line of lines) {
    if ((currentChunk + line).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
    }
    currentChunk += line + '\n';
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * 发送关键词汇总（保留向后兼容）
 * @param {string[]} allNewUrls - 所有新增的 URL 列表
 * @param {string} targetChat - 目标聊天 ID
 * @returns {Promise<void>}
 */
export async function sendKeywordsSummary(allNewUrls, targetChat = null) {
  // 将旧的关键词汇总转换为详细报告格式
  if (!allNewUrls || allNewUrls.length === 0) {
    console.log('没有新的 URL，跳过关键词汇总');
    return;
  }

  // 将URL按域名分组
  const changesByDomain = {};
  for (const url of allNewUrls) {
    try {
      const domain = new URL(url).hostname;
      if (!changesByDomain[domain]) {
        changesByDomain[domain] = {
          domain,
          url: `https://${domain}/sitemap.xml`,
          newUrls: []
        };
      }
      changesByDomain[domain].newUrls.push(url);
    } catch (error) {
      console.error(`处理URL失败: ${url}`, error);
    }
  }

  const sitemapChanges = Object.values(changesByDomain);
  await sendDetailedReport(sitemapChanges, targetChat);
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

/**
 * 处理 Telegram Webhook 更新
 * @param {Object} update - Telegram 更新对象
 * @param {RSSManager} rssManager - RSS 管理器实例
 * @returns {Promise<Object>} 响应对象
 */
export async function handleTelegramUpdate(update, rssManager) {
  try {
    if (!update.message || !update.message.text) {
      return { success: true };
    }

    const message = update.message;
    const text = message.text.trim();
    const chatId = message.chat.id;

    console.log(`收到 Telegram 消息: ${text} from ${message.from.username || message.from.id}`);

    // 处理命令
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      switch (command) {
        case '/start':
        case '/help':
          await sendMessage(chatId,
            `Hello, ${message.from.first_name || 'User'}!\n\n` +
            `这是一个站点监控机器人，支持以下命令：\n` +
            `/rss list - 显示所有监控的sitemap\n` +
            `/rss add URL - 添加sitemap监控\n` +
            `/rss del URL - 删除sitemap监控\n` +
            `/news - 手动触发关键词汇总`
          );
          break;

        case '/rss':
          await handleRSSCommand(chatId, args, rssManager);
          break;

        case '/news':
          await handleNewsCommand(chatId, rssManager);
          break;

        default:
          await sendMessage(chatId, '未知命令，请使用 /help 查看帮助');
      }
    }

    return { success: true };
  } catch (error) {
    console.error('处理 Telegram 更新失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 处理 RSS 命令
 * @param {string} chatId - 聊天 ID
 * @param {string[]} args - 命令参数
 * @param {RSSManager} rssManager - RSS 管理器实例
 * @returns {Promise<void>}
 */
async function handleRSSCommand(chatId, args, rssManager) {
  if (args.length === 0) {
    await sendMessage(chatId,
      '请使用以下命令：\n' +
      '/rss list - 显示所有监控的sitemap\n' +
      '/rss add URL - 添加sitemap监控（URL必须以sitemap.xml结尾）\n' +
      '/rss del URL - 删除sitemap监控'
    );
    return;
  }

  const cmd = args[0].toLowerCase();

  switch (cmd) {
    case 'list':
      const feeds = await rssManager.getFeeds();
      if (feeds.length === 0) {
        await sendMessage(chatId, '当前没有RSS订阅');
        return;
      }

      const feedList = feeds.map(feed => `- ${feed}`).join('\n');
      await sendMessage(chatId, `当前RSS订阅列表：\n${feedList}`);
      break;

    case 'add':
      if (args.length < 2) {
        await sendMessage(chatId,
          '请提供sitemap.xml的URL\n例如：/rss add https://example.com/sitemap.xml'
        );
        return;
      }

      const url = args[1];
      if (!url.toLowerCase().includes('sitemap')) {
        await sendMessage(chatId, 'URL必须包含sitemap关键词');
        return;
      }

      const result = await rssManager.addFeed(url);
      if (result.success) {
        await sendMessage(chatId, `成功添加sitemap监控：${url}`);
        await sendUpdateNotification(url, result.newUrls, null, chatId);
      } else {
        await sendMessage(chatId, `添加sitemap监控失败：${url}\n原因：${result.errorMsg}`);
      }
      break;

    case 'del':
      if (args.length < 2) {
        await sendMessage(chatId,
          '请提供要删除的RSS订阅链接\n例如：/rss del https://example.com/feed.xml'
        );
        return;
      }

      const delUrl = args[1];
      const delResult = await rssManager.removeFeed(delUrl);
      if (delResult.success) {
        await sendMessage(chatId, `成功删除RSS订阅：${delUrl}`);
      } else {
        await sendMessage(chatId, `删除RSS订阅失败：${delUrl}\n原因：${delResult.errorMsg}`);
      }
      break;

    default:
      await sendMessage(chatId, '未知的RSS命令，请使用 /rss 查看帮助');
  }
}

/**
 * 处理新闻命令
 * @param {string} chatId - 聊天 ID
 * @param {RSSManager} rssManager - RSS 管理器实例
 * @returns {Promise<void>}
 */
async function handleNewsCommand(chatId, rssManager) {
  try {
    const feeds = await rssManager.getFeeds();
    if (feeds.length === 0) {
      await sendMessage(chatId, '当前没有监控的sitemap');
      return;
    }

    await sendMessage(chatId, '开始手动触发详细变更报告...');

    // 用于存储每个sitemap的变更信息
    const sitemapChanges = [];
    
    for (const url of feeds) {
      try {
        // 使用 addFeed 方法强制更新，忽略每日限制
        const result = await rssManager.addFeed(url, true);
        if (result.success && result.newUrls && result.newUrls.length > 0) {
          const domain = new URL(url).hostname;
          sitemapChanges.push({
            url,
            domain,
            newUrls: result.newUrls
          });
          console.log(`发现 ${result.newUrls.length} 个新URL from ${url}`);
        }
      } catch (error) {
        console.error(`处理 sitemap 失败: ${url}`, error);
      }
    }

    if (sitemapChanges.length === 0) {
      await sendMessage(chatId, '没有发现新的内容');
    } else {
      await sendDetailedReport(sitemapChanges, chatId);
    }

  } catch (error) {
    console.error('处理新闻命令失败:', error);
    await sendMessage(chatId, '处理新闻命令失败，请稍后重试');
  }
} 