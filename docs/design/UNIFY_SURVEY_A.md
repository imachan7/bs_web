# 統一調査メモ A（コア保護／デッキ破棄の禁止）

調査日 2026-11-07。コード・データは未変更。型の定義：`constraintDef.ts`（個体）／`globalConstraint.ts`（場全体）／`timedContent.ts`（期間つき・バトル）／`type.ts:322-323`（PlayerRule）。
判定の入口はコア＝`server/src/logic/coreGate.ts:coreRemovalAllowed`（原因 effect/cost/tensho/player を持つ、記録は EFFECT_GATE §4 5c・10-30）、デッキ＝`server/src/logic/zones/mill.ts:millBlockReason`。
手順書の前提：「取り除けない」は対象に取られることを防がず取り除く時点で止める／「〜できない」型は貫通される（EFFECT_GATE §2.5、10-29・10-30 ユーザー確認）。

---
## ① コアを取り除けない・動かせない

### 現状
| 型（置き場） | 枚数 | 意味 | 判定の場所 | カード |
| :-- | --: | :-- | :-- | :-- |
| coresCantBeRemoved（constraint＝個体） | 4 | このスピリットのコアは**誰の効果・操作・コストでも**取り除けない | `shared/rules/activation.ts:coresCantBeRemoved` → coreGate 冒頭 | BS10-X01, X007, BS13-005, BS20-007 |
| coresImmovableByOpponent（constraint／constraintGrant） | 2 | このスピリットのコアは**相手の効果**で取り除けない。`toReserveOnly`＝行き先がリザーブだけ止める | coreGate（cause=effect かつ actor≠持ち主） | BS22-021（自身）, BS22-020（constraintGrant ownAll cost≦5・toReserveOnly。Q4361） |
| coresCantBeRemovedByOpponent（globalConstraint） | 2 | 発生源の持ち主の、**名前に nameContains を含む**スピリットのコアを、**相手のスピリット/ブレイヴ/マジック**の効果で取り除けない | `activation.ts:coresCantBeRemovedByOpponent`、coreGate | BS12-022（太陽）, P035（月光） |
| coresCantBeRemovedAll（globalConstraint） | 2 | 場全体：side=opponent（発生源から見た相手のスピリット）／both。`exceptOwnerEffects`＝持ち主自身の**効果**は通す（支払い・移動は止まる）。【転召】は常に通す | `activation.ts:globalCoresCantBeRemoved`（phase/turn を自前で見る） | BS13-065 Lv2（opponent＋exceptOwnerEffects・相手のメイン限定）, BS13-X03 Lv3（both） |
| battlingCoresProtected（globalConstraint） | 1 | バトル中の両陣営スピリットのコアは**効果**で取り除けない（phase:attack, turn:own） | `removal.ts:isBattlingCoreProtected`（→ hasActiveGlobalConstraint） | BS05-060 |
| blockerCoresProtected（timedEffect content／target.kind:"battle"） | 2 | このバトルのブロッカーのコアは**効果**で取り除けない（アタック時＝ブロッカー未確定なので期間つきで置く） | `removal.ts:1803`（同じ関数 isBattlingCoreProtected の前半） | BS09-027 Lv2-3, BS09-X40 Lv2 |
| coreFloorByCost（globalConstraint） | 6枚・8エントリ | 量の制限：スピリット上のコアは Lv1 コスト（`floor` 指定時はその値）を下回らない。`ownOnly`／`byOpponentOnly`／`filter`。移動・入れ替えでも効く（08-24） | `removal.ts:coreFloorFor`→coreFloorByCostFor（`matchesTarget` で filter） | BS08-059, BS09-059, BS12-065, BS12-X03, BS16-039, BS21-025, BS22-079 |
| noCoreZeroOutsideEffect（globalConstraint） | 1 | **効果以外**（移動・コスト・【転召】）でスピリットのコアを0個にできない。効果は通る | coreGate 末尾（allowed を cores-1 で頭打ち） | BS19-103 |
| coresToOpponentReserveGoToTrash（globalConstraint） | 1 | 効果で相手のリザーブへ置かれるコアは相手のトラッシュへ**振り替え**（止めずに行き先を変える） | `shared/rules/constraints.ts:604`、removeCores の共通フック | BS12-X02 |

