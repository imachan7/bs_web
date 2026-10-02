# イベント対象の分類表（onBlock／onBlocked／onBattleStart／onBattleEnd）

目的：誘発エントリごとに、効果文がイベント対象を指すか(use)・新たに対象を選ぶか(ignore)を分類し、`eventTarget` フラグ付与の元表にする。全117件。
内訳：use 9 ／ ignore 45 ／ none 62 ／ 要判断 1。★＝ignore で count 型の対象取り行動なのに excludeTarget も all も無いもの（17件）。

**規則（2026-10-01）**：onBlock／onBlocked／onBattleStart／onBattleEnd の triggered は、`eventTarget: "use" | "ignore"` を必ず書く（`validate:cards` が落とす）。
効果文がイベント対象を指す（「ブロックした」「バトルしている」「アタックしている」相手のスピリット）なら `"use"`、新たに選ぶなら `"ignore"`、対象を取らないなら `"use"`（従来の挙動のまま）。
`"ignore"` は行動に targetInstanceId を渡さないだけで、`condition` などの判定には渡す（triggers.ts の fireTrigger）。既知の限界：付与された誘発（grantedAction）には軸を伝える手段が無い

注：none は対象を取らない(自身BP+・ドロー・コア追加等)。節は効果文から自動抽出(60字で切り詰め)のため、見出しの取り違えがありうる。

