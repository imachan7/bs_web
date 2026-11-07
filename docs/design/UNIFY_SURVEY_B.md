# 統一の調査メモ B（③ライフ／④回復できない／⑤戻らない）

調査日 2026-11-07。コード・データは変更していない。枚数は `data/cards/*.json` の効果エントリ数（ForPid 系は `timedEffect.content[].rule` の中に入っている）。

共通の前提（3グループ全部に効く）：
- 継続効果の入口は2つある。(a) `globalConstraint`（場にいる発生源。`levels`・`phase`/`turn`・`condition`・`whileOwnBurstSet`・`whileCombined` で有効かを決める。マジックは `lendSelfThisTurn` で自分を仮想発生源にして同じ入口を使える）。(b) `timedEffect` の `playerRule`（記録に期間 `turn`/`battle` を持つ。**スピリット・ネクサスが「このターンの間」を step 誘発から出すときはこちらしか使えない**。自分自身が既に発生源なので貸与できない）。「ForPid」系は (b) の入口。
- したがって「ForPid と ForPid でない版」の統一は、**定義を1つにして `GlobalConstraintDef` と `PlayerRuleDef` の両方がそれを持ち、判定を1か所で集める**形が最小。入口を1つに潰すのはできない（上の理由）。
- 「守られる側」の軸は既存の語に揃えられる：`globalConstraint` は `side?: "own" | "opponent"`（発生源の持ち主から見て。省略＝両陣営。`noRefreshByAnyEffect` が既に採用）、`timedEffect` は `side: "own"|"opponent"|"both"`。新しい名前は要らない。

---

## ③ ライフを減らす

### 現状

| 型 | 入口 | 枚数 | 意味 | 判定の場所 | 使っているカード |
| :-- | :-- | --: | :-- | :-- | :-- |
| `noLifeDamageByCost` | globalConstraint | 17 | コスト・BP・シンボル・Lv・コア数・キーワードで絞ったアタックでは、**お互いの**ライフが減らない（`ownOnly`＝片側） | `constraints.ts` `noLifeDamageByCost()`→`lifeDamageLimit`（max:0） | BS07 勇傑6枚（maxCost2）／BS08-033（costs[3,4]＋keywordExclude 転召）／BS09-031・BS19-088（maxBp）／BS09-036（maxCost4）／BS12-020（symbolCount2＋combinedOnly）／BS12-027（costs[0,1,3]）／BS12-069（symbolCount2＋ownOnly）／BS13-070（maxCost3＋attackerLevel1）／BS14-110（attackerLevel1。マジックが lend）／BS18-070（attackerCores1＋ownOnly）／SD15-005（maxBp4000＋ownOnly） |
| `noLifeDamageByCostForPid` | playerRule | 2 | 同じ絞りで**このターンだけ・積んだ側だけ**減らない。軸は maxCost／symbolCount＋combinedOnly／cores | `lifeProtectedByCostThisTurn()`→`lifeDamageLimit`（max:0） | BS07-063 秘密の花園（step・疲労コスト・maxCost3）／BS12-043 コンドラッド（step・symbolCount2＋combinedOnly） |
| `lifeFloorForPid` | playerRule | 2 | このターン、ライフは floor を下回らない。`byAttackMinCost`（そのコスト以上のアタック）と `byEffectSourceTypes`（相手のその種別の効果）の OR で絞れる | `lifeLossAllowed()`（floor を max で畳む） | BS11-080 デルタバリア（floor1・コスト4以上・spirit/magic）／BS22-080 フェーズチェンジ（同・spirit のみ） |
| `ownLifeFloor` | globalConstraint | 2 | 発生源の持ち主のライフは floor を下回らない（片側）。`costSelfToTrash`＋`then` 付きは「0になるとき、このネクサスをトラッシュに置くことで避ける」（**任意コスト**） | `ownLifeFloorContinuous()`（無条件版）／`EffectModules.ts:601` 付近 `tryOwnLifeFloorByCost`（払う版） | BS12-070 天の階（条件 ownFamilyCountAtLeast）／BS14-084 永久凍土の王都（costSelfToTrash） |
| `lifeDamageMaxForPid` | playerRule | 1 | このターン、ライフは**1回のアタックで** max までしか減らない | `lifeDamageLimit()` の timedPlayerRules 走査 | SD01-039 ブリザードウォール |
| `lifeDamagePerSpiritPerTurn` | globalConstraint | 7 | 両陣営のライフは、ターンごとに**スピリット1体から** max までしか減らない（アタック・効果合算）。`minSymbols`、`whileOwnBurstSet` | `lifeDamagePerSpiritRemaining()`→`lifeLossAllowed` | BS15-005/014/021/031/042/051（バースト中）／BS22-031 シリマナイト（minSymbols2） |
| `ownLifeDamageCapPerSourcePerTurn` | globalConstraint | 3 | 同上の**片側版**（発生源の持ち主のライフ、相手のスピリット1体から）。`minSymbols` | `ownLifeDamageCapRemaining()`→`lifeLossAllowed` | SD06-010 シーマ・クリーク／BSC05-019 絶望壁の要塞／BS19-043 アリアンロッド（minSymbols2） |
| `lifeImmuneForPid` | playerRule | 1 | このターン、ライフはあらゆる原因で減らない | `lifeImmuneThisTurn()`→`lifeLossAllowed`（0） | BS10-093 時刻む花時計（fieldEvent の timedEffect） |
| `ownLifeImmuneToSpiritEffects` | globalConstraint | 1 | 発生源の持ち主のライフは**相手のスピリットの効果**では減らない（アタックは含めない） | `ownLifeImmuneToOpponentSpiritEffects()`→`lifeLossAllowed` | BS13-027 ムーンショウウオ Lv2 |
| `negateLifeDamageFromTarget` | アクション（timedEffect の content `noLifeDamage`/`lifeCap` を指定個体に置く） | 5 | **選んだ相手スピリット1体**のアタック（`includeEffects`＝効果も）では自分のライフが減らない。`cap`＝合計 cap まで | `grant.ts:309`→`CardInstance.lifeDamageNegatedFor`/`lifeCapThisTurn`→`lifeDamageLimit`/`lifeLossAllowed` | BS04-101／BS14-103／BS19-106（includeEffects）／BS13-027-e1（pay の then）／BS21-081 |

