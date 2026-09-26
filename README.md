# CoSkin

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

Codex를 나만의 공간으로 꾸미는 Windows 테마 라이브러리입니다. 이미지·GIF·효과를 선택하고 실제 화면에서 미리보기·편집·적용할 수 있습니다.

[Windows x64 다운로드](https://github.com/GNh0/CoSkin/releases/tag/v0.1.0) · [지원·검증 범위](docs/support-matrix.md)

## 설치와 실행

ZIP을 풀고 **CoSkin.Loader.exe**를 실행하세요. 실행 파일·renderer.js·THIRD-PARTY-NOTICES.txt 세 파일을 함께 유지해야 합니다. Node나 .NET을 따로 설치할 필요는 없습니다.

설치에서 Windows 로그인 시 시작, Codex 종료 시 함께 종료, 바탕화면 바로가기, .coskin 파일 연결, 자동 업데이트를 선택합니다. 테마와 Codex 데이터는 보존합니다.

**CoSkin → Codex, Codex → CoSkin 어느 순서로 실행해도 연결됩니다.** CoSkin이 먼저 켜지면 트레이에서 기다립니다. 이미 켜진 지원 Codex에는 재시작 없이 연결합니다. 바탕화면 **CoSkin**은 독립 실행, 시작 메뉴 **Codex + CoSkin**은 함께 실행입니다. Codex를 강제로 종료하지 않습니다.

현재 일반 실행 연결을 검증한 버전은 Windows 패키지 **26.924.2738.0**, 내부 앱 **26.924.22138**입니다. 연결 모듈은 실행 파일·OpenAI 서명·ASAR·chrome.dll을 확인합니다. 다른 버전은 검증 전 연결하지 않습니다. 두 앱의 Windows 권한 수준이 같아야 합니다. [실행 구조](docs/resident-architecture.md)

## 테마와 효과

- 왼쪽 아이콘 바의 **CoSkin**에서 카드 목록을 엽니다. 목록에서 만들기·가져오기·삭제·미리보기·바로 적용을 할 수 있습니다.
- 카드를 누르면 상세 페이지에서 미리보기·편집·복제·내보내기와 테마 정보 편집을 제공합니다.
- 실제 화면 편집 모드에서 대상에 우클릭하세요. 프로젝트·채팅 행은 기본적으로 해당 종류의 **모든 행**을 편집하며, 개별 지정 옵션으로 특정 행만 덮어쓸 수 있습니다.
- 전체 앱·프로젝트·채팅 적용 범위를 선택합니다. 저장과 적용은 별도이며, 미리보기 취소는 이전 적용을 유지합니다.
- PNG·JPEG·GIF를 지원합니다. 배경·장식·아이콘의 불투명도를 글자와 별도로 조절합니다. 기본·호버·선택 상태와 진입·종료·클릭·반복 효과를 편집합니다.
- [사용자 지정 효과](docs/custom-effects.md)는 JSON으로 선언한 키프레임을 등록·공유합니다. 렌더러는 JavaScript/TypeScript·CSS와 Web Animations API를 사용하며, 임의 JavaScript를 실행하는 효과 플러그인은 아닙니다.

목록은 채팅 영역과 분리된 전용 페이지입니다. 공통 배경은 Codex 앱 표면·탭·파일/브라우저 도구 화면의 앱 영역에 적용됩니다. 외부 웹사이트 내용과 Windows 대화상자는 별도 표면입니다.

## 트레이와 업데이트

트레이에서 목록·설정·테마 선택·꾸미기 켜기/끄기·다시 연결·종료를 제공합니다. 테마는 하위 메뉴로 묶고, 메뉴는 Codex 언어를 따릅니다. 로그인 시작과 함께 종료는 독립적인 선택입니다.

자동 업데이트를 켜면 **GitHub Releases의 상위 안정 버전**을 확인합니다. 게시자 서명·SHA-256·파일 구성을 검증하고, 편집·미리보기 중에는 교체를 미룹니다. 새 CoSkin이 준비되지 않으면 이전 설치를 복원합니다. Codex와 테마 데이터는 업데이트 대상이 아닙니다. 끄면 백그라운드 업데이트 확인을 하지 않으며 설정에서 수동 확인할 수 있습니다. [업데이트 배포 방법](docs/updates.md)

## 실제 화면

![0.1.0 테마 목록](docs/media/theme-library-0.1.0.png)

명조 파수인을 주제로 별도 생성한 비공식 팬아트 예제입니다. 기본 실행 ZIP에는 포함하지 않습니다. [미디어 출처](docs/media/wuthering-waves/ASSET-NOTES.md)

![테마 목록](docs/media/wuthering-waves/shorekeeper-theme-library.png)
![테마 상세](docs/media/wuthering-waves/shorekeeper-theme-detail.png)
![효과 편집](docs/media/wuthering-waves/shorekeeper-effect-editor.png)
![실제 배경 적용](docs/media/wuthering-waves/shorekeeper-live-applied.png)
![행 호버 효과](docs/media/wuthering-waves/shorekeeper-hover.gif)
![실제 GIF 배경](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

일부 예제 캡처는 첫 베타에서 제작했습니다. 화면 자료는 모든 환경의 프레임률을 보장하는 벤치마크가 아닙니다.

## 성능과 언어

UI는 Codex 언어를 우선 따르며 **한국어·영어·일본어·중국어 간체**를 제공합니다. 미지원 언어는 영어로 대체합니다.

고정 GIF 배경은 휠 스크롤 중에도 재생합니다. 스크롤 중 움직이는 왼쪽 행의 효과와 GIF는 잠시 쉬어 목록 반응을 우선합니다. 비표시·최소화·화면 밖에서는 움직임을 중지합니다. Windows의 움직임 줄이기를 따르거나 사용자 설정으로 허용/중지할 수 있습니다. 큰 GIF·여러 고해상도 배경의 비용은 남아 있습니다.

Node **47개**, .NET 호스트 **171개** 검사와 ESLint·TypeScript 검사를 통과했습니다. 실제 설치본 업데이트와 기존 Codex 자동 연결, 데이터 보존을 확인했습니다. 지원 조건과 아직 검증하지 않은 환경은 [검증 범위](docs/support-matrix.md)에 구분했습니다.

## 개발

Node 24, .NET 10, 네이티브 연결 모듈 빌드용 Visual Studio 2022 C++ x64 도구가 필요합니다.

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
./scripts/build.ps1 -Portable
dotnet run --project tests/CoSkin.HostTests
```

원본 Codex 파일·ASAR·기존 바로가기는 수정하지 않습니다. 개인 원시 로그·사용자 화면·저장소·게시자 개인키는 배포에 포함하지 않습니다.

[설계](docs/CoSkin-설계서.md) · [구조](docs/architecture.md) · [.coskin 계약](docs/coskin-package-v1.md)

## 라이선스

CoSkin 자체 소스 라이선스는 아직 미지정입니다. 외부 구성요소는 별도 라이선스를 따르며 [제3자 고지](THIRD-PARTY-NOTICES.txt)를 확인하세요. 예제 캐릭터 관련 권리는 해당 권리자에게 있습니다.