### 違いの整理
| 違い | ルール上の違いか（根拠） | まとめた後の表し方 |
| :-- | :-- | :-- |
| 対象が自身1体（constraint）／名前で絞る（ByOpponent）／相手すべて・両陣営すべて（All）／バトル中／ブロッカー | **書き方の違い**。対象の選び方だけ（TargetFilter・side・battle）。判定は全部「このコアを取り除く問い合わせ」に入る前の1行 | `scope`：個体なら constraint、場全体なら globalConstraint の `side`＋`filter`（TargetFilter。nameContains は `nameContains` 軸があるか確認要） |
| 誰の効果から：すべて／相手の効果のみ（ByOpponent・Immovable）／持ち主自身の効果だけ例外（exceptOwnerEffects） | **ルール上の違い**（cause と actor で結果が変わる。13_PLAN #15・#25、10-30）。ただし軸としては「`from`（誰の何から）」で全部書ける | `from: "any" \| "opponentEffect" \| "notOwnEffect"`。**cause（effect/cost/player/tensho）**を軸に持つ：`causes: ("effect"\|"cost"\|"player")[]`。【転召】は常に通す（BS13 #15） |
| 発生源の種別：spirit/brave/magic のみ（ByOpponent）／発生源の種別を問わない（Immovable・26RDB01-025）／ネクサス効果は対象外 | **ルール上の違い**（効果文の「相手のスピリット/ブレイヴ/マジックの効果で」に対応。ネクサスの効果で取り除くと通る） | `sourceTypes?: CardType[]`（millCap・silent と同名） |
| 行き先：リザーブ行きだけ（toReserveOnly） | **ルール上の違い**（Q4361。トラッシュ・ボイド行きとコア移動は通る） | `to?: "reserve"`（既存の coreRemove の `to`＝リザーブ／トラッシュ／ボイドの語彙） |
| いつ：常時／バトル中（battling）／このバトルのブロッカーだけ（blocker）／相手のメインだけ（065） | **書き方の違い**。期間は `phase`/`turn`（EffectDef 直下）か timedEffect の duration。blockerCoresProtected は「発生源がアタック時に、あとで確定するブロッカー」への期間つき付与なので**置き場（timed）が違う**が、判定の中身は battlingCoresProtected と同じ（バトル参加者＋効果によるコア除去） | 対象に `battle: "participants" \| "blocker"` を足す、または blocker 側は timedEffect＋constraintGrant相当に寄せる（下の案参照） |
| 量の制限（coreFloorByCost）と全面禁止 | **ルール上の違い**：禁止＝0個にしかならない／床＝「残りN個まで取り除ける」の**部分許可**を返す（coreGate は allowed を数で返す）。計算も ownerPid/actorPid/filter を使う。**ただし全面禁止は「床＝その時点のコア数」の特殊例**にもなる | 床と禁止は**まとめない**（`floor`系は残す）。禁止側だけ統合し、`floor` は別 type として残す |
| noCoreZeroOutsideEffect | **ルール上の違い**（原因が effect 以外に限る・床1固定・スピリットのみ）。他の型の `causes` 軸＋`floor:1` で書ける可能性はあるが、「効果以外」を止めるのは他に無い方向 | 禁止統合に入れず、床側の `floor` の仲間として `causes:["cost","player","tensho"]`＋`floor:1` に寄せる案はあるが、今は残す（1枚） |
| coresToOpponentReserveGoToTrash | **ルール上の違い**（止めずに**置き換え**。呼び出し点も removeCores の行き先フックで別） | まとめない（止め方が違う） |

### まとめ方の案
禁止系（上の表の 1〜5 行目）を `globalConstraint` の1 type にまとめる。個体付与（constraint／constraintGrant）は既存の置き場を使い、同じ type 名を使う。

```ts
// globalConstraint 側（GlobalConstraintDef）
| {
    type: "coresProtected"            // 旧 coresCantBeRemoved* / coresImmovableByOpponent / battlingCoresProtected / blockerCoresProtected
    side?: "own" | "opponent" | "both"     // 発生源から見てどちらのスピリットのコアか（既定 both）。既存 side と同名
    filter?: ResolvedTargetFilter           // 個体・名前・コスト等。nameContains は filter.nameContains があるか要確認（無ければ軸1つ足す）
    battle?: "participants" | "blocker"     // バトル中のスピリットだけ／このバトルのブロッカーだけ
    by?: "any" | "opponent"                 // 誰の効果・操作の取り除きを止めるか（opponent＝対象の持ち主の相手）
    exceptOwnerEffects?: true               // 持ち主自身の「効果」は通す（支払い・移動は止まる）。by:"any" と組む
    causes?: ("effect" | "cost" | "player")[]  // 止める原因。省略は全部（【転召】は常に通す）
    sourceTypes?: CardType[]                // 止める効果の発生源の種別（省略＝問わない）
    to?: "reserve"                          // 行き先がリザーブの取り除きだけ止める
}
```
constraint（個体）側の `coresCantBeRemoved`／`coresImmovableByOpponent` は、同じフィールドを持つ `{ type: "coresProtected"; by?; causes?; to? }`（side・filter・battle 無し＝「このスピリット」）として残す（constraintGrant の `target: ownAll`＋`filter` で、BS22-020 はそのまま書ける）。
判定は coreGate の `coreRemovalAllowed` に集めてあるので、変えるのは「どのエントリが今の取り除きに当たるか」の1関数（`coreProtectedBy(state, attempt)`）に統合する。

