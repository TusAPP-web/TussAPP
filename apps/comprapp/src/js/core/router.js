export function createRouter(modules){
 const root=document.querySelector("#app");let cleanup=null;
 async function go(name){
  const module=modules[name];if(!module)return;
  if(typeof cleanup==="function")cleanup();
  root.setAttribute("aria-busy","true");
  try{const response=await fetch(module.view);if(!response.ok)throw new Error("No se pudo cargar la sección: "+name);root.innerHTML=await response.text();cleanup=module.init({navigate:go})||null;window.scrollTo(0,0);}
  catch(error){root.innerHTML='<section class="module-placeholder"><strong>No se pudo abrir esta sección.</strong><p>Revisá tu conexión e intentá nuevamente.</p><button class="secondary-button" data-retry>Reintentar</button></section>';root.querySelector("[data-retry]")?.addEventListener("click",()=>go(name),{once:true});console.error(error);}
  finally{root.removeAttribute("aria-busy");}
 }
 return {go};
}