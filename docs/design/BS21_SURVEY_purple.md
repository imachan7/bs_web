# BS21 調査メモ：purple（調査役）
対象：BS21-010・011・012・013・014・015・016・017・018・057・058・068・075・076・X02。実装はしていない。
（BS21-072 は colors[0] が紫以外の担当。CP13-01 は対象外。ソードブレイヴは通常のブレイヴと同じ扱い＝該当なし。）

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**26**（効果なしの 010 を除く14枚。うち連鎖元 3・連鎖の中身 5）
- 既存の器で書ける：**22**
- 新しい部品が要る：**4**（013 Lv1・013 Lv2・014 Lv1・058。部品としては3件 → §2 の N1〜N3）
- 連鎖を持つカード：**3**（015・018・075。条件はすべて「白×1」または「白/黄 各1」）
- 強化を持つカード：**0**

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | EffectCounter `lastEmptiedSpirits`（カウンタ。直前の removeCores／coreRemove の解決でコアが0個になった体数） | `effectCounter.ts` を見たが、コア除去関係は `lastCores`（取り除いたコアの個数）しか無い。`lastEmptied`（IfCond）は coreRemove 1体対象の boolean（`GameState.lastCoreRemoveEmptied`。BS19-070 が1体向けに使用）で、「すべてのコア1個ずつ」の結果できた0個の**体数**は数えられない。`drawIfEmptied`（coreRemove 専用）も1体対象 | 014 Lv1 |
| N2 | fieldEvent `opponentDeckMilled` に「発生源がこのスピリット（合体スピリットを含む）の効果」軸（条件の軸） | `bySelfEffectOnly` は `opponentSpiritBpReachedZero` 限定（effectDefTrigger.ts）。`sourceColorFilter` は色だけ。mill.ts:229 の発火は原因の発生源を問わず、イベントにも発生源 instanceId を渡していない | 058 |
| N3 | `coreGainCap` の sourceTypes に `"magic"` を足す＋記述を省略可能に（原因を問わない）（条件の軸） | `globalConstraint.ts:84` の sourceTypes は必須で `"spirit"|"brave"|"nexus"` のみ。013 は「お互い、（原因の記述なく）ボイドから／トラッシュのコアを〜置くことができない」で、マジックの効果・原因を問わない必要がある。BS18-063 は「スピリット/ブレイヴの効果で」と書いてあったので sourceTypes で足りた。`voidCoreBlockedOutsideCoreStep` はボイド→フィールド/リザーブのみでライフが対象外 | 013 Lv1・Lv2 |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））

| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS21-010 | （効果なし。コスト0のバニラ） | ― |
| BS21-011 | Lv2-3【呪撃】『アタック時』 | `keyword jugeki`（BS19-069-e2。効果文「バトル解決時にブロックしていた相手のスピリット1体を、バトル終了時に破壊する」が BS19-069 と同一文で、同カードは keyword jugeki 1エントリで書いている） |
| BS21-012 | Lv1-2『自分のメインステップ』青のスピリット召喚時にドロー・ターンに1回 | fieldEvent `ownSpiritSummoned`＋`subjectFilter color`＋`phase main`＋`turn own`（BS19-090-e1）＋`oncePerTurn`（fieldEvent の旗。effectDefTrigger.ts:207）＋draw 1（BS13-016-e1 が系統版） |
| BS21-013 | Lv1-3『お互いのメインステップ』ボイドからコアを増やせない | globalConstraint `coreGainCap` max0 from[void] to[life,field,reserve] side both＋エントリ phase main（BS18-063-e1 と同じ形。ただし **N3** が要る） |
| BS21-013 | Lv2-3『お互いのアタックステップ』トラッシュのコアをフィールド/リザーブに置けない | globalConstraint `coreGainCap` max0 from[trash] to[field,reserve] side both＋エントリ phase attack（**N3**） |
| BS21-014 | Lv1-3『召喚時』コスト3の相手すべてのコア1個ずつをリザーブへ・0個になった1体につきドロー | removeCores target all filter{cost:3} count 1 to reserve（BS14-022-e1 の filter cost 版）＋draw `countCounter`（**N1**） |
| BS21-014 | Lv2-3『自分のアタックステップ』ステップ開始時、疲労させることで1体の色を無しに | kind `step`（step attack, turn own。SD06-012-e1）＋pay cost `exhaustSelf`（BS13-026-e1）＋timedEffect `colorless` duration turn side own count 1（BS20-075-e1 が all＋filter 版、BS13-011-e2 が colorless の内容） |
| BS21-015 | Lv1-3『召喚時』ドロー | triggered onSummon draw 1（BS19-069-e1） |
| BS21-015 | 【合体時】Lv2-3『合体アタック時』疲労状態の相手1体を破壊（連鎖元） | triggered onAttack whileCombined＋destroy filter{rested} count 1（BS17-056-e2。`{"trigger":"onAttack","whileCombined":true,"action":{"type":"destroy","filter":{"rested":true},"count":1}}` と同じ形） |
| BS21-015 | 連鎖（条件 白/黄 各1）[白]：コスト5以下の相手1体を手札に戻す | sequence＋if `ownColorSymbols`（M1。BS20-021-e2）＋return to hand filter{cost max 5}（BS20-021-e2 の maxBp 版＋BS20-022-e1 の filter cost） |
| BS21-015 | 連鎖（条件 白/黄 各1）[黄]：Lv1/Lv2の相手からブロックされない | 継続の連鎖＝constraintGrant＋condition `ownColorSymbolsAtLeast`（BS19-055-e4）＋`unblockableBy from{level:[1,2]}`（BS13-058-e1 の `{"type":"unblockable","opponentOnly":true,"from":{"level":[1,2]}}` と同じ形） |
| BS21-016 | Lv1-3『自分のアタックステップ』星魂がアタックしたとき相手のコア1個をリザーブへ | fieldEvent `anySpiritAttacked`＋phase attack turn own ownOnly＋subjectFilter family＋removeCores 1（BS06-077-e2 が【呪撃】版・BS13-016-e2 が系統版） |
| BS21-017 | Lv1-2『お互いのアタックステップ』【呪撃】持ちが相手によって破壊されたときドロー | fieldEvent `ownSpiritDestroyed`＋`byOpponentOnly`（effectDefTrigger.ts:243。BS19-090-e2 は byOpponentEffectOnly 版）＋subjectFilter keyword jugeki＋draw 1 |
| BS21-018 | 【不死：コスト3/4】 | keyword `fushi` triggerCosts [3,4]（BS12-013-e1） |
| BS21-018 | Lv1-3『召喚時』相手のフィールドのコア1個を相手のリザーブへ（連鎖元） | triggered onSummon＋coreRemove count 1（BS20-017-e2） |
| BS21-018 | 連鎖（条件 白×1）[白]：相手1体を手札に戻す | sequence＋if（BS20-027-e2）＋return to hand count 1（同 then） |
| BS21-057 | 【合体時】『破壊時』相手2体を疲労させる | triggered onDestroy whileCombined（P039-e2）＋exhaust count 2 |
| BS21-058 | 【合体時】『合体アタック時』このスピリットの効果でデッキを破棄したとき相手のフィールドのコア1個をリザーブへ | fieldEvent `opponentDeckMilled`＋whileCombined＋coreRemove 1（**N2** の発生源軸が要る） |
| BS21-068 | Lv1-2『相手のアタックステップ』自分の【呪撃】をブロック時版に変更 | `jugekiOnBlockReplace`（BS06-098-e2。効果文「【呪撃】の効果を“【呪撃】『このスピリットのブロック時』…バトル終了時に破壊する”に変更する」で、破壊する相手がアタッカーに変わる同じ形。ネクサスも effectSources に載る） |
| BS21-068 | Lv2『お互いのアタックステップ』自分の効果で相手のコアが0個になったときドロー | fieldEvent `opponentSpiritCoresEmptied`＋selfMode source（BS20-017-e3 の refresh 版）＋draw 1 |
| BS21-075 | フラッシュ：自分1体を破壊することで、相手は相手の1体を破壊する（連鎖元） | pay（cost に destroy が支払い可能＝PAYABLE_TYPES）＋cost destroy side own count 1＋then destroy `chooserIsTarget` count 1（effectAction.ts:61「chooserIsTarget は破壊される側が対象を選ぶ」＝CHOOSER_RULES） |
| BS21-075 | 連鎖（条件 白/黄 各1）[白]：相手1体を手札に戻す | BS20-027-e2 と同じ形 |
| BS21-075 | 連鎖（条件 白/黄 各1）[黄]：このターンの間、相手1体をLv1として扱う | sequence＋if＋timedEffect `level set 1` duration turn count 1 side opponent（BS19-051-e1 が all 版） |
| BS21-076 | フラッシュ：相手2体のコアをそれぞれ1個だけになるようにリザーブへ | removeCores targets 2 count all leaveAtLeast 1（BS14-022-e2。効果文「相手のスピリット2体のコアを、それぞれ1個ずつになるように相手のリザーブに置く」が同一文） |
| BS21-X02 | Lv1-3：妖蛇すべてに【呪撃】を与える | keywordGrant jugeki target ownAll familyFilter（BS06-077-e1。与える文言も「【呪撃】『このスピリットのアタック時』バトル解決時にブロックしていた相手のスピリット1体を、バトル終了時に破壊する”を与える」で同一） |
| BS21-X02 | Lv1-3『破壊時』このスピリットを手札に戻すことができる | triggered onDestroy optional＋return to hand target self（P084-e2 の optional 版） |
| BS21-X02 | Lv2-3『自分のアタックステップ』【呪撃】持ちすべては疲労状態の相手1体を指定してアタックできる | constraintGrant target ownAll filter{keyword jugeki}＋phaseTurn attack own＋constraint `canDirectAttack` targetFilter rested（BS11-063-e2。`{"target":"ownAll","filter":{"combined":true},"constraint":{"type":"canDirectAttack","targetFilter":"rested"}}` と同じ形） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

