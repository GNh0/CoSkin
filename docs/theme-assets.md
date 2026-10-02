# 테마 미디어 저장과 목록 로딩

CoSkin의 기본 저장소는 `%LOCALAPPDATA%\CoSkin`입니다. 테마 문서는 `revision-<key>-<revision>.json`, 이미지와 영상은 `assets\<sha256>.bin`에 저장합니다. 파일 내용으로 미디어 종류를 확인합니다. 테마 문서의 자산 경로는 이 해시를 참조합니다. 같은 바이트의 파일을 여러 테마에서 사용해도 미디어 파일은 한 번만 저장합니다.

새 리비전은 이전 리비전과 미디어를 보존합니다. 새 버튼 아이콘을 추가해도 기존 배경 영상을 복사할 필요가 없습니다. 내보낸 `.coskin` 패키지는 참조한 실제 자산을 포함합니다.

0.1.9부터 설정의 **테마 전체 보관 폴더**에서 모든 테마가 함께 사용하는 이미지·영상 폴더를 지정합니다. 현재 용량과 자산 수를 표시하며, 폴더 변경은 복사와 SHA256 검증이 모두 끝난 뒤 설정을 전환합니다. 원래 폴더의 파일과 라이브러리·리비전·설정은 보존합니다. 실패하면 이전 설정으로 계속 사용합니다. 외장 드라이브의 연결 해제는 자동 삭제로 처리하지 않습니다.

한 줄 목록은 미리보기 미디어를 요청하지 않습니다. 카드 미리보기는 화면에 들어온 항목만 준비하고, 완료된 미리보기는 최대 48개 보관합니다. 0.1.7부터 대기 작업도 최대 96개이며 카드가 사라지거나 화면을 전환하면 해당 작업을 취소합니다. 이미 실행 중인 전송은 현재 조각 이후 중단하고 전송 토큰과 디코딩 자원을 해제합니다. 취소된 결과가 늦게 도착해도 화면에 붙이거나 캐시에 남기지 않습니다.

실제 테마 실행은 미디어 해시별 디코딩 캐시와 동시에 진행 중인 로드를 공유합니다. 기본 추정 메모리 예산은128MiB, 4K 영상은256MiB, 25MiB를 넘는 영상이 활성화되거나 준비 중이면768MiB이며 최대64개 자산입니다. 압축 영상 바이트와 디코딩 버퍼 추정값을 포함하고 사용하지 않는 자산을 먼저 해제합니다. 적용 전 검증도 같은 예산 계산을 사용합니다. 이는 CoSkin의 미디어 추정값이며 Chromium/GPU/프로세스 전체 사용량의 절대 상한이 아닙니다. 큰 GIF는 별도 프레임·픽셀 제한을 따릅니다.

0.1.9는 영상 SHA별로 최대1024px PNG 대표 프레임을 파생 캐시에 저장합니다. 다음 카드 미리보기는 큰 영상을 다시 읽고 디코딩하는 대신 해당 PNG를 사용합니다. 전체 파생 캐시는128MiB이며 오래 사용하지 않은 파생 PNG부터 제거합니다. 원본은 제거하지 않습니다. 캐시 누락·손상 시 실제 원본 검증 경로로 돌아갑니다. 창의 미디어 로드와 디코딩은 동시에2개로 제한합니다.

WebM은 MP4 변환 없이 사용할 수 있습니다. 영상 한 파일은 최대512MiB/600초, 이미지·GIF 한 파일은25MiB입니다. 큰 바이트 응답은 실행할 JS 문자열에 넣지 않고 함수 인수로 전달합니다. 현재 Codex의 CSP를 변경하지 않으므로 파이프/Blob 전송을 사용하며, 전체 영상의 압축 바이트가 메모리를 전혀 쓰지 않는다고 보장하지 않습니다. 네이티브 video 요소로 재생하고 매 프레임 캔버스로 다시 그리지 않으며, 최소화·숨김 중 재생을 멈춥니다.