すべて `lifeLossAllowed`（原因を問わない制限）と `lifeDamageLimit`（アタックだけの制限）の2関数に集まる（EFFECT_GATE §4 の 4、10-30 ユーザー確認）。**判定の出口はすでに共通**で、入口の型だけが散っている。

### 違いの整理

| 違い | ルール上の違いか（根拠） | まとめた後の表し方 |
| :-- | :-- | :-- |
| 守られる側（両陣営／片側） | 書き方の違い。ルールは「お互いの」か「自分の」を効果文が言うだけ（BS07 勇傑「お互いのライフは減らない」／BS12-069「自分のライフは減らない」） | `side?: "own"\|"opponent"`（globalConstraint）、playerRule は `timedEffect.side` を読む。**`ownOnly` と `own…` 接頭辞の型を全部これで置き換える** |
| 継続／このターン（ForPid） | 入口の違いであってルールの違いではない。ただし step 誘発から「このターン」を出す2枚（BS07-063・BS12-043）は貸与できない（実装上の制約。ルールではない） | 定義を共有して両入口で持つ。判定は1か所で集める |
| 止める原因（アタック／効果／すべて） | **効果文が言い分けている**ので軸は必要（「アタックでは」／「相手のスピリットの効果では」／「あらゆる」）。型を分ける理由にはならない | `from?: "attack" \| "effect"`（省略＝すべて）。効果は `effectSource?: { types?: CardType[]; opponentOnly?: true }`（既存 `byEffectSourceTypes`・`ownLifeImmuneToSpiritEffects`・`sourceTypes`（immunityGrant）と同じ形） |
| アタッカーの絞り込み（コスト・BP・シンボル・Lv・コア数・合体・キーワード） | 書き方の違い。**`TargetFilter` に全部ある**（`cost{max,in,min}`・`maxBp`・`symbolCount`・`minSymbols`・`level`・`cores`・`combined`・`keywordExclude`） | `attacker?: TargetFilter`。`maxCost/costs/maxBp/symbolCount/combinedOnly/attackerLevel/attackerCores/keywordExclude/minSymbols/byAttackMinCost` はすべてこれに畳める（`instMatchesCostFilter` は付与コストも見る any-of で、いまの `instAllCosts().some` と同じ。`min` は any-of の `>=` ＝ max-of の `>=` と同値） |
| 上限の形（0／下限／1回のアタック／1体ごとのターン累計） | **ルール上の違い（数える単位が違う）**：「減らない」＝max0、「0にならない」＝floor1、「1しか減らない」はアタック1回で数えるか、スピリット1体のターン累計（`lifeDealtThisTurn`）で数えるかが別。効果文も別 | `max?: number`＋`per?: "attack" \| "spirit"`（`spirit` はターン累計）、`floor?: number`。減らない＝`max:0` |
| 数える相手のスピリット（1体ごと）の側 | `lifeDamagePerSpiritPerTurn` は発生源の陣営を問わず両陣営に効き、`ownLifeDamageCap…` は相手のスピリット限定。差は `side` だけ（効果文「お互い」／「自分」） | `per:"spirit"` に `side` を足せば同じ型になる |
| `negateLifeDamageFromTarget`（個体を指定） | **対象の取り方が違う**（アクションで相手の1体を選び、その個体に記録する）。止め方は同じ `noLifeDamage`/`lifeCap`＝ここでいう「max:0」「per:spirit の max:cap」 | 当面残す。次の段階で、timedEffect の content に共通の定義を置き、対象を「選んだ相手スピリット1体＝アタッカー」にする（`lifeDamageNegatedFor` の写し2つを消せる） |
| `ownLifeFloor` の costSelfToTrash 版 | **ルール上の違い**：減る前に防ぐのでなく、0になる瞬間に任意コストを払って避ける（確認を出す。BS14_PLAN 09-12 ユーザー確認、COST_MODEL §9） | まとめない。下限1の無条件版だけ `floor` に統合 |

