# CoSkin

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

Codex 왼쪽 아이콘 바의 **CoSkin**에서 테마스킨 목록을 열고 선택·미리보기·편집·적용하는 Windows 확장입니다.

**0.1.0-beta.1 테스트 배포**입니다. 비공식 확장이며 지원 버전과 알려진 제한을 확인해 주세요. 정식 제품 완료를 의미하지 않습니다.

[Windows x64 다운로드](https://github.com/GNh0/CoSkin/releases/tag/v0.1.0-beta.1) · [배포 안내](docs/release-0.1.0-beta.1.md)

## 설치·실행

Windows x64용 ZIP을 폴더에 풀고 `CoSkin.Loader.exe`를 더블클릭하면 사용자 범위 설치창이 열립니다. 파일 3개를 함께 유지하세요. Node나 .NET을 따로 설치할 필요는 없습니다. 설치 후 시작 메뉴의 **Codex + CoSkin**으로 실행합니다. 원래 Codex가 실행 중이면 작업을 저장하고 직접 정상 종료한 뒤 전용 바로가기를 사용해 주세요. CoSkin은 원본 앱을 강제 종료하지 않습니다.

현재 베타는 검증된 전용 바로가기 실행 방식을 사용합니다. 원본 Codex를 일반 바로가기로 실행한 상태에 자동 연결하거나 Windows 로그인 시 CoSkin을 자동 시작하는 기능은 아직 지원하지 않습니다.

설치·설정에서 함께 실행과 마지막 대상 종료 시 함께 종료를 각각 선택합니다. 시스템 트레이에서 테마 선택·적용, 꾸미기 켜기/끄기, 목록·설정 열기와 종료를 제공합니다. Windows 앱 목록에서 제거하며 테마·자산은 보존합니다. 실행 중 제거의 배포 파일 잔여 정리는 추가 검수 중입니다.

## 알려진 제한

- **큰 GIF 배경을 사용하는 채팅에서 스크롤 시 GIF가 멈추거나 버벅일 수 있습니다.** 첫 테스트 배포 후 개선할 항목입니다. 기본 제공 테마는 정지 배경입니다.
- 지원 검수 기준은 Codex Windows 패키지 **26.924.1866.0**, 내부 앱 **26.924.20706**입니다. 다른 버전은 연결을 중지할 수 있습니다.
- CoSkin 자동 업데이트 설정은 있으나 공개 서명 키/릴리스 및 실제 자동 교체가 아직 준비되지 않았습니다. 현재는 새 배포를 수동으로 설치합니다.
- 다중 창 수명, 새 Windows 사용자 설치, 모든 효과 조합과 최대 패키지 메모리는 검수 범위를 확장 중입니다.

## 실제 적용 예제

별도로 생성한 명조 파수인 비공식 팬아트 예제입니다. 기본 배포 테마가 아니며 개인 채팅·사용자 업로드를 포함하지 않습니다. [미디어 출처·생성 표시](docs/media/wuthering-waves/ASSET-NOTES.md)를 확인하세요.

![테마스킨 목록](docs/media/wuthering-waves/shorekeeper-theme-library.png)
![명조 파수인 테마 실제 적용](docs/media/wuthering-waves/shorekeeper-live-applied.png)
![테마 상세](docs/media/wuthering-waves/shorekeeper-theme-detail.png)
![효과 편집](docs/media/wuthering-waves/shorekeeper-effect-editor.png)
![행 호버 효과](docs/media/wuthering-waves/shorekeeper-hover.gif)
![실제 앱의 GIF 배경](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

움직이는 배경 예시는 실제 앱의 샘플 캡처입니다. 부드러운 재생 성능을 보장하는 자료가 아니며 위 GIF 스크롤 제한을 확인하세요.

## 사용 흐름

목록 카드에서 바로 미리보기·적용·삭제하거나 카드 본문을 눌러 상세 페이지를 엽니다. 상세에서 편집을 누르면 실제 Codex 화면으로 돌아가고, 편집 모드에서만 대상 우클릭을 CoSkin 설정으로 바꿉니다. 종료하면 원래 메뉴를 복원합니다. 저장과 적용은 별도 작업이며, 미리보기 취소는 이전 적용을 유지합니다.

PNG·JPEG·움직이는 GIF를 지원하며 이미지 불투명도는 원래 글자·입력 기능과 분리합니다. 움직임 줄이기와 숨김·최소화·화면 밖 상태에서는 움직임을 중지합니다. `.coskin`은 가져오기·내보내기 형식입니다. 가져온 테마와 자산은 내부 목록에 저장하여 외부 원본이 없어져도 적용할 수 있습니다.

## 구현·검증 범위

검수 복사본에서 rail 오른쪽 전체 전용 페이지, 반응형 카드·상세, 목록 핵심 동작, 실제 화면 편집과 원래 메뉴 복원, PNG/JPEG/GIF 디코딩·독립 불투명도·GIF 원본 반복, 최소화·화면 밖 정지/복귀를 확인했습니다. 실제 이미지·패키지의 조각 전송과 내부 적용도 확인했습니다. 사용자 효과 등록·재생·왕복, 테마 정보 편집과 연속 호버 전환도 확인했습니다. 최종 시각 승인, 다중 창 가시성, 모든 효과 계열, 최대 패키지 메모리, 일반 실행·설치·파일 연결은 남아 있습니다. [구현 상태](docs/support-matrix.md)를 기준으로 확인하세요.

UI는 Codex의 앱 언어를 우선 따릅니다. 한국어·영어·일본어·중국어 간체의 UI·접근성·오류 사전을 제공하며 중국어 지역값은 간체, 그 밖의 미지원 언어는 영어로 대체합니다. 문서 lang 변경에 따른 목록·상세·편집 전환과 넘침을 검사했습니다. 실제 계정의 앱 언어 설정별 모든 대상 탐지와 오류 흐름을 검증한 것은 아닙니다.

## 개발

Node 24 LTS와 .NET 10 LTS SDK가 필요합니다. 최종 사용자용 호스트는 Node 없이 실행하도록 설계합니다. 의존성은 잠금파일과 정확 버전으로 고정합니다.

```powershell
npm ci --ignore-scripts
npm test
node scripts/bundle.mjs
dotnet build src/CoSkin.Loader/CoSkin.Loader.csproj
dotnet run --project tests/CoSkin.HostTests/CoSkin.HostTests.csproj
```

실행 정책을 완화하지 마세요. 스크립트 실행이 허용되지 않는 환경은 위 직접 명령을 사용합니다. 원본 Codex 실행 파일·ASAR·무결성 설정을 변경하지 않습니다.

- [제품·기술 설계](docs/CoSkin-설계서.md)
- [.coskin 계약](docs/coskin-package-v1.md)
- [구조와 변경 방법](docs/architecture.md)

개인 환경의 원시 실험 로그·스크린샷은 공개 배포에 포함하지 않습니다. 온라인 갤러리와 고급 키프레임은 후속 범위입니다.


[사용자 지정 효과 개발](docs/custom-effects.md) · 등록·재생·패키지 왕복, 테마 정보 편집과 연속 호버 전환은 실제 검수 복사본에서 확인했습니다. 모든 효과 조합의 완료를 뜻하지 않습니다.

## 라이선스

CoSkin 자체 소스 라이선스는 아직 미지정이며 권리 부여 범위는 결정 전입니다. 포함된 외부 구성요소는 별도 라이선스를 따릅니다. [제3자 고지](THIRD-PARTY-NOTICES.txt)에는 gifuct-js, parser와 포함된 .NET 런타임의 라이선스·고지 전문이 있습니다. 예제 팬아트는 공식 캐릭터 이미지 배포물이 아닌 별도 생성 미디어입니다.
