# PayPal support and membership

The About dialog in the browser demo offers a one-time donation link and a PayPal-hosted monthly subscription flow. The Unity Editor exposes the same support page through **Tools > Frankenstein > Open Support Page**. Payments are optional; the game and demo remain free.

## Membership scope
This is recurring development support only. It creates no player account, grants no in-game items or features, and does not change gameplay, determinism, dread, sanity, or seed output. A client-side approval message is not proof of server-verified payment and must never be used to unlock anything.

## PayPal Sandbox setup
1. In the PayPal Developer Dashboard, create a Sandbox REST app and a monthly subscription product/plan. Set the amount and billing interval on the plan.
2. In `web/src/paypal-config.js`, set `PAYPAL_CLIENT_ID` to the app's **Sandbox client ID**, `PAYPAL_PLAN_ID` to the Sandbox plan ID, and keep `PAYPAL_ENVIRONMENT` as `sandbox` while testing.
3. Test with a PayPal Sandbox buyer account. Do not use a live client ID or real buyer account for sandbox tests.
4. For production, create and verify a live plan, use its live client ID and plan ID, and set `PAYPAL_ENVIRONMENT` to `live` only after you have tested the flow. The amount and interval are controlled by the PayPal plan.

The browser SDK requires only the public client ID and plan ID. **Do not add a client secret, webhook secret, or access token to this static demo or its repository.** A client secret is not needed for this hosted subscription flow. PayPal processes checkout; the project does not store payment details or claim membership status from the browser callback. If the product later grants benefits, it needs an authenticated player identity, server-side subscription verification, verified webhooks, and durable entitlement storage before any feature is gated.

The PayPal.Me donation link is a separate one-time support option. It does not implement Sandbox recurring billing.

## Author's business duties
Before accepting live payments, review PayPal's merchant terms, cancellation and refund handling, consumer rights, taxes/VAT, invoicing, privacy disclosures, age requirements, and any business registration obligations that apply to you.