| # | カード・節 | 読みの候補 |
| :-- | :-- | :-- |
| 1 | 013 Lv1「ボイドからコアを増やすことができない」 | (a) 行き先を問わず（ライフへの【聖命】・マジックの void→life も含む）。BS18-063 は to に life を含めた前例。(b) フィールド/リザーブだけ（voidCoreBlockedOutsideCoreStep と同じ範囲） |
| 2 | 013 Lv1・Lv2「置くことができない」の原因 | (a) 効果によるものだけ（コアステップ・リフレッシュステップのルール処理は元々対象ステップ外なので実質同じ）。(b) コスト支払いの逆方向（ボイドへ置く・トラッシュへ置く）も含めて一切のコア移動——ただし「増やす／置く」の向きから (a) が自然 |
| 3 | 014 Lv1「コア1個ずつ」と紫【強化】 | 【強化】（紫）の +1個が効くか。Q760 は「すべてのコアを1個ずつ」を1体からだけ追加で1個とする。014 は「コスト3の相手すべてのコア1個ずつ」で (a) 1体ぶんだけ合計+1（Q760 と同じ）(b) 対象1体ごとに+1。kyoka.ts は「すべてのスピリットから取るコア除去は未対応」とあるので実装時に決める |
| 4 | 014 Lv2「このターンの間、自分のスピリット1体の色を無いものとして扱う」 | 対象は (a) このスピリット自身も含む（「1体」に自分を含む）(b) このスピリット以外。効果文に限定が無いので (a)。また BS20-075 は all＋filter で書いたが、014 は1体を選ぶ（選ぶのは自分） |
| 5 | 058「このスピリットの効果で相手のデッキを破棄したとき」 | (a) 合体スピリットとしての効果すべて（ホストの【粉砕】・付与された効果を含む）。合体中はブレイヴの効果もスピリットの効果なので (a) が自然。(b) このブレイヴ自身に書かれた効果だけ。また見出しは『合体アタック時』だが、発火は破棄のとき——(a) その合体アタック中の破棄に限る (b) 破壊時でなくても合体中ならいつでも（見出しを『合体アタック時』と読むか、単なる発揮条件と読むか） |
| 6 | 075「自分のスピリット1体を破壊することで、相手は、相手のスピリット1体を破壊する」 | 相手が破壊する1体を選ぶのは CHOOSER_RULES どおり。残る読み: 破壊する主体が (a) 自分（デッドリィヘクスの効果。相手の【装甲】等の耐性は自分の効果として判定）(b) 相手（相手の効果として判定）。chooserIsTarget は「解決は発生源の持ち主の効果」（effectAction.ts:61）なので (a) で書く |
| 7 | 017「【呪撃】を持つ自分のスピリット」 | 破壊されたときの Lv・一時付与込みで判定（BS19-090 の【連鎖】版と同じ §3.24）。「持つ」の読みは Q774 と同様に確定でよいが、付与された【呪撃】（X02・068 で付く）を含むかは実装時に spiritHasKeyword の挙動を確認する |
| 8 | 068 Lv1 変更後の【呪撃】 | BS06-098 の変更文は「このスピリットは、バトルした相手のスピリット1体をバトル終了時に破壊する」、068 は「バトル解決時にブロックしていた相手のスピリット1体を、バトル終了時に破壊する」。破壊する対象はどちらもアタッカーで同じと読むが、jugekiOnBlockReplace は差し替えの文言を持たない固定の器なので、実装時に破壊対象がアタッカーになることを確認する |
