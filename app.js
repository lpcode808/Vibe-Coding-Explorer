'use strict';

const STORAGE_KEY = 'promptquest_visited';
const MUSIC_STORAGE_KEY = 'promptquest_music';
const COPY_DEFAULT_LABEL = '📋 COPY PROMPT';
const COPY_SUCCESS_LABEL = '✅ Copied!';
const COPY_ERROR_LABEL = '⚠ COPY AGAIN';
const COPY_DONE_LABEL_FALLBACK = '✅ GOT IT!';
const COPY_FEEDBACK_MS = 2000;
const HELP_AUTO_HIDE_MS = 3000;
const HANDOFF_CONFIRM_MS = 140;
const DRAWER_CLOSE_MS = 260;
const HANDOFF_TO_MACHINE_MS = 2600;
const HANDOFF_MACHINE_PAUSE_MS = 720;
const HANDOFF_TO_DESTINATION_MS = 3400;
const HANDOFF_WRAPUP_MS = 280;
const GUIDE_FLASH_MS = 1800;
const AVATAR_SPEED = 260;
const AVATAR_ACCEL = 1800;
const AVATAR_DECEL = 2400;
const AVATAR_VELOCITY_EPSILON = 6;
const AVATAR_SIZE_FALLBACK = 88;
const HANDOFF_AVATAR_SIZE_FALLBACK = 58;
const AVATAR_TOUCH_PADDING_X = 10;
const AVATAR_TOUCH_PADDING_Y = 4;
const AVATAR_TOP_MARGIN = 28;
const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const ACTIVATION_CODES = new Set(['Space', 'Enter']);

const MUSIC_MASTER_GAIN = 0.16;
const MUSIC_CHORD_SECONDS = 4.0;
const MUSIC_CHORDS = [
  [220.00, 261.63, 329.63],
  [174.61, 220.00, 261.63, 329.63],
  [130.81, 164.81, 196.00, 261.63],
  [196.00, 246.94, 293.66],
];
const MUSIC_MELODY = [329.63, 261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66];
const getNow = () =>
  window.performance && typeof window.performance.now === 'function'
    ? window.performance.now()
    : Date.now();
const requestFrame =
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(() => callback(getNow()), 16);

const zoneLookup = new Map(window.ZONES.map((zone) => [zone.id, zone]));

const state = {
  activeZoneId: null,
  activationKeyHeld: false,
  copyResetTimer: null,
  visited: loadVisitedSet(),
  avatar: {
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    facing: 'right',
    isWalking: false,
    touchingZoneId: null,
    keys: new Set(),
    hasPlaced: false,
    mapWidth: 0,
    mapHeight: 0,
    lastFrameTime: 0,
    frameRequestId: null,
  },
  music: {
    ctx: null,
    master: null,
    filter: null,
    delay: null,
    isOn: false,
    patternIndex: 0,
    nextTime: 0,
    scheduler: null,
  },
  handoff: {
    isAnimating: false,
    getActivePoints: null,
    frameRequestId: null,
    guideTimer: null,
  },
  help: {
    isVisible: true,
    hideTimer: null,
  },
};

const elements = {
  body: document.body,
  mapView: document.getElementById('map-view'),
  adventureHud: document.getElementById('adventure-hud'),
  helpToggle: document.getElementById('help-toggle'),
  zoneCards: Array.from(document.querySelectorAll('.zone-card')),
  drawerLayer: document.getElementById('drawer-layer'),
  drawerScrim: document.getElementById('drawer-scrim'),
  drawerClose: document.getElementById('drawer-close'),
  drawerKicker: document.getElementById('drawer-kicker'),
  drawerTitle: document.getElementById('drawer-title'),
  drawerSummary: document.getElementById('drawer-summary'),
  drawerInstructions: document.getElementById('drawer-instructions'),
  drawerPreviewSection: document.getElementById('drawer-preview-section'),
  drawerPreview: document.getElementById('drawer-preview'),
  copyButton: document.getElementById('copy-button'),
  externalLink: document.getElementById('external-link'),
  handoffPathLayer: document.getElementById('handoff-path-layer'),
  handoffPathToMachine: document.getElementById('handoff-path-to-machine'),
  handoffPathToForge: document.getElementById('handoff-path-to-forge'),
  geminiMachine: document.getElementById('gemini-machine'),
  geminiMachineSprite: document.querySelector('.gemini-machine-sprite'),
  wireframeHandoff: document.getElementById('wireframe-handoff'),
  handoffLabel: document.getElementById('handoff-label'),
  pantherAvatar: document.getElementById('panther-avatar'),
  pantherStatus: document.getElementById('panther-status'),
  musicToggle: document.getElementById('music-toggle'),
  touchPad: document.getElementById('touch-pad'),
  touchAction: document.getElementById('touch-action'),
  touchKeys: [
    { button: document.getElementById('touch-up'), code: 'KeyW' },
    { button: document.getElementById('touch-down'), code: 'KeyS' },
    { button: document.getElementById('touch-left'), code: 'KeyA' },
    { button: document.getElementById('touch-right'), code: 'KeyD' },
  ],
};

initialize();

