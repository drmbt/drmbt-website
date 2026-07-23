// Case-study editor modal, ported from MarsNET's src/wizard.js. Loaded by
// case-study/app.js only in author mode (localhost + dev-server.mjs running);
// posts to the dev server's /api/create-project and /api/delete-project.
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
            <label>Media Assets</label>
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

  let uploadedFiles = [];
  let existingFiles = [];

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
    uploadedFiles = [];
    existingFiles = [];
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
          <input type="text" class="wizard-input credit-role" placeholder="Role" value="${r.role}" />
          <input type="text" class="wizard-input credit-name" placeholder="Name" value="${r.name}" />
          <button type="button" class="wizard-remove-credit" title="Remove">&times;</button>
        `;
        creditsContainer.appendChild(row);
      });

      if (editData.existingMedia && Array.isArray(editData.existingMedia)) {
        existingFiles = editData.existingMedia.slice();
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
    Array.from(files).forEach(f => uploadedFiles.push(f));
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

  const renderFileList = () => {
    fileListContainer.innerHTML = '';

    existingFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'wizard-file-item existing-file';
      item.innerHTML = `
        <div class="wizard-file-info">
          <span class="wizard-file-name" title="${file.name}">[Existing] ${file.name}</span>
        </div>
        <div class="wizard-file-controls">
          <select class="wizard-role-select existing-role" data-index="${index}">
            <option value="auto" ${file.role === 'auto' ? 'selected' : ''}>Auto (Carousel/Other Video)</option>
            <option value="hero" ${file.role === 'hero' ? 'selected' : ''}>Hero Media</option>
            <option value="poster" ${file.role === 'poster' ? 'selected' : ''}>Poster</option>
            <option value="thumbnail" ${file.role === 'thumbnail' ? 'selected' : ''}>Thumbnail Only</option>
          </select>
          <label class="wizard-thumb-label" title="Set as thumbnail">
             <input type="radio" name="wizard_thumb_radio" class="existing-thumb-radio" value="existing_${index}" ${(document.getElementById('wizard-existing-thumb').value === file.path || file.role === 'thumbnail') ? 'checked' : ''}> Thumb
          </label>
          <button type="button" class="wizard-remove-existing-file" data-index="${index}" title="Remove file">&times;</button>
        </div>
      `;
      fileListContainer.appendChild(item);
    });

    uploadedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'wizard-file-item';
      item.innerHTML = `
        <div class="wizard-file-info">
          <span class="wizard-file-name" title="${file.name}">${file.name}</span>
        </div>
        <div class="wizard-file-controls">
          <select class="wizard-role-select new-role" data-index="${index}">
            <option value="auto">Auto (Carousel/Other Video)</option>
            <option value="hero">Hero Media</option>
            <option value="poster">Poster</option>
            <option value="thumbnail">Thumbnail Only</option>
          </select>
          <label class="wizard-thumb-label" title="Set as thumbnail">
             <input type="radio" name="wizard_thumb_radio" class="new-thumb-radio" value="new_${index}"> Thumb
          </label>
          <button type="button" class="wizard-remove-file" data-index="${index}" title="Remove file">&times;</button>
        </div>
      `;
      fileListContainer.appendChild(item);
    });
  };

  fileListContainer.addEventListener('click', e => {
    if (e.target.classList.contains('wizard-remove-file')) {
      uploadedFiles.splice(parseInt(e.target.dataset.index, 10), 1);
      renderFileList();
    } else if (e.target.classList.contains('wizard-remove-existing-file')) {
      existingFiles.splice(parseInt(e.target.dataset.index, 10), 1);
      renderFileList();
    }
  });

  // only one hero at a time
  fileListContainer.addEventListener('change', e => {
    if (!e.target.classList.contains('wizard-role-select') || e.target.value !== 'hero') return;
    fileListContainer.querySelectorAll('.wizard-role-select').forEach(select => {
      if (select !== e.target && select.value === 'hero') select.value = 'auto';
    });
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

    const newSelects = fileListContainer.querySelectorAll('.new-role');
    uploadedFiles.forEach((file, idx) => {
      formData.append('files', file);
      const role = newSelects[idx].value;
      if (role !== 'auto') formData.append(`file_role_${file.name}`, role);
    });

    const existingSelects = fileListContainer.querySelectorAll('.existing-role');
    const existingMediaUpdates = [];
    existingFiles.forEach((file, idx) => {
      existingMediaUpdates.push({ ...file, targetRole: existingSelects[idx].value });
    });
    formData.append('existing_media', JSON.stringify(existingMediaUpdates));

    const checkedThumbRadio = document.querySelector('input[name="wizard_thumb_radio"]:checked');
    if (checkedThumbRadio) {
      if (checkedThumbRadio.value.startsWith('existing_')) {
        const idx = parseInt(checkedThumbRadio.value.replace('existing_', ''), 10);
        formData.append('explicit_thumb', existingFiles[idx].path);
      } else if (checkedThumbRadio.value.startsWith('new_')) {
        const idx = parseInt(checkedThumbRadio.value.replace('new_', ''), 10);
        formData.append('explicit_thumb_new', uploadedFiles[idx].name);
      }
    }

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
