/* Galería de TurnAPP: centra la captura más cercana y permite arrastrar sin barra visible. */
(() => {
  const gallery = document.getElementById("turnapp-gallery");
  if (!gallery) return;
  const slides = [...gallery.querySelectorAll(".turnapp-slide")];
  let frame = 0;
  const updateActive = () => {
    frame = 0;
    const center = gallery.getBoundingClientRect().left + gallery.clientWidth / 2;
    let closest = null;
    let distance = Infinity;
    slides.forEach((slide) => {
      const rect = slide.getBoundingClientRect();
      const d = Math.abs(rect.left + rect.width / 2 - center);
      if (d < distance) { distance = d; closest = slide; }
    });
    slides.forEach((slide) => slide.classList.toggle("is-active", slide === closest));
  };
  gallery.addEventListener("scroll", () => {
    if (!frame) frame = requestAnimationFrame(updateActive);
  }, { passive: true });
  window.addEventListener("resize", updateActive, { passive: true });
  let down = false, startX = 0, scrollStart = 0;
  gallery.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    down = true; startX = event.clientX; scrollStart = gallery.scrollLeft;
    gallery.classList.add("is-dragging");
    gallery.setPointerCapture?.(event.pointerId);
  });
  gallery.addEventListener("pointermove", (event) => {
    if (!down) return;
    gallery.scrollLeft = scrollStart - (event.clientX - startX);
  });
  const stop = () => { down = false; gallery.classList.remove("is-dragging"); };
  gallery.addEventListener("pointerup", stop);
  gallery.addEventListener("pointercancel", stop);
  gallery.addEventListener("lostpointercapture", stop);
  gallery.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      gallery.scrollLeft += event.deltaY;
    }
  }, { passive: false });
  updateActive();
})();
