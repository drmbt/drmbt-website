// Case-study renderer, ported from MarsNET's src/project-template/app.js.
// Reads the JSON metadata embedded by build-projects.mjs and renders the page:
// fixed parallax hero (video with custom controls, or image), markdown
// overview, other-videos grid with hero swap, audio players, poster rows,
// infinite drag/scroll carousel, roles, related projects, and a lightbox.
// MarsNET's dev-server authoring wizard is intentionally dropped — authoring
// here is file-based (edit the .md, run `npm run build:cases`).

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

class CaseStudy {
  constructor() {
    this.app = document.getElementById('app');
    this.lightbox = null;
    this.lightboxImg = null;
    this.currentGallery = [];
    this.currentGalleryIndex = 0;
    this.init();
  }

  async init() {
    this.data = this.parseData();
    if (!this.data) return;

    // Procedurally pick related projects when none specified in the markdown
    if (!this.data.relatedProjects || this.data.relatedProjects.length === 0) {
      try {
        const res = await fetch('../index.json');
        if (res.ok) {
          const all = await res.json();
          const others = all.filter(p => p.id !== this.data.id);
          others.sort(() => 0.5 - Math.random());
          this.data.relatedProjects = others.slice(0, 3).map(p => ({
            title: p.title,
            slug: p.id,
            thumbnail: p.thumb ? `../../${p.thumb}` : '',
          }));
        }
      } catch (e) {
        console.warn('Failed to load related projects.', e);
      }
    }

    this.render();
    this.setupHeroPlayer();
    this.setupHeaderIdle();
    this.setupCarousel();
    this.setupOtherVideos();
    this.setupAudioPlayers();
    this.setupEditor();
  }

  // While the full-screen hero fills the viewport, the top bar fades out
  // after a few idle seconds (like the playhead overlay); any activity brings
  // it back, and once scrolled into the content it stays visible.
  setupHeaderIdle() {
    if (this.headerIdleWired || !document.querySelector('.hero-section')) return;
    this.headerIdleWired = true;
    let idleTimeout;
    const reset = () => {
      const header = document.querySelector('.site-header');
      if (!header) return;
      header.classList.remove('idle');
      clearTimeout(idleTimeout);
      if (window.scrollY < window.innerHeight * 0.5) {
        idleTimeout = setTimeout(() => {
          if (window.scrollY < window.innerHeight * 0.5) header.classList.add('idle');
        }, 3000);
      }
    };
    for (const ev of ['mousemove', 'keydown', 'scroll', 'touchstart']) {
      window.addEventListener(ev, reset, { passive: true });
    }
    reset();
  }

  // Author mode: on localhost with dev-server.mjs running (`npm run dev`),
  // load the wizard and offer a floating EDIT button for this case study.
  async setupEditor() {
    if (!['localhost', '127.0.0.1', '::1', ''].includes(location.hostname)) return;
    if (document.getElementById('editCase')) return;
    try {
      const ping = await fetch('/api/ping');
      if (!ping.ok) return;
    } catch {
      return; // plain static server (e.g. python http.server) — no editor
    }

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '../../case-study/wizard.css';
    document.head.appendChild(css);

    const { setupWizard } = await import('./wizard.js');
    setupWizard();

    const btn = document.createElement('button');
    btn.id = 'editCase';
    btn.textContent = 'EDIT CASE';
    btn.title = 'Edit this case study';
    btn.addEventListener('click', () => window.openNewProjectWizard(this.data));
    document.body.appendChild(btn);
  }

  parseData() {
    try {
      return JSON.parse(document.getElementById('project-meta').textContent);
    } catch (e) {
      console.error('Failed to parse project data', e);
      return null;
    }
  }

