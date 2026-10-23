# entryActive（エントリ単位の「いま発揮されるか」）調査メモ

2026-10-23 調査役。コードは未変更。呼び出しは `effectActiveAtLevel(` 185行（定義1を含む。38ファイル）。
分類は「囲む関数に effectSources 呼び出しがあるか」「署名に state/board があるか」の機械判定＋抜き読み。**行番号は着手時点（feat/entry-active）**。表の行番号は機械抽出なので、実装役は置換前に各所を目で見ること。

## 0. 先に押さえる事実

- **ネクサスの効果は `effectSources(board,pid)`（level.ts:203）を通る所では、ネクサス丸ごとだけが `nexusEffectsDisabledFor` で外される。** エントリ単位で止める入口は無い。
  042 の「Lv1 効果だけ止める」は、いまの `targetLevels:[1]`（＝ネクサスの**現在 Lv** が1のとき丸ごと止める）では **Lv2 のネクサスの Lv1 エントリを止められない**。これが part660 のコメントアウト場面。
- 新軸は effectSources で外してはいけない（丸ごと外すと Lv2 のエントリまで止まる）。**エントリを見る側（下の A 群）で止める**。
- `effectActiveOn(inst, effect, level)`（level.ts:119、31か所から呼ぶ。constraints 10・PhaseManager 2・activation 2 ほか）が既に「Lv＋【合体時】」の器。board を持たない。
  entryActive はこれの board 版として並べるのが自然（§4）。
- 誘発の入口 `fireTrigger`（triggers.ts:236）は `nexusEffectsStopped` で**ネクサス丸ごと**止める。ここもエントリ単位が要る（§3）。

## 1. 分類表（ファイル:件数 行番号）

A = entryActive に置換（ES = 囲む関数内で `effectSources` を回している＝board は手元にある。引数追加なし）
A+ = 署名に board が無く引数を足す（§2）。B = 置換しない。C = 判断がつかない。

| ファイル | 件 | A（ES） | A+ / B / C |
| :-- | --: | :-- | :-- |
| shared/rules/constraints.ts | 28 | 131,186,199,223,383,406,425,446,463,558,592,618,637,658,677,708,742,763,911,935,976,1095,1125,1144,1189,1345,1384 | C：1071（noOpponentTriggerByColor。stopper 側走査） |
| server/src/logic/EffectModules.ts | 21 | 348,443,534,567,584,608,671,689,716,732,762,790,868,905,929,1151,1458 | C：263,285（meisai。inst だけ）,890（coreBonusFor。inst だけ）,1251（bofu 数え） |
| server/src/logic/state/continuous.ts | 20 | 215,264,303,317,334,355,365,406,428,470,489,559,574,604,631,657,668,853,859 | B：703（rawLevel 版）。**全件が再計算ループ内**＝state は在る |
| shared/cost.ts | 12 | 32,96,199,224,255,316,365,461,565,600,729,751 | 全 A。199,316 は `field.nexuses` 直走査の疑い（§7） |
| shared/rules/keywordState.ts | 11 | 117,139,148,249,282,335,384,441,460 | B：80,102（静的キーワード述語） |
| shared/rules/activation.ts | 10 | 39,75,97,128,183,213,247,327,532 | A+：357（activatableAbilityOf。クライアント共用） |
| server/src/logic/zones/mill.ts | 8 | 28,41,61,84,95,236,270,290 | 全 A |
| server/src/logic/removal.ts | 8 | 149,587,960,1263,1649,1668,1687,1716 | 全 A（960 hasOwnNexusIndestructible は直走査。要確認） |
| shared/rules/level.ts | 6 | なし | B：86,98（inst だけの静的述語）,104（定義）,126（effectActiveOn。§4 で board 版を別に作る）,263,284（stopper 走査。再帰防止） |
| server/src/logic/RuleValidator.ts | 5 | 397,417,440,1082,1544 | 全 A（board 在り） |
| server/src/logic/revive.ts | 4 | 210,1051,1068 | C：983（tryEffect。level をクロージャで受ける。inst・state は在る） |
| server/src/logic/keywords/funsai.ts | 4 | 18,49,65 | B：91（攻撃時 Lv スナップショット） |
| shared/rules/bp.ts | 3 | 541,572 | B：51（countAsMultiple。スピリット専用） |
| server/src/logic/triggers.ts | 3 | 150（triggerSuppression）,704 | B：659（合体ブレイヴの攻撃誘発） |
| server/src/logic/state/exhaust.ts | 3 | 19,45,265 | 全 A |
| server/src/logic/magic/negate.ts | 3 | 22,41,75 | 全 A |
| server/src/logic/keywords/tensho.ts | 3 | 137,146 | C：33（tenshoSpecOf。level 引数） |
| server/src/logic/keywords/kobo.ts | 3 | 14,31 | B：59（攻撃者 Lv スナップショット） |
| server/src/logic/battleResolve.ts | 3 | 168 | B：550,665（jugeki。Lv スナップショット） |
| server/src/logic/stepTriggers.ts | 2 | 431 | A+：48（fireBattleWonTriggers。§3） |
| 単発（各1〜2件。計約29） | 約29 | coreGainCap29, lifeDamageReplace22, effectTax17, magic/redirect55,148, magic/resolve77, exhaustPrevent27, pay574, fireEffect25, bofu18,37, chimei22, handBurstEffect23,35, burst293, kyoshu17,33, jugeki19,42, resistance203 | B：GameEngine1109（awaken の計測だけ）,battleFlow1245（合体ブレイヴ）,fieldCard.ts:136（**クライアント表示**）。C：targetFilter89,resistance179（inst だけの述語。ネクサスに付く制約が在るか要確認） |

