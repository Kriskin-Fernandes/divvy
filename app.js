(function(){
  // ---------- FIREBASE CONFIG ----------
  const firebaseConfig = {
    apiKey: "AIzaSyDbrwowtFH-nCwoO4P7h2eINtEbpostC1c",
    authDomain: "divvy-73bc1.firebaseapp.com",
    projectId: "divvy-73bc1",
    storageBucket: "divvy-73bc1.firebasestorage.app",
    messagingSenderId: "954250527508",
    appId: "1:954250527508:web:af1b7b7d0c877190743801"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  // ---------- Utilities ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const uid = (prefix='id') => prefix + '_' + Math.random().toString(36).slice(2,9);
  const currency = (n) => Number(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  const escapeHtml = (s)=>String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  // ---------- App state ----------
  let currentDivvyCode = null;
  let currentDivvyDocUnsubscribe = null;
  let currentDivvy = null;

  // ---------- Elements ----------
  const landing = $('#landing');
  const makeDivvyBtn = $('#makeDivvyBtn');
  const joinBtn = $('#joinBtn');
  const joinCodeInput = $('#joinCode');

  const divvyView = $('#divvyView');
  const divvyCodeLabel = $('#divvyCode');
  const backHome = $('#backHome');
  const addPersonBtn = $('#addPersonBtn');
  const addReceiptBtn = $('#addReceiptBtn');

  const receiptsList = $('#receiptsList');
  const peopleList = $('#peopleList');
  const balancesList = $('#balancesList');
  const balancesSummary = $('#balancesSummary');

  const tabReceipts = $('#tabReceipts');
  const tabBalances = $('#tabBalances');
  const tabPeople = $('#tabPeople');

  const modal = $('#modal');
  const modalContent = $('#modalContent');
  const modalClose = $('#modalClose');

  function showModal(html){
    modalContent.innerHTML = html;
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
  }

  function closeModal(){
    modal.classList.add('hidden');
    modal.setAttribute('inert', '');
    modalContent.innerHTML = '';
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });

  function showError(msg){
    showModal(`<div class="small"><strong>Error</strong><div class="tiny">${escapeHtml(msg)}</div><div style="margin-top:8px"><button class="btn" id="modalOk">OK</button></div></div>`);
    $('#modalContent #modalOk').addEventListener('click', closeModal);
  }

  function showSection(code){
    tabReceipts.classList.toggle('active', code==='receipts');
    tabBalances.classList.toggle('active', code==='balances');
    tabPeople.classList.toggle('active', code==='people');
    $('#contentReceipts').classList.toggle('hidden', code!=='receipts');
    $('#contentBalances').classList.toggle('hidden', code!=='balances');
    $('#contentPeople').classList.toggle('hidden', code!=='people');
  }

  function divvyDocRef(code){ return db.collection('divvies').doc(code); }

  async function createNewDivvy(){
    let code = uid('D').slice(-5).toUpperCase();
    const docRef = divvyDocRef(code);
    await docRef.set({ code, createdAt: firebase.firestore.FieldValue.serverTimestamp(), people: [], receipts: [] });
    return code;
  }

  function subscribeToDivvy(code){
    if (currentDivvyDocUnsubscribe) currentDivvyDocUnsubscribe();
    currentDivvyCode = code;
    divvyCodeLabel.textContent = code;
    const ref = divvyDocRef(code);
    currentDivvyDocUnsubscribe = ref.onSnapshot((snap)=>{
      if (!snap.exists) return showError(`Divvy "${code}" not found`);
      currentDivvy = snap.data();
      renderDivvy();
    }, (err)=>{ console.error(err); showError('Network error while loading divvy'); });
  }

  makeDivvyBtn.addEventListener('click', async ()=> {
    makeDivvyBtn.disabled = true;
    try {
      const code = await createNewDivvy();
      subscribeToDivvy(code);
      landing.classList.add('hidden');
      divvyView.classList.remove('hidden');
    } catch(e){ console.error(e); showError('Failed to create divvy'); }
    finally{ makeDivvyBtn.disabled = false; }
  });

  joinBtn.addEventListener('click', async ()=>{
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) return showError('Enter a divvy code first.');
    const snap = await divvyDocRef(code).get();
    if (!snap.exists) return showError(`No divvy found for "${escapeHtml(code)}"`);
    subscribeToDivvy(code);
    landing.classList.add('hidden');
    divvyView.classList.remove('hidden');
  });

  backHome.addEventListener('click', ()=>{
    if(currentDivvyDocUnsubscribe) currentDivvyDocUnsubscribe();
    currentDivvy=null; currentDivvyCode=null; currentDivvyDocUnsubscribe=null;
    divvyView.classList.add('hidden'); landing.classList.remove('hidden');
    joinCodeInput.value='';
  });

  tabReceipts.addEventListener('click', ()=> showSection('receipts'));
  tabBalances.addEventListener('click', ()=> showSection('balances'));
  tabPeople.addEventListener('click', ()=> showSection('people'));

  addPersonBtn.addEventListener('click', ()=> openAddPersonModal());
  addReceiptBtn.addEventListener('click', ()=> openNewReceiptModal());

  // --- Rendering receipts list (past receipts fully visible) ---
  function renderDivvy(){
    if(!currentDivvy) return;
    receiptsList.innerHTML='';
    const receipts = currentDivvy.receipts || [];
    if(receipts.length===0){
      receiptsList.innerHTML='<div class="item small"><strong>No receipts yet</strong></div>';
    } else {
      receipts.forEach(r=>{
        const item = document.createElement('div');
        item.className='item';
        const date = new Date((r.createdAt?.seconds || Date.now())*1000).toLocaleString();
        item.innerHTML=`<div class="meta"><strong>${escapeHtml(r.title||'Receipt')}</strong><small class="tiny">${date}</small></div>`;
        receiptsList.appendChild(item);
      });
    }
    renderBalances();
  }

  function renderBalances(){
    balancesSummary.innerHTML='<div class="small"><strong>Net balances</strong></div>';
    balancesList.innerHTML='';
  }

  // --- Minimal placeholder modal for person/receipt ---
  function openAddPersonModal(){ showModal('<div class="small"><strong>Add person modal</strong></div>'); }
  function openNewReceiptModal(){ showModal('<div class="small"><strong>New receipt modal</strong></div>'); }

})();
