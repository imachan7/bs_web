// サーバー／クライアント共有のルール判定層。
//
// ここに置く関数は「盤面（Board）とカードマスタだけで答えが決まる純粋な述語」に限る。
// サーバー（GameState）とクライアント（GameView）の双方から同じ実装を呼ぶことで、
// 二重実装によるロジックのズレ（型エラーにならず実対戦でしか露見しない）を根絶する。
//
// 制約: node:fs 等の node 組み込みモジュールを import しないこと（esbuild でクライアントへバンドルするため）。
// カードマスタは shared/cardDb.ts の注入経由で参照する。
// 中身は shared/rules/ の下に概念ごとに分けてある（2026-09-26）。import 側を変えずに済むよう、ここから再輸出する

export * from "./rules/level"
export * from "./rules/symbols"
export * from "./rules/keywordState"
export * from "./rules/resistance"
export * from "./rules/bp"
export * from "./rules/targetFilter"
export * from "./rules/constraints"
export * from "./rules/activation"