function initialize() {
  elements.zoneCards.forEach((card) => {
    card.addEventListener('click', () => openZone(card.dataset.zoneId));
  });

  elements.drawerClose.addEventListener('click', closeDrawer);
  elements.drawerScrim.addEventListener('click', closeDrawer);
  elements.copyButton.addEventListener('click', handleCopyClick);

  if (elements.externalLink) {
    elements.externalLink.addEventListener('click', handleExternalLinkClick);
  }

  if (elements.musicToggle) {
    elements.musicToggle.addEventListener('click', handleMusicToggle);
    renderMusicToggleState();
  }

  if (elements.helpToggle) {
    elements.helpToggle.addEventListener('click', handleHelpToggleClick);
    renderHelpState();
    scheduleHelpAutoHide();
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('resize', handleResize);

  setupTouchControls();

  renderVisitedBadges();
  refreshQuestComplete(false);
  resetCopyButton();
  positionAvatarAtStart(true);
  updateTouchingZone();
  focusMapView();
  startAvatarLoop();
}

function handleKeyDown(event) {
  if (isHelpShortcut(event) && !isInteractiveTarget(event.target)) {
    event.preventDefault();
    toggleHelp();
    return;
  }

  if (state.handoff.isAnimating) {
    if (event.key === 'Escape' || MOVEMENT_CODES.has(event.code) || ACTIVATION_CODES.has(event.code)) {
      event.preventDefault();
    }
    return;
  }

  if (state.activeZoneId && handleDrawerShortcutKeyDown(event)) {
    return;
  }

  if (event.key === 'Escape' && state.activeZoneId) {
    event.preventDefault();
    closeDrawer();
    return;
  }

  if (MOVEMENT_CODES.has(event.code)) {
    event.preventDefault();
    state.avatar.keys.add(event.code);
    return;
  }

  if (!ACTIVATION_CODES.has(event.code)) {
    return;
  }

  if (isInteractiveTarget(event.target)) {
    return;
  }

  event.preventDefault();

  if (state.activationKeyHeld) {
    return;
  }

  state.activationKeyHeld = true;

  if (state.activeZoneId) {
    return;
  }

  if (state.avatar.touchingZoneId) {
    openZone(state.avatar.touchingZoneId);
    return;
  }

  updatePantherStatus('Walk closer to a zone, then press SPACE.');
}

function handleKeyUp(event) {
  if (ACTIVATION_CODES.has(event.code)) {
    state.activationKeyHeld = false;
  }

  if (MOVEMENT_CODES.has(event.code)) {
    state.avatar.keys.delete(event.code);
  }
}

function handleResize() {
  const mapRect = elements.mapView.getBoundingClientRect();

  if (!mapRect.width || !mapRect.height) {
    return;
  }

  if (!state.avatar.hasPlaced || !state.avatar.mapWidth || !state.avatar.mapHeight) {
    positionAvatarAtStart(true);
    updateTouchingZone();
    return;
  }

  state.avatar.x *= mapRect.width / state.avatar.mapWidth;
  state.avatar.y *= mapRect.height / state.avatar.mapHeight;
  state.avatar.mapWidth = mapRect.width;
  state.avatar.mapHeight = mapRect.height;
  clampAvatarPosition();
  renderAvatar();

  if (state.handoff.isAnimating && state.handoff.getActivePoints) {
    renderHandoffPaths(state.handoff.getActivePoints());
  }

  updateTouchingZone();
}

function openZone(zoneId) {
  if (state.handoff.isAnimating) {
    return;
  }

  const zone = zoneLookup.get(zoneId);

  if (!zone) {
    return;
  }

  state.activeZoneId = zoneId;
  clearMovementKeys();
  populateDrawer(zone);
  highlightActiveZone(zoneId);
  pulseZone(zoneId);
  resetCopyButton();

  elements.drawerLayer.classList.add('is-open');
  elements.drawerLayer.setAttribute('aria-hidden', 'false');
  elements.body.classList.add('drawer-open');

  updateTouchingZone();
  updatePantherStatus(`Inside ${zone.name}. Press ESC or tap X to close.`);
}

function closeDrawer() {
  state.activeZoneId = null;

  elements.drawerLayer.classList.remove('is-open');
  elements.drawerLayer.setAttribute('aria-hidden', 'true');
  elements.body.classList.remove('drawer-open');

  elements.zoneCards.forEach((card) => card.classList.remove('is-active'));
  resetCopyButton();
  updateTouchingZone();
  focusMapView();
}

function populateDrawer(zone) {
  elements.drawerKicker.textContent = zone.tagline.toUpperCase();
  elements.drawerTitle.textContent = `${zone.emoji} ${zone.name}`;
  elements.drawerSummary.textContent = zone.summary;
  elements.copyButton.dataset.zoneId = zone.id;

  const copyEnabled = zone.copyEnabled !== false;
  elements.copyButton.classList.toggle('is-inert', !copyEnabled);
  elements.copyButton.setAttribute(
    'aria-label',
    copyEnabled
      ? `Copy the ${zone.name} prompt. Press 2 or Enter to activate.`
      : `Mark ${zone.name} as complete. Press 2 or Enter to activate.`
  );

  elements.drawerInstructions.replaceChildren(
    ...zone.instructions.map((instruction) => {
      const item = document.createElement('li');
      item.textContent = instruction;
      return item;
    })
  );

  if (zone.showPreview && zone.promptText) {
    elements.drawerPreview.textContent = buildPreview(zone);
    elements.drawerPreviewSection.hidden = false;
  } else {
    elements.drawerPreview.textContent = '';
    elements.drawerPreviewSection.hidden = true;
  }

  if (elements.externalLink) {
    if (zone.externalLink) {
      elements.externalLink.href = zone.externalLink;
      elements.externalLink.textContent = zone.externalLinkLabel || '🌐 Open Link';
      elements.externalLink.hidden = false;
      elements.externalLink.setAttribute(
        'aria-label',
        `${zone.externalLinkLabel || 'Open link'} in a new tab. Press 1 to activate.`
      );
    } else {
      elements.externalLink.hidden = true;
      elements.externalLink.removeAttribute('href');
    }
  }
}

function buildPreview(zone) {
  const lines = zone.promptText.replace(/\r\n/g, '\n').split('\n');
  const preview = lines.slice(0, zone.previewLines).join('\n');

  return `${preview}\n...and more inside`;
}

async function handleCopyClick() {
  const zone = zoneLookup.get(state.activeZoneId);

  if (!zone) {
    return;
  }

  if (zone.copyEnabled === false) {
    if (zone.id === 'blueprint') {
      await runBlueprintHandoff(zone);
      return;
    }

    markZoneVisited(zone.id);
    setCopyButtonState(zone.doneLabel || COPY_DONE_LABEL_FALLBACK, 'is-copied');
    window.setTimeout(() => {
      if (state.activeZoneId === zone.id) {
        closeDrawer();
      }
    }, 600);
    return;
  }

  elements.copyButton.disabled = true;

  try {
    await copyText(zone.promptText);
    setCopyButtonState(COPY_SUCCESS_LABEL, 'is-copied');
    markZoneVisited(zone.id);

    if (zone.id === 'forge') {
      await runForgePrototypeHandoff(zone);
      return;
    }

    if (zone.id === 'library') {
      await runLibraryHandoff(zone);
      return;
    }
  } catch (error) {
    console.error('Prompt copy failed.', error);
    setCopyButtonState(COPY_ERROR_LABEL, 'is-error');
  } finally {
    elements.copyButton.disabled = false;
    queueCopyButtonReset();
  }
}

async function runForgePrototypeHandoff(zone) {
  if (state.handoff.isAnimating) {
    return;
  }

  state.handoff.isAnimating = true;
  state.handoff.getActivePoints = () => getMachineHandoffPoints('forge', 'library');
  clearMovementKeys();
  setCopyButtonState('FIRST PROTOTYPE!', 'is-copied');
  updatePantherStatus('Your prototype is heading to Gemini...');

  try {
    await delay(getMotionDuration(HANDOFF_CONFIRM_MS, 80));

    if (state.activeZoneId === zone.id) {
      closeDrawer();
    }

    await delay(getMotionDuration(DRAWER_CLOSE_MS, 80));
    await playMachineHandoffAnimation({
      getPoints: state.handoff.getActivePoints,
      initialMode: 'prototype',
      initialLabel: 'PROTOTYPE',
      transformedLabel: 'CODE GUIDE',
      readingStatus: 'Gemini is reading the prototype...',
      transformedStatus: 'Gemini turned the prototype into a code guide. Follow it to Zone 2.',
      deliveringStatus: 'The code guide is heading to The Library...',
      destinationZoneId: 'library',
    });
    updatePantherStatus('Code guide ready. Next stop: The Library.');
    await delay(getMotionDuration(HANDOFF_WRAPUP_MS, 120));
  } finally {
    setGeminiMachineProcessing(false);
    hideHandoffPaths();
    hideWireframeHandoff();
    state.handoff.isAnimating = false;
    state.handoff.getActivePoints = null;
    focusMapView();
  }
}

async function runLibraryHandoff(zone) {
  if (state.handoff.isAnimating) {
    return;
  }

  state.handoff.isAnimating = true;
  state.handoff.getActivePoints = () => getMachineHandoffPoints('library', 'workshop');
  clearMovementKeys();
  setCopyButtonState('CODE EXPLAINED!', 'is-copied');
  updatePantherStatus('Your code map is heading to Gemini...');

  try {
    await delay(getMotionDuration(HANDOFF_CONFIRM_MS, 80));

    if (state.activeZoneId === zone.id) {
      closeDrawer();
    }

    await delay(getMotionDuration(DRAWER_CLOSE_MS, 80));
    await playMachineHandoffAnimation({
      getPoints: state.handoff.getActivePoints,
      initialMode: 'prototype',
      initialLabel: 'CODE MAP',
      transformedLabel: 'DEBUG TUTOR',
      readingStatus: 'Gemini is reading the code map...',
      transformedStatus: 'Gemini turned the code map into a debug tutor. Follow it to Zone 3.',
      deliveringStatus: 'The debug tutor is heading to The Workshop...',
      destinationZoneId: 'workshop',
    });
    updatePantherStatus('Debug tutor ready. Next stop: The Workshop.');
    await delay(getMotionDuration(HANDOFF_WRAPUP_MS, 120));
  } finally {
    setGeminiMachineProcessing(false);
    hideHandoffPaths();
    hideWireframeHandoff();
    state.handoff.isAnimating = false;
    state.handoff.getActivePoints = null;
    focusMapView();
  }
}

async function runBlueprintHandoff(zone) {
  if (state.handoff.isAnimating) {
    return;
  }

  state.handoff.isAnimating = true;
  state.handoff.getActivePoints = () => getMachineHandoffPoints('blueprint', 'forge');
  clearMovementKeys();
  markZoneVisited(zone.id);
  setCopyButtonState(zone.doneLabel || COPY_DONE_LABEL_FALLBACK, 'is-copied');
  elements.copyButton.disabled = true;
  updatePantherStatus('Wireframe ready. Sending it to Gemini...');

  try {
    await delay(getMotionDuration(HANDOFF_CONFIRM_MS, 80));

    if (state.activeZoneId === zone.id) {
      closeDrawer();
    }

    await delay(getMotionDuration(DRAWER_CLOSE_MS, 80));
    await playMachineHandoffAnimation({
      getPoints: state.handoff.getActivePoints,
      initialMode: 'wireframe',
      initialLabel: 'WIREFRAME',
      transformedLabel: 'PRD',
      readingStatus: 'Gemini is reading the wireframe...',
      transformedStatus: 'Gemini changed the wireframe into a PRD. Follow it to Zone 1.',
      deliveringStatus: 'The PRD is heading to The Forge...',
      destinationZoneId: 'forge',
    });
    updatePantherStatus('PRD delivered. Next stop: The Forge.');
    await delay(getMotionDuration(HANDOFF_WRAPUP_MS, 120));
  } finally {
    setGeminiMachineProcessing(false);
    hideHandoffPaths();
    hideWireframeHandoff();
    state.handoff.isAnimating = false;
    state.handoff.getActivePoints = null;
    elements.copyButton.disabled = false;
    resetCopyButton();
    focusMapView();
  }
}

function handleExternalLinkClick() {
  if (!state.activeZoneId) {
    return;
  }
  markZoneVisited(state.activeZoneId);
}

function handleHelpToggleClick() {
  toggleHelp();
  focusMapView();
}

function toggleHelp() {
  if (state.help.isVisible) {
    hideHelp();
  } else {
    showHelp();
  }
}

function showHelp() {
  clearHelpAutoHide();
  state.help.isVisible = true;
  renderHelpState();
  scheduleHelpAutoHide();
}

function hideHelp() {
  clearHelpAutoHide();
  state.help.isVisible = false;
  renderHelpState();
}

function scheduleHelpAutoHide() {
  clearHelpAutoHide();

  if (!state.help.isVisible) {
    return;
  }

  state.help.hideTimer = window.setTimeout(hideHelp, HELP_AUTO_HIDE_MS);
}

function clearHelpAutoHide() {
  if (!state.help.hideTimer) {
    return;
  }

  window.clearTimeout(state.help.hideTimer);
  state.help.hideTimer = null;
}

function renderHelpState() {
  if (elements.adventureHud) {
    elements.adventureHud.classList.toggle('is-hidden', !state.help.isVisible);
    elements.adventureHud.setAttribute('aria-hidden', String(!state.help.isVisible));
  }

  if (elements.helpToggle) {
    elements.helpToggle.classList.toggle('is-active', state.help.isVisible);
    elements.helpToggle.setAttribute('aria-expanded', String(state.help.isVisible));
    elements.helpToggle.setAttribute(
      'aria-label',
      state.help.isVisible ? 'Hide map controls' : 'Show map controls'
    );
  }
}

function handleDrawerShortcutKeyDown(event) {
  if (!state.activeZoneId) {
    return false;
  }

  const canUseTopChoice = Boolean(
    elements.externalLink &&
    !elements.externalLink.hidden &&
    elements.externalLink.getAttribute('href')
  );

  if (event.code === 'Digit1' || event.code === 'Numpad1') {
    if (!canUseTopChoice) {
      return false;
    }

    event.preventDefault();
    elements.externalLink.click();
    return true;
  }

  const isMainChoice =
    event.code === 'Digit2' ||
    event.code === 'Numpad2' ||
    (event.key === 'Enter' && !isInteractiveTarget(event.target));

  if (!isMainChoice) {
    return false;
  }

  event.preventDefault();

  if (!elements.copyButton.disabled) {
    elements.copyButton.click();
  }

  return true;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');

  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const didCopy = document.execCommand('copy');
  textarea.remove();

  if (!didCopy) {
    throw new Error('document.execCommand("copy") returned false');
  }
}

function markZoneVisited(zoneId) {
  const wasVisited = state.visited.has(zoneId);

  if (!wasVisited) {
    state.visited.add(zoneId);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.visited]));
    } catch (error) {
      console.warn('Visited state could not be saved.', error);
    }

    renderVisitedBadges();
  }

  refreshQuestComplete(!wasVisited);
}

