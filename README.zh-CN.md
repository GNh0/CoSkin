<img src="assets/coskin.svg" alt="CoSkin" width="64">

# CoSkin

**让Codex成为你的专属空间。**

用图片、动态背景和效果装扮Codex。选择主题，在真实界面中预览，再一键应用。

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[下载Windows版](https://github.com/GNh0/CoSkin/releases/latest) · [主题文件规范](docs/theme-package-spec.md) · [自定义效果](docs/custom-effects.md) · [兼容性说明](docs/support-matrix.md)

![使用CoSkin装扮的Codex](docs/media/wuthering-waves/shorekeeper-live-applied.png)

## 开始使用

1. 从[最新版本](https://github.com/GNh0/CoSkin/releases/latest)下载ZIP并解压。
2. 运行 **CoSkin.Loader.exe**，选择安装选项。
3. 启动Codex和CoSkin。**无论先启动哪个应用，都会自动连接。**

CoSkin先启动时会在托盘等待Codex。桌面的 **CoSkin** 快捷方式可单独启动，开始菜单的 **Codex + CoSkin** 可同时启动两个应用，无需安装开发工具。

当前支持 **Windows x64 · Codex 26.924.2738.0**。请以相同的Windows权限级别运行两个应用。

## 可以自定义什么？

| 功能            | 用途                                                          |
| --------------- | ------------------------------------------------------------- |
| 主题库          | 创建、导入、删除，在卡片上直接预览和应用                      |
| 整理与搜索      | 组合分组、收藏和标签筛选主题                                  |
| 详情与编辑      | 修改主题信息、复制、在真实界面中编辑、导出                    |
| 图片、GIF与视频 | 设置背景、装饰和图标，静音循环MP4，显示各区域推荐分辨率和比例 |
| 文字样式        | 随主题自动调整文字颜色，也可手动指定颜色、已安装字体和字重    |
| 动画效果        | 设置悬停、点击、选中状态，以及进入、退出和循环效果            |
| 应用范围        | 应用于整个应用、项目或聊天，也可单独设置某一项                |
| 语言            | 跟随Codex显示韩语、英语、日语或简体中文                       |

## 选择与编辑主题

从左侧图标栏打开 **CoSkin**。点击卡片上的 **预览**试用主题，再用 **应用**切换。点击卡片可进入详情页面，进行编辑、复制和导出。

如果要请 AI 制作主题，请同时提供[请求模板](docs/theme-request-template.md)和[文件规范与制作步骤](docs/theme-package-spec.md)。CoSkin 0.1.4 及更高版本也可在主题库中通过 **请求制作主题** 编辑并复制请求。

|                    主题库                     |                              详情与预览                              |
| :-------------------------------------------: | :------------------------------------------------------------------: |
| ![主题库](docs/media/theme-library-0.1.2.png) | ![主题详情](docs/media/wuthering-waves/shorekeeper-theme-detail.png) |

在编辑模式中 **右键点击**要装扮的区域，即可调整图片、效果和样式。项目行和聊天行默认应用于同类全部行，选择 **单独指定**即可只修改当前项。

**保存**保留主题修改，**应用**将修改反映到所选范围。取消预览会回到之前的主题。通过[自定义效果指南](docs/custom-effects.md)可以添加和分享自己制作的效果。

用卡片上的星标添加 **收藏**，在详情页整理 **分组和标签**。搜索词、分组、标签和收藏筛选可以组合使用。

**主题自动文字颜色** 优先保证对比度，再轻微融入主题色。必要时会加深文字背后的表面，改善明亮视频上的可读性。在文字编辑中选择 **手动指定**，可为各区域分别设置颜色、已安装字体和字重。

## 动态背景与效果

将GIF背景与行悬停效果组合，制作自己的主题。

短片段可用GIF，较长的角色动作可用 **MP4**。MP4静音循环播放，**无效果** 配置则显示静态画面。最小化后恢复会继续之前的播放位置。图片设置会显示当前区域的推荐分辨率和比例。选择 **显示完整图片** 可以保留完整动作。

![动态GIF背景](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

<details>
<summary>查看效果编辑与悬停示例</summary>

**效果编辑**

![效果编辑](docs/media/wuthering-waves/shorekeeper-effect-editor.png)

**项目行悬停**

![项目行悬停效果](docs/media/wuthering-waves/shorekeeper-hover.gif)

</details>

界面示例为鸣潮守岸人非官方同人主题。[图片与GIF制作信息](docs/media/wuthering-waves/ASSET-NOTES.md)

## 启动与更新设置

在托盘中可切换主题或打开 **CoSkin设置**。
如果背景上的暗色图层消失，可在托盘中选择 **刷新主题**，重新绘制当前主题。

- **Windows登录时启动**：让CoSkin提前待命，在Codex启动时连接。
- **随Codex退出**：最后一个已连接Codex退出时，CoSkin也会退出。
- **自动更新**：下载并安装GitHub上的新稳定版本，也可在设置中手动检查。

如果GIF不播放，请检查效果中的动态选项及Windows的 **减少动态效果** 设置。大型GIF可能影响滚动性能。

## 更多文档

[开发与构建](docs/development.md) · [自定义效果](docs/custom-effects.md) · [支持环境](docs/support-matrix.md) · [发布更新](docs/updates.md)

CoSkin源码尚未指定许可证。依赖组件的许可证请参阅[第三方声明](THIRD-PARTY-NOTICES.txt)。
