---
title: "Bombay Beach Biennale Schedule Map"
date: "2026-04-01"
client: "Bombay Beach Biennale"
thumb: "assets/image/map-and-schedule-app.png"
hashtags:
  - "cartography"
  - "field mapping"
  - "react"
  - "data pipeline"
  - "map"
  - "collaboration"
roles:
  - role: "DESIGN & DEVELOPMENT"
    name: "YULIA VVEDENSKAYA"
  - role: "DATA PIPELINE"
    name: "VINCENT NAPLES"
---

For the Bombay Beach Biennale, an annual arts festival in Bombay Beach, CA, we built an [interactive map and schedule app](https://bbb-map-app.vercel.app/) to replace a static map and a hard-to-read mobile spreadsheet that forced attendees to jump between tools to figure out what was happening, where, and when. The project is a collaboration with [VVEX STUDIO](https://vvex.studio) partner Yulia Vvedenskaya.

The bigger challenge was behind the scenes: event data lived across Google Sheets, Airtable, emails, and form submissions — all frequently out of sync. Rather than forcing a new CMS on the team, I built a data pipeline around the tools they already used, ingesting, cleaning, and merging messy inputs into a single canonical source of truth. The app stayed resilient through last-minute edits, with no manual copy/paste updates.

The React-based frontend, integrating the Google Maps API, features a live map with venue pins, a schedule/calendar view with date and time filtering, and detail panels for each venue and event — all wrapped in a mobile-first UX for attendees navigating the town in real time. The result: a static festival map became a navigable, real-time event experience for attendees, and a far more manageable update workflow for organizers.

See also the companion case study at [vvex.studio/projects/bombay-beach-biennale](https://vvex.studio/projects/bombay-beach-biennale/).
