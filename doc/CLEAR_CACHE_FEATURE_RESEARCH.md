# Clear Cache 功能调研报告与开发计划

## 📋 需求背景

**用户痛点：** 在微前端开发过程中，经常需要强制清空当前页面的所有浏览器缓存，以确保加载最新的代码和资源。目前需要手动操作浏览器设置或使用快捷键，操作繁琐。

**目标功能：** 类似 [Clear Cache](https://chromewebstore.google.com/detail/clear-cache/cppjkneekbjaeellbfkmgnhonkkjfpdn) 扩展，在 single-spa Inspector 中添加一键清除缓存功能，点击按钮即可清除浏览器缓存并刷新页面。

**参考项目：**
- [Clear Cache Chrome Extension](https://chromewebstore.google.com/detail/clear-cache/cppjkneekbjaeellbfkmgnhonkkjfpdn)
- [clearcache.io](https://clearcache.io/)

---

## 🔍 技术调研

### 1. browsingData API 概述

Chrome 和 Firefox 都提供了 `browsingData` API 用于清除浏览数据。该 API 支持清除多种类型的数据。

#### 1.1 支持的数据类型 (DataTypeSet)

| 数据类型 | 说明 | 微前端开发相关性 |
|---------|------|-----------------|
| `cache` | 浏览器 HTTP 缓存 | ⭐⭐⭐ 核心 |
| `cacheStorage` | Cache Storage API 缓存 | ⭐⭐⭐ Service Worker 缓存 |
| `serviceWorkers` | Service Workers | ⭐⭐⭐ 重要 |
| `localStorage` | 本地存储（同时包含 sessionStorage） | ⭐⭐ 可选 |
| `indexedDB` | IndexedDB 数据库 | ⭐⭐ 可选 |
| `cookies` | Cookies | ⭐ 可选（可能影响登录状态） |
| `history` | 浏览历史 | ❌ 不建议 |
| `downloads` | 下载记录 | ❌ 不建议 |
| `formData` | 表单数据 | ❌ 不建议 |
| `passwords` | 密码（已弃用） | ❌ 不支持 |
| `fileSystems` | 文件系统 | ⭐ 可选 |
| `webSQL` | WebSQL 数据 | ⭐ 可选 |

#### 1.2 Chrome API 示例

```javascript
// 清除所有缓存
chrome.browsingData.removeCache({ since: 0 }, () => {
  console.log('Cache cleared successfully.');
});

// 清除多种类型数据
chrome.browsingData.remove({
  since: 0  // 从开始到现在的所有数据
}, {
  cache: true,
  cacheStorage: true,
  serviceWorkers: true
}, () => {
  console.log('Data cleared successfully.');
});

// 清除特定站点的缓存 (仅支持部分数据类型)
chrome.browsingData.remove({
  origins: ["https://example.com"]
}, {
  cache: true,
  cacheStorage: true
}, callback);
```

#### 1.3 Firefox API 示例

Firefox 使用相同的 API 结构，但通过 `browser` 命名空间访问，并返回 Promise：

```javascript
// 使用 webextension-polyfill
browser.browsingData.removeCache({}).then(() => {
  console.log("Cache cleared successfully.");
}).catch((error) => {
  console.error(`Error clearing cache: ${error}`);
});

// 清除多种类型
browser.browsingData.remove({}, {
  cache: true,
  cacheStorage: true,
  serviceWorkers: true
}).then(onRemoved, onError);
```

---

### 2. 开源实现参考

#### 2.1 [dessant/clear-browsing-data](https://github.com/dessant/clear-browsing-data)

**特点：**
- ⭐ 4.5k+ stars，活跃维护
- 支持 Manifest V3
- 支持 Chrome、Edge、Firefox
- 提供丰富的配置选项
- MIT 许可证

**核心实现思路：**
```javascript
// 简化的核心逻辑
async function clearBrowsingData(dataTypes, options = {}) {
  const removeOptions = {
    since: options.since || 0
  };
  
  if (options.origins) {
    removeOptions.origins = options.origins;
  }
  
  await browser.browsingData.remove(removeOptions, dataTypes);
}
```

**Manifest 权限配置：**
```json
{
  "permissions": [
    "browsingData"
  ]
}
```

#### 2.2 [firsttris/oneclickhistorycleaner](https://github.com/firsttris/oneclickhistorycleaner)

**特点：**
- 简洁的一键清除实现
- Chrome 专用
- 可定制清除选项

#### 2.3 [thejjw/cache-killer-chrome-extension](https://github.com/thejjw/cache-killer-chrome-extension)

**特点：**
- 禁用浏览器缓存而非清除
- 使用 DevTools Network 面板的 "Disable cache" 功能

---

### 3. 页面刷新 API

清除缓存后需要刷新页面才能生效。有两种方式：

#### 3.1 tabs.reload API (推荐)

```javascript
// 刷新指定 tab，绕过缓存
chrome.tabs.reload(tabId, { bypassCache: true });

// 使用 webextension-polyfill
browser.tabs.reload(tabId, { bypassCache: true });
```

**优点：**
- 直接绕过缓存重新加载
- 可以在 background script 中调用
- 不需要向页面注入脚本

#### 3.2 在页面中执行 location.reload

```javascript
// 在 inspected window 中执行
chrome.devtools.inspectedWindow.eval('location.reload(true)');
```

**注意：** `location.reload(true)` 的 `forceReload` 参数已被废弃，现代浏览器会忽略它。

---

### 4. 跨浏览器兼容性分析

#### 4.1 API 可用性对比

| 功能 | Chrome | Firefox | 差异说明 |
|-----|--------|---------|---------|
| `browsingData.removeCache()` | ✅ 支持 | ✅ 支持 | 无差异 |
| `browsingData.remove()` | ✅ 支持 | ✅ 支持 | 无差异 |
| `origins` 参数 | ✅ 支持 | ⚠️ 部分支持 | Firefox 对某些数据类型不支持 origins |
| `tabs.reload({ bypassCache })` | ✅ 支持 | ✅ 支持 | 无差异 |
| Service Worker 背景脚本 | ✅ 必须 | ⚠️ 可选 | MV3 差异 |

#### 4.2 Firefox 已知限制

根据 [Firefox 文档](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browsingData)：

1. **Cache API 数据未清除**：通过 Cache API 存储的数据（被网页和 Service Worker 使用）不会被 `removeCache()` 清除
2. **HTTP 认证缓存未清除**：需要重启浏览器才能完全清除
3. **`origins` 参数限制**：某些数据类型不支持按站点清除

#### 4.3 webextension-polyfill 支持

项目已使用 `webextension-polyfill@0.12.0`，该库支持 `browsingData` API，可以统一 Chrome 和 Firefox 的 API 调用。

```javascript
import browser from "webextension-polyfill";

// 统一的跨浏览器代码
await browser.browsingData.remove({}, {
  cache: true,
  cacheStorage: true,
  serviceWorkers: true
});
```

---

### 5. DevTools Panel 中的实现考虑

#### 5.1 当前项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     项目文件结构                                 │
├─────────────────────────────────────────────────────────────────┤
│  panel.js (DevTools Panel)                                      │
│      │                                                          │
│      ├── panel-app.js (React App)                               │
│      │       │                                                  │
│      │       ├── apps.component.js (应用列表 UI)                │
│      │       └── useImportMapOverrides.js (状态管理)            │
│      │                                                          │
│      └── browser.devtools.inspectedWindow.tabId                 │
│              ↓                                                  │
│         获取当前检查的 Tab ID                                    │
│                                                                 │
│  background_script.js (Service Worker)                          │
│      │                                                          │
│      └── 处理来自 panel 的消息，调用 browsingData API           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.2 关键技术点

1. **获取 Tab ID**：在 DevTools Panel 中通过 `browser.devtools.inspectedWindow.tabId` 获取
2. **消息传递**：Panel → Background Script → browsingData API
3. **权限要求**：需要添加 `browsingData` 权限，可能需要 `tabs` 权限

#### 5.3 通信流程

```
┌───────────────┐     消息      ┌───────────────────┐    API 调用
│  DevTools     │ ──────────→ │  Background       │ ──────────→ browsingData
│  Panel        │             │  Script           │ 
│               │ ←────────── │  (Service Worker) │ ←────────── 
└───────────────┘    响应      └───────────────────┘    结果
        │
        ↓
  tabs.reload(tabId, { bypassCache: true })
```

---

### 6. 安全性与用户体验考虑

#### 6.1 数据清除风险

| 操作 | 风险级别 | 说明 |
|-----|---------|-----|
| 清除 cache | 🟢 低 | 仅影响静态资源加载 |
| 清除 serviceWorkers | 🟡 中 | 可能影响 PWA 离线功能 |
| 清除 cacheStorage | 🟡 中 | 可能影响应用缓存数据 |
| 清除 localStorage | 🟡 中 | 可能丢失用户设置 |
| 清除 cookies | 🔴 高 | 会导致登录状态丢失 |
| 清除 indexedDB | 🔴 高 | 可能丢失重要数据 |

#### 6.2 建议的默认配置

针对微前端开发场景，推荐的默认清除类型：

```javascript
const DEFAULT_DATA_TYPES = {
  cache: true,           // HTTP 缓存
  cacheStorage: true,    // Service Worker 缓存
  serviceWorkers: true,  // Service Workers
  // 以下默认不清除
  localStorage: false,
  sessionStorage: false,
  indexedDB: false,
  cookies: false
};
```

#### 6.3 可选的高级配置

为用户提供可选的清除范围：

1. **清除范围**
   - 当前站点（推荐默认）
   - 所有站点

2. **数据类型选择**
   - 基础：cache + cacheStorage
   - 标准：+ serviceWorkers
   - 完整：+ localStorage + indexedDB
   - 全部：+ cookies

---

## 📐 开发计划

### Phase 1: 基础功能实现 (预计 4-6 小时)

#### 1.1 更新 Manifest 配置

**修改文件：** `manifest.json`, `manifest.chrome.json`

```json
{
  "permissions": [
    "storage",
    "scripting",
    "browsingData",  // 新增
    "tabs"           // 可能需要（用于 reload）
  ]
}
```

#### 1.2 扩展 Background Script

**修改文件：** `src/background_script.js`

**新增功能：**
- 监听来自 Panel 的 `clear-cache` 消息
- 调用 `browsingData.remove()` API
- 调用 `tabs.reload()` 刷新页面
- 返回操作结果

**伪代码：**
```javascript
// 在现有消息监听器中添加处理
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'clear-cache') {
    return handleClearCache(msg);
  }
  // ... 现有逻辑
});

async function handleClearCache(msg) {
  const { tabId, dataTypes, currentOriginOnly } = msg;
  
  try {
    const removeOptions = { since: 0 };
    
    if (currentOriginOnly && msg.origin) {
      removeOptions.origins = [msg.origin];
    }
    
    await browser.browsingData.remove(removeOptions, dataTypes);
    await browser.tabs.reload(tabId, { bypassCache: true });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

#### 1.3 创建 UI 组件

**新建文件：** `src/panel-app/clear-cache-button.js`

**功能：**
- 清除缓存按钮（带图标）
- 加载状态指示
- 成功/失败反馈

**伪代码：**
```javascript
import React, { useState } from "react";
import browser from "webextension-polyfill";

export default function ClearCacheButton() {
  const [isClearing, setIsClearing] = useState(false);
  const [status, setStatus] = useState(null);
  
  const handleClearCache = async () => {
    setIsClearing(true);
    setStatus(null);
    
    try {
      const tabId = browser.devtools.inspectedWindow.tabId;
      const response = await browser.runtime.sendMessage({
        type: 'clear-cache',
        tabId,
        dataTypes: {
          cache: true,
          cacheStorage: true,
          serviceWorkers: true
        }
      });
      
      setStatus(response.success ? 'success' : 'error');
    } catch (error) {
      setStatus('error');
    } finally {
      setIsClearing(false);
      setTimeout(() => setStatus(null), 2000);
    }
  };
  
  return (
    <button onClick={handleClearCache} disabled={isClearing}>
      {isClearing ? '清除中...' : '🗑️ 清除缓存并刷新'}
    </button>
  );
}
```

#### 1.4 集成到 Panel UI

**修改文件：** `src/panel-app/apps.component.js`

**UI 布局设计：**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🗑️ Clear Cache & Refresh]                    Overlays [Off] [On] [List]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  App Name    │  Status       │  Actions        │  Import Override           │
│  ...         │  ...          │  ...            │  ...                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**布局说明：**
- **左上角**：显眼的 Clear Cache 按钮（绿色背景，白色文字）
- **右上角**：Overlays 控制组（不常用，移到右边）
- 两者在同一行，使用 `justify-content: space-between` 布局

**样式要求：**
- Clear Cache 按钮使用醒目的绿色（`--green: #28cb51`）
- 按钮较大，容易点击
- 清除中显示 loading 状态
- 成功后短暂显示 ✓ 图标

---

### Phase 2: 高级功能 (预计 3-4 小时)

#### 2.1 可配置的清除选项

**新建文件：** `src/panel-app/clear-cache-settings.js`

**功能：**
- 数据类型勾选
- 清除范围选择（当前站点/全部）
- 设置持久化到 `browser.storage.local`

**UI 设计：**
```
┌─────────────────────────────────────────┐
│  清除缓存设置                            │
├─────────────────────────────────────────┤
│  ☑ HTTP 缓存 (cache)                    │
│  ☑ Service Worker 缓存 (cacheStorage)   │
│  ☑ Service Workers                      │
│  ☐ 本地存储 (localStorage)              │
│  ☐ IndexedDB                            │
│  ☐ Cookies (会影响登录状态!)            │
├─────────────────────────────────────────┤
│  清除范围:                               │
│  ◉ 仅当前站点                            │
│  ○ 所有站点                              │
└─────────────────────────────────────────┘
```

#### 2.2 键盘快捷键支持

**方案 A：使用 Chrome Commands API**
```json
// manifest.json
{
  "commands": {
    "clear-cache": {
      "suggested_key": {
        "default": "Ctrl+Shift+R",
        "mac": "Command+Shift+R"
      },
      "description": "清除缓存并刷新"
    }
  }
}
```

**方案 B：在 Panel 内监听键盘事件**
```javascript
useEffect(() => {
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'r') {
      e.preventDefault();
      handleClearCache();
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

### Phase 3: 测试与优化 (预计 2-3 小时)

#### 3.1 测试用例

| 测试场景 | 预期结果 |
|---------|---------|
| Chrome 中点击清除缓存按钮 | 缓存清除成功，页面刷新 |
| Firefox 中点击清除缓存按钮 | 缓存清除成功，页面刷新 |
| 仅清除当前站点缓存 | 不影响其他站点 |
| 清除包含 Service Worker 的页面 | SW 重新注册 |
| 设置持久化 | 关闭重开后设置保留 |
| 网络错误时 | 显示错误提示 |

#### 3.2 浏览器兼容性测试

- Chrome 88+ (Manifest V3 支持)
- Firefox 109+ (Manifest V3 支持)
- Edge (基于 Chromium)

#### 3.3 性能优化

- 清除操作添加 debounce 防止重复点击
- 大量缓存时显示进度指示

---

## 📁 文件修改清单

### 需要修改的文件

| 文件 | 修改内容 |
|-----|---------|
| `manifest.json` | 添加 `browsingData` 权限 |
| `manifest.chrome.json` | 添加 `browsingData` 权限 |
| `src/background_script.js` | 添加清除缓存消息处理 |
| `src/panel-app.js` | 集成 ClearCacheButton 组件 |

### 需要新建的文件

| 文件 | 功能 |
|-----|------|
| `src/panel-app/clear-cache-button.js` | 清除缓存按钮组件 |
| `src/panel-app/clear-cache-settings.js` | 清除设置组件（Phase 2） |
| `src/utils/clear-cache.js` | 清除缓存工具函数（可选） |

---

## ⏱️ 工作量估算

| 阶段 | 任务 | 预计时间 |
|-----|------|---------|
| Phase 1 | Manifest 更新 | 0.5 小时 |
| Phase 1 | Background Script 扩展 | 1.5 小时 |
| Phase 1 | UI 组件开发 | 2 小时 |
| Phase 1 | 集成测试 | 1 小时 |
| Phase 2 | 设置面板开发 | 2 小时 |
| Phase 2 | 快捷键支持 | 1 小时 |
| Phase 3 | 跨浏览器测试 | 1.5 小时 |
| Phase 3 | Bug 修复与优化 | 1 小时 |
| **总计** | | **约 10-12 小时** |

---

## ⚠️ 风险与注意事项

### 1. 权限变更

添加 `browsingData` 权限可能导致：
- 已安装用户需要重新授权
- Chrome Web Store 审核可能更严格

### 2. Firefox 兼容性

- `origins` 参数在 Firefox 中部分数据类型不支持
- 需要做好降级处理

### 3. 用户数据安全

- 默认不清除 cookies 和 localStorage，避免丢失用户数据
- 提供明确的警告信息

### 4. DevTools Panel 限制

- `browsingData` API 需要在 background script 中调用
- Panel 需要通过消息传递机制与 background 通信

---

## 🔗 参考资源

- [Chrome browsingData API](https://developer.chrome.com/docs/extensions/reference/api/browsingData)
- [Firefox browsingData API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browsingData)
- [Chrome tabs.reload API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-reload)
- [dessant/clear-browsing-data](https://github.com/dessant/clear-browsing-data) - 开源参考实现
- [webextension-polyfill](https://github.com/nicolo-ribaudo/webextension-polyfill)

---

## ✅ 下一步行动

1. [ ] 确认 Phase 1 需求细节（默认清除哪些类型）
2. [ ] 更新 manifest 文件添加权限
3. [ ] 实现 background script 消息处理
4. [ ] 开发 ClearCacheButton 组件
5. [ ] 集成测试
6. [ ] 收集反馈，决定是否实现 Phase 2

---

*文档创建时间：2024-12*
*最后更新：2024-12*