旧→新
| 旧 | 新 |
| :-- | :-- |
| constraint coresCantBeRemoved | constraint coresProtected{ by:"any" } |
| constraint coresImmovableByOpponent{toReserveOnly} | constraint coresProtected{ by:"opponent", causes:["effect"], to? } |
| globalConstraint coresCantBeRemovedByOpponent{nameContains} | coresProtected{ side:"own", filter:{nameContains}, by:"opponent", causes:["effect"], sourceTypes:["spirit","brave","magic"] } |
| coresCantBeRemovedAll{side:"opponent", exceptOwnerEffects} | coresProtected{ side:"opponent", by:"any", exceptOwnerEffects } |
| coresCantBeRemovedAll{side:"both"} | coresProtected{ side:"both", by:"any" } |
| battlingCoresProtected | coresProtected{ side:"both", battle:"participants", causes:["effect"] } |
| blockerCoresProtected | coresProtected{ battle:"blocker", causes:["effect"] }（timedEffect content に同名で置く） |

**まとめない**：coreFloorByCost（部分許可の数を返す。フィルタ・ownOnly・byOpponentOnly を持つ。名前が `ByCost` でなく `floor` 軸に整理するだけなら別PR）／noCoreZeroOutsideEffect（原因が effect 以外・1枚だけ。`causes` を持つ `floor` 側へ寄せるなら後）／coresToOpponentReserveGoToTrash（置き換えで止めない）。

### 挙動が変わる所・危ない所
- **`causes` の既定が割れている**：coresCantBeRemoved は cost/player まで止める。coresCantBeRemovedByOpponent・Immovable・battling・blocker は **cause=effect のみ**（coreGate の分岐）。既定を「全部」にすると後者の旧カードが変わるので、移行時に**各旧型の causes を明示的に書き出す**こと。
- **発生源の種別**：Immovable は発生源の種別を問わない（ネクサスの効果も止める）が、ByOpponent は spirit/brave/magic のみ（`sourceType===undefined`＝ルール処理は対象外）。`sourceTypes` を省略したとき undefined の発生源を通すか止めるかを実装前に決める。
- **battling**：旧型は **cause=effect の「効果」だけ**。コストの支払いや移動は止まらない。`causes:["effect"]` を忘れると、バトル中の支払いまで止まって BS05-060 が強くなる。
- **blocker**：判定が `timedBattleContents` を読む（`removal.ts:1803`）。timed のまま同じ type を使うなら、timedContent 側の列挙に新 type 名を足すだけで足りる。
- **pierce:"all"**（coreGate 冒頭）は全型の外側。統合しても変わらない。
- 旧3 type の `noteCoverage` 計測点は1つに集まる。coverage-baseline（data/coverage-baseline.json）と `coverage:check` を統合後に更新。
- UI 側（クライアント）の判定：coresCantBeRemoved 等はクライアントが `shared/rules` を読むが、起動能力ボタンは消えない既知の限界（EFFECT_GATE 5c）。統合で変わらない。
- ユーザー確認が要る点：**`by:"any"`／`"opponent"` と `causes` の2軸にしてよいか**（旧型は「誰の」と「何経由」が混ざって1つの type 名になっている）。ルールの解釈は変えない。

---
## ② デッキを破棄されない

