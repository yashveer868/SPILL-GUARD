/**
 * SpillGuard — Application Logic & Interactive Prototype Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // The static fixture remains as an offline fallback.  When served through
  // FastAPI, this loads the persisted SQLite data before the UI is rendered.
  try {
    const response = await fetch('/api/bootstrap');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const serverData = await response.json();
    Object.assign(SPILLGUARD_DATA, serverData);
  } catch (error) {
    console.warn('SpillGuard API unavailable; using bundled demo data.', error);
  }

  // =========================================================================
  // STATE MANAGEMENT & ROUTER
  // =========================================================================
  const state = {
    currentScreen: 'screen-splash',
    currentRegion: 'malacca',
    selectedSpill: SPILLGUARD_DATA.spills[0],
    selectedVesselFilter: 'all',
    isPlayingScrubber: false,
    scrubberInterval: null,
    scrubberSpeed: 1,
    driftAnimationId: null,
    isLeafletInit: false,
    map: null,
    analysisData: {
      rankings: [],
      darkWarnings: [],
      drift: null,
      matchResults: []
    },
    layers: {
      slicks: null,
      ais: null,
      drift: null,
      eez: null
    }
  };

  const screens = [
    'screen-splash',
    'screen-landing',
    'screen-login',
    'screen-dashboard',
    'screen-investigation',
    'screen-vessels',
    'screen-analytics'
  ];

  const appShellScreens = [
    'screen-dashboard',
    'screen-investigation',
    'screen-vessels',
    'screen-analytics'
  ];

  function navigateTo(screenId) {
    if (!screens.includes(screenId)) return;
    state.currentScreen = screenId;

    // Update Quick Nav Active State
    document.querySelectorAll('.proto-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === screenId);
    });

    const isAppShell = appShellScreens.includes(screenId);
    const appShellWrapper = document.getElementById('app-shell-wrapper');

    // Handle App Shell Visibility
    if (isAppShell) {
      // Hide public standalone screens
      document.querySelectorAll('#screen-splash, #screen-landing, #screen-login').forEach(el => {
        el.classList.remove('active-screen');
        el.style.display = '';
      });

      appShellWrapper.style.display = 'flex';

      // Switch sub-screens in app shell
      appShellScreens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (id === screenId) {
            el.classList.add('active-screen');
            el.style.display = '';
          } else {
            el.classList.remove('active-screen');
            el.style.display = '';
          }
        }
      });

      // Update Sidebar Active Icons
      document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-app-view') === screenId);
      });

      // If opening dashboard, invalidate Leaflet map size
      if (screenId === 'screen-dashboard') {
        setTimeout(() => {
          if (state.map) state.map.invalidateSize();
          else initLeafletMap();
        }, 100);
      }

      // If opening investigation, start drift simulation canvas
      if (screenId === 'screen-investigation') {
        setTimeout(() => {
          initDriftSimulation();
        }, 100);
      }

    } else {
      // Standalone screen
      appShellWrapper.style.display = 'none';
      screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (id === screenId) {
            el.classList.add('active-screen');
            el.style.display = '';
          } else {
            el.classList.remove('active-screen');
            el.style.display = '';
          }
        }
      });
    }

    window.scrollTo(0, 0);
  }

  // Bind Proto Nav Buttons
  document.querySelectorAll('.proto-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      navigateTo(target);
    });
  });

  // Bind Sidebar Buttons
  document.querySelectorAll('.sidebar-btn[data-app-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-app-view');
      navigateTo(target);
    });
  });

  document.getElementById('sidebar-logo-btn')?.addEventListener('click', () => {
    navigateTo('screen-dashboard');
  });


  // =========================================================================
  // SCREEN 1: SPLASH SCREEN LOGIC
  // =========================================================================
  const splashProgress = document.getElementById('splash-progress-bar');
  const splashStatusText = document.getElementById('splash-status-text');
  const splashPercentText = document.getElementById('splash-percent-text');
  const btnSkipSplash = document.getElementById('btn-skip-splash');

  const splashSteps = [
    { pct: 15, text: "Syncing Sentinel-1 SAR telemetry..." },
    { pct: 38, text: "Calibrating VV/VH polarimetric filters..." },
    { pct: 64, text: "Streaming global AIS Class-A/B beacons..." },
    { pct: 88, text: "Initializing hydrodynamic drift model..." },
    { pct: 100, text: "SpillGuard Defense Network v4.8: ONLINE" }
  ];

  let stepIdx = 0;
  function runSplashSequence() {
    if (state.currentScreen !== 'screen-splash') return;

    if (stepIdx < splashSteps.length) {
      const step = splashSteps[stepIdx];
      if (splashProgress) splashProgress.style.width = step.pct + '%';
      if (splashStatusText) splashStatusText.textContent = step.text;
      if (splashPercentText) splashPercentText.textContent = step.pct + '%';
      stepIdx++;
      setTimeout(runSplashSequence, 750);
    } else {
      setTimeout(() => {
        if (state.currentScreen === 'screen-splash') {
          navigateTo('screen-landing');
        }
      }, 600);
    }
  }

  setTimeout(runSplashSequence, 400);

  btnSkipSplash?.addEventListener('click', () => {
    navigateTo('screen-landing');
  });


  // =========================================================================
  // SCREEN 2: LANDING PAGE ACTIONS
  // =========================================================================
  document.getElementById('landing-login-btn')?.addEventListener('click', () => {
    navigateTo('screen-login');
  });

  document.getElementById('landing-launch-btn')?.addEventListener('click', () => {
    navigateTo('screen-dashboard');
  });

  document.getElementById('hero-demo-cta')?.addEventListener('click', () => {
    navigateTo('screen-login');
  });

  document.getElementById('hero-how-cta')?.addEventListener('click', () => {
    const el = document.getElementById('how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });


  // =========================================================================
  // SCREEN 3: LOGIN PAGE ACTIONS
  // =========================================================================
  const roleChips = document.querySelectorAll('.role-chip');
  roleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      roleChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  const btnDemoLogin = document.getElementById('btn-demo-login');
  btnDemoLogin?.addEventListener('click', () => {
    btnDemoLogin.innerHTML = `
      <span class="pulse-cyan-dot"></span>
      <span>Authenticating USCG Credentials...</span>
    `;
    setTimeout(() => {
      navigateTo('screen-dashboard');
      btnDemoLogin.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        <span>Login with Demo Account</span>
      `;
    }, 600);
  });

  document.getElementById('btn-topbar-logout')?.addEventListener('click', () => {
    navigateTo('screen-login');
  });


  // =========================================================================
  // LIVE CLOCK
  // =========================================================================
  function updateLiveClock() {
    const clockEl = document.getElementById('live-utc-clock');
    if (!clockEl) return;
    const now = new Date();
    const utcString = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    clockEl.textContent = utcString;
  }
  setInterval(updateLiveClock, 1000);
  updateLiveClock();


  // =========================================================================
  // SCREEN 4: MAIN DASHBOARD & LEAFLET DARK INTERACTIVE MAP
  // =========================================================================
  function initLeafletMap() {
    if (state.isLeafletInit || !window.L) return;
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl) return;

    // Default to Malacca Strait TSS
    const reg = SPILLGUARD_DATA.regions[state.currentRegion];
    state.map = L.map('leaflet-map', {
      center: reg.center,
      zoom: reg.zoom,
      zoomControl: true,
      attributionControl: true
    });

    // Public OpenStreetMap tiles — no API key required.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(state.map);

    state.layers.slicks = L.layerGroup().addTo(state.map);
    state.layers.ais = L.layerGroup().addTo(state.map);
    state.layers.drift = L.layerGroup().addTo(state.map);

    renderMapData();
    state.isLeafletInit = true;
  }

  function renderMapData() {
    if (!state.map) return;
    state.layers.slicks.clearLayers();
    state.layers.ais.clearLayers();
    state.layers.drift.clearLayers();

    // 1. Render Spills
    SPILLGUARD_DATA.spills.forEach(spill => {
      // Draw Slick Polygon
      const polygon = L.polygon(spill.slickPolygon, {
        color: spill.severity === 'critical' ? '#FF4438' : '#FFB020',
        weight: 2,
        fillColor: spill.severity === 'critical' ? '#FF4438' : '#FFB020',
        fillOpacity: 0.35,
        dashArray: '4, 4'
      }).addTo(state.layers.slicks);

      polygon.on('click', () => openSpillDrawer(spill));

      // Draw Pulsing Center Marker
      const markerHtml = `
        <div class="spill-marker-pulsing">
          <div class="spill-marker-wave ${spill.severity === 'medium' ? 'medium-risk' : ''}"></div>
          <div class="spill-marker-core ${spill.severity === 'medium' ? 'medium-risk' : ''}"></div>
        </div>
      `;
      const customIcon = L.divIcon({
        className: 'custom-spill-div-icon',
        html: markerHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const marker = L.marker(spill.coords, { icon: customIcon }).addTo(state.layers.slicks);
      marker.on('click', () => openSpillDrawer(spill));
    });

    // 2. Render AIS Vessels & Track Lines
    SPILLGUARD_DATA.vessels.forEach(vessel => {
      // Track Polyline
      L.polyline(vessel.trackHistory, {
        color: vessel.isDarkVessel ? '#FF4438' : '#00D4FF',
        weight: 2,
        opacity: vessel.isDarkVessel ? 0.7 : 0.5,
        dashArray: vessel.isDarkVessel ? '6, 6' : null
      }).addTo(state.layers.ais);

      // Vessel Marker
      const vesselIconHtml = `
        <div style="transform: rotate(${vessel.heading}deg); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="${vessel.isDarkVessel ? '#FF4438' : '#00D4FF'}" stroke="#050B14" stroke-width="1.5">
            <polygon points="12 2 20 21 12 17 4 21 12 2"/>
          </svg>
        </div>
      `;
      const vIcon = L.divIcon({
        html: vesselIconHtml,
        className: 'vessel-div-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const vMarker = L.marker(vessel.coords, { icon: vIcon }).addTo(state.layers.ais);
      vMarker.bindTooltip(`
        <div class="mono" style="background: rgba(6,14,25,0.9); border: 1px solid var(--cyan-border); color: #FFF; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
          <strong>${vessel.name}</strong><br>
          ${vessel.type} • ${vessel.speed} kt<br>
          ${vessel.isDarkVessel ? '<span style="color: var(--red-alert);">DARK VESSEL ALERT</span>' : '<span style="color: var(--green-safe);">AIS ONLINE</span>'}
        </div>
      `, { permanent: false, direction: 'top' });
    });

    // 3. Render Drift Vectors
    const primarySpill = SPILLGUARD_DATA.spills[0];
    const fallbackDrift = [
      primarySpill.coords,
      [primarySpill.coords[0] + 0.08, primarySpill.coords[1] - 0.07]
    ];

    if (state.analysisData.drift && state.analysisData.drift.geojson && state.analysisData.drift.geojson.geometry) {
      const driftCoords = state.analysisData.drift.geojson.geometry.coordinates;
      if (Array.isArray(driftCoords) && driftCoords.length > 1) {
        L.polyline(driftCoords, {
          color: '#FFB020',
          weight: 3,
          dashArray: '5, 8',
          opacity: 0.9
        }).addTo(state.layers.drift);
      }
    } else {
      L.polyline(fallbackDrift, {
        color: '#FFB020',
        weight: 3,
        dashArray: '5, 8',
        opacity: 0.9
      }).addTo(state.layers.drift);
    }
  }

  // Layer Toggle Controls
  document.getElementById('layer-toggle-slicks')?.addEventListener('click', function() {
    this.classList.toggle('active');
    if (this.classList.contains('active')) state.layers.slicks.addTo(state.map);
    else state.map.removeLayer(state.layers.slicks);
  });

  document.getElementById('layer-toggle-ais')?.addEventListener('click', function() {
    this.classList.toggle('active');
    if (this.classList.contains('active')) state.layers.ais.addTo(state.map);
    else state.map.removeLayer(state.layers.ais);
  });

  document.getElementById('layer-toggle-drift')?.addEventListener('click', function() {
    this.classList.toggle('active');
    if (this.classList.contains('active')) state.layers.drift.addTo(state.map);
    else state.map.removeLayer(state.layers.drift);
  });

  // Region Selector
  document.getElementById('region-selector')?.addEventListener('change', (e) => {
    const val = e.target.value;
    state.currentRegion = val;
    const reg = SPILLGUARD_DATA.regions[val];
    if (state.map && reg) {
      state.map.flyTo(reg.center, reg.zoom, { duration: 1.2 });
    }
  });

  // Detail Drawer Logic
  const detailDrawer = document.getElementById('map-detail-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const btnDrawerInvestigate = document.getElementById('btn-drawer-investigate');
  const btnInspectPriority = document.getElementById('btn-inspect-priority');

  function openSpillDrawer(spill) {
    state.selectedSpill = spill;
    document.getElementById('drawer-spill-id').textContent = '#' + spill.id;
    document.getElementById('drawer-spill-title').textContent = spill.title;
    document.getElementById('drawer-sensor-tag').textContent = spill.sensor;
    document.getElementById('drawer-spec-area').textContent = spill.areaKm2 + ' km²';
    document.getElementById('drawer-spec-volume').textContent = spill.volumeBbls.toLocaleString() + ' bbls';
    document.getElementById('drawer-spec-conf').textContent = spill.confidence + '%';
    document.getElementById('drawer-spec-type').textContent = spill.slickType;
    document.getElementById('drawer-suspect-name').textContent = `${spill.primarySuspect.name} (${spill.primarySuspect.confidence}% Match)`;
    
    detailDrawer?.classList.add('drawer-open');
  }

  btnCloseDrawer?.addEventListener('click', () => {
    detailDrawer?.classList.remove('drawer-open');
  });

  btnDrawerInvestigate?.addEventListener('click', () => {
    navigateTo('screen-investigation');
  });

  btnInspectPriority?.addEventListener('click', () => {
    openSpillDrawer(SPILLGUARD_DATA.spills[0]);
    if (state.map) {
      state.map.flyTo(SPILLGUARD_DATA.spills[0].coords, 10, { duration: 0.8 });
    }
  });

  // Bottom Timeline Scrubber
  const slider = document.getElementById('timeline-slider');
  const scrubberTimestamp = document.getElementById('scrubber-timestamp');
  const btnScrubPlay = document.getElementById('btn-scrub-play');

  const timelineLabels = [
    "T-24h: 2026-09-15 04:12 UTC (Clear)",
    "T-18h: 2026-09-15 10:12 UTC (Pre-Discharge)",
    "T-12h: 2026-09-15 16:12 UTC (ICEYE Pass)",
    "T-6h: 2026-09-15 22:12 UTC (DISCHARGE CENTROID)",
    "LIVE: 2026-09-16 04:12 UTC (Sentinel-1A SAR)"
  ];

  slider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    const labelIdx = Math.min(Math.floor((val / 100) * timelineLabels.length), timelineLabels.length - 1);
    if (scrubberTimestamp) {
      scrubberTimestamp.textContent = timelineLabels[labelIdx];
    }
  });

  btnScrubPlay?.addEventListener('click', () => {
    state.isPlayingScrubber = !state.isPlayingScrubber;
    const icon = document.getElementById('play-icon');
    if (state.isPlayingScrubber) {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      state.scrubberInterval = setInterval(() => {
        let cur = parseInt(slider.value, 10);
        cur += 2;
        if (cur > 100) cur = 0;
        slider.value = cur;
        slider.dispatchEvent(new Event('input'));
      }, 100);
    } else {
      icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      clearInterval(state.scrubberInterval);
    }
  });


  // =========================================================================
  // SCREEN 5: SPILL INVESTIGATION & DRIFT SIMULATION ENGINE
  // =========================================================================
  document.getElementById('btn-back-to-dashboard')?.addEventListener('click', () => {
    navigateTo('screen-dashboard');
  });

  let driftParticles = [];
  function initDriftSimulation() {
    const canvas = document.getElementById('drift-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('drift-sim-container');

    // Resize canvas
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Create 70 Lagrangian particles representing oil droplets drifting backwards
    driftParticles = [];
    const originX = canvas.width * 0.35;
    const originY = canvas.height * 0.35;
    const currentX = canvas.width * 0.72;
    const currentY = canvas.height * 0.70;

    for (let i = 0; i < 75; i++) {
      driftParticles.push({
        progress: Math.random(),
        speed: 0.003 + Math.random() * 0.003,
        spreadX: (Math.random() - 0.5) * 45,
        spreadY: (Math.random() - 0.5) * 45,
        size: 2 + Math.random() * 2.5
      });
    }

    function renderDriftFrame() {
      if (state.currentScreen !== 'screen-investigation') {
        cancelAnimationFrame(state.driftAnimationId);
        return;
      }

      ctx.fillStyle = '#040912';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1. Grid lines
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // 2. MT Ocean Vanguard AIS Track Line (Cyan)
      ctx.strokeStyle = '#00D4FF';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(0, 212, 255, 0.5)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.15, canvas.height * 0.20);
      ctx.lineTo(canvas.width * 0.35, canvas.height * 0.35); // Intercept Point
      ctx.lineTo(canvas.width * 0.60, canvas.height * 0.55);
      ctx.lineTo(canvas.width * 0.85, canvas.height * 0.78);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. AIS Blackout Zone (dashed red segment along the ship's course)
      ctx.strokeStyle = '#FF4438';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.shadowColor = 'rgba(255, 68, 56, 0.8)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.25, canvas.height * 0.275);
      ctx.lineTo(canvas.width * 0.45, canvas.height * 0.43);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // AIS Blackout Label
      ctx.fillStyle = '#FF4438';
      ctx.font = '11px JetBrains Mono';
      ctx.fillText('AIS SILENT: 3h 48m (Blackout Zone)', canvas.width * 0.26, canvas.height * 0.25);

      // 4. Backward Drift Trajectory (Amber dashed curve)
      ctx.strokeStyle = '#FFB020';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(currentX, currentY);
      ctx.quadraticCurveTo(canvas.width * 0.55, canvas.height * 0.58, originX, originY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. Draw Animated Lagrangian Particles
      driftParticles.forEach(p => {
        p.progress += p.speed;
        if (p.progress > 1) p.progress = 0;

        // Interpolate along the drift trajectory (from current slick position backwards to origin)
        const t = p.progress;
        const px = (1 - t) * currentX + t * originX + p.spreadX * (1 - t);
        const py = (1 - t) * currentY + t * originY + p.spreadY * (1 - t);

        ctx.fillStyle = `rgba(255,176,32, ${0.85 - t * 0.5})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 6. Current Slick Position (Red Solid Blob)
      ctx.fillStyle = 'rgba(255, 68, 56, 0.45)';
      ctx.strokeStyle = '#FF4438';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255, 68, 56, 0.6)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.ellipse(currentX, currentY, 55, 35, Math.PI / 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#FFF';
      ctx.font = '12px Space Grotesk';
      ctx.fillText('SLICK: Sentinel-1A SAR (45.2 km²)', currentX - 90, currentY + 50);

      // 7. Intercept Point (Intersection of Vessel Track & Reverse Drift Origin)
      ctx.strokeStyle = '#FF4438';
      ctx.fillStyle = 'rgba(255, 68, 56, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(originX, originY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FF4438';
      ctx.beginPath();
      ctx.arc(originX, originY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = '12px Space Grotesk';
      ctx.fillText('DISCHARGE INTERCEPT POINT', originX - 70, originY - 26);
      ctx.fillStyle = 'var(--cyan-primary)';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('02°26\'42"N 101°51\'18"E @ 03:14 UTC', originX - 70, originY - 12);

      state.driftAnimationId = requestAnimationFrame(renderDriftFrame);
    }

    renderDriftFrame();
  }

  document.getElementById('btn-replay-drift')?.addEventListener('click', () => {
    driftParticles.forEach(p => p.progress = 0);
  });

  // Modal Controls
  const dossierModal = document.getElementById('dossier-modal');
  document.getElementById('btn-open-dossier-modal')?.addEventListener('click', () => {
    dossierModal?.classList.add('modal-active');
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    dossierModal?.classList.remove('modal-active');
  });

  document.getElementById('btn-cancel-modal')?.addEventListener('click', () => {
    dossierModal?.classList.remove('modal-active');
  });

  document.getElementById('btn-download-pdf')?.addEventListener('click', () => {
    alert("Official UNCLOS / MARPOL Annex I Forensic Dossier (SHA-256 Verified) downloaded.");
    dossierModal?.classList.remove('modal-active');
  });

  document.getElementById('btn-issue-interpol-alert')?.addEventListener('click', () => {
    alert("INTERPOL Purple Notice transmitted for MT Ocean Vanguard (IMO 9482154). Marine pollution alert dispatched to regional port state authorities.");
  });


  // =========================================================================
  // SCREEN 6: VESSEL TRACKING TABLE & SEARCH
  // =========================================================================
  function renderVesselsTable() {
    const tbody = document.getElementById('vessels-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('vessel-search-input')?.value || '').toLowerCase();
    const filter = state.selectedVesselFilter;

    const filtered = SPILLGUARD_DATA.vessels.filter(v => {
      // Search filter
      const matchesSearch = v.name.toLowerCase().includes(searchTerm) ||
                            v.imo.toString().includes(searchTerm) ||
                            v.flag.toLowerCase().includes(searchTerm) ||
                            v.type.toLowerCase().includes(searchTerm);

      if (!matchesSearch) return false;

      // Category filter
      if (filter === 'dark') return v.isDarkVessel;
      if (filter === 'tankers') return v.type.toLowerCase().includes('tanker') || v.type.toLowerCase().includes('carrier');
      if (filter === 'high-risk') return v.riskScore > 70;
      return true;
    });

    tbody.innerHTML = filtered.map(v => `
      <tr>
        <td>
          <div style="font-weight: 600; color: #FFF;">${v.name}</div>
          <div class="mono" style="font-size: 11px; color: var(--text-muted);">IMO ${v.imo} • MMSI ${v.mmsi}</div>
        </td>
        <td>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span>${v.flag}</span>
          </span>
        </td>
        <td>${v.type}</td>
        <td class="mono" style="font-size: 12px;">${v.lastAisPing}</td>
        <td>
          ${v.isDarkVessel ? `
            <span class="dark-vessel-badge">
              <span class="pulse-cyan-dot" style="background: var(--red-alert); box-shadow: 0 0 6px var(--red-alert);"></span>
              ${v.darkDuration}
            </span>
          ` : `
            <span class="safe-vessel-badge">
              <span class="pulse-cyan-dot" style="background: var(--green-safe); box-shadow: 0 0 6px var(--green-safe);"></span>
              AIS Compliant
            </span>
          `}
        </td>
        <td class="mono" style="font-size: 12px;">${v.speed} kt / ${v.heading}°</td>
        <td>
          <span class="mono" style="font-weight: 700; color: ${v.riskScore > 75 ? 'var(--red-alert)' : v.riskScore > 40 ? 'var(--amber-warning)' : 'var(--green-safe)'};">
            ${v.riskScore}/100
          </span>
        </td>
        <td>
          ${v.isDarkVessel ? `
            <button class="btn-secondary btn-inspect-vessel" data-imo="${v.imo}" style="padding: 4px 10px; font-size: 11px; border-color: var(--red-border); color: var(--red-alert);">
              Investigate Anomaly →
            </button>
          ` : `
            <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;">
              Track Path
            </button>
          `}
        </td>
      </tr>
    `).join('');

    // Bind row investigate buttons
    document.querySelectorAll('.btn-inspect-vessel').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo('screen-investigation');
      });
    });
  }

  // Filter tabs
  document.querySelectorAll('.filter-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedVesselFilter = btn.getAttribute('data-filter');
      renderVesselsTable();
    });
  });

  document.getElementById('vessel-search-input')?.addEventListener('input', renderVesselsTable);
  renderVesselsTable();


  // =========================================================================
  // SCREEN 7: ANALYTICS CHARTS & DISTRIBUTION
  // =========================================================================
  function renderAnalyticsCharts() {
    // 1. Spills Over Time SVG Chart
    const chartContainer = document.getElementById('chart-spills-time');
    if (!chartContainer) return;

    const data = SPILLGUARD_DATA.analytics.monthlyTrend;
    const maxVal = 45;
    const w = 560;
    const h = 220;

    let svgHtml = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" style="overflow: visible;">
        <!-- Grid lines -->
        <line x1="40" y1="20" x2="${w}" y2="20" stroke="rgba(255,255,255,0.06)" />
        <line x1="40" y1="70" x2="${w}" y2="70" stroke="rgba(255,255,255,0.06)" />
        <line x1="40" y1="120" x2="${w}" y2="120" stroke="rgba(255,255,255,0.06)" />
        <line x1="40" y1="170" x2="${w}" y2="170" stroke="rgba(255,255,255,0.06)" />
        <line x1="40" y1="200" x2="${w}" y2="200" stroke="rgba(144,164,190,0.3)" />

        <!-- Y Axis Labels -->
        <text x="15" y="25" fill="#536B88" font-family="JetBrains Mono" font-size="10">45</text>
        <text x="15" y="75" fill="#536B88" font-family="JetBrains Mono" font-size="10">30</text>
        <text x="15" y="125" fill="#536B88" font-family="JetBrains Mono" font-size="10">15</text>
        <text x="15" y="175" fill="#536B88" font-family="JetBrains Mono" font-size="10">5</text>
    `;

    const colWidth = (w - 60) / data.length;

    data.forEach((d, idx) => {
      const cx = 50 + idx * colWidth + colWidth / 2;
      const hMinor = (d.minor / maxVal) * 160;
      const hSig = (d.significant / maxVal) * 160;
      const hCat = (d.catastrophic / maxVal) * 160;

      const yMinor = 200 - hMinor;
      const ySig = yMinor - hSig;
      const yCat = ySig - hCat;

      svgHtml += `
        <!-- Stacked Bars -->
        <rect x="${cx - 16}" y="${yCat}" width="32" height="${hCat}" fill="#FF4438" rx="2" />
        <rect x="${cx - 16}" y="${ySig}" width="32" height="${hSig}" fill="#FFB020" />
        <rect x="${cx - 16}" y="${yMinor}" width="32" height="${hMinor}" fill="#00D4FF" />

        <!-- X Label -->
        <text x="${cx}" y="218" text-anchor="middle" fill="#90A4BE" font-family="JetBrains Mono" font-size="11">${d.month}</text>
      `;
    });

    svgHtml += `</svg>`;
    chartContainer.innerHTML = svgHtml;

    // 2. Regional Distribution Bars
    const regContainer = document.getElementById('regional-distribution-bars');
    if (regContainer) {
      regContainer.innerHTML = SPILLGUARD_DATA.analytics.regionalDistribution.map(item => `
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px;">
            <span>${item.region}</span>
            <span class="mono" style="font-weight: 700; color: ${item.color};">${item.percent}%</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${item.percent}%; background: ${item.color}; box-shadow: 0 0 10px ${item.color}40;"></div>
          </div>
        </div>
      `).join('');
    }

    // 3. Top Flagged Repeat Offenders
    const topFleets = document.getElementById('top-flagged-bars');
    if (topFleets) {
      topFleets.innerHTML = SPILLGUARD_DATA.analytics.topFlaggedFleets.map(item => `
        <div class="bar-row-item">
          <div class="bar-row-label-wrap">
            <span>${item.name}</span>
            <span class="mono" style="color: var(--text-primary); font-weight: 600;">${item.count} Incidents</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill ${item.color}" style="width: ${item.pct}%;"></div>
          </div>
        </div>
      `).join('');
    }
  }

  renderAnalyticsCharts();

  // Analysis Panel
  function renderAnalysisPanel() {
    const rankingBody = document.getElementById('analysis-ranking-body');
    const warningList = document.getElementById('dark-vessel-warning-list');
    if (!rankingBody || !warningList) return;

    if (!state.analysisData.rankings.length) {
      rankingBody.innerHTML = '<tr><td colspan="3" class="analysis-empty-state">No analysis run yet</td></tr>';
      warningList.innerHTML = '<li>No suspicious AIS gaps detected yet.</li>';
      return;
    }

    rankingBody.innerHTML = state.analysisData.rankings.slice(0, 5).map(v => `
      <tr>
        <td>${v.vessel_name || 'Unknown vessel'}</td>
        <td class="mono">${v.total_score}</td>
        <td><span class="priority-badge ${v.priority.toLowerCase()}">${v.priority}</span></td>
      </tr>
    `).join('');

    const warnings = state.analysisData.darkWarnings.length
      ? state.analysisData.darkWarnings
      : ['No suspicious AIS gaps detected yet.'];

    warningList.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
  }

  function getDemoDataset() {
    const demoSpill = {
      ...SPILLGUARD_DATA.spills[0],
      id: 'SG-8842',
      title: 'Malacca Strait TSS Central Infiltration',
      coords: [2.3812, 101.9124],
      areaKm2: 45.2,
      volumeBbls: 18400,
      confidence: 96.8,
      sensor: 'Sentinel-1A (C-Band IW VV+VH)'
    };

    const demoVessels = SPILLGUARD_DATA.vessels.map((v, index) => ({
      ...v,
      coords: v.coords,
      isDarkVessel: index === 0 || index === 3,
      speed: v.speed || 12,
      heading: v.heading || 120,
      riskScore: v.riskScore || 60,
      lastAisPing: index === 0 ? '3 min ago' : `${(index + 1) * 45} sec ago`,
      darkDuration: index === 0 ? '3h 48m blackout at spill origin' : index === 3 ? '1h 14m intermittent gap' : 'None (continuous)'
    }));

    return { spills: [demoSpill], vessels: demoVessels };
  }

  function loadDemoData() {
    const demo = getDemoDataset();
    SPILLGUARD_DATA.spills = demo.spills;
    SPILLGUARD_DATA.vessels = demo.vessels;
    state.selectedSpill = demo.spills[0];
    renderMapData();
    renderVesselsTable();
    renderAnalysisPanel();

    if (state.map) {
      state.map.flyTo(demo.spills[0].coords, 9, { duration: 0.8 });
    }

    return demo;
  }

  async function runAnalysis() {
    const spill = SPILLGUARD_DATA.spills[0];
    if (!spill) return;

    const spillLat = spill.coords[0];
    const spillLon = spill.coords[1];
    const payload = {
      sar_time: '2026-09-17T10:00:00Z',
      sar_vessels: [{ id: 'sar_1', lat: spillLat, lon: spillLon }],
      ais_points: SPILLGUARD_DATA.vessels.map(v => ({
        mmsi: String(v.mmsi),
        vessel_name: v.name,
        lat: v.coords[0],
        lon: v.coords[1],
        timestamp: new Date(Date.now() - (v.isDarkVessel ? 210 : 30) * 60 * 1000).toISOString(),
        speed_knots: v.speed,
        heading: v.heading,
        vessel_type: v.type
      }))
    };

    try {
      const [matchResponse, rankingResponse, driftResponse] = await Promise.all([
        fetch('/api/match-vessels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
        fetch('/api/rank-suspects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin_lat: spillLat,
            origin_lon: spillLon,
            release_start: '2026-09-17T03:00:00Z',
            release_end: '2026-09-17T05:00:00Z',
            vessels: SPILLGUARD_DATA.vessels.map(v => ({
              vessel_name: v.name,
              vessel_type: v.type,
              lat: v.coords[0],
              lon: v.coords[1],
              speed_knots: v.speed,
              timestamp: new Date(Date.now() - (v.isDarkVessel ? 35 : 15) * 60 * 1000).toISOString(),
              ais_gap_minutes: v.isDarkVessel ? 228 : 12,
              is_dark_vessel: v.isDarkVessel
            }))
          })
        }),
        fetch('/api/drift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spill_lat: spillLat,
            spill_lon: spillLon,
            current_speed_mps: 0.4,
            current_direction_degrees: 45,
            hours: 12
          })
        })
      ]);

      if (!matchResponse.ok || !rankingResponse.ok || !driftResponse.ok) {
        throw new Error('One or more analysis endpoints failed.');
      }

      const matchData = await matchResponse.json();
      const rankingData = await rankingResponse.json();
      const driftData = await driftResponse.json();

      state.analysisData.matchResults = matchData.results || [];
      state.analysisData.rankings = rankingData.results || [];
      state.analysisData.drift = driftData;

      state.analysisData.darkWarnings = state.analysisData.matchResults
        .filter(item => item.status === 'possible_dark_vessel')
        .map(item => `${item.sar_vessel_id}: possible dark vessel without a close AIS match within 5 km / 15 minutes.`);

      if (!state.analysisData.darkWarnings.length && state.analysisData.rankings.length) {
        state.analysisData.darkWarnings = state.analysisData.rankings
          .filter(item => item.priority === 'High')
          .map(item => `${item.vessel_name}: high-priority suspect based on proximity and AIS behaviour.`);
      }

      renderAnalysisPanel();
      renderMapData();
      if (state.map) {
        state.map.flyTo(spill.coords, 9, { duration: 0.8 });
      }
    } catch (error) {
      console.error('Analysis request failed:', error);
      state.analysisData.darkWarnings = ['Analysis failed. Please confirm the backend is running.', 'Investigation support, not final proof.'];
      state.analysisData.rankings = [];
      renderAnalysisPanel();
    }
  }

  document.getElementById('btn-run-analysis')?.addEventListener('click', runAnalysis);
  document.getElementById('btn-load-demo-data')?.addEventListener('click', async () => {
    loadDemoData();
    await runAnalysis();
  });

  renderAnalysisPanel();

});
