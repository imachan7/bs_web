# コア統合の調査：「コアを置く」系＋ライフ系 21種

R3コア統合の前提調査。担当21種のハンドラ本体（`server/src/logic/actions/cores.ts`）を実際に読んで、
挙動・選ぶ人・自動選択順・置けない効果の扱いを確定させる。正解・スキーマは決めない。

## §0 共通関数のメモ

- `placeCoresOnSpirit(state, inst, baseCount, ownerPid)`（`EffectModules.ts:744-761`）：
  対象個体へ `baseCount` を足し、`coreBonusFor(inst)`（同ファイル `:702-710`。グラーバ等の `kind:"coreBonus"` を現在Lvで加算）ぶんを追加で足し、
  最後に `checkExhaustOnCoreChange(state, ownerPid, inst, { viaEffect: true, isRemoval: false })`（`state/exhaust.ts`）を呼ぶ。
  この最後の呼び出しが「効果でコアが置かれたとき」系の誘発判定（BS05アブソーブシンボル等）を担う。
  **21種のうち、対象スピリット／ネクサスへ直接置くものは全部これを通る**（voidCoreToSelf/Other/AllOwnByFamily/OwnNexuses/Target/OwnByKeyword/ToNexusLevel、trashCoresToSpirit/KeywordSpirit、coreCharge、destructionCoresToOwnSpirit）。
- `voidCorePlacementBlocked(state)`（`EffectModules.ts:775-778`）：`state.phase !== "core"` かつ `globalConstraint "voidCoreBlockedOutsideCoreStep"`（BS10-056）が立っていれば true。
  **ボイド→フィールド／リザーブの経路だけ**を止める（ボイド→ライフ・ボイド→トラッシュは対象外、コメントに明記）。
  呼ぶもの：coreGain, voidCoreToSelf, voidCoreToOther, voidCoreToAllOwnByFamily, voidCoreToOwnNexuses, voidCoreToTarget, voidCoreToOwnByKeyword, voidCoresToNexusLevel。
  呼ばないもの：voidCoreToDeckSide, voidCoreToReserve, voidCoreToOwnTrash, lifeCharge（from:"void"）— この3つは行き先がリザーブ／トラッシュ／ライフなので対象外という設計（§2参照、ただしvoidCoreToReserveは要確認）。
- `voidCoreToOwnTrash(state, ownerPid, count)`（`EffectModules.ts:765-767`）：`trashCores += count` だけ。`checkExhaustOnCoreChange` は呼ばない（除去処理ではないため）。
- `pickBpBuffTarget(state, owner, targetInstanceId, ...)`（`targeting.ts:262-` )：coreCharge だけが使う。`targetInstanceId` 優先→バトル中は攻撃/防御側優先→自分フィールド先頭、の順（他の20種は自前の候補フィルタ＋独自の自動選択ロジックを持ち、これを使わない）。
- `countedAmount(...)`（`counted.ts:18`）：coreGain・voidCoreToSelf・lifeCharge(from:"void") の `countCounter` 軸が使う共通の「1体につき」計算。
- `coreStepBonusFor`（`EffectModules.ts:717-738`）：コアステップの追加獲得量の集計で、21種の「置く」ハンドラ自体からは呼ばれない（PhaseManagerが別途参照）。今回のスコープ外。

## §1 1種類1行の表

