/**
 * HTML Report Template
 * Generates a consolidated report page for sitemap changes
 */

export function generateReportHTML(reportData) {
  const { 
    timestamp, 
    sitemapChanges, 
    totalNewUrls, 
    totalDomains,
    reportId,
    summary
  } = reportData;

  const formattedTime = new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>站点变更报告 - ${formattedTime}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .header .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-bottom: 20px;
        }
        
        .summary {
            background: #f8fafc;
            padding: 30px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 4px solid #4f46e5;
        }
        
        .summary-card h3 {
            color: #374151;
            font-size: 2rem;
            margin-bottom: 5px;
        }
        
        .summary-card p {
            color: #6b7280;
            font-size: 0.9rem;
        }
        
        .content {
            padding: 40px;
        }
        
        .domain-section {
            margin-bottom: 40px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .domain-header {
            background: #f9fafb;
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .domain-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: #111827;
        }
        
        .domain-url {
            color: #6b7280;
            font-size: 0.9rem;
            margin-top: 5px;
            word-break: break-all;
        }
        
        .url-count {
            background: #4f46e5;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 500;
        }
        
        .url-list {
            padding: 20px;
        }
        
        .url-item {
            display: flex;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f3f4f6;
            transition: background-color 0.2s;
        }
        
        .url-item:last-child {
            border-bottom: none;
        }
        
        .url-item:hover {
            background: #f9fafb;
            margin: 0 -20px;
            padding: 12px 20px;
        }
        
        .url-number {
            background: #e5e7eb;
            color: #374151;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            font-weight: 600;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        .url-link {
            color: #2563eb;
            text-decoration: none;
            word-break: break-all;
            flex: 1;
        }
        
        .url-link:hover {
            text-decoration: underline;
        }
        
        .url-copy {
            background: none;
            border: 1px solid #d1d5db;
            color: #6b7280;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            cursor: pointer;
            margin-left: 10px;
            transition: all 0.2s;
        }
        
        .url-copy:hover {
            background: #f3f4f6;
            border-color: #9ca3af;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #6b7280;
        }
        
        .empty-state h3 {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: #374151;
        }
        
        .footer {
            background: #f8fafc;
            padding: 20px;
            text-align: center;
            color: #6b7280;
            border-top: 1px solid #e2e8f0;
            font-size: 0.9rem;
        }
        
        .report-id {
            font-family: 'Courier New', monospace;
            background: #f3f4f6;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
        }
        
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .header {
                padding: 30px 20px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .content {
                padding: 20px;
            }
            
            .summary-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 站点变更报告</h1>
            <div class="subtitle">基于 sitemap 的自动化内容监控系统</div>
            <div>生成时间：${formattedTime}</div>
        </div>
        
        <div class="summary">
            <h2>📊 摘要</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>${totalDomains}</h3>
                    <p>监控站点</p>
                </div>
                <div class="summary-card">
                    <h3>${totalNewUrls}</h3>
                    <p>新增页面</p>
                </div>
                <div class="summary-card">
                    <h3>${summary?.processingTime || '-'}ms</h3>
                    <p>处理耗时</p>
                </div>
                <div class="summary-card">
                    <h3>${formattedTime}</h3>
                    <p>更新时间</p>
                </div>
            </div>
        </div>
        
        <div class="content">
            ${sitemapChanges.length > 0 ? 
                sitemapChanges.map(change => generateDomainSection(change)).join('') :
                '<div class="empty-state"><h3>🎉 暂无更新</h3><p>本次检查未发现新的页面变更</p></div>'
            }
        </div>
        
        <div class="footer">
            <p>报告 ID: <span class="report-id">${reportId}</span></p>
            <p>由 Cloudflare Workers 自动化生成 | 站点监控机器人</p>
        </div>
    </div>

    <script>
        // 复制URL功能
        function copyUrl(url) {
            navigator.clipboard.writeText(url).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = '已复制';
                button.style.background = '#10b981';
                button.style.color = 'white';
                button.style.borderColor = '#10b981';
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '';
                    button.style.color = '';
                    button.style.borderColor = '';
                }, 2000);
            }).catch(err => {
                console.error('复制失败:', err);
                alert('复制失败，请手动复制');
            });
        }
    </script>
</body>
</html>`;
}

function generateDomainSection(change) {
  const { domain, url, newUrls } = change;
  
  return `
            <div class="domain-section">
                <div class="domain-header">
                    <div>
                        <h3 class="domain-title">${domain}</h3>
                        <div class="domain-url">${url}</div>
                    </div>
                    <div class="url-count">+${newUrls.length} 页面</div>
                </div>
                <div class="url-list">
                    ${newUrls.map((url, index) => `
                        <div class="url-item">
                            <div class="url-number">${index + 1}</div>
                            <a href="${url}" class="url-link" target="_blank" rel="noopener noreferrer">
                                ${url}
                            </a>
                            <button class="url-copy" onclick="copyUrl('${url}')">复制</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
}