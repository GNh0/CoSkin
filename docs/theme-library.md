# 테마 목록과 폴더 관리 / Theme library

## 한국어

CoSkin 0.1.6부터 그룹을 폴더 트리로 관리할 수 있습니다. 예를 들어 `니케 → 라피 → 기본 → 전투`처럼 폴더 안에 하위 폴더를 만드세요. 폴더를 누르면 해당 테마가 표시되고 **하위 폴더 테마도 포함**으로 상위 폴더 아래의 테마도 함께 볼 수 있습니다. **전체**와 **미분류**로 전체 목록이나 아직 정리하지 않은 테마를 찾습니다.

폴더 관리에서 이름과 상위 폴더를 변경할 수 있습니다. 같은 상위 폴더 안에서는 이름이 중복될 수 없고, 자신이나 자신의 하위 폴더 안으로 이동할 수 없습니다. 폴더를 삭제하면 그 안의 직접 테마는 미분류로 옮기고 직접 하위 폴더는 한 단계 위로 올립니다. 테마와 미디어는 보존합니다.

**선택하여 정리**에서 페이지를 넘겨 여러 테마를 고른 뒤 폴더로 이동하거나 즐겨찾기·태그 추가를 함께 처리하세요. 기존 태그는 유지됩니다. 검색·태그·캐릭터·스킨·종류 필터를 조합할 수 있으며, 캐릭터·스킨·종류 선택기는 명시된 분류가 있는 경우 표시합니다. 폴더와 태그 선택기에도 검색과 페이지 이동이 있습니다.

목록은 24/48/96개 보기, 번호·처음·이전·다음·마지막 이동, 직접 페이지 입력을 지원합니다. 이름·즐겨찾기·폴더 순으로 정렬할 수 있습니다. 상세 화면에서 돌아오면 기존 검색·필터·페이지·스크롤 위치를 유지합니다.

## English

Groups are nested folders in CoSkin 0.1.6. Create a path such as `NIKKE → Rapi → Base → Battle`, expand or collapse it, then select a folder to browse its themes. **Include subfolders** also shows descendant themes; **All** and **Ungrouped** give broader views. Folder and tag pickers are searchable and paged.

Selection mode keeps selections across pages for moving themes, favorites and tags. Browse 24/48/96 items using numbered, first/previous/next/last or direct page navigation. Search, filters, sorting and list position survive a visit to details. Character, skin and type filters appear when explicit classification is available.

Deleting a folder keeps its themes ungrouped and promotes its immediate children to its parent. Media and theme revisions remain intact. Existing flat groups become root folders.

## 日本語

CoSkin 0.1.6ではグループを階層フォルダーとして管理できます。サブフォルダーを作成・移動し、展開・折り畳み・検索でテーマを探します。**サブフォルダーを含む**で配下のテーマも表示します。選択モードで複数テーマの移動・お気に入り・タグを一括変更できます。

24/48/96件表示、ページ番号、先頭・末尾・指定ページへの移動を利用でき、詳細から戻っても検索・フィルター・一覧位置を保持します。フォルダー削除時は直接テーマを未分類へ移し、直接サブフォルダーを一段上へ移します。テーマとメディアを保持します。

## 简体中文

CoSkin 0.1.6将分组作为嵌套文件夹管理。创建和移动子文件夹，通过展开、折叠和搜索查找主题。**包含子文件夹**也显示下级主题。选择模式支持跨页多选，批量移动主题或修改收藏和标签。

可选择每页24/48/96项，通过页码、首页、末页或输入页码跳转。从详情返回时保留搜索、筛选和列表位置。删除文件夹时，直接主题移到未分类，直接子文件夹上移一级。主题和媒体保持不变。

## Storage contract

Personal organization stays in `library.json`, outside shared `.coskin` packages:

```json
{
  "organization": {
    "groups": { "nikke": "니케", "rapi": "라피" },
    "groupParents": { "rapi": "nikke" },
    "themes": { "personal.example": { "groupId": "rapi", "favorite": true, "tags": ["전투"] } }
  }
}
```

`groupParents` is optional for legacy libraries. Omitted parent entries denote roots. `group-write` accepts an optional `parentId`: omitting it preserves an existing parent; `null` moves a folder to the root. Writes reject missing parents, cycles and duplicate sibling names. The host supports 4,096 folders and up to 64 nesting levels, including descendants when moving a subtree. Names are limited to 64 characters; each theme retains the existing 24-tag limit and 48-character tag limit.

Deleting a folder promotes immediate children while preserving their IDs and labels. If promotion leaves two same-name folders, their paths in selection controls include a short ID to distinguish them; rename either folder to resolve the ambiguity. File locations, package hashes, revisions and application bindings are unaffected by organization changes.

`organization-batch` accepts `changes: [{id, metadata}, ...]` for 1–2,048 distinct themes. It validates all changes under the library gate before one atomic file replacement; a validation error leaves the whole library unchanged. A successful batch returns the updated summary. The bridge retains its 4MiB request limit, and the library file has a symmetric 16MiB read/write limit for large collections.