### まとめ方の案

新しい概念ファイル `server/src/types/lifeGuard.ts`（定義）と `shared/rules/lifeGuard.ts`（判定）を作る（設計の2原則の2。`constraints.ts` は 1599 行、`globalConstraint.ts` は 33KB で、足すと戻る）。

```ts
// ライフを守る制約。GlobalConstraintDef と PlayerRuleDef の両方に type:"lifeGuard" として入る
export type LifeGuardDef = {
    type: "lifeGuard"
    side?: "own" | "opponent"            // globalConstraint のときだけ。省略＝両陣営。playerRule は timedEffect.side
    from?: "attack" | "effect"           // 止める原因。省略＝すべて
    attacker?: TargetFilter              // from が attack/省略のとき、アタッカー（効果なら発生源スピリット）の絞り込み
    effectSource?: { types?: CardType[]; opponentOnly?: true } // from が effect/省略のとき、発生源の種別
    max?: number                         // 1回に（per:"attack"）／ターン累計で（per:"spirit"）減る量の上限。0＝減らない
    per?: "attack" | "spirit"            // max の数え方。省略＝"attack"
    floor?: number                       // この値を下回らない（0にならない＝1）
}
```

旧→新：

| 旧 | 新 |
| :-- | :-- |
| `noLifeDamageByCost{maxCost:n}` | `lifeGuard{from:"attack", attacker:{cost:{max:n}}, max:0}`（side 省略＝両陣営） |
| `…{costs}` / `{maxBp}` / `{symbolCount,combinedOnly}` / `{symbolCount}` / `{attackerLevel}` / `{attackerCores}` / `{keywordExclude}` | `attacker:{cost:{in}}` / `{maxBp}` / `{symbolCount,combined:true}` / `{symbolCount}` / `{level:[n]}` / `{cores:n}` / `{keywordExclude}`（BS13-070 は `cost.max`＋`level` の AND） |
| `ownOnly:true` | `side:"own"` |
| `noLifeDamageByCostForPid`（playerRule） | 同じ `lifeGuard` を playerRule に入れる（side は timedEffect.side）。`cores` ＝`attacker.cores` |
| `lifeFloorForPid{floor,byAttackMinCost,byEffectSourceTypes}` | `lifeGuard{floor}`。「コスト4以上のアタック **または** 相手のスピリット/マジックの効果」の **OR** は、`lifeGuard` を2つ並べて表す（1つにすると AND になるため。`content` は配列なので並べられる）：`{from:"attack",attacker:{cost:{min:4}},floor:1}`＋`{from:"effect",effectSource:{types:["spirit","magic"],opponentOnly:true},floor:1}` |
| `ownLifeFloor{floor}`（costSelfToTrash なし） | `lifeGuard{side:"own", floor}`＋エントリの `condition` |
| `lifeDamageMaxForPid{max}` | `lifeGuard{from:"attack", max, per:"attack"}`（playerRule）。※効果文は「ブロックされなかった相手のスピリットのアタックでは」。いまの実装は `lifeDamageLimit`（ブロックされなかったアタックだけ）が見るので結果は同じ |
| `lifeDamagePerSpiritPerTurn{max,minSymbols}` | `lifeGuard{max, per:"spirit", attacker:{minSymbols}}`（side 省略＝両陣営）。**ただし効果の発生源のスピリットにも掛かる**ので、`attacker` の名前を「減らすスピリット」と読み替える（`effectSource` でなく `attacker` に統一するか要確認。下の「危ない所」） |
| `ownLifeDamageCapPerSourcePerTurn{max,minSymbols}` | 同上＋`side:"own"`＋`effectSource:{opponentOnly:true}`（相手のスピリット限定） |
| `lifeImmuneForPid` | `lifeGuard{max:0}`（原因・絞りなし） |
| `ownLifeImmuneToSpiritEffects` | `lifeGuard{side:"own", from:"effect", effectSource:{types:["spirit"],opponentOnly:true}, max:0}` |