集計（概数）：**A ≒ 150（うち effectSources 内 ≒ 108）／A+ ≒ 3／B ≒ 18／C ≒ 10**。

## 2. A+（board が届いていない関数）と呼び出し元

| 関数 | 位置 | 呼び出し元 | 備考 |
| :-- | :-- | :-- | :-- |
| activatableAbilityOf | activation.ts:357 | クライアント＋サーバー（audit:parity 対象） | **クライアントは GameView しか持たない**。無理なら B に倒し、サーバー側 validateActivateAbility だけ止めてズレを許容するかをユーザーに聞く |
| fireBattleWonTriggers | stepTriggers.ts:48 | 1（stepTriggers 内）。state は在る | 署名ではなく inst ループ。state がクロージャにあれば引数追加なし |
| meisaiTollOf / coreBonusFor / tryMeisaiToll | EffectModules.ts:285,890,263 | 未集計（実装役が `grep -rn "関数名(" \| wc -l`） | inst だけの関数。ネクサスに付く meisai／coreBonus が現データに在るかを先に調べ、無ければ B |
| hasUntargetableConstraint | resistance.ts:179 | クライアント共用 | C |

結論：**ES 内の約108件は引数追加ゼロで置換できる**。引数追加が要る可能性があるのは上の数関数に限られる（呼び出し元数の確定は実装役）。

## 3. 誘発・ステップ効果の入口

| 位置 | 今の判定 | 変更 |
| :-- | :-- | :-- |
| triggers.ts:236 `fireTrigger` | `instEffectsSuppressed \|\| nexusEffectsStopped(state,owner,selfInstance)` → ネクサス丸ごと | 丸ごと止めは据え置き（既存軸）。**加えて誘発エントリ単位で `entryActive(state,owner,selfInstance,effect)`**。fireTrigger に渡る effect が手元に在るかを要確認＝無ければ「発揮するエントリを選ぶ」走査側に入れる |
| triggers.ts:150 `isTriggerSuppressed` | 発生源の triggerSuppression エントリを Lv で判定 | A（stopper 自身のエントリも止められる側） |
| triggers.ts:704 `collectGrantedTriggerActions` | effectSources 走査の effectGrant | A |
| stepTriggers.ts:205 | `nexusEffectsStopped` で丸ごと `continue` | 据え置き。直後の `kind==="step"` 走査に entryActive を足す |
| stepTriggers.ts:48 battleWon | Lv のみ。**nexusEffectsStopped を通っていない** | 既存の穴の疑い。entryActive 導入時に同時に直るか確認（§7） |
| stepTriggers.ts:431 battleBpAsLevel | effectSources 内 | A |

