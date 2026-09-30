# 테마 목록과 폴더 관리 / Theme library

## 한국어

CoSkin 0.1.6부터 왼쪽 폴더 트리와 오른쪽 폴더·테마 목록으로 탐색합니다. 예를 들어 `니케 → 라피 → 기본 → 전투`처럼 폴더 안에 하위 폴더를 만드세요. 홈에는 최상위 폴더와 미분류 테마가 함께 표시됩니다. 폴더 카드를 한 번 누르면 선택하고 **더블 클릭 또는 Enter**로 열면 그 안의 하위 폴더와 직접 테마가 표시됩니다. 테마를 누르면 기존 관리 화면이 열립니다. **전체**는 모든 테마를, **미분류**는 아직 정리하지 않은 테마를 보여줍니다.

**폴더 보기/트리 보기**는 탐색 구조를, **미리보기 카드/한 줄 목록**은 표시 방식을 전환합니다. 트리 보기에서는 폴더를 펼쳐 하위 폴더와 테마를 같은 목록에서 봅니다. 경로를 누르거나 뒤로·앞으로·상위 버튼으로 이동할 수 있습니다. 기본은 직접 테마만 표시하며 **하위 폴더 테마도 포함**을 켜면 선택한 폴더 아래의 테마를 함께 봅니다. 좁은 화면에서는 왼쪽 트리를 숨기며 폴더 사이드바 버튼으로 다시 열 수 있습니다.

폴더 관리에서 이름과 상위 폴더를 변경할 수 있습니다. 같은 상위 폴더 안에서는 이름이 중복될 수 없고, 자신이나 자신의 하위 폴더 안으로 이동할 수 없습니다. 폴더를 삭제하면 그 안의 직접 테마는 미분류로 옮기고 직접 하위 폴더는 한 단계 위로 올립니다. 테마와 미디어는 보존합니다.

테마 카드를 폴더 카드나 왼쪽 트리의 폴더로 드래그하면 분류가 이동합니다. 선택된 카드를 끌면 선택한 테마가 함께 이동하고, 선택되지 않은 카드는 해당 테마만 이동합니다. **선택하여 정리**에서 페이지를 넘겨 여러 테마를 고른 뒤 폴더로 이동하거나 즐겨찾기·태그 추가를 함께 처리할 수도 있습니다. 기존 태그·즐겨찾기·패키지·적용 상태는 보존합니다. 검색·태그·캐릭터·스킨·종류 필터를 조합할 수 있으며, 캐릭터·스킨·종류 선택기는 명시된 분류가 있는 경우 표시합니다. 폴더와 태그 선택기에도 검색과 페이지 이동이 있습니다.

목록은 24/48/96개 보기, 번호·처음·이전·다음·마지막 이동, 직접 페이지 입력을 지원합니다. 이름·즐겨찾기·폴더 순으로 정렬할 수 있습니다. 상세 화면에서 돌아오면 기존 검색·필터·페이지·스크롤 위치를 유지합니다.

한 줄 목록은 썸네일 관찰자와 미리보기용 테마 읽기 요청을 만들지 않습니다. 미리보기 카드는 화면에 보일 때 미리보기를 생성하며 최대 48개의 생성 결과를 메모리에 캐시합니다. 폴더 이동이나 보기 전환으로 원본 이미지·영상과 패키지를 삭제하거나 다시 인코딩하지 않습니다.

## English

CoSkin 0.1.6 uses a folder sidebar and mixed folder/theme contents. Create a path such as `NIKKE → Rapi → Base → Battle`. Folder home shows root folders and ungrouped themes. Click a folder card to select it; **double-click or Enter** opens its child folders and direct themes. Clicking a theme opens management. **All** shows every theme; **Ungrouped** shows unorganized themes.

Switch **Folder view/Tree view** separately from **Preview cards/One-line list**. Expanded tree branches contain both folders and theme leaves. Use breadcrumbs, back/forward/up and optional **Include subfolders**; direct themes are the default. The sidebar starts hidden on narrow screens and can be reopened. Folder and tag pickers are searchable and paged.