まとめない／後回し：`ownLifeFloor{costSelfToTrash,then}`（BS14-084。任意コストの置き換え）／`negateLifeDamageFromTarget`（5枚。個体指定。第2段階で共通定義を content に載せる）。`cantReduceOpponentLifeWhileSelfRefreshed`（BS11-X06。範囲外。守る側でなく**減らす側**の制約で向きが逆）も残す。

評価：データは枚数で 17＋2＋2＋2＋1＋7＋3＋1＋1＝**36件**の書き換え（`negateLifeDamage…` の5件は別）。型は 9 → 1（`lifeGuard`）に減る。判定関数は `noLifeDamageByCost`・`lifeProtectedByCostThisTurn`・`ownLifeFloorContinuous`・`ownLifeDamageCapRemaining`・`lifeDamagePerSpiritRemaining`・`ownLifeImmuneToOpponentSpiritEffects`・`lifeImmuneThisTurn` の 7 本が 1 本の「該当する `lifeGuard` を集める」＋ `lifeDamageLimit`/`lifeLossAllowed` に畳める。

### 挙動が変わる所・危ない所

1. **`noLifeDamageByCost` の軸の排他が消える**。いまは `attackerCores`／`symbolCount(+combinedOnly)`／`costs`／`maxCost` が `if…return/continue` の順で**排他**（先に当たった軸だけを見る）。`TargetFilter` は全部 AND。データ上、複数軸を併用するのは BS13-070（maxCost＋attackerLevel。いまも AND）だけで、ほかは1軸なので既存カードの結果は変わらない。ただし**将来**の併用の意味が「いまは無視される軸がある」から「AND」に変わる点をコメントに残す。
2. **`symbolCount` の数え方**（`instanceSymbolCount`＝合体しているブレイヴのシンボルも数える）と `TargetFilter.symbolCount` は同じと明記されている（targetFilter.ts:33）。`combined`・`level`・`cores` も同様に突き合わせ済みだが、**`keywordExclude` の判定に使う持ち主の引き方**（いまは `attacker` が p1 の場にいるかで決める）を `matchesTarget` の `ownerPid` 引数へ渡す形に直す必要がある（取り違えると付与キーワードを見誤る）。
3. **`lifeFloorForPid` の OR を AND にしない**こと。上のとおり2つの `lifeGuard` に分ける。1つに書くと BS11-080 が「コスト4以上のスピリットの効果」だけになり変わる。`BS22-080`（spirit のみ）は `types:["spirit"]`。
4. `lifeDamagePerSpiritPerTurn` は**効果の発生源のスピリット**にも掛かる（`lifeLossAllowed` の `spirit = sourceInstance がスピリット`）。`ownLifeDamageCap…` は `actorPid !== pid`（相手のスピリット）だけ。統合しても同じに保つ：`side:"own"` 側は `opponentOnly` を暗黙にするか、明示軸にするかを実装前に決める（暗黙にするとデータ上の差が見えなくなる）。
5. **BS13-027-e2（ownLifeImmuneToSpiritEffects）に `phaseTurn`/`phase`・`turn` が無い**。効果文は Lv2『相手のアタックステップ』。いまは常時（自分のターンに相手スピリットの効果が自分のライフを減らす場面は稀）。統合時に `phaseTurn:{phase:"attack",turn:"opponent"}` を足すべきかを確認（効果文との食い違い。memory「効果文との明らかな食い違い」に当たる可能性が高い）。統合のついでに直すと PR に書く必要がある。
6. `BS14-110 e3`（maxなし attackerLevel1）はマジックが `lendSelfThisTurn` で貸す形。`lifeGuard` を globalConstraint に置いても貸与経路は同じなので変わらない。
7. 手順書の記録：`docs/design/BS14_PLAN.md:14`（永久凍土の王都：下限1で止める。2026-09-12 ユーザー確認）・`EFFECT_GATE.md §4 の 4`（原因を問わない扱い。10-30 ユーザー確認）・`ACTION_DECOMPOSITION.md:394,406,425,426`（`protectLifeByCostThisTurn` 等を `globalConstraint` の同名型の片側版と書いている＝**手順書の側が既に「同じもの」と見ていた**）。BS18_SURVEY は `attackerCores` を新軸としてわざわざ `noLifeDamageByCost` に足した（#13）。`TargetFilter.cores` が既にあるので足す必要はなかった＝軸の複製の一例。

---

## ④ 回復できない

### 現状

