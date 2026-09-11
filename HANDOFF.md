# 引き継ぎ

**この文書は「次のセッションが知らないと困ること」だけを書く。目安は80行で、超えたら削る。**
**ただし削ると必要な情報（手順書へのポインタなど）が落ちるなら、超過してよい**（2026-09-08 ユーザー指示）。
2026-09-08 に80行へ収めようとして、BS12_PLAN §1/§5〜§8 と COST_MODEL §8 への参照を落とした。
**行数はポインタを削る理由にならない。** 削ってよいのは「何をやったか」の記録（`git log` で足りる）だけ。
**ただし §1 の「進行中バッチの設計」は一時的に超えてよい**（バッチ完了時に手順書へ移して消すため）。

| 書くもの | 書かないもの（＝どこにあるか） |
| :-- | :-- |
| 未決の論点、合意待ちの変更、まだ文書化していない罠 | 何をやったか → `git log` |
| 進行中の作業の**次の一手**（1行＋リンク） | なぜそう決めたか → `docs/design/` の手順書 |
| 確定したがまだ手順書に移していないスキーマ | 検証コマンド・手順書の地図 → `CLAUDE.md` |

**書くのは設計を確定した時点で、実装より先にコミットする**（詳細は CLAUDE.md）。実装が終わったら手順書へ移して消す。

**手順書へ1行として移したら、ここからは消す。** 二重に持つと必ず片方が古くなる
（2026-08-27 に、この文書が10日ぶんの実装とズレて「本線」を間違って指していた事故があった）。

---

## 1. いまの本線と次の一手

**BS13「星座編 第四弾：星空の王者」97枚は全枚数投入済み（2026-09-10。青バッチ＝smoke part306 / part307）。**
確定した解釈32件・全バッチの器・完了時の知見は [BS13_PLAN.md](./docs/design/BS13_PLAN.md)
（§1 と §12.3 が解釈、§6〜§12 が各色の器、§12.4 が「設計時に新規と見積もった器のうち3つは既存で足りた」）。

**次の本線はバースト（下のブロック）。** その後 BS14。§2 の3件は保留のまま（いつでも着手できる）。

### 進行中：バースト（2026-09-11 着手）

**確定した解釈（ユーザー確認済み）** — 詳細は [BURST.md](./docs/design/BURST.md)

| 論点 | 結論 |
| :-- | :-- |
| 発動後の行き先 | バーストエリアに**残らない**。スピリットは効果文「このスピリットカードを召喚する」で場へ、マジックはトラッシュへ |
| 空打ち | **不可**（2026年度改定で「条件を満たしたときのみ宣言可」） |
| 【相手の『召喚時』発揮後】 | **厳密**。相手のスピリット/ブレイヴの『召喚時』効果が実際に解決したときだけ発火 |
| バースト効果を持たないカードのセット | **拒否**（公式は敗北。SPEC の簡略化一覧へ記録する） |
| 同時発動 | **防御側優先**を最初から実装する |
| 『自分のバースト発動後』 | **発動開始時点で場にいた発生源だけ**に発火（自身のバーストで召喚された直後のスピリットには発火しない） |

**確定スキーマ（実装はこの形で固定。勝手に変えない）**

- `EffectDef` に1件追加:
  `{ id, kind:"burst", event: FieldEvent, subjectSide?: "own"|"opponent", action: EffectAction, thenPay?: "main"|"flash" }`
  `thenPay` が「その後コストを支払うことで、このカードのメイン/フラッシュ効果を発揮する」（SD06-013〜017 の共通形）
- `FieldEvent` に3件追加:
  `opponentSummonEffectResolved` / `ownBurstSet` / `ownBurstActivated`（eventInfo.cost＝発動したカードのコスト）
- `EffectAction` に2件追加: `{ type:"summonBurstCardFree" }`（バースト元のカード自身をコスト無しで召喚）、
  `{ type:"setBurstFromHand" }`（ターン1回制限を受けないセット。SD06-009）
