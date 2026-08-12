import { useEffect, useRef } from "react";

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise;

function loadTurnstile() {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
    const script = existingScript || document.createElement("script");

    function handleLoad() {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("Turnstile did not initialize."));
      }
    }

    function handleError() {
      turnstileScriptPromise = undefined;
      reject(new Error("Turnstile could not load."));
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });

  return turnstileScriptPromise;
}

function TurnstileWidget({ action, onError, onExpire, onVerify, siteKey }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    let widgetId;

    if (!siteKey) {
      onError("Account verification is not configured yet.");
      return undefined;
    }

    loadTurnstile()
      .then((turnstile) => {
        if (!isMounted || !containerRef.current) {
          return;
        }

        widgetId = turnstile.render(containerRef.current, {
          action,
          appearance: "interaction-only",
          callback: onVerify,
          "error-callback": () => onError("Verification failed. Please try again."),
          "expired-callback": onExpire,
          sitekey: siteKey,
          size: "flexible",
          theme: "dark",
        });
      })
      .catch(() => {
        if (isMounted) {
          onError("Verification could not load. Check your connection and try again.");
        }
      });

    return () => {
      isMounted = false;

      if (widgetId !== undefined && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [action, onError, onExpire, onVerify, siteKey]);

  return (
    <div className="turnstile-field">
      <div ref={containerRef} aria-label="Bot verification" />
      <p className="field-help">Complete the verification before continuing.</p>
    </div>
  );
}

export default TurnstileWidget;