| 型 | 入口 | 枚数 | 意味 | 判定の場所 | 使っているカード |
| :-- | :-- | --: | :-- | :-- | :-- |
| `noRefreshByAnyEffect` | globalConstraint（`side`・エントリの phase/turn） | 3 | **効果による**回復は種別を問わず止める（リフレッシュステップは通る） | `refreshBlockedByRule()`（`constraints.ts:421`）←`refreshSpirit`（`sourceType` が渡るときだけ） | BS15-072 渦巻く大海峡（両陣営）／BS19-110 ディバインフィールド（マジック・両陣営）／BS21-041 アドペンタン＆チャール Lv2（相手側・相手のアタックステップ） |
| `noRefreshByNexusOrMagic` | globalConstraint（phase/turn） | 2 | **ネクサス/マジックの効果による**回復だけ止める（スピリットの効果とリフレッシュステップは通る。両陣営） | `exhaust.ts:13` `noRefreshByNexusOrMagicActive()`（**`refreshBlockedByRule` を通っていない別走査**。phase/turn の見方を複製） | BS09-047 サンゴジョー／BS16-072 二つの川に挟まれた王国（お互いのアタックステップ） |
| `noSpiritRefresh` | playerRule（バトルの間・相手） | 1 | **効果による**回復は止める（このバトルの間、相手のスピリットすべて） | `refreshBlockedByRule()` の末尾（timedPlayerRules） | BS21-048 リュウグウウシ |
| `nexusesCantRefresh` | globalConstraint（BS11-X04 の Lv1〜3） | 1 | **リフレッシュステップで**ネクサスが回復しない（両陣営） | `refreshRestrictionsFor()`→`PhaseManager.ts:~196` | BS11-X04 アクア・エリシオン |
| `opponentCombinedCantRefresh` | globalConstraint（`whileCombined`） | 1 | **リフレッシュステップで**発生源の相手の合体スピリットが回復しない | 同上 | BS11-X04（Lv3） |
| `noRefresh` | `kind:"constraint"`（発生源自身） | 1 | このスピリット自身は**リフレッシュステップで**回復しない | `PhaseManager.ts:188`（`activeConstraints`） | BS02-042 スクルディア Lv1-2 |
| `skipRefresh` | timedEffect content（寿命 `nextRefresh`。対象は個体か all＝ルール） | 3 | **次のリフレッシュステップで**回復しない | `PhaseManager.ts:191` | BS11-055 ジャノメ・シールダー／BS17-X04 ラグナ・フェンリル（all）／BS18-033 アウトロー・キッド（2体） |
| `markNoRefreshTarget` | アクション（発生源に印） | 1 | 指定した相手スピリットが、**発生源が疲労状態で場にいる間**回復できない（ステップも効果も） | `isRefreshBlockedByMark()`（`exhaust.ts:296`）←`refreshSpirit` | BS02-042 スクルディア Lv2-3 |

（関連で範囲外：`refreshOnlyOneUncombined`＝「合体していないスピリットは1体しか回復できない」は**数の制限＋選択**でルールが別。`noRefreshUntilOwnEndSteps`＝BS12-078 カシオペアシールが付ける個体の印で、ステップも効果も止める＝上のどれにも当たらない期間。`pendingDestruction`＝破壊待機は回復できない（TIMING_CHART §1.5）。いずれも `refreshSpirit` の冒頭にある。）

### 違いの整理

| 違い | ルール上の違いか（根拠） | まとめた後の表し方 |
| :-- | :-- | :-- |
| 止める回復の経路（リフレッシュステップ／効果／両方） | **効果文が言い分けている**（BS15-072「リフレッシュステップ以外で回復できない」／BS11-X04「リフレッシュステップ」／BS02-042 の指定は場面を限らない＝10-30 に両方止めると直した）。軸としては必要 | `by?: "step" \| "effect"`（省略＝両方）。`effect` のときは `effectSource?: { types?: CardType[] }` |
| 効果の発生源種別（全部／ネクサス・マジックだけ） | 効果文が言い分けている（BS09-047 は「ネクサス/マジックの効果で」）。**軸の値の違い** | `effectSource:{types:["nexus","magic"]}`。`noRefreshByAnyEffect`＝types なし |
| 誰が回復しないか（陣営・ネクサス・合体・個体） | 書き方の違い。`side`（発生源の持ち主から見て）＋対象の絞り込み | `side?: "own"\|"opponent"`、`target?: TargetFilter`（`combined:true`／`uncombined`）、`cardType?: "nexus"`（TargetFilter はスピリット前提で、ネクサスを選ぶ軸が無い。ACTION_UNIFY_PLAN の PR 5 でも同じ指摘） |
| 期間（継続／このバトル／次のリフレッシュステップ／発生源が疲労状態の間） | **入口の違い**。継続＝globalConstraint、期間つき＝playerRule/timedEffect（`battle`・`nextRefresh`）。寿命「発生源が疲労状態で場にいる間」だけは既存の期間の一覧に当たらない（ACTION_UNIFY_PLAN PR 5 の C 判定＝10-30 ユーザー了承） | globalConstraint ＋ timedEffect content に同じ定義（上の共通前提）。`markNoRefreshTarget` は残す |
| リフレッシュステップ側の判定の置き場所（PhaseManager）と効果側の置き場所（`refreshSpirit`） | **実装の理由**。EFFECT_GATE §5e が「次のリフレッシュステップで」の記録をそのステップで使い切る作りのため、と書いている。ルールの違いではない | `refreshSpirit` に「どの経路か」を渡して1か所で聞く（下記）。PhaseManager のループも `refreshSpirit(...,undefined,true)` を呼んでいるので経路は既に通っている |
| `noRefresh`（発生源自身）／`skipRefresh`（記録） | 書き方の違い。前者は対象が `self` の `globalConstraint`、後者は timedEffect の `nextRefresh` | `noRefresh` は新型の `target:{…}`＋`side:"own"` ではなく 1枚のみ。**まとめる得が薄いので当面残す**（BS02-042 の Lv1-2 が自分の1個体） |

