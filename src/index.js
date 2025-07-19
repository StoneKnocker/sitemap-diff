/**
 * Cloudflare Workers 主入口文件
 * 对应原 Python 项目的 site-bot.py
 */

import { initConfig, validateConfig } from "./config.js";
import { RSSManager } from "./services/rss-manager.js";
import { ReportManager } from "./services/report-manager.js";
import {
  sendUpdateNotification,
  handleTelegramUpdate,
  sendDetailedReport,
} from "./apps/telegram-bot.js";
import { handleDiscordInteraction } from "./apps/discord-bot.js";
import { extractURLs } from "./services/xml-parser.js";

// 全局变量
let rssManager = null;
let reportManager = null;

/**
 * 初始化应用
 * @param {Object} env - 环境变量
 */
function initializeApp(env) {
  console.log("🚀 初始化 Site Bot...");

  // 初始化配置
  initConfig(env);

  // 验证配置
  const validation = validateConfig();
  if (!validation.isValid) {
    console.error("❌ 配置验证失败:", validation.errors);
    throw new Error(`配置错误: ${validation.errors.join(", ")}`);
  }

  // 初始化 RSS 管理器
  if (env.SITEMAP_STORAGE) {
    rssManager = new RSSManager(env.SITEMAP_STORAGE);
    reportManager = new ReportManager(env.SITEMAP_STORAGE);
    console.log("✅ RSS 管理器初始化成功");
    console.log("✅ 报告管理器初始化成功");
  } else {
    console.warn("⚠️ 未配置 KV 存储，某些功能可能不可用");
  }

  console.log("✅ Site Bot 初始化完成");
}

/**
 * 执行定时监控任务
 * @param {Object} env - 环境变量
 */