function refreshQuestComplete(announce) {
  const isComplete = state.visited.size >= zoneLookup.size;

  elements.body.classList.toggle('is-quest-complete', isComplete);

  if (isComplete && announce) {
    updatePantherStatus('🏆 Quest Complete! All four zones visited. Revisit any zone any time.');
  }
}

function renderVisitedBadges() {
  elements.zoneCards.forEach((card) => {
    const badge = card.querySelector('.zone-badge');
    const isVisited = state.visited.has(card.dataset.zoneId);

    badge.hidden = !isVisited;
    card.classList.toggle('is-visited', isVisited);
  });
}

function highlightActiveZone(zoneId) {
  elements.zoneCards.forEach((card) => {
    card.classList.toggle('is-active', card.dataset.zoneId === zoneId);
  });
}

function pulseZone(zoneId) {
  const card = getZoneCard(zoneId);

  if (!card) {
    return;
  }

  card.classList.remove('is-pulsing');
  void card.offsetWidth;
  card.classList.add('is-pulsing');
}

function startAvatarLoop() {
  state.avatar.lastFrameTime = getNow();
  state.avatar.frameRequestId = requestFrame(stepAvatarLoop);
}

function stepAvatarLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - state.avatar.lastFrameTime) / 1000, 0.05);

  state.avatar.lastFrameTime = timestamp;
  updateAvatar(deltaSeconds);
  state.avatar.frameRequestId = requestFrame(stepAvatarLoop);
}

