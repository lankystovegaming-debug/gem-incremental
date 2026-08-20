import { mountShell } from "../src/ui/shell.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { adminRequest } from "../src/backend/cloudAdmin.js";
import { supabase } from "../src/backend/supabase.js";
import { loadMyShowcase } from "../src/backend/cloudShowcase.js";
import { loadUsername } from "../src/backend/account.js";
import { getGemStyle } from "../src/ui/gemStyle.js";

// =========================================================
// SANDBOX [BETA] — admin-only 3D hangout
//
// Nobody's character is spawned, and Three.js itself is not even
// imported, until an admin clicks "Enter Sandbox". Other admins in
// the room are synced through a Supabase Realtime Presence channel
// (position/rotation/showcase only — no gameplay state), so this
// stays a lightweight, purely cosmetic feature.
// =========================================================

mountShell({ page: "sandbox", base: "../" });

const PRESENCE_CHANNEL = "sandbox-presence";
const MOVE_SPEED = 4.2; // world units / second
const BASEPLATE_HALF = 140;
const TRACK_INTERVAL_MS = 120; // throttle presence broadcasts

const statusEl = document.getElementById("sandboxStatus");
const enterButton = document.getElementById("enterButton");
const exitButton = document.getElementById("exitButton");
const launcher = document.getElementById("sandboxLauncher");
const stage = document.getElementById("sandboxStage");
const canvas = document.getElementById("sandboxCanvas");
const playerCountEl = document.getElementById("sandboxPlayerCount");

let sandboxSession = null; // set only while the 3D scene is live

// ---------------------------------------------------------
// Gate: server-verified admin check before anything else loads.
// ---------------------------------------------------------
async function init() {
  const user = await ensurePlayerAuth();

  if (!user) {
    statusEl.textContent = "Sign in to use Sandbox.";
    return;
  }

  const { data: whoami } = await adminRequest("whoami");

  if (!whoami?.isAdmin) {
    statusEl.textContent = "Sandbox is currently available to administrators only.";
    return;
  }

  statusEl.textContent = "Administrator access verified.";
  enterButton.disabled = false;
  enterButton.addEventListener("click", () => enterSandbox(user));
}

exitButton.addEventListener("click", exitSandbox);

function exitSandbox() {
  if (!sandboxSession) return;
  sandboxSession.teardown();
  sandboxSession = null;

  stage.hidden = true;
  launcher.hidden = false;
}

