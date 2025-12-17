# single-spa-inspector v3 开发计划文档

## 📋 项目概述

**项目名称：** single-spa-inspector（fork 版本 v3）

**开发目标：**
1. 迁移至 Chrome Extension Manifest V3
2. 优化 Import Override 功能，实现地址保存与 Toggle 快速切换

**预计工作量：** 约 20 小时

---

## 🎯 需求详情

### 核心痛点
每次切换远程地址和本地 override 地址时，需要反复粘贴、删除地址，操作繁琐。

### 解决方案
实现地址一次保存，后续通过 Toggle 开关快速切换启用/禁用状态。

### UI 设计

**每行 Import Override 的布局：**

```
[Toggle开关] [只读显示已保存地址] [Edit按钮]
```

**交互流程：**

1. **初始状态（无保存地址）：**
   - Toggle 开关：禁用状态
   - Input：空白，只读
   - 按钮：显示 "Edit"

2. **点击 Edit 按钮后：**
   - Input：变为可编辑状态
   - 按钮：变为 "Save & Refresh"

3. **输入地址后点击 Save & Refresh：**
   - 保存地址到 storage
   - 应用 override 到页面
   - 刷新页面
   - Input：变为只读
   - Toggle：自动打开
   - 按钮：恢复为 "Edit"

4. **Toggle 开关操作：**
   - ON → 应用已保存地址的 override，刷新页面
   - OFF → 移除该 override，刷新页面

5. **已有保存地址时点击 Edit：**
   - Input：变为可编辑，显示当前保存地址
   - 可修改后重新保存

---

## 🏗️ 技术架构

### 存储方案

使用 `browser.storage.local`（通过 webextension-polyfill）存储数据：

```javascript
// 存储结构
{
  "savedOverrides": {
    "@cnic/main": {
      "url": "http://localhost:9100/app.js",
      "enabled": true
    },
    "@journal/review": {
      "url": "http://localhost:9120/app.js", 
      "enabled": false
    }
  }
}
```

### 状态流转

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据流向                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  browser.storage.local ←→ useImportMapOverrides Hook            │
│         ↓                         ↓                             │
│  savedOverrides (持久化)    overrides (运行时)                   │
│         ↓                         ↓                             │
│  Toggle 状态判断            importMapOverrides API               │
│         ↓                         ↓                             │
│      UI 渲染              被检查页面的 localStorage              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 文件修改清单

### Phase 1: Manifest V3 迁移

#### 1.1 修改 `manifest.json`

**变更内容：**
- `manifest_version`: 2 → 3
- `browser_action` → `action`
- `background.scripts` → `background.service_worker`
- 移除 `content_security_policy`（V3 有新格式）
- 添加 `permissions: ["storage"]`
- 添加 `host_permissions: ["<all_urls>"]`

**目标代码：**
```json
{
  "manifest_version": 3,
  "name": "single-spa Inspector",
  "short_name": "sspa Inspect",
  "version": "0.6.0",
  "author": "Anthony Frehner",
  "homepage_url": "https://github.com/single-spa/single-spa-inspector",
  "description": "A devtools panel for single-spa applications",
  "action": {
    "default_icon": "./logo-white-bgblue.png",
    "default_title": "single-spa Inspector"
  },
  "icons": {
    "48": "./logo-white-bgblue.png",
    "96": "./logo-white-bgblue.png"
  },
  "devtools_page": "./build/main.html",
  "permissions": [
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "run_at": "document_start",
      "js": ["./build/contentScript.js"]
    }
  ],
  "background": {
    "service_worker": "./build/backgroundScript.js"
  }
}
```

#### 1.2 修改 `src/background_script.js`

**变更内容：**
- 适配 Service Worker 环境
- Service Worker 没有 DOM，确保代码不依赖 window 对象
- 使用 `chrome.runtime` 事件监听

**注意事项：**
- Service Worker 是事件驱动的，会在空闲时被终止
- 所有事件监听器必须在顶层同步注册
- 不能使用 `window` 对象

