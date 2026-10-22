# 「選んで動かす」系8種 → `moveCards` の軸の対応表（2026-10-10 叩き台）

未確定。スタンダード版リポジトリで統合するときの下敷き。
括弧内は bs_web のカードデータで type が出てくる回数（エントリ数）。

## 1. 叩き台のスキーマ

```ts
moveCards {
  from: "trash" | "hand" | "deck" | "revealed"     // revealed＝直前の reveal で公開中のカード
  side?: "opponent"
  source?: "lastDeckMill" | "burstDestroyed"       // 候補をゾーン全体でなく直前の出来事ぶんに絞る
  filter?: CardFilter                              // CardPick を拡張したもの（§3）
  count: number | "all" | EffectCounter
  upTo?: true                                      // 0〜count 枚を選べる
  costBudget?: number                              // コスト合計がこれ以下の範囲で選ぶ
  chooser?: "target"                               // 省略時は効果の使用者
  dest:
    | { to: "hand" }
    | { to: "deck"; position: "top" | "bottom" }
    | { to: "trash" }
    | { to: "tegamoto" }
    | { to: "summon"; pay?: "free" | "normal"; noSummonEffects?: true; tensho?: "asIfDone" | "none" }
    | { to: "deploy"; pay?: "free" | "normal" | "fieldCoresOnly" }
    | { to: "cast";   pay?: "normal" | "reserveOnly" }
    | { to: "activateBurst" }
}
reveal { from: "ownDeck" | "opponentDeck" | "hand" | "burst"; count: number | EffectCounter }
```

dest の summon・deploy・cast・activateBurst は既存の手順（召喚手順・配置・マジック使用・バースト発動）を呼ぶ。`moveCards` の中に手順を書き直さない。

## 2. 種類ごとの対応

| 旧 type | from | dest | 軸の行き先 |
| :-- | :-- | :-- | :-- |
| `toHand`（2） | `from` | `hand` | `count`／`pick`→`filter`。`picked` は再開用の内部状態（データでは使っていない） |
| `toDeck`（7） | `from`・`side` | `deck`＋`position` | `upTo`・`chooserIsTarget`→`chooser`。`fromEvent`→`source:"lastDeckMill"` |
| `recoverSpiritFromTrash`（39） | trash | `hand` | フィルタ系12軸→`filter`（§3）。`count`・`countCounter`→`count`、`all`→`count:"all"`、`costBudget`はそのまま。**外へ出すもの**：`costSkipDraw`→`pay`（ドローステップを飛ばすことで）、`thenDestroyIfFamily`→`sequence`＋`if`＋破壊、`costSacrificeChosen`はデータで0件（再入フラグが型に紛れたもの。移さない） |
| `recoverMagicFromTrash`（13） | trash | `hand` | `colors`・`hasBurst`・`anyCardType`→`filter`（指定がなければ cardType:"magic"）。`onlyBurstDestroyedCard`→`source:"burstDestroyed"`。count は暗黙の1 |
| `summonFromTrashFree`（19） | trash | `summon` | フィルタ系→`filter`。`payCost`→`pay:"normal"`（省略時は free）、`skipOnSummon`→`noSummonEffects`、`onlyBurstDestroyedCard`→`source`、`count`・`countCounter`・`upTo`・`costBudget`はそのまま。**外へ出すもの**：`destroyAtBattleEnd`→`sequence`＋「バトル終了時に破壊」（今動いた個体を指す参照が要る。§4） |
| `deployNexusFromTrashByFieldCores`（1） | trash | `deploy`＋`pay:"fieldCoresOnly"` | `colors`→`filter.color`（いずれか）＋cardType:"nexus" |
| `castMagicFromTrashByColor`（2） | trash | `cast`＋`pay:"reserveOnly"` | `colorFilter`→`filter`。自動選択の「払える中で最高コスト」は非対話時の規則として dest:cast 側に持たせる |
| `reveal`（37） | — | — | 公開だけを残す。`pick`・`pickCount`・`optional`・`dest`→後に続く `moveCards{from:"revealed"}`（`optional`は`upTo`）、`rest`→2本目の `moveCards{from:"revealed", count:"all"}`。`countPer`・`countFromSelfLevel`→`EffectCounter`。`orHand`→`from:"revealed"` の候補に手札を足す軸（2件のみ。§4）。`returnToDeckBottomAtEndStep`→タイミング部品「このターン終了時に」 |

## 3. `filter` に寄せる軸（CardPick との差分）

| 旧軸 | CardPick にある？ | 統合後 |
| :-- | :-- | :-- |
| colorFilter／colors（複数） | `color`（1色だけ） | `color: Color \| Color[]`（いずれか） |
| familyFilter・nameIncludes・costFilter | ある | そのまま |
| keywordFilter／keywordFilterAny | `keyword`（1つだけ） | `keyword: Keyword \| Keyword[]` |
| hasBurst／excludeBurst | `hasBurst` のみ | `hasBurst: boolean` |
| anyCardType・includeBraves・bravesOnly | `cardType` | `cardType` の配列で書く（既定値は dest から決める） |
| vanillaFilter | なし | `vanilla: true` を足す |
| whileCombinedFilter | なし | `hasWhileCombined: true` を足す（1件） |
| costAtMostOrHasBurst・bravesAnyOrSpiritColorFilter | なし（OR 条件） | `anyOf: CardFilter[]` を1つ足せば両方書ける |

## 4. 決めることが残っている点

1. **今動いたカードを後ろの効果から指す参照**：`destroyAtBattleEnd`・`thenDestroyIfFamily` は sequence の後半が「いま召喚／回収したカード」を指す。bs_web の `lastMoved` は枚数だけを持つので、動いたインスタンス／cardId の一覧まで持たせるかどうか
2. **`orHand`（公開したカードか手札から選ぶ）**：`from` を配列にする（`["revealed","hand"]`）か、2件だけなので専用の軸のまま残すか
3. **非対話時の自動選択**：回収は新しい方から、cast は払える中で最高コストから。dest ごとに既定を決めるか、`moveCards` に1本の規則を持たせるか
4. **耐性・封じの判定**：`noTrashRecovery` などの「トラッシュから〜できない」をどの dest で見るか（手札に加えるときだけ／召喚にも効くのか）。ここはルールの解釈なので統合前に確認する
