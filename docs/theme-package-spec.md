# `.coskin` v1 형식과 테마 제작

이 문서는 **CoSkin 0.1.5 소스의 가져오기·검증 코드**를 기준으로 한 공유 테마 파일 사양과 제작 절차다. 새 테마를 AI에게 요청할 때는 이 문서와 [요청문](theme-request-template.md)을 함께 전달하면 된다. 정확한 검증 기준은 [패키지 검사](../src/CoSkin.Loader/Package.cs), [테마 계약](../src/core/engine.ts), [미디어 검사](../src/CoSkin.Loader/ImageProbe.cs)에 있다. 향후 버전에서 형식이 바뀌면 설치된 버전의 코드와 가져오기 결과를 우선한다.

## 가장 쉬운 제작 방법

1. CoSkin의 테마 목록에서 **테마 만들기**를 누른다.
2. 이름을 정하고 편집 모드에서 꾸밀 영역을 우클릭해 배경·글자·효과를 설정한다.
3. **저장** 후 실제 화면에서 **미리보기**와 **적용**을 확인한다.
4. 테마 상세 화면의 **내보내기**로 `.coskin` 파일을 받는다. CoSkin이 파일 목록·바이트 길이·SHA-256 해시를 생성한다.

코드나 AI로 직접 파일을 만들 때는 아래 형식을 사용한다. [기본 예제](examples/basic)와 [패키징 도구](../scripts/package-theme.py)를 그대로 실행해 시작할 수 있다. 패키징 도구는 ZIP 구조와 파일 해시를 만들지만, **최종 유효성 검사는 CoSkin에서 가져오기**로 해야 한다.

## ZIP 안의 파일

`.coskin`은 확장자가 다른 ZIP 파일이다. ZIP의 최상위에 다음 구조를 둔다.

```text
quiet-night.coskin
├── manifest.json             필수
├── theme.json                필수
├── assets/                   사용한 이미지·GIF·MP4만 선택적으로
│   └── background.png
└── preview/                  미리보기 파일을 쓸 때만
    └── cover.png
```

ZIP에 디렉터리 항목 자체를 넣지 않는다. 내부 경로는 소문자 영문·숫자·`_`·`.`·`-`·`/`만 허용하며 1~240자다. 루트의 두 JSON 외에는 `assets/` 또는 `preview/` 아래에 둔다. 절대 경로, 역슬래시, 빈 조각, `.`·`..`, 끝의 점, Windows 예약 파일명, 심볼릭 링크, 대소문자만 다른 중복 경로는 거절된다. 한글 이름은 **테마 표시 이름과 외부 `.coskin` 파일명**에 쓸 수 있지만 ZIP 내부 경로에는 쓰지 않는다.

## `manifest.json`

[기본 예제 manifest](examples/basic/manifest.json)는 패키징 전 `files: []`로 둔다. [패키징 도구](../scripts/package-theme.py)가 `theme.json`과 모든 자산의 실제 바이트 길이·SHA-256을 넣는다.

```json
{
  "format": "coskin.theme",
  "formatVersion": 1,
  "id": "org.example.quiet-night",
  "name": "Quiet Night",
  "version": "1.0.0",
  "author": { "name": "Example" },
  "engine": { "minVersion": "0.1.0" },
  "requirements": {
    "required": ["target:main.surface"],
    "optional": []
  },
  "entry": "theme.json",
  "defaultProfile": "default",
  "files": []
}
```

위 블록은 필드 설명을 위한 축약 예시다. 실제 패키지의 `requirements`에는 **모든 프로필에서 사용한 대상과 효과를 빠짐없이** 선언하고, `files`에는 `manifest.json`을 제외한 **모든 ZIP 파일을 정확히 한 번씩** 선언해야 한다. `files` 항목은 `{"path":"theme.json","bytes":123,"sha256":"..."}` 형식이며, 해시는 압축 전 파일 원본 바이트의 소문자 SHA-256이다. 바이트 길이와 해시는 직접 적지 말고 도구로 생성하는 것이 안전하다.

| 필드                                  | 규칙                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `format`, `formatVersion`, `entry`    | 각각 `coskin.theme`, 정수 `1`, `theme.json`                                                                            |
| `id`                                  | 소문자 영문·숫자·`.`·`_`·`-`로 된 1~128자. 다른 콘텐츠를 공유할 때는 새 ID 사용                                        |
| `name`, `author.name`                 | 비어 있지 않은 표시 문자열, 각 최대 256자                                                                              |
| `version`, `engine.minVersion`        | `major.minor.patch` 숫자 형식. `version`은 테마 버전, `minVersion`은 필요한 CoSkin 엔진 버전                           |
| `description`                         | 선택 사항, 비어 있지 않은 문자열 최대 4096자                                                                           |
| `requirements.required` / `.optional` | 사용한 `target:<id>`와 `effect:<id>@<version>`의 정확한 집합. 각 배열 최대 256개; 필수 기능이 미지원이면 가져오기 거절 |
| `defaultProfile`                      | `theme.json`에 실제로 존재하는 프로필 ID                                                                               |
| `preview`                             | 선택 사항. 포함했다면 `preview/` 아래 실제 파일 경로                                                                   |
| `files`                               | `manifest.json`을 제외한 모든 항목의 `path`, `bytes`, `sha256` 목록                                                    |

개인 PC의 프로젝트 경로·채팅 ID·즐겨찾기·그룹·태그는 공유 패키지에 넣지 않는다. 전체 앱/프로젝트/채팅 **적용 범위는 가져온 PC에서 선택**한다. 이미 같은 `id`와 같은 패키지 해시가 있으면 중복으로 처리하고, 같은 `id`의 다른 내용은 거절한다.

## `theme.json`

