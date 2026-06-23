# Brown Booys — Production Build

This package contains three deployable projects:

```
backend/             Node.js + Express + MongoDB + Razorpay + Cloudinary API
frontend-customer/   Customer-facing ordering app (React)
frontend-admin/      Admin panel (React)
```

---

## 0. ⚠️ ROTATE YOUR SECRETS FIRST — DO THIS BEFORE ANYTHING ELSE

The `_env` file you shared during this audit contained **live, real
credentials** (MongoDB Atlas password, Razorpay live key + secret,
Cloudinary API secret, admin password). Those values must be treated as
**compromised** regardless of any code changes, because they were
transmitted in plaintext in this conversation.

Before deploying, **rotate every one of these**:

1. **MongoDB Atlas** → Database Access → edit the database user → reset
   password. Update `MONGO_URI` everywhere.
2. **Razorpay** → Settings → API Keys → regenerate the live key secret
   (and key id if possible). Update `RAZORPAY_KEY_ID` /
   `RAZORPAY_KEY_SECRET`.
3. **Cloudinary** → Settings → Security → regenerate API secret. Update
   `CLOUDINARY_API_SECRET`.
4. **Admin password** → pick a new long random string (32+ chars) and
   set it as `ADMIN_PASSWORD`. This is the only "login" the admin panel
   has — anyone with this string has full control of your menu, orders,
   and shop settings.

Never commit a real `.env` file to git. Only `.env.example` (with
placeholder values) is included in this package.

---

## 1. Backend Deployment (Render / Railway)

### Setup
```bash
cd backend
npm install
```

### Environment variables (set these in your host's dashboard, NOT in code)
See `backend/.env.example` for the full list:
- `MONGO_URI`
- `PORT` (Render sets this automatically — you can omit it)
- `FRONTEND_ORIGINS` — comma-separated list of your deployed frontend
  URLs, e.g.:
  ```
  https://brownbooys.netlify.app,https://brownbooys-admin.netlify.app
  ```
  **This is required.** Without it, CORS will block all requests from
  your frontend (or, if left empty, CORS allows all origins —
  acceptable for first deploy/testing, but tighten it before going live).
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `ADMIN_PASSWORD`

### Render-specific notes
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health` (returns `{ status: "ok" }`)
- **Cold starts**: Render's free tier sleeps after ~15 min of
  inactivity. The first request after sleeping will be slow (10–30s)
  while the instance wakes and reconnects to MongoDB. Shop settings and
  menu data persist in MongoDB, so a cold start no longer wipes your
  configuration (this was Bug #18 in the original code — now fixed).
  Consider a paid plan or an external uptime-pinger hitting
  `/api/health` every 10 minutes if cold starts are unacceptable for
  your customers.

### What the server does on boot
1. Validates required env vars are present (exits with a clear error if
   not — check your Render logs if it won't start).
2. Connects to MongoDB.
3. Seeds the default menu **only if items don't already exist** (uses
   `findOneAndUpdate` with `$setOnInsert` — safe to redeploy without
   wiping admin edits).
4. Loads shop settings (delivery pricing, open/closed, shop location)
   from MongoDB.
5. Starts listening.

---

## 2. Customer Frontend Deployment (Netlify / Vercel)

```bash
cd frontend-customer
npm install
npm run build
```

### Environment variables
- `REACT_APP_API_BASE` — your backend's public URL, no trailing slash,
  e.g. `https://brownbooys-backend-api.onrender.com`

  If you don't set this, it falls back to the URL hardcoded in
  `src/utils/constants.js`. **You should set it explicitly** in your
  Netlify/Vercel dashboard so you can change backends without a code
  change.

### Netlify
- Build command: `npm run build`
- Publish directory: `build`
- `public/_redirects` is already included (`/* /index.html 200`) so
  client-side routing/refreshes on any path work correctly (SPA refresh
  issue — fixed).

### Vercel
- Framework preset: Create React App
- The `_redirects` file is ignored by Vercel but Vercel handles SPA
  routing automatically for CRA — no extra config needed.

---

## 3. Admin Panel Deployment (Netlify / Vercel — separate site)

```bash
cd frontend-admin
npm install
npm run build
```

Deploy this as a **separate site** from the customer frontend (different
URL, e.g. `admin.yourdomain.com` or a separate Netlify site). Same
`REACT_APP_API_BASE` env var applies.

**Important**: add this admin site's URL to the backend's
`FRONTEND_ORIGINS` env var, or the admin panel's API calls will be
blocked by CORS.

The admin panel has `<meta name="robots" content="noindex, nofollow" />`
in its `public/index.html` so search engines won't index it, but this is
not a substitute for the password — anyone who finds the URL can attempt
to log in, so the rate limiter on `/api/admin/login` (10 attempts per 15
minutes) is your actual brute-force protection.

