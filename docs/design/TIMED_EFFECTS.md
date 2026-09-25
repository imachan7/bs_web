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
    until: "turn" | "battle" | "attack"   // attack＝対象の個体のアタックの終了かターン終了（「ターンに1回」）
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

- 寿命：`until:"turn"` はターン終了時、`"battle"` は `clearBattle` で一覧から消す。`"attack"` は `clearBattle` でアタックした個体の分だけ消し、残りはターン終了で消える（消すのはこの2か所だけ）
- `instance` の対象が場を離れたら、その記録は誰にも当たらないだけ（消す処理は要らない）
- `rule`（「〜のスピリットすべて」）は場のスピリットにだけ当たる。ネクサスに掛かる期間つき効果は `instance` で1つずつ記録する（2026-09-25。ネクサスにも当てていた不具合を直した）
- 内容の**意味**（強制アタックとは何か）は、ルールを判定する場所（アタックの検証など）に残る。そこは減らさない

## 3. 進め方

1. **試作**：内容 `cantAttack`・`cantBlock` だけを一覧へ移す（置く処理・読む側・クライアントのボタン・ターン終了）。**挙動は変えない**。変更量を測って、全体を移すかユーザーと決める
2. 残りの内容を1つずつ移し、個体の印とターン制約の `timedRule` を消す
3. 旧 type が同じ印を書いている箇所（BP の `tempBpBuff` 12か所・Lv の `levelOverrideThisTurn` 3か所・`refreshAllOwn` のアタック不可・アブソリュートストライク）は、その印を消す段で一覧へ書くように直す。それまで読む側は印と一覧の両方を見る

### 3.1 試作の結果（2026-09-25。`cantAttack`・`cantBlock`）

- 変更量：本体・クライアント 11ファイル +88／−68、テスト 16ファイル +121／−47
- 消えたもの：個体の印3つ（`cantAttackThisTurn`・`cantBlockThisTurn`・`cantBlockThisBattle`）と、その消去2か所・二重チェック3か所。
  判定は `cantActByTimed` 1つになり、ブロック不可は共有の `canBlock` に入った（「すべて」のブロック不可はこれまでサーバーだけが見ていた）
- `timedEffect.ts` は移行中は増える（795→814行）。一覧に移したもの／まだ印のもの、の両方を扱う分岐が要るため。減るのは全内容を移して印と `timedRule` を消した後
- テストの多く（14本）が印を直接読んでいた。置き場を変えるたびにテストも直ることになるので、テストは `cantActByTimed` のような判定関数で確かめる

### 3.2 移し終えた内容

| 内容 | 消えた置き場 |
| :-- | :-- |
| `cantAttack`・`cantBlock`（#127） | 個体の印3つ・`timedRule` |
| `mustAttack`・`canBlockWhileRested`・`suppressTrigger`・`grantTrigger`（#129） | 個体の印4つ・`triggerSuppressionThisTurn`・`timedRule`。「すべての誘発を止める」は `target.kind:"player"` |
| `keyword` | 個体の `tempKeywords`。読む側は `timedKeywords(board, inst)`。【装甲】の判定（`hasArmorAgainst`・`targetArmorColorCount`）は盤面を受け取る形にした。`all:true` が1体向けに化けていた振り分けも直した |
| `level` | 個体の `levelOverrideThisTurn` は写し `timedLevel` になった。`timedRule`＋`appliedIds` はやめ、一覧を記録順に処理して「後から掛けた方が勝つ」を再現する。「1つ上として扱う」は記録する時点の Lv から具体的な Lv にして記録する。旧 type（`refreshOne` の Lv 上げ・相手のネクサスすべての Lv）も `recordTimed` で書く。照合は写しを空にした状態で全員ぶん先に済ませる（処理順で結果が変わらない） |
| `symbolAdd`・`symbolSet`・`symbolLoss`・`cost` | 個体の印4つは写し `timedExtraSymbols`・`timedSymbolsOverride`・`timedSymbolLoss`・`timedCostDelta` になった。「すべての色のシンボルを失う」の `timedRule`＋`appliedIds` はやめた（`appliedIds` の型も削除）。バトル終了時（`clearBattle`）にも作り直す。残る `timedRule` は BP だけ |
| `unblockable` | 個体の印3つ（`unblockableThisTurn`・`unblockableOnceThisTurn`・`unblockableMinBpThisBattle`）。強者統べる大地の「ターンに1回」は寿命 `attack` にした（別のスピリットが先にアタックしても消えない、という今の挙動を保つ） |
| `color` | 個体の `tempColors` は写し `timedColors` になった（§4 の作り直し方式の最初）。一覧への追加は `recordTimed` 1つにまとめ、記録のたびに作り直す。`all:true` の振り分けも直した |

テストで掛かっているかを見るときは `scripts/smoke/helpers.ts` の `timedHas(state, inst, type, trigger?)` を使う。

## 4. 決まったこと・未決

- **全内容を一覧へ移す**（2026-09-25 ユーザー決定。試作の結果を見て）。`timedEffect` の内容すべてと、旧 type が書いている同じ意味の印（BP・Lv など）も一覧に書く。プレイヤー・バトルに掛かるものは `target` の種類を足して同じ一覧に入れる。場の発生源から出る継続効果（オーラ・`effectGrant`）は入れない
- **自動選択の規則はそろえない**（2026-09-25 ユーザー決定）。内容ごとの今の規則（相手＝実効BP最大、自分の BP・キーワード＝バトル中優先→先頭、など）を移行後も残す。実対戦では選択画面が出るか候補が1体なので、変わるのは AI とテストだけ
- **色・Lv・シンボル・コストは、一覧から個体の写しを作り直す**（2026-09-25 ユーザー決定）。この4つを読む関数（`instHasColor`・`currentLevel`・`instanceSymbolCount`・`instBaseCost`）は盤面を受け取らず、本体約350か所・テスト約360か所から呼ばれているため。
  正本は一覧のまま、`refreshLevelAsOverrides` が一覧を記録順に処理して個体の写し（`timed〜` という名前にそろえる）を毎回ゼロから書き直す。場のカードの継続効果（`〜Continuous`）と同じ作り。
  **写しを書くのは作り直しの処理だけ**。一覧に記録する関数は、記録と作り直しを必ずセットで行う（作り直す前に読んで古い値が見える、を防ぐ）。
  検討して採らなかった案：読むたびに盤面を渡す（約700か所）／個体から盤面を参照する（循環参照・複製のたびの張り直し）／グローバルな「いまの盤面」（盤面が複数ある場面で取り違える）
- （未決）**場を離れる直前の状態**（破壊後に誘発する効果が、破壊直前に掛かっていた記録を見る）はこの設計だけでは解けない。`instance` の記録は残るので読めるが、`effectGrant` のような場の発生源からの継続効果は別の話