function updateAvatar(deltaSeconds) {
  if (!elements.mapView || !elements.pantherAvatar) {
    return;
  }

  if (state.handoff.isAnimating) {
    state.avatar.isWalking = false;
    renderAvatar();
    return;
  }

  if (!state.avatar.hasPlaced) {
    positionAvatarAtStart(true);
  }

  if (state.activeZoneId) {
    state.avatar.isWalking = false;
    renderAvatar();
    return;
  }

  const movement = getMovementVector();
  const magnitude = Math.hypot(movement.x, movement.y) || 0;
  const targetVx = magnitude === 0 ? 0 : (movement.x / magnitude) * AVATAR_SPEED;
  const targetVy = magnitude === 0 ? 0 : (movement.y / magnitude) * AVATAR_SPEED;
  const accelX = movement.x === 0 ? AVATAR_DECEL : AVATAR_ACCEL;
  const accelY = movement.y === 0 ? AVATAR_DECEL : AVATAR_ACCEL;

  if (prefersReducedMotion()) {
    state.avatar.velocityX = targetVx;
    state.avatar.velocityY = targetVy;
  } else {
    state.avatar.velocityX = approachLinear(state.avatar.velocityX, targetVx, accelX * deltaSeconds);
    state.avatar.velocityY = approachLinear(state.avatar.velocityY, targetVy, accelY * deltaSeconds);
  }

  const desiredX = state.avatar.x + state.avatar.velocityX * deltaSeconds;
  const desiredY = state.avatar.y + state.avatar.velocityY * deltaSeconds;

  state.avatar.x = desiredX;
  state.avatar.y = desiredY;
  clampAvatarPosition();

  if (state.avatar.x !== desiredX) {
    state.avatar.velocityX = 0;
  }
  if (state.avatar.y !== desiredY) {
    state.avatar.velocityY = 0;
  }

  const speedSq =
    state.avatar.velocityX * state.avatar.velocityX +
    state.avatar.velocityY * state.avatar.velocityY;
  state.avatar.isWalking = speedSq > AVATAR_VELOCITY_EPSILON * AVATAR_VELOCITY_EPSILON;

  if (state.avatar.velocityX < -AVATAR_VELOCITY_EPSILON) {
    state.avatar.facing = 'left';
  } else if (state.avatar.velocityX > AVATAR_VELOCITY_EPSILON) {
    state.avatar.facing = 'right';
  }

  renderAvatar();
  updateTouchingZone();
}