### まとめ方の案

```ts
// 回復の禁止。GlobalConstraintDef と TimedContent の両方に type:"cantRefresh" として入る
export type CantRefreshDef = {
    type: "cantRefresh"
    side?: "own" | "opponent"                 // globalConstraint のとき。発生源の持ち主から見た陣営。省略＝両陣営
    cardType?: "spirit" | "nexus"             // 省略＝スピリット
    target?: TargetFilter                     // combined:true など
    by?: "step" | "effect"                    // 止める回復。省略＝両方
    effectSource?: { types?: CardType[] }     // by が effect/省略のとき。省略＝すべての効果
}
```

旧→新：

| 旧 | 新 |
| :-- | :-- |
| `noRefreshByAnyEffect{side}` | `cantRefresh{by:"effect", side}`（phase/turn はエントリのまま） |
| `noRefreshByNexusOrMagic` | `cantRefresh{by:"effect", effectSource:{types:["nexus","magic"]}}` |
| `noSpiritRefresh`（playerRule・battle） | timedEffect content `cantRefresh{by:"effect"}`（duration battle、side opponent） |
| `nexusesCantRefresh` | `cantRefresh{by:"step", cardType:"nexus"}` |
| `opponentCombinedCantRefresh` | `cantRefresh{by:"step", side:"opponent", target:{combined:true}}` |
| `skipRefresh`（nextRefresh） | timedEffect content `cantRefresh{by:"step"}`（duration nextRefresh のまま。個体・all の対象は既存の timedEffect の対象指定） |
| `noRefresh`（BS02-042 自身） | 当面残す（1枚）。`constraint` に `cantRefresh{by:"step"}` を置く形に寄せることはできる |
| `markNoRefreshTarget` | **残す**（寿命が「発生源が疲労状態の間」で既存の期間に当たらない） |
| `refreshOnlyOneUncombined` | **まとめない**（数の制限と選択） |

判定：`refreshSpirit(state, ownerPid, inst, sourceType?, …)` で「経路＝ステップか効果か（sourceType の有無）」「発生源種別」を渡し、`refreshBlockedByRule` を `cantRefresh` の集計1本にする。`noRefreshByNexusOrMagicActive`（exhaust.ts）は消す。PhaseManager の `limits.nexuses`・`limits.combined` も同じ集計に置き換えると `refreshRestrictionsFor` から `nexuses`・`combined` が消える。

枚数：3＋2＋1＋1＋1＋3＝**11件**の書き換え（`noRefresh`・`markNoRefreshTarget` は残す）。型は 8 のうち 6 が 1 つに。

### 挙動が変わる所・危ない所

