/**
 * XML 解析器
 * 用于解析 sitemap XML 文件
 */

/**
 * 简单的 XML 解析器，兼容 Cloudflare Workers
 * @param {string} xmlString - XML 字符串
 * @returns {Object} 解析后的 XML 对象结构
 */
function parseXMLCompat(xmlString) {
  // 简单的 XML 标签解析，适用于 sitemap 结构
  const result = {
    documentElement: null,
    querySelectorAll: function(selector) {
      const elements = [];
      
      if (selector === 'loc') {
        // 查找 <loc> 标签
        const locRegex = /<loc[^>]*>(.*?)<\/loc>/gi;
        let match;
        while ((match = locRegex.exec(xmlString)) !== null) {
          elements.push({
            textContent: match[1] || '',
            tagName: 'loc'
          });
        }
      } else if (selector === 'url') {
        // 查找 <url> 标签块
        const urlRegex = /<url[^>]*>(.*?)<\/url>/gis;
        let match;
        while ((match = urlRegex.exec(xmlString)) !== null) {
          const urlContent = match[1] || '';
          const urlObj = {
            tagName: 'url',
            querySelector: function(tag) {
              const tagRegex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'i');
              const tagMatch = urlContent.match(tagRegex);
              return tagMatch ? { textContent: tagMatch[1] || '' } : null;
            }
          };
          elements.push(urlObj);
        }
      } else if (selector === 'sitemap') {
        // 查找 <sitemap> 标签块
        const sitemapRegex = /<sitemap[^>]*>(.*?)<\/sitemap>/gis;
        let match;
        while ((match = sitemapRegex.exec(xmlString)) !== null) {
          const sitemapContent = match[1] || '';
          const sitemapObj = {
            tagName: 'sitemap',
            querySelector: function(tag) {
              const tagRegex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'i');
              const tagMatch = sitemapContent.match(tagRegex);
              return tagMatch ? { textContent: tagMatch[1] || '' } : null;
            }
          };
          elements.push(sitemapObj);
        }
      }
      
      return elements;
    }
  };
  
  // 解析根元素（跳过XML声明）
  const rootMatch = xmlString.replace(/<\?xml[^>]*>/i, '').match(/<([^>\s]+)([^>]*)>/);
  if (rootMatch) {
    result.documentElement = {
      tagName: rootMatch[1].toLowerCase(),
      getAttribute: function(name) {
        const attrRegex = new RegExp(`${name}=["']([^"']*)["']`, 'i');
        const attrMatch = rootMatch[2].match(attrRegex);
        return attrMatch ? attrMatch[1] : null;
      }
    };
  }
  
  return result;
}

/**
 * 解析 XML 字符串（兼容 Cloudflare Workers）
 * @param {string} xmlString - XML 字符串
 * @returns {Object} 解析后的 XML 对象结构
 */
export function parseXML(xmlString) {
  return parseXMLCompat(xmlString);
}

/**
 * 从 sitemap XML 中提取所有 URL
 * @param {string} xmlContent - sitemap XML 内容
 * @returns {string[]} URL 列表
 */
export function extractURLs(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const urls = [];

    // 查找所有 <loc> 标签
    const locElements = doc.querySelectorAll('loc');

    for (const element of locElements) {
      const url = element.textContent.trim();
      if (url) {
        urls.push(url);
      }
    }

    return urls;
  } catch (error) {
    console.error('解析 XML 失败:', error);
    return [];
  }
}

/**
 * 从 sitemap XML 中提取 URL 和最后修改时间
 * @param {string} xmlContent - sitemap XML 内容
 * @returns {Array<{url: string, lastmod?: string}>} URL 和修改时间列表
 */
export function extractURLsWithLastMod(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const results = [];

    // 查找所有 <url> 标签
    const urlElements = doc.querySelectorAll('url');

    for (const urlElement of urlElements) {
      const locElement = urlElement.querySelector('loc');
      const lastmodElement = urlElement.querySelector('lastmod');

      if (locElement) {
        const url = locElement.textContent.trim();
        const lastmod = lastmodElement ? lastmodElement.textContent.trim() : undefined;

        if (url) {
          results.push({ url, lastmod });
        }
      }
    }

    return results;
  } catch (error) {
    console.error('解析 XML 失败:', error);
    return [];
  }
}

/**
 * 验证 XML 是否为有效的 sitemap
 * @param {string} xmlContent - XML 内容
 * @returns {boolean} 是否为有效的 sitemap
 */
export function isValidSitemap(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const rootElement = doc.documentElement;
    
    if (!rootElement) {
      return false;
    }

    const tagName = rootElement.tagName.toLowerCase();
    
    // 支持标准sitemap和sitemap索引
    if (tagName === 'urlset') {
      // 标准sitemap
      const namespace = rootElement.getAttribute('xmlns');
      if (!namespace || !namespace.includes('sitemaps.org')) {
        return false;
      }
      const urlElements = doc.querySelectorAll('url');
      return urlElements.length > 0;
    } else if (tagName === 'sitemapindex') {
      // sitemap索引文件
      const namespace = rootElement.getAttribute('xmlns');
      if (!namespace || !namespace.includes('sitemaps.org')) {
        return false;
      }
      const sitemapElements = doc.querySelectorAll('sitemap');
      return sitemapElements.length > 0;
    }

    return false;
  } catch (error) {
    console.error('验证 sitemap 失败:', error);
    return false;
  }
}

/**
 * 从sitemap索引中提取所有子sitemap的URL
 * @param {string} xmlContent - sitemap索引XML内容
 * @returns {string[]} 子sitemap URL列表
 */
export function extractSitemapUrls(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const sitemapUrls = [];

    // 查找所有 <loc> 标签在 <sitemap> 内
    const sitemapElements = doc.querySelectorAll('sitemap');

    for (const sitemapElement of sitemapElements) {
      const locElement = sitemapElement.querySelector('loc');
      if (locElement) {
        const url = locElement.textContent.trim();
        if (url) {
          sitemapUrls.push(url);
        }
      }
    }

    return sitemapUrls;
  } catch (error) {
    console.error('解析sitemap索引失败:', error);
    return [];
  }
} 