| エントリID | カード名 | trigger | 行動のtype | 節 | 分類 | 根拠の語句 |
|---|---|---|---|---|---|---|
| BS01-077-e1 | ベビー・ロキ | onBlock | timedEffect | このスピリットをBP+1000する。 | none |  |
| BS01-081-e1 | 銀燐竜ニーズホッグ | onBlock | timedEffect | このスピリットをBP+4000する。 | none |  |
| BS01-093-e1 | 甲精ディース | onBlocked | exhaust | 相手がブロックを宣言したとき、ブロックするスピリット以外のスピリット1体を疲労させる。 | ignore | ブロックするスピリット以外のスピリット1体(excludeTarget有) |
| BS01-097-e1 | 飛龍ヴァルキュリウス | onBlock | timedEffect | このスピリットをBP+6000する。 | none |  |
| BS02-013-e1 | バット・バット | onBlocked | removeCores | このスピリットは、相手がブロック宣言したとき、ブロックしたスピリット上のコア1個を相手のリザーブに置くことができる。 | use | ブロックしたスピリット上のコア |
| BS02-024-e1 | 暗黒将軍ブラッディ・シーザー | onBlocked | removeCores | このスピリットは、相手がブロック宣言したとき、ブロックしたスピリット上のコア2個までを相手のリザーブに置くことができる。 | use | ブロックしたスピリット上のコア |
| BS02-037-e1 | スフィアロイド | onBlock | timedEffect | このスピリットをBP+2000する。 | none |  |
| BS02-044-e2 | 魔砲神メガロック | onBlock | timedEffect | このスピリットをBP+2000する。 | none |  |
| BS02-047-e2 | 機神官フレイ | onBlock | timedEffect | このバトル終了時まで、相手はフラッシュタイミングで使う効果を使用できない。 | none |  |
| BS02-050-e1 | コリスタル | onBattleEnd | destroySelf | このスピリットは、バトル終了時に破壊される。 | none |  |
| BS02-X07-e3 | 巨神機トール | onBattleEnd | pay | 系統：「武装」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する。 | ignore | 自分側の選択・コスト／手札 |
| BS03-008-e1 | 剣竜ステゴラーサウルス | onBlocked | timedEffect | このスピリットと同じLvのスピリットにブロックされたとき、このスピリットをBP+3000する。 | none |  『同じLvのスピリットにブロックされたとき』の条件にブロッカーを使うが、行動は自身のBP+のみ。none。 |
| BS03-039-e1 | 笛吹きのヘイムダル | onBlock | timedEffect | このバトル終了時まで、相手はフラッシュタイミングで手札のカードを使用できない。 | none |  |
| BS03-040-e1 | ベル・ダンディア | onBlock | refreshOne | 系統：「巨獣」を持つ自分のスピリット1体を回復させる。 | ignore | 系統「巨獣」を持つ自分のスピリット1体(自分側) ★現状バグの疑い |
| BS03-045-e1 | 銀狐ハティ | onBlock | timedEffect | このスピリットをBP+5000する。 | none |  |
| BS03-046-e1 | 一角獣アインホルン | onBlock | timedEffect | 自分のフィールドにあるネクサス1つにつき、このスピリットをBP+1000する。 | none |  |
| BS03-048-e1 | 鎧蛇竜ミッドガルズ | onBlock | timedEffect | 自分のフィールドにいる系統：「巨獣」を持つスピリット1体につき、このスピリットをBP+1000する。 | none |  |
| BS03-065-e1 | 天使キュリオ | onBlock | placeCores | 自分のフィールドに緑のネクサスがあるとき、ボイドからコア1個をこのスピリット上に置く。 | none |  |
| BS03-092-e1 | 島持ちのフランシス | onBlock | pay | 自分の手札のネクサスカード1枚を破棄することで、このスピリットをBP+5000できる。 | none |  |
| BS04-041-e2 | フェンリルキャノンMk-II | onBlock | timedEffect | 同じLvのスピリットをブロックしたとき、このスピリットをBP+3000する。 | none |  |
| BS04-068-e1 | アイアン・ゴレム | onBlock | pay | 自分の手札のネクサスカード1枚を破棄することで、このスピリットをBP+4000する。 | none |  |
| BS04-075-e2 | 伝説巨人ジュード | onBattleEnd | refreshSelf | 【粉砕】で破棄したカードにネクサスがあったとき、バトル終了時に回復する。 | none |  |
| BS05-025-e2 | 神樹ディオネアス | onBattleStart | placeCores | ボイドからコア1個を自分のリザーブに置く。 | none |  |
| BS05-035-e1 | 魔神機ビッグ・ロキ | onBlock | timedEffect | このスピリットをBP+3000する。 | none |  |
| BS05-053-e1 | 蒼海の竜使いアズール | onBattleStart | mill | “『このスピリットのバトル時』相手のデッキを上から5枚破棄する”（付与効果） | none |  |
| BS05-X18-e4 | 超獣王ベヒードス | onBlock | timedEffect | このバトルの間、相手はフラッシュタイミングでマジックカードを使用できない。 | none |  |
| BS06-011-e2 | 鉄蠍竜スコルド・ゴラン | onBlocked | refreshSelf | 白のスピリットにブロックされたとき、このスピリットは回復する。 | none |  |
| BS06-021-e1 | 蛇后妃メドゥーサ | onBattleStart | draw | 自分はデッキから1枚ドローする。 | none |  |
| BS06-028-e2 | ガブノハシ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS06-033-e2 | ジャコビーノ男爵 | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリットを指定された体数疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS06-036-e2 | 牙王樹ラフレシオー | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリットを指定された体数疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS06-041-e1 | 鎧装獣アウドムラ | onBlock | placeCores | ボイドからコア1個をこのスピリット上に置く。 | none |  |
| BS06-043-e1 | 盾機兵バルドル | onBlock | timedEffect | 疲労状態の自分のスピリット1体につき、このスピリットをBP+1000する。 | none |  |
| BS06-044-e2 | レインディア | onBlock | returnToHand | このスピリットがブロックした系統：「空牙」を持つ相手のスピリット1体を手札に戻す。 | use | このスピリットがブロックした…相手のスピリット |
| BS06-046-e3 | 鍵鎚のヴァルグリンド | onBlock | refreshSelf | BP4000以上の相手のスピリットをブロックしたとき、このスピリットは回復する。 | none |  |
| BS06-047-e1 | 輝竜殿ブレイザブリク | onBlock | placeCores | ボイドからコア1個をこのスピリット上に置く。 | none |  |
| BS06-047-e2 | 輝竜殿ブレイザブリク | onBlock | timedEffect | このスピリットをBP+4000する。 | none |  |
| BS06-048-e1 | 銀狼皇ガグンラーズ | onBlock | timedEffect | 【装甲】を持つ自分のスピリット1体につき、このスピリットをBP+1000する。 | none |  |
| BS06-048-e2 | 銀狼皇ガグンラーズ | onBlock | exhaust | 相手のスピリット2体を疲労させる。 | ignore | 相手のスピリット2体を疲労 ★現状バグの疑い |
| BS06-X21-e3 | 激神皇カタストロフドラゴン | onBlocked | refreshSelf | コスト5以下の相手のスピリットにブロックされたとき、このスピリットは回復する。 | none |  |
| BS06-X23-e2 | 天帝ホウオウガ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット3体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS06-X24-e2 | 鎧神機ヴァルハランス | onBattleStart | selfBuffByExhaustFamily | 系統：「武装」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する。 | ignore | 自分側の選択・コスト／手札 |
| BS07-023-e2 | ラクダチョウ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリットを指定された体数疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS07-024-e1 | デルファングス | onBattleStart | placeCores | ボイドからコア1個を、系統：「虚神」/「神将」を持つ自分のスピリット1体の上に置く。 | ignore | 系統「虚神」/「神将」を持つ自分のスピリット1体(自分側) ★現状バグの疑い |
| BS07-025-e1 | 草林の長老ブチ・エナジ | onBattleEnd | summonFromHandFree | バトル終了時、自分の手札にあるコスト3以下の緑のスピリットカード1枚を、コストを支払わずに召喚できる。ただし、この効果で | ignore | 自分側の選択・コスト／手札 |
| BS07-027-e2 | 突風侯爵コカトリーフ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリットを指定された体数疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS07-032-e1 | ヘイル・ガルフ | onBlock | timedEffect | このスピリットをBP+3000する。 | none |  |
| BS07-036-e2 | 大械獣ギガ・テリウム | onBlock | timedEffect | このスピリットをBP+3000する。 | none |  |
| BS07-041-e2 | 天剣の勇者リュート | onBlocked | timedEffect | このスピリットとバトルした相手のスピリットはLv1として扱う。 | use | このスピリットとバトルした相手のスピリット |
| BS07-041-e3 | 天剣の勇者リュート | onBlock | timedEffect | このスピリットとバトルした相手のスピリットはLv1として扱う。 | use | このスピリットとバトルした相手のスピリット |
| BS07-045-e4 | 神帝獣スフィン・クロス | onBlocked | refreshSelf | 最高Lvではない相手のスピリットにブロックされたとき、このスピリットは回復する。 | none |  |
| BS07-X26-e2 | 剣王獣ビャク・ガロウ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS08-023-e2 | ゲラン准将 | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS08-026-e2 | 超重甲蟲ゴライアース | onBattleStart | placeCores | BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復する。 | none |  |
| BS08-027-e3 | 輝虹翼戦士ジュエルグΣ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS08-035-e3 | 獣機合神セイ・ドリガン | onBattleStart | returnToHand | 【転召】を持たない相手のスピリット1体を手札に戻す。 | ignore | 【転召】を持たない相手のスピリット1体 ★現状バグの疑い |
| BS09-022-eB | ミノバ子爵 | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS09-026-eB | 軍艦長ドレッドノート | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS09-040-e1 | イワザール | onBlock | exhaust | コスト3以下の相手のスピリット2体を疲労させる。 | ignore | コスト3以下の相手のスピリット2体 ★現状バグの疑い |
| BS09-041-e1 | アスピドケルン | onBlock | draw | 自分はデッキから1枚ドローする。 | none |  |
| BS09-049-e2 | 炎蜥蜴クトゥグマ | onBlock | destroy | 「ブロックされない」効果を持つ相手のスピリット1体を破壊する。 | ignore | 「ブロックされない」効果を持つ相手のスピリット1体 ★現状バグの疑い |
| BS09-X37-e4 | 終焉の騎神ラグナ・ロック | onBattleStart | refreshOne | コスト8以下の自分のスピリット3体を回復させる。 | ignore | コスト8以下の自分のスピリット3体(自分側) ★現状バグの疑い |
| BS10-069-e2 | 千刀鳥カクレイン | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS10-074-e1 | きぐるみクマッター | onBattleStart | exhaust | 相手のネクサスすべてを疲労させる。疲労状態のネクサスすべての効果は発揮されない。 | ignore | 相手のネクサスすべて(all) |
| BS10-023-e1 | ラッキーウィ | onBattleStart | placeCores | ボイドからコア1個をこのスピリット上に置く。 | none |  |
| BS10-026-e3 | 老兵ノーガン | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS10-032-e1 | ガドファント | onBlock | timedEffect | このスピリットをBP+3000する。 | none |  |
| BS10-033-e1 | ノーザンベアード | onBlock | placeCores | ボイドからコア1個をこのスピリットに置く。 | none |  |
| BS10-037-e2 | エンペラドール | onBlock | timedEffect | このスピリットをBP+5000する。 | none |  |
| BS10-041-e1 | ティン・ソルジャー | onBattleEnd | destroySelf | バトル終了時、このスピリットは破壊される。 | none |  |
| BS10-027-e1 | 若武者ウンピョル | onBattleEnd | detachBrave | バトル終了時、自分の合体スピリット1体からブレイヴを分離させ、自分のスピリット1体に合体できる。 | ignore | 自分側の選択・コスト／手札 |
| BS11-007-e1 | 輝龍皇ヘリオスドラゴン | onBattleEnd | reveal | バトル終了時、自分のデッキを上から、このスピリットのLvと同じ枚数オープンできる。その中の系統：「星竜」を持つコスト7以 | none |  |
| BS11-025-e1 | カルガモード | onBlock | timedEffect | このスピリットをBP+3000する。 | none |  |
| BS11-025-e2 | カルガモード | onBlock | exhaust | 相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット1体を疲労 ★現状バグの疑い |
| BS11-050-e1 | 激爪竜パワード・タスカー | onBlocked | destroy | このスピリットがブロックされたとき、コアが3個以下しか置かれていない相手のスピリット1体を破壊する。 | ignore | コアが3個以下の相手のスピリット1体 ★現状バグの疑い |
| BS11-X02-e3 | 滅神星龍ダークヴルム・ノヴァ | onBattleStart | timedEffect | 相手の合体スピリットとバトルしたとき、このスピリットをBP+10000する。 | none |  |
| BS12-023-e2 | 忍仙人ウドウ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS12-036-e1 | 星犬ポメラン | onBlock | timedEffect | バトルしている相手の合体スピリットのシンボル1つにつき、このスピリットをBP+3000する。 | none |  |
| BS12-039-e3 | 導化姫トリックスター | onBlock | destroy | バトルしている回復状態の相手のスピリット1体を破壊する。 | use | バトルしている…相手のスピリット |
| BS12-054-e2 | マネキキャット | onBattleStart | exhaust | 相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット1体を疲労 ★現状バグの疑い |
| BS12-056-e2 | ジェット・レイ | onBlock | exhaust | 相手のスピリット2体を疲労させる。 | ignore | 相手のスピリット2体を疲労 ★現状バグの疑い |
| BS12-X01-e2 | 金牛龍神ドラゴニック・タウラス | onBlocked | lifeCoresBySymbolDiff | ブロックした相手のスピリットとシンボルの数を比べ、多かった分だけ相手のライフのコアをリザーブへ。 | use | ブロックした相手のスピリットとシンボルの数を比べ |
| BS12-X04-e4 | 月光神龍ルナテック・ストライクヴルム | onBlock | returnToHand | このスピリットのBP以下の相手のスピリット1体を手札に戻す。 | ignore | このスピリットのBP以下の相手のスピリット1体 ★現状バグの疑い |
| BS12-X06-e2 | 海賊王レヴィアダン | onBattleEnd | pay | バトル終了時、効果の記述を持たない自分のスピリット1体を破壊することで、このスピリットは回復する。 | ignore | 自分側の選択・コスト／手札 |
| BS13-004-e2 | フォボス・ドラグーン | onBattleEnd | summonFromHandFree | バトル終了時、このスピリットと自分のコスト3以上のスピリット1体を破壊することで、神星の手札スピリットを無コスト召喚。 | ignore | 自分側の選択・コスト／手札 |
| BS13-007-e2 | 豹竜パンドランサー | onBattleStart | destroy | BP5000以下の相手のスピリット1体を破壊する。 | ignore | BP5000以下の相手のスピリット1体 ★現状バグの疑い |
| BS13-008-e2 | 恐竜王メガロ・ザウル | onBlocked | pay | このスピリットがブロックされたとき、系統：「地竜」を持つ自分のスピリット1体を手札に戻すことで、このスピリットは回復する | ignore | 自分側の選択・コスト／手札 |
| BS13-X02-e3 | 蛇皇神帝アスクレピオーズ | onBlock | removeCores | このスピリットがブロックした相手のスピリットの[ソウルコア]以外のコアすべてをボイドに置く。 | use | このスピリットがブロックした相手のスピリット |
| BS13-023-e2 | マウンテン・セイカイ | onBattleEnd | refreshSelf | バトル終了時、このスピリットのブレイヴ1つを手札に戻すことで、このスピリットは回復する。 | none |  |
| BS13-030-e2 | リーサルウェポンドラゴン | onBattleStart | returnToHandEachHeavyArmorColor | このスピリットが持つ【重装甲】と同じ色の相手のスピリット1体ずつを手札に戻す。 | ignore | 自分側の選択・コスト／手札 |
| BS13-031-e2 | 虹竜アウローリア | onBlock | timedEffect | 系統：「甲竜」を持つ自分のスピリット1体につき、このスピリットをBP+2000する。 | none |  |
| BS13-056-e2 | ホーク・ブレイカー | onBlock | timedEffect | バトルしている相手のスピリットのシンボル1つにつき、このスピリットをBP+5000する。 | none |  |
| BS13-039-e3 | 神獣バーロン | onBattleEnd | pay | ターンに1回、バトル終了時、自分のライフのコア1個をリザーブに置くことで、このスピリットは回復する。 | none |  |
| BS13-040-e3 | 金星神龍ヴィーナ・フェーザー | onBlocked | placeCores | 相手のスピリットにブロックされたとき、このスピリットのシンボル1つにつき、ボイドからコア1個を自分のライフに置く。 | none |  |
| BS14-032-e2 | ヤツノカンゾウ | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS14-037-e2 | エゾノ・アウル | onBlock | placeCores | 自分のバーストをセットしているとき、ボイドからコア1個をこのスピリットに置く。 | none |  |
| BS14-055-e3 | ミスティック・ヒミコ | onBattleStart | magicFreeUseFromHandOrTegamoto | 自分の黄のマジックカード1枚を、フラッシュタイミングでコストを支払わずに使用できる。 | none |  |
| BS14-X03-e4 | 風の覇王ドルクス・ウシワカ | onBattleEnd | bpBuff | バトル終了時、このスピリットを手札に戻すことで、このターンの間、自分のスピリット1体をBP+3000する。 | ignore | 自分のスピリット1体をBP+3000(自分側) ★現状バグの疑い |
| BS15-020-e2 | パンダル | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS15-023-e2 | タケノ・サイガー | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS15-024-e2 | グアン・チョーウン | onBlocked | exhaust | このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる。 | ignore | 相手は、相手のスピリット…を疲労（暴風。excludeTarget有） |
| BS15-028-e1 | フェネボラック | onBlock | timedEffect | 相手のフィールドのスピリットの色1色につき、このスピリットをBP+2000する。 | none |  |
| BS15-033-e1 | キマイラ・デブリ | onBlock | timedEffect | 相手のフィールドのスピリット/ネクサスの色1色につき、このスピリットをBP+3000する。 | none |  |
| BS15-033-e2 | キマイラ・デブリ | onBlock | exhaust | 相手のフィールドのスピリット/ネクサスの色1色につき、相手のスピリット1体を疲労させる。 | ignore | 色1色につき、相手のスピリット1体を疲労 ★現状バグの疑い |
| BS15-034-e3 | ミブロック・ジーナス | onBattleStart | returnToHand | バースト効果を持たない相手のスピリット1体を手札に戻す。 | ignore | バースト効果を持たない相手のスピリット1体 ★現状バグの疑い |
| BS15-X03-e1 | 鳥武帝スザクロス・ソウソー | onBattleStart | timedEffect | 相手はバーストを発動できない。 | none |  |
| BS16-X06-e3 | 霊峰魔龍ヤマタノヒドラ | onBattleEnd | deployNexus | バトル終了時、自分のトラッシュのネクサスカード1枚を、コストを支払わずに配置できる。 | none |  |
| BS16-014-e2 | オカピエン | onBlock | removeCores | アタックしている相手のスピリットのコア2個を相手のリザーブに置く。 | use | アタックしている相手のスピリット |
| BS16-034-e1 | ブロンタール | onBlock | exhaust | 自分のバーストをセットしているとき、相手のスピリット1体を疲労させる。 | ignore | 相手のスピリット1体を疲労 ★現状バグの疑い |
| P070-e2 | カオティック・リクゴー | onBattleStart | timedEffect | バトル解決時、BPの低いスピリットではなく、BPの高いスピリットが破壊される。BPが同じとき、お互いのスピリットが破壊さ | none |  |
| SD01-018-e2 | 草原の狩人キングゲパルド | onBattleStart | placeCores | ボイドからコア1個を自分のリザーブに置く。 | none |  |
| SD01-020-e2 | ヒトデム | onBlock | timedEffect | このスピリットをBP+2000する。 | none |  |
| SD01-024-e1 | 人馬機兵アトリーズ | onBlock | timedEffect | このスピリットをBP+3000する。 | none |  |
| SD01-024-e2 | 人馬機兵アトリーズ | onBlock | refreshSelf | BP4000以下の相手のスピリットをブロックしたとき、このスピリットは回復する。 | none |  |
| SD02-002-e1 | ミザール | onBlock | exhaust | アタックしている相手のスピリットと同じコストのスピリットすべてを疲労させる。 | use（同コストの基準にイベント対象が要る。2026-10-01 メインループ判断） | アタックしている相手のスピリットと同じコストのスピリットすべて イベント対象は対象選択ではなく『同コスト』の比較基準として参照(filter.sameCostAsEventTarget)、対象自体は全体(all)。イベント対象自身も含めて疲労するので現状でも結果は変わらない見込みだが、use/ignoreどちらのフラグを付けるか未定。 |
| SD02-003-e1 | 天使デュナミス | onBlock | endAttackStepAfterBattle | 相手のコスト2以下のスピリットをブロックしたとき、今行っているバトルが終了したら、アタックステップを終了する。 | none |  |
| SD06-007-e3 | 英雄龍ロード・ドラゴン | onBattleEnd | pay | バトル終了時、自分のバースト1つを破棄することで、このスピリットを回復させる。 | none |  |
