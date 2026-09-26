# CoSkin架构与变更流程

## 语言及职责

C#宿主采用.NET 10 LTS，负责Windows包/签名/进程及窗口验证、受限本地连接、ZIP/文件边界、hash资源、不可变版本、应用事务和恢复。最终用户不需要Node。

渲染器在Chromium运行ES模块。strict TypeScript的 `src/core` 是主题、效果契约及状态/范围合成的唯一语义依据，esbuild打包实际模块图。宿主调用已验证Codex渲染器中的同一验证器，不在C#重复语义规则。byte/path验证属于独立信任边界。整个JavaScript渲染器的strict类型转换尚未完成。

`ThemeDocument`包含manifest/theme/hash资源及本地单项覆盖。包按相对路径保存原资源字节。项目/聊天ID仅留在本地覆盖中，不导出至共享主题；UI语言也不写入主题。

## 模块

core负责契约、效果、UI状态和GIF策略；adapter负责版本相关的实际data属性、目标/上下文、左栏入口及专用页面恢复。gallery/detail/editor/components/styles负责UI及不捕获真实聊天的合成预览。locale/messages管理应用语言优先级及四种字典。controller/layers/media/worker负责按需更新、保留原输入、独立装饰和媒体生命周期。宿主负责启动身份、可见性、存储及分类错误；原始诊断保留在日志中。

## 保存与应用

保存生成新版本；应用另行改变范围到主题/版本/配置的绑定。连接窗口先准备、提交，再原子替换状态；失败恢复原summary。import先验证ZIP/字节/语义/冲突，再保存资源。create/save/apply检查hash、MIME及路径一致性。多窗口中断及所有失败路径仍需独立验证。

产品文件使用24KiB分块传输，已移除整个包的Base64往返；存储测试兼容路径仍保留Base64。ZIP处理、传输消费及浏览器下载仍分配完整字节数组，因此最大包流式处理和内存峰值尚未完成。

## 资源与可见性

静态空闲画面不重复遍历完整库、文档和目标。观察器忽略自身变化；pointer/focus只更新相关目标，保留轻量连接监控。同hash解码请求和GIF帧共享，单一scheduler仅服务活动播放；有限GIF遵循源循环信息。解码缓存限制128MiB/64项，未使用LRU降低至8MiB。瞬时解码、源字节及宿主内存需分别测量。

已验证PID的HWND与渲染器位置唯一匹配才建立关联。最小化、隐藏、cloaked或显示器外暂停动画；不明确的窗口匹配仅暂停动画，保留静态编辑。同位置多窗口、混合DPI及完全遮挡不宣称已全面支持。

## 构建及升级

采用Node 24 LTS、.NET 10 LTS、精确依赖版本及锁文件。执行typecheck、lint、Node测试、bundle、宿主build和存储测试。不放宽执行策略；相对模块ID和PathMap避免开发机路径，Release不分发PDB。附带gifuct-js及js-binary-schema-parser的完整MIT许可证。

新Codex支持流程：观察稳定属性、修改adapter/版本、契约测试、实际输入/无障碍/恢复/虚拟化检查、CPU/内存测量、更新支持表。不得修改原ASAR/可执行文件或关闭完整性检查。

## 分发与验证边界

副本连接与 `--prepare-launch`复用验证不等于安装完成。保留原应用运行中的保护。已有初始self-contained构建，但最新最终产物未通过分发验收。安装CLI、导入现有连接、单实例通道、快捷方式、rollback及实际安装/卸载仍未完成。卸载必须保留用户库和资源。

`custom-effects.ts`是用户效果唯一验证/编译契约，宿主在注册、保存、import中调用。效果库和主题副本独立。参见[开发文档](custom-effects.zh-CN.md)、[实现状态](support-matrix.md)及独立docs/review。7n实际输入、播放和往返检查正在进行。