**目标代码：**
```javascript
import browser from "webextension-polyfill";

let portsToPanel = [];

// 监听来自 content script 的消息
browser.runtime.onMessage.addListener((msg, sender) => {
  portsToPanel.forEach((port) => {
    if (sender.id === port.sender.id) {
      port.postMessage(msg);
    }
  });
});

// 监听来自 devtools panel 的连接
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel-devtools") return;
  portsToPanel = [...portsToPanel, port];

  port.onDisconnect.addListener(() => {
    portsToPanel = portsToPanel.filter((p) => p !== port);
  });
});
```

#### 1.3 修改 `webpack.config.js`

**变更内容：**
- 确保 backgroundScript 输出为单文件（Service Worker 要求）
- 可能需要调整 output 配置

**检查点：**
- Service Worker 不支持 ES modules 的动态 import
- 确保打包后的代码是自包含的

---

### Phase 2: Import Override Toggle 功能

#### 2.1 新建 `src/panel-app/toggle-switch.js`

**功能：** 创建一个简洁的开关组件

**目标代码：**
```javascript
import React from "react";
import { useCss, always } from "kremling";

export default function ToggleSwitch({ checked, onChange, disabled }) {
  const styles = useCss(css);

  return (
    <label
      {...styles}
      className={always("toggle-switch").maybe("disabled", disabled)}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="slider"></span>
    </label>
  );
}

const css = `
& .toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}

& .toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

& .toggle-switch .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .3s;
  border-radius: 20px;
}

& .toggle-switch .slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

& .toggle-switch input:checked + .slider {
  background-color: var(--green);
}

& .toggle-switch input:checked + .slider:before {
  transform: translateX(16px);
}

& .toggle-switch.disabled {
  opacity: 0.5;
}

& .toggle-switch.disabled .slider {
  cursor: not-allowed;
}
`;
```

#### 2.2 修改 `src/panel-app/useImportMapOverrides.js`

**变更内容：**
- 添加 `savedOverrides` 状态（从 storage 读取）
- 添加 `loadSavedOverrides()` 方法
- 添加 `saveOverride(appName, url)` 方法
- 添加 `toggleOverride(appName, enabled)` 方法
- 添加 `clearSavedOverride(appName)` 方法（可选）
- 初始化时同步 savedOverrides 到 importMapOverrides