---

## 4. Razorpay Go-Live Checklist

1. Switch from test keys (`rzp_test_...`) to live keys
   (`rzp_live_...`) in the backend env vars only — never in frontend
   code (the frontend receives the public `key_id` dynamically from
   `/api/payment/create-order`).
2. In the Razorpay dashboard, complete KYC/business verification —
   live mode won't accept real payments until this is done.
3. Test the full flow end-to-end with a real (small) payment before
   announcing launch: place order → Razorpay checkout opens → pay →
   `/api/payment/verify` confirms → order appears in admin panel with
   status "Paid".
4. Set up Razorpay webhook (optional but recommended) for payment
   reconciliation if orders ever get stuck in "Pending" due to a dropped
   connection after payment.

---

## 5. Post-Deploy Smoke Test

- [ ] `GET https://your-backend/api/health` → `{ "status": "ok" }`
- [ ] `GET https://your-backend/api/menu` → returns 19 seeded items
- [ ] Customer site loads, menu renders, search/category filters work
- [ ] Add items to cart, cart persists across page refresh
- [ ] Switch order type to Delivery → "Auto-detect location" prompts for
      browser permission and shows a distance + charge
      (requires shop coordinates to be set in Admin → Settings → Shop
      Location first)
- [ ] Place a pickup/dine-in order with a small test payment
- [ ] Admin panel: log in with `ADMIN_PASSWORD`
- [ ] Admin panel: new order appears within ~3 seconds (polling), with
      sound alert
- [ ] Admin panel: change order status, toggle shop open/closed, toggle
      delivery on/off — confirm customer site reflects changes within
      30 seconds
- [ ] Admin panel: add a menu item with an image upload (Cloudinary)
- [ ] Admin panel: upload an offer banner, confirm it appears on
      customer homepage

---

## 6. What changed in this audit (summary)

See the full audit report delivered alongside this package for the
complete file-by-file breakdown. Highlights:

- **Critical**: fixed `CloudinaryStorage is not a constructor` crash on
  every server boot (wrong import shape for
  `multer-storage-cloudinary@2.x`).
- **Critical**: server-side order total validation — a tampered client
  can no longer submit a cart total lower than the real item sum.
- **Critical**: Razorpay payment verification now uses constant-time
  signature comparison and double-checks payment status with Razorpay
  directly (defense against replay/forged callbacks).
- **Critical**: duplicate-payment protection — a `paymentId` can only be
  used for one order (DB-level unique index + app-level check).
- Added: helmet security headers, rate limiting (general API + stricter
  admin login limiter), CORS allowlist via env var, request body size
  cap, env var validation on boot.
- Added: shop coordinates (for delivery distance calculation),
  `getDeliveryLocation()` implementation (was imported but missing —
  would have crashed on first "Auto-detect location" click).
- Rebuilt: `frontend-customer/src/App.js` from scratch — the uploaded
  version was a disconnected static-menu prototype that didn't use any
  of the cart/checkout/orders/Razorpay infrastructure already built.
- Fixed: `admin/useSound.js` — the new-order alert sound could fail
  silently on the very first order of a session because the
  AudioContext "unlock" only listened for `click` and didn't handle a
  rejected `resume()`. Now listens for click/touchstart/keydown and
  logs a clear warning instead of throwing an unhandled rejection.
- Added: `frontend-admin/src/__tests__/` — regression tests covering
  login, add-item + image upload (success and failure paths), shop/
  delivery toggles, order status updates, order deletion, offer banner
  upload/delete, settings save, and 401 auto-logout. Run with
  `npm test` (CI=true for non-interactive).
- Added: `frontend-customer/src/__tests__/` — 31 regression tests
  covering menu loading/search/category filters/language switching,
  cart add/remove/quantity/localStorage persistence, checkout for
  pickup/dine-in/delivery, full Razorpay success/failure/cancel flows,
  geolocation success/permission-denied/timeout/unsupported, manual
  address entry, shop-closed and delivery-off banners, orders tab,
  login/logout, and offer banner (static fallback + live).
- Fixed (real production bug): `utils/razorpay.js` + `App.js` — if
  `checkout.razorpay.com` is blocked by an ad-blocker or privacy
  extension (common), `loadRazorpayScript()` previously could resolve
  `true` anyway, causing `new window.Razorpay(...)` to throw a cryptic
  "Razorpay is not a constructor" error. Now explicitly checks for
  `window.Razorpay` and shows the customer a clear, actionable message
  ("Payment gateway blocked by your browser...") instead.
