# HAYSTACK 건초더미에서 바늘 찾기

기획서를 바탕으로 만든 1인칭 3D 웹 게임입니다. 건초더미를 한 번에 한 가닥씩 치우고 숨겨진 바늘을 조준해 `E`로 주우면 클리어합니다.

## 지금 바로 실행

Windows에서는 `PLAY_HAYSTACK.cmd`를 더블클릭하세요. `HAYSTACK-play.html`을 직접 더블클릭해도 됩니다. 설치 없이 기본 브라우저에서 열립니다.

브라우저의 파일 열기 보안 정책에 따라 저장이 제한될 수 있습니다. 안정적인 자동 저장을 원하면 아래 개발 서버 또는 GitHub Pages 주소에서 실행하세요.

## 개발 서버로 실행

Node.js 22 이상과 pnpm 11이 필요합니다. PowerShell에서 프로젝트 폴더를 열고 실행하세요.

```powershell
npm install -g pnpm@11.25.0
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:5173/`을 여세요. 배포용 파일은 `pnpm build`로 `dist/`에 생성됩니다.

단일 파일을 새로 만들려면 `pnpm build` 다음 `pnpm standalone`을 실행하세요.

## GitHub Pages에 올리기

1. 이 폴더의 소스를 GitHub 저장소의 `main` 브랜치에 올립니다. `node_modules/`와 `dist/`는 `.gitignore`로 제외됩니다.
2. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. `.github/workflows/pages.yml`이 `main` 푸시마다 빌드해 Pages에 배포합니다.
4. 배포가 끝나면 [https://eomtaejun.github.io/haystack/](https://eomtaejun.github.io/haystack/)에서 플레이할 수 있습니다.

Vite의 `base: './'` 설정으로 저장소 이름이 무엇이든 하위 경로의 JS·CSS 파일을 올바르게 불러옵니다. 게임 진행 기록은 접속한 주소별 브라우저 `localStorage`에 저장되므로 로컬 실행 기록이 GitHub Pages에 자동으로 옮겨지지는 않습니다.

## 조작

| 키 | 동작 |
| --- | --- |
| WASD | 이동 |
| 마우스 | 시점 회전 |
| Shift / Ctrl 또는 C / Space | 달리기 / 앉기 / 점프 |
| 좌클릭 | 클릭당 건초 한 가닥 제거 |
| E | 바늘 줍기 |
| F | 조사 |
| Esc | 일시정지 |

브라우저에서 마우스 잠금을 허용하지 않으면 왼쪽 드래그로 시점을 움직일 수 있습니다. 진행 상태는 브라우저의 `localStorage`에 자동 저장됩니다.

## 구현 범위

- 이전 버전보다 가로·세로·높이를 약 3배 키운 건초더미. 클릭 한 번에 실제 가닥 하나가 사라지고 제거 수가 1 증가합니다.
- 불규칙한 외곽과 여러 봉우리, 작은 건초 뭉치와 촘촘한 3D 가닥. 같은 지점을 계속 파면 아래층 건초가 드러나며 깊게 파고들 수 있습니다.
- 동적 표면 메시와 새로 드러나는 내부 건초 층, 구역별 깊이를 저장하는 자동 저장
- 난수 시드에 따른 바늘 위치와 노출, 직접 줍는 클리어 조건
- 1인칭 이동, 농장 환경과 절차적 소품 모델, 상황별 안내, 합성 효과음, 자동 저장

현재 그래픽은 직접 만든 절차적 스타일입니다. 외부에서 제작한 고해상도 3D 에셋이나 정교한 물리 효과, 배경음악은 포함하지 않았습니다. 기존 `v3` 저장 기록의 건초 제거 진행도와 바늘 위치는 유지되며, 이전에 얻은 잡템 데이터는 사용하지 않습니다.
