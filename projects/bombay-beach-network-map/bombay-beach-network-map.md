---
title: "Bombay Beach Network Map"
date: "2026-06-13"
client: "Mars College"
thumb: "assets/image/network-overview.png"
hashtags:
  - "cartography"
  - "network mapping"
  - "openlayers"
  - "drone"
  - "map"
  - "collaboration"
roles:
  - role: "DESIGN & DEVELOPMENT"
    name: "YULIA VVEDENSKAYA"
  - role: "DRONE PHOTOGRAPHY & NETWORK DATA"
    name: "VINCENT NAPLES"
---

At [Mars College](https://www.mars.college/) — an off-grid community living in the desert near Bombay Beach, CA — we built a [live map](https://neocities-network-map.vercel.app/) of the town and the college campus running on one LAN: a single, community-run internet. The idea was simple: show how that shared network actually sits on the ground, not only in a controller dashboard. The project is a collaboration with [VVEX STUDIO](https://vvex.studio) partner Yulia Vvedenskaya.

A small pipeline reads the UniFi and UISP controllers and places every radio, access point, and client on the map at its real coordinates. You get three basemaps — streets, satellite, and a drone orthophoto — with every device and link in view, light animation that suggests traffic moving across links and around access points, and a time bar to scrub sampled snapshots of usage and client connectivity across shorter and longer windows. The frontend is built on OpenLayers.

Because Google Maps doesn't show the layout of an off-grid community that builds and unbuilds itself each season, we flew DJI drone photos and stitched them into a single orthophoto aligned to the Google Maps projection — so the campus shows up exactly where it stands. Access point positions were checked on site with GPS, and for each client the detail panel reports IP, signal strength, the associated access point, uptime, and traffic.

A note on what you're looking at: this is a case study, not a running service. Mars is temporary — at the end of the season the internet in the desert is taken down together with all the buildings, so the live network no longer exists. Everything here is reconstructed from the controllers' scripts and timeline logs: snapshots, links, and client history were captured while the network was alive, which is exactly why the map can be rebuilt and replayed long after the desert has gone quiet.

See also the companion case study at [vvex.studio/projects/network-map](https://vvex.studio/projects/network-map/).
