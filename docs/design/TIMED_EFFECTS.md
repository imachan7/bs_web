# 期間つき効果の記録（timedEffects）

「このターンの間」「このバトルの間」に掛かる効果を、**1つの一覧に記録し、1つの関数で読む**ための設計。
2026-09-25 ユーザー合意（試作してから全体を移すか決める）。

## 1. なぜ（今の不都合）

`timedEffect` の内容（`cantAttack`・`mustAttack`・`bp`…）ごとに、次の3つを別々に書いている。

| | 今 | 起きること |
| :-- | :-- | :-- |
| 置き場 | 個体の印（19種）／ターン制約／バトルの印／`timedRule` | 印を1つ足すたびに、型・置く処理・ターン終了の消去・判定・クライアントの5か所に手が要る。消し忘れ・片方だけ読む、はテストで見つからない |
| 読む側 | 判定関数が「個体の印」と「全体ルール」を別々に探す | 1体向けは効くのに「すべて」は黙って効かない、が起きる（#124 の `all` の grantTrigger） |
| 対象の決め方 | 内容ごとに陣営・自動選択の規則が違う | 同じ意味の効果がカードによって違う動きをする |

**データとして書けるのに黙って動かない組み合わせ**が作れることが、一番の不都合（行数ではない）。

## 2. スキーマ（確定）

```ts
// GameState に1つ。追加順を保つ（後から掛けた方が勝つ Lv などは順番で決まる）
timedEffects: TimedRecord[]

type TimedRecord = {
    id: string
    content: TimedContent[]          // 既存の TimedContent をそのまま使う
    target:
        | { kind: "instance"; instanceId: string }                        // 1体指定・このスピリット
        | { kind: "rule"; pid?: PlayerId; filter: ResolvedTargetFilter; selfInstanceId?: string } // 「〜すべて」。判定のたびに照合＝後から出たスピリットにも効く
        | { kind: "player"; pid: PlayerId }                               // プレイヤーに掛かる制約
        | { kind: "battle" }                                              // このバトルの解決方法（比較基準など）
    until: "turn" | "battle"
    ownerPid: PlayerId               // 効果を出した側
    sourceInstanceId?: string
}
```

読む関数は `shared/rules.ts` に置き、サーバーとクライアントが同じものを使う:

```ts
timedContentsOn(board, pid, inst): TimedContent[]   // この個体にいま掛かっている内容（instance と rule の両方）
timedContentsFor(board, pid): TimedContent[]        // このプレイヤーに掛かっている内容（player）
timedBattleContents(board): TimedContent[]          // このバトルに掛かっている内容（battle）
```

- 寿命：`until:"turn"` はターン終了時、`"battle"` は `clearBattle` で一覧から消す（この2か所だけ）
- `instance` の対象が場を離れたら、その記録は誰にも当たらないだけ（消す処理は要らない）
- 内容の**意味**（強制アタックとは何か）は、ルールを判定する場所（アタックの検証など）に残る。そこは減らさない

## 3. 進め方

1. **試作**：内容 `cantAttack`・`cantBlock` だけを一覧へ移す（置く処理・読む側・クライアントのボタン・ターン終了）。**挙動は変えない**。変更量を測って、全体を移すかユーザーと決める
2. 残りの内容を1つずつ移し、個体の印とターン制約の `timedRule` を消す
3. 旧 type が同じ印を書いている箇所（BP の `tempBpBuff` 12か所・Lv の `levelOverrideThisTurn` 3か所・`refreshAllOwn` のアタック不可・アブソリュートストライク）は、その印を消す段で一覧へ書くように直す。それまで読む側は印と一覧の両方を見る

## 4. 相談して決めること（未決）

- **自動選択の規則をそろえるか**：試作では内容ごとの今の規則を残す（挙動を変えない）。そろえると AI とテストの挙動が変わる箇所がある
- **場を離れる直前の状態**（破壊後に誘発する効果が、破壊直前に掛かっていた記録を見る）はこの設計だけでは解けない。`instance` の記録は残るので読めるが、`effectGrant` のような場の発生源からの継続効果は別の話
