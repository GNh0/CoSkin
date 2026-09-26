# CoSkin

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

让Codex成为个人空间的Windows主题库。选择图片、GIF及效果，在真实界面中预览、编辑和应用。

[下载Windows x64](https://github.com/GNh0/CoSkin/releases/tag/v0.1.0) · [支持与验证范围](docs/support-matrix.md)

## 安装与启动

解压ZIP并运行 **CoSkin.Loader.exe**。请将执行文件、renderer.js和THIRD-PARTY-NOTICES.txt放在同一目录。用户不需要单独安装Node或.NET。

安装时可选择Windows登录启动、随Codex退出、桌面快捷方式、.coskin文件关联和自动更新。保留现有主题和Codex数据。

**CoSkin → Codex或Codex → CoSkin，任意启动顺序都可以连接。** CoSkin先启动时在托盘等待，也可连接已经运行的支持版本Codex，无需重启。桌面 **CoSkin** 单独启动，开始菜单 **Codex + CoSkin** 同时启动。不会强制关闭Codex。

已验证普通启动连接的Windows包版本为 **26.924.2738.0**，内部应用版本为 **26.924.22138**。连接模块验证执行文件、OpenAI签名、ASAR及chrome.dll。其他版本需先验证兼容性。两个应用需要相同的Windows权限级别。[常驻结构](docs/resident-architecture.md)

## 主题与效果

- 从左侧图标栏打开 **CoSkin**。卡片列表支持创建、导入、删除、预览和直接应用。
- 点击卡片进入详情页面，提供预览、编辑、复制、导出和主题信息编辑。
- 在实际界面的编辑模式中右键目标。项目行与聊天行默认编辑 **同类全部行**，也可使用单独指定覆盖一行。
- 选择整个应用、项目或聊天范围。保存和应用是独立操作；取消预览保留之前的应用状态。
- 支持PNG、JPEG和GIF。图片不透明度与文字分开调整。可编辑默认、悬停、选中状态及进入、退出、点击和循环效果。
- [自定义效果](docs/custom-effects.md)通过声明式JSON关键帧注册和共享。渲染器使用JavaScript/TypeScript、CSS和Web Animations API，效果包不会执行任意JavaScript。

列表是与聊天分离的专用页面。共同背景覆盖Codex应用表面、标签页以及文件/浏览器工具的应用区域。外部网页内容与Windows对话框是独立表面。

## 托盘与更新

托盘提供主题库、设置、主题选择、装饰开关、重新连接和退出。主题合并为子菜单，菜单跟随Codex语言。登录启动与随Codex退出为独立选项。

自动更新检查 **GitHub Releases中的更高稳定版本**。验证发布者签名、SHA-256和包结构；编辑或预览期间推迟替换。新版CoSkin无法就绪时恢复之前的安装。Codex和主题数据不属于更新内容。关闭自动更新后不在后台检查，仍可在设置中手动检查。[发布更新](docs/updates.md)

## 实际界面

![0.1.0 主题库](docs/media/theme-library-0.1.0.png)

独立生成的鸣潮守岸人非官方同人示例，不包含在运行ZIP中。[媒体来源](docs/media/wuthering-waves/ASSET-NOTES.md)

![主题库](docs/media/wuthering-waves/shorekeeper-theme-library.png)
![主题详情](docs/media/wuthering-waves/shorekeeper-theme-detail.png)
![效果编辑](docs/media/wuthering-waves/shorekeeper-effect-editor.png)
![应用背景](docs/media/wuthering-waves/shorekeeper-live-applied.png)
![行悬停效果](docs/media/wuthering-waves/shorekeeper-hover.gif)
![实际GIF背景](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

部分示例录制于首个测试版。它们不是帧率保证或性能基准。

## 性能与语言

界面优先跟随Codex语言，支持 **韩语、英语、日语和简体中文**。其他语言回退为英语。

固定GIF背景在滚轮滚动期间继续播放。移动的侧栏行效果及GIF会短暂暂停，以优先保证列表响应。隐藏、最小化或离开屏幕时停止动画。可跟随Windows减少动态效果设置，或选择允许/关闭。大型GIF和多个高分辨率背景仍会带来开销。

通过 **47项Node测试、171项主机检查**以及ESLint和TypeScript检查。验证了真实安装更新、连接正在运行的Codex和数据保留。[验证范围](docs/support-matrix.md)区分了测试条件与尚未验证的环境。

## 开发

需要Node 24、.NET 10及用于原生模块的Visual Studio 2022 C++ x64工具。

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
./scripts/build.ps1 -Portable
dotnet run --project tests/CoSkin.HostTests
```

不修改原版Codex文件、ASAR及快捷方式。个人日志、用户界面、存储和发布者私钥不会公开。

[设计](docs/CoSkin-설계서.md) · [结构](docs/architecture.md) · [.coskin协议](docs/coskin-package-v1.md)

## 许可证

CoSkin源码尚未指定许可证。依赖组件采用各自的许可证，请参阅[第三方声明](THIRD-PARTY-NOTICES.txt)。角色相关权利属于相应权利人。