Drag a theme onto a folder card or sidebar folder to move its classification. Dragging a selected theme moves the selected set; dragging an unselected theme moves only that theme. Selection mode keeps selections across pages for moving themes, favorites and tags. Browse 24/48/96 items using numbered, first/previous/next/last or direct page navigation. Search, filters, sorting and list position survive a visit to details. Character, skin and type filters appear when explicit classification is available.

One-line lists create no preview observers or preview theme reads. Preview cards generate previews when visible and keep up to 48 generated results in memory. Folder moves and view changes preserve media, packages, favorites, tags, revisions and application bindings.

Deleting a folder keeps its themes ungrouped and promotes its immediate children to its parent. Media and theme revisions remain intact. Existing flat groups become root folders.

## 日本語

CoSkin 0.1.6では左のフォルダーツリーと右のフォルダー・テーマ一覧で探索できます。ホームには最上位フォルダーと未分類テーマを表示します。フォルダーはクリックで選択し、**ダブルクリックまたはEnter**で開くとサブフォルダーと直接テーマを表示します。テーマをクリックすると管理画面が開きます。

**フォルダー表示/ツリー表示**と**プレビューカード/一行一覧**を別々に切り替え、パス・戻る・進む・上へで移動します。標準は直接テーマのみで、**サブフォルダーを含む**を選ぶと配下のテーマも表示します。テーマをフォルダーへドラッグして分類を移動でき、選択済みテーマをドラッグすると選択全体を移動します。選択モードでも複数テーマの移動・お気に入り・タグを一括変更できます。一行一覧はプレビューを読み込まず、カードは画面に見える時に生成し最大48件をメモリーに保持します。

24/48/96件表示、ページ番号、先頭・末尾・指定ページへの移動を利用でき、詳細から戻っても検索・フィルター・一覧位置を保持します。フォルダー削除時は直接テーマを未分類へ移し、直接サブフォルダーを一段上へ移します。テーマとメディアを保持します。

## 简体中文

CoSkin 0.1.6通过左侧文件夹树和右侧文件夹、主题列表浏览。主页显示顶层文件夹和未分类主题。单击选择文件夹，**双击或Enter**打开并显示子文件夹和直接主题；单击主题打开管理界面。

**文件夹视图/树视图**与**预览卡片/单行列表**可分别切换，支持路径、后退、前进和上级。默认显示直接主题，启用**包含子文件夹**后也显示下级主题。将主题拖到文件夹可移动分类；拖动已选择主题会移动整个选中集合。选择模式支持跨页多选，批量移动主题或修改收藏和标签。单行列表不加载预览；卡片在进入可见区域时生成预览，内存中最多缓存48项。

可选择每页24/48/96项，通过页码、首页、末页或输入页码跳转。从详情返回时保留搜索、筛选和列表位置。删除文件夹时，直接主题移到未分类，直接子文件夹上移一级。主题和媒体保持不变。

## Storage contract

Personal organization stays in `library.json`, outside shared `.coskin` packages:

```json
{
  "organization": {
    "groups": { "nikke": "니케", "rapi": "라피" },
    "groupParents": { "rapi": "nikke" },
    "themes": {
      "personal.example": {
        "groupId": "rapi",
        "favorite": true,
        "tags": ["전투"]
      }
    }
  }
}
```

`groupParents` is optional for legacy libraries. Omitted parent entries denote roots. `group-write` accepts an optional `parentId`: omitting it preserves an existing parent; `null` moves a folder to the root. Writes reject missing parents, cycles and duplicate sibling names. The host supports 4,096 folders and up to 64 nesting levels, including descendants when moving a subtree. Names are limited to 64 characters; each theme retains the existing 24-tag limit and 48-character tag limit.

Deleting a folder promotes immediate children while preserving their IDs and labels. If promotion leaves two same-name folders, their paths in selection controls include a short ID to distinguish them; rename either folder to resolve the ambiguity. File locations, package hashes, revisions and application bindings are unaffected by organization changes.

`organization-batch` accepts `changes: [{id, metadata}, ...]` for 1–2,048 distinct themes. It validates all changes under the library gate before one atomic file replacement; a validation error leaves the whole library unchanged. A successful batch returns the updated summary. The bridge retains its 4MiB request limit, and the library file has a symmetric 16MiB read/write limit for large collections.
