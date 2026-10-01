# 테마 미디어 저장과 목록 로딩

CoSkin의 기본 저장소는 `%LOCALAPPDATA%\CoSkin`입니다. 테마 문서는 `revision-<key>-<revision>.json`, 이미지와 영상은 `assets\<sha256>.bin`에 저장합니다. 파일 내용으로 미디어 종류를 확인합니다. 테마 문서의 자산 경로는 이 해시를 참조합니다. 같은 바이트의 파일을 여러 테마에서 사용해도 미디어 파일은 한 번만 저장합니다.

새 리비전은 이전 리비전과 미디어를 보존합니다. 새 버튼 아이콘을 추가해도 기존 배경 영상을 복사할 필요가 없습니다. 내보낸 `.coskin` 패키지는 참조한 실제 자산을 포함합니다.

한 줄 목록은 미리보기 미디어를 요청하지 않습니다. 카드 미리보기는 화면에 들어온 항목만 준비하고, 완료된 미리보기는 최대 48개 보관합니다. 0.1.7부터 대기 작업도 최대 96개이며 카드가 사라지거나 화면을 전환하면 해당 작업을 취소합니다. 이미 실행 중인 전송은 현재 조각 이후 중단하고 전송 토큰과 디코딩 자원을 해제합니다. 취소된 결과가 늦게 도착해도 화면에 붙이거나 캐시에 남기지 않습니다.

실제 테마 실행은 미디어 해시별 디코딩 캐시와 동시에 진행 중인 로드를 공유합니다. 기본 추정 메모리 예산은 128MiB, 4K 영상이 활성화되거나 준비 중이면 256MiB이며 최대 64개 자산입니다. 적용 전 검증도 같은 예산 계산을 사용합니다. 이는 CoSkin의 미디어 추정값이며 Chromium/GPU/프로세스 전체 사용량의 절대 상한이 아닙니다. 큰 GIF는 별도 프레임·픽셀 제한을 따릅니다.

서로 다른 테마의 합성 카드 미리보기는 실행용 캐시와 별도로 자산을 읽고 디코딩합니다. 동일한 영상 해시의 미리보기 디코딩까지 테마 간 공유하지는 않습니다. 원본 자동 재압축·해상도 변경과 과거 리비전의 미사용 자산 자동 삭제도 제공하지 않습니다. 영상 압축은 테마 제작 단계에서 처리하며, 기존 사용자 자료를 용량 최적화 이유로 삭제하지 않습니다.

## Storage and preview loading

The default store is `%LOCALAPPDATA%\CoSkin`. Revision JSON documents reference media by SHA-256; identical bytes are stored once in `assets\<sha256>.bin`. Revisions preserve previous documents and assets. Exported packages include their referenced media.

The one-line list requests no preview media. Visible cards load lazily, with at most 48 completed previews and 96 pending jobs. From 0.1.7, removing a card or leaving a page cancels its work; transfers stop after the current chunk, and stale results release their resources.

Runtime media loads share a hash cache and pending requests. Estimated budgets are 128MiB normally, 256MiB for active/incoming 4K videos, and 64 assets. Preparation uses the same calculation. These estimates do not bound the entire Chromium/GPU process. Synthetic previews decode separately across themes. Automatic recompression, resizing and historical-asset garbage collection are not implemented.

## 保存とプレビュー

既定の保存先は `%LOCALAPPDATA%\CoSkin` です。テーマ履歴はメディアのSHA-256を参照し、同一内容を一度だけ保存します。古い履歴と素材は保持します。一行一覧はプレビューメディアを要求しません。表示中のカードだけを読み込み、完成プレビュー48件・待機96件を上限とし、0.1.7からカードやページを閉じると処理を中止して遅延結果を解放します。

実行用キャッシュの推定予算は通常128MiB、4K動画の使用・準備時256MiB、最大64素材で、適用前検証も同じ計算です。プロセス全体のメモリ上限ではありません。別テーマの合成プレビューは個別にデコードします。自動再圧縮・リサイズ・履歴素材の自動削除は実装していません。

## 存储与预览

默认目录是 `%LOCALAPPDATA%\CoSkin`。主题历史通过SHA-256引用媒体，相同内容只保存一次；保留旧版本和素材。单行列表不请求预览媒体。仅加载可见卡片，最多缓存48个完成预览、96个待处理任务。0.1.7起，移除卡片或离开页面会取消工作，并释放迟到结果的资源。

运行缓存的估算预算为普通128MiB、使用或准备4K视频时256MiB、最多64个素材；应用前检查使用相同计算。这不是整个Chromium/GPU进程的绝对上限。不同主题的合成预览仍分别解码。没有自动重新压缩、调整分辨率或删除历史素材的功能。