| type | 使用枚数 | 取り元 | 置き先 | 量 | 選ぶ人 | 自動選択順 | 置けない効果／誘発 | ほかに何をするか | 根拠 |
|---|---|---|---|---|---|---|---|---|---|
| coreCharge | 1 | 自分リザーブ | 自分スピリット1体 | count（リザーブ残量に丸め） | 対象は`pickBpBuffTarget`任せ（対話選択なし） | バトル中攻守優先→自分先頭 | `placeCoresOnSpirit`経由 | なし | cores.ts:630-646 |
| coreGain | 46 | ボイド | 自分リザーブ（個体無し） | count／countCounter | 該当なし（置き先固定） | 該当なし | `voidCorePlacementBlocked`で全体不発 | `costDestroyOwnSpirit`任意コスト（犠牲対象は複数ならrequestChoice、自動は最小コスト） | cores.ts:655-713 |
| voidCoreToDeckSide | 1 | ボイド | 持ち主「デッキの横」（ゾーン外） | count | 該当なし | 該当なし | 未確認（voidCorePlacementBlockedを呼ばない） | エンドステップで1個ずつボイドへ戻す消費専用コア（コメントに明記） | cores.ts:720-726 |
| voidCoreToReserve | 8 | ボイド | 持ち主リザーブ | count | 該当なし | 該当なし | `voidCorePlacementBlocked`を**呼ばない**（コメントで意図的とあるが検証未確認） | なし | cores.ts:731-737 |
| trashCoresToReserve | 1 | 自分トラッシュ | 自分リザーブ | count（不足時は可能な分） | 該当なし | 該当なし | なし（ガード呼び出しなし） | なし | cores.ts:740-752 |
| voidCoreToSelf | 36 | ボイド | 発生源自身（self、ネクサスも可） | count／countCounter | selfのみ対象。`orReserve`時は使用者がself／リザーブを選ぶ（非対話はリザーブ） | 該当なし（self固定） | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | `costDiscardOwnBurst`コスト（バースト未セットなら不発） | cores.ts:754-818 |
| voidCoreToOther | 4 | ボイド | 自分スピリット（1体または`targets`体） | count（対象体ごとに固定count） | 選ばせない（常に自動） | 実効BP上位から重複なく`targets`体 | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | `excludeSelf`／`colorFilter`で候補を絞る | cores.ts:820-855 |
| trashCoresToSpirit | 5 | 自分トラッシュ | 自分スピリット1体 | count省略なら全部、不足時は可能な分 | 選ばせない（`targetInstanceId`があればそれ、無ければself→先頭） | フィールド先頭固定 | ガード呼び出しなし | `placeCoresOnSpirit`経由 | cores.ts:1152-1180 |
| trashCoresToKeywordSpirit | 1 | 自分トラッシュ全部 | 指定キーワード持ち自分スピリット1体 | トラッシュのコア全部 | 候補2体以上かつinteractiveなら`requestChoice`で使用者が選ぶ | 実効BP最大 | ガード呼び出しなし | `placeCoresOnSpirit`経由 | cores.ts:1182-1223 |
| reclaimTrashCores | 2 | 自分トラッシュ全部 | 自分リザーブ | トラッシュのコア全部 | 該当なし | 該当なし | ガード呼び出しなし | なし（0のときログのみ） | cores.ts:1272-1284 |
| voidCoreToAllOwnByFamily | 2 | ボイド | 指定系統いずれか持ち自分スピリット**すべて** | 対象ごとにcount個 | 選ばせない（全員が対象） | 該当なし（全対象） | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | なし | cores.ts:1443-1465 |
| voidCoreToOwnNexuses | 5 | ボイド | 指定色（省略時は不問）の自分ネクサス（`single`なら1つ、既定はすべて） | 対象ごとにcount個 | `single`かつ候補2つ以上かつinteractiveなら`requestChoice`。既定（すべて）は選ばせない | `single`の自動選択はコア最少のネクサス | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | なし | cores.ts:1467-1515 |
| voidCoreToTarget | 12 | ボイド | 条件（familyFilter／colorFilter／excludeSelf）に合う自分スピリット1体 | count | 選ばせない（`targetInstanceId`未指定なら常に自動） | 実効BP最大 | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | なし | cores.ts:1517-1552 |
| destructionCoresToOwnSpirit | 2 | 破壊待機中selfのコア（無ければ持ち主リザーブへフォールバック） | 破壊待機中でない自分スピリットのうち実効BP最大1体 | selfが破壊直前に持っていたコア数全部 | **選ばせない**（常に自動、効果文は「指定する」＝本来プレイヤー選択のはず） | 実効BP最大 | ガード呼び出しなし | なし | cores.ts:1781-1823 |
| voidCoreToOwnByKeyword | 2 | ボイド | 指定キーワード（省略可）／`combinedFilter`（合体）を満たす自分スピリット**すべて** | 対象ごとにcount個 | 選ばせない（全員対象） | 該当なし（全対象） | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | なし | cores.ts:1825-1850 |
| voidCoreToOwnTrash | 1 | ボイド | 持ち主トラッシュ | count | 該当なし | 該当なし | `voidCorePlacementBlocked`を**呼ばない**（トラッシュは対象外、共通関数のコメントに明記） | `voidCoreToOwnTrash`共通関数経由（`checkExhaustOnCoreChange`は呼ばれない） | cores.ts:1852-1861 |
| selfCoreToOwnLife | 2 | selfの上のコア | 持ち主ライフ | count（不足時は可能な分） | 該当なし | 該当なし | ガード呼び出しなし | 維持コア割れなら`destroySpirit(..., "deplete")` | cores.ts:1865-1886 |
| fieldCoreToLife | 1 | 自分フィールド（ネクサス優先→スピリット） | 持ち主ライフ | count（1個ずつ複数個体から集める） | 選ばせない（自動のみ） | ネクサスはコア最多から、スピリットは実効BP最小から | ガード呼び出しなし | スピリットから取って維持コア割れなら`destroySpirit(..., "deplete")` | cores.ts:1891-1925 |
| lifeCharge | 39 | 既定：自分リザーブ／`from:"void"`：ボイド | 持ち主ライフ（`orReserve`時はライフかリザーブを使用者が選ぶ） | count／`upTo`（不足分のみ）／`countCounter`（`from:"void"`時のみ） | `orReserve`時は使用者が選ぶ（非対話はライフ側） | 該当なし | `from:"void"`時：`isEndStepLocked("lifeChargeFromVoidOrReserve")`と`hasGlobalConstraint("noVoidToLife")`（`voidCorePlacementBlocked`は**呼ばない**、別の専用ガード） | `costExhaustSelf`／`costMillSelfCount`コスト、`thenUnblockableByLevelThisBattle`後処理、【聖命】発火判定 | cores.ts:1927-2034 |
| voidCoresToNexusLevel | 1 | ボイド | 自分ネクサス1つ | 指定Lvに届く不足分だけ | 候補2つ以上かつinteractiveなら`requestChoice` | コア最少のネクサス | `voidCorePlacementBlocked`、`placeCoresOnSpirit`経由 | 既にそのLv以上／そのLvを持たないネクサスはno-op | cores.ts:2036-2080 |
| opponentLifeToReserve | 3 | 相手ライフ | 相手リザーブ | count（相手ライフ残量に丸め） | 該当なし | 該当なし | ガード呼び出しなし | なし（型定義コメントの「総量比較→coresDownToLimit委譲」は実装に無い。§2参照） | cores.ts:2352-2363 |

