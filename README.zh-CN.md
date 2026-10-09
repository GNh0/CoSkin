<img src="assets/coskin.svg" alt="CoSkin" width="64">

# CoSkin

**把 Codex 变成自己的空间。**

动态背景、配套图标与侧栏装饰，以及清晰易读的聊天界面。在 Codex 中预览主题，再应用到整个应用、项目或聊天。

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[Windows 下载](https://github.com/GNh0/CoSkin/releases/latest) · [主题格式](docs/theme-package-spec.md) · [需求模板](docs/theme-request-template.md) · [自定义效果](docs/custom-effects.md) · [兼容性](docs/support-matrix.md)

![爱弥斯·雨夜回忆 — 动态背景与侧栏效果](docs/media/current/aemeath-rainy-memories.webp)

*鸣潮爱弥斯 2D 视频主题：在示例工作区中使用真实 CoSkin 渲染器。[截图说明](docs/media/current/README.md)*

## 开始使用

1. 从[最新版本](https://github.com/GNh0/CoSkin/releases/latest)下载 ZIP 并解压。
2. 运行 **CoSkin.Loader.exe**，选择安装选项。
3. 启动 Codex 和 CoSkin，从左侧图标栏打开 **CoSkin**。
4. 导入或创建主题，选择**预览 → 应用**。

先启动 CoSkin 时，它会在托盘等待 Codex。通过桌面 **CoSkin** 独立启动，或在开始菜单选择 **Codex + CoSkin** 同时启动。不需要开发工具。

在 **Windows x64** 中以相同 Windows 权限运行两者。连接会检查原应用签名和实际连接能力。本文功能与截图基于 **CoSkin 0.1.18 的当前 main 源码**，验证环境见[支持说明](docs/support-matrix.md)。

## 可以自定义什么？

| 功能 | 内容 |
| --- | --- |
| 背景 | PNG、JPEG、GIF、MP4、WebM；静音循环、位置、适配、不透明度、视频速度 |
| 图标与侧栏行 | 导航按钮、项目与聊天行的图片、颜色、边框与装饰 |
| 可读性 | 自动文字对比度或手动颜色、字体、字重；正文背景和视频不透明度 |
| 效果 | 悬停、点击、选中、进入、退出、循环，以及静态配置 |
| 应用范围 | 整个应用、项目或聊天；同类全部元素或单个条目 |
| 主题库 | 多级文件夹、标签、收藏、搜索、排序、多选、卡片或单行列表 |
| 分享与保存 | 导入、复制、导出；原背景提取、转换、下载队列 |
| 运行管理 | 连接与播放窗口数量、共享媒体目录、启动、退出、更新 |

## 同一角色，不同氛围

每个示例都设计了配套图标与行装饰。**项目为有轮廓的卡片**，**聊天为装饰更少的简洁行**。

| 天空泡泡 | 雨夜回忆 | 星光低语 |
| :---: | :---: | :---: |
| ![天空泡泡](docs/media/current/aemeath-bubble-sky.png) | ![雨夜回忆](docs/media/current/aemeath-rainy-memories.png) | ![星光低语](docs/media/current/aemeath-whispering-stars.png) |
| 珍珠、泡泡与青色 | 霓虹、雨线与紫色 | 金色星星、翅膀与轨道 |

![三款主题的图标及项目、聊天行](docs/media/current/aemeath-signatures.png)

<details>
<summary>查看天空与星夜的动态示例</summary>

**天空泡泡**

![天空泡泡动态示例](docs/media/current/aemeath-bubble-sky.webp)

**星光低语**

![星光低语动态示例](docs/media/current/aemeath-whispering-stars.webp)

</details>

示例提供视频配置和静态图片的**无效果**配置。这些是非官方同人主题，不代表安装程序附带的主题列表。[素材来源](docs/media/current/ASSET-NOTES.md)

<details>
<summary>表情与身体动态的额外2D主题·蓝色共鸣</summary>

**蓝色共鸣**结合眼睛、嘴部、头部、上半身与头发的2D原画动画，以及青色共鸣图标和波形行装饰。

![爱弥斯·蓝色共鸣 — 2D角色动画](docs/media/current/aemeath-blue-resonance.webp)

</details>

## 选择与整理

**预览**显示在实际 Codex 窗口中，**应用**反映到所选范围；取消会恢复之前的主题。详情页支持信息编辑、复制、导出和背景提取。

| 主题库 | 详情 |
| :---: | :---: |
| ![当前主题库](docs/media/current/theme-library.png) | ![当前详情页](docs/media/current/theme-detail.png) |

**双击或 Enter**打开文件夹。支持路径、后退、前进、上级目录；文件夹/树形与卡片/单行显示可分别切换。单行列表不加载媒体预览。

支持搜索、标签、收藏、排序、包含子文件夹和多选。拖动仅更改分类，不移动媒体。每页 **24/48/96 项**并可直接跳转，返回详情后保留列表位置。[主题库指南](docs/theme-library.md)

## 编辑界面与可读性

选择**编辑**，再**右键**目标区域。调整背景、正文、输入框、按钮、项目和聊天行的图片、效果、文字。可修改全部同类元素或**单独指定**。

背景太亮时，**降低视频不透明度**或**提高正文背景不透明度**。自动文字颜色优先保证对比度；手动模式支持颜色、已安装字体、字重。

<details>
<summary>查看视频与不透明度编辑器</summary>

![视频、不透明度、播放速度](docs/media/current/image-editor.png)

</details>

**保存**保留修改，**应用**反映到所选范围。副本继承文件夹、标签、收藏。委托 AI 时提供[需求模板](docs/theme-request-template.md)和[文件规范](docs/theme-package-spec.md)。

## 动态背景与仅显示背景

MP4、WebM 静音循环播放。支持 **0.1～4 倍速**、位置、**填满画面/完整显示**及不透明度。窗口恢复后继续播放。单个视频支持 **512MiB、10 分钟**以内，并检查分辨率、时长和解码。

标题栏的**仅显示背景**或 **Alt+Shift+B** 隐藏工作界面。内置浏览器隐藏修复包含在 **v0.1.18 之后的 main** 中。使用恢复按钮、相同快捷键或 **Esc** 返回。

GIF 或效果不动时，请检查主题动画和 Windows 的**减少动态效果**。大型 GIF 可能影响内存和滚动，较长动画建议使用 MP4、WebM。

## 背景保存与下载

**提取背景 → 原画质下载**不重新压缩已注册媒体。支持 JPG、PNG、MP4、WebM、GIF 转换，以及 **720p、1080p、原分辨率、自定义尺寸**。

队列支持 **1～4 个并发任务**。相同背景和设置不会重复添加。CoSkin 仍运行时，关闭提取面板后任务继续。[背景下载指南](docs/background-downloads.md)

## 运行与存储设置

从托盘切换主题或打开 **CoSkin 设置**。

- **连接/播放窗口限制**：默认 5/2。连接数 1～10，播放数不超过连接数。优先活动和最近使用窗口，最小化窗口暂停播放。
- **隐藏开始问候语**：隐藏新聊天问候，保留输入框。
- **共享媒体目录**：查看路径和占用。迁移复制文件并验证 SHA256，保留原文件。
- **Windows 登录时启动 / 随 Codex 退出**：登录后等待 Codex，或随最后一个连接的 Codex 退出。
- **自动更新 / 手动检查**：检查并安装 GitHub 稳定版本。

媒体以 SHA256 去重。主题库、修订和设置仍在原存储中。绘制异常可用托盘的**刷新主题**。

<details>
<summary>查看当前设置页</summary>

![窗口数量、问候语、共享目录](docs/media/current/runtime-settings.png)

</details>

## 更多信息

[开发与构建](docs/development.md) · [自定义效果](docs/custom-effects.md) · [支持环境](docs/support-matrix.md) · [更新](docs/updates.md)

CoSkin 源码尚未指定许可证，外部组件见[第三方声明](THIRD-PARTY-NOTICES.txt)。
