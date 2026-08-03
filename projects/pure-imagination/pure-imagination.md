---
title: PURE IMAGINATION
date: '2024-06-27'
client: 'Hero BLOOM, NYC'
thumb: assets/image/00001_the_bloom_room.jpg
hashtags:
  - interactive
  - ai
  - installation
  - sculpture
  - nyc
roles:
  - role: SYSTEMS ARCHITECTURE
    name: VINCENT NAPLES
  - role: CONTENT CREATION
    name: VINCENT NAPLES
  - role: CREATIVE DIRECTION
    name: >-
      <a href="https://www.spacecowboys.studio/" target="_blank"
      rel="noopener">SPACE COWBOYS</a>
posterImages:
  - - assets/poster/00001_draw_your_imagination.jpg
    - assets/poster/00002_cloud_painter_tablet_interface.jpg
  - - assets/poster/00003_cloud_painter_beneath_the_sky.jpg
    - assets/poster/00004_a_flower_drawn_by_hand.jpg
---

PURE IMAGINATION was a real-time interactive sky built for the BLOOM exhibition at [Hero](https://www.hero-nyc.com/) in New York, a creative challenge brought to me by [Space Cowboys](https://www.spacecowboys.studio/). Visitors — mostly children — play in a ball pit under a massive 8K LED tile that filled the ceiling of the room. On a tablet at the edge of the field they drew a shape, pressed SUBMIT, and watched it drift overhead as a cloud.

The brief was deceptively simple and had no off-the-shelf answer: a drawing made by a five-year-old had to become a believable cloud, in a procedurally generated sky, on an 8K canvas, in the time it takes a kid to look up. Nothing in the chain could stall, and nothing could put an unmoderated drawing on a wall in a public exhibition.

The system I designed ran the whole loop on-site, with the exception of one openAI API call. A custom media server orchestrated the pipeline and drove the ceiling; the drawing interface was built in TouchDesigner running to a tablet in the exhibit hall; Unreal Engine generated and rendered the sky, running a day-cycle of weather and light across the ceiling tile. Each submitted sketch was sent to an LLM vision model to be read and converted into a prompt— *drawing a cloud in the shape of a whale* — which both interpreted the child's intent and filtered anything that shouldn't make it into the sky. That description drove local Stable Diffusion inference, running SDXL lightning with cloud LoRAs on machines in the building, that turned the sketch intent into a rendering in cloud form. The result was cut out, handed back to TouchDesigner, and composited onto the sky to be lit and weathered like everything else up there.

Keeping inference local was a design decision as much as a technical one: it removed the network as a point of failure in a room full of people waiting on their own cloud, and allowed customization of the inference pipeline by using local open weights models on-premises. Everything in the room ran unattended for the run of the exhibition.
