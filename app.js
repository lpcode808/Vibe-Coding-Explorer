'use strict';

const STORAGE_KEY = 'promptquest_visited';
const COPY_DEFAULT_LABEL = '📋 COPY PROMPT';
const COPY_SUCCESS_LABEL = '✅ Copied!';
const COPY_ERROR_LABEL = '⚠ COPY AGAIN';
const COPY_FEEDBACK_MS = 2000;
const AVATAR_SPEED = 260;
const AVATAR_SIZE_FALLBACK = 88;
const AVATAR_TOUCH_PADDING_X = 10;
const AVATAR_TOUCH_PADDING_Y = 4;
const AVATAR_START_OFFSET = 24;
const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const ACTIVATION_CODES = new Set(['Space', 'Enter']);
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
};

const elements = {
  body: document.body,
  mapView: document.getElementById('map-view'),
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
  pantherAvatar: document.getElementById('panther-avatar'),
  pantherStatus: document.getElementById('panther-status'),
};

initialize();

function initialize() {
  elements.zoneCards.forEach((card) => {
    card.addEventListener('click', () => openZone(card.dataset.zoneId));
  });

  elements.drawerClose.addEventListener('click', closeDrawer);
  elements.drawerScrim.addEventListener('click', closeDrawer);
  elements.copyButton.addEventListener('click', handleCopyClick);

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('resize', handleResize);

  renderVisitedBadges();
  resetCopyButton();
  positionAvatarAtStart(true);
  updateTouchingZone();
  focusMapView();
  startAvatarLoop();
}

function handleKeyDown(event) {
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
  updateTouchingZone();
}

function openZone(zoneId) {
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
  elements.copyButton.setAttribute('aria-label', `Copy the ${zone.name} prompt`);

  elements.drawerInstructions.replaceChildren(
    ...zone.instructions.map((instruction) => {
      const item = document.createElement('li');
      item.textContent = instruction;
      return item;
    })
  );

  if (zone.showPreview) {
    elements.drawerPreview.textContent = buildPreview(zone);
    elements.drawerPreviewSection.hidden = false;
  } else {
    elements.drawerPreview.textContent = '';
    elements.drawerPreviewSection.hidden = true;
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

  elements.copyButton.disabled = true;

  try {
    await copyText(zone.promptText);
    setCopyButtonState(COPY_SUCCESS_LABEL, 'is-copied');
    markZoneVisited(zone.id);
  } catch (error) {
    console.error('Prompt copy failed.', error);
    setCopyButtonState(COPY_ERROR_LABEL, 'is-error');
  } finally {
    elements.copyButton.disabled = false;
    queueCopyButtonReset();
  }
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
  if (state.visited.has(zoneId)) {
    return;
  }

  state.visited.add(zoneId);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.visited]));
  } catch (error) {
    console.warn('Visited state could not be saved.', error);
  }

  renderVisitedBadges();
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

  if (!state.avatar.hasPlaced) {
    positionAvatarAtStart(true);
  }

  if (state.activeZoneId) {
    state.avatar.isWalking = false;
    renderAvatar();
    return;
  }

  const movement = getMovementVector();

  if (movement.x === 0 && movement.y === 0) {
    state.avatar.isWalking = false;
    renderAvatar();
    updateTouchingZone();
    return;
  }

  const distance = AVATAR_SPEED * deltaSeconds;
  const magnitude = Math.hypot(movement.x, movement.y) || 1;
  const nextX = state.avatar.x + (movement.x / magnitude) * distance;
  const nextY = state.avatar.y + (movement.y / magnitude) * distance;

  state.avatar.x = nextX;
  state.avatar.y = nextY;
  state.avatar.isWalking = true;

  if (movement.x < 0) {
    state.avatar.facing = 'left';
  } else if (movement.x > 0) {
    state.avatar.facing = 'right';
  }

  clampAvatarPosition();
  renderAvatar();
  updateTouchingZone();
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

  const forgeCard = getZoneCard('forge');
  const mapRect = elements.mapView.getBoundingClientRect();

  if (!forgeCard || !mapRect.width || !mapRect.height) {
    return;
  }

  const avatarWidth = getAvatarWidth();
  const avatarHeight = getAvatarHeight();
  const forgeRect = forgeCard.getBoundingClientRect();
  const targetX = clamp(
    forgeRect.left - mapRect.left - avatarWidth - AVATAR_START_OFFSET,
    0,
    Math.max(mapRect.width - avatarWidth, 0)
  );
  const targetY = clamp(
    forgeRect.top - mapRect.top + forgeRect.height / 2 - avatarHeight / 2,
    0,
    Math.max(mapRect.height - avatarHeight, 0)
  );

  if (forceReset || !state.avatar.hasPlaced) {
    state.avatar.x = targetX;
    state.avatar.y = targetY;
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
  state.avatar.isWalking = false;
  renderAvatar();
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
  setCopyButtonState(COPY_DEFAULT_LABEL);
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

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
