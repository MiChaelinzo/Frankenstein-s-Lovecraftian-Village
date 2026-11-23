import { PAYPAL_CLIENT_ID, PAYPAL_PLAN_ID, PAYPAL_ENVIRONMENT } from './paypal-config.js';

const SDK_BASE = 'https://www.paypal.com/sdk/js';
let sdkPromise;

function loadPayPalSdk() {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (!PAYPAL_CLIENT_ID || !PAYPAL_PLAN_ID) {
    return Promise.reject(new Error('Monthly support is not configured yet. Add the PayPal Sandbox client ID and plan ID in web/src/paypal-config.js.'));
  }
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const params = new URLSearchParams({
        'client-id': PAYPAL_CLIENT_ID,
        vault: 'true',
        intent: 'subscription',
        currency: 'USD',
      });
      script.src = `${SDK_BASE}?${params}`;
      script.async = true;
      script.onload = () => window.paypal ? resolve(window.paypal) : reject(new Error('PayPal checkout could not be loaded.'));
      script.onerror = () => reject(new Error('PayPal checkout could not be loaded. Check the connection and try again.'));
      document.head.append(script);
    }).catch((error) => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise;
}

export async function mountPayPalSubscription(container, status, translate) {
  container.replaceChildren();
  status.textContent = translate('about.membership.loading');
  try {
    const paypal = await loadPayPalSdk();
    await paypal.Buttons({
      style: { shape: 'rect', color: 'silver', layout: 'vertical', label: 'subscribe' },
      createSubscription(_data, actions) {
        return actions.subscription.create({ plan_id: PAYPAL_PLAN_ID });
      },
      onApprove() {
        status.textContent = translate('about.membership.approved');
      },
      onError() {
        status.textContent = translate('about.membership.error');
      },
    }).render(container);
    status.textContent = PAYPAL_ENVIRONMENT === 'sandbox'
      ? translate('about.membership.sandbox')
      : translate('about.membership.ready');
  } catch (error) {
    status.textContent = !PAYPAL_CLIENT_ID || !PAYPAL_PLAN_ID
      ? translate('about.membership.config')
      : error instanceof Error ? error.message : translate('about.membership.error');
  }
}
