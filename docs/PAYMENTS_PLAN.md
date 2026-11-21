# Payments plan (not built)

Status: **plan only. No code, serverless function or key exists for payments.** The only live element is the Support link to <https://paypal.me/michaelinzo77> in the About dialog and the README (en and fr). That link is a plain external link: it takes no money inside the game and unlocks nothing.

## Goal
Let a player buy optional cosmetic items (for example a lantern colour) with real money, without changing any gameplay rule, sanity value or seed output.

## Rules that must hold
- Cosmetic only. Core determinism, dread and sanity never read an entitlement.
- No secret in the repository, the browser, logs or CI output. The PayPal client secret and webhook id live only as Vercel environment variables that the author sets in the Vercel dashboard.
- The browser never decides that a payment succeeded. The server does.
- The demo stays fully playable and free without paying.

## Design
1. **Orders**: PayPal Orders v2. A same-origin Vercel serverless function (for example `/api/orders`) creates the order with the price taken from a server-side catalogue, never from the request body.
2. **Capture**: a second same-origin function (`/api/orders/capture`) captures the order server-side and checks status `COMPLETED`, amount, currency and the catalogue item.
3. **Webhook**: a function receives PayPal webhooks and verifies the signature with PayPal's verify-webhook-signature API before trusting the event. It handles completed, refunded and reversed payments.
4. **Entitlement store**: a small server-side store keyed by an opaque player token (for example Vercel KV or another managed store the author chooses), holding item ids. The client asks `/api/entitlements` and only changes the look of an item.
5. **Idempotency**: PayPal order id is the key, so a retried capture or a repeated webhook grants an item once.
6. **Client**: loads the PayPal button only after the player opens the shop, with a strict Content Security Policy that allows PayPal and nothing else new.

## Sandbox first
Build and test against PayPal sandbox accounts and sandbox credentials. Switch to live credentials only after the author has tested capture, refund and webhook flows end to end and completed the duties below.

## Author's legal and business duties (not code)
- Refund policy and how refunds revoke an entitlement.
- Tax and VAT handling, invoices, and business registration where required.
- Terms of sale, privacy notice and consumer rights for the player's country.
- Age rules: do not sell to children without the consent the law requires, and decide whether to gate purchases by age.
- PayPal account and merchant agreement compliance, and chargeback handling.

## Failure conditions to test
Amount tampering, replayed capture, forged webhook, webhook before capture, refund after grant, store outage (the player keeps free items, the game keeps running), and a missing environment variable (the shop hides itself and logs a clear server-side error).

## Not in scope here
Real-money checkout is a later round (see `.kiro/specs/tasks.md`). Nothing in this document is Verified; it is a design.
