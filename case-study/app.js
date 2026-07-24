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
    // Shared icon nav (js/social-nav.js, loaded by the generated page shell)
    const iconNavHtml = window.SOCIAL_NAV_HTML || '';

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
