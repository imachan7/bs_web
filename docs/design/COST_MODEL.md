# 効果のコスト（「Aすることで、Bする」）の手順

`EffectAction` には支払いを表すフィールドが10個以上ある（`costReserveToVoid` / `costDestroyOwnKeyword` /
`costExhaustFamily` / `costSkipDraw` …）。カードが来るたびにその1枚専用のフィールドを足してきたため、
**コストとは何かという一般則が無い**状態だった。この文書がその一般則を持つ。

## 1. 基本規則（2026-08-13 ユーザー確定）

> 「**A することで、B する**」は、**A と B の両方が完全に解決できる場合にだけ発揮できる、任意発揮の効果**。

ここから3つが導かれる:

1. **発揮可能かの判定に B の成立も含む。** 「コストは払えるが対象がいない」は**発揮できない**
   （＝発動確認も出さない）。「コストを払ってから対象を探して不発」は誤り
2. **A と B を同時に満たせるかを、何かを動かす前に確かめる。** 支払いも効果適用も、
   判定を通ってから行う
3. **任意発揮**。払えて対象もいる場合でも、プレイヤーは発揮しないことを選べる
   （`optional: true` の発動確認）

### 実装の形

```ts
// ① A（コスト）を払えるか  ② B（効果）が成立するか  ——両方を先に確かめる
if (!canPayCost(...) || !hasResolvableTarget(...)) {
    log(state, `${sourceName}：発揮できなかった。`)
    return
}
// ③ ここまで来たら、支払い → 効果適用の順に実行する
```

`optional: true`（発動確認）は**①②を満たしたときだけ**出す。満たさないのに確認を出すと、
プレイヤーが「発動する」を選んだのに何も起きない。

### まだ決めていないこと（実装時に確認する）

- **数が足りないとき。** 「コア2個を置くことで、相手のスピリット**2体**を破壊する」で相手が1体のとき、
  「完全に解決できない」から発揮不可なのか、1体だけ破壊できるのか。
  現状の実装は「あるだけ処理する」なので、ここを変えるなら影響範囲を測ってから

## 2. 何を犠牲にするかは選ばせる（2026-08-13 ユーザー確定）

コストの対象（破壊する自分のスピリット、疲労させるスピリット等）が**2つ以上あるときはプレイヤーに選ばせる**。

`requestChoice` の既定パターン（`INTERRUPTION_POINTS.md` パターンA）に載せる。
候補1つなら即確定、0なら §1 により発揮不可。非対話（smoke）は従来どおり自動選択を残す。

**実装の形**：選ばせたら、**そのコスト軸を落とした action で入り直す**（`ctx.resolve`）。
二重に払うのを構造的に防ぐため。`exhaust` の `chooserIsTarget` と同じ「解決済みの軸を落として再入する」書き方。
再入時に渡る `targetInstanceId` が犠牲であることは、内部専用フィールド `costSacrificeChosen` で示す。

```ts
const { costDestroyOwnFamily: _paid, costSacrificeChosen: _flag, ...rest } = action
if (action.costSacrificeChosen && targetInstanceId !== undefined) {
    /* targetInstanceId を犠牲として支払う */
    ctx.resolve(rest)   // ← コスト軸が消えているので本体だけが走る
    return
}
```

2026-08-13 に4枚へ適用済み（smoke part177）:
ブリュナグオン（`costDestroyOwnKeyword`）／キャストオフ（`costDestroyOwnFamily`）／
リクラメーション（`costDestroyOwnNexus`）／秘密の花園（`costExhaustFamily`）。
リザーブや自身の上のコアを払うもの（`costReserveToVoid` 等）は、どのコアを払っても同じなので選択の対象外。

## 3. 現状の適合状況（2026-08-13 時点）

| アクション | コスト | §1 適合 |
| :-- | :-- | :-- |
| `refreshSelf` | `costReserveToVoid` / `costSelfCoresToVoid` | ✅ 回復済みなら払わない |
| `targetNegateByHandDiscard` | 手札破棄 | ✅ `probing` で「元々防げていた対象化」には払わない |
| `recoverSpiritFromTrash` | `costSkipDraw` | ✅ 実際に戻せたときだけ支払う |
| `protectLifeByCostThisTurn` | `costExhaustFamily` | ✅ 疲労させる候補を先に確かめる |
| `returnToHand` | `costReserveToTrash` | ❌ 払ってから対象を探す |
| `recoverSpiritFromTrash` | `costDestroyOwnKeyword` | ❌ 自分のスピリットを破壊してからトラッシュを見る |
| `lifeCrush` | `costReserveToVoid` | ❌ 払ってからカウントを見る |
| `levelOverrideOpponentNexuses` | `costReserveToVoid` | ❌ 払ってから相手ネクサスを見る |
| `summonFromHandFree` | `costDestroyOwnFamily` / `costDestroyOwnNexus` | ❌ 破壊してから召喚可能か見る |

❌ の5件は §1 に合わせて直す（実カードは6枚。ビャク・ガロウ／ブリュナグオン／キャストオフ／
リクラメーション／カイザーアトラス皇帝／皇帝アンプルール）。

「発揮できない＝発動確認も出さない」まで守るには、**そのアクションが今 A と B を満たせるかを
副作用なしで答える述語**が要る（発動確認を出すのは `fireStepTriggers` / `fireTrigger` で、
アクションを実行する前の層のため）。`resistanceAgainst` の `probing` と同じ形。

## 4. コストの代替支払い（別概念なので混ぜない）

「支払うコストを別の資源で払える」は上とは別の仕組み。**カードのコスト計算**の側にある。

| 仕組み | カード | 実装 |
| :-- | :-- | :-- |
| `summonCostHandDiscardPay` | ビクティム | 召喚コストを手札破棄で。枚数はプレイヤーが選ぶ |
| `nexusCostMillPay` | 栄光の表彰台 | 配置コストをデッキ破棄で。枚数はプレイヤーが選ぶ |
| `constraint: tenshoCoreSubstitute` | ダークスカルデーモン | 【転召】の対象になったとき疲労で代替 |

## 5. 必須コスト

**【転召】は任意コストではなく召喚の必須コスト**。対象がいなければ**召喚そのものができない**
（`validateSummon` が拒否する。2026-08-13 修正）。対象になったスピリットは破壊ではなく
維持コア割れによる**消滅**なので、破壊時効果は発揮されない。詳細は SPEC.md §2「効果による召喚と【転召】」。

## 関連

- [INTERRUPTION_POINTS.md](./INTERRUPTION_POINTS.md) — 選択を挟める層と3つのパターン
- [CHOOSER_RULES.md](./CHOOSER_RULES.md) — 誰が選ぶか