未確認セルは voidCoreToDeckSide の「置けない効果／誘発」の1つのみ（`voidCorePlacementBlocked`を呼んでいないのは確認できたが、他に専用のガードがあるかはこの範囲のコードからは判断できなかった）。

## §2 挙動の食い違い

1. **「1体を選んで置く」なのに、選ばせる型と選ばせない型が混在する。**
   trashCoresToKeywordSpirit（cores.ts:1206-1214、候補2体以上かつinteractiveなら`requestChoice`）・voidCoreToOwnNexusesの`single`（cores.ts:1489-1499）・voidCoresToNexusLevel（cores.ts:2053-2063）は、
   候補が複数あれば使用者に選ばせる。一方で voidCoreToTarget（cores.ts:1526-1538、12枚）・voidCoreToOther（cores.ts:833-846、4枚）・trashCoresToSpirit（cores.ts:1157-1161、5枚）・
   destructionCoresToOwnSpirit（cores.ts:1798-1806、2枚）は、対象が複数あっても常に自動選択（実効BP最大／最小）で、`state.interactiveTargets`を見ない。
   影響：22枚。特にBS01-X03キングタウロス大公（voidCoreToSelf内蔵の話とは別枠だが同じ「自分のスピリット1体の上に置く」文面のカード群）のような効果文は「スピリット1体の上に置く」としか書いておらず、
   印刷テキストだけでは選ぶ人が読み取れない。

2. **destructionCoresToOwnSpirit（2枚）は効果文が「指定する」なのに、実装は常に自動選択。**
   効果文：BS02-038盾精ラングリーズ「自分のスピリット1体を**指定する**。このスピリット上に置かれているコアは、リザーブではなく、指定したスピリット1体の上に置かれる」。
   実装：cores.ts:1798-1806で常に実効BP最大の1体を機械的に選び、`state.interactiveTargets`であっても選択肢を出さない（該当コードに`requestChoice`呼び出しなし）。
   コメントには「対象選択の決定的簡略化」と明記されているので意図的な簡略化と分かるが、他の20種と足並みが揃っていない。

