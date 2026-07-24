---
title: "New Orleans Map"
date: "2026-06-12"
client: "Personal Project"
thumb: "assets/image/nola-trip-planner.jpg"
hashtags:
  - "cartography"
  - "map"
  - "web scraping"
  - "data pipeline"
  - "react"
  - "collaboration"
roles:
  - role: "DESIGN & DEVELOPMENT"
    name: "YULIA VVEDENSKAYA"
  - role: "DATA & DEVELOPMENT"
    name: "VINCENT NAPLES"
---

[The New Orleans Map](https://nola-map.vercel.app/) grew out of the platform we originally built for the [Bombay Beach Biennale](../bombay-beach-biennale-schedule-map/): once the map and schedule app proved itself at the festival, we turned it into a reusable template we customize for the places each of us travels to. New Orleans was the first city to get the treatment — a personal trip planner mapping food, music, neighborhoods, tours, and local tips. Like the rest of the map platform, it's a collaboration with [VVEX STUDIO](https://vvex.studio) partner Yulia Vvedenskaya.

This time the data challenge wasn't messy spreadsheets but messy people: the best recommendations for New Orleans live in local Reddit threads, scattered across years of posts and comments. The scraping turned out to be delightfully simple — append `.json` to any Reddit thread URL and it returns the whole discussion as structured JSON. Three threads gave us three JSON files, which we fed to an LLM with instructions to deduplicate repeated mentions, sort the results, and categorize each spot using the app's existing tags. That's how word-of-mouth knowledge — community-recommended venues, restaurants, and bars — became a clean, browsable map layer, from Art and Music to Food, History, and Lodging.

The frontend reuses the React + Google Maps foundation from the Bombay Beach app — live map with category-colored pins, search and filtering, favorites, schedule and calendar views, satellite/street toggle, and a mobile-first UX for navigating the city on foot. Because the template separates the platform from the data, spinning up the next city is mostly a matter of building its dataset; the map comes for free.

See also the companion case study at [vvex.studio/projects/nola-map](https://vvex.studio/projects/nola-map/).
