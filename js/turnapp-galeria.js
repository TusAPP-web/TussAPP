/* Carrusel TurnAPP: avanza solo, la captura central crece de forma continua, sin repetir capturas. */
(() => {
  const gallery = document.getElementById("turnapp-gallery");
  if (!gallery) return;
  const slides = [...gallery.querySelectorAll(".turnapp-slide")];
  const dotsBox = document.getElementById("turnapp-dots");
  if (slides.length < 2) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DELAY = 3400;
  let active = 0, timer = null, held = false, frame = 0, wrapping = false;

  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("aria-label", "Ir a la pantalla " + (i + 1));
    b.addEventListener("click", () => { go(i); restart(); });
    dotsBox && dotsBox.appendChild(b);
    return b;
  });

  // Espacio a los costados para que la primera y la última puedan quedar al centro.
  const setPadding = () => {
    const w = gallery.clientWidth;
    gallery.style.paddingLeft = Math.max(0, (w - slides[0].offsetWidth) / 2) + "px";
    gallery.style.paddingRight = Math.max(0, (w - slides[slides.length - 1].offsetWidth) / 2) + "px";
  };
  const centerOf = slide => slide.offsetLeft + slide.offsetWidth / 2 - gallery.clientWidth / 2;
  const go = (i, behavior = "smooth") => {
    active = Math.max(0, Math.min(slides.length - 1, i));
    gallery.scrollTo({ left: centerOf(slides[active]), behavior: reduced.matches ? "auto" : behavior });
  };

  // Escala/opacidad continuas según la distancia al centro.
  const update = () => {
    frame = 0;
    const center = gallery.scrollLeft + gallery.clientWidth / 2;
    let best = 0, bestD = Infinity;
    slides.forEach((s, i) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - center);
      const reach = s.offsetWidth * 0.9 + 30;
      s.style.setProperty("--t", Math.max(0, 1 - d / reach).toFixed(3));
      if (d < bestD) { bestD = d; best = i; }
    });
    active = best;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === best));
  };
  gallery.addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });

  // Avance automático: pasa a la siguiente; al terminar vuelve al inicio con un fundido (no se repite ninguna).
  const next = () => {
    if (held || wrapping) return;
    if (active < slides.length - 1) { go(active + 1); return; }
    wrapping = true;
    gallery.classList.add("is-wrapping");
    setTimeout(() => {
      gallery.style.scrollSnapType = "none";
      go(0, "auto");
      requestAnimationFrame(() => {
        gallery.style.scrollSnapType = "";
        gallery.classList.remove("is-wrapping");
        wrapping = false;
      });
    }, 380);
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => { stop(); if (!held && !reduced.matches) timer = setInterval(next, DELAY); };
  const restart = () => start();
  const hold = () => { held = true; stop(); };
  const release = () => { held = false; start(); };

  gallery.addEventListener("mouseenter", hold);
  gallery.addEventListener("mouseleave", release);
  gallery.addEventListener("focusin", hold);
  gallery.addEventListener("focusout", release);
  gallery.addEventListener("touchstart", hold, { passive: true });
  gallery.addEventListener("touchend", () => setTimeout(release, 2500), { passive: true });
  gallery.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
  });
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());

  // Arrastre con mouse (en celular se usa el scroll táctil nativo).
  let dragging = false, moved = false, startX = 0, startLeft = 0;
  gallery.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragging = true; moved = false; startX = e.clientX; startLeft = gallery.scrollLeft;
  });
  window.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) { moved = true; gallery.classList.add("is-dragging"); }
    if (moved) gallery.scrollLeft = startLeft - dx;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (moved) {
      gallery.classList.remove("is-dragging");
      requestAnimationFrame(() => go(active));
    }
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  // Tocar una captura lateral la trae al centro.
  slides.forEach((s, i) => s.addEventListener("click", () => { if (!moved && i !== active) go(i); }));

  let rz = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => { setPadding(); go(active, "auto"); update(); });
  }, { passive: true });
  window.addEventListener("load", () => { setPadding(); go(active, "auto"); update(); });

  setPadding(); go(0, "auto"); update(); start();
})();
