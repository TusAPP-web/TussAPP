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

function renderItems(container, items) {
  if (!items.length) {
    container.innerHTML = '<div class="shopping-empty"><strong>Tu lista está vacía</strong><p>Escribí un artículo arriba para comenzar.</p></div>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <form class="shopping-row${item.purchased ? " is-purchased" : ""}" data-item-id="${escapeHTML(item.id)}" data-edit-form>
      <label class="shopping-check">
        <input type="checkbox" data-action="purchased" ${item.purchased ? "checked" : ""} aria-label="Marcar ${escapeHTML(item.name)} como comprado">
      </label>
      <label class="shopping-name-field">
        <span class="sr-only">Artículo</span>
        <input name="name" type="text" maxlength="100" required value="${escapeHTML(item.name)}" aria-label="Nombre del artículo">
      </label>
      <label class="shopping-quantity-field">
        <span class="sr-only">Cantidad</span>
        <input name="quantity" type="number" min="0.01" step="any" required value="${escapeHTML(item.quantity)}" inputmode="decimal" aria-label="Cantidad">
      </label>
      <span class="shopping-price-placeholder" aria-label="Precio aún no disponible">—</span>
      <div class="shopping-row-actions">
        <button class="shopping-save-button" type="submit" aria-label="Guardar cambios" title="Guardar cambios">✓</button>
        <button class="shopping-delete-button" type="button" data-action="delete" aria-label="Eliminar ${escapeHTML(item.name)}" title="Eliminar">×</button>
      </div>
    </form>
  `).join("");
}

function updateSummary(summary, countLabel, items) {
  const pending = items.filter((item) => !item.purchased).length;
  const purchased = items.length - pending;
  const label = `${items.length} ${items.length === 1 ? "artículo" : "artículos"} · ${pending} pendientes · ${purchased} comprados`;
  summary.textContent = label;
  countLabel.textContent = label;
}

export const shoppingListModule = {
  view: "./src/js/modules/shopping-list/shopping-list.html",
  init({ navigate }) {
    const form = document.querySelector("[data-add-form]");
    const itemsContainer = document.querySelector("[data-items]");
    const summary = document.querySelector("[data-list-summary]");
    const message = document.querySelector("[data-form-message]");
    let items = [];
    let saving = false;

    async function persist(nextItems, successMessage = "Cambios guardados.") {
      if (saving) return false;
      saving = true;
      message.textContent = "Guardando…";
      message.dataset.state = "saving";
      try {
        await saveRecord("shoppingLists", {
          id: LIST_ID,
          items: nextItems,
          updatedAt: new Date().toISOString()
        });
        items = nextItems;
        renderItems(itemsContainer, items);
        updateSummary(summary, summary, items);
        message.textContent = successMessage;
        message.dataset.state = "success";
        return true;
      } catch (error) {
        message.textContent = error.message || "No se pudo guardar. Probá nuevamente.";
        message.dataset.state = "error";
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
        updateSummary(summary, summary, items);
      } catch (error) {
        itemsContainer.innerHTML = '<p class="shopping-error">No se pudo abrir el almacenamiento local. Revisá la configuración del navegador.</p>';
        message.textContent = error.message || "Error al cargar la lista.";
        message.dataset.state = "error";
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const quantity = normalizeQuantity(data.get("quantity"));
      if (!name || name.length > 100 || quantity === null) {
        message.textContent = "Ingresá un artículo y una cantidad mayor que cero.";
        message.dataset.state = "error";
        form.elements.name.focus();
        return;
      }
      const nextItems = [...items, {
        id: crypto.randomUUID(),
        name,
        quantity,
        purchased: false,
        createdAt: new Date().toISOString()
      }];
      if (await persist(nextItems, "Artículo agregado y guardado.")) {
        form.reset();
        form.elements.quantity.value = "1";
        form.elements.name.focus();
      }
    });

    itemsContainer.addEventListener("submit", async (event) => {
      const editForm = event.target.closest("[data-edit-form]");
      if (!editForm) return;
      event.preventDefault();
      const id = editForm.dataset.itemId;
      const data = new FormData(editForm);
      const name = String(data.get("name") || "").trim();
      const quantity = normalizeQuantity(data.get("quantity"));
      if (!name || name.length > 100 || quantity === null) {
        message.textContent = "Revisá el nombre y la cantidad.";
        message.dataset.state = "error";
        return;
      }
      const nextItems = items.map((item) => item.id === id
        ? { ...item, name, quantity, updatedAt: new Date().toISOString() }
        : item);
      await persist(nextItems, "✓ Cambios guardados correctamente.");
    });

    itemsContainer.addEventListener("change", async (event) => {
      if (!event.target.matches('[data-action="purchased"]')) return;
      const row = event.target.closest("[data-item-id]");
      const id = row.dataset.itemId;
      const nextItems = items.map((item) => item.id === id
        ? { ...item, purchased: event.target.checked, updatedAt: new Date().toISOString() }
        : item);
      await persist(nextItems, event.target.checked ? "Artículo marcado como comprado." : "Artículo devuelto a pendientes.");
    });

    itemsContainer.addEventListener("click", async (event) => {
      const button = event.target.closest('[data-action="delete"]');
      if (!button) return;
      const row = button.closest("[data-item-id]");
      const item = items.find((entry) => entry.id === row.dataset.itemId);
      if (!item || !window.confirm(`¿Eliminar "${item.name}" de la lista?`)) return;
      const nextItems = items.filter((entry) => entry.id !== item.id);
      await persist(nextItems, "Artículo eliminado.");
    });

    document.querySelector("[data-back]")?.addEventListener("click", () => navigate("home"));
    load();
  }
};