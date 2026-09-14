function stripInteractiveIdentity(root) {
  const identified = [root, ...root.querySelectorAll?.("[id], [name], [for], [contenteditable], [tabindex]") ?? []];
  identified.forEach((node) => {
    node.removeAttribute("id");
    node.removeAttribute("name");
    node.removeAttribute("for");
    node.removeAttribute("contenteditable");
    node.setAttribute("tabindex", "-1");
  });
  root.querySelectorAll?.("button, input, select, textarea, a").forEach((node) => {
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");
    if ("disabled" in node) node.disabled = true;
  });
}

export function specimenReticleMarkup(specimenHtml) {
  return `
    <div class="cs-reticle" aria-hidden="true">
      <span class="cs-reticle__ring cs-reticle__ring--outer"></span>
      <span class="cs-reticle__ring cs-reticle__ring--inner"></span>
      <span class="cs-reticle__tick cs-reticle__tick--x"></span>
      <span class="cs-reticle__tick cs-reticle__tick--y"></span>
      <div class="cs-specimen">${specimenHtml}</div>
    </div>`;
}

export function environmentMarkup() {
  return `
    <div class="cs-environment" aria-hidden="true">
      <span class="cs-horizon"></span><span class="cs-star"></span>
      <span class="cs-water"></span><span class="cs-landscape"></span>
      <span class="cs-aurora cs-aurora--a"></span><span class="cs-aurora cs-aurora--b"></span>
      <span class="cs-shadow"></span><span class="cs-paw"></span>
    </div>`;
}

export function energyMarkup() {
  return `
    <div class="cs-energy" aria-hidden="true">
      <span class="cs-beam cs-beam--a"></span><span class="cs-beam cs-beam--b"></span><span class="cs-beam cs-beam--c"></span>
      <span class="cs-pulse cs-pulse--a"></span><span class="cs-pulse cs-pulse--b"></span><span class="cs-pulse cs-pulse--c"></span>
      <span class="cs-fracture cs-fracture--a"></span><span class="cs-fracture cs-fracture--b"></span>
      <span class="cs-particles"></span><span class="cs-lattice"></span><span class="cs-flash"></span>
    </div>`;
}

export function createTheatricalUiClones() {
  const layer = document.createElement("div");
  layer.className = "cs-ui-clones";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;

  const sources = [
    document.querySelector(".topbar"),
    document.querySelector(".app-main"),
    document.querySelector(".stage")
  ].filter(Boolean).slice(0, 3);

  for (const [index, source] of sources.entries()) {
    const clone = source.cloneNode(true);
    stripInteractiveIdentity(clone);
    clone.removeAttribute("id");
    clone.className = `cs-ui-clone cs-ui-clone--${index + 1}`;
    layer.appendChild(clone);
  }
  return layer;
}

export function createLingeringCrack() {
  const crack = document.createElement("div");
  crack.className = "cs-lingering-crack";
  crack.setAttribute("aria-hidden", "true");
  document.body.appendChild(crack);
  requestAnimationFrame(() => crack.classList.add("is-visible"));
  const timer = setTimeout(() => {
    crack.classList.remove("is-visible");
    setTimeout(() => crack.remove(), 300);
  }, 1_000);
  return () => {
    clearTimeout(timer);
    crack.remove();
  };
}
