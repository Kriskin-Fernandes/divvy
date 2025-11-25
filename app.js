// app.js - Divvy single-file client logic
// Uses Firebase Firestore (compat SDK) for persistence.
// Replace firebaseConfig in README steps before use.

(function(){
  // ---------- FIREBASE CONFIG ----------
  // TODO: Replace these values with your Firebase project config (see README).
  const firebaseConfig = {
  apiKey: "AIzaSyDbrwowtFH-nCwoO4P7h2eINtEbpostC1c",
  authDomain: "divvy-73bc1.firebaseapp.com",
  projectId: "divvy-73bc1",
  storageBucket: "divvy-73bc1.firebasestorage.app",
  messagingSenderId: "954250527508",
  appId: "1:954250527508:web:af1b7b7d0c877190743801"
  };


  // Initialize Firebase
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();

  // ---------- Utilities ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const uid = (prefix='id') => prefix + '_' + Math.random().toString(36).slice(2,9);
  const clamp = (v,min,max)=> Math.max(min,Math.min(max,v));

  const currency = (n) => {
    // ensure rounding to 2 decimal places reliably
    return Number(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  };

  // generate short code 4-5 chars (alphanumeric uppercase)
  const generateCode = (len=5) => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // avoid confusing letters
    let s = '';
    for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  };

  // ---------- App state ----------
  let currentDivvyCode = null;
  let currentDivvyDocUnsubscribe = null;
  let currentDivvy = null; // local copy

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

  // ---------- UI helpers ----------
  function showModal(html) {
    modalContent.innerHTML = html;
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');   // enable modal for focus
  }

  function closeModal(){
    modal.classList.add('hidden');
    modal.setAttribute('inert', '');  // prevent focus on hidden modal
    modalContent.innerHTML = '';
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });

  function showSection(code) {
    // tabs
    tabReceipts.classList.toggle('active', code==='receipts');
    tabBalances.classList.toggle('active', code==='balances');
    tabPeople.classList.toggle('active', code==='people');

    $('#contentReceipts').classList.toggle('hidden', code!=='receipts');
    $('#contentBalances').classList.toggle('hidden', code!=='balances');
    $('#contentPeople').classList.toggle('hidden', code!=='people');
  }

  // ---------- Firestore helpers ----------
  function divvyDocRef(code) {
    return db.collection('divvies').doc(code);
  }

  async function createNewDivvy() {
    // choose code and ensure it's unique
    let code = generateCode(5);
    const docRef = divvyDocRef(code);
    const doc = await docRef.get();
    if (doc.exists) {
      // try again few times
      for(let i=0;i<4 && doc.exists;i++){
        code = generateCode(5);
      }
    }
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const initial = {
      code,
      createdAt: now,
      people: [],
      receipts: []
    };
    await docRef.set(initial);
    return code;
  }

  function subscribeToDivvy(code) {
    // unsubscribe existing
    if (currentDivvyDocUnsubscribe) currentDivvyDocUnsubscribe();
    currentDivvyCode = code;
    divvyCodeLabel.textContent = code;
    const ref = divvyDocRef(code);
    currentDivvyDocUnsubscribe = ref.onSnapshot((snap) => {
      if (!snap.exists) {
        currentDivvy = null;
        showError(`Divvy "${code}" not found`);
        return;
      }
      currentDivvy = snap.data();
      // Firestore returns Timestamp objects; convert where needed
      renderDivvy();
    }, (err) => {
      console.error(err);
      showError('Network error while loading divvy');
    });
  }

  function showError(msg){
    closeModal();
    showModal(`<div class="small"><strong>Error</strong><div class="tiny">${escapeHtml(msg)}</div><div style="margin-top:8px"><button class="btn" id="modalOk">OK</button></div></div>`);
    $('#modalContent #modalOk').addEventListener('click', closeModal);
  }

  // safe html escape for injection
  function escapeHtml(s){return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}

  // ---------- Rendering ----------
  function renderDivvy() {
    if (!currentDivvy) return;
    // receipts list
    receiptsList.innerHTML = '';
    const receipts = currentDivvy.receipts || [];
    if (receipts.length === 0) {
      receiptsList.innerHTML = `<div class="item small"><div class="meta"><strong>No receipts yet</strong><small class="tiny">Tap "New Receipt" to start</small></div></div>`;
    } else {
      // show newest first
      receipts.slice().reverse().forEach(r => {
        const item = document.createElement('div');
        item.className = 'item';
        const total = computeReceiptTotal(r);
        item.innerHTML = `<div class="meta">
            <strong>${escapeHtml(r.title || 'Receipt')}</strong>
            <small class="tiny">${new Date((r.createdAt && r.createdAt.seconds)? r.createdAt.seconds*1000 : Date.now()).toLocaleString()}</small>
            <small class="tiny">Total: $${currency(total)} · ${r.paid ? 'Paid' : 'Open'}</small>
          </div>
          <div>
            <button class="btn" data-id="${r.id}" data-action="open">Open</button>
            <button class="btn" data-id="${r.id}" data-action="duplicate">Duplicate</button>
          </div>`;
        receiptsList.appendChild(item);
      });
      // attach click
      receiptsList.querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const id = btn.dataset.id;
          const action = btn.dataset.action;
          if (action === 'open') openReceiptModal(id);
          if (action === 'duplicate') duplicateReceipt(id);
        });
      });
    }

    // people list
    peopleList.innerHTML = '';
    const people = currentDivvy.people || [];
    if (people.length === 0) {
      peopleList.innerHTML = `<div class="item small"><div class="meta"><strong>No people yet</strong><small class="tiny">Add people so receipts can reference them</small></div></div>`;
    } else {
      people.forEach(p=>{
        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `<div class="meta"><strong>${escapeHtml(p.name)}</strong><small class="tiny">id: ${p.id}</small></div><div><button class="btn" data-person="${p.id}" data-action="view">View</button></div>`;
        peopleList.appendChild(row);
      });
      peopleList.querySelectorAll('button').forEach(b=>{
        b.addEventListener('click', ()=> {
          const pid = b.dataset.person;
          openPersonDetail(pid);
        });
      });
    }

    // balances
    renderBalances();
  }

  // ---------- Computation ----------
  function computeReceiptTotal(receipt) {
    let tot = 0;
    for (const it of (receipt.items || [])) {
      // item may have amount (float) or splits with amounts
      if (it.amount != null) tot += Number(it.amount) || 0;
      else if (it.splits && it.splits.length) {
        for (const s of it.splits) tot += Number(s.amount) || 0;
      }
    }
    return Number(Math.round((tot + Number.EPSILON) * 100) / 100);
  }

  // returns mapping personId => net owed for the receipt (positive means owes money)
  function computeReceiptPersonNet(receipt) {
    // Approach:
    // - For each item: if it's a simple amount linked to a payer or split, assign amounts accordingly:
    //   Items have shape { name, amount } where 'amount' may be total and item has 'owedTo' (personId) and 'payers' split style or 'splits' array
    // - To support flexible inputs, we expect each item either:
    //   - item.splits = [ { personId, amount }... ]  OR
    //   - item.amount + item.splitType ('equal'/'count'/'percent') + item.splitTargets: [personId,...]
    // We'll read whatever is present. We designed the UI to generate splits precisely.
    const net = {};
    const ensure = (id) => { if(!net[id]) net[id]=0; };

    // who is owed money? receipt.owedTo (personId) might be on receipt root OR on items
    const owedTo = receipt.owedTo;

    for (const it of (receipt.items || [])) {
      if (it.splits && it.splits.length) {
        // each split has personId and amount
        for (const s of it.splits) {
          const pid = s.personId;
          ensure(pid);
          // this person owes s.amount
          net[pid] += Number(s.amount) || 0;
        }
      } else {
        // fallback: if item has amount and is split equally among targets
        const total = Number(it.amount) || 0;
        const targets = it.targets || []; // array of personId to split among
        if (targets.length === 0) {
          // entire amount owed by single payer? assume payer is receipt.payers[0] or single payer selected
          // if no target, attribute to none — skip
        } else {
          const per = Math.round((total / targets.length + Number.EPSILON) * 100) / 100;
          targets.forEach(pid=>{
            ensure(pid);
            net[pid] += per;
          });
        }
      }
    }
    // net shows how much each payer owes; these amounts are owed to receipt.owedTo
    return { net, owedTo: owedTo };
  }

  // aggregate across receipts to compute net person-to-person balances
  // returns an object { nets: {personId: netBalance}, debts: [ { from, to, amount } ] }
  function computeAllBalances(divvy) {
    const people = (divvy.people || []).map(p => p.id);
    // initialize nets (positive means this person is owed money overall; negative means they owe)
    const nets = {};
    people.forEach(p => nets[p] = 0);

    // For each receipt, compute who owes and to whom (owedTo)
    for(const r of (divvy.receipts || [])) {
      if (!r.items) continue;
      const { net, owedTo } = computeReceiptPersonNet(r);
      if (!owedTo) continue;
      // Each payer owes to owedTo. So for owedTo, add sum of owed; for payers subtract their individual owed.
      let sum = 0;
      for (const pid in net) {
        const amt = Number(net[pid]) || 0;
        if (!nets[pid]) nets[pid] = 0;
        if (!nets[owedTo]) nets[owedTo] = 0;
        nets[pid] -= amt;
        nets[owedTo] += amt;
        sum += amt;
      }
      // account for payments recorded: receipt.payments is array of { personId, amount }
      // If payments exist and receipt marked as paid, we assume full settlement (paid boolean handled separately)
    }

    // return nets
    return { nets };
  }

  // simplify pairwise debts: convert nets into minimal set of transfers
  function simplifyDebts(nets) {
    // nets: { personId: number } (positive => is owed money; negative => owes money)
    // We'll build two lists: creditors (positive), debtors (negative), and greedily match
    const creditors = [];
    const debtors = [];
    for (const pid in nets) {
      const v = Math.round((Number(nets[pid]) + Number.EPSILON) * 100) / 100;
      if (v > 0.004) creditors.push({ id: pid, amt: v });
      else if (v < -0.004) debtors.push({ id: pid, amt: -v }); // store owed amt positive
    }
    creditors.sort((a,b)=>b.amt-a.amt);
    debtors.sort((a,b)=>b.amt-a.amt);
    const transfers = [];
    let i=0,j=0;
    while(i<debtors.length && j<creditors.length){
      const d = debtors[i];
      const c = creditors[j];
      const m = Math.min(d.amt, c.amt);
      transfers.push({ from: d.id, to: c.id, amount: Number(Math.round((m + Number.EPSILON)*100)/100) });
      d.amt = Number(Math.round((d.amt - m + Number.EPSILON)*100)/100);
      c.amt = Number(Math.round((c.amt - m + Number.EPSILON)*100)/100);
      if (d.amt <= 0.004) i++;
      if (c.amt <= 0.004) j++;
    }
    return transfers;
  }

  // ---------- UI actions ----------
  makeDivvyBtn.addEventListener('click', async ()=> {
    makeDivvyBtn.disabled = true;
    try {
      const code = await createNewDivvy();
      // subscribe & show view
      subscribeToDivvy(code);
      landing.classList.add('hidden');
      divvyView.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      showError('Failed to create divvy');
    } finally { makeDivvyBtn.disabled = false; }
  });

  joinBtn.addEventListener('click', async ()=>{
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) return showError('Enter a divvy code first.');
    // check exists
    const snap = await divvyDocRef(code).get();
    if (!snap.exists) return showError(`No divvy found for "${escapeHtml(code)}"`);
    subscribeToDivvy(code);
    landing.classList.add('hidden');
    divvyView.classList.remove('hidden');
  });

  backHome.addEventListener('click', ()=> {
    // unsubscribe
    if (currentDivvyDocUnsubscribe) currentDivvyDocUnsubscribe();
    currentDivvy = null;
    currentDivvyCode = null;
    currentDivvyDocUnsubscribe = null;
    divvyView.classList.add('hidden');
    landing.classList.remove('hidden');
    joinCodeInput.value = '';
  });

  // tabs
  tabReceipts.addEventListener('click', ()=> showSection('receipts'));
  tabBalances.addEventListener('click', ()=> showSection('balances'));
  tabPeople.addEventListener('click', ()=> showSection('people'));

  addPersonBtn.addEventListener('click', ()=> openAddPersonModal());
  addReceiptBtn.addEventListener('click', ()=> openNewReceiptModal());

  // ---------- Person flows ----------
  function openAddPersonModal() {
    showModal(`
      <div class="small">
        <h3>Add person</h3>
        <div class="form-row">
          <input id="newPersonName" placeholder="Name (e.g. Alice)" />
          <button class="btn primary" id="addPersonConfirm">Add</button>
        </div>
        <div class="tiny">People cannot be removed once added.</div>
      </div>
    `);
    $('#addPersonConfirm').addEventListener('click', async ()=>{
      const name = $('#newPersonName').value.trim();
      if (!name) return showError('Enter a name');
      const people = currentDivvy.people || [];
      const newPerson = { id: uid('p'), name };
      const ref = divvyDocRef(currentDivvyCode);
      await ref.update({ people: firebase.firestore.FieldValue.arrayUnion(newPerson) });
      closeModal();
    });
  }

  function openPersonDetail(pid) {
    const person = (currentDivvy.people || []).find(p=>p.id===pid);
    if (!person) return;
    // compute how much they owe and to whom
    const { nets } = computeAllBalances(currentDivvy);
    const net = nets[pid] || 0;
    const simplified = simplifyDebts(nets).filter(t => t.from === pid || t.to === pid);
    let html = `<div class="small"><h3>${escapeHtml(person.name)}</h3><div class="tiny">Net balance: <strong>${net>=0? '$'+currency(net) + ' (is owed)': '$'+currency(-net) + ' (owes)'}</strong></div><div style="margin-top:8px"><strong>Detailed simplifies</strong></div>`;
    if (simplified.length===0) html += `<div class="tiny">No outstanding transfers</div>`;
    else {
      simplified.forEach(s=>{
        html += `<div class="item small"><div class="meta">${s.from===pid? 'You owe': (s.to===pid? 'Owed to you by': '')} <strong>${escapeHtml(getPersonName(s.from===pid? s.to: s.from))}</strong></div><div class="tiny right">$${currency(s.amount)}</div></div>`;
      });
    }
    html += `<div style="margin-top:10px"><button class="btn" id="closePerson">Close</button></div></div>`;
    showModal(html);
    $('#closePerson').addEventListener('click', closeModal);
  }

  function getPersonName(pid) {
    const p = (currentDivvy.people || []).find(x=>x.id===pid);
    return p ? p.name : pid;
  }

  // ---------- Receipts flows ----------
  function openNewReceiptModal() {
    // multi-step: choose who is owed, then choose payers, then add items
    // We'll build a single modal with sections.
    const people = currentDivvy.people || [];
    const peopleHTML = people.map(p => `<button class="person-btn" data-id="${p.id}">${escapeHtml(p.name)}</button>`).join('');
    showModal(`<div class="small">
      <h3>New receipt</h3>
      <div class="tiny">Step 1 — Who is owed the money?</div>
      <div style="margin-top:8px"><input id="rTitle" placeholder="Receipt title (optional)" /></div>
      <div style="margin-top:8px"><input id="searchOwed" placeholder="Search or add name" /></div>
      <div class="person-grid" id="owedGrid">${peopleHTML}</div>
      <div style="margin-top:10px"><button class="btn primary" id="stepToPayers">Next: Payers</button></div>
    </div>`);

    // helper to add new person from search bar
    $('#searchOwed').addEventListener('keydown', async (e)=>{
      if (e.key === 'Enter') {
        const name = e.target.value.trim();
        if (!name) return;
        const newPerson = { id: uid('p'), name };
        await divvyDocRef(currentDivvyCode).update({ people: firebase.firestore.FieldValue.arrayUnion(newPerson) });
        // re-render in modal
        const btn = document.createElement('button'); btn.className='person-btn'; btn.dataset.id=newPerson.id; btn.textContent=newPerson.name;
        $('#owedGrid').appendChild(btn);
        e.target.value = '';
      }
    });

    $('#owedGrid').addEventListener('click', (ev)=>{
      if (ev.target.matches('.person-btn')) {
        $$('#owedGrid .person-btn').forEach(b=>b.classList.remove('active'));
        ev.target.classList.add('active');
      }
    });

    $('#stepToPayers').addEventListener('click', ()=> {
      const owedBtn = $('#owedGrid .person-btn.active');
      if (!owedBtn) return showError('Select who is owed (or add them)');
      const owedToId = owedBtn.dataset.id;
      const title = $('#rTitle').value.trim() || 'Receipt';
      // proceed to payers step
      openPayersStep({ owedToId, title });
    });
  }

  function openPayersStep({ owedToId, title }) {
    const people = currentDivvy.people || [];
    const peopleHTML = people.map(p => `<button class="person-btn" data-id="${p.id}">${escapeHtml(p.name)}</button>`).join('');
    showModal(`<div class="small">
      <h3>Add payers</h3>
      <div class="tiny">Select one or more people who will pay. You can add more later in the receipt.</div>
      <div style="margin-top:8px"><input id="searchPayers" placeholder="Search or add name" /></div>
      <div class="person-grid" id="payersGrid">${peopleHTML}</div>
      <div style="margin-top:10px"><button class="btn" id="backToOwed">Back</button> <button class="btn primary" id="stepToItems">Next: Items</button></div>
    </div>`);

    $('#searchPayers').addEventListener('keydown', async (e)=>{
      if (e.key === 'Enter') {
        const name = e.target.value.trim();
        if (!name) return;
        const newPerson = { id: uid('p'), name };
        await divvyDocRef(currentDivvyCode).update({ people: firebase.firestore.FieldValue.arrayUnion(newPerson) });
        const btn = document.createElement('button'); btn.className='person-btn'; btn.dataset.id=newPerson.id; btn.textContent=newPerson.name;
        $('#payersGrid').appendChild(btn);
        e.target.value = '';
      }
    });

    $('#payersGrid').addEventListener('click', (ev)=>{
      if (ev.target.matches('.person-btn')) {
        ev.target.classList.toggle('active');
      }
    });

    $('#backToOwed').addEventListener('click', openNewReceiptModal);
    $('#stepToItems').addEventListener('click', ()=>{
      const selected = $$('#payersGrid .person-btn.active').map(b=>b.dataset.id);
      if (selected.length === 0) return showError('Select at least one payer');
      // proceed to items step with context
      openItemsStep({ owedToId, title, payerIds: selected });
    });
  }

  function openItemsStep({ owedToId, title, payerIds }) {
    // Build modal allowing adding multiple items; each item can be split by equal/share/custom
    showModal(`<div class="small">
      <h3>Items & splits</h3>
      <div class="tiny">Add items (name & value). Tap "Split" to split an item.</div>
      <div id="itemsContainer"></div>
      <div style="margin-top:8px">
        <div class="form-row">
          <input id="newItemName" placeholder="Item name (e.g. Chicken Shawarma)" />
          <input id="newItemAmount" type="number" step="0.01" placeholder="Amount" />
          <button class="btn" id="addItemBtn">Add</button>
        </div>
      </div>
      <div style="margin-top:8px">
        <button class="btn" id="cancelReceipt">Cancel</button>
        <button class="btn primary" id="saveReceipt">Save Receipt</button>
      </div>
    </div>`);

    const container = $('#itemsContainer');

    const items = []; // local list before save

    function renderItems() {
      container.innerHTML = '';
      if (items.length===0) container.innerHTML = `<div class="tiny">No items yet</div>`;
      items.forEach((it, idx)=>{
        const div = document.createElement('div');
        div.className='item';
        const amt = currency(it.amount || 0);
        div.innerHTML = `<div class="meta"><strong>${escapeHtml(it.name || '')}</strong><small class="tiny">$${amt}</small></div>
          <div>
            <button class="btn" data-idx="${idx}" data-action="split">Split</button>
            <button class="btn" data-idx="${idx}" data-action="remove">Remove</button>
          </div>`;
        container.appendChild(div);
      });
      container.querySelectorAll('button').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const idx = Number(b.dataset.idx);
          const action = b.dataset.action;
          if (action==='split') openSplitModal(items, idx, renderItems);
          if (action==='remove') {
            items.splice(idx,1);
            renderItems();
          }
        });
      });
    }

    $('#addItemBtn').addEventListener('click', ()=>{
      const name = $('#newItemName').value.trim() || 'Item';
      let amount = Number($('#newItemAmount').value) || 0;
      amount = Math.round((amount + Number.EPSILON) * 100) / 100;
      const item = { id: uid('i'), name, amount, splits: null, targets: payerIds.slice() };
      items.push(item);
      $('#newItemName').value=''; $('#newItemAmount').value='';
      renderItems();
    });

    $('#cancelReceipt').addEventListener('click', closeModal);
    $('#saveReceipt').addEventListener('click', async ()=>{
      if (items.length===0) return showError('Add at least one item');
      // build receipt object
      const receipt = {
        id: uid('r'),
        title,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        owedTo: owedToId,
        items: items.map(it=>{
          // if item.splits provided keep them, else default a single split equal among targets
          if (it.splits && it.splits.length) return { id: it.id, name: it.name, splits: it.splits.map(s=>({ personId:s.personId, amount: s.amount })) };
          return { id: it.id, name: it.name, amount: it.amount, targets: it.targets };
        }),
        payments: [],
        paid: false
      };
      // update doc
      const ref = divvyDocRef(currentDivvyCode);
      await ref.update({ receipts: firebase.firestore.FieldValue.arrayUnion(receipt) });
      closeModal();
    });

    renderItems();
  }

  function openSplitModal(items, idx, onDone) {
    const it = items[idx];
    if (!it) return;
    const people = currentDivvy.people || [];
    // default split equally among current payerIds (it.targets)
    const optionsHtml = people.map(p => {
      const checked = (it.targets && it.targets.includes(p.id)) ? 'checked' : '';
      return `<label style="display:block;margin-bottom:6px"><input type="checkbox" class="split-target" data-id="${p.id}" ${checked}/> ${escapeHtml(p.name)}</label>`;
    }).join('');
    showModal(`<div class="small">
      <h3>Split: ${escapeHtml(it.name)}</h3>
      <div class="tiny">Amount: $${currency(it.amount || 0)}</div>
      <div style="margin-top:8px">
        <div class="tiny">Choose split targets</div>
        <div style="margin-top:6px">${optionsHtml}</div>
        <div style="margin-top:8px">
          <label class="tiny">Or choose number of equal parts: <input id="equalParts" type="number" min="1" value="1" style="width:80px;margin-left:8px"/></label>
        </div>
      </div>
      <div style="margin-top:10px"><button class="btn" id="applySplit">Apply</button> <button class="btn" id="closeSplit">Close</button></div>
    </div>`);

    $('#applySplit').addEventListener('click', ()=>{
      const checked = $$('.split-target').filter(ch => ch.checked).map(ch => ch.dataset.id);
      const equalParts = Number($('#equalParts').value) || 1;
      let splits = [];
      if (checked.length > 0) {
        const per = Math.round((it.amount / checked.length + Number.EPSILON) * 100) / 100;
        // to avoid rounding leftover, assign last one remainder
        for(let i=0;i<checked.length;i++){
          const pid = checked[i];
          let amt = per;
          if (i === checked.length-1) {
            // recompute exact leftover
            const assigned = per * (checked.length-1);
            amt = Math.round((it.amount - assigned + Number.EPSILON) * 100) / 100;
          }
          splits.push({ personId: pid, amount: amt });
        }
      } else {
        // no specific checked -> use equalParts
        const parts = Math.max(1, Math.floor(equalParts));
        const per = Math.round((it.amount / parts + Number.EPSILON) * 100) / 100;
        // When equal parts but no people specified, we create anonymous splits (not good), so prefer targets when possible
        // For our use, if no checked and parts>1, but item.targets exist, split among targets equally
        const targets = it.targets && it.targets.length ? it.targets : (people.map(p=>p.id));
        const per2 = Math.round((it.amount / targets.length + Number.EPSILON) * 100) / 100;
        for(let i=0;i<targets.length;i++){
          let amt = per2;
          if (i===targets.length-1) {
            const assigned = per2*(targets.length-1);
            amt = Math.round((it.amount - assigned + Number.EPSILON)*100)/100;
          }
          splits.push({ personId: targets[i], amount: amt });
        }
      }
      it.splits = splits;
      onDone();
      closeModal();
    });

    $('#closeSplit').addEventListener('click', closeModal);
  }

  async function openReceiptModal(rid) {
    const receipt = (currentDivvy.receipts || []).find(r => r.id === rid);
    if (!receipt) return showError('Receipt not found');
    // compute per-person owed and payments summary
    const { net, owedTo } = computeReceiptPersonNet(receipt);
    // build HTML: items, per-person totals, payments with ability to add payment and mark as paid
    let html = `<div class="small">
      <h3>${escapeHtml(receipt.title || 'Receipt')}</h3>
      <div class="tiny">Owed to: <strong>${escapeHtml(getPersonName(owedTo))}</strong></div>
      <div class="receipt-items">`;
    for (const it of (receipt.items || [])) {
      if (it.splits && it.splits.length) {
        html += `<div class="item-row"><div><strong>${escapeHtml(it.name)}</strong><div class="tiny">$${currency(it.splits.reduce((s,x)=>s+Number(x.amount),0))}</div></div></div>`;
        it.splits.forEach(s=>{
          html += `<div class="item small"><div class="meta">${escapeHtml(getPersonName(s.personId))}</div><div class="right tiny">$${currency(s.amount)}</div></div>`;
        });
      } else {
        html += `<div class="item small"><div class="meta">${escapeHtml(it.name)}</div><div class="tiny right">$${currency(it.amount || 0)}</div></div>`;
      }
    }
    html += `</div><div style="margin-top:8px"><strong>Per person totals</strong></div>`;
    const personRows = [];
    for (const pid in net) {
      const amt = net[pid] || 0;
      personRows.push(`<div class="item small"><div class="meta">${escapeHtml(getPersonName(pid))}</div><div class="right tiny">$${currency(amt)}</div></div>`);
    }
    html += personRows.join('') || `<div class="tiny">No payers listed</div>`;
    // payments area
    html += `<div style="margin-top:10px"><strong>Payments</strong></div>`;
    html += `<div id="paymentsArea">`;
    (receipt.payments || []).forEach(p=>{
      html += `<div class="item small"><div class="meta">${escapeHtml(getPersonName(p.personId))}</div><div class="right tiny">$${currency(p.amount)}</div></div>`;
    });
    html += `</div>`;

    html += `<div style="margin-top:10px">
      <div class="form-row">
        <select id="payPerson">${(currentDivvy.people||[]).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
        <input id="payAmount" type="number" step="0.01" placeholder="Amount" />
        <button class="btn" id="addPaymentBtn">Add payment</button>
      </div>
      <div style="margin-top:6px">
        <button class="btn" id="markPaid">${receipt.paid ? 'Mark as unpaid' : 'Mark as paid'}</button>
        <button class="btn" id="closeReceipt">Close</button>
      </div>
    </div>`;

    showModal(html);

    $('#addPaymentBtn').addEventListener('click', async ()=>{
      const pid = $('#payPerson').value;
      const amt = Number($('#payAmount').value) || 0;
      if (!pid || amt <= 0) return showError('Choose a person and amount');
      const payment = { personId: pid, amount: Math.round((amt+Number.EPSILON)*100)/100, time: firebase.firestore.FieldValue.serverTimestamp() };
      // update arrayUnion
      const ref = divvyDocRef(currentDivvyCode);
      // we must pull latest receipt and replace it — Firestore arrayUnion can't update sub-object, so we rebuild receipts array on server
      const snap = await ref.get();
      if (!snap.exists) return showError('Divvy disappeared');
      const dv = snap.data();
      const receipts = (dv.receipts || []).map(r => {
        if (r.id !== receipt.id) return r;
        const nr = Object.assign({}, r);
        nr.payments = nr.payments ? nr.payments.slice() : [];
        nr.payments.push(payment);
        return nr;
      });
      await ref.update({ receipts });
      // modal will refresh via snapshot listener
    });

    $('#markPaid').addEventListener('click', async ()=>{
      // toggle paid
      const ref = divvyDocRef(currentDivvyCode);
      const snap = await ref.get();
      if (!snap.exists) return showError('Divvy disappeared');
      const dv = snap.data();
      const receipts = (dv.receipts || []).map(r => {
        if (r.id !== receipt.id) return r;
        const nr = Object.assign({}, r);
        nr.paid = !nr.paid;
        // if marking paid and no payments recorded, we can optionally auto-add payments to match totals. Here the spec says marking as paid automatically assumes everyone paid the correct amount and nobody is left owing anything.
        if (nr.paid) {
          // clear payments and add marker payment record summarizing full settlement
          nr.payments = nr.payments || [];
          nr.payments.push({ personId: '__MARKED_PAID__', amount: computeReceiptTotal(nr), time: firebase.firestore.FieldValue.serverTimestamp() });
        } else {
          // undo: remove that special payment
          nr.payments = (nr.payments || []).filter(p=>p.personId !== '__MARKED_PAID__');
        }
        return nr;
      });
      await ref.update({ receipts });
    });

    $('#closeReceipt').addEventListener('click', closeModal);
  }

  async function duplicateReceipt(rid) {
    const ref = divvyDocRef(currentDivvyCode);
    const snap = await ref.get();
    if (!snap.exists) return;
    const dv = snap.data();
    const orig = (dv.receipts||[]).find(r=>r.id===rid);
    if (!orig) return showError('receipt not found');
    // create new receipt object copying items and giving new id & timestamp
    const copy = Object.assign({}, JSON.parse(JSON.stringify(orig)));
    copy.id = uid('r');
    copy.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    copy.payments = [];
    copy.paid = false;
    // add
    await ref.update({ receipts: firebase.firestore.FieldValue.arrayUnion(copy) });
  }

  // ---------- Balances render ----------
  function renderBalances() {
    const { nets } = computeAllBalances(currentDivvy);
    // summary
    balancesSummary.innerHTML = `<div class="small"><strong>Net balances</strong><div class="tiny">Positive = is owed money · Negative = owes</div></div>`;
    balancesList.innerHTML = '';
    const people = currentDivvy.people || [];
    const rows = people.map(p=>{
      const net = nets[p.id] || 0;
      return `<div class="item small"><div class="meta">${escapeHtml(p.name)}<small class="tiny">${net>=0? 'is owed': 'owes'}</small></div><div class="right tiny">$${currency(Math.abs(net))}</div></div>`;
    }).join('');
    balancesList.innerHTML = rows || `<div class="tiny">No people</div>`;

    // simplified transfers
    const transfers = simplifyDebts(nets);
    const transfersEl = document.createElement('div');
    transfersEl.innerHTML = `<div style="margin-top:8px"><strong>Suggested transfers</strong></div>`;
    if (transfers.length===0) {
      transfersEl.innerHTML += `<div class="tiny">All settled</div>`;
    } else {
      transfers.forEach(t=>{
        transfersEl.innerHTML += `<div class="item small"><div class="meta">${escapeHtml(getPersonName(t.from))} → ${escapeHtml(getPersonName(t.to))}</div><div class="right tiny">$${currency(t.amount)}</div></div>`;
      });
    }
    balancesList.appendChild(transfersEl);
  }

  // ---------- Init ----------
  // Optionally parse code from URL hash ?code=ABC
  (function initFromUrl(){
    const params = new URLSearchParams(location.search);
    const code = (params.get('code') || '').toUpperCase();
    if (code) {
      // auto-join (attempt)
      (async ()=> {
        try {
          const snap = await divvyDocRef(code).get();
          if (snap.exists) {
            subscribeToDivvy(code);
            landing.classList.add('hidden');
            divvyView.classList.remove('hidden');
          }
        } catch(e){ console.warn('auto join failed', e); }
      })();
    }
  })();

})();
