// Case-study editor modal, ported from MarsNET's src/wizard.js. Loaded by
// case-study/app.js only in author mode (localhost + dev-server.mjs running);
// posts to the dev server's /api/create-project and /api/delete-project.
// Role names may legitimately contain markup (a linked studio credit), so every
// value interpolated into this file's templates goes through here — an
// unescaped quote in an attribute silently truncates the field on save.
const attr = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function setupWizard() {
  if (document.getElementById('wizard-overlay')) return; // Prevent double injection

  const modalHTML = `
    <div id="wizard-overlay" class="wizard-modal-overlay">
      <div class="wizard-modal-content">
        <div class="wizard-header">
          <h2>New Case Study</h2>
          <button id="wizard-close" class="wizard-close-btn">&times;</button>
        </div>
        <form id="wizard-form">
          <input type="hidden" id="wizard-project-id" value="">
          <input type="hidden" id="wizard-existing-thumb" value="">
          <div class="wizard-form-group">
            <label for="wizard-title">Title *</label>
            <input type="text" id="wizard-title" class="wizard-input" required placeholder="e.g. Bombay Beach Biennale Map & Schedule App">
          </div>
          <div class="wizard-form-group">
            <label for="wizard-client">Client / sub-header</label>
            <input type="text" id="wizard-client" class="wizard-input" placeholder="e.g. Bombay Beach Biennale">
          </div>
          <div class="wizard-form-group">
            <label>Hashtags</label>
            <div class="wizard-hashtags-container">
              <div id="wizard-active-tags" class="wizard-active-tags"></div>
              <div class="wizard-tag-input-wrapper">
                <input type="text" id="wizard-tag-input" class="wizard-input" placeholder="Add a tag... (Press Enter)" autocomplete="off">
                <div id="wizard-tag-dropdown" class="wizard-tag-dropdown"></div>
              </div>
            </div>
          </div>
          <div class="wizard-form-group">
            <label for="wizard-date">Date *</label>
            <input type="date" id="wizard-date" class="wizard-input" required>
          </div>
          <div class="wizard-form-group">
            <label for="wizard-desc">Overview (markdown) *</label>
            <textarea id="wizard-desc" class="wizard-textarea" required placeholder="Project overview, markdown supported..."></textarea>
          </div>

          <div class="wizard-form-group">
            <label>Roles</label>
            <div id="wizard-credits-container" class="wizard-credits-list">
              <div class="wizard-credit-row">
                <input type="text" class="wizard-input credit-role" placeholder="Role (e.g. Design)" />
                <input type="text" class="wizard-input credit-name" placeholder="Name" />
                <button type="button" class="wizard-remove-credit" title="Remove">&times;</button>
              </div>
            </div>
            <button type="button" id="wizard-add-credit" class="wizard-add-credit">+ Add Role</button>
          </div>

          <div class="wizard-form-group">
            <label>Media Assets <span class="wizard-label-hint">drag to reorder — list order is page order</span></label>
            <div id="wizard-dropzone" class="wizard-dropzone">
              <svg class="wizard-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p>Drag &amp; drop media files here, or click to browse</p>
              <input type="file" id="wizard-file-input" multiple style="display: none;">
            </div>
            <div id="wizard-file-list" class="wizard-file-list"></div>
          </div>

          <div class="wizard-actions">
            <div>
              <button type="button" id="wizard-delete" class="wizard-btn wizard-btn-delete" style="display: none;">Delete Case Study</button>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <div id="wizard-loading" class="wizard-loading">Processing...</div>
              <button type="button" id="wizard-cancel" class="wizard-btn wizard-btn-cancel">Cancel</button>
              <button type="submit" id="wizard-submit" class="wizard-btn wizard-btn-submit">Create</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const overlay = document.getElementById('wizard-overlay');
  const closeBtn = document.getElementById('wizard-close');
  const cancelBtn = document.getElementById('wizard-cancel');
  const form = document.getElementById('wizard-form');
  const addCreditBtn = document.getElementById('wizard-add-credit');
  const creditsContainer = document.getElementById('wizard-credits-container');

  const dropzone = document.getElementById('wizard-dropzone');
  const fileInput = document.getElementById('wizard-file-input');
  const fileListContainer = document.getElementById('wizard-file-list');
  const submitBtn = document.getElementById('wizard-submit');
  const loadingText = document.getElementById('wizard-loading');
  const deleteBtn = document.getElementById('wizard-delete');

  // One ordered list drives everything: section membership is the asset's role,
  // position within a section is its published order (the server turns that into
  // the numeric filename prefix build-projects.mjs sorts by).
  const SECTIONS = [
    { role: 'hero', label: 'Hero', hint: 'one item — video wins over image' },
    { role: 'auto', label: 'Gallery & videos', hint: 'carousel images and the other-videos grid, in this order' },
    { role: 'poster', label: 'Posters', hint: 'full-height rows' },
    { role: 'thumbnail', label: 'Thumbnail only', hint: 'grid card art, kept off the page' },
  ];
  let mediaItems = [];
  let uid = 0;
  let thumbUid = null;

  window.openNewProjectWizard = (editData = null) => {
    const titleEle = document.getElementById('wizard-title');
    const clientEle = document.getElementById('wizard-client');
    const dateEle = document.getElementById('wizard-date');
    const descEle = document.getElementById('wizard-desc');
    const idEle = document.getElementById('wizard-project-id');
    const existingThumbEle = document.getElementById('wizard-existing-thumb');
    const titleHeader = document.querySelector('.wizard-header h2');

    form.reset();
    idEle.value = '';
    existingThumbEle.value = '';
    creditsContainer.innerHTML = '';
    fileListContainer.innerHTML = '';
    mediaItems = [];
    thumbUid = null;
    selectedTags.clear();
    renderActiveTags();

    if (editData && editData.id) {
      deleteBtn.style.display = 'block';
      titleHeader.textContent = 'Edit Case Study';
      submitBtn.textContent = 'Save Changes';
      idEle.value = editData.id;
      existingThumbEle.value = editData.thumb || '';
      titleEle.value = editData.title || '';
      clientEle.value = editData.client || '';
      if (editData.date) {
        dateEle.value = editData.date;
      } else {
        dateEle.valueAsDate = new Date();
      }

      descEle.value = editData.descriptionRaw || editData.description || '';

      if (editData.hashtags) {
        const arr = Array.isArray(editData.hashtags) ? editData.hashtags : [editData.hashtags];
        arr.forEach(t => selectedTags.add(t));
        renderActiveTags();
      }

      const rolesData = editData.roles || editData.credits || [];
      rolesData.forEach(r => {
        const row = document.createElement('div');
        row.className = 'wizard-credit-row';
        row.innerHTML = `
          <input type="text" class="wizard-input credit-role" placeholder="Role" value="${attr(r.role)}" />
          <input type="text" class="wizard-input credit-name" placeholder="Name" value="${attr(r.name)}" />
          <button type="button" class="wizard-remove-credit" title="Remove">&times;</button>
        `;
        creditsContainer.appendChild(row);
      });

      if (editData.existingMedia && Array.isArray(editData.existingMedia)) {
        mediaItems = editData.existingMedia.map(f => ({
          uid: ++uid,
          source: 'existing',
          name: f.name,
          path: f.path,
          role: SECTIONS.some(s => s.role === f.role) ? f.role : 'auto',
        }));
        // editData.thumb may already be resolved to an R2 url — match on the tail
        const thumbRef = editData.thumb || existingThumbEle.value || '';
        const current = mediaItems.find(m => thumbRef.endsWith(m.path));
        thumbUid = current ? current.uid : null;
        renderFileList();
      }
    } else {
      deleteBtn.style.display = 'none';
      titleHeader.textContent = 'New Case Study';
      submitBtn.textContent = 'Create';
      dateEle.valueAsDate = new Date();
    }

    if (!creditsContainer.innerHTML.trim()) {
      const row = document.createElement('div');
      row.className = 'wizard-credit-row';
      row.innerHTML = `
        <input type="text" class="wizard-input credit-role" placeholder="Role" />
        <input type="text" class="wizard-input credit-name" placeholder="Name" />
        <button type="button" class="wizard-remove-credit" title="Remove">&times;</button>
      `;
      creditsContainer.appendChild(row);
    }

    overlay.classList.add('active');
  };

  const closeModal = () => overlay.classList.remove('active');

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Roles rows
  addCreditBtn.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'wizard-credit-row';
    row.innerHTML = `
      <input type="text" class="wizard-input credit-role" placeholder="Role" />
      <input type="text" class="wizard-input credit-name" placeholder="Name" />
      <button type="button" class="wizard-remove-credit" title="Remove">&times;</button>
    `;
    creditsContainer.appendChild(row);
  });
  creditsContainer.addEventListener('click', e => {
    if (e.target.classList.contains('wizard-remove-credit')) {
      e.target.closest('.wizard-credit-row').remove();
    }
  });

  // Hashtags
  const tagInput = document.getElementById('wizard-tag-input');
  const tagDropdown = document.getElementById('wizard-tag-dropdown');
  const activeTagsContainer = document.getElementById('wizard-active-tags');
  let selectedTags = new Set();
  let availableTags = new Set();

  (async () => {
    try {
      const res = await fetch(`/projects/index.json?t=${Date.now()}`);
      if (res.ok) {
        (await res.json()).forEach(p => (p.hashtags || []).forEach(t => availableTags.add(t)));
      }
    } catch { /* offline is fine */ }
  })();

  const renderActiveTags = () => {
    activeTagsContainer.innerHTML = '';
    selectedTags.forEach(tag => {
      const pill = document.createElement('div');
      pill.className = 'wizard-tag-pill';
      pill.innerHTML = `#${tag} <span class="remove" data-tag="${tag}">&times;</span>`;
      activeTagsContainer.appendChild(pill);
    });
  };

  activeTagsContainer.addEventListener('click', e => {
    if (e.target.classList.contains('remove')) {
      selectedTags.delete(e.target.dataset.tag);
      renderActiveTags();
    }
  });

  const renderDropdown = (filter = '') => {
    tagDropdown.innerHTML = '';
    const matches = Array.from(availableTags).filter(t => t.includes(filter.toLowerCase()) && !selectedTags.has(t));
    if (filter && !availableTags.has(filter.toLowerCase()) && !selectedTags.has(filter.toLowerCase())) {
      matches.unshift(filter.toLowerCase());
    }
    if (matches.length > 0) {
      tagDropdown.classList.add('active');
      matches.forEach(m => {
        const item = document.createElement('div');
        item.className = 'wizard-dropdown-item';
        item.textContent = `#${m}`;
        item.addEventListener('click', () => {
          selectedTags.add(m);
          tagInput.value = '';
          tagDropdown.classList.remove('active');
          renderActiveTags();
        });
        tagDropdown.appendChild(item);
      });
    } else {
      tagDropdown.classList.remove('active');
    }
  };

  tagInput.addEventListener('focus', () => renderDropdown(tagInput.value.trim()));
  tagInput.addEventListener('input', e => renderDropdown(e.target.value.trim()));
  document.addEventListener('click', e => {
    if (!e.target.closest('.wizard-tag-input-wrapper')) tagDropdown.classList.remove('active');
  });
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = tagInput.value.trim().toLowerCase();
      if (val) {
        selectedTags.add(val);
        availableTags.add(val);
        tagInput.value = '';
        tagDropdown.classList.remove('active');
        renderActiveTags();
      }
    }
  });

  // Dropzone
  const handleFiles = files => {
    Array.from(files).forEach(f => mediaItems.push({ uid: ++uid, source: 'new', name: f.name, file: f, role: 'auto' }));
    renderFileList();
  };
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
    fileInput.value = '';
  });

  const itemsIn = role => mediaItems.filter(m => m.role === role);
  const findItem = id => mediaItems.find(m => m.uid === Number(id));

  // Moving an item is always: pull it out, then splice it back in front of a
  // sibling (or at the end of the target section) — one primitive for drag,
  // for the arrow buttons and for the role dropdown.
  const moveItem = (item, role, beforeUid = null) => {
    mediaItems.splice(mediaItems.indexOf(item), 1);
    item.role = role;
    if (role === 'hero') {
      // hero holds one; whoever was there falls back into the gallery
      itemsIn('hero').forEach(prev => { prev.role = 'auto'; });
    }
    const before = beforeUid ? findItem(beforeUid) : null;
    if (before && before !== item) mediaItems.splice(mediaItems.indexOf(before), 0, item);
    else {
      const section = itemsIn(role);
      const last = section[section.length - 1];
      mediaItems.splice(last ? mediaItems.indexOf(last) + 1 : mediaItems.length, 0, item);
    }
    renderFileList();
  };

  const nudge = (item, dir) => {
    const section = itemsIn(item.role);
    const at = section.indexOf(item);
    const target = section[at + dir];
    if (!target) return;
    if (dir < 0) moveItem(item, item.role, target.uid);
    else moveItem(item, item.role, section[at + 2] ? section[at + 2].uid : null);
  };

  const renderFileList = () => {
    fileListContainer.innerHTML = '';
    if (!mediaItems.length) return;

    for (const section of SECTIONS) {
      const items = itemsIn(section.role);
      // empty optional sections stay visible so there's somewhere to drop
      const group = document.createElement('div');
      group.className = 'wizard-media-group';
      group.dataset.role = section.role;
      group.innerHTML = `
        <div class="wizard-media-group-head">
          <span class="wizard-media-group-title">${section.label}</span>
          <span class="wizard-media-group-hint">${section.hint}</span>
        </div>
        <div class="wizard-media-group-list" data-role="${section.role}"></div>
      `;
      const list = group.querySelector('.wizard-media-group-list');
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'wizard-media-empty';
        empty.textContent = 'drop here';
        list.appendChild(empty);
      }
      items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = `wizard-file-item${item.source === 'existing' ? ' existing-file' : ''}`;
        row.draggable = true;
        row.dataset.uid = item.uid;
        row.innerHTML = `
          <div class="wizard-file-info">
            <span class="wizard-drag-handle" title="Drag to reorder">⠿</span>
            <span class="wizard-file-order">${idx + 1}</span>
            <span class="wizard-file-name" title="${attr(item.name)}">${item.source === 'new' ? '[New] ' : ''}${attr(item.name)}</span>
          </div>
          <div class="wizard-file-controls">
            <button type="button" class="wizard-nudge" data-dir="-1" title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="wizard-nudge" data-dir="1" title="Move down" ${idx === items.length - 1 ? 'disabled' : ''}>↓</button>
            <select class="wizard-role-select">
              ${SECTIONS.map(s => `<option value="${s.role}" ${item.role === s.role ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <label class="wizard-thumb-label" title="Set as thumbnail">
               <input type="radio" name="wizard_thumb_radio" value="${item.uid}" ${thumbUid === item.uid ? 'checked' : ''}> Thumb
            </label>
            <button type="button" class="wizard-remove-file" title="Remove file">&times;</button>
          </div>
        `;
        list.appendChild(row);
      });
      fileListContainer.appendChild(group);
    }
  };

  fileListContainer.addEventListener('click', e => {
    const row = e.target.closest('.wizard-file-item');
    if (!row) return;
    const item = findItem(row.dataset.uid);
    if (!item) return;
    if (e.target.classList.contains('wizard-remove-file')) {
      mediaItems.splice(mediaItems.indexOf(item), 1);
      if (thumbUid === item.uid) thumbUid = null;
      renderFileList();
    } else if (e.target.classList.contains('wizard-nudge')) {
      nudge(item, Number(e.target.dataset.dir));
    }
  });

  fileListContainer.addEventListener('change', e => {
    const row = e.target.closest('.wizard-file-item');
    const item = row && findItem(row.dataset.uid);
    if (!item) return;
    if (e.target.classList.contains('wizard-role-select')) moveItem(item, e.target.value);
    else if (e.target.type === 'radio') thumbUid = item.uid;
  });

  /* ---------- drag to reorder / re-role ---------- */
  let dragUid = null;
  fileListContainer.addEventListener('dragstart', e => {
    const row = e.target.closest('.wizard-file-item');
    if (!row) return;
    dragUid = Number(row.dataset.uid);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.uid); // Firefox needs payload
  });
  fileListContainer.addEventListener('dragend', () => {
    dragUid = null;
    fileListContainer.querySelectorAll('.drag-over, .dragging')
      .forEach(el => el.classList.remove('drag-over', 'dragging'));
  });

  // the row we'd land in front of, or null for "append to this section"
  const dropTarget = (list, y) => {
    const rows = [...list.querySelectorAll('.wizard-file-item')].filter(r => Number(r.dataset.uid) !== dragUid);
    return rows.find(r => {
      const box = r.getBoundingClientRect();
      return y < box.top + box.height / 2;
    }) || null;
  };

  fileListContainer.addEventListener('dragover', e => {
    const list = e.target.closest('.wizard-media-group-list');
    if (!list || dragUid === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    fileListContainer.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    (dropTarget(list, e.clientY) || list).classList.add('drag-over');
  });

  fileListContainer.addEventListener('drop', e => {
    const list = e.target.closest('.wizard-media-group-list');
    if (!list || dragUid === null) return;
    e.preventDefault();
    const item = findItem(dragUid);
    const before = dropTarget(list, e.clientY);
    dragUid = null;
    if (item) moveItem(item, list.dataset.role, before ? before.dataset.uid : null);
  });

  // Submit
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const title = document.getElementById('wizard-title').value.trim();
    const client = document.getElementById('wizard-client').value.trim() || 'Project';
    const date = document.getElementById('wizard-date').value;
    const description = document.getElementById('wizard-desc').value.trim();
    const projectId = document.getElementById('wizard-project-id').value;
    const existingThumb = document.getElementById('wizard-existing-thumb').value;
    if (!title || !description || !date) return;

    submitBtn.disabled = true;
    loadingText.classList.add('active');

    const formData = new FormData();
    if (projectId) formData.append('project_id', projectId);
    if (existingThumb) formData.append('existing_thumb', existingThumb);
    formData.append('title', title);
    formData.append('client', client);
    formData.append('date', date);
    formData.append('description', description);
    formData.append('hashtags_json', JSON.stringify(Array.from(selectedTags)));

    creditsContainer.querySelectorAll('.wizard-credit-row').forEach((row, idx) => {
      const role = row.querySelector('.credit-role').value.trim();
      const name = row.querySelector('.credit-name').value.trim();
      if (role || name) {
        formData.append(`credit_role_${idx}`, role);
        formData.append(`credit_name_${idx}`, name);
      }
    });

    // Sections in SECTIONS order, items in list order: the plan IS the page order.
    const plan = [];
    let uploadIndex = 0;
    for (const section of SECTIONS) {
      for (const item of mediaItems.filter(m => m.role === section.role)) {
        const entry = { source: item.source, role: item.role };
        if (item.source === 'new') {
          formData.append('files', item.file);
          entry.index = uploadIndex++;
        } else {
          entry.path = item.path;
        }
        if (thumbUid === item.uid) entry.thumb = true;
        plan.push(entry);
      }
    }
    formData.append('media_plan', JSON.stringify(plan));

    try {
      const res = await fetch('/api/create-project', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        window.location.href = `/projects/${data.folder}/index.html`;
      } else {
        alert('Error: ' + data.error);
        submitBtn.disabled = false;
        loadingText.classList.remove('active');
      }
    } catch {
      alert('Error saving case study.');
      submitBtn.disabled = false;
      loadingText.classList.remove('active');
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const projectId = document.getElementById('wizard-project-id').value;
    if (!projectId) return;
    if (confirm('Delete this case study? This permanently erases the folder and all of its local media.')) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
      try {
        const res = await fetch('/api/delete-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId }),
        });
        const json = await res.json();
        if (json.success) {
          window.location.href = '/';
        } else {
          alert('Failed to delete: ' + json.error);
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete Case Study';
        }
      } catch {
        alert('An error occurred during deletion.');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Case Study';
      }
    }
  });
}
