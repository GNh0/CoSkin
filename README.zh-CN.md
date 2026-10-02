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

请在 **Windows x64**上以相同的Windows权限级别运行两个应用。CoSkin 0.1.6起根据原始文件签名和实际连接功能进行检查，不再使用固定Codex版本列表。已在Codex 26.928.2636.0上验证。未来内部连接API发生变化时可能需要更新CoSkin。

## 可以自定义什么？

| 功能            | 用途                                                          |
| --------------- | ------------------------------------------------------------- |
| 主题库          | 创建、导入、删除，在卡片上直接预览和应用                      |
| 整理与搜索      | 嵌套文件夹树、收藏和标签，页码、排序及多选整理                |
| 详情与编辑      | 修改主题信息、复制、在真实界面中编辑、导出                    |
| 图片、GIF与视频 | 设置背景、装饰和图标，静音循环MP4/WebM，显示各区域推荐分辨率和比例 |
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

通过左侧文件夹树和右侧文件夹、主题列表浏览。单击选择文件夹，**双击或Enter**打开；单击主题打开管理界面。**文件夹视图/树视图**与**预览卡片/单行列表**可分别切换，并支持路径、后退、前进、上级及包含子文件夹。将主题卡片拖到文件夹即可移动分类，也可跨页多选并批量移动、修改收藏或添加标签。支持页码、首页/末页/指定页及每页24/48/96项，从详情返回时保留搜索和列表位置。单行列表不加载媒体预览。[主题库管理指南](docs/theme-library.md)

**主题自动文字颜色** 优先保证对比度，再轻微融入主题色。必要时会加深文字背后的表面，改善明亮视频上的可读性。在文字编辑中选择 **手动指定**，可为各区域分别设置颜色、已安装字体和字重。

## 动态背景与效果

将GIF背景与行悬停效果组合，制作自己的主题。

短片段可用GIF，较长的角色动作可用 **MP4/WebM**。视频静音循环播放，**无效果** 配置则显示静态画面。最小化后恢复会继续之前的播放位置。视频支持512MiB及10分钟，并检查实际解码。图片设置会显示当前区域的推荐分辨率和比例。选择 **显示完整图片** 可以保留完整动作。

在设置的 **主题保存目录** 指定所有主题图片与视频的共同目录。迁移先核验复制文件的哈希，再切换位置，保留原文件。相同媒体按SHA256去重；主题信息、修订及运行设置仍保存在原CoSkin目录。显示与排序集中在选项菜单，筛选及文件夹、批量管理按需打开。

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
