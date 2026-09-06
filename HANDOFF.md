# 引き継ぎ

**この文書は「次のセッションが知らないと困ること」だけを書く。80行を超えたら削る。**
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

**BS12「星座編 第三弾：月の咆哮」の取り込みが本線**（2026-09-03 に staging へ91枚。実装は未着手）。
→ [BS12_PLAN.md](./docs/design/BS12_PLAN.md)。§1 に確定済みの解釈4件、§2 に新しく要る器の一覧、§4 にバッチ割り

**次の一手: バッチ2（紫15枚）を実装する。** バッチ0（器 A/B/D）とバッチ1（赤15枚）は投入済み。
確定した規則は手順書へ移した（指定アタック＝[TIMING_CHART.md](./docs/design/TIMING_CHART.md) §1.10、
【合体時】の起動能力＝[BRAVE.md](./docs/design/BRAVE.md) §12.3）。

### バッチ2（紫）の確定スキーマ（2026-09-06 ユーザー確認。完了したら手順書へ移してここから消す）

対象15枚: 009-016 / 051-052 / 063-064 / 075-076 / X02。**新しく要る器は6つだけ**で、残りは既存。

| 器 | 形 | 対象 |
| :-- | :-- | :-- |
| K | 新アクション `mutualKeepChoice` — お互い**自分の**スピリット1体を指定（自分→相手の順。`mutualDestroyChoice` と同じ二段階choice）、指定されなかった**両陣営の**スピリットすべてを破壊。**破壊待機中の発生源自身は指定候補に含めない** | 015 |
| T | 新 globalConstraint `coresToOpponentReserveGoToTrash` — **両陣営の**スピリット/ブレイヴ/マジックの効果で、発生源の持ち主から見た相手のリザーブへ置かれるコアはその相手のトラッシュへ。ネクサスの効果とルール処理（バトル・場を離れる）は対象外 | X02 |
| — | `reviveOnDestroy` に `whileCombined?: true` を足す（他 kind と同じ意味） | 052 |
| — | `exhaustImmunityGrant` の `familyFilter` を任意にし `scope?: "self"` を足す（発生源自身だけ。ブレイヴの効果も防ぐ） | 012 |
| — | `costMod` の `condition` に `{ ownTrashFamilyCountAtLeast: { family: FamilyFilter; count: number } }` を足す | 016 |
| — | 新アクション2つ: `discardOpponentTegamotoVoidCoresPer`（`discardOpponentTegamotoDestroyPer` の兄弟。破棄枚数ぶん相手のフィールド/リザーブのソウルコア以外のコアをボイドへ）／`voidCoresFromField { side; count; costOwnFieldCoresToVoid? }` | 011 / 015 |
| — | 新アクション `coreRemoveByPayingSelfCores { filter?; dest:"trash" }` — self のコアを好きなだけ自分のトラッシュへ置き（stepper。`bpBuff.extraPerCoreToTrash` と同じ選択の形）、置いた1個につき filter 一致の相手スピリットからコア1個を相手のトラッシュへ | 012 |

既存の器で書くもの: 009=`colorAs`+`symbolFix` / 010=バニラ / 013=`fushi.triggerCosts:[5,6]`+【呪撃】 /
014=`ownSpiritDestroyed`(familyFilter)+`onAttack`(whileCombined) / 016=`recoverSpiritFromTrash.costBudget:13` /
051=`recoverSpiritFromTrash.familyFilter` / 052召喚時=`destroyOwn`+draw（`skipOnDestroy`相当で『破壊時』を出さない） /
063=`onPlace` draw + `ownSpiritAttacked`(familyFilter) / 064=バッチ0の `tenshoCoreSubstitute.familyFilter` /
075=`summonFromTrashFree { keywordFilter:"fushi", payCost:true }` / 076=`destroyBrave` /
011Lv2・064Lv2=`ownSpiritExhausted` + `byOpponentEffectOnly`（既にスピリット/ブレイヴ/マジック限定）/
012の絞り込み=`TargetFilter { symbolCount: 2, combined: true }`（バッチ0で入れた軸をそのまま使う）