1. **`refreshBlockedByRule` は「効果による回復」にだけ使っている**（`sourceType !== undefined`）。リフレッシュステップを止める側（`nexusesCantRefresh`・`opponentCombinedCantRefresh`）は `PhaseManager` が別に見る。統合で `by:"step"` をどこで聞くかを決めないと、**ステップでも効果でも止まる**ものと**ステップだけ止まる**ものが混ざる。BS11-X04 の「お互いのリフレッシュステップ」は `by:"step"` を明示する。
2. **`refreshSpirit` はネクサスにも呼ばれる**（PhaseManager が `field.nexuses` に対して呼ぶ。`nexusesCantRefresh` がその証拠）。いまの `noRefreshByAnyEffect` は `refreshBlockedByRule` が `inst` の種別を見ないので、効果によるネクサスの回復（EFFECT_GATE §5e「入れないもの」で未配線）が将来入ると**スピリット限定の効果文**まで止める。`cardType` 軸でスピリット既定にして防ぐ。
3. **`markNoRefreshTarget` の簡略化**（対象は実効BP最大の1体を自動選択。BS02-042 Lv2-3）は統一と無関係に残る。手順書に書かれた簡略化なので触らない。
4. 記録：`EFFECT_GATE.md §4`（回復の行に5型を並べている）・`§5e`（10-30。実装の理由で step 側を PhaseManager に残した）・`ACTION_UNIFY_PLAN.md` PR 5（`markNoRefreshTarget` は C 判定で残す、10-30 ユーザー了承）。**BS21 で `refreshBlockedByRule` に寄せたのは `noRefreshByAnyEffect`＋`noSpiritRefresh` の2つだけ**。`noRefreshByNexusOrMagic` は `exhaust.ts` に独立した走査（`noRefreshByNexusOrMagicActive`）が残っている（作業の指示文は「寄せた」だが、実コードでは未完）。
5. データの出現は BS21 が最も新しく（BS21-041・BS21-048 ＝ 2 件）、今後も回復禁止は出る見込み（BS15・16・19・21 と各弾に1〜2枚）。1型に畳むと、次に来る「相手のスピリットは次のターンのリフレッシュステップで…」などを新しい型なしで書ける。

---

## ⑤ 手札／デッキに戻らない

### 現状

| 型 | 入口 | 枚数 | 意味 | 判定の場所 | 使っているカード |
| :-- | :-- | --: | :-- | :-- | :-- |
| `noBounceByEffect` | globalConstraint（`filter?:"hasSummonTrigger"`） | 2 | **効果による**戻しを、手札・デッキとも止める（両陣営。コスト・ルール由来は通る）。filter 付きは戻される側が召喚時効果持ちのときだけ | `bounceGate.ts:18` `bounceDenial()`（`state.currentEffectSource` が立っているときだけ） | BS19-099 フレイムフィールド（フィールドに置くマジック）／BS22-016 魔剣使プリシラ |
| `allSpiritsCantBounce` | globalConstraint（phase/turn） | 1 | **原因を問わず**スピリットが手札に戻らない（デッキへ戻すのは止めない。両陣営） | `bounceGate.ts:33` `allSpiritsCantBounceActive()`（phase/turn を専用に走査） | BS16-012 金狐角（自分のアタックステップ） |
| `bounceToDeckTopForPid` | playerRule（ターン・自分） | 1 | **止めない**。自分の効果で手札に戻るスピリットを、手札の代わりにデッキの上へ置く（行き先の置き換え） | `removal.ts:1330` | BS13-079 ヴァニシングデイ |

（隣：`immunityGrant{against:"bounce"}`＝`hasBounceImmunity`（個体の「相手の効果では手札に戻らない」。`sourceTypes`・`toDeck`）は 同じ `bounceDenial` の中。範囲外。）

### 違いの整理

| 違い | ルール上の違いか（根拠） | まとめた後の表し方 |
| :-- | :-- | :-- |
| 止める原因（効果のみ／すべて） | **効果文が言い分けている**：BS19-099「お互いの効果で…戻らず」／BS16-012「フィールドから手札に戻らない」（原因の限定なし）。軸が要る | `by?: "effect"`（省略＝すべての原因。コストで戻す候補・ルール由来も止める） |
| 行き先（手札のみ／手札とデッキ） | **効果文が言い分けている**：BS16-012「手札に戻らない」／BS19-099・BS22-016「手札/デッキに戻らない」。EFFECT_GATE §5f（10-30）で「手札に戻らない」はデッキを止めないと決めた。軸が要る | `to?: ("hand" \| "deck")[]`（`allSpiritsCantBounce` の既定＝`["hand"]`） |
| 戻される側の絞り込み（召喚時効果持ち） | 書き方の違い。`TargetFilter.hasTrigger:"onSummon"` が既にある | `target?: TargetFilter`（`{hasTrigger:"onSummon"}`）。`filter:"hasSummonTrigger"` は消える |
| 時間帯（ステップ・ターン） | 書き方の違い。エントリの `phase`/`turn` | 既存どおり。ただし `hasGlobalConstraint` は phase/turn を見ないので、**`noBounceByEffect` に phase/turn を付けても効かない**（金狐角が専用走査にした理由。いまの `noBounceByEffect` 2枚は常時なので影響なし） |
| `bounceToDeckTopForPid` | **ルール上の違い**：止めるのでなく行き先を変える（置き換え）。`bounceDenial` を通らず `removal.ts` の行き先決めで見る | **まとめない** |