### 現状
| 型（置き場） | 枚数 | 意味 | 判定の場所 | カード |
| :-- | --: | :-- | :-- | :-- |
| noDeckMill（globalConstraint） | 約26 | **両陣営**のデッキは常時（ステップ不問）・**自分の効果もコスト支払いも**破棄できない。【粉砕】は0枚で成立。オープン済みの手元カードを捨てる処理は止めない（10-23） | `mill.ts:millBlockReason`、`shared/cost.ts:337`、`funsai.ts:103` | BS18-002/003/005/013/015/025/031/050, BS19-007/018/020/029/035/038/046/052/092/100/110, BS20-029/042, BS22-012/014 |
| noDeckMillInMain（globalConstraint） | 1 | 上の「メインステップだけ」版（`state.phase==="main"`） | `mill.ts:128` | BS14-085 |
| noDeckMillByOpponent（globalConstraint） | 2 | **発生源の持ち主**のデッキだけ・**誰の効果でも**（旧い読みの名前。実際は byOpponent を見ていない＝10-30）。`whileSourceDeployedTurnOnly`＝発生源が場に出たターンだけ | `mill.ts:isDeckMillBlocked`（pid の effectSources だけ見る） | BS06-108（マジックの仮想発生源でこのターンの間）, BS08-064 |
| noDeckMillForPid（PlayerRule＝timedEffect playerRule） | 2 | このターンの間、そのプレイヤーのデッキは自分の効果も含めて破棄されない | `mill.ts:129`（timedPlayerRules） | BS17-070（Lv1-2 の「さらに」。fieldEvent→timedEffect 内に書いたものの内訳は `playerRule`）, PX10（同） |
| noDeckMillByOpponentForPid（PlayerRule） | 0（コード内のみ） | そのプレイヤーのデッキは**相手の効果**では破棄されない | `mill.ts:290`（isDeckMillBlocked 内の `byOpponent`）、書き込みは mill.ts:217（BS13-034 の無償召喚で付く） | BS13-034（`mill.ts:217` が `recordPlayerRule` で直接書く＝JSON には現れない） |
| millCap（globalConstraint） | 5枚・6エントリ | 破棄**枚数**の上限（`maxCount`・`perTurn`・`mutual`・`bothSides`・`sourceTypes`）。相手の効果のみ（mutual は誰の効果でも）。ターン累計を GameState（millCountThisTurn／Mutual／Brave）に持つ | `mill.ts:millCapFor/millCapPerTurnRemaining/mutualMillCapRemainingFor` → `millAllowed` | BS04-082, BS05-076, BS13-026, BS15-069, BS17-029 |

### 違いの整理
| 違い | ルール上の違いか | まとめた後の表し方 |
| :-- | :-- | :-- |
| 対象：両陣営／発生源の持ち主だけ | **書き方の違い**（効果文の「お互いの」か「自分の」か）。判定は `millBlockReason`＋`isDeckMillBlocked` の2段に割れているだけ | `side: "both" \| "own"`（発生源から見て。既存の side と同名） |
| 誰の効果・操作を止めるか：すべて（noDeckMill・InMain・ByOpponent の実際・ForPid）／相手の効果のみ（ByOpponentForPid） | **ルール上の違い**（効果文に「相手の効果では」があるか）。`byOpponent` を millAllowed が持っている（actorPid≠pid） | `by?: "any" \| "opponent"`（coresProtected と同じ軸名） |
| いつ：常時／メインステップだけ（InMain）／このターンの間（ForPid・BS06-108）／発生源が出たターンだけ（BS08-064） | **書き方の違い**。常時＝継続効果、メイン限定＝`phase:"main"`（EffectDef 直下にすでにある軸）、このターンの間＝timedEffect の `duration:"turn"`、「出たターンだけ」＝`whileSourceDeployedTurnOnly`（1枚のみ。軸としては「発生源のターン限定」） | `phase`（既存）。ForPid は timedEffect→playerRule で置く（同じ type 名を使える形にする） |
| 発生源：場に残る（globalConstraint）／場に残らないマジック等（ForPid・BS06-108 は仮想発生源で globalConstraint を貸す） | **置き場の違い**（「ForPid 系は場に残らない発生源の入口」）。BS06-108 だけ両方の入口があり、globalConstraint を `lendSelfThisTurn` 的に貸している＝既に1つの type で書けている | timed 側の playerRule（`noDeckMillForPid`）は、**同じ type 名を再利用**して `timedPlayerRules` で読む（下の案） |
| 枚数上限（millCap）／全面禁止 | **ルール上の違い**：millCap は「何枚まで許す」の**部分許可**と、ターン累計・誰の効果か・発生源種別の判定があり、`millAllowed` の別段階に入る。ただし `maxCount:0` で書けるかは「実装確認が要る」とある（BS18_SURVEY_yellow_blue §8 で未確認と記録） | **まとめない**（量の制限は別 type。coreFloor と同じ整理） |