**目标代码结构：**
```javascript
import { useState, useEffect } from "react";
import { evalCmd } from "../inspected-window.helper.js";
import browser from "webextension-polyfill";

export default function useImportMapOverrides() {
  const [importMapsEnabled, setImportMapEnabled] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [savedOverrides, setSavedOverrides] = useState({});
  const [appError, setAppError] = useState();

  if (appError) {
    throw appError;
  }

  // ========== 原有方法 ==========
  
  async function checkImportMapOverrides() { /* 保持不变 */ }
  async function getImportMapOverrides() { /* 保持不变 */ }
  async function addOverride(currentMap, currentUrl) { /* 保持不变 */ }
  async function removeOverride(currentMap) { /* 保持不变 */ }
  async function batchSetOverrides() { /* 保持不变 */ }

  // ========== 新增方法 ==========

  // 从 browser.storage.local 加载已保存的 overrides
  async function loadSavedOverrides() {
    try {
      const result = await browser.storage.local.get("savedOverrides");
      if (result.savedOverrides) {
        setSavedOverrides(result.savedOverrides);
      }
    } catch (err) {
      err.message = `Error loading saved overrides: ${err.message}`;
      setAppError(err);
    }
  }

  // 保存单个 override 到 storage，并应用到页面
  async function saveOverride(appName, url) {
    try {
      const newSavedOverrides = {
        ...savedOverrides,
        [appName]: { url, enabled: true }
      };
      await browser.storage.local.set({ savedOverrides: newSavedOverrides });
      setSavedOverrides(newSavedOverrides);
      
      // 应用到页面
      await addOverride(appName, url);
      await evalCmd(`window.location.reload()`);
    } catch (err) {
      err.message = `Error saving override: ${err.message}`;
      setAppError(err);
    }
  }

  // 切换单个 override 的启用状态
  async function toggleOverride(appName, enabled) {
    try {
      const saved = savedOverrides[appName];
      if (!saved) return;

      // 更新 storage 中的 enabled 状态
      const newSavedOverrides = {
        ...savedOverrides,
        [appName]: { ...saved, enabled }
      };
      await browser.storage.local.set({ savedOverrides: newSavedOverrides });
      setSavedOverrides(newSavedOverrides);

      // 应用或移除 override
      if (enabled) {
        await addOverride(appName, saved.url);
      } else {
        await removeOverride(appName);
      }
      await evalCmd(`window.location.reload()`);
    } catch (err) {
      err.message = `Error toggling override: ${err.message}`;
      setAppError(err);
    }
  }

  // 清除已保存的 override（可选功能）
  async function clearSavedOverride(appName) {
    try {
      const newSavedOverrides = { ...savedOverrides };
      delete newSavedOverrides[appName];
      await browser.storage.local.set({ savedOverrides: newSavedOverrides });
      setSavedOverrides(newSavedOverrides);
      
      // 同时移除页面上的 override
      await removeOverride(appName);
    } catch (err) {
      err.message = `Error clearing saved override: ${err.message}`;
      setAppError(err);
    }
  }

  // ========== 初始化 ==========

  useEffect(() => {
    async function initImportMapsOverrides() {
      const hasImportMapsEnabled = await checkImportMapOverrides();
      if (hasImportMapsEnabled) {
        setImportMapEnabled(hasImportMapsEnabled);
        await getImportMapOverrides();
        await loadSavedOverrides();
      }
    }

    try {
      initImportMapsOverrides();
    } catch (err) {
      err.message = `Error during initImportMapsOverrides: ${err.message}`;
      setAppError(err);
    }
  }, []);

  // 初始化时同步 savedOverrides 到页面（恢复之前的状态）
  useEffect(() => {
    async function syncSavedOverridesToPage() {
      if (!importMapsEnabled) return;
      
      for (const [appName, data] of Object.entries(savedOverrides)) {
        if (data.enabled) {
          await addOverride(appName, data.url);
        }
      }
    }
    
    // 注意：这个同步可能需要根据实际情况调整
    // 可能不需要自动同步，因为 importMapOverrides 本身会持久化
  }, [importMapsEnabled, savedOverrides]);

  // ========== 返回值 ==========

  const setOverride = (mapping, url) => {
    const newOverrides = {
      ...overrides,
      [mapping]: url,
    };
    setOverrides(newOverrides);
  };

  return {
    enabled: importMapsEnabled,
    overrides,
    savedOverrides,
    setOverride,
    saveOverride,
    toggleOverride,
    clearSavedOverride,
    commitOverrides: batchSetOverrides,
  };
}
```

#### 2.3 修改 `src/panel-app/apps.component.js`

**变更内容：**
- 引入 ToggleSwitch 组件
- 每行添加编辑状态管理
- 重构 Import Override 列的渲染逻辑

**目标代码结构：**
```javascript
import React, { useState, useEffect, useMemo } from "react";
import { Scoped, always } from "kremling";
import AppStatusOverride from "./app-status-override.component";
import Button from "./button";
import ToggleSwitch from "./toggle-switch";
import { evalDevtoolsCmd } from "../inspected-window.helper.js";
import useImportMapOverrides from "./useImportMapOverrides";
import ToggleGroup from "./toggle-group";
import ToggleOption from "./toggle-option";

// ... 其他代码保持不变 ...

export default function Apps(props) {
  const sortedApps = useMemo(() => sortApps(props.apps), [props.apps]);
  const importMaps = useImportMapOverrides();
  // ... 其他状态 ...

  // 编辑状态管理：记录哪些 app 正在编辑
  const [editingApps, setEditingApps] = useState({});
  // 编辑中的临时值
  const [editValues, setEditValues] = useState({});

  // 开始编辑
  const startEdit = (appName) => {
    setEditingApps({ ...editingApps, [appName]: true });
    setEditValues({
      ...editValues,
      [appName]: importMaps.savedOverrides[appName]?.url || ""
    });
  };

  // 取消编辑
  const cancelEdit = (appName) => {
    setEditingApps({ ...editingApps, [appName]: false });
    setEditValues({ ...editValues, [appName]: "" });
  };

  // 保存并刷新
  const handleSaveAndRefresh = async (appName) => {
    const url = editValues[appName];
    if (url) {
      await importMaps.saveOverride(appName, url);
      setEditingApps({ ...editingApps, [appName]: false });
    }
  };

  // Toggle 切换
  const handleToggle = async (appName, enabled) => {
    await importMaps.toggleOverride(appName, enabled);
  };

  return (
    <Scoped css={css}>
      {/* ... 其他 UI ... */}
      
      {sortedApps.map((app) => (
        <div role="row" key={app.name}>
          {/* ... App Name, Status, Actions 列 ... */}
          
          {importMaps.enabled && (
            <div role="cell" className="import-override-cell">
              {/* Toggle 开关 */}
              <ToggleSwitch
                checked={importMaps.savedOverrides[app.name]?.enabled || false}
                onChange={(enabled) => handleToggle(app.name, enabled)}
                disabled={!importMaps.savedOverrides[app.name]?.url}
              />
              
              {/* Input */}
              <input
                className={always("import-override")}
                value={
                  editingApps[app.name]
                    ? editValues[app.name]
                    : (importMaps.savedOverrides[app.name]?.url || "")
                }
                readOnly={!editingApps[app.name]}
                onChange={(e) => {
                  setEditValues({ ...editValues, [app.name]: e.target.value });
                }}
                placeholder="Enter override URL..."
              />
              
              {/* Edit / Save & Refresh 按钮 */}
              {editingApps[app.name] ? (
                <>
                  <Button onClick={() => handleSaveAndRefresh(app.name)}>
                    Save & Refresh
                  </Button>
                  <Button onClick={() => cancelEdit(app.name)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={() => startEdit(app.name)}>
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      
      {/* 移除或保留原有的 "Apply Overrides & Refresh" 按钮 */}
    </Scoped>
  );
}

// 更新 CSS
const css = `
/* ... 原有样式 ... */

