/*
 lists.js - gestión de listas locales:
 - crear/eliminar listas
 - ver el contenido (se pide info de cartas por id con fetchCardById)
 - eliminar cartas de una lista, exportar/importar JSON
*/

const listsContainer = document.getElementById('listsContainer');
const newListName = document.getElementById('newListName');
const createListBtn = document.getElementById('createListBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

const listDetail = document.getElementById('listDetail');
const listTitle = document.getElementById('listTitle');
const listCards = document.getElementById('listCards');
const backToLists = document.getElementById('backToLists');

const STORAGE_KEY = "ptcg_my_lists";
let myLists = loadLists();

function loadLists(){ try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; } }
function saveLists(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(myLists)); } catch(e){} }

function renderLists(){
  listsContainer.innerHTML = "";
  const keys = Object.keys(myLists);
  if(keys.length === 0){ listsContainer.innerHTML = "<p class='small'>No hay listas.</p>"; return; }
  keys.forEach(name=>{
    const node = document.createElement('div'); node.className = "list-item";
    const left = document.createElement('div'); left.innerHTML = `<strong>${name}</strong><div class="small">${myLists[name].length} cartas</div>`;
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';
    const view = document.createElement('button'); view.className='btn'; view.textContent='Ver'; view.onclick = ()=> openList(name);
    const del = document.createElement('button'); del.className='btn ghost'; del.textContent='Eliminar'; del.onclick = ()=> { if(confirm(`Eliminar lista "${name}"?`)){ delete myLists[name]; saveLists(); renderLists(); } };
    right.appendChild(view); right.appendChild(del);
    node.appendChild(left); node.appendChild(right);
    listsContainer.appendChild(node);
  });
}

createListBtn.addEventListener('click', ()=>{
  const name = (newListName.value||"").trim();
  if(!name){ alert("Escribe un nombre"); return; }
  if(myLists[name]){ alert("Ya existe"); return; }
  myLists[name] = []; saveLists(); newListName.value=""; renderLists();
});

async function openList(name){
  listTitle.textContent = name;
  listCards.innerHTML = "<p class='small'>Cargando cartas...</p>";
  listDetail.style.display = "block";
  // ocultar contenedor principal
  listsContainer.parentElement.style.display = "none";
  const ids = myLists[name] || [];
  if(ids.length === 0){ listCards.innerHTML = "<p class='small'>Lista vacía.</p>"; return; }
  listCards.innerHTML = "";
  // pedir detalles por id (en paralelo con Promise.all)
  const promises = ids.map(id => window.PTCG.fetchCardById(id));
  const results = await Promise.all(promises);
  results.forEach(card=>{
    if(!card) return;
    const el = document.createElement('article'); el.className='card';
    const thumb = document.createElement('div'); thumb.className='thumb';
    const img = document.createElement('img'); img.alt = card.name || ''; img.src = card.images?.small || card.images?.large || '';
    thumb.appendChild(img);
    const meta = document.createElement('div'); meta.className='meta';
    const title = document.createElement('strong'); title.textContent = card.name || '';
    const info = document.createElement('div'); info.className='variants'; info.innerHTML = `<div><strong>Expansión:</strong> ${card.set?.name || '-'}</div><div class="small"><strong>Número:</strong> ${card.number || '-'}</div>`;
    meta.appendChild(title); meta.appendChild(info);
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';
    const removeBtn = document.createElement('button'); removeBtn.className='btn'; removeBtn.textContent='Quitar'; removeBtn.onclick = ()=>{
      const idx = myLists[name].indexOf(card.id);
      if(idx>=0){ myLists[name].splice(idx,1); saveLists(); openList(name); renderLists(); }
    };
    right.appendChild(removeBtn);
    el.appendChild(thumb); el.appendChild(meta); el.appendChild(right);
    listCards.appendChild(el);
  });
}

backToLists.addEventListener('click', ()=>{
  listDetail.style.display = "none";
  listsContainer.parentElement.style.display = "";
  renderLists();
});

exportBtn.addEventListener('click', ()=>{
  const dataStr = JSON.stringify(myLists, null, 2);
  const blob = new Blob([dataStr], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = "ptcg_lists.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const obj = JSON.parse(ev.target.result);
      // simple merge: añadir listas del archivo (si existe, añadir elementos no duplicados)
      Object.keys(obj).forEach(k=>{
        if(!myLists[k]) myLists[k] = [];
        obj[k].forEach(id => { if(!myLists[k].includes(id)) myLists[k].push(id); });
      });
      saveLists(); renderLists(); alert("Importado.");
    } catch(err){ alert("JSON no válido"); }
  };
  reader.readAsText(f);
});

/* iniciar */
renderLists();
