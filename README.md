# Football Academy Manager

A simple web app for running a football academy with three age groups. Use it to register players, take attendance, track monthly fees and pull attendance reports.

It's plain HTML, CSS and JavaScript with no install or build step and no server. It works offline and on phones.

## Getting started

Open `index.html` in any modern browser. Or host the folder on any static host (for example GitHub Pages) and open it on your phone at training.

To try the app before adding real players, go to **Settings → Load demo data**.

## Features

- **Dashboard**: active players, this month's attendance rate, fees collected and outstanding, a card for each age group, recent sessions, and players whose attendance has dropped (below 60% over the last 30 days).
- **Players (registrations)**: name, date of birth, age group, parent or guardian, phone, email, address, medical info and notes. The app suggests an age group from the date of birth. You can search and filter, mark players inactive to keep their history, and export to CSV.
- **Attendance**: pick a group and date, then mark each player as **P**resent, **L**ate, **E**xcused or **A**bsent. There are "All present" and "Unmarked → absent" shortcuts, and you can add session notes. You can reopen and edit past registers.
- **Payments**: set a monthly fee for each group. Record payments by month, see who has paid, who has paid part, and who hasn't paid.
- **Reports**: attendance for each player over any date range (last 30 or 90 days, or all time), filtered by group. You can export to CSV or print.
- **Settings**: rename the three age groups (Under 8, Under 12 and Under 16 by default) and set their age ranges, training times, fees and colours. You can also change the academy name and currency, and back up or restore your data.

Excused absences don't count against a player's attendance rate.

## Your data

Data is saved in the browser on the device you use (`localStorage`). It isn't shared between devices, and clearing your browser data deletes it. Use **Settings → Download backup** regularly. To move data to another device, restore the backup file there.