async function performScheduledMonitoring(env) {
  try {
    console.log("⏰ 开始执行定时监控任务...");

    if (!rssManager) {
      console.error("❌ RSS 管理器未初始化");
      return;
    }

    const feeds = await rssManager.getFeeds();
    console.log(`📊 检查 ${feeds.length} 个订阅源更新`);

    if (feeds.length === 0) {
      console.log("📭 没有配置的订阅源");
      return;
    }

    // 用于存储每个sitemap的变更信息
    const sitemapChanges = [];
    let totalChanges = 0;

    for (const url of feeds) {
      try {
        console.log(`🔍 正在检查订阅源: ${url}`);

        const result = await rssManager.addFeed(url);

        if (result.success) {
          // 跳过内容无变化的情况
          if (result.errorMsg === "内容无变化，跳过更新") {
            console.log(`🔄 订阅源 ${url} 内容无变化，跳过`);
            continue;
          }

          // 获取 sitemap 内容用于发送
          let sitemapContent = null;
          if (result.datedFile) {
            sitemapContent = await rssManager.getSitemapContent(url, "dated");
          }

          // 只有在有新URL时才记录变更
          if (result.newUrls && result.newUrls.length > 0) {
            const domain = new URL(url).hostname;
            sitemapChanges.push({
              url,
              domain,
              newUrls: result.newUrls,
              sitemapContent,
            });
            totalChanges += result.newUrls.length;

            // 使用新的报告系统发送单个更新通知
            await sendUpdateNotification(
              url,
              result.newUrls,
              sitemapContent,
              reportManager
            );
            console.log(
              `✨ 订阅源 ${url} 更新成功，发现 ${result.newUrls.length} 个新URL`
            );
          } else {
            console.log(`✅ 订阅源 ${url} 更新成功，无新增URL（静默模式）`);
          }
        } else {
          console.warn(`⚠️ 订阅源 ${url} 更新失败: ${result.errorMsg}`);
        }

        // 添加延迟避免频率限制
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ 检查订阅源失败: ${url}`, error);
      }
    }

    // 发送详细变更报告（使用新的报告系统）
    if (sitemapChanges.length > 0) {
      console.log(
        `📊 发送详细变更报告，共 ${sitemapChanges.length} 个sitemap有变更，总计 ${totalChanges} 个新URL`
      );
      await sendDetailedReport(sitemapChanges, null, reportManager);
    } else {
      console.log("📊 本次监控未发现任何变更，跳过发送报告");
    }

    console.log("✅ 定时监控任务完成");

    // 定期清理旧报告（每周执行一次）
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = 周日

      // 每周日清理旧报告
      if (dayOfWeek === 0) {
        console.log("🧹 开始清理旧报告...");
        await reportManager.cleanupOldReports(30); // 保留30天
      }
    } catch (error) {
      console.error("清理旧报告失败:", error);
    }
  } catch (error) {
    console.error("❌ 定时监控任务失败:", error);
  }
}

/**
 * 处理 HTTP 请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} ctx - 上下文对象
 * @returns {Response} 响应对象
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // 健康检查
    if (path === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          service: "site-bot",
          version: "1.0.0",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 手动触发监控
    if (path === "/monitor" && request.method === "POST") {
      ctx.waitUntil(performScheduledMonitoring(env));
      return new Response(
        JSON.stringify({
          status: "success",
          message: "监控任务已启动",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 强制更新单个sitemap（用于调试）
    if (path === "/debug/sitemap" && request.method === "POST") {
      const body = await request.json();
      const { url } = body;

      if (!url) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: "请提供sitemap URL",
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      try {
        const result = await rssManager.downloadSitemap(url, true); // 强制更新
        return new Response(
          JSON.stringify({
            status: "success",
            url,
            result: {
              success: result.success,
              newUrls: result.newUrls || [],
              errorMsg: result.errorMsg,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: error.message,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 重置sitemap监控状态（用于调试）
    if (path === "/debug/reset" && request.method === "POST") {
      const body = await request.json();
      const { url } = body;

      if (!url) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: "请提供sitemap URL",
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      try {
        const urlHash = rssManager.generateUrlHash(url);
        const keys = [
          `sitemap_current_${urlHash}`,
          `sitemap_latest_${urlHash}`,
          `last_update_${urlHash}`,
        ];

        // 删除相关键
        for (const key of keys) {
          await env.SITEMAP_STORAGE.delete(key);
        }

        return new Response(
          JSON.stringify({
            status: "success",
            message: "已重置sitemap监控状态",
            url,
            deletedKeys: keys,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: error.message,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 查看sitemap监控状态
    if (path === "/debug/status" && request.method === "GET") {
      const url = new URL(request.url).searchParams.get("url");

      if (!url) {
        return new Response(
          JSON.stringify({
            status: "error",
            message:
              "请提供sitemap URL参数，例如: /debug/status?url=https://example.com/sitemap.xml",
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      try {
        const urlHash = rssManager.generateUrlHash(url);
        const today = new Date().toISOString().split("T")[0].replace(/-/g, "");

        const keys = {
          current: `sitemap_current_${urlHash}`,
          latest: `sitemap_latest_${urlHash}`,
          lastUpdate: `last_update_${urlHash}`,
          dated: `sitemap_dated_${urlHash}_${today}`,
        };

        const results = {};
        for (const [name, key] of Object.entries(keys)) {
          const value = await env.SITEMAP_STORAGE.get(key);
          if (value) {
            const urls = extractURLs(value);
            results[name] = {
              urlCount: urls.length,
              urls: urls,
              contentLength: value.length,
            };
          } else {
            results[name] = null;
          }
        }

        // 获取当前实际sitemap内容
        const response = await fetch(url);
        const currentContent = await response.text();
        const currentUrls = extractURLs(currentContent);

        return new Response(
          JSON.stringify({
            status: "success",
            url,
            urlHash,
            today,
            storage: results,
            actual: {
              urlCount: currentUrls.length,
              urls: currentUrls,
              contentLength: currentContent.length,
            },
            comparison: {
              shouldDetectChanges: results.current
                ? currentUrls.filter(
                    (u) =>
                      !extractURLs(results.current.content || "").includes(u)
                  ).length > 0
                : true,
              missingInStorage: results.current
                ? currentUrls.filter(
                    (u) =>
                      !extractURLs(results.current.content || "").includes(u)
                  )
                : currentUrls,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: error.message,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 报告服务
    if (path.startsWith("/reports/")) {
      const reportId = path.split("/reports/")[1];

      if (!reportId || reportId.includes("..") || reportId.includes("/")) {
        return new Response("Invalid report ID", { status: 400 });
      }

      if (request.method === "GET") {
        try {
          const reportContent = await reportManager.getReport(reportId);
          if (!reportContent) {
            return new Response("Report not found", { status: 404 });
          }

          return new Response(reportContent, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          return new Response("Error retrieving report", { status: 500 });
        }
      }
    }

    // 报告列表
    if (path === "/reports" && request.method === "GET") {
      try {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get("limit")) || 20;
        const domain = url.searchParams.get("domain");

        let reports;
        if (domain) {
          reports = await reportManager.getDomainReports(domain, limit);
        } else {
          reports = await reportManager.getReportsList(limit);
        }

        return new Response(
          JSON.stringify({
            status: "success",
            reports,
            count: reports.length,
            ...(domain && { domain }),
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: error.message,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // 清理旧报告（管理员功能）
    if (path === "/admin/cleanup-reports" && request.method === "POST") {
      try {
        const body = await request.json();
        const daysToKeep = body.days || 30;

        await reportManager.cleanupOldReports(daysToKeep);

        return new Response(
          JSON.stringify({
            status: "success",
            message: `Started cleanup for reports older than ${daysToKeep} days`,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: error.message,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Telegram Webhook
    if (path === "/webhook/telegram" && request.method === "POST") {
      const update = await request.json();
      const result = await handleTelegramUpdate(
        update,
        rssManager,
        reportManager
      );

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Discord Webhook
    if (path === "/webhook/discord" && request.method === "POST") {
      const interaction = await request.json();
      const result = await handleDiscordInteraction(interaction, rssManager);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // API 状态
    if (path === "/api/status") {
      const feeds = rssManager ? await rssManager.getFeeds() : [];
      return new Response(
        JSON.stringify({
          status: "running",
          feeds: feeds,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 默认响应
    return new Response(
      JSON.stringify({
        message: "Site Bot API",
        endpoints: [
          "/health - 健康检查",
          "/monitor - 手动触发监控 (POST)",
          "/webhook/telegram - Telegram Webhook",
          "/webhook/discord - Discord Webhook",
          "/api/status - API 状态",
          "/reports - 报告列表 (GET)",
          "/reports?domain=example.com - 指定域名报告列表",
          "/reports/:id - 查看报告 (GET)",
          "/admin/cleanup-reports - 清理旧报告 (POST)",
        ],
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("处理请求失败:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Cloudflare Workers 事件处理器
export default {
  // 处理 HTTP 请求
  async fetch(request, env, ctx) {
    // 确保应用已初始化
    if (!rssManager) {
      try {
        initializeApp(env);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Initialization Failed",
            message: error.message,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return await handleRequest(request, env, ctx);
  },

  // 定时任务触发器
  async scheduled(event, env, ctx) {
    console.log("⏰ 收到定时任务触发");

    // 确保应用已初始化
    if (!rssManager) {
      try {
        initializeApp(env);
      } catch (error) {
        console.error("❌ 初始化失败:", error);
        return;
      }
    }

    // 执行监控任务
    ctx.waitUntil(performScheduledMonitoring(env));
  },
};
