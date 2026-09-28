# BS17 緑・白 調査メモ（19/20/21/22/23/24/25/26/27/28/29/30/31/32/33/34/35/36/57/58/65/66/67/68/77/78/79/80/X03/X04）

調査役。実装はしていない。元データ: `data/staging/BS17.json`（効果文は scratchpad 由来）。

## 集計

- 全節数：51（テリムック／トドールはバニラ、節に数えない）
- 既存の器で書ける節：33
- 新しい部品が要る節：18（内訳は下表）

## 新しい部品の一覧

| 部品名（差し込み先） | 対象カード | 理由 |
| :-- | :-- | :-- |
| `battleBpAsLevel` に `costFilter` と `useLevel:"max"` を足す（types/effectDef.ts） | BS17-023 | 既存はfromLevel→useLevelの固定ペア専用。コスト絞り込みと「そのスピリットの最高Lv」動的モードが無い |
| `summonExhausted`（globalConstraint）にセルフ専用スコープを足す（type.ts） | BS17-026 | 既存は「お互い、条件を満たすカードは疲労状態で召喚」の全体制約のみ。自分自身だけ常に疲労召喚、の単体スコープが無い |
| `burst` kind に `phase?: Phase` を足す（types/effectDef.ts） | BS17-032 | 「このバーストが相手のメインステップに発動したとき」の分岐が無い。summonBurstCardFree/forceEndMainStep自体は既存 |
| 「このスピリットのブレイヴ1つを手札に戻す」を単独アクション化（現状はrefreshSelfのcostReturnOwnBraveという“コスト”の中にしかない） | BS17-033 | 単独の「〜できる」効果として使えない |
| `toDeck`（from:trash）に「直前のバトルで破壊された側」スコープを足す（GameState.lastBattleDestroyedInstanceIdは定義済みだが未使用） | BS17-034 | 既存のfromEvent（lastDeckMill）はミル用で、バトル破壊は別記録。使用実績0件 |
| `constraintGrant` に厳密一致の `symbolCount` を足す（既存はminSymbols=以上のみ） | BS17-036 | 「シンボルが1つの」は完全一致。minSymbolsでは2つ以上も含んでしまう |
| `constraintGrant`/`immunityGrant` に `combinedBraveColors` 条件を足す（triggered/fieldEventには既にある） | BS17-036 x2, 058で似た構図 | 「◯色のブレイヴとの合体時」で継続付与をゲートする軸が無い |
| `reviveOnDestroy` に `blockingOnly` を足す（AuraDefには既にある同名軸） | BS17-079 | 「ブロックしている自分のスピリットが破壊されたとき」の絞り込みが無い |
| `TimedContent` に `immuneToOpponentEffects`（against軸）を足す（ConstraintDefには既にある） | BS17-058 | 「このターンの間」スコープでの免疫付与がtimedEffect側に無い（0件） |
| `AuraDef` に `levelFilter` を足す（他の軸は多数あるがLvだけ無い） | BS17-065 | 「Lv1の自分のスピリットすべてをBP+」を絞り込めない |
| `symbolFix` に召喚するカード種別の絞り込み（brave限定）を足す | BS17-067 | 既存例（BS16-068）はスピリット/ブレイヴ両方が対象。ブレイヴ限定の版が無い |
| バースト**発動（解決）時**にコスト支払いを課す仕組み（既存`burstSetCost`はバースト**セット時**のコストで別物） | BS17-068 | 「発動したとき、〜しなければ発揮できない」を表す器が無い |
| `MagicCondition` に自他スピリット体数の相対比較を足す（`opponentHandAtLeastOwnHand`と同型のスピリット版） | BS17-077 | 既存は固定数の閾値のみ（`ownSpiritCountAtLeast`）。相手との相対比較が無い |
| `combineLimit` に、追加スロットをシンボル0のブレイヴに限定し合体条件を無視する軸を足す | BS17-X04 | 既存（BS13-X01）は無条件の2体合体枠のみ。「シンボルを持たない」限定・条件無視が無い |
| `returnToHand` に `nexus?: "also"`（exhaustには既にある同型軸）を足す | BS17-X04 | 「スピリット/ネクサス1つを手札に戻す」を1アクションで表せない |

## 前例（既存判定の根拠になった代表カード）

battleBpAsLevel=BS03-107／summonExhausted=BS13-065／soku全文＝SD01-016／reveal+pick.cost=BS12-065,BS11-007／
placeCores自分に=BS02-029／pay+refreshSelf=BS12-032／bofuペア=BS06-1571相当／chooserIsTarget=BS13-054／
returnNexusToHand+lastMoved counter=BS12-011／refreshOne(filter+all)=BS09-061／vanillaAsGrant(self)=BS12-046／
heavyArmor色指定=BS13-030／hyoheki+magicNegateペア=BS12-032／canBlockWhileRested(filter)=BS08-077／
summonBurstCardFree=SD06-010／forceEndMainStep=BS13-067／countCounter(ownColor)=BS14-001／
summonFromHandFree(bravesOnly+skipOnSummon)=BS10-029／step+summonFromHandFree=BS10-096／
onBattleWin=BS05-020ほか／millCap(mutual)=BS13-026／keyword:heavyArmor(colors)=BS13-030／
combinedFilter+keywordGrant=BS13-005／familyFilter(fieldEvent onSpiritDestroyed)+byOpponentEffectOnly=BS16-064／
opponentMagicUsedAtLeast=BS13-071／toHand(from:trash,pick)=BS10-112／immuneToOpponentEffects(against:spirit)=BS10-091,BS14-044／
skipRefresh(nextRefresh)=BS11-055／exhaust(all,anySide,filter.level)=BS04-100／combineLimit=BS13-X01(selfBraveCount含む)

## 確認事項

1. **BS17-020「相手は、相手のスピリット1体を疲労させる」の選ぶ人**：CHOOSER_RULES.md §1の原則どおり、主語「相手は」＝相手が選ぶ、と読みました（`chooserIsTarget:true`）。既存のBS14-013（「相手は」無し＝自分が選ぶ）と対比が明確なので確定済みとして扱ってよいはずですが、念のため確認をお願いします。
2. **BS17-057/BS17-X03 のバースト＋合体条件カード（brave）の「合体時」節が持つ効果は"合体している間ずっと"継続か、"合体したその瞬間だけ"か**：印刷テキストの構造上は継続（コアが2個の間、など）と読みましたが、CONJUNCTION.mdに明示例が無いため確認したいです。
3. **BS17-036/BS17-X04の「◯◯のブレイヴとの合体時」節**：合体した瞬間のトリガーではなく、「そのブレイヴと合体している間ずっと効く継続効果」と読みました（X008 神星皇ストライク・アポロドラゴンの実装を前例としています）。この読みで確定してよいか確認をお願いします。
4. **BS17-068の「相手のバーストが発動したとき、〜しなければ、その効果を発揮できない」**：バーストの**発動**（宣言）自体は止めず、**効果の解決だけ**を止める（コストを払えば通常どおり解決）と読みました。バーストの発動自体を無効化する（不発扱いにする）読みとは区別が必要なため確認をお願いします。
5. **BS17-X04の「さらに、シンボルを持たないブレイヴ1つと合体できる」**：追加スロットは通常の合体条件（コスト等）を無視し、シンボル0であることだけを要求すると読みました（BS13-X01は無条件2枠、本カードは条件つき2枠）。