C（シンボルの追加＝BS12-006／喪失＝BS12-080）は該当色のバッチで入れる。残りの器は
[BS12_PLAN.md](./docs/design/BS12_PLAN.md) §2。

BS11 は91枚すべて投入済み。残る2節は [BS11_PLAN.md](./docs/design/BS11_PLAN.md) §5（どちらも横断的な下ごしらえが先）。

BS10（121枚）とブレイヴの段階1〜7は完了済み（[BRAVE.md](./docs/design/BRAVE.md) §9）。
BS11 で確定した規則は BRAVE.md §12.5.1〜§12.5.5 に移してある。

---

## 2. 未決（答えが出たら手順書へ1行移して、ここから消す）

**いまは無い**（2026-09-02 に PROCEDURES_AUDIT §5 の Q2/Q3/Q4/Q6 と COST_MODEL の保留がすべて決着した）。

---

## 3. ⚠️ 挙動が変わった既存カード（ユーザーの合意待ち）

破壊待機状態の導入で5枚の挙動が変わった。いずれも仕様（[TIMING_CHART.md](./docs/design/TIMING_CHART.md) §1.5）の
帰結でテストにも固定してあるが、**うち3枚は効果が強くなる方向**なので、意図と違えば戻すこと。

| カード | 変化 | 強弱 |
| :-- | :-- | :-- |
| 宝石の獣カーバルク | 『破壊時』の「自分のフィールドにいる想獣1体につき」に**自分自身が入る** | 強くなる |
| 戦闘獣ジャッカー | 「破壊されたネクサスを戻す」が**待機解除**になり、コアもレベルもそのまま残る | 強くなる |
| 兵隊アントマン | 『破壊時』の召喚で**自分のコアはまだ使えず**、**自分のシンボルは軽減に数える** | 一長一短 |
| 盾精ラングリーズ／神鳴る霊峰 | 破壊されたコアを、リザーブ経由でなく**待機中の本体から直接**移す | 同等 |
| `returnSelfToHand` | トラッシュからでなく**破壊待機状態から**手札へ戻る | 同等 |

指定アタックの手順を直したことで、既存の `canDirectAttack` 持ち5枚
（イリュージョナ／牛霊スモゥグ／オルカリア／シンクロニシティ／BS11-X02 滅神星龍ダークヴルム・ノヴァ）の
挙動も変わる。**指定された側の『ブロック時』効果が発揮するようになり、【装甲】持ちは指定できなくなる**
（2026-09-06 ユーザー指示による修正なので合意済み）。

---

## 4. 決着済み（蒸し返さないこと）

- **再開スタック方式を採る**（ジェネレータ化はしない）。理由は [RESUME_STACK.md](./docs/design/RESUME_STACK.md) §8
- **`allowSuspend` と `pendingReviveConfirms` は消さない。** この2つは「その場で聞く」と
  「恩恵の後に聞く」の使い分けそのもの（RESUME_STACK.md §7）
- **発動確認の抑止はやらない。** 成立しない任意コスト効果でも確認は出る

---

## 5. 間欠的に踏む罠（文書化先が無いのでここに置く）

- **`createGame(seed, …)` の seed は名前だけで、シャッフルは `Math.random()`**（`GameState.ts` の `shuffle`）。
  **デッキの中身に依存するテストは間欠的に落ちる。** 必要なカードは自分で山札の先頭へ置くこと。
  smoke が1〜2件落ちたら、まず**同じコマンドを再実行**して再現するか見る
- **再開スタックは `act()` の解決ループでしか消化されない。** 束を積むだけでは `pendingChoice` が立たず、
  呼び出し元からは「何も起きなかった」ように見えて誘発が放置される