- コストは既存の per-action 方式に合わせる: `refreshSelf` と `bpBuff` に `costDiscardOwnBurst?: true`
- `TargetFilter` に `hasBurst?: true`（バースト効果を持つカードに限定。SD06-014）
- 「自分のバーストをセットしている間」の条件軸: `AuraCondition` に `"hasOwnBurstSet"`、
  `triggered.condition` に `{ ownBurstSet: true }`、`ConstraintDef` / `GlobalConstraintDef` は
  `whileOwnBurstSet?: true`（`whileCombined` と同じゲート形式。実装時に変更・2026-09-11）
- `PlayerState`: `burst: string|null` / `burstSetThisTurn: boolean`
- `PlayerView`: `burst: string|null`（**自分のみ。相手は必ず null**）/ `burstSet: boolean`
- `GameAction`: `{ type:"setBurst"; handIndex: number }`

**⚠️ マジックバーストは `resolveMagic` を経由させない**（`magicUsedThisTurn` と `ownMagicUsed`/`opponentMagicUsed` が誤発火する）。

**⚠️ 相手のバーストが `viewFor` で漏れないテストを最優先で書く。**

**段1〜5（エンジン基盤）と段7（UI）は実装済み・typecheck / smoke 全緑（b2cedb5）。**
残りは `scripts/smoke/part308.ts`（バーストの smoke。未着手）と段6＝SD06 17枚投入。
`validate:cards` は `summonBurstCardFree` / `setBurstFromHand` が未使用で2件落ちるが、
これは SD06 のデータが入れば解消する（段6 まで落ちたままでよい）。

**段取り**: 段1〜5＝エンジン（合成カードで検証）→ 段6＝SD06 17枚投入 → 段7＝クライアント → その後 BS14（121種）。

### 済んでいること（参照先を消さないこと）

BS10（121枚）・BS11（91枚）・BS12（91枚）・BS13（97枚）は全枚数投入済み。
**BS12 で確定した解釈18件と全バッチの器は [BS12_PLAN.md](./docs/design/BS12_PLAN.md) §1 と §5〜§8。**
**「支払った」の判定規則は [COST_MODEL.md](./docs/design/COST_MODEL.md) §8**（smoke part295 / part296）。
ブレイヴの段階1〜7は完了済み（[BRAVE.md](./docs/design/BRAVE.md) §9、確定した規則は §12.5.1〜§12.5.5）。
**宣言そのものに追加コストが要る効果の作り方は [INTERRUPTION_POINTS.md](./docs/design/INTERRUPTION_POINTS.md) パターンE**。

**未実装の節は全弾でゼロ**（BS02-063 は禁止カードのため対象外）で、`card-notes.json` の
`simplified` も0件（残るは BS02-063 の `partial` 1件だけ＝実装しない方針）。
残課題は [REMAINING_WORK.md](./docs/design/REMAINING_WORK.md)（検証の穴80件＋計測点の無い kind 10種）。

---

## 2. 未決（答えが出たら手順書へ1行移して、ここから消す）

**バトスピ Wiki「わかりづらいルール」との突き合わせで、実装と食い違う疑いが複数出た**（2026-09-08）。
一覧と優先順は [RULES_BATSPI_WIKI.md](./docs/design/RULES_BATSPI_WIKI.md)。**BS13 が終わったので3件とも着手できる:**

| 論点 | ぶつかる先 |
| :-- | :-- |
| ~~疲労状態での召喚／破壊時のコア移動／効果で手札が増える~~ | **2026-09-09 にユーザー確認済み**（BS13_PLAN §1 #24〜#26） |
| **「ターンに1回」がコスト不発でも消費される**（`triggered` / `fieldEvent` 共通。マッチ時点で `triggeredUsedTurn` に記録している）。ルール上は払えなければ発揮していないので消費すべきでない | 全カード共通。2026-09-09 に黄バッチで気づいた。**着手可**（BS13 完了済み） |
| 消滅待機中のシンボルが軽減に数えられている（**ギャップ確定・実測済み**） | 直し方は小さい。**着手可**（BS13 完了済み） |
| 余分コストは軽減の**あと**に乗る／コスト固定は「後から発揮した方」が優先（実装は最小値） | **着手可**（BS13 完了済み） |
| **器BU（BS13-047）でブロック時に破棄するマジックを実装が自動で選んでいる**（`GameEngine.ts` の `finishBlockDeclaration`＝手札の最初のマジック1枚）。どれを捨てるかは対戦者が選ぶべき。`npm run audit:choices` で検出（2026-09-10）。ブロック宣言の同期経路なので、クライアントが選んで `block` アクションに載せる形なら [INTERRUPTION_POINTS.md](./docs/design/INTERRUPTION_POINTS.md) パターンE の枠内で直せる | BS13-047 の1枚だけ |
| ~~解決の途中で破壊状態が解除されたら、以降の破壊誘発は処理しない~~ | **2026-09-08 に実装済み**（TIMING_CHART。smoke part302） |

