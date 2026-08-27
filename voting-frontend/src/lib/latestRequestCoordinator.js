export function createLatestRequestCoordinator() {
  let activeRequest = null;
  let requestSequence = 0;

  function run(key, request, { force = false } = {}) {
    if (!force && activeRequest?.key === key) {
      return activeRequest.promise;
    }

    activeRequest?.controller.abort();

    const controller = new AbortController();
    const requestId = ++requestSequence;
    const promise = Promise.resolve()
      .then(() => request({
        isLatest: () => requestId === requestSequence,
        signal: controller.signal,
      }))
      .finally(() => {
        if (activeRequest?.requestId === requestId) {
          activeRequest = null;
        }
      });

    activeRequest = {
      controller,
      key,
      promise,
      requestId,
    };

    return promise;
  }

  function cancel() {
    requestSequence += 1;
    activeRequest?.controller.abort();
    activeRequest = null;
  }

  return { cancel, run };
}