noDeckMillByOpponent の名前：実装は byOpponent を見ない（誰の効果でも止める）。**名前が嘘**。統合の動機としては、まず名前を直す価値がある。

### まとめ方の案
```ts
// globalConstraint
| {
    type: "noDeckMill"
    side?: "both" | "own"                  // 既定 both。発生源の持ち主だけを守るなら own（旧 noDeckMillByOpponent）
    by?: "any" | "opponent"                // 既定 any。opponent＝相手の効果による破棄だけ止める（旧 ForPid 版の by 相当）
    whileSourceDeployedTurnOnly?: true      // 旧 noDeckMillByOpponent の1枚用の軸をそのまま持ち越す
  }
// メインステップ限定は EffectDef 直下の phase:"main" で書く（entry の phase を millBlockReason が読む形にする）

// PlayerRule（timedEffect の playerRule）
| { type: "noDeckMill"; by?: "any" | "opponent" }   // 旧 noDeckMillForPid / noDeckMillByOpponentForPid
```
旧→新
| 旧 | 新 |
| :-- | :-- |
| noDeckMill | noDeckMill（そのまま。side 既定 both） |
| noDeckMillInMain | noDeckMill ＋ エントリ直下 `phase:"main"` |
| noDeckMillByOpponent | noDeckMill{ side:"own", by:"any" }（BS08-064 は ＋ whileSourceDeployedTurnOnly。BS06-108 も同） |
| noDeckMillForPid | PlayerRule noDeckMill{ by:"any" } |
| noDeckMillByOpponentForPid | PlayerRule noDeckMill{ by:"opponent" } |

**まとめない**：millCap（部分許可＋ターン累計。上の表）。`maxCount:0` で全面禁止と書ける可能性があるが、`millAllowed` の段階と GameState の累計を使うので、全面禁止の置き場に入れる意味はなく、現状どおり別 type。

### 挙動が変わる所・危ない所
- **`phase` を hasGlobalConstraint が見ない**：コメントの通り（constraints.ts:410 付近）、`hasGlobalConstraint` はエントリ直下の phase／turn を見ない。noDeckMillInMain を `phase:"main"` に寄せるなら、mill.ts 側でその確認を足す（`refreshBlockedByRule` のように match 関数を渡す）。他の呼び出し点（`cost.ts:337` の canPayNexusCostByMill・funsai.ts:103）の phase の扱いも揃える。**cost.ts は Board（クライアント共有）を読むので、phase 条件を共有層で見る必要がある**。
- **`side:"own"` の判定**は `isDeckMillBlocked` が `pid` 自身の effectSources だけ見る形。統合しても 1 関数で書けるが、`both` と `own` を1本の走査にまとめるときは、両陣営の effectSources を回して `side` で絞る形に直す（`hasGlobalConstraint` の match 版）。
- `byOpponent` を持つ旧 ForPid 版は**今 `isDeckMillBlocked` 内でしか使っていない**＝`noDeckMillForPid` と別経路（mill.ts:129 と :290）。統合時に両方を見る箇所を1か所にし、**by の既定を any にした結果、旧 ByOpponentForPid が any になる事故**に注意（BS13-034 の mill.ts:217 は by:"opponent" を明示して書く）。
- **名前が嘘の旧 noDeckMillByOpponent**：移行で by:"any" と明示し、結果は変えない。BS06-108・BS08-064 の smoke がある（part番号は未調査）。
- クライアント：`canPayNexusCostByMill`（栄光の表彰台）が noDeckMill を直接読む。型名を変えなければ変わらない（noDeckMill は残す）。
- ユーザー確認が要る点：**InMain を phase に寄せてよいか**（「お互い、メインステップでデッキは破棄されない」＝BS14-085 の 1 枚だけのために軸を作らず、既存 phase で書ける。ルール上の違いなし）。

---
## 完了報告用の1行
- ① コアの禁止系：**一部残す**（coresCantBeRemoved／ByOpponent／All／Immovable／battling／blocker の6型を `coresProtected` 1型＋軸〔side・filter・battle・by・causes・sourceTypes・to・exceptOwnerEffects〕にまとめられる。coreFloorByCost・noCoreZeroOutsideEffect・coresToOpponentReserveGoToTrash は部分許可／原因逆向き／置き換えでルール上の処理が違うので残す）
- ② デッキ破棄の禁止：**一部残す**（noDeckMill／InMain／ByOpponent／ForPid／ByOpponentForPid を `noDeckMill`＋〔side・by・phase〕にまとめられる。millCap は部分許可＋ターン累計で別段階なので残す）