function approachLinear(current, target, maxDelta) {
  const diff = target - current;

  if (Math.abs(diff) <= maxDelta) {
    return target;
  }

  return current + Math.sign(diff) * maxDelta;
}

function getMovementVector() {
  let x = 0;
  let y = 0;

  if (state.avatar.keys.has('KeyW') || state.avatar.keys.has('ArrowUp')) {
    y -= 1;
  }

  if (state.avatar.keys.has('KeyS') || state.avatar.keys.has('ArrowDown')) {
    y += 1;
  }

  if (state.avatar.keys.has('KeyA') || state.avatar.keys.has('ArrowLeft')) {
    x -= 1;
  }

  if (state.avatar.keys.has('KeyD') || state.avatar.keys.has('ArrowRight')) {
    x += 1;
  }

  return { x, y };
}

function positionAvatarAtStart(forceReset) {
  if (!elements.mapView || !elements.pantherAvatar) {
    return;
  }

  const mapRect = elements.mapView.getBoundingClientRect();

  if (!mapRect.width || !mapRect.height) {
    return;
  }

  const avatarWidth = getAvatarWidth();
  const targetX = clamp(
    (mapRect.width - avatarWidth) / 2,
    0,
    Math.max(mapRect.width - avatarWidth, 0)
  );
  const targetY = clamp(
    AVATAR_TOP_MARGIN,
    0,
    Math.max(mapRect.height - getAvatarHeight(), 0)
  );

  if (forceReset || !state.avatar.hasPlaced) {
    state.avatar.x = targetX;
    state.avatar.y = targetY;
    state.avatar.velocityX = 0;
    state.avatar.velocityY = 0;
  }

  state.avatar.hasPlaced = true;
  state.avatar.mapWidth = mapRect.width;
  state.avatar.mapHeight = mapRect.height;
  clampAvatarPosition();
  renderAvatar();
}

function clampAvatarPosition() {
  const mapRect = elements.mapView.getBoundingClientRect();
  const avatarWidth = getAvatarWidth();
  const avatarHeight = getAvatarHeight();

  state.avatar.mapWidth = mapRect.width;
  state.avatar.mapHeight = mapRect.height;
  state.avatar.x = clamp(state.avatar.x, 0, Math.max(mapRect.width - avatarWidth, 0));
  state.avatar.y = clamp(state.avatar.y, 0, Math.max(mapRect.height - avatarHeight, 0));
}

function renderAvatar() {
  if (!elements.pantherAvatar) {
    return;
  }

  elements.pantherAvatar.style.transform = `translate3d(${state.avatar.x}px, ${state.avatar.y}px, 0)`;
  elements.pantherAvatar.classList.toggle('is-facing-left', state.avatar.facing === 'left');
  elements.pantherAvatar.classList.toggle('is-walking', state.avatar.isWalking);
}

function updateTouchingZone() {
  if (state.handoff.isAnimating) {
    state.avatar.touchingZoneId = null;
    elements.zoneCards.forEach((card) => card.classList.remove('is-nearby'));
    return;
  }

  const touchingZoneId = state.activeZoneId ? null : getTouchingZoneId();

  state.avatar.touchingZoneId = touchingZoneId;

  elements.zoneCards.forEach((card) => {
    card.classList.toggle('is-nearby', card.dataset.zoneId === touchingZoneId);
  });

  if (state.activeZoneId) {
    return;
  }

  if (touchingZoneId) {
    const zone = zoneLookup.get(touchingZoneId);
    updatePantherStatus(`Near ${zone.name}. Press SPACE.`);
  } else {
    updatePantherStatus('Walk to a zone, or tap one.');
  }
}

function getTouchingZoneId() {
  const avatarRect = getAvatarCollisionRect();

  if (!avatarRect) {
    return null;
  }

  let bestZoneId = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  elements.zoneCards.forEach((card) => {
    const zoneRect = expandRect(card.getBoundingClientRect(), AVATAR_TOUCH_PADDING_X, AVATAR_TOUCH_PADDING_Y);

    if (!rectsIntersect(avatarRect, zoneRect)) {
      return;
    }

    const distance = getCenterDistance(avatarRect, zoneRect);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestZoneId = card.dataset.zoneId;
    }
  });

  return bestZoneId;
}

function getAvatarCollisionRect() {
  if (!elements.mapView) {
    return null;
  }

  const mapRect = elements.mapView.getBoundingClientRect();
  const avatarWidth = getAvatarWidth();
  const avatarHeight = getAvatarHeight();
  const insetX = avatarWidth * 0.2;
  const insetTop = avatarHeight * 0.18;
  const insetBottom = avatarHeight * 0.12;
  const left = mapRect.left + state.avatar.x + insetX;
  const top = mapRect.top + state.avatar.y + insetTop;
  const right = mapRect.left + state.avatar.x + avatarWidth - insetX;
  const bottom = mapRect.top + state.avatar.y + avatarHeight - insetBottom;

  return { left, top, right, bottom };
}

function updatePantherStatus(message) {
  if (elements.pantherStatus) {
    elements.pantherStatus.textContent = message;
  }
}

function clearMovementKeys() {
  state.avatar.keys.clear();
  state.avatar.velocityX = 0;
  state.avatar.velocityY = 0;
  state.avatar.isWalking = false;
  elements.touchKeys.forEach(({ button }) => {
    if (button) {
      button.classList.remove('is-pressed');
    }
  });
  renderAvatar();
}

