import React, { useState, useEffect, useMemo } from "react";
import { Scoped, always } from "kremling";
import AppStatusOverride from "./app-status-override.component";
import Button from "./button";
import ToggleSwitch from "./toggle-switch";
import ClearCacheButton from "./clear-cache-button";
import { evalDevtoolsCmd } from "../inspected-window.helper.js";
import useImportMapOverrides from "./useImportMapOverrides";
import ToggleGroup from "./toggle-group";
import ToggleOption from "./toggle-option";

const OFF = "off",
  ON = "on",
  LIST = "list",
  PAGE = "page";

export default function Apps(props) {
  const sortedApps = useMemo(() => sortApps(props.apps), [props.apps]);
  const importMaps = useImportMapOverrides();
  const { mounted: mountedApps, other: otherApps } = useMemo(
    () => groupApps(props.apps),
    [props.apps]
  );
  const [hovered, setHovered] = useState();
  const [overlaysEnabled, setOverlaysEnabled] = useState(OFF);

  // 编辑状态管理：记录哪些 app 正在编辑
  const [editingApps, setEditingApps] = useState({});
  // 编辑中的临时值
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    if (overlaysEnabled === LIST && hovered) {
      overlayApp(hovered);
      return () => {
        deOverlayApp(hovered);
      };
    }
  }, [overlaysEnabled, hovered]);

  useEffect(() => {
    if (overlaysEnabled === ON) {
      mountedApps.forEach((app) => overlayApp(app));
      otherApps.forEach((app) => deOverlayApp(app));
      return () => {
        mountedApps.forEach((app) => deOverlayApp(app));
      };
    }
  }, [overlaysEnabled, mountedApps, otherApps]);

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
    if (url && url.trim()) {
      await importMaps.saveOverride(appName, url.trim());
      setEditingApps({ ...editingApps, [appName]: false });
    }
  };

  // Toggle 切换
  const handleToggle = async (appName, enabled) => {
    await importMaps.toggleOverride(appName, enabled);
  };

  // 获取显示的 URL 值
  const getDisplayUrl = (appName) => {
    if (editingApps[appName]) {
      return editValues[appName] || "";
    }
    return importMaps.savedOverrides[appName]?.url || "";
  };

  // 判断 toggle 是否启用
  const isToggleEnabled = (appName) => {
    return importMaps.savedOverrides[appName]?.enabled || false;
  };

  // 判断是否有保存的 URL
  const hasSavedUrl = (appName) => {
    return !!importMaps.savedOverrides[appName]?.url;
  };

  return (
    <Scoped css={css}>
      <span>
        <div className="toolbar">
          <ClearCacheButton />
          <ToggleGroup
            name="overlaysDisplayOption"
            value={overlaysEnabled}
            onChange={(e) => setOverlaysEnabled(e.target.value)}
          >
            <legend style={{ display: "inline" }}>Overlays</legend>
            <ToggleOption value={OFF}>Off</ToggleOption>
            <ToggleOption value={ON}>On</ToggleOption>
            <ToggleOption value={LIST}>List Hover</ToggleOption>
          </ToggleGroup>
        </div>
        <div role="table" className={"table"}>
          <div role="row">
            <span role="columnheader">App Name</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Actions</span>
            {importMaps.enabled && (
              <span role="columnheader">Import Override</span>
            )}
          </div>
          {sortedApps.map((app) => (
            <div
              role="row"
              key={app.name}
              onMouseEnter={() => setHovered(app)}
              onMouseLeave={() => setHovered()}
            >
              <div role="cell">{app.name}</div>
              <div role="cell">
                <span
                  className={always("app-status")
                    .maybe("app-mounted", app.status === "MOUNTED")
                    .maybe("app-not-mounted", app.status !== "MOUNTED")}
                >
                  {app.status.replace("_", " ")}
                </span>
              </div>
              <div role="cell">
                <AppStatusOverride app={app} />
              </div>
              {importMaps.enabled && (
                <div role="cell" className="import-override-cell">
                  {/* Toggle 开关 */}
                  <ToggleSwitch
                    checked={isToggleEnabled(app.name)}
                    onChange={(enabled) => handleToggle(app.name, enabled)}
                    disabled={!hasSavedUrl(app.name)}
                  />
                  
                  {/* Input */}
                  <input
                    className={always("import-override").maybe("editing", editingApps[app.name])}
                    value={getDisplayUrl(app.name)}
                    readOnly={!editingApps[app.name]}
                    onChange={(e) => {
                      setEditValues({ ...editValues, [app.name]: e.target.value });
                    }}
                    placeholder="Enter override URL..."
                  />
                  
                  {/* 按钮容器 - 固定宽度防止 UI 跳动 */}
                  <div className="override-buttons">
                    {editingApps[app.name] ? (
                      <>
                        <Button onClick={() => handleSaveAndRefresh(app.name)}>
                          Save
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
                </div>
              )}
            </div>
          ))}
        </div>
      </span>
    </Scoped>
  );
}

function sortApps(apps) {
  return [...apps]
    .sort((a, b) => {
      const nameA = a.name.toUpperCase(); // ignore upper and lowercase
      const nameB = b.name.toUpperCase(); // ignore upper and lowercase
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }
      // names must be equal
      return 0;
    })
    .sort((a, b) => {
      const statusA = a.status === "MOUNTED" || !!a.devtools.activeWhenForced;
      const statusB = b.status === "MOUNTED" || !!b.devtools.activeWhenForced;
      return statusB - statusA;
    });
}

