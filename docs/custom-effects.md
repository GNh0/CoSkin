# 사용자 지정 효과 개발

CoSkin 효과는 TypeScript 계약과 렌더러의 Web Animations API로 실행합니다. 개발자가 작성하는 파일은 JavaScript가 아니라 `*.coskin-effect.json` 선언 JSON입니다. CSS 키프레임의 위치와 수치 개념을 사용하지만 CSS 문자열, 선택자, URL, 네트워크 요청, JavaScript 실행을 허용하지 않습니다.

예제는 [soft-rise.coskin-effect.json](examples/soft-rise.coskin-effect.json)입니다. `format: coskin.effect`, `formatVersion: 1`, `definition`을 사용합니다. 정의의 `id`는 `custom.`으로 시작하며 소문자·숫자·점·하이픈으로 구성합니다. `version`은 1, 이름은 80자 이하, 설명은 512자 이하입니다.

효과 탭의 **내 효과 → 효과 가져오기**에서 등록합니다. 같은 ID 또는 이름이 있으면 다른 이름으로 보관하거나 기존 항목을 명시적으로 교체합니다. 카드에서 선택하면 정의가 테마에 복사됩니다. 내 효과에서 삭제하거나 교체해도 기존 테마의 복사본은 유지됩니다. `.coskin` 내보내기에는 `theme.json`의 `customEffects` 정의가 포함됩니다. 다른 PC의 내 효과 목록에 자동으로 등록하는 것은 아닙니다.

## 계약과 예산

`layers`는 background, decoration, border, icon, text 중 중복 없는 목록입니다. `frames`는 2~16개이며 `offset`은 0부터 1까지 엄격한 오름차순이어야 합니다. 첫 위치는 0, 마지막은 1입니다. 모든 프레임은 같은 속성 집합을 사용합니다.

| 수치 속성                                    | 허용 범위  | 의미                                      |
| -------------------------------------------- | ---------- | ----------------------------------------- |
| opacity                                      | 0~1        | 현재 레이어의 정적 불투명도에 곱하는 비율 |
| translateXPx, translateYPx                   | -1000~1000 | 픽셀 이동                                 |
| scale                                        | 0.1~3      | 배율                                      |
| rotateDeg                                    | -360~360   | 각도                                      |
| blurPx                                       | 0~20       | 기존 정적 필터에 추가하는 흐림            |
| insetTop, insetRight, insetBottom, insetLeft | 0~100      | 각 방향의 잘라낼 백분율                   |

정의는 하나당 UTF-8 8KiB 이하, 테마 및 내 효과 목록당 32개/총 64KiB 이하입니다. 가져오기 파일 자체도 64KiB 이하입니다. 사용자 지정 효과는 실행 5초 이하, 반복 1~3회이며 무한 반복을 허용하지 않습니다. 비유한 수치, 임의 속성 및 지원하지 않는 버전은 거절합니다. 반전은 프레임 순서를 뒤집고 offset을 `1-offset`으로 정규화합니다.

`src/core/custom-effects.ts`가 수치 검증과 컴파일의 단일 근거입니다. 호스트는 JSON 중복 키·바이트 크기를 먼저 검사하고 등록·저장·패키지 가져오기에 동일한 렌더러 계약 검증을 호출합니다. C#에 별도 의미의 효과 규칙을 중복 작성하지 않습니다. 등록 전에 단일 정의와 전체 저장소 예산 모두 검증하며 실패한 정의는 저장하지 않습니다.

JSON 문법 오류는 행과 UTF-8 바이트 위치를 표시합니다. 알 수 없는 필수 효과에는 호환 오류를 표시합니다. 설정 파일에 실행 코드를 넣어 확장할 수 없습니다.

개발 검사: `npm run typecheck`, `npm run lint`, `npm test`, `dotnet run --project tests/CoSkin.HostTests`. 실제 네이티브 등록·미리보기·왕복 화면 검수는 별도이며 자동 검사만으로 화면 완성을 주장하지 않습니다.