원본 자동 재압축·해상도 변경과 과거 리비전의 미사용 자산 자동 삭제는 제공하지 않습니다. 영상 압축은 테마 제작 단계에서 처리하며, 기존 사용자 자료를 용량 최적화 이유로 삭제하지 않습니다.

## Storage and preview loading

The default store is `%LOCALAPPDATA%\CoSkin`. Revision JSON documents reference media by SHA-256; identical bytes are stored once in `assets\<sha256>.bin`. Revisions preserve previous documents and assets. Exported packages include their referenced media.

The one-line list requests no preview media. Visible cards load lazily, with at most 48 completed previews and 96 pending jobs. From 0.1.7, removing a card or leaving a page cancels its work; transfers stop after the current chunk, and stale results release their resources.

From 0.1.9, Settings selects one shared media folder. Migration copies and verifies SHA256 before committing the new path, preserving originals and revisions. Video posters are cached by source SHA as PNG, up to1024px and128MiB total; only derived posters are evicted. Cache misses fall back to the original. Media work is limited to two concurrent jobs per window. WebM needs no MP4 conversion; videos support512MiB/600seconds, images/GIF25MiB.

Runtime media loads share a hash cache and pending requests. Estimated budgets are128MiB normally,256MiB for active/incoming4K videos,768MiB for videos exceeding25MiB, and64assets. Compressed bytes and estimated decoder buffers count toward the budget. These estimates do not bound the entire Chromium/GPU process. Current Codex CSP is preserved; the verified path uses pipe/Blob transfers rather than unrestricted HTTP streaming. Native video playback pauses while hidden/minimized. Automatic recompression, resizing and historical-asset garbage collection are not implemented.

## 保存とプレビュー

既定の保存先は `%LOCALAPPDATA%\CoSkin` です。テーマ履歴はメディアのSHA-256を参照し、同一内容を一度だけ保存します。古い履歴と素材は保持します。一行一覧はプレビューメディアを要求しません。表示中のカードだけを読み込み、完成プレビュー48件・待機96件を上限とし、0.1.7からカードやページを閉じると処理を中止して遅延結果を解放します。

0.1.9では設定から全テーマ共通の素材フォルダーを選べます。コピーとSHA256検証の完了後に保存先を切り替え、元ファイルと履歴を残します。動画の代表PNGをSHA別に最大1024px・合計128MiBで保存し、削除対象は派生PNGだけです。メディア処理は同時2件までです。WebMはMP4変換不要で、動画512MiB/600秒・画像/GIF25MiBまでです。

実行用キャッシュの推定予算は通常128MiB、4K動画256MiB、25MiBを超える動画768MiB、最大64素材です。圧縮バイトとデコーダーの推定費用を含みますが、プロセス全体の上限ではありません。CodexのCSPを変更せずパイプ/Blobを使います。最小化・非表示中は再生を停止します。原本の自動再圧縮・リサイズ・履歴素材の自動削除は実装していません。

## 存储与预览

默认目录是 `%LOCALAPPDATA%\CoSkin`。主题历史通过SHA-256引用媒体，相同内容只保存一次；保留旧版本和素材。单行列表不请求预览媒体。仅加载可见卡片，最多缓存48个完成预览、96个待处理任务。0.1.7起，移除卡片或离开页面会取消工作，并释放迟到结果的资源。

0.1.9可在设置中选择所有主题共用的素材目录。复制和SHA256验证完成后才切换路径，保留原文件及历史记录。按源SHA缓存最大1024px的PNG视频封面，总预算128MiB，只淘汰派生PNG。每个窗口最多同时处理两个媒体任务。WebM无需转换MP4；视频上限512MiB/600秒，图片/GIF上限25MiB。

运行缓存的估算预算为普通128MiB、4K视频256MiB、超过25MiB的视频768MiB、最多64个素材，包含压缩数据和解码缓冲估算。这不是整个Chromium/GPU进程的绝对上限。保留Codex的CSP并使用管道/Blob传输；隐藏或最小化时暂停播放。没有自动重新压缩原文件、调整分辨率或删除历史素材的功能。
