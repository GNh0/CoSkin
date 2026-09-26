# GitHub Releases 업데이트

CoSkin 0.1.0은 설치된 기본 저장소에서 GitHub의 상위 **안정 버전**을 확인한다. 자동 업데이트는 선택 사항이다. 끄면 백그라운드 확인/다운로드를 하지 않으며, CoSkin 설정의 수동 확인은 사용할 수 있다. 별도 검수 저장소와 설치 기록이 없는 실행본에서는 자동 교체를 제공하지 않는다.

## 사용자 동작

- 자동 확인은 12시간 간격과 ETag를 사용한다. 실패 시 5~120분 범위로 재시도 간격을 늘린다.
- 편집·미리보기·미저장 실행 설정이 있으면 교체를 미룬다. 연결된 모든 창에 업데이트 잠금을 요청하고 새 창이 생겼는지도 확인한다.
- 다운로드 전후에 자동 업데이트 선호를 다시 읽는다. 수동 설치는 사용자의 명시적 동작으로 처리한다.
- 별도 작업자가 원래 CoSkin의 협조 종료를 기다린다. 새 설치의 실제 PID·제품 버전·단일 인스턴스 응답을 확인해야 성공으로 처리한다.
- 준비 실패 시 이전 설치와 등록 상태를 복원하고 이전 CoSkin을 다시 시작한다. Codex를 강제 종료하거나 테마·리비전·자산을 교체하지 않는다.

최종 실제 설치본 교체는 확인했다. 모든 실제 Windows 복구 실패 조건은 재현하지 않았으며, 복구 분기의 자동 검사는 대체 설치 플랫폼/호스트 수명으로 실행한다.

## 공개 파일과 신뢰

확인 주소는 고정된 https://github.com/GNh0/CoSkin/releases/latest/download/coskin-update.json 이다. prerelease는 자동 업데이트 채널에 사용하지 않는다. 릴리스에는 다음 세 자산을 올린다.

| GitHub 자산 | 내용 |
| --- | --- |
| coskin-win-x64.zip | CoSkin.Loader.exe, renderer.js, THIRD-PARTY-NOTICES.txt만 포함 |
| coskin-win-x64.zip.sha256 | 다운로드 확인용 SHA-256 |
| coskin-update.json | 버전·정확한 ZIP URL·길이·해시·게시자 서명 |

manifest는 8KiB, ZIP은 200MiB 이하다. HTTPS·443·지정 다운로드 호스트·최대 4회 리디렉션을 확인한다. 길이와 SHA-256을 스트림으로 확인하고, ZIP 경로·항목 수·타입·압축 비율·CRC를 검사한다. 압축 해제한 실행 파일 제품 버전도 manifest와 일치해야 한다.

게시자 서명은 ECDSA P-256 / SHA-256 / 64바이트 IEEE P1363 형식이다. 실행 파일에 공개 SPKI를 포함한다. 서명 대상은 UTF-8, LF 줄바꿈, 마지막 줄바꿈까지 다음 형식이다.

```text
coskin-update-v1
VERSION
https://github.com/GNh0/CoSkin/releases/download/vVERSION/coskin-win-x64.zip
BYTES
LOWERCASE_SHA256
```

이 서명은 **업데이트 manifest의 신뢰 검증**이다. Windows Authenticode 코드 서명과 같다고 안내하지 않는다.

## 게시자 작업

게시자 키는 현재 Windows 사용자 CNG 저장소의 CoSkin.GitHubReleasePublisher.v1에 생성하며 내보내기를 허용하지 않는다. 저장소에는 assets/update-publisher.spki 공개키만 둔다. 기존 공개키와 현재 사용자의 키가 다르면 도구가 중지한다. 다른 PC에서 임의 새 키로 기존 공개키를 바꾸지 않는다.

현재 키가 준비된 게시자 PC에서 버전을 변경하고 검사·빌드한 뒤, 새 비어 있는 배포 경로를 사용한다.

```powershell
npm test
npm run lint
npm run typecheck
./scripts/build.ps1 -Portable
dotnet run --project tests/CoSkin.HostTests
python scripts/package-release.py dist/windows RELEASE-DIRECTORY/coskin-win-x64.zip
dotnet run --project scripts/CoSkin.Publisher -- sign VERSION RELEASE-DIRECTORY/coskin-win-x64.zip RELEASE-DIRECTORY/coskin-update.json assets/update-publisher.spki
```

VERSION과 RELEASE-DIRECTORY는 해당 배포 값으로 바꾼다. 설치된 버전보다 큰 안정 SemVer여야 하며 실행 파일과 manifest 버전이 같아야 한다. 서명 도구는 ZIP의 세 파일과 버전·길이·해시를 확인하고 기존 manifest를 덮어쓰지 않는다. 새 저장소의 최초 게시자 준비에만 initialize PUBLIC-SPKI를 사용한다.

GitHub에는 검증한 커밋과 일치하는 vVERSION 태그, 세 자산, 네 언어 릴리스 안내를 게시한다. 게시 후 latest manifest와 실제 다운로드 해시를 다시 확인한다. 기존 공개 릴리스 자산을 덮어쓰지 않는다.

현재 방식은 게시자 PC에서 서명하는 수동 배포다. CI에 개인키를 복사하는 작업을 구성하지 않았다. PC/계정 키를 잃으면 같은 공개키에 대한 서명을 만들 수 없으며, 키 회전은 새 신뢰키를 포함한 별도 검증 빌드와 전환 절차가 필요하다. 새 키로 서명한 manifest만 올려 기존 설치본이 받아들이게 만들 수 없다.