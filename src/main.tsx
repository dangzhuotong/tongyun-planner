import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initPlatformClass } from "./utils/platform";

// 启动时检测 macOS 平台并给 document.documentElement 注入 platform-macos class
initPlatformClass();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
