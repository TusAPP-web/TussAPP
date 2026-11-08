/* Galería TurnAPP: avance automático, ampliación de la captura central y control manual. */
(() => {
  const gallery = document.getElementById("turnapp-gallery");
  if (!gallery) return;
  const slides = [...gallery.querySelectorAll(".turnapp-slide")];
  if (slides.length < 2) return;
  let frame = 0, active = slides.length - 1, direction = -1, timer = null, paused = false;
  const centerSlide = (slide, behavior = "smooth") => {
    const left = slide.offsetLeft + slide.offsetWidth / 2 - gallery.clientWidth / 2;
    gallery.scrollTo({ left, behavior });
  };
  const updateActive = () => {
    frame = 0;
    const center = gallery.getBoundingClientRect().left + gallery.clientWidth / 2;
    let nearest = null, distance = Infinity;
    slides.forEach(slide => {
      const rect = slide.getBoundingClientRect();
      const d = Math.abs(rect.left + rect.width / 2 - center);
      if (d < distance) { distance = d; nearest = slide; }
    });
    slides.forEach(slide => slide.classList.toggle("is-active", slide === nearest));
    if (nearest) active = slides.indexOf(nearest);
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateActive); };
  const stopTimer = () => { if (timer) clearInterval(timer); timer = null; };
  const startTimer = () => {
    stopTimer();
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = setInterval(() => {
      if (active <= 0) direction = 1;
      else if (active >= slides.length - 1) direction = -1;
      active += direction;
      centerSlide(slides[active]);
    }, 3200);
  };
  gallery.addEventListener("scroll", onScroll, { passive: true });
  gallery.addEventListener("mouseenter", () => { paused = true; stopTimer(); });
  gallery.addEventListener("mouseleave", () => { paused = false; startTimer(); });
  gallery.addEventListener("focusin", () => { paused = true; stopTimer(); });
  gallery.addEventListener("focusout", () => { paused = false; startTimer(); });
  gallery.addEventListener("touchstart", () => { paused = true; stopTimer(); }, { passive: true });
  gallery.addEventListener("touchend", () => { paused = false; startTimer(); }, { passive: true });
  let dragging = false, startX = 0, scrollStart = 0;
  gallery.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true; startX = event.clientX; scrollStart = gallery.scrollLeft;
    gallery.classList.add("is-dragging");
    gallery.setPointerCapture?.(event.pointerId);
  });
  gallery.addEventListener("pointermove", event => {
    if (dragging) gallery.scrollLeft = scrollStart - (event.clientX - startX);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false; gallery.classList.remove("is-dragging");
    paused = false; startTimer();
  };
  gallery.addEventListener("pointerup", endDrag);
  gallery.addEventListener("pointercancel", endDrag);
  gallery.addEventListener("lostpointercapture", endDrag);
  gallery.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault(); gallery.scrollLeft += event.deltaY;
    }
  }, { passive: false });
  window.addEventListener("resize", () => centerSlide(slides[active], "auto"), { passive: true });
  centerSlide(slides[active], "auto");
  updateActive();
  startTimer();
})();
