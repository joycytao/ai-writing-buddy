const randomState = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const openOAuthPopup = ({ authorizationUrl, state, timeoutMs = 120000 }) => {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      authorizationUrl,
      'cloud_oauth_popup',
      'width=560,height=720,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes'
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups and try again.'));
      return;
    }

    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timer);
      if (closeWatcher) window.clearInterval(closeWatcher);
      window.removeEventListener('message', handleMessage);
    };

    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const timer = window.setTimeout(() => {
      try {
        popup.close();
      } catch {
        // no-op
      }
      settleReject(new Error('OAuth popup timed out.'));
    }, timeoutMs);

    const closeWatcher = window.setInterval(() => {
      if (!popup.closed) return;
      settleReject(new Error('OAuth popup was closed before completing sign-in.'));
    }, 300);

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      const payload = event.data;
      if (!payload || payload.type !== 'cloud-oauth-callback') return;
      if (payload.state !== state) return;

      try {
        popup.close();
      } catch {
        // no-op
      }

      if (payload.error) {
        settleReject(new Error(payload.error));
        return;
      }

      settleResolve({
        accessToken: payload.accessToken,
        expiresIn: Number(payload.expiresIn || 0),
      });
    };

    window.addEventListener('message', handleMessage);
  });
};

export const createOAuthState = () => randomState();
