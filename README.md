# PDF Hidden Text Remover

PDF 안에서 사람에게는 보이지 않는 AI와 텍스트 추출기만 읽을 수 있는 문장을 찾아 제거합니다.

기능은 Rust로 구현되며 웹 페이지에서는 WASM 빌드를 활용합니다.

## 감지하는 항목

- 배경과 글자색의 대비가 매우 낮은 텍스트
- 지나치게 작은 글자
- 투명도가 낮거나 표시되지 않는 렌더링 모드
- 페이지의 보이는 영역 밖에 배치된 텍스트

## 파일 구조
 - **apps/web**: React + Vite와 WASM 빌드를 이용한 웹 페이지. GitHub Pages로 배포됩니다.
 - **crates**
   - **pdf-hidden-text-remover-core**: Rust로 구현된 기능입니다.
   - **pdf-hidden-text-remover-wasm**: WASM 바인딩.