import { createRouter } from "./core/router.js";
import { homeModule } from "./modules/home/home.js";
import { catalogModule } from "./modules/catalog/catalog.js";
import { merchantsModule } from "./modules/merchants/merchants.js";
import { favoritesModule } from "./modules/favorites/favorites.js";
import { shoppingListModule } from "./modules/shopping-list/shopping-list.js";
import { comparisonModule } from "./modules/comparison/comparison.js";
import { economyModule } from "./modules/economy/economy.js";
import { budgetModule } from "./modules/budget/budget.js";
import { syncModule } from "./modules/sync/sync.js";

const router = createRouter({home:homeModule,catalog:catalogModule,merchants:merchantsModule,favorites:favoritesModule,"shopping-list":shoppingListModule,comparison:comparisonModule,economy:economyModule,budget:budgetModule,sync:syncModule});
document.addEventListener("click",(event)=>{if(event.target.closest("[data-home]")){event.preventDefault();router.go("home");}});
router.go("home");
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch((error)=>console.error("No se pudo registrar el service worker:",error)));}