042 の「phase:main」は effect.phase で既に判定済み（level.ts:261〜）。新軸でも踏襲。

## 4. 置き場所と循環 import

- 「効果が止まる」の概念のファイルは**まだ無い**。止める仕組みは level.ts に混在：`instEffectsSuppressed`(:188)・`nexusEffectsStopped`(:231)・`restedNexusEffectsDisabled`(:238)・`nexusEffectsDisabledFor`(:249)。
- **案：`shared/rules/effectStop.ts` を新設**し、上の4つ＋`entryActive` を置く（設計の2原則の2）。
  - effectStop.ts → level.ts：`currentLevel`・`isVirtualSource`・`effectActiveAtLevel` を import
  - level.ts → effectStop.ts：`effectSources` が `instEffectsSuppressed`／`nexusEffectsDisabledFor` を import
  - **循環になるが、関数本体の中でしか使わないので ES module では動く**。既に level.ts ↔ constraints／activation／keywordState／targetFilter が同じ循環（level.ts:15〜19）。トップレベルで評価する定数を effectStop.ts に置かなければ安全。
  - 今回の PR は entryActive と、それが再利用する `nexusEffectsDisabledFor` の走査だけ移す手もある。残りの移し替えは後 PR。
- 署名案：`entryActive(board, pid, source, effect)`。中身は `effectActiveOn` 相当（Lv＋whileCombined）＋「場のネクサスなら新軸を見る」。
  **場のネクサスでない source（スピリット・仮想発生源）は最初に true 側で速く抜ける**（A ≒ 150 か所が毎回、相手の発生源を走査すると遅くなる）。
- クライアントは effectStop.ts を import できる（shared 配下）が、`GameView` しか持たないので entryActive は使えない。

## 5. 既存の「効果を止める」仕組みの判定位置

| 仕組み | 判定 | 粒度 | エントリ単位へ移すなら（後 PR） |
| :-- | :-- | :-- | :-- |
| nexusEffectsDisabled（丸ごと／targetLevels） | level.ts:249〜（effectSources:212 と nexusEffectsStopped:231 経由） | 個体（ネクサス） | targetLevels を entryActive の「ネクサスの現在 Lv」判定に移し、effectSources の filter を外す。042 は targetEffectLevels として並べる |
| restedNexusEffectsDisabled | level.ts:238 | 個体 | `n.isRested` を entryActive に移し、effectSources の filter を外す |
| spiritEffectsDisabledGrant | continuous.ts:422〜（effectsDisabledContinuous を立てる）＋level.ts:188 | 個体 | 立てる側は据え置き。`instEffectsSuppressed` を entryActive の先頭に入れれば effectSources の filter(:208) を外せる |
| effectsDisabled（timed） | continuous.ts:89 → timedEffectsDisabled | 個体 | 同上（instEffectsSuppressed 内） |
| triggerSuppression | triggers.ts:134〜（isTriggerSuppressed） | エントリ（誘発イベント単位） | イベント照合が要るので entryActive には入れず、fireTrigger の入口に残す |
| constraintSuppression | constraints.ts:192〜 | 制約 type 単位 | activeConstraints 内の判定。type を知る必要があり引数が増える → 後回し |
| bpBuffSuppression | bp.ts:531〜、actions/buff.ts:417 | 効果（BP+ か） | bp.ts と buff.ts の2か所を揃えて移す |
| familySuppression | keywordState.ts:264〜 | 個体の系統 | 「系統をなし」でエントリではない。移さない |
| noBurstEffectForPid | keywords/burst.ts:208（timedPlayerRules） | 解決全体（カード単位） | 移さない |
| noOpponentTriggerByColor | triggers.ts:230＋constraints.ts:1054 | 誘発イベント＋色 | triggerSuppression と同様に fireTrigger 入口に残す |
| handTrashSpiritEffectsDisabled | constraints.ts:366 | カード（手札トラッシュ） | 移さない |