  render() {
    // Same icon nav as the homepage header (keep in sync with index.html)
    const iconNavHtml = `
      <nav class="icon-nav" aria-label="Profiles and contact">
        <a href="https://vimeo.com/drmbt" target="_blank" rel="noopener" aria-label="Vimeo" title="Vimeo">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.9765 6.4168c-.105 2.338-1.739 5.5429-4.894 9.6088-3.2679 4.247-6.0258 6.3699-8.2898 6.3699-1.409 0-2.578-1.294-3.553-3.881l-1.9179-7.1138c-.719-2.584-1.488-3.878-2.312-3.878-.179 0-.806.378-1.8809 1.132l-1.129-1.457a315.06 315.06 0 003.501-3.1279c1.579-1.368 2.765-2.085 3.5539-2.159 1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.5069.5389 2.45 1.1309 3.674 1.7759 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.8679 3.434-5.7568 6.7619-5.6368 2.4729.06 3.6279 1.664 3.4929 4.7969z"/></svg>
        </a>
        <a href="https://github.com/drmbt" target="_blank" rel="noopener" aria-label="GitHub" title="GitHub">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        </a>
        <a href="https://instagram.com/drmbt" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>
        </a>
        <a href="https://discord.gg/NnqPGUcJ" target="_blank" rel="noopener" aria-label="Discord" title="Discord">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
        </a>
        <a href="https://dreambait.bandcamp.com/" target="_blank" rel="noopener" aria-label="Bandcamp" title="Bandcamp">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 18.75l7.437-13.5H24l-7.438 13.5H0z"/></svg>
        </a>
        <a href="https://soundcloud.com/drmbt" target="_blank" rel="noopener" aria-label="SoundCloud" title="SoundCloud">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/></svg>
        </a>
        <a href="https://patreon.com/drmbt" target="_blank" rel="noopener" aria-label="Patreon" title="Patreon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.957 7.21c-.004-3.064-2.391-5.576-5.191-6.482-3.478-1.125-8.064-.962-11.384.604C2.357 3.231 1.093 7.391 1.046 11.54c-.039 3.411.302 12.396 5.369 12.46 3.765.047 4.326-4.804 6.068-7.141 1.24-1.662 2.836-2.132 4.801-2.618 3.376-.836 5.678-3.501 5.673-7.031Z"/></svg>
        </a>
        <a href="https://cash.app/$drmbt" target="_blank" rel="noopener" aria-label="Cash App" title="Cash App">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.59 3.475a5.1 5.1 0 00-3.05-3.05c-1.31-.42-2.5-.42-4.92-.42H8.36c-2.4 0-3.61 0-4.9.4a5.1 5.1 0 00-3.05 3.06C0 4.765 0 5.965 0 8.365v7.27c0 2.41 0 3.6.4 4.9a5.1 5.1 0 003.05 3.05c1.3.41 2.5.41 4.9.41h7.28c2.41 0 3.61 0 4.9-.4a5.1 5.1 0 003.06-3.06c.41-1.3.41-2.5.41-4.9v-7.25c0-2.41 0-3.61-.41-4.91zm-6.17 4.63l-.93.93a.5.5 0 01-.67.01 5 5 0 00-3.22-1.18c-.97 0-1.94.32-1.94 1.21 0 .9 1.04 1.2 2.24 1.65 2.1.7 3.84 1.58 3.84 3.64 0 2.24-1.74 3.78-4.58 3.95l-.26 1.2a.49.49 0 01-.48.39H9.63l-.09-.01a.5.5 0 01-.38-.59l.28-1.27a6.54 6.54 0 01-2.88-1.57v-.01a.48.48 0 010-.68l1-.97a.49.49 0 01.67 0c.91.86 2.13 1.34 3.39 1.32 1.3 0 2.17-.55 2.17-1.42 0-.87-.88-1.1-2.54-1.72-1.76-.63-3.43-1.52-3.43-3.6 0-2.42 2.01-3.6 4.39-3.71l.25-1.23a.48.48 0 01.48-.38h1.78l.1.01c.26.06.43.31.37.57l-.27 1.37c.9.3 1.75.77 2.48 1.39l.02.02c.19.2.19.5 0 .68z"/></svg>
        </a>
        <a href="mailto:vincent@drmbt.com" aria-label="Email" title="Email">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 13.02 1.68 6.06C1.94 5.14 2.8 4.46 3.8 4.46h16.4c1 0 1.86.68 2.12 1.6L12 13.02zm0 2.42L22.4 8.4v8.94c0 1.22-1 2.2-2.2 2.2H3.8c-1.2 0-2.2-.98-2.2-2.2V8.4L12 15.44z"/></svg>
        </a>
      </nav>`;

    const headerHtml = `
      <header class="site-header">
        <a href="../../index.html" class="logo" aria-label="DRMBT home">DRMBT</a>
        ${iconNavHtml}
      </header>
    `;

    // 1. Hero (fixed behind the page; content scrolls over it)
    let heroHtml = '';
    if (this.data.hero?.type === 'video') {
      heroHtml = `
        <div class="hero-section" id="hero-section">
          <video class="hero-media" id="hero-video" autoplay muted loop playsinline poster="${this.data.hero.poster || ''}">
            ${this.data.hero.sources.map(src => `<source src="${src}" type="video/mp4">`).join('')}
          </video>
          <div class="hero-overlay" id="hero-overlay">
            <div class="hero-controls">
              <button id="hero-play-btn">PAUSE</button>
              <button id="hero-mute-btn">UNMUTE</button>
              <div class="scrub-bar" id="hero-scrub-bar">
                <div class="scrub-progress" id="hero-scrub-progress"></div>
              </div>
              <div id="hero-timecode">0:00</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.data.hero?.type === 'image') {
      heroHtml = `
        <div class="hero-section">
          <img class="hero-media" src="${this.data.hero.poster || this.data.hero.sources[0]}" alt="${this.data.title}" />
        </div>
      `;
    }

    // 2. Ramp pushes the scrolling content below the fixed hero
    const rampHtml = heroHtml ? '<div class="ramp-section"></div>' : '';

    // 3. Title + overview
    const kicker = (this.data.hashtags || []).join(' · ');
    const overviewHtml = `
      <section class="overview-section">
        <a class="case-back" href="../../index.html#work">← back to portfolio</a>
        ${kicker ? `<span class="case-kicker">${kicker}</span>` : ''}
        <h1 class="case-title">${this.data.title || ''}</h1>
        <div class="case-meta">${[this.data.client, this.data.date].filter(Boolean).join(' · ')}</div>
        <div class="section-label">PROJECT OVERVIEW</div>
        <div class="overview-content">${this.data.overview || ''}</div>
      </section>
    `;

    // 4. Other videos
    let otherVideosHtml = '';
    if (this.data.otherVideos && this.data.otherVideos.length > 0) {
      otherVideosHtml = `
        <section class="other-videos-section">
          <div class="section-label">OTHER VIDEOS</div>
          <div class="other-videos-grid">
            ${this.data.otherVideos.map((vid, idx) => `
              <div class="video-thumb" data-idx="${idx}">
                <video class="video-thumb-preview" muted playsinline>
                  <source src="${vid.sources[0]}#t=3" type="video/mp4">
                </video>
                <div class="video-thumb-title">${vid.title}</div>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    // 5. Audio
    let audioHtml = '';
    if (this.data.audioFiles && this.data.audioFiles.length > 0) {
      audioHtml = `
        <section class="audio-section">
          <div class="section-label">AUDIO</div>
          <div class="audio-list">
            ${this.data.audioFiles.map((aud, idx) => `
              <div class="audio-player" data-idx="${idx}">
                <audio class="audio-element" src="${aud.path}" preload="metadata"></audio>
                <button class="audio-play-btn">PLAY</button>
                <div class="audio-title">${aud.title}</div>
                <div class="scrub-bar audio-scrub-bar">
                  <div class="scrub-progress audio-scrub-progress"></div>
                </div>
                <div class="audio-timecode">0:00</div>
                <button class="audio-mute-btn">MUTE</button>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    // 6. Posters
    let posterHtml = '';
    if (this.data.posterImages && this.data.posterImages.length > 0) {
      posterHtml = `
        <section class="poster-section">
          ${this.data.posterImages.map(row => {
            const items = Array.isArray(row) ? row : [row];
            return `
              <div class="poster-row">
                ${items.map(img => `
                  <img src="${img}" class="poster-img lightbox-trigger" data-gallery="poster" loading="lazy" />
                `).join('')}
              </div>
            `;
          }).join('')}
        </section>
      `;
    }

    // 7. Carousel (duplicated images for an infinite loop)
    let carouselHtml = '';
    if (this.data.carouselImages && this.data.carouselImages.length > 0) {
      const allImages = [...this.data.carouselImages, ...this.data.carouselImages];
      carouselHtml = `
        <section class="carousel-section">
          <div class="section-label carousel-label">OTHER CONTENT</div>
          <div class="carousel-track" id="carousel-track">
            ${allImages.map((img, idx) => `
              <img src="${img}" class="carousel-img lightbox-trigger" data-gallery="carousel" data-raw-idx="${idx % this.data.carouselImages.length}" draggable="false" />
            `).join('')}
          </div>
        </section>
      `;
    }

    // 8. Roles
    let creditsHtml = '';
    const rolesData = this.data.roles || this.data.credits;
    if (rolesData && rolesData.length > 0) {
      creditsHtml = `
        <section class="credits-section">
          <div class="section-label">ROLES</div>
          <div class="credits-list">
            ${rolesData.map(cred => `
              <div class="credit-row">
                <span class="credit-role">${cred.role}</span>
                <span class="credit-separator">&bull;</span>
                <span class="credit-name">${cred.name}</span>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    // 9. Related projects
    let relatedHtml = '';
    if (this.data.relatedProjects && this.data.relatedProjects.length > 0) {
      relatedHtml = `
        <section class="related-projects-section">
          <div class="section-label">PROJECTS</div>
          <div class="related-projects-grid">
            ${this.data.relatedProjects.map(proj => `
              <a href="../${proj.slug}/index.html" class="related-project">
                <img src="${proj.thumbnail}" alt="${proj.title}" loading="lazy" />
                <div>${proj.title}</div>
              </a>
            `).join('')}
          </div>
        </section>
      `;
    }

    const footerHtml = `
      <footer class="site-footer">
        <div class="footer-meta">
          <span>© 2026 Vincent Naples</span>
          <span class="footer-links">
            <a href="../../index.html">work</a>
          </span>
        </div>
      </footer>
    `;

    const lightboxHtml = `
      <div class="lightbox" id="lightbox">
        <button class="lightbox-close" id="lightbox-close">ESC / CLOSE</button>
        <img class="lightbox-img" id="lightbox-img" src="" alt="Fullscreen Image" />
        <div class="lightbox-caption" id="lightbox-caption"></div>
        <div class="lightbox-nav">
          <button id="lightbox-prev">&larr;</button>
          <button id="lightbox-next">&rarr;</button>
        </div>
      </div>
    `;

    this.app.innerHTML = `
      ${headerHtml}
      ${heroHtml}
      ${rampHtml}
      <main class="case-main">
        ${overviewHtml}
        ${otherVideosHtml}
        ${audioHtml}
        ${posterHtml}
        ${carouselHtml}
        ${creditsHtml}
        ${relatedHtml}
      </main>
      ${footerHtml}
      ${lightboxHtml}
    `;

    this.setupLightbox();
  }

  setupHeroPlayer() {
    const video = document.getElementById('hero-video');
    if (!video) return;

    const overlay = document.getElementById('hero-overlay');
    const playBtn = document.getElementById('hero-play-btn');
    const muteBtn = document.getElementById('hero-mute-btn');
    const scrubBar = document.getElementById('hero-scrub-bar');
    const scrubProgress = document.getElementById('hero-scrub-progress');
    const timecode = document.getElementById('hero-timecode');

    let idleTimeout;
    const resetIdle = () => {
      if (overlay) overlay.classList.remove('idle');
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        if (overlay) overlay.classList.add('idle');
      }, 3000);
    };
    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('keydown', resetIdle);
    resetIdle();

    playBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        playBtn.textContent = 'PAUSE';
      } else {
        video.pause();
        playBtn.textContent = 'PLAY';
      }
    });

    muteBtn.addEventListener('click', () => {
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? 'UNMUTE' : 'MUTE';
    });

    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      scrubProgress.style.width = `${(video.currentTime / video.duration) * 100}%`;
      const mins = Math.floor(video.currentTime / 60);
      const secs = Math.floor(video.currentTime % 60).toString().padStart(2, '0');
      timecode.textContent = `${mins}:${secs}`;
    });

    scrubBar.addEventListener('click', e => {
      const rect = scrubBar.getBoundingClientRect();
      const pos = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      video.currentTime = pos * video.duration;
    });
  }

  setupCarousel() {
    const track = document.getElementById('carousel-track');
    if (!track) return;

    let scrollPos = 0;
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;
    const autoScrollSpeed = 1.2;
    let isAutoScrolling = true;
    let resumeTimeout;
    let loopWidth = 0;

    const observer = new ResizeObserver(() => {
      loopWidth = track.scrollWidth / 2;
    });
    observer.observe(track);

    const tick = () => {
      if (isAutoScrolling && !isDragging && loopWidth > 0) {
        scrollPos += autoScrollSpeed;
        if (scrollPos >= loopWidth) scrollPos -= loopWidth;
        track.style.transform = `translateX(-${scrollPos}px)`;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const stopAuto = () => {
      isAutoScrolling = false;
      clearTimeout(resumeTimeout);
    };
    const resumeAuto = () => {
      clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(() => { isAutoScrolling = true; }, 2000);
    };

    track.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
      stopAuto();
      scrollPos += e.deltaX;
      if (loopWidth > 0) {
        if (scrollPos < 0) scrollPos += loopWidth;
        else if (scrollPos >= loopWidth) scrollPos -= loopWidth;
      }
      track.style.transform = `translateX(-${scrollPos}px)`;
      resumeAuto();
    }, { passive: false });

    track.addEventListener('mousedown', e => {
      isDragging = true;
      stopAuto();
      const matrix = new WebKitCSSMatrix(window.getComputedStyle(track).transform);
      scrollPos = Math.abs(matrix.m41);
      startX = e.pageX;
      scrollLeft = scrollPos;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        resumeAuto();
      }
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      e.preventDefault();
      const walk = (e.pageX - startX) * 1.5;
      scrollPos = scrollLeft - walk;
      if (scrollPos < 0) {
        scrollPos += loopWidth;
        startX = e.pageX;
        scrollLeft = scrollPos;
      } else if (scrollPos >= loopWidth) {
        scrollPos -= loopWidth;
        startX = e.pageX;
        scrollLeft = scrollPos;
      }
      track.style.transform = `translateX(-${scrollPos}px)`;
    });

    track.addEventListener('mouseenter', stopAuto);
    track.addEventListener('mouseleave', () => {
      if (!isDragging) resumeAuto();
    });
  }

  setupLightbox() {
    this.lightbox = document.getElementById('lightbox');
    this.lightboxImg = document.getElementById('lightbox-img');

    document.querySelectorAll('.lightbox-trigger').forEach(el => {
      el.addEventListener('click', e => {
        if (e.defaultPrevented) return;
        if (el.dataset.gallery === 'carousel') {
          this.currentGallery = this.data.carouselImages;
          this.currentGalleryIndex = parseInt(el.dataset.rawIdx);
        } else {
          this.currentGallery = this.data.posterImages.flat();
          const posters = Array.from(document.querySelectorAll('.poster-img'));
          this.currentGalleryIndex = posters.indexOf(el);
        }
        this.openLightbox();
      });
    });

    document.getElementById('lightbox-close').addEventListener('click', () => this.closeLightbox());
    document.getElementById('lightbox-prev').addEventListener('click', () => this.navigateLightbox(-1));
    document.getElementById('lightbox-next').addEventListener('click', () => this.navigateLightbox(1));

    document.addEventListener('keydown', e => {
      if (!this.lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') this.closeLightbox();
      if (e.key === 'ArrowLeft') this.navigateLightbox(-1);
      if (e.key === 'ArrowRight') this.navigateLightbox(1);
    });
  }

  openLightbox() {
    this.updateLightboxImg();
    this.lightbox.classList.add('active');
  }

  closeLightbox() {
    this.lightbox.classList.remove('active');
  }

  navigateLightbox(dir) {
    this.currentGalleryIndex += dir;
    if (this.currentGalleryIndex < 0) {
      this.currentGalleryIndex = this.currentGallery.length - 1;
    } else if (this.currentGalleryIndex >= this.currentGallery.length) {
      this.currentGalleryIndex = 0;
    }
    this.updateLightboxImg();
  }

  // Filenames double as captions ("00010_don_t_fear_the_reaper.jpg" →
  // "don't fear the reaper") so prompts/titles live in the filesystem,
  // not baked into images. Generic names (hero/thumb/img_1234…) show nothing.
  captionFromSrc(src) {
    let name;
    try { name = decodeURIComponent((src || '').split('/').pop().split('?')[0]); } catch { return ''; }
    name = name.replace(/\.[^.]+$/, '').replace(/^\d+[_-]/, '');
    if (/^(hero|thumb|img|image|dsc|screenshot)[\d_-]*$/i.test(name)) return '';
    name = name.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    // repair contractions that filenames flattened ("don t" → "don't")
    return name.replace(/\b(can|don|won|isn|aren|wasn|weren|doesn|didn|couldn|wouldn|shouldn|ain) t\b/gi, "$1't");
  }

  updateLightboxImg() {
    const src = this.currentGallery[this.currentGalleryIndex];
    this.lightboxImg.style.animation = 'none';
    this.lightboxImg.offsetHeight; /* trigger reflow */
    this.lightboxImg.style.animation = null;
    this.lightboxImg.src = src;
    const captionEl = document.getElementById('lightbox-caption');
    if (captionEl) {
      const caption = this.captionFromSrc(src);
      captionEl.textContent = caption;
      captionEl.style.display = caption ? '' : 'none';
    }
  }

  setupOtherVideos() {
    // Clicking an "other video" swaps it into the hero, hero moves to the grid
    document.querySelectorAll('.video-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const idx = thumb.dataset.idx;
        const clicked = this.data.otherVideos[idx];
        const oldHero = {
          title: this.data.title,
          sources: [...this.data.hero.sources],
          poster: this.data.hero.poster,
        };
        this.data.hero.sources = clicked.sources;
        this.data.hero.poster = clicked.poster;
        this.data.otherVideos[idx] = oldHero;

        this.render();
        this.setupHeroPlayer();
        this.setupCarousel();
        this.setupOtherVideos();
        this.setupAudioPlayers();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  setupAudioPlayers() {
    document.querySelectorAll('.audio-player').forEach(player => {
      const audio = player.querySelector('.audio-element');
      const playBtn = player.querySelector('.audio-play-btn');
      const scrubBar = player.querySelector('.audio-scrub-bar');
      const scrubProgress = player.querySelector('.audio-scrub-progress');
      const timecode = player.querySelector('.audio-timecode');
      const muteBtn = player.querySelector('.audio-mute-btn');

      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          document.querySelectorAll('.audio-element').forEach(a => {
            if (a !== audio) {
              a.pause();
              const otherBtn = a.parentElement.querySelector('.audio-play-btn');
              if (otherBtn) otherBtn.textContent = 'PLAY';
            }
          });
          audio.play();
          playBtn.textContent = 'PAUSE';
        } else {
          audio.pause();
          playBtn.textContent = 'PLAY';
        }
      });

      muteBtn.addEventListener('click', () => {
        audio.muted = !audio.muted;
        muteBtn.textContent = audio.muted ? 'UNMUTE' : 'MUTE';
      });

      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        scrubProgress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        const mins = Math.floor(audio.currentTime / 60);
        const secs = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        timecode.textContent = `${mins}:${secs}`;
      });

      scrubBar.addEventListener('click', e => {
        const rect = scrubBar.getBoundingClientRect();
        const pos = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        if (audio.duration) audio.currentTime = pos * audio.duration;
      });

      audio.addEventListener('ended', () => {
        playBtn.textContent = 'PLAY';
        scrubProgress.style.width = '0%';
        audio.currentTime = 0;
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new CaseStudy());
