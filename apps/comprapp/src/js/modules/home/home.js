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
      if (!summary || !Array.isArray(stored?.items) || stored.items.length === 0) return;
      const total = stored.items.length;
      const pending = stored.items.filter((item) => !item.purchased).length;
      summary.innerHTML = `<strong>${total} ${total === 1 ? "artículo" : "artículos"} en tu lista</strong><p>${pending} pendientes · ${total - pending} comprados</p>`;
    }).catch((error) => console.warn("No se pudo cargar el resumen de la lista local:", error));
  }
};