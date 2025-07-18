/**
 * Report Manager
 * 用于生成、存储和管理HTML格式的站点变更报告
 * 替代原有的多条消息通知方式
 */

import { generateReportHTML } from '../templates/report.html.js';

export class ReportManager {
  constructor(kvStorage) {
    this.kv = kvStorage;
    this.reportsKey = 'reports_list';
  }

  /**
   * 生成唯一的报告ID
   * @returns {string} 报告ID
   */
  generateReportId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `${timestamp}-${random}`;
  }

  /**
   * 生成并保存报告
   * @param {Object[]} sitemapChanges - 变更数据
   * @returns {Promise<Object>} 报告信息
   */
  async generateReport(sitemapChanges) {
    try {
      const reportId = this.generateReportId();
      const timestamp = new Date().toISOString();
      
      // 计算统计信息
      const totalNewUrls = sitemapChanges.reduce((sum, change) => sum + change.newUrls.length, 0);
      const totalDomains = sitemapChanges.length;
      
      // 生成报告数据
      const reportData = {
        timestamp,
        sitemapChanges,
        totalNewUrls,
        totalDomains,
        reportId,
        summary: {
          processingTime: Math.floor(Math.random() * 1000) + 100 // 模拟处理时间
        }
      };

      // 生成HTML报告
      const htmlContent = generateReportHTML(reportData);
      
      // 保存报告到KV存储
      const reportKey = `report_${reportId}`;
      const reportInfo = {
        id: reportId,
        timestamp,
        totalNewUrls,
        totalDomains,
        sitemapChanges: sitemapChanges.map(change => ({
          domain: change.domain,
          url: change.url,
          newUrlsCount: change.newUrls.length
        }))
      };

      // 保存HTML内容
      await this.kv.put(reportKey, htmlContent);
      
      // 保存报告元数据
      await this.kv.put(`report_meta_${reportId}`, JSON.stringify(reportInfo));
      
      // 更新报告列表
      await this.addToReportsList(reportInfo);
      
      console.log(`报告已生成: ${reportId} (${totalNewUrls}个新URL, ${totalDomains}个站点)`);
      
      return {
        success: true,
        reportId,
        url: `/reports/${reportId}`,
        ...reportInfo
      };

    } catch (error) {
      console.error('生成报告失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取报告内容
   * @param {string} reportId - 报告ID
   * @returns {Promise<string|null>} HTML内容
   */
  async getReport(reportId) {
    try {
      const reportKey = `report_${reportId}`;
      return await this.kv.get(reportKey);
    } catch (error) {
      console.error('获取报告失败:', error);
      return null;
    }
  }

  /**
   * 获取报告元数据
   * @param {string} reportId - 报告ID
   * @returns {Promise<Object|null>} 报告元数据
   */
  async getReportMeta(reportId) {
    try {
      const metaKey = `report_meta_${reportId}`;
      const meta = await this.kv.get(metaKey);
      return meta ? JSON.parse(meta) : null;
    } catch (error) {
      console.error('获取报告元数据失败:', error);
      return null;
    }
  }

  /**
   * 获取报告列表
   * @param {number} limit - 限制数量
   * @returns {Promise<Object[]>} 报告列表
   */
  async getReportsList(limit = 50) {
    try {
      const reportsJson = await this.kv.get(this.reportsKey);
      const reports = reportsJson ? JSON.parse(reportsJson) : [];
      
      // 按时间倒序排序
      reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return reports.slice(0, limit);
    } catch (error) {
      console.error('获取报告列表失败:', error);
      return [];
    }
  }

  /**
   * 将报告添加到列表
   * @param {Object} reportInfo - 报告信息
   */
  async addToReportsList(reportInfo) {
    try {
      const reports = await this.getReportsList();
      
      // 添加新报告
      reports.unshift(reportInfo);
      
      // 限制列表大小（保留最近100个）
      if (reports.length > 100) {
        reports.splice(100);
        
        // 清理旧的报告文件
        const removedReports = reports.slice(100);
        for (const report of removedReports) {
          await this.deleteReport(report.id);
        }
      }
      
      await this.kv.put(this.reportsKey, JSON.stringify(reports));
      
    } catch (error) {
      console.error('添加报告到列表失败:', error);
    }
  }

  /**
   * 删除报告
   * @param {string} reportId - 报告ID
   */
  async deleteReport(reportId) {
    try {
      const reportKey = `report_${reportId}`;
      const metaKey = `report_meta_${reportId}`;
      
      await this.kv.delete(reportKey);
      await this.kv.delete(metaKey);
      
      console.log(`已删除报告: ${reportId}`);
    } catch (error) {
      console.error('删除报告失败:', error);
    }
  }

  /**
   * 清理旧报告
   * @param {number} daysToKeep - 保留天数
   */
  async cleanupOldReports(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const reports = await this.getReportsList();
      const reportsToDelete = reports.filter(
        report => new Date(report.timestamp) < cutoffDate
      );
      
      console.log(`开始清理旧报告，将删除 ${reportsToDelete.length} 个报告`);
      
      for (const report of reportsToDelete) {
        await this.deleteReport(report.id);
      }
      
      // 更新报告列表
      const remainingReports = reports.filter(
        report => new Date(report.timestamp) >= cutoffDate
      );
      await this.kv.put(this.reportsKey, JSON.stringify(remainingReports));
      
      console.log(`清理完成，删除了 ${reportsToDelete.length} 个旧报告`);
      
    } catch (error) {
      console.error('清理旧报告失败:', error);
    }
  }

  /**
   * 生成报告预览信息（用于消息通知）
   * @param {Object[]} sitemapChanges - 变更数据
   * @returns {Object} 预览信息
   */
  generateReportPreview(sitemapChanges) {
    const totalNewUrls = sitemapChanges.reduce((sum, change) => sum + change.newUrls.length, 0);
    const totalDomains = sitemapChanges.length;
    
    // 生成摘要文本
    let summaryText = '';
    if (totalDomains === 1) {
      const change = sitemapChanges[0];
      summaryText = `${change.domain} 新增 ${change.newUrls.length} 个页面`;
    } else {
      const topDomains = sitemapChanges
        .sort((a, b) => b.newUrls.length - a.newUrls.length)
        .slice(0, 3)
        .map(change => `${change.domain}(${change.newUrls.length})`)
        .join(', ');
      
      summaryText = `${totalDomains}个站点新增${totalNewUrls}个页面，主要：${topDomains}`;
    }
    
    return {
      totalNewUrls,
      totalDomains,
      summaryText,
      preview: sitemapChanges.map(change => ({
        domain: change.domain,
        newUrlsCount: change.newUrls.length,
        sampleUrls: change.newUrls.slice(0, 3)
      }))
    };
  }
}