루트에는 비어 있지 않은 `profiles` 배열을 둔다. 프로필은 `id`, `name`, `rules`로 구성하며 `id`는 프로필 간 고유하다. 테마 전체의 `autoTextColor`(boolean), `fontFamily`(설치된 글꼴 이름), 선언형 `customEffects`는 선택 사항이다. 개인 항목을 가리키는 `item` 규칙은 공유 패키지에 넣지 않는다.

[기본 예제 theme](examples/basic/theme.json)는 본문과 왼쪽 목록을 색으로 꾸미고 프로젝트 행과 채팅 행을 서로 다르게 표시한다. 규칙 하나는 다음처럼 쓴다.

```json
{
  "id": "main",
  "target": "main.surface",
  "states": {
    "base": {
      "style": {
        "background": { "color": "#171b27", "opacity": 1 }
      }
    }
  }
}
```

규칙 ID는 프로필 안에서 고유해야 하며 같은 프로필에 동일 대상을 두 번 쓰지 않는다. 상태는 `base`, `selected`, `hover`, `selectedHover`, `focusVisible`, `pressed`, `disabled`를 지원한다. 스타일 레이어는 `background`, `decoration`, `border`, `icon`, `text`다. 예를 들어 `background`에는 `color`, `opacity`, `image`, `fit`, `position`, `blurPx`, `imagePlayback`을 넣을 수 있다. 색은 `#RRGGBB`, 불투명도는 `0`~`1`, 위치는 `{"x":0.5,"y":0.5}`처럼 두 축 모두 `0`~`1`이다. 이미지 참조는 패키지의 `assets/` 경로만 사용한다. `fit`은 `cover`·`contain`·`stretch`·`tile`, 재생은 `play`·`poster`다. `cover`는 영역을 채우며 가장자리를 자를 수 있고 `contain`은 원본 전체를 보여준다.

자주 쓰는 대상은 다음과 같다. [전체 대상 목록](../src/core/engine.ts)은 소스의 `TARGETS`가 기준이다.

| 대상                  | 꾸미는 영역             |
| --------------------- | ----------------------- |
| `app.background`      | 앱 공통 배경            |
| `navigation.bar`      | 왼쪽 아이콘 바          |
| `sidebar.surface`     | 프로젝트·채팅 목록 바탕 |
| `sidebar.project-row` | 프로젝트 행             |
| `sidebar.thread-row`  | 채팅 행                 |
| `main.surface`        | 본문 영역               |
| `message.surface`     | 대화 메시지 표면        |
| `summary.surface`     | 결과물·소스 패널        |
| `composer.surface`    | 입력창                  |

호버·클릭 효과는 `states.*.motion`으로 지정한다. 내장 효과 ID·레이어·매개변수의 정확한 목록은 [효과 레지스트리](../src/core/engine.ts)를, 직접 만드는 선언형 효과는 [사용자 지정 효과](custom-effects.md)를 참고한다. 임의 CSS 선택자나 JavaScript를 패키지에 넣을 수 없다.

## 이미지·영상과 제한

`assets/`와 `preview/`에는 PNG, JPEG (`.jpg`·`.jpeg`), GIF, MP4를 넣을 수 있다. 확장자와 실제 파일 바이트를 함께 검사한다. PNG는 정적 이미지여야 하며 APNG는 거절한다. MP4는 음소거로 재생되고, **H.264를 권장**한다. 실제 Windows Chromium에서 디코딩되는지 확인해야 하며 모든 코덱이 지원되는 것은 아니다. GIF·영상은 움직임 정책과 `imagePlayback`에 따라 정지 대표 프레임으로 표시될 수 있다.

| 항목                  |                                                      현재 한도 |
| --------------------- | -------------------------------------------------------------: |
| `.coskin` ZIP 전체    |                                                        100 MiB |
| 압축 해제한 파일 합계 |                                                        250 MiB |
| ZIP 파일 항목 수      |                                                          512개 |
| JSON 한 파일          |                                        2 MiB, 중첩 최대 32단계 |
| 미디어 한 파일        |                                                         25 MiB |
| PNG·GIF 이미지        |                       한 변 최대 16,384픽셀, 최대 3,200만 픽셀 |
| GIF                   | 최대 240프레임, 전체 프레임 픽셀 수와 반복·시간 제한 추가 적용 |
| MP4 재생 길이         |                                                     최대 600초 |

## 예제를 패키지로 만들기

저장소 루트에서 Python 3.9 이상으로 실행한다. 표준 라이브러리만 사용한다.

```powershell
New-Item -ItemType Directory -Force out | Out-Null
python scripts/package-theme.py docs/examples/basic out/quiet-night.coskin
```

도구는 `manifest.files`를 다시 계산하고 각 파일의 해시를 넣은 뒤, 파일명 순서와 고정 ZIP 시간을 사용해 새 패키지를 만든다. 기존 출력 파일은 덮어쓰지 않는다. 자신의 테마는 [기본 예제](examples/basic)를 복사해 `id`, 이름, 프로필, 규칙을 바꾸고 미디어가 필요하면 `assets/` 아래에 추가한다. 이미지 규칙을 쓰면 `theme.json`의 `image`를 `assets/...`로 지정한다.

완성 파일은 CoSkin의 **가져오기**로 등록한 다음 카드 **미리보기**와 **적용**에서 글자 가독성, 이미지 구도, 모서리, 영상 반복을 확인한다. `python -m zipfile -t`는 ZIP 손상만 검사하며 CoSkin의 테마 검증을 대신하지 않는다. 가져오기가 실패하면 테마 ID, `requirements`, 내부 경로, 파일 해시, 이미지 형식을 먼저 확인한다. 외부 원본 `.coskin`을 이동·삭제해도 이미 가져온 테마는 내부 저장소에 남는다.
