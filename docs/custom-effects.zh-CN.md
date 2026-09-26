# 自定义效果

CoSkin使用TypeScript契约及Web Animations API。开发者编写声明式 `*.coskin-effect.json`，而不是JavaScript或CSS字符串。禁止选择器、URL、网络操作及代码执行。

将[示例](examples/soft-rise.coskin-effect.json)通过“效果 → 我的效果 → 导入效果”注册。名称或ID冲突时，显式选择重命名保存或替换。选择效果会将定义复制到主题；删除或替换效果库条目不会改变主题副本。`.coskin`导出包含 `theme.json.customEffects`。

版本1数值：opacity=0～1（乘以图层静态不透明度）、translateXPx/YPx=−1000～1000、scale=0.1～3、rotateDeg=−360～360、blurPx=0～20（追加到静态滤镜）、insetTop/Right/Bottom/Left=0～100%。2～16帧，offset从0到1严格递增，各帧属性集必须相同。反向播放同时倒序并转换 `1-offset`。

限制：每定义8KiB，每主题或效果库32个定义/总64KiB，导入文件64KiB；每次5秒，有限重复1～3次。ID以 `custom.`开头，只含小写字母、数字、点和连字符。名称80字符，说明512字符。拒绝未知属性、非有限数值及不支持的版本。JSON错误报告行及UTF-8字节位置。

`src/core/custom-effects.ts`是唯一验证及编译契约。宿主先检查大小和重复键，再调用相同渲染器契约。类型检查、lint、Node测试、宿主存储测试与实际画面验证分别进行。
