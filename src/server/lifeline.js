// 命綱（CONTRACTS §68.2）: 止める合図を待つ。SIGINT・SIGTERM・SIGHUP、lifeline なら標準入力が閉じたとき（end・close）も。
// Mac のアプリは標準入力を Pipe にして閉じずに持つ。アプリが落ちれば OS が管を閉じるので、サーバーが残らない。

/** stop() が片づくまで待つ Promise を返す（終了コード 0）。止める合図は1回だけ効く */
export function holdUntilStopped(stop, { lifeline = false, input = process.stdin } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    let stopping = false;
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const cleanup = () => {
      for (const signal of signals) process.off(signal, shutdown);
      if (lifeline) {
        input.off('end', shutdown);
        input.off('close', shutdown);
        input.off('error', shutdown);
        input.pause();
        input.unref?.();
      }
    };
    function shutdown() {
      if (stopping) return;
      stopping = true;
      Promise.resolve().then(stop).then(() => {
        cleanup();
        resolveRun(0);
      }, (error) => {
        cleanup();
        rejectRun(error);
      });
    }
    for (const signal of signals) process.on(signal, shutdown);
    if (lifeline) {
      input.on('end', shutdown);
      input.on('close', shutdown);
      input.on('error', shutdown);
      // 中身は読み捨てる（流れていないと end が来ない）
      input.on('data', () => {});
      input.resume();
    }
  });
}
