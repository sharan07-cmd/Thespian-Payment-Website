# Seat Booking — Seat Selection Page

Step 1 of the project: the visual seat map, matching the auditorium layout
(25 rows, rows 1-24 split into two 6-seat blocks with a center aisle, row 25
unsplit with 15 seats — 303 seats total).

This is frontend-only for now: seat availability is a hardcoded placeholder
in `lib/seatLayout.js`. No database or payments are wired up yet — that's
next.

## Run it locally

You'll need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd seat-booking
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## Push to GitHub

```bash
cd seat-booking
git init
git add .
git commit -m "Seat selection page"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

(Create the empty repo on GitHub first, then copy its URL for
`<your-github-repo-url>`.)

## Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click "Add New Project" and select this repo.
3. Vercel auto-detects Next.js — leave the defaults and click Deploy.
4. Every push to `main` after this will auto-deploy.

## What's next

- Move the seat layout + booking state into a real database (Postgres via
  Neon or Vercel Postgres)
- Add seat holds (temporary locks while a user checks out)
- Wire up Razorpay for payment
