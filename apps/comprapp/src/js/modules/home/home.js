export function initHome() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const labels = {
        zone: "Todos los productos de tu zona",
        merchants: "Productos de tus comercios",
        favorites: "Tus productos favoritos"
      };
      window.alert(labels[button.dataset.view] + "\n\nEsta sección todavía no está conectada.");
    });
  });
}