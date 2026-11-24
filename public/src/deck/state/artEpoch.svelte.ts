// 合言葉でカード絵の表示が切り替わったら増やす。一覧は {#key} で張り直し、use:cardArt をやり直す
export const artEpoch = $state({ n: 0 })
