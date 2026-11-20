import { getRecord } from "../../core/storage.js";

const LIST_ID = "comprapp-default-shopping-list";

export const homeModule = {
  view: "./src/js/modules/home/home.html",
  init({ navigate }) {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.view));
    });
    document.querySelector("[data-open-list]")?.addEventListener("click", () => navigate("shopping-list"));

    const summary = document.querySelector("[data-home-list-summary]");
    getRecord("shoppingLists", LIST_ID).then((stored) => {
      if (!summary) return;
      const items = Array.isArray(stored?.items) ? stored.items : [];
      if (items.length === 0) return;
      const pending = items.filter((item) => !item.purchased).length;
      const purchased = items.length - pending;
      const preview = items.slice(0, 3).map((item) => `<span>${escapeHTML(item.name)}</span>`).join("");
      const remaining = items.length > 3 ? `<span>+${items.length - 3} más</span>` : "";
      summary.innerHTML = `
        <div class="home-list-count"><strong>${items.length}</strong><small>artículos</small></div>
        <div class="home-list-details">
          <strong>${pending} pendientes <span>·</span> ${purchased} comprados</strong>
          <div class="home-list-preview">${preview}${remaining}</div>
        </div>
        <span class="home-list-arrow" aria-hidden="true">→</span>`;
    }).catch((error) => console.warn("No se pudo cargar el resumen de la lista local:", error));
  }
};

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}