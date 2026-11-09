/* Carrusel de pantallas de TurnAPP: avanza solo, la captura central crece de forma continua, sin repetir capturas. */
(() => {
  const track = document.getElementById("turn-car-track");
  if (!track) return;
  const slides = [...track.querySelectorAll(".turn-car-slide")];
  const dotsBox = document.getElementById("turn-car-dots");
  const caption = document.getElementById("turn-car-caption");
  const prev = document.querySelector("[data-gallery-prev]");
  const next = document.querySelector("[data-gallery-next]");
  if (slides.length < 2) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DELAY = 3800;
  let active = -1, timer = null, held = false, frame = 0, wrapping = false, capTimer = 0;

  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("aria-label", "Ver pantalla " + (i + 1));
    b.addEventListener("click", () => { go(i); start(); });
    dotsBox.appendChild(b);
    return b;
  });

  // Espacio a los costados para que la primera y la última puedan quedar al centro.
  const setPadding = () => {
    const w = track.clientWidth;
    track.style.paddingLeft = Math.max(0, (w - slides[0].offsetWidth) / 2) + "px";
    track.style.paddingRight = Math.max(0, (w - slides[slides.length - 1].offsetWidth) / 2) + "px";
  };
  const centerOf = s => s.offsetLeft + s.offsetWidth / 2 - track.clientWidth / 2;
  const go = (i, behavior = "smooth") => {
    const t = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: centerOf(slides[t]), behavior: reduced.matches ? "auto" : behavior });
  };

  const setCaption = i => {
    clearTimeout(capTimer);
    caption.classList.add("is-changing");
    capTimer = setTimeout(() => {
      caption.querySelector("strong").textContent = slides[i].dataset.title;
      caption.querySelector("span").textContent = slides[i].dataset.desc;
      caption.classList.remove("is-changing");
    }, active === -1 ? 0 : 160);
  };

  // Escala y opacidad continuas según la distancia al centro.
  const update = () => {
    frame = 0;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bestD = Infinity;
    slides.forEach((s, i) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - center);
      const reach = s.offsetWidth * 0.9 + 30;
      s.style.setProperty("--t", Math.max(0, 1 - d / reach).toFixed(3));
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best !== active) {
      setCaption(best);
      active = best;
      dots.forEach((d, i) => d.classList.toggle("is-active", i === best));
      slides.forEach((s, i) => s.setAttribute("aria-current", i === best ? "true" : "false"));
      if (prev) prev.disabled = best === 0;
      if (next) next.disabled = best === slides.length - 1;
    }
  };
  track.addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });

  // Avance automático: pasa a la siguiente; al terminar vuelve al inicio con un fundido (no se repite ninguna).
  const advance = () => {
    if (held || wrapping) return;
    if (active < slides.length - 1) { go(active + 1); return; }
    wrapping = true;
    track.classList.add("is-wrapping");
    setTimeout(() => {
      track.style.scrollSnapType = "none";
      go(0, "auto");
      requestAnimationFrame(() => {
        track.style.scrollSnapType = "";
        track.classList.remove("is-wrapping");
        wrapping = false;
      });
    }, 380);
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => { stop(); if (!held && !reduced.matches) timer = setInterval(advance, DELAY); };
  const hold = () => { held = true; stop(); };
  const release = () => { held = false; start(); };

  prev && prev.addEventListener("click", () => { go(active - 1); start(); });
  next && next.addEventListener("click", () => { go(active + 1); start(); });
  track.addEventListener("mouseenter", hold);
  track.addEventListener("mouseleave", release);
  track.addEventListener("focusin", hold);
  track.addEventListener("focusout", release);
  track.addEventListener("touchstart", hold, { passive: true });
  track.addEventListener("touchend", () => setTimeout(release, 2500), { passive: true });
  track.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
  });
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());

  // Arrastre con mouse (en celular se usa el deslizado táctil nativo).
  let dragging = false, moved = false, startX = 0, startLeft = 0;
  track.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragging = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
  });
  window.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) { moved = true; track.classList.add("is-dragging"); }
    if (moved) track.scrollLeft = startLeft - dx;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (moved) { track.classList.remove("is-dragging"); requestAnimationFrame(() => go(active)); }
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  // Tocar una captura lateral la trae al centro.
  slides.forEach((s, i) => s.addEventListener("click", () => { if (!moved && i !== active) { go(i); start(); } }));

  let rz = 0;
  const relayout = () => { setPadding(); go(Math.max(active, 0), "auto"); update(); };
  window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(relayout); }, { passive: true });
  window.addEventListener("load", relayout);

  setPadding(); go(0, "auto"); update(); start();
})();
