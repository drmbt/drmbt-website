---
title: "PURE IMAGINATION"
date: "2024-06-27"
client: "Hero BLOOM, NYC"
thumb: "assets/image/hero.jpg"
hashtags:
  - "interactive"
  - "ai"
  - "installation"
  - "sculpture"
  - "nyc"
posterImages:
  - ["assets/poster/01_cloud_painter_tablet_interface.jpg", "assets/poster/02_draw_your_imagination.jpg"]
  - ["assets/poster/03_cloud_painter_beneath_the_sky.jpg", "assets/poster/04_a_flower_drawn_by_hand.jpg"]
roles:
  - role: "SYSTEMS ARCHITECTURE"
    name: "VINCENT NAPLES"
  - role: "CONTENT CREATION"
    name: "VINCENT NAPLES"
  - role: "CREATIVE DIRECTION"
    name: "<a href=\"https://www.spacecowboys.studio/\" target=\"_blank\" rel=\"noopener\">SPACE COWBOYS</a>"
---

PURE IMAGINATION was a real-time interactive sky built for the BLOOM exhibition at [Hero](https://www.hero-nyc.com/) in New York, a creative challenge brought to me by [Space Cowboys](https://www.spacecowboys.studio/). Visitors — mostly children — lay in a field of white blossoms under a massive 8K LED tile that filled the ceiling of the room. On a tablet at the edge of the field they drew a shape, pressed SUBMIT, and watched it drift overhead as a cloud.

The brief was deceptively simple and had no off-the-shelf answer: a drawing made by a five-year-old had to become a believable cloud, in a procedurally generated sky, on an 8K canvas, in the time it takes a kid to look up. Nothing in the chain could stall, and nothing could put an unmoderated drawing on a wall in a public exhibition.

The system I architected ran the whole loop on-site. A custom media server orchestrated the pipeline and drove the ceiling; the drawing interface was built in TouchDesigner; Unreal Engine generated and rendered the sky, running a day-cycle of weather and light across the ceiling tile. Each submitted sketch was sent to an LLM vision model to be read and described — *drawing a cloud in the shape of a whale* — which both interpreted the child's intent and filtered anything that shouldn't make it into the sky. That description drove local Stable Diffusion inference, running on machines in the building, that turned the sketch into a volumetric cloud form. The result was cut out, handed back to Unreal, and released into the sky to be lit and weathered like everything else up there.

Keeping inference local was a design decision as much as a technical one: it removed the network as a point of failure in a room full of people waiting on their own cloud, and kept the drawings on-premises. Everything in the room ran unattended for the run of the exhibition.

More documentation in the [original album](https://photos.google.com/share/AF1QipOqfAy3rYPZZGwUienSk4bWFhpUsuyQSqNKK--OaKd8Zk7UoJy-FoOHFFp8B3VQ9Q?key=VDZxZ3NHTmpaWHVTMEpTME5ERU12RkJvZzlGSW9B).
