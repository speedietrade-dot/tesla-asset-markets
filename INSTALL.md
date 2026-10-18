# Tesla Asset Markets — Dashboard and Admin Upgrade

This update keeps the supplied homepage HTML (`customer/index.html`) and homepage stylesheet (`customer/styles.css`) byte-for-byte unchanged. The homepage's sign-in/create-account form now uses the existing Express/PostgreSQL API so customer accounts and the admin panel use the same database. The customer dashboard is redesigned to closely follow the supplied reference, with account cards, a portfolio chart, popular stock cards, Tesla car marketplace, investment plans, transactions, funding requests, and token-protected withdrawals.

## Features

- New customer dashboard layout inspired by the supplied screenshot.
- Popular TSLA, NVDA, AAPL, MSFT, AMZN, and GOOGL cards.
- Tesla Model S, Model 3, Model X, Model Y, Cybertruck, Cybercab, and Roadster cards.
- Nine editable investment plans seeded once if the database has no plans.
- One shared admin-configured Bitcoin address; investment plan requests remain pending until reviewed.
- New admin console at `/admin`.
- Admin can adjust customer balance/investment/profit with a required reason, assign/revoke single-use withdrawal tokens, add stock holdings, edit plan prices/names/availability, configure the Bitcoin address, approve/decline pending requests, and delete accounts.
- Permanent account deletion removes the user row/password hash and scrubs the request description while preserving financial transaction/holding rows under an anonymous `deleted-customer-ID` reference. The existing PostgreSQL database is not dropped or recreated.
- Withdrawal tokens are bcrypt-hashed, single-use, and consumed server-side. A token is not a fee and should never be sold to a customer.
- Stock and vehicle purchase cards create simulated requests only. No real stock trading, vehicle ordering, money transfer, or blockchain payment verification is connected.

## Important files

- `customer/index.html` — original homepage markup; unchanged.
- `customer/styles.css` — original homepage stylesheet; unchanged.
- `customer/app.js` — same homepage content/rendering, with sign-in/registration switched to backend API authentication.
- `customer/dashboard.html`, `dashboard.css`, `dashboard.js` — new customer dashboard.
- `admin/` — new admin console.
- `server.js` — backend routes and additive PostgreSQL migrations.

## Before testing

1. **Back up PostgreSQL first.** Use Render's database backup/export option before deploying.
2. Merge these files into a copy of your existing project. Do not delete your existing `assets/` directory. The original homepage image/video assets were not present in the uploaded source set, so copy your existing `assets/` folder into this project to keep the homepage media working.
3. Copy `.env.example` to `.env` for local testing and set real values privately. Never commit `.env` or share its contents.
4. Set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Use a long random `JWT_SECRET` and a unique strong admin password. The example values are placeholders only.
5. Install dependencies with `npm install`.
6. Run `npm test` for JavaScript syntax checks, then `npm start`.
7. Open `http://localhost:10000/` for the homepage, sign in/create a customer account, and open `http://localhost:10000/admin` for the admin console.

## Existing account note

Customer accounts created by the older browser-only localStorage form are not in PostgreSQL and cannot automatically sign in to the new API-backed flow. Existing PostgreSQL users are preserved. Do not delete your old project or database; test with a new local copy first.

## Financial and payment limitations

This is an academic/demo interface. Account values and stock holdings are administrator-entered simulated data. Admin approval/decline changes a request status only; it does not transfer funds or execute a trade. The Bitcoin address is displayed for reference, but the app does not verify blockchain confirmations. Do not use this as a real brokerage or payment platform without a proper licensed, secure payment and compliance implementation.