& .import-override-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

& .import-override {
  flex: 1;
  /* ... 其他样式 ... */
}

& .import-override[readonly] {
  background-color: #f5f5f5;
  cursor: default;
}
`;
```

---

### Phase 3: 测试与发布

#### 3.1 本地测试

**Chrome 测试步骤：**
1. 运行 `npm run webpack-build` 编译代码
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"，选择项目根目录
5. 打开一个 single-spa 应用页面
6. 打开 DevTools，找到 "single-spa Inspector" 面板
7. 测试以下功能：
   - [ ] 面板正常加载
   - [ ] 应用列表正常显示
   - [ ] 点击 Edit 按钮，input 变为可编辑
   - [ ] 输入地址后点击 Save & Refresh，页面刷新
   - [ ] Toggle 开关状态正确
   - [ ] Toggle 切换后页面刷新，override 生效/失效
   - [ ] 关闭 DevTools 后重新打开，保存的地址仍在

**Firefox 测试步骤：**
1. 运行 `npm run start:firefox` 或手动加载
2. 访问 `about:debugging#/runtime/this-firefox`
3. 点击"临时载入附加组件"
4. 选择项目中的 `manifest.json`
5. 执行相同的测试用例

#### 3.2 打包发布

**更新版本号：**
- `manifest.json`: `"version": "0.6.0"`
- `package.json`: `"version": "0.6.0"`

**Chrome Web Store 发布：**
```bash
npm run webpack-build
npm run build
# 生成 web-ext-artifacts/single-spa_inspector-0.6.0.zip
# 上传到 Chrome Web Store Developer Dashboard
```

**Firefox Add-ons 发布：**
```bash
npm run webpack-build
npm run build
# 上传到 Firefox Add-ons Developer Hub
```

**注意：** 
- Chrome Web Store 需要开发者账号（$5 一次性费用）
- Firefox Add-ons 免费，但需要注册账号
- Manifest V3 扩展在 Firefox 中可能需要额外适配

---

## 📋 开发检查清单

### Phase 1: Manifest V3 迁移
- [ ] 更新 `manifest.json` 为 V3 格式
- [ ] 修改 `background_script.js` 适配 Service Worker
- [ ] 添加 `storage` 权限
- [ ] 测试 Chrome 加载无报错
- [ ] 测试 Firefox 加载无报错（可能需要调整）

### Phase 2: Toggle 功能开发
- [ ] 创建 `toggle-switch.js` 组件
- [ ] 修改 `useImportMapOverrides.js` 添加存储逻辑
- [ ] 修改 `apps.component.js` 实现新 UI
- [ ] 测试 Edit 按钮交互
- [ ] 测试 Save & Refresh 功能
- [ ] 测试 Toggle 开关功能
- [ ] 测试数据持久化（关闭重开 DevTools）