// ---------------------------------------------------------
// Small deterministic color from a string (per-player accent).
// ---------------------------------------------------------
function hashColor(input) {
  let hash = 0;
  const str = String(input || "player");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 62%, 52%)`;
}

function canvasTextTexture(THREE, text) {
  const el = document.createElement("canvas");
  el.width = 256;
  el.height = 64;
  const ctx = el.getContext("2d");
  ctx.fillStyle = "rgba(8, 10, 16, 0.55)";
  roundRect(ctx, 4, 4, el.width - 8, el.height - 8, 14);
  ctx.fill();
  ctx.font = "600 30px 'Exo 2', Segoe UI, sans-serif";
  ctx.fillStyle = "#f2f5fb";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text || "Player").slice(0, 20), el.width / 2, el.height / 2 + 2);
  const texture = new THREE.CanvasTexture(el);
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------
// Blocky "gem miner" character — an original stylized avatar
// (hard hat + pickaxe), not a recreation of any real person's
// specific avatar or likeness.
// ---------------------------------------------------------
function buildCharacter(THREE, shared, { username, color, showcase }) {
  const group = new THREE.Group();
  const accent = new THREE.Color(color);

  const bodyMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.05 });
  const skinMat = shared.skinMat;
  const hatMat = shared.hatMat;
  const metalMat = shared.metalMat;
  const woodMat = shared.woodMat;

  const torso = new THREE.Mesh(shared.torsoGeo, bodyMat);
  torso.position.y = 1.1;
  group.add(torso);

  const head = new THREE.Mesh(shared.headGeo, skinMat);
  head.position.y = 1.75;
  group.add(head);

  const hat = new THREE.Mesh(shared.hatGeo, hatMat);
  hat.position.y = 1.98;
  group.add(hat);

  const legGeo = shared.legGeo;
  const legL = new THREE.Mesh(legGeo, shared.legMat);
  legL.position.set(-0.16, 0.45, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, shared.legMat);
  legR.position.set(0.16, 0.45, 0);
  group.add(legR);

  const armGeo = shared.armGeo;
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.55, 1.15, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.55, 1.15, 0.05);
  armR.rotation.z = -0.35;
  group.add(armR);

  // Pickaxe, attached near the right hand.
  const pick = new THREE.Group();
  const handle = new THREE.Mesh(shared.pickHandleGeo, woodMat);
  const head1 = new THREE.Mesh(shared.pickHeadGeo, metalMat);
  head1.position.y = 0.32;
  pick.add(handle, head1);
  pick.position.set(0.75, 0.95, 0.1);
  pick.rotation.z = 0.5;
  group.add(pick);

  // Username label, billboarded toward the camera each frame.
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: canvasTextTexture(THREE, username), depthTest: false, transparent: true })
  );
  label.scale.set(1.4, 0.35, 1);
  label.position.y = 2.35;
  label.renderOrder = 10;
  group.add(label);

  // Up to 3 orbiting showcase gems, colored from the game's own gem palette.
  const gemMeshes = (Array.isArray(showcase) ? showcase.slice(0, 3) : []).map((gem, i) => {
    const style = getGemStyle(gem?.gem_name);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.color),
      emissive: new THREE.Color(style.color),
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.2
    });
    const mesh = new THREE.Mesh(shared.gemGeo, mat);
    mesh.userData.orbitOffset = (i / 3) * Math.PI * 2;
    group.add(mesh);
    return mesh;
  });

  return { group, gemMeshes, label };
}

function makeSharedAssets(THREE) {
  return {
    torsoGeo: new THREE.BoxGeometry(0.85, 1.05, 0.5),
    headGeo: new THREE.BoxGeometry(0.55, 0.55, 0.55),
    hatGeo: new THREE.ConeGeometry(0.42, 0.32, 12),
    legGeo: new THREE.BoxGeometry(0.3, 0.9, 0.4),
    armGeo: new THREE.BoxGeometry(0.28, 0.95, 0.3),
    gemGeo: new THREE.IcosahedronGeometry(0.16, 0),
    pickHandleGeo: new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
    pickHeadGeo: new THREE.BoxGeometry(0.35, 0.09, 0.09),
    skinMat: new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 }),
    hatMat: new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.5 }),
    metalMat: new THREE.MeshStandardMaterial({ color: 0x9aa5ba, roughness: 0.35, metalness: 0.6 }),
    woodMat: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }),
    legMat: new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.7 })
  };
}

function gridTexture(THREE) {
  const el = document.createElement("canvas");
  el.width = 256;
  el.height = 256;
  const ctx = el.getContext("2d");
  ctx.fillStyle = "#2fae5c";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(10, 40, 20, 0.35)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20);
  texture.anisotropy = 4;
  return texture;
}

// ---------------------------------------------------------
// Main entry: builds the scene, joins presence, runs the loop.
// Everything created here is disposed of in teardown().
// ---------------------------------------------------------
async function enterSandbox(user) {
  enterButton.disabled = true;
  enterButton.textContent = "Loading…";

  const [THREE, showcase, username] = await Promise.all([
    import("https://esm.sh/three@0.160.0"),
    loadMyShowcase(),
    loadUsername(user.id)
  ]);

  enterButton.disabled = false;
  enterButton.textContent = "Enter Sandbox";

  launcher.hidden = true;
  stage.hidden = false;

  const displayName = username || "Player";
  const localColor = hashColor(user.id);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 30, 110);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false; // deliberately no shadow maps — keeps this light with many players

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x2f6b3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  const baseplate = new THREE.Mesh(
    new THREE.PlaneGeometry(BASEPLATE_HALF * 2, BASEPLATE_HALF * 2),
    new THREE.MeshStandardMaterial({ map: gridTexture(THREE), roughness: 0.95 })
  );
  baseplate.rotation.x = -Math.PI / 2;
  scene.add(baseplate);

  const shared = makeSharedAssets(THREE);

  const local = {
    ...buildCharacter(THREE, shared, { username: displayName, color: localColor, showcase }),
    x: 0,
    z: 0,
    yaw: Math.PI
  };
  scene.add(local.group);

  const remote = new Map(); // userId -> { group, gemMeshes, targetX, targetZ, targetYaw }

  // --- input state ---
  const keys = new Set();
  const onKeyDown = (e) => keys.add(e.key.toLowerCase());
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let dragging = false;
  let lastPointerX = 0;
  let cameraYaw = Math.PI;

  const onPointerDown = (e) => {
    dragging = true;
    lastPointerX = e.clientX;
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    cameraYaw -= (e.clientX - lastPointerX) * 0.006;
    lastPointerX = e.clientX;
  };
  const onPointerUp = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  function resize() {
    const rect = stage.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // --- realtime presence ---
  const channel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: user.id } }
  });

  const showcaseSnapshot = (Array.isArray(showcase) ? showcase.slice(0, 3) : [])
    .map((gem) => ({ gem_name: gem?.gem_name }));

  function upsertRemote(id, entry) {
    if (id === user.id) return;

    let player = remote.get(id);
    if (!player) {
      const built = buildCharacter(THREE, shared, {
        username: entry.username,
        color: entry.color,
        showcase: entry.showcase
      });
      built.group.position.set(entry.x || 0, 0, entry.z || 0);
      scene.add(built.group);
      player = {
        group: built.group,
        gemMeshes: built.gemMeshes,
        targetX: entry.x || 0,
        targetZ: entry.z || 0,
        targetYaw: entry.yaw || 0
      };
      remote.set(id, player);
    } else {
      player.targetX = entry.x || 0;
      player.targetZ = entry.z || 0;
      player.targetYaw = entry.yaw || 0;
    }
  }

  function removeRemote(id) {
    const player = remote.get(id);
    if (!player) return;
    scene.remove(player.group);
    remote.delete(id);
  }

  function syncPresence() {
    const state = channel.presenceState();
    const seen = new Set();

    for (const key of Object.keys(state)) {
      if (key === user.id) continue;
      const entries = state[key];
      const latest = entries?.[entries.length - 1];
      if (!latest) continue;
      seen.add(key);
      upsertRemote(key, latest);
    }

    for (const id of Array.from(remote.keys())) {
      if (!seen.has(id)) removeRemote(id);
    }

    playerCountEl.textContent = `${seen.size + 1} online`;
  }

  channel.on("presence", { event: "sync" }, syncPresence);

  let lastTrack = 0;
  async function trackPresence(force = false) {
    const now = performance.now();
    if (!force && now - lastTrack < TRACK_INTERVAL_MS) return;
    lastTrack = now;
    await channel.track({
      username: displayName,
      color: localColor,
      showcase: showcaseSnapshot,
      x: local.x,
      z: local.z,
      yaw: local.yaw
    });
  }

  await channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await trackPresence(true);
  });

  // --- main loop ---
  const clock = new THREE.Clock();
  let rafId = null;

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.getElapsedTime();

    // Movement (camera-relative WASD).
    let dx = 0;
    let dz = 0;
    if (keys.has("w") || keys.has("arrowup")) dz -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dz += 1;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;

    if (dx || dz) {
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const worldDx = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
      const worldDz = dx * Math.sin(cameraYaw) + dz * Math.cos(cameraYaw);
      local.x = Math.max(-BASEPLATE_HALF + 4, Math.min(BASEPLATE_HALF - 4, local.x + worldDx * MOVE_SPEED * dt));
      local.z = Math.max(-BASEPLATE_HALF + 4, Math.min(BASEPLATE_HALF - 4, local.z + worldDz * MOVE_SPEED * dt));
      local.yaw = Math.atan2(worldDx, worldDz);
      trackPresence();
    }

    local.group.position.set(local.x, 0, local.z);
    local.group.rotation.y = local.yaw;

    local.gemMeshes.forEach((mesh) => {
      const angle = t * 1.1 + mesh.userData.orbitOffset;
      mesh.position.set(Math.cos(angle) * 0.9, 2.05 + Math.sin(t * 2 + mesh.userData.orbitOffset) * 0.08, Math.sin(angle) * 0.9);
    });

    for (const player of remote.values()) {
      player.group.position.x += (player.targetX - player.group.position.x) * Math.min(1, dt * 8);
      player.group.position.z += (player.targetZ - player.group.position.z) * Math.min(1, dt * 8);
      let yawDiff = player.targetYaw - player.group.rotation.y;
      yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
      player.group.rotation.y += yawDiff * Math.min(1, dt * 8);

      player.gemMeshes.forEach((mesh) => {
        const angle = t * 1.1 + mesh.userData.orbitOffset;
        mesh.position.set(Math.cos(angle) * 0.9, 2.05 + Math.sin(t * 2 + mesh.userData.orbitOffset) * 0.08, Math.sin(angle) * 0.9);
      });
    }

    const camDist = 5.2;
    camera.position.set(
      local.x - Math.sin(cameraYaw) * camDist,
      2.6,
      local.z - Math.cos(cameraYaw) * camDist
    );
    camera.lookAt(local.x, 1.3, local.z);

    renderer.render(scene, camera);
  }
  frame();

  sandboxSession = {
    teardown() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", resize);

      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);

      for (const player of remote.values()) scene.remove(player.group);
      remote.clear();

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            m.map?.dispose?.();
            m.dispose?.();
          });
        }
      });
      renderer.dispose();
    }
  };
}

window.addEventListener("beforeunload", () => {
  sandboxSession?.teardown();
});

init();
