import { getRecord, saveRecord } from "../../core/storage.js";

const LIST_ID = "comprapp-default-shopping-list";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function formatQuantity(value) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(value);
}

function renderItems(container, items) {
  if (!items.length) {
    container.innerHTML = '<div class="shopping-empty"><strong>Tu lista está vacía</strong><p>Agregá el primer artículo usando el formulario.</p></div>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <article class="shopping-item${item.purchased ? " is-purchased" : ""}" data-item-id="${escapeHTML(item.id)}">
      <label class="shopping-purchased">
        <input type="checkbox" data-action="purchased" ${item.purchased ? "checked" : ""} aria-label="Marcar ${escapeHTML(item.name)} como comprado">
        <span>Comprado</span>
      </label>
      <form class="shopping-edit-form" data-edit-form>
        <div class="shopping-edit-fields">
          <label>
            <span>Artículo</span>
            <input name="name" type="text" maxlength="100" required value="${escapeHTML(item.name)}" aria-label="Nombre del artículo">
          </label>
          <label class="shopping-edit-quantity">
            <span>Cantidad</span>
            <input name="quantity" type="number" min="0.01" step="any" required value="${escapeHTML(item.quantity)}" inputmode="decimal" aria-label="Cantidad">
          </label>
        </div>
        <div class="shopping-item-actions">
          <button class="secondary-button" type="submit">Guardar cambios</button>
          <button class="shopping-delete-button" type="button" data-action="delete">Eliminar</button>
        </div>
      </form>
    </article>
  `).join("");
}

export const shoppingListModule = {
  view: "./src/js/modules/shopping-list/shopping-list.html",
  init({ navigate }) {
    const form = document.querySelector("[data-add-form]");
    const itemsContainer = document.querySelector("[data-items]");
    const countLabel = document.querySelector("[data-list-count]");
    const message = document.querySelector("[data-form-message]");
    let items = [];
    let saving = false;

    async function persist(nextItems) {
      if (saving) return false;
      saving = true;
      try {
        await saveRecord("shoppingLists", {
          id: LIST_ID,
          items: nextItems,
          updatedAt: new Date().toISOString()
        });
        items = nextItems;
        renderItems(itemsContainer, items);
        const pending = items.filter((item) => !item.purchased).length;
        countLabel.textContent = `${items.length} ${items.length === 1 ? "artículo" : "artículos"} · ${pending} pendientes`;
        return true;
      } catch (error) {
        message.textContent = error.message || "No se pudo guardar el cambio en este dispositivo.";
        return false;
      } finally {
        saving = false;
      }
    }

    async function load() {
      try {
        const stored = await getRecord("shoppingLists", LIST_ID);
        items = Array.isArray(stored?.items) ? stored.items : [];
        renderItems(itemsContainer, items);
        const pending = items.filter((item) => !item.purchased).length;
        countLabel.textContent = `${items.length} ${items.length === 1 ? "artículo" : "artículos"} · ${pending} pendientes`;
      } catch (error) {
        itemsContainer.innerHTML = '<p class="shopping-error">No se pudo abrir el almacenamiento local. Revisá la configuración del navegador.</p>';
        message.textContent = error.message || "Error al cargar la lista.";
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const quantity = normalizeQuantity(data.get("quantity"));
      if (!name) {
        message.textContent = "Escribí el nombre del artículo.";
        form.elements.name.focus();
        return;
      }
      if (name.length > 100 || quantity === null) {
        message.textContent = "Ingresá un nombre de hasta 100 caracteres y una cantidad mayor que cero.";
        return;
      }
      const nextItems = [...items, {
        id: crypto.randomUUID(),
        name,
        quantity,
        purchased: false,
        createdAt: new Date().toISOString()
      }];
      if (await persist(nextItems)) {
        form.reset();
        form.elements.quantity.value = "1";
        form.elements.name.focus();
        message.textContent = "Artículo agregado y guardado en este dispositivo.";
      }
    });

    itemsContainer.addEventListener("submit", async (event) => {
      const editForm = event.target.closest("[data-edit-form]");
      if (!editForm) return;
      event.preventDefault();
      const article = editForm.closest("[data-item-id]");
      const id = article.dataset.itemId;
      const data = new FormData(editForm);
      const name = String(data.get("name") || "").trim();
      const quantity = normalizeQuantity(data.get("quantity"));
      if (!name || name.length > 100 || quantity === null) {
        message.textContent = "Revisá el nombre y la cantidad. La cantidad debe ser mayor que cero.";
        return;
      }
      const nextItems = items.map((item) => item.id === id ? { ...item, name, quantity, updatedAt: new Date().toISOString() } : item);
      if (await persist(nextItems)) message.textContent = "Cambios guardados.";
    });

    itemsContainer.addEventListener("change", async (event) => {
      if (!event.target.matches('[data-action="purchased"]')) return;
      const article = event.target.closest("[data-item-id]");
      const id = article.dataset.itemId;
      const nextItems = items.map((item) => item.id === id ? { ...item, purchased: event.target.checked, updatedAt: new Date().toISOString() } : item);
      await persist(nextItems);
    });

    itemsContainer.addEventListener("click", async (event) => {
      const button = event.target.closest('[data-action="delete"]');
      if (!button) return;
      const article = button.closest("[data-item-id]");
      const item = items.find((entry) => entry.id === article.dataset.itemId);
      if (!item || !window.confirm(`¿Eliminar "${item.name}" de la lista?`)) return;
      const nextItems = items.filter((entry) => entry.id !== item.id);
      if (await persist(nextItems)) message.textContent = "Artículo eliminado.";
    });

    document.querySelector("[data-back]")?.addEventListener("click", () => navigate("home"));
    load();
  }
};