- Fixed (edge case): server-side delivery coordinates of exactly `0`
  (equator/prime meridian) were silently converted to `undefined` by
  `Number(x) || undefined`; now uses `isFinite()` so `0` is preserved
  correctly.
- Removed: ~10 dead backend files (unused routes/controllers/models that
  `server.js` never imports) and ~7 dead frontend files in the admin
  project to avoid confusion on future edits.
- Fixed: `isNew` reserved-Mongoose-key warning, redundant `role="list"`
  a11y lint error (was failing `CI=true` builds), App.test.js (was
  asserting on text that doesn't exist in this app).

---

## 7. Running the test suites

Both frontends have automated tests covering the flows described above.
Run them after `npm install`:

```bash
cd frontend-customer && CI=true npm test -- --watchAll=false
cd frontend-admin    && CI=true npm test -- --watchAll=false
```

Expected: 4 test suites / 31 tests passed (customer), 4 test suites /
14 tests passed (admin) — 45 tests total, all passing as of this build.
Use these as regression checks after any future code change.

---

## 8. Latest round of fixes (security + verification recheck)

**🔴 Critical — Admin auth upgraded from raw password to JWT**
Previously the admin panel stored the actual admin password in
`localStorage` and sent it as a header on every request. Now:
- `POST /api/admin/login` issues a signed JWT (12-hour expiry) instead
  of just confirming success.
- The admin frontend stores this JWT, never the password itself, and
  sends it as `Authorization: Bearer <token>`.
- **New required env var: `JWT_SECRET`** — add this to Render. If you
  don't set it, the server derives one from `ADMIN_PASSWORD` and logs a
  warning, but a separate dedicated secret is strongly recommended:
  ```
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- The old `x-admin-password` header still works as a fallback for one
  transition period — you don't have to log out immediately after
  deploying this, but new logins will use the JWT flow automatically.

**🟢 Verified, no bug found — `_id` vs `id` consistency**
Traced every identifier touchpoint across backend, admin, and customer
frontend. Menu items intentionally use a custom numeric `id` field;
Orders and Offers use MongoDB's native `_id`. Every consumer correctly
uses the right one for the right model — no mismatch found.

**🟢 Verified, no bug found — route registration**
`/api/admin/login`, `/api/offers`, and `/api/offers/all` are all
registered correctly as distinct literal paths with no shadowing or
ordering issues.

**🟢 Verified, already implemented — order date visibility**
Both customer and admin order cards already displayed the order
date/time. Upgraded the customer side to match the admin's more robust
formatter, which prefers the server-generated `createdAt` timestamp
over client-supplied `date`/`time` strings (which depend on the
customer's device clock and are missing on very old orders).

**🟢 Verified — orders persist correctly across logout**
Orders live permanently in MongoDB tied to the customer's phone number
(`userId`) and are never deleted on logout — only hidden from view
until the same number logs back in. Confirmed with an automated test
that logs in, places/sees an order, logs out, logs back in with the
same number, and confirms the same order reappears.

**🟠 Minor fix — order-list refresh on user switch**
`usePolling`'s dependency was `[!!user?.id]` (just true/false) instead
of `[user?.id]` (the actual id). If a customer logged out and a
different customer logged in on the same device without a page
reload, the order list would still update correctly but could lag up
to 8 seconds behind. Changed to depend on the actual id so switching
users refreshes immediately. No data was ever lost or shown
incorrectly — this was a responsiveness fix, not a correctness fix.

**New tests added**: `frontend-customer/src/__tests__/order-date-and-persistence.test.js`
(3 tests) — total customer test count is now 34, admin remains 14.
48 tests total, all passing.

---

## 9. Edit-item image upload fix

**🟠 Found and fixed**: the "Edit Item" form only let you replace an
item's image by pasting a URL — there was no file picker, unlike the
"Add Item" form which lets you upload directly from your device. Now
both forms work identically: pick a file (uploads to Cloudinary
automatically) or paste a URL, your choice. Leaving both blank keeps
the existing image untouched. 6 new tests added to
`frontend-admin/src/__tests__/menu-crud.test.js` covering add, edit
(prefill, save, file upload, leave-unchanged), and delete — all
passing. Admin test count is now 23.

---

## 10. Sound button now plays a test beep

**🟠 Fixed**: clicking 🔔 Sound previously only toggled mute silently —
there was no way to hear the alert or confirm your speakers/volume
without waiting for a real new order. Now there are two buttons:
**🔔 Sound** plays the notification sound immediately as a test (and
automatically unmutes first if you were muted), and a separate
**Mute/Unmute** button handles turning alerts on/off without ever
playing audio itself. 3 new tests added
(`frontend-admin/src/__tests__/sound-button.test.js`). Admin test
count is now 26.