### Phase 3: 测试与发布
- [ ] Chrome 完整功能测试
- [ ] Firefox 完整功能测试
- [ ] 更新版本号
- [ ] 更新 README.md
- [ ] 打包 Chrome 扩展
- [ ] 打包 Firefox 扩展
- [ ] 发布到 Chrome Web Store
- [ ] 发布到 Firefox Add-ons

---

## ⚠️ 注意事项

### Manifest V3 关键变化

| V2 | V3 | 说明 |
|----|----|----|
| `manifest_version: 2` | `manifest_version: 3` | 版本声明 |
| `browser_action` | `action` | API 重命名 |
| `background.scripts` | `background.service_worker` | 后台脚本变为 Service Worker |
| `content_security_policy` (字符串) | `content_security_policy` (对象) | CSP 格式变化 |
| 隐式主机权限 | `host_permissions` | 需要显式声明 |

### Service Worker 限制

1. **无 DOM 访问**：不能使用 `window`、`document` 等
2. **生命周期**：空闲时会被终止，需要事件驱动
3. **同步注册**：所有监听器必须在顶层同步注册
4. **无持久状态**：需要使用 `chrome.storage` 存储状态

### webextension-polyfill 兼容性

当前项目使用 `webextension-polyfill` 库来统一 Chrome 和 Firefox API。该库支持 Manifest V3，但需要确保版本足够新（建议 >= 0.10.0）。

```bash
npm update webextension-polyfill
```

### Firefox Manifest V3 支持

Firefox 从版本 109 开始支持 Manifest V3，但某些 API 可能有差异。如果遇到兼容性问题，可以考虑：
1. 使用 `browser_specific_settings` 字段
2. 为 Firefox 维护单独的 manifest

---

## 🔗 参考资料

- [Chrome Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/migrating/)
- [Chrome Manifest V3 迁移清单](https://developer.chrome.com/docs/extensions/migrating/checklist/)
- [Service Worker 生命周期](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [webextension-polyfill](https://github.com/nicolo-ribaudo/webextension-polyfill)
- [Firefox Manifest V3 支持](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- [import-map-overrides 库](https://github.com/single-spa/import-map-overrides)

---

## 📝 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v0.6.0 | 2024-12 | 迁移至 Manifest V3；新增 Import Override Toggle 功能 |
| v0.5.0 | - | 原始 fork 版本 |

---

## ✅ 开发完成总结

### 已完成的修改

1. **Manifest V3 迁移**
   - `manifest.json` - Firefox 版本（使用 `background.scripts`）
   - `manifest.chrome.json` - Chrome 版本（使用 `background.service_worker`）
   - 添加 `storage` 和 `scripting` 权限
   - 添加 `browser_specific_settings` 用于 Firefox

2. **新增文件**
   - `src/panel-app/toggle-switch.js` - Toggle 开关组件
   - `scripts/build-chrome.js` - Chrome 构建脚本
   - `manifest.chrome.json` - Chrome 专用 manifest
   - `web-ext-config.cjs` - 重命名的配置文件

3. **修改的文件**
   - `src/panel-app/useImportMapOverrides.js` - 添加存储逻辑
   - `src/panel-app/apps.component.js` - 新 UI 实现
   - `src/background_script.js` - Service Worker 兼容
   - `package.json` - 更新版本和构建脚本

### 构建命令

```bash
# 构建 Firefox 扩展
npm run build:firefox
# 输出: web-ext-artifacts/single-spa-inspector-firefox-0.6.0.zip

# 构建 Chrome 扩展
npm run build:chrome
# 输出: web-ext-artifacts/single-spa-inspector-chrome-0.6.0.zip
```

### 本地测试

**Chrome:**
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist-chrome` 目录

**Firefox:**
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择项目根目录的 `manifest.json`

### 注意事项

- 构建时需要设置 `NODE_OPTIONS=--openssl-legacy-provider`（Node.js 17+ 兼容性）
- Firefox 和 Chrome 使用不同的 manifest 文件
- `web-ext` 已更新到 v9.x 以支持 Manifest V3