3. **opponentLifeToReserve（3枚）の型定義コメントと実装が食い違う。**
   型定義（effectAction.ts:356）：「お互いのフィールド+リザーブ+トラッシュのコア合計を比べ、多かった方の持ち主が少ない方と同じ合計になるまでボイドへ置く（同数なら不発）。取り先はその持ち主が選ぶ（`coresDownToLimit`へ委譲）」。
   実装（cores.ts:2352-2363）：`opp`（発生源から見た相手）のライフから`action.count`個をそのままリザーブへ移すだけ。総量比較も`coresDownToLimit`への委譲も無い。
   実際の使用カード3枚（BS15-X01・BS16-057・P069）の効果文もすべて「相手のライフのコア1個を相手のリザーブに置く」で、単純な実装と一致している。型定義コメントは別の器（`coresDownToLimit`／`coreToVoidEqualizeByTotal`）の説明を貼り付けたまま残った可能性がある。

4. **ボイド出発点のガード（`voidCorePlacementBlocked`）を通る型と通らない型が、行き先だけでは説明できない形で混在する。**
   同じ「ボイド→自分の場（スピリット／ネクサス）」でも、coreGain（→リザーブ）は通り、voidCoreToDeckSide（→デッキの横）・voidCoreToReserve（→リザーブ、8枚）は通らない。
   voidCoreToOwnTrash・lifeChargeのfrom:"void"は「ライフ・トラッシュは対象外」という説明（EffectModules.ts:775-778のコメント）があるが、voidCoreToReserve（リザーブ行き）が対象外である理由はコード上に説明が無い（未確認のまま§1に記載）。
   影響：voidCoreToReserve 8枚・voidCoreToDeckSide 1枚。BS10-056（該当globalConstraintの発生源）と同時に使われた場合の挙動が型ごとに違う可能性がある。

## 最終報告用サマリ

| 項目 | 内容 |
|---|---|
| §1 行数 | 21行（うち未確認セルを含む行：1行＝voidCoreToDeckSide） |
| §2 項目数 | 4件 |
| 上位1 | 「1体に置く」型で選ばせる／選ばせないが混在（22枚） |
| 上位2 | destructionCoresToOwnSpirit：効果文「指定する」だが実装は常に自動（2枚、簡略化とコメント済み） |
| 上位3 | opponentLifeToReserve：型定義コメントが実装と不一致（3枚、コメントが別の器の説明の使い回しの疑い） |
| 相談事項 | なし（設計担当がスキーマを決める材料として提出） |

## §3 確定スキーマ `placeCores`（2026-09-26。#165〜#167 で実装・移行済み）

`{ type: "placeCores"; from: "void"|"reserve"|"trash"|"self"|"field"; to: "reserve"|"trash"|"life"|"spirit"|"nexus"|"deckSide"; target?: "self"|"one"|"all"; targets?: number; filter?: TargetFilter; count: number|"all"; countCounter?: EffectCounter; upTo?: number; upToLevel?: number; orReserve?: true }`

- すべて自分側。`target` は to が spirit／nexus のときだけ（既定 "one"＝候補2体以上なら使用者が選ぶ。AI・非対話はBP最大、ネクサスはコア最少）。`self`＝発生源の上、`field`＝自分のネクサス→スピリット（BP最小）の順に取る。
- ボイドから spirit／nexus／reserve へ置くときは `voidCorePlacementBlocked`（BS10-056）を見る。ライフへはライフ専用のガードと【聖命】。置いた先は `placeCoresOnSpirit` を通す。
- `targets`≥2 は1体ずつ選ばせ、選んだ個体は内部フィールド `excludeIds` で外す。`from: "self"`／`"field"` は removal.ts の `takeCoresFromSpirit`（保護・下限・消滅）を通す
- `target: "self"` は置き先の種別に関係なく発生源そのもの（ネクサスの誘発で召喚されたスピリットを指すことがある）
- 旧 type で残るもの：コスト付き4か所（coreGain・lifeCharge・voidCoreToSelf）、ブレイヴ自身に置く BS14-069、destructionCoresToOwnSpirit（破壊時のコアの行き先の置換）、opponentLifeToReserve（ライフ減少）。未対応：`orReserve` と `target: "one"` の組み合わせ