### まとめ方の案

```ts
// 戻らない。GlobalConstraintDef の1型（常時の2枚と1枚だけ。ForPid の期間版は現状カードが無いので足さない）
export type CantBounceDef = {
    type: "cantBounce"
    by?: "effect"                      // 省略＝原因を問わない（コストで戻すのも止める）
    to?: ("hand" | "deck")[]           // 省略＝["hand"]
    target?: TargetFilter              // 戻される側の絞り込み
}
```

旧→新：`allSpiritsCantBounce` → `cantBounce{}`（to 省略＝手札のみ）／`noBounceByEffect` → `cantBounce{by:"effect", to:["hand","deck"]}`／`noBounceByEffect{filter:"hasSummonTrigger"}` → `cantBounce{by:"effect", to:["hand","deck"], target:{hasTrigger:"onSummon"}}`。`bounceDenial` の中は2か所の走査が1か所になり、`allSpiritsCantBounceActive`（専用走査）は phase/turn を見るのでそのまま `cantBounce` の走査に引き継ぐ（`noBounceByEffect` 側も `entryActive` 経由で phase/turn が効くようになる）。

枚数：2＋1＝**3件**の書き換え。型は 2 → 1。**得は小さい**（3枚）が、手順書で「戻す」の禁止の入口を `bounceGate.ts` に集めた作業（#332）の続きで、axis が2つ（`by`・`to`）だけと単純。

### 挙動が変わる所・危ない所

1. **BS22-016（魔剣使プリシラ）の効果文は原因を限定していない**（「召喚時効果を持つスピリットすべては、フィールドから手札/デッキに戻らない」）のに、実装は `noBounceByEffect`＝**効果による戻しだけ**を止める。BS16-012（原因を問わない）と文の形が同じ。統合時に `by` の値を文面どおり（省略＝すべて）にすると、`BS13-027` のような「このスピリットを手札に戻すことで」のコストで召喚時効果持ちが戻れなくなる。**これは効果文との食い違いの疑い**。記録上、BS22 のデータは今回（BS22 取り込み）で入ったばかりで、10-30 の §5f にも BS22-016 は出てこない。「コストで戻す候補は止められる個体を外す」（EFFECT_GATE §5f）の延長なので、直すなら PR に挙動の変化を書く（memory「効果文との明らかな食い違い」に当たるかの確認が要る。**ユーザー確認の候補**）。
2. **BS19-099** は「お互いの効果で」と書いてあるので `by:"effect"` は正しい。ただし `currentEffectSource` が立っていない戻し（バーストの【バースト転召】由来など）は通る既存の扱いのまま。
3. **「コストで戻す」ときの止め方**：金狐角（`by` 省略）は現状でもコストで戻す候補を外す（EFFECT_GATE §5f）。`noBounceByEffect` 系は `currentEffectSource` の有無で見ているので、コスト経路は通る。統合して `by` 省略／`effect` で分ける限り、この区別は保たれる。
4. 記録：`EFFECT_GATE.md §5f`（10-30。#332。「手札に戻らない」はデッキを止めない／戻すはすべて `markBounce` を通る）。`docs/design/*.md` に `noBounceByEffect`・`allSpiritsCantBounce` の個別記録は EFFECT_GATE 以外に無い（grep 済み）。

---

## 優先度と次の一手（調査役の見立て）

| グループ | 判定 | 得 | 先に決めること |
| :-- | :-- | :-- | :-- |
| ③ ライフ | **一部残す**（`ownLifeFloor{costSelfToTrash}`・`negateLifeDamageFromTarget`・`cantReduceOpponentLife…` を残し、9型→`lifeGuard` 1型） | 大（型9→1、判定関数7→1、36件） | ① `side` を `ownOnly`／`own…` 接頭辞の置き換えにしてよいか（名前は既存）② `lifeFloorForPid` の OR は `lifeGuard` を2つ並べて表す形でよいか ③ BS13-027-e2 の時間帯欠落を直すか |
| ④ 回復 | **一部残す**（`markNoRefreshTarget`・`noRefresh`・`refreshOnlyOneUncombined` を残し、6型→`cantRefresh`） | 中（11件。`noRefreshByNexusOrMagic` の別走査が消える） | `refreshSpirit` に経路（ステップ／効果）をどう渡すか（EFFECT_GATE §5e の「ステップ側は PhaseManager に残す」を改める＝設計判断） |
| ⑤ 戻らない | **まとめられる**（`bounceToDeckTopForPid` はまとめない）。2型→`cantBounce` | 小（3件） | BS22-016 を文面どおり原因なしにするか（挙動が変わる＝ユーザー確認） |