### 『』効果のカテゴリ分類の穴（2026-09-11 ユーザー確定。着手はバースト＋SD06 の後）

**『』で囲まれた効果は「カテゴリ」で、効果を借りる／発揮させない器は『』付きの効果しか対象にできない。**
実装ではこれは `kind:"triggered"` の `trigger: TriggerEvent`（12種）が担っている。
消費側は5つ: `borrowCombinedAttackEffect`（BS13-049 イリテバン）／`borrowSummonEffect`（BS13-084 アルゴアタック）／
`borrowDestroyEffect`（BS13-052 イビルグライダー）／`suppressTriggerThisTurn`（ユーサネイジア）／
`kind:"triggerSuppression"`（古代闘技場）。

全906枚の `triggered` 666件を印刷テキストの『』と突き合わせた結果、不一致は6件だけだった。やること3つ:

| やること | 対象 |
| :-- | :-- |
| **`TriggerEvent` に `onDeploy`（『このネクサスの配置時』）を新設して `onSummon` から分ける** | BS10-096 最後の優勝旗／BS12-063 旅団の摩天楼の2枚と、ネクサスの onSummon を見ているエンジン箇所 |
| **BS13-010 スカルザードを `kind:"fieldEvent"` + `ownSpiritDestroyed`（`subjectSide:"opponent"`・自身限定）へ書き換える** | 印刷は『相手のターン』＋「相手によってこのスピリットが破壊されたとき」で**『破壊時』効果ではない**。現状は同じ BS13 のイビルグライダーに借りられ、破壊時封じでも止まってしまう |
| **`validate:cards` に「`trigger` と印刷テキストの『』が一致するか」の検査を足す** | BS14 で120枚入る前に入れておく。常にゼロを維持する枠 |

**『このスピリットのアタック/ブロック時』を onAttack + onBlock の2エントリに分解する現状は正しい**（2026-09-11 ユーザー確定）。
複合表記は『アタック時』でも『ブロック時』でもあるので、借りる側・止める側のどちらからも見えてよい。
該当は BS05-X18 超獣王ベヒードス／BS12-X04 月光神龍ルナテック／BS07-041 天剣の勇者リュート（『バトル時』→ onBlock + onBlocked）。

## 3. 決着済み（蒸し返さないこと）

- **再開スタック方式を採る**（ジェネレータ化はしない）。理由は [RESUME_STACK.md](./docs/design/RESUME_STACK.md) §8
- **`allowSuspend` と `pendingReviveConfirms` は消さない。** この2つは「その場で聞く」と
  「恩恵の後に聞く」の使い分けそのもの（RESUME_STACK.md §7）
- **発動確認の抑止はやらない。** 成立しない任意コスト効果でも確認は出る
- **破壊待機状態の導入で挙動が変わった既存16枚は、そのまま受け入れる**（2026-09-09 ユーザー合意）。
  多くが強くなる方向だが仕様の帰結。中身は [TIMING_CHART.md](./docs/design/TIMING_CHART.md) §1.5 とテストにある

---

## 4. 間欠的に踏む罠（文書化先が無いのでここに置く）

- **`createGame(seed, …)` の seed は名前だけで、シャッフルは `Math.random()`**（`GameState.ts` の `shuffle`）。
  **デッキの中身に依存するテストは間欠的に落ちる。** 必要なカードは自分で山札の先頭へ置くこと。
  smoke が1〜2件落ちたら、まず**同じコマンドを再実行**して再現するか見る
- **再開スタックは `act()` の解決ループでしか消化されない。** 束を積むだけでは `pendingChoice` が立たず、
  呼び出し元からは「何も起きなかった」ように見えて誘発が放置される
