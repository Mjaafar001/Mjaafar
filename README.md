# Football Academy Manager

A web app for running a football academy with three age groups. Coaches share one set of data, live. Use it to register players, take attendance, track the monthly fee (₦50,000 for 8 sessions), record expenses and pull reports.

## Two ways to run it

**Shared, for all coaches (recommended).** The app is published as a claude.ai page with a shared database. Everyone you share it with sees the same players, registers, fees and expenses, and changes appear for everyone straight away. Registers, payments and expenses show which coach recorded them.

- To add a coach, open the page's **Share** menu and invite them by email with **edit** access. They need a claude.ai account.
- People with view-only access can see the data but can't change anything.

**Single device.** Open `index.html` in any browser. Data stays in that browser only.

## Features

- **Dashboard**: players, attendance, fees collected and outstanding, expenses, and the month's net. Each group gets a card showing sessions held against the 8 per month. It also lists players whose attendance has dropped (below 60% over the last 30 days).
- **Players**: registration with date of birth (the app suggests an age group), parent or guardian, phone, medical info and notes. You can search, filter and export to CSV.
- **Attendance**: tap P (present), L (late), E (excused) or A (absent) for each player, add session notes, and see "session N of 8" for the month. If two coaches edit the same register, the second to save is asked before replacing the first coach's version.
- **Fees**: ₦50,000 a month per player, covering 8 sessions. The table shows who has paid in full, paid part, or not paid, plus sessions attended out of 8.
- **Expenses**: pitch hire, equipment, kits, coach pay, transport and other costs. View them by month and category, and see net income. Export to CSV.
- **Reports**: income, expenses and net for the last 6 months, and attendance per player for any date range.
- **Settings**: the academy name, fee, sessions per month, and the age groups' names, age ranges and training times. You can also back up and restore your data.

## Development

The code is plain HTML, CSS and JS (`index.html`, `styles.css`, `app.js`). `scripts/build_artifact.py` bundles them into `dist/academy.html`, the version that gets published for coaches. In that published version, `app.js` uses the shared database; anywhere else it falls back to `localStorage`.
