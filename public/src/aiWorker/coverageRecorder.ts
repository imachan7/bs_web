// Worker 用の coverageRecorder の差し替え。カバレッジはテストのときだけ取るので、ブラウザでは何もしない
export function startCoverageIfRequested(): void {}