function groupApps(apps) {
  const [mounted, other] = apps.reduce(
    (list, app) => {
      const group =
        app.status === "MOUNTED" || !!app.devtools.activeWhenForced ? 0 : 1;
      list[group].push(app);
      return list;
    },
    [[], []]
  );
  mounted.sort((a, b) => a.name.localeCompare(b.name));
  other.sort((a, b) => a.name.localeCompare(b.name));
  return {
    mounted,
    other,
  };
}

function overlayApp(app) {
  if (
    app.status !== "SKIP_BECAUSE_BROKEN" &&
    app.status !== "NOT_LOADED" &&
    app.devtools &&
    app.devtools.overlays
  ) {
    evalDevtoolsCmd(`overlay('${app.name}')`).catch((err) => {
      console.error(`Error overlaying applicaton: ${app.name}`, err);
    });
  }
}

function deOverlayApp(app) {
  if (app.devtools && app.devtools.overlays) {
    evalDevtoolsCmd(`removeOverlay('${app.name}')`).catch((err) => {
      console.error(`Error removing overlay on applicaton: ${app.name}`, err);
    });
  }
}

const css = `
:root {
  --gray: #82889a;
  --blue-light: #96b0ff;
  --blue: #3366ff;
  --blue-dark: #2850c8;
  --pink: #e62e5c;
  --green: #28cb51;
  --table-spacing: .5rem;
}
body {
  font-family: sans-serif;
}

body.dark {
  background-color: #272822;
  color: #F8F8F2;
}

& .toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--table-spacing);
  margin-bottom: var(--table-spacing);
}

& [role="table"] {
  display: table;
  border-collapse: separate;
  border-spacing: calc(var(--table-spacing) * 2) var(--table-spacing);
  padding: var(--table-spacing);
}

& [role="columnheader"] {
  color: var(--gray);
  font-size: .9rem;
  padding-left: .25rem;
  text-align: left;
  white-space: nowrap;
}

& [role="row"] {
  display: table-row;
}

& [role="row"] [role="cell"],
& [role="row"] [role="columnheader"] {
  display: table-cell;
  vertical-align: middle;
  white-space: nowrap;
}

& .app-status {
  border-radius: 1rem;
  color: #fff;
  font-size: .75rem;
  padding: .25rem .5rem .125rem;
  text-shadow: 0px 2px 4px rgba(0,0,0,.15);
  text-transform: capitalize;
}

& .app-mounted {
  background-color: var(--green);
}

& .app-not-mounted {
  background-color: var(--pink);
}

& .import-override-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

& .override-buttons {
  display: inline-flex;
  gap: 4px;
  width: 130px;
  flex-shrink: 0;
  justify-content: flex-start;
}

& .override-buttons .button {
  min-width: 60px;
  text-align: center;
}

& .import-override {
  border: 1.5px solid lightgrey;
  border-radius: 3px;
  box-sizing: border-box;
  font-size: .75rem;
  padding: .2rem;
  transition: all .15s ease-in-out;
  width: 200px;
}

& .import-override:read-only {
  background-color: #f5f5f5;
  cursor: default;
}

& .import-override.editing {
  background-color: #fff;
  border-color: var(--blue);
}

& .import-override:focus {
  border-color: var(--blue);
  outline: none;
}
`;
