# 명조 공개 예제 제작 자료

CoSkin의 실제 검수용 Codex에서 제작한 README 예제다. 캐릭터 배경과 나비는 생성한 이미지이며, UI 캡처는 실제 동작 화면이다. 프로젝트·채팅 제목은 캡처 동안 예시 문구로 바꾸고 사용자 프로필은 숨겼다.

## 파수인 배경 시안

- 파일: `shorekeeper-fanart-wallpaper.png`
- 제작: 2026-09-26, 내장 `image_gen` 도구. 원본 파일은 보존했다.
- 분류: 명조 파수인을 주제로 새로 생성한 비공식 팬아트. 공식 원화·공식 배포 테마가 아니다.
- 용도: 실제 CoSkin 이미지 지정·호버 효과·테마 미리보기 문서 예시를 제작하기 위한 배경.
- 사용자 개인 업로드 이미지 또는 실제 채팅 내용은 포함하지 않는다.
- 캐릭터·작품 관련 권리는 해당 권리자에게 있다. CoSkin 소스의 라이선스를 이 자료에 자동 적용하지 않는다.
- 공식 참고: [명조 공식 사이트](https://wutheringwaves.kurogames.com/en/main/news/detail/1420), [2차 창작 안내](https://wutheringwaves.kurogames.com/p/en/produce.html). 이 링크를 소프트웨어 번들 재배포 허가의 근거로 표시하지 않는다.
- 게시 전: 실제 화면 캡처와 이미지의 출처 표시를 점검한다. 원본 캐릭터 이미지 파일을 실행 프로그램에 기본 탑재하는 작업은 별도 범위다.

생성 프롬프트:

> Use case: stylized-concept. Asset type: landscape wallpaper for a CoSkin desktop-app customization demonstration. Primary request: an original, polished fan illustration of The Shorekeeper (파수인), the adult female character from Wuthering Waves. Preserve her recognizable pale blue very long flowing hair, luminous blue eyes, delicate white-and-deep-navy elegant dress with translucent blue fabric and butterfly motifs, a graceful ethereal expression. Portrait from the waist upward, character placed in the rightmost third, looking slightly toward the left. She is standing beside a quiet midnight ocean with a few glowing blue butterflies. The left two thirds and central area must stay dark, calm, mostly empty deep midnight blue with soft atmosphere, so an actual desktop chat interface can remain legible on top. High quality anime illustration, fine clean linework, restrained luminous highlights, rich blue and silver palette, premium wallpaper composition, 16:10 landscape. No words, no logo, no watermark, no app interface, no border. This is a standalone illustrative wallpaper, not a mock screenshot. One character only, no extra person, tasteful fully clothed costume.

## 투명 나비 아이콘

- 파일: `blue-butterfly-icon.png`
- 제작: 같은 날 내장 `image_gen`, `transparent_background: true`.
- 배경과 어울리는 새 나비 장식이다. 공식 게임 아이콘의 추출본이 아니다.

## 실제 화면과 움직이는 배경

- `shorekeeper-live-applied.png`: 정지 배경과 나비 아이콘을 실제 Codex 시작 화면에 적용한 모습.
- `shorekeeper-theme-library.png`, `shorekeeper-theme-detail.png`: 앱 내부 목록·상세 화면. 카드 안의 축소 장면은 제품이 생성하는 테마 미리보기다.
- `shorekeeper-effect-editor.png`: 실제 효과 편집 패널.
- `shorekeeper-hover.gif`: 실제 프로젝트 행의 호버 효과를 캡처했다.
- `shorekeeper-animated-wallpaper.gif`: 위 생성 배경과 나비를 FFmpeg로 합성한 960×600, 24프레임, 약 3초 반복 배경 자산.
- `shorekeeper-live-gif.gif`: 해당 GIF를 실제 Codex 배경으로 적용한 약 9초 화면 캡처. 캡처 시간 간격을 보존했으며 원래 재생 프레임률을 모두 기록한 영상이나 성능 벤치마크는 아니다.
- 첫 베타에서 GIF 배경을 사용하며 채팅을 스크롤하면 정지·버벅임이 발생할 수 있다. 이 예제를 부드러운 스크롤이나 성능 개선의 증거로 사용하지 않는다.
- 실행 ZIP에는 이 팬아트와 예시 테마가 기본 포함되지 않는다. 소스 저장소의 문서용 미디어다.

생성 프롬프트:

> Use case: stylized-concept. Asset type: transparent PNG icon for a CoSkin desktop theme based on the blue butterfly motif associated with The Shorekeeper in Wuthering Waves. One delicate, symmetric luminous ice-blue butterfly, front view with spread wings, centered, four readable translucent faceted wings, a fine silver-white outline and simple elegant cyan interior facets. Refined anime fantasy ornament, legible at 24 to 48 pixels. Tight square composition with modest transparent padding. Genuine transparent background, no floor, no rectangular backdrop, no text, no logo, no watermark, no cast shadow. Restrained glow only inside the clean butterfly silhouette, no haze outside it.