function setupTouchControls() {
  const isTouch =
    'ontouchstart' in window ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  if (!isTouch) {
    return;
  }

  document.body.classList.add('has-touch');

  elements.touchKeys.forEach(({ button, code }) => {
    if (!button) {
      return;
    }

    const press = (event) => {
      event.preventDefault();

      if (state.handoff.isAnimating || state.activeZoneId) {
        return;
      }

      if (typeof button.setPointerCapture === 'function' && event.pointerId != null) {
        try {
          button.setPointerCapture(event.pointerId);
        } catch (error) {
          // Capture may fail on some browsers; harmless.
        }
      }

      state.avatar.keys.add(code);
      button.classList.add('is-pressed');
    };

    const release = (event) => {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      if (
        event &&
        event.pointerId != null &&
        typeof button.releasePointerCapture === 'function' &&
        button.hasPointerCapture &&
        button.hasPointerCapture(event.pointerId)
      ) {
        try {
          button.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Release may fail; harmless.
        }
      }

      state.avatar.keys.delete(code);
      button.classList.remove('is-pressed');
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  if (elements.touchAction) {
    elements.touchAction.addEventListener('click', (event) => {
      event.preventDefault();

      if (state.handoff.isAnimating || state.activeZoneId) {
        return;
      }

      if (state.avatar.touchingZoneId) {
        openZone(state.avatar.touchingZoneId);
        return;
      }

      updatePantherStatus('Walk closer to a zone, then tap GO.');
    });
  }
}

function playMachineHandoffAnimation(config) {
  const {
    getPoints,
    initialMode,
    initialLabel,
    transformedLabel,
    readingStatus,
    transformedStatus,
    deliveringStatus,
    destinationZoneId,
  } = config;

  const points = getPoints();

  if (!points) {
    flashGuidedZone(destinationZoneId);
    pulseZone(destinationZoneId);
    return Promise.resolve();
  }

  const toMachineDuration = getMotionDuration(HANDOFF_TO_MACHINE_MS, 240);
  const machinePauseDuration = getMotionDuration(HANDOFF_MACHINE_PAUSE_MS, 140);
  const toDestinationDuration = getMotionDuration(HANDOFF_TO_DESTINATION_MS, 320);

  renderHandoffPaths(points);
  showHandoffPathPhase('toMachine');
  setHandoffMode(initialMode);
  setHandoffLabel(initialLabel);
  setGeminiMachineProcessing(false);
  showWireframeHandoff(points.start);

  return new Promise((resolve) => {
    let phase = 'toMachine';
    let phaseStartedAt = getNow();
    let hasTransformed = false;

    const step = (timestamp) => {
      const dynamicPoints = getPoints() || points;

      if (phase === 'toMachine') {
        const progress = easeInOut(clamp((timestamp - phaseStartedAt) / toMachineDuration, 0, 1));
        const point = getQuadraticPoint(dynamicPoints.start, dynamicPoints.toMachineControl, dynamicPoints.machineInput, progress);

        showWireframeHandoff(point);

        if (progress < 1) {
          state.handoff.frameRequestId = requestFrame(step);
          return;
        }

        phase = 'machinePause';
        phaseStartedAt = timestamp;
        setGeminiMachineProcessing(true);
        updatePantherStatus(readingStatus);
        showWireframeHandoff(dynamicPoints.machineInput);
        state.handoff.frameRequestId = requestFrame(step);
        return;
      }

      if (phase === 'machinePause') {
        showWireframeHandoff(dynamicPoints.machineInput);

        if (!hasTransformed && timestamp - phaseStartedAt >= machinePauseDuration * 0.45) {
          hasTransformed = true;
          setHandoffMode('prd');
          setHandoffLabel(transformedLabel);
          showHandoffPathPhase('toForge');
          updatePantherStatus(transformedStatus);
        }

        if (timestamp - phaseStartedAt < machinePauseDuration) {
          state.handoff.frameRequestId = requestFrame(step);
          return;
        }

        phase = 'toDestination';
        phaseStartedAt = timestamp;
        updatePantherStatus(deliveringStatus);
        state.handoff.frameRequestId = requestFrame(step);
        return;
      }

      const progress = easeInOut(clamp((timestamp - phaseStartedAt) / toDestinationDuration, 0, 1));
      const point = getQuadraticPoint(dynamicPoints.machineOutput, dynamicPoints.toDestinationControl, dynamicPoints.destinationEntry, progress);

      showWireframeHandoff(point);

      if (progress < 1) {
        state.handoff.frameRequestId = requestFrame(step);
        return;
      }

      setGeminiMachineProcessing(false);
      hideHandoffPaths();
      hideWireframeHandoff();
      flashGuidedZone(destinationZoneId);
      pulseZone(destinationZoneId);
      state.handoff.frameRequestId = null;
      resolve();
    };

    state.handoff.frameRequestId = requestFrame(step);
  });
}

function getMachineHandoffPoints(startZoneId, endZoneId) {
  if (!elements.mapView || !elements.geminiMachineSprite) {
    return null;
  }

  const startCard = getZoneCard(startZoneId);
  const endCard = getZoneCard(endZoneId);

  if (!startCard || !endCard) {
    return null;
  }

  const mapRect = elements.mapView.getBoundingClientRect();

  if (!mapRect.width || !mapRect.height) {
    return null;
  }

  const startRect = startCard.getBoundingClientRect();
  const endRect = endCard.getBoundingClientRect();
  const machineRect = elements.geminiMachineSprite.getBoundingClientRect();
  const curveHeight = Math.max(44, mapRect.height * 0.08);

  const start = getPointWithinRect(startRect, mapRect, 0.76, 0.5);
  const machineInput = getPointWithinRect(machineRect, mapRect, 0.42, 0.42);
  const machineOutput = getPointWithinRect(machineRect, mapRect, 0.54, 0.5);
  const destinationEntry = getPointWithinRect(endRect, mapRect, 0.76, 0.45);
  const toMachineControl = {
    x: start.x + (machineInput.x - start.x) * 0.5,
    y: Math.min(start.y, machineInput.y) - curveHeight,
  };
  const toDestinationControl = {
    x: clamp(machineOutput.x + Math.max(78, mapRect.width * 0.12), 0, mapRect.width - 38),
    y: ((machineOutput.y + destinationEntry.y) / 2) - curveHeight * 0.34,
  };

  return {
    start,
    machineInput,
    machineOutput,
    destinationEntry,
    toMachineControl,
    toDestinationControl,
  };
}

function renderHandoffPaths(points) {
  if (
    !points ||
    !elements.mapView ||
    !elements.handoffPathLayer ||
    !elements.handoffPathToMachine ||
    !elements.handoffPathToForge
  ) {
    return;
  }

  const mapRect = elements.mapView.getBoundingClientRect();

  elements.handoffPathLayer.hidden = false;
  elements.handoffPathLayer.setAttribute(
    'viewBox',
    `0 0 ${Math.max(mapRect.width, 1)} ${Math.max(mapRect.height, 1)}`
  );
  elements.handoffPathToMachine.setAttribute(
    'd',
    buildQuadraticPath(points.start, points.toMachineControl, points.machineInput)
  );
  elements.handoffPathToForge.setAttribute(
    'd',
    buildQuadraticPath(points.machineOutput, points.toDestinationControl, points.destinationEntry)
  );
}

function showHandoffPathPhase(phase) {
  if (!elements.handoffPathLayer || !elements.handoffPathToMachine || !elements.handoffPathToForge) {
    return;
  }

  elements.handoffPathLayer.hidden = false;

  if (phase === 'toMachine') {
    elements.handoffPathToMachine.classList.add('is-visible');
    elements.handoffPathToMachine.classList.remove('is-complete');
    elements.handoffPathToForge.classList.remove('is-visible', 'is-complete');
    return;
  }

  if (phase === 'toForge') {
    elements.handoffPathToMachine.classList.add('is-complete');
    elements.handoffPathToMachine.classList.remove('is-visible');
    elements.handoffPathToForge.classList.add('is-visible');
    elements.handoffPathToForge.classList.remove('is-complete');
  }
}

function hideHandoffPaths() {
  if (!elements.handoffPathLayer || !elements.handoffPathToMachine || !elements.handoffPathToForge) {
    return;
  }

  elements.handoffPathToMachine.classList.remove('is-visible', 'is-complete');
  elements.handoffPathToForge.classList.remove('is-visible', 'is-complete');
  elements.handoffPathLayer.hidden = true;
}

function getPointWithinRect(rect, mapRect, xRatio, yRatio) {
  return {
    x: rect.left - mapRect.left + rect.width * xRatio,
    y: rect.top - mapRect.top + rect.height * yRatio,
  };
}

function buildQuadraticPath(start, control, end) {
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function getQuadraticPoint(start, control, end, progress) {
  const inverse = 1 - progress;

  return {
    x: (inverse * inverse * start.x) + (2 * inverse * progress * control.x) + (progress * progress * end.x),
    y: (inverse * inverse * start.y) + (2 * inverse * progress * control.y) + (progress * progress * end.y),
  };
}

function showWireframeHandoff(point) {
  if (!elements.wireframeHandoff || !point) {
    return;
  }

  elements.wireframeHandoff.hidden = false;

  const size = elements.wireframeHandoff.offsetWidth || HANDOFF_AVATAR_SIZE_FALLBACK;
  const x = point.x - (size / 2);
  const y = point.y - (size / 2);

  elements.wireframeHandoff.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function hideWireframeHandoff() {
  if (!elements.wireframeHandoff) {
    return;
  }

  elements.wireframeHandoff.hidden = true;
  setHandoffMode('wireframe');
  setHandoffLabel('WIREFRAME');
  elements.wireframeHandoff.style.transform = 'translate3d(-120px, -120px, 0)';
}

function setHandoffMode(mode) {
  if (!elements.wireframeHandoff) {
    return;
  }

  elements.wireframeHandoff.classList.remove('is-transformed', 'is-prototype');

  if (mode === 'prd') {
    elements.wireframeHandoff.classList.add('is-transformed');
  }

  if (mode === 'prototype') {
    elements.wireframeHandoff.classList.add('is-prototype');
  }
}

function setHandoffLabel(label) {
  if (!elements.handoffLabel) {
    return;
  }

  elements.handoffLabel.textContent = label;
}

function setGeminiMachineProcessing(isProcessing) {
  if (!elements.geminiMachine) {
    return;
  }

  elements.geminiMachine.classList.toggle('is-processing', isProcessing);
}

function flashGuidedZone(zoneId) {
  clearTimeout(state.handoff.guideTimer);

  elements.zoneCards.forEach((card) => card.classList.remove('is-guided'));

  const card = getZoneCard(zoneId);

  if (!card) {
    return;
  }

  card.classList.add('is-guided');
  state.handoff.guideTimer = window.setTimeout(() => {
    card.classList.remove('is-guided');
  }, GUIDE_FLASH_MS);
}

function handleWindowBlur() {
  state.activationKeyHeld = false;
  clearMovementKeys();
}

function focusMapView() {
  if (!elements.mapView || typeof elements.mapView.focus !== 'function') {
    return;
  }

  elements.mapView.focus({ preventScroll: true });
}

function setCopyButtonState(label, modifierClass) {
  elements.copyButton.textContent = label;
  elements.copyButton.classList.remove('is-copied', 'is-error');

  if (modifierClass) {
    elements.copyButton.classList.add(modifierClass);
  }
}

function resetCopyButton() {
  clearTimeout(state.copyResetTimer);
  state.copyResetTimer = null;
  const zone = zoneLookup.get(state.activeZoneId);
  const label =
    zone && zone.copyEnabled === false
      ? zone.doneLabel || COPY_DONE_LABEL_FALLBACK
      : COPY_DEFAULT_LABEL;
  setCopyButtonState(label);
}

function queueCopyButtonReset() {
  clearTimeout(state.copyResetTimer);
  state.copyResetTimer = window.setTimeout(resetCopyButton, COPY_FEEDBACK_MS);
}

function loadVisitedSet() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

    if (Array.isArray(stored)) {
      return new Set(stored.filter((zoneId) => zoneLookup.has(zoneId)));
    }
  } catch (error) {
    console.warn('Visited state could not be loaded.', error);
  }

  return new Set();
}

function getZoneCard(zoneId) {
  return elements.zoneCards.find((card) => card.dataset.zoneId === zoneId) || null;
}

function getAvatarWidth() {
  return elements.pantherAvatar ? elements.pantherAvatar.offsetWidth || AVATAR_SIZE_FALLBACK : AVATAR_SIZE_FALLBACK;
}

function getAvatarHeight() {
  return elements.pantherAvatar ? elements.pantherAvatar.offsetHeight || AVATAR_SIZE_FALLBACK : AVATAR_SIZE_FALLBACK;
}

function expandRect(rect, paddingX, paddingY) {
  return {
    left: rect.left - paddingX,
    top: rect.top - paddingY,
    right: rect.right + paddingX,
    bottom: rect.bottom + paddingY,
  };
}

function rectsIntersect(firstRect, secondRect) {
  return (
    firstRect.left < secondRect.right &&
    firstRect.right > secondRect.left &&
    firstRect.top < secondRect.bottom &&
    firstRect.bottom > secondRect.top
  );
}

function getCenterDistance(firstRect, secondRect) {
  const firstCenterX = (firstRect.left + firstRect.right) / 2;
  const firstCenterY = (firstRect.top + firstRect.bottom) / 2;
  const secondCenterX = (secondRect.left + secondRect.right) / 2;
  const secondCenterY = (secondRect.top + secondRect.bottom) / 2;

  return Math.hypot(firstCenterX - secondCenterX, firstCenterY - secondCenterY);
}

function isInteractiveTarget(target) {
  return Boolean(target && typeof target.closest === 'function' && target.closest('button, [href], input, select, textarea, summary, [role="button"]'));
}

function isHelpShortcut(event) {
  return event.key === '?' || (event.code === 'Slash' && event.shiftKey);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function easeInOut(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function getMotionDuration(standardDuration, reducedDuration) {
  return prefersReducedMotion() ? reducedDuration : standardDuration;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function handleMusicToggle() {
  if (state.music.isOn) {
    stopMusic();
  } else {
    startMusic();
  }
  renderMusicToggleState();
  persistMusicPreference(state.music.isOn);
  focusMapView();
}

function renderMusicToggleState() {
  if (!elements.musicToggle) {
    return;
  }

  const icon = elements.musicToggle.querySelector('.music-icon');
  const label = elements.musicToggle.querySelector('.music-label');
  const isOn = state.music.isOn;

  elements.musicToggle.classList.toggle('is-on', isOn);
  elements.musicToggle.setAttribute('aria-pressed', String(isOn));
  elements.musicToggle.setAttribute(
    'aria-label',
    isOn ? 'Turn background music off' : 'Turn background music on'
  );
  elements.musicToggle.setAttribute(
    'title',
    isOn ? 'Background music is on' : 'Background music is off'
  );

  if (icon) {
    icon.textContent = isOn ? '🎵' : '🔇';
  }

  if (label) {
    label.textContent = isOn ? 'Music' : 'Music';
  }
}

function persistMusicPreference(isOn) {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, isOn ? '1' : '0');
  } catch (error) {
    console.warn('Music preference could not be saved.', error);
  }
}

function initMusicContext() {
  if (state.music.ctx) {
    return true;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    console.warn('Web Audio API unavailable — music disabled.');
    return false;
  }

  const ctx = new AudioCtor();
  const master = ctx.createGain();
  master.gain.value = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.Q.value = 0.6;

  const delay = ctx.createDelay(0.8);
  delay.delayTime.value = 0.38;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.22;
  const delayMix = ctx.createGain();
  delayMix.gain.value = 0.3;

  filter.connect(master);
  filter.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayMix);
  delayMix.connect(master);
  master.connect(ctx.destination);

  state.music.ctx = ctx;
  state.music.master = master;
  state.music.filter = filter;
  state.music.delay = delay;

  return true;
}

function scheduleMusicNote(freq, startOffset, duration, oscType, gainLevel) {
  const ctx = state.music.ctx;
  if (!ctx) {
    return;
  }

  const when = state.music.nextTime + startOffset;
  const osc = ctx.createOscillator();
  osc.type = oscType;
  osc.frequency.value = freq;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(gainLevel, when + 0.25);
  env.gain.linearRampToValueAtTime(gainLevel * 0.65, when + duration * 0.45);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  osc.connect(env);
  env.connect(state.music.filter);
  osc.start(when);
  osc.stop(when + duration + 0.1);
}

function scheduleMusicBar() {
  if (!state.music.isOn || !state.music.ctx) {
    return;
  }

  const chord = MUSIC_CHORDS[state.music.patternIndex % MUSIC_CHORDS.length];

  chord.forEach((freq) => {
    scheduleMusicNote(freq, 0, MUSIC_CHORD_SECONDS, 'sine', 0.07);
  });

  const melodyIndex = state.music.patternIndex % MUSIC_MELODY.length;
  scheduleMusicNote(MUSIC_MELODY[melodyIndex], 0.6, 1.2, 'triangle', 0.045);
  scheduleMusicNote(MUSIC_MELODY[(melodyIndex + 3) % MUSIC_MELODY.length], 2.5, 1.0, 'triangle', 0.032);

  state.music.nextTime += MUSIC_CHORD_SECONDS;
  state.music.patternIndex += 1;
  state.music.scheduler = window.setTimeout(scheduleMusicBar, (MUSIC_CHORD_SECONDS - 0.5) * 1000);
}

function startMusic() {
  if (!initMusicContext()) {
    return;
  }
  if (state.music.isOn) {
    return;
  }

  const ctx = state.music.ctx;
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    ctx.resume();
  }

  state.music.isOn = true;
  state.music.patternIndex = 0;
  state.music.nextTime = ctx.currentTime + 0.15;

  const now = ctx.currentTime;
  state.music.master.gain.cancelScheduledValues(now);
  state.music.master.gain.setValueAtTime(state.music.master.gain.value, now);
  state.music.master.gain.linearRampToValueAtTime(MUSIC_MASTER_GAIN, now + 1.0);

  scheduleMusicBar();
}

function stopMusic() {
  state.music.isOn = false;

  if (state.music.scheduler) {
    clearTimeout(state.music.scheduler);
    state.music.scheduler = null;
  }

  const ctx = state.music.ctx;
  if (!ctx || !state.music.master) {
    return;
  }

  const now = ctx.currentTime;
  state.music.master.gain.cancelScheduledValues(now);
  state.music.master.gain.setValueAtTime(state.music.master.gain.value, now);
  state.music.master.gain.linearRampToValueAtTime(0, now + 0.6);
}
