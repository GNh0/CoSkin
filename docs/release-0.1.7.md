# CoSkin 0.1.7

## 한국어

같은 아이콘을 사용하는 테마를 전환하거나 행을 호버할 때, 아이콘이 행 전체 너비로 늘어나던 문제를 수정했습니다. 아이콘은 원래 버튼·행의 아이콘 위치와 크기를 유지하면서 효과를 재생합니다.

테마 목록의 미리보기 대기 작업을 제한하고 화면을 떠나면 취소합니다. 늦게 완료된 이미지·영상과 전송을 정리하며, 4K 영상의 적용 전 검사와 실행 캐시가 같은 메모리 예산을 사용하도록 수정했습니다. 미리보기 캐시 48개, 대기 작업 96개, 동시 실행 1개를 유지합니다. 이미 시작된 브라우저 디코딩은 완료 또는 기존 시간 제한까지 기다린 뒤 해제합니다.

기존 테마·미디어·리비전·설정을 보존합니다. 파일 중복 저장 방지와 실제 최적화 범위는 [미디어 저장 안내](theme-assets.md)에 설명했습니다. 원본 자동 재압축이나 과거 자산 자동 삭제는 추가하지 않았습니다.

Node 검사 119개, .NET 호스트 검사 220개, ESLint·TypeScript·Windows x64 빌드를 통과했습니다. 실제 설치본에서 같은 캐릭터의 테마 4개를 전환하고 기본·호버·선택 호버·기본 복귀 16항목을 검사해, 24px 행 아이콘이 원래 크기를 유지하는 것을 확인했습니다. 검수 후 원래 적용 테마를 복원했습니다.

## English

Fixed icons stretching across an entire row when switching themes that share an icon or hovering a row. Icons retain their native glyph-sized paint box while effects play.

Preview work is bounded and cancelled when its page/container is disposed. Late images, videos and transfer leases are released. UHD video preparation now uses the same memory budget as the runtime cache. Limits are 48 completed previews, 96 pending jobs and one running job. Browser decoding already in progress finishes or reaches its existing timeout before cleanup.

Existing themes, assets, revisions and settings are preserved. [Media storage](theme-assets.md) documents deduplication and optimization boundaries. Automatic source recompression and historical-asset deletion were not added.

Passed 119 Node tests, 220 host tests, ESLint, TypeScript and Windows x64 publishing. The installed build passed 16 actual theme/state transitions across four same-character themes; 24px row icons retained their size and the original binding was restored.

## 日本語

同じアイコンを使用するテーマへの切り替えや行のホバーで、アイコンが行全体に伸びる問題を修正しました。元のアイコン位置とサイズを保って効果を再生します。

プレビューの待機処理を制限し、ページやカードを閉じると中止します。遅れて完成した画像・動画・転送を解放し、4K動画の適用前検査と実行キャッシュの予算を統一しました。完成48件・待機96件・同時実行1件です。開始済みのブラウザデコードは完了または既存の時間制限後に解放します。

既存テーマ・素材・履歴・設定は保持します。自動再圧縮や履歴素材の自動削除は追加していません。Node119件、ホスト220件、静的検査・Windows x64ビルドを通過し、実際の4テーマ/16状態変更で24pxアイコンのサイズ保持と元の適用状態への復帰を確認しました。

## 简体中文

修复切换使用相同图标的主题或悬停行时，图标被拉伸至整行的问题。图标保持原始位置和尺寸并播放效果。

限制预览队列并在关闭页面或卡片时取消任务，释放迟到的图像、视频与传输资源。4K视频应用前检查使用与运行缓存一致的预算。完成缓存48个、待处理96个、同时运行1个。已经开始的浏览器解码会在完成或原有超时后清理。

保留已有主题、素材、版本历史及设置；没有新增自动重新压缩或历史素材删除功能。通过119个Node测试、220个主机测试、静态检查与Windows x64构建。实际安装版通过4个主题的16次状态转换检查，24px行图标保持尺寸，并恢复原来的主题。