## 6. 実装役への手順

1. **先に基準を取る**：`npx tsx scripts/smoke/part660.ts` と `npm run smoke:quiet`（失敗ゼロ）。
2. entryActive を実装（まだ誰も呼ばない）して `typecheck`。中身は、source が場のネクサスでなければ `effectActiveOn` と同じ結果（＝既存挙動と完全一致）。
3. データ：BS18-042-e1 を `targetEffectLevels:[1]`（`targetLevels` は削除）に変える。型は nexusEffectsDisabled のある `types/effectDef*.ts` の1ファイルだけ直す。
   `nexusEffectsDisabledFor` から新軸の判定を外す（effectSources でネクサスを外さない）。part660 のコメントアウト場面を外す。
4. 置換は**層ごと**に：①constraints.ts（27件）②cost.ts／keywordState.ts／activation.ts／bp.ts ③continuous.ts ④triggers／stepTriggers（§3）⑤EffectModules／removal／mill／magic ほか。
   各層のあとに `typecheck` ＋ part660 ＋ その関数を使う smoke。最後に `smoke:quiet`。
5. part660 の期待：「Lv2 ネクサスの Lv1（levels に1を含む／null）エントリが止まる」「Lv2 専用エントリは動く」「相手ターンの非メインでは止まらない」。
6. 最後に定型 `typecheck && validate:cards && validate:notes && validate:gaps && validate:size && smoke:quiet && build:client`、加えて `audit:parity`（activatableAbilityOf を触るなら必須）と `coverage:effects`（noteCoverage の位置ずれ確認）。
7. 層ごとに `grep -c "effectActiveAtLevel("` を取り、B／C 以外が残っていないことを確認。

## 7. 決めたこと（2026-10-23 メインループ）

- `entryActive` ＝ Lv が合う（`effectActiveOn` と同じ）かつ、場のネクサスなら「丸ごと止まっていない（`nexusEffectsStopped`）」かつ「新軸 `targetEffectLevels` に当たらない」。丸ごとの判定も中に入れるので、`field.nexuses` を直接走査している所（cost.ts:199,316・removal.ts:960 ほか）と battleWon（stepTriggers.ts:48）も、置き換えれば既存の止める効果が効くようになる（既存の穴の修正。PR に挙動の変化として書く）
- `nexusEffectsDisabledFor` の中（止める側のエントリを探す走査）は `entryActive` を呼ばない（無限再帰になる）。止める側のエントリ同士の関係は特別扱いしない（042 の Lv1 を含む `nexusEffectsDisabled` も、一般則どおり別の 042 に止められうる。現データでは起きない）
- クライアント（`activatableAbilityOf`・fieldCard.ts）：共有層の関数は Board を受け取る。クライアントが渡している値で `entryActive` が呼べるならそのまま使う。呼べなければ B に残し、`audit:parity` で差を確かめて PR に限界として書く
- 既存の止める仕組み11個の移し替えは後の PR（§5）
- **§5 の移し替えはしない（10-23 判断）**：effectSources の絞り込みを外すと、entryActive を通らない残り約33か所で止まっていた効果が動き出す。代わりに entryActive の中で同じ個体の判定を重ねて見る。spiritEffectsDisabledGrant／effectsDisabled（`instEffectsSuppressed`）は足した（場を直接走査する magicRestriction などで止まっていなかった。part662）。nexus の2つは #295 で足し済み。残りの7つは §5 の表のとおり、エントリ単位ではない／引数が増えるので入れない
