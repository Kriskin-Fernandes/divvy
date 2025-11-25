// app.js (vanilla JS + Firebase v9 modular)
// IMPORTANT: served as type="module" in index.html

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --------------------------------------------------
// Firebase config
// --------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDbrwowtFH-nCwoO4P7h2eINtEbpostC1c",
  authDomain: "divvy-73bc1.firebaseapp.com",
  projectId: "divvy-73bc1",
  storageBucket: "divvy-73bc1.firebasestorage.app",
  messagingSenderId: "954250527508",
  appId: "1:954250527508:web:af1b7b7d0c877190743801"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --------------------------------------------------
// State
// --------------------------------------------------
let currentDivvyCode = null;
let currentDivvyData = null;

// currency state
let currentCurrency = "USD";

// Temporary state for editing a receipt in the modal
let editingReceipt = null; // JS object for the receipt being edited/created
let splitTargetExpenseId = null;

// --------------------------------------------------
// Helpers
// --------------------------------------------------

// Generate random 5-letter uppercase code
function generateCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// currency metadata
const currencyMeta = {
  USD: { symbol: "$", flag: "🇺🇸" },
  GBP: { symbol: "£", flag: "🇬🇧" },
  EUR: { symbol: "€", flag: "🇪🇺" },
  AED: { symbol: "د.إ", flag: "🇦🇪" },
  INR: { symbol: "₹", flag: "🇮🇳" },
  JPY: { symbol: "¥", flag: "🇯🇵" }
};

// Format amount to 2 decimals with current currency symbol
function formatAmount(value) {
  const num = Number(value || 0);
  const symbol = currencyMeta[currentCurrency]?.symbol || "$";
  if (Number.isNaN(num)) return symbol + "0.00";
  return symbol + num.toFixed(2);
}

// Sum expenses
function calculateReceiptTotal(receipt) {
  if (!receipt || !receipt.expenses) return 0;
  return receipt.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

// Get member by id
function getMemberById(id) {
  if (!currentDivvyData || !currentDivvyData.members) return null;
  return currentDivvyData.members.find((m) => m.id === id) || null;
}

// Get member name (fallback)
function getMemberName(id) {
  const m = getMemberById(id);
  return m ? m.name : "(Unknown)";
}

// Ensure arrays exist
function ensureDivvyDefaults(divvy) {
  if (!divvy.members) divvy.members = [];
  if (!divvy.receipts) divvy.receipts = [];
  return divvy;
}

// Simple unique id for receipts/expenses in this session
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Round to 2 decimal places
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Return "recent" if closed within last 2 days, "old" if older, null if not closed
function getClosedStatus(receipt) {
  if (!receipt.closed || !receipt.closedAt) return null;
  const closedMs =
    receipt.closedAt.seconds != null
      ? receipt.closedAt.seconds * 1000
      : Date.now();
  const diffDays = (Date.now() - closedMs) / (1000 * 60 * 60 * 24);
  if (diffDays <= 2) return "recent";
  return "old";
}

// --------------------------------------------------
// DOM references
// --------------------------------------------------

// Screens
const landingScreen = document.getElementById("landing-screen");
const divvyScreen = document.getElementById("divvy-screen");

// Landing controls
const joinCodeInput = document.getElementById("join-code-input");
const joinDivvyBtn = document.getElementById("join-divvy-btn");
const createDivvyBtn = document.getElementById("create-divvy-btn");
const landingError = document.getElementById("landing-error");

// Top bar: currency + divvy info
const currencyFlagEl = document.getElementById("currency-flag");
const currencySelectEl = document.getElementById("currency-select");
const divvyNameDisplay = document.getElementById("divvy-name-display");
const editDivvyNameBtn = document.getElementById("edit-divvy-name-btn");
const divvyCodeDisplay = document.getElementById("divvy-code-display");
const leaveDivvyBtn = document.getElementById("leave-divvy-btn");

// Members
const membersListEl = document.getElementById("members-list");
const addMemberHeaderBtn = document.getElementById("add-member-btn");

// Receipts
const receiptsListEl = document.getElementById("receipts-list");
const addReceiptBtn = document.getElementById("add-receipt-btn");

// Receipt modal
const receiptModal = document.getElementById("receipt-modal");
const receiptModalTitle = document.getElementById("receipt-modal-title");
const closeReceiptModalBtn = document.getElementById("close-receipt-modal-btn");

const receiptNameInput = document.getElementById("receipt-name-input");

// Collector selection
const collectorSearchInput = document.getElementById("collector-search-input");
const collectorOptionsEl = document.getElementById("collector-options");
const collectorErrorEl = document.getElementById("collector-error");
const collectorAddMemberBtn = document.getElementById(
  "collector-add-member-btn"
);

// Debtors selection
const debtorsSearchInput = document.getElementById("debtors-search-input");
const debtorsOptionsEl = document.getElementById("debtors-options");
const debtorsErrorEl = document.getElementById("debtors-error");
const debtorsAddMemberBtn = document.getElementById("debtors-add-member-btn");

// Expenses
const expensesListEl = document.getElementById("expenses-list");
const addExpenseBtn = document.getElementById("add-expense-btn");
const receiptTotalDisplay = document.getElementById("receipt-total-display");

// Publish
const publishReceiptBtn = document.getElementById("publish-receipt-btn");
const publishErrorEl = document.getElementById("publish-error");

// Member modal (detail)
const memberModal = document.getElementById("member-modal");
const memberModalTitle = document.getElementById("member-modal-title");
const closeMemberModalBtn = document.getElementById("close-member-modal-btn");
const memberOutstandingList = document.getElementById(
  "member-outstanding-list"
);
const memberPaidList = document.getElementById("member-paid-list");

// Prompt modal (generic text input)
const promptModal = document.getElementById("prompt-modal");
const promptTitleEl = document.getElementById("prompt-title");
const promptMessageEl = document.getElementById("prompt-message");
const promptInputEl = document.getElementById("prompt-input");
const promptCancelBtn = document.getElementById("prompt-cancel-btn");
const promptOkBtn = document.getElementById("prompt-ok-btn");

// Split modal
const splitModal = document.getElementById("split-modal");
const splitCancelBtn = document.getElementById("split-cancel-btn");
const splitEqualCountInput = document.getElementById(
  "split-equal-count-input"
);
const splitEqualBtn = document.getElementById("split-equal-btn");
const splitPercentagesInput = document.getElementById(
  "split-percentages-input"
);
const splitPercentBtn = document.getElementById("split-percent-btn");
const splitErrorEl = document.getElementById("split-error");

// --------------------------------------------------
// Simple modal prompt helper
// --------------------------------------------------
let promptResolve = null;

function showPrompt({ title, message, placeholder = "", initialValue = "" }) {
  promptTitleEl.textContent = title;
  promptMessageEl.textContent = message;
  promptInputEl.value = initialValue;
  promptInputEl.placeholder = placeholder;
  promptModal.classList.add("active");
  promptInputEl.focus();

  return new Promise((resolve) => {
    promptResolve = resolve;
  });
}

function closePrompt(result = null) {
  promptModal.classList.remove("active");
  if (promptResolve) {
    promptResolve(result);
    promptResolve = null;
  }
}

// --------------------------------------------------
// Screen handling
// --------------------------------------------------
function showLanding() {
  landingScreen.classList.add("active-screen");
  divvyScreen.classList.remove("active-screen");
  currentDivvyCode = null;
  currentDivvyData = null;
  receiptsListEl.innerHTML = "";
  membersListEl.innerHTML = "";
  joinCodeInput.value = "";
  landingError.textContent = "";
}

function showDivvyScreen() {
  landingScreen.classList.remove("active-screen");
  divvyScreen.classList.add("active-screen");
}

// --------------------------------------------------
// Firestore operations
// --------------------------------------------------
async function loadDivvy(code) {
  const ref = doc(db, "divvies", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = ensureDivvyDefaults(snap.data());
  return data;
}

async function saveDivvy(code, data) {
  const ref = doc(db, "divvies", code);
  const payload = {...data,
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, payload);
}

// --------------------------------------------------
// Rendering: Members and Receipts
// --------------------------------------------------
function renderMembers() {
  membersListEl.innerHTML = "";
  if (!currentDivvyData || !currentDivvyData.members.length) {
    const empty = document.createElement("div");
    empty.className = "chip subtle";
    empty.textContent = "No members yet – add one!";
    membersListEl.appendChild(empty);
    return;
  }

  currentDivvyData.members.forEach((m) => {
    const chip = document.createElement("div");
    chip.className = "chip member-chip";
    chip.textContent = m.name;
    chip.dataset.memberId = m.id;
    chip.addEventListener("click", () => {
      openMemberModal(m.id);
    });
    membersListEl.appendChild(chip);
  });
}

function renderReceipts() {
  receiptsListEl.innerHTML = "";

  if (!currentDivvyData || !currentDivvyData.receipts.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML =
      "<p class='small-text'>No receipts yet. Tap “Add receipt” to start.</p>";
    receiptsListEl.appendChild(empty);
    return;
  }

  // Sort by createdAt (if present) descending, fallback to array order
  const receipts = [...currentDivvyData.receipts].sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return b.createdAt.seconds - a.createdAt.seconds;
    }
    return 0;
  });

  receipts.forEach((r) => {
    const card = document.createElement("div");
    card.className = "receipt-card";

    const total = calculateReceiptTotal(r);

    // closed state styling
    if (r.closed) {
      const closedState = getClosedStatus(r);
      if (closedState === "recent") {
        card.classList.add("closed-recent");
      } else if (closedState === "old") {
        card.classList.add("closed-old");
      }
    }

    // Header
    const header = document.createElement("div");
    header.className = "receipt-top-row";

    const titleEl = document.createElement("div");
    titleEl.className = "receipt-title";
    titleEl.textContent = r.name && r.name.trim()
      ? r.name
      : "Untitled receipt";

    const amountEl = document.createElement("div");
    amountEl.className = "receipt-title";
    amountEl.textContent = formatAmount(total);

    header.appendChild(titleEl);
    header.appendChild(amountEl);

    // Subtitle + meta
    const subtitle = document.createElement("div");
    subtitle.className = "receipt-subtitle";
    const collectorName = r.collectorName || getMemberName(r.collectorId);
    subtitle.textContent = `Collector: ${collectorName}`;

    const metaRow = document.createElement("div");
    metaRow.className = "receipt-meta-row";

    const statusBadge = document.createElement("span");
    statusBadge.className = "badge";
    if (r.closed) {
      statusBadge.classList.add("closed");
      statusBadge.textContent = "Closed";
    } else if (r.published) {
      statusBadge.classList.add("published");
      statusBadge.textContent = "Published";
    } else {
      statusBadge.classList.add("draft");
      statusBadge.textContent = "Draft";
    }

    const ts = r.createdAt?.seconds || null;
    const timeSpan = document.createElement("span");
    timeSpan.textContent = ts
      ? new Date(ts * 1000).toLocaleString()
      : "No timestamp";

    metaRow.appendChild(statusBadge);
    metaRow.appendChild(timeSpan);

    // Compact expenses list
    const compactExpenses = document.createElement("div");
    compactExpenses.className = "expenses-list-compact";
    (r.expenses || []).forEach((e) => {
      const row = document.createElement("div");
      row.className = "expense-row-compact";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = e.name || "Item";

      const amountSpan = document.createElement("span");
      amountSpan.className = "amount";
      amountSpan.textContent = formatAmount(e.amount);

      row.appendChild(nameSpan);
      row.appendChild(amountSpan);
      compactExpenses.appendChild(row);
    });

    // Member summary (only after published)
    let summaryContainer = null;
    if (r.published) {
      summaryContainer = document.createElement("div");
      summaryContainer.className = "receipt-member-summary";
      renderReceiptMemberSummary(r, summaryContainer);
    }

    // Actions
    const actionsRow = document.createElement("div");
    actionsRow.className = "receipt-actions-row";

    const editBtn = document.createElement("button");
    editBtn.className = "secondary-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      openReceiptModal(r);
    });

    const markClosedBtn = document.createElement("button");
    markClosedBtn.className = "primary-btn";
    markClosedBtn.textContent = r.closed
      ? "Reopen"
      : "Mark closed (everyone paid)";
    markClosedBtn.addEventListener("click", () => {
      toggleReceiptClosed(r.id);
    });

    actionsRow.appendChild(editBtn);
    actionsRow.appendChild(markClosedBtn);

    card.appendChild(header);
    card.appendChild(subtitle);
    card.appendChild(metaRow);
    if (r.expenses && r.expenses.length) {
      card.appendChild(compactExpenses);
    }
    if (summaryContainer) {
      card.appendChild(summaryContainer);
    }
    card.appendChild(actionsRow);

    receiptsListEl.appendChild(card);
  });
}

// Render per-member summary for a receipt into a container
function renderReceiptMemberSummary(receipt, containerEl) {
  containerEl.innerHTML = "";

  const memberIds = receipt.memberIds || [];
  const payments = receipt.payments || [];
  const expenses = receipt.expenses || [];

  // Compute totals and paid per member
  const memberTotals = {};
  const memberPaid = {};

  memberIds.forEach((id) => {
    memberTotals[id] = 0;
    memberPaid[id] = 0;
  });

  // 1) Compute totals from assigned expenses
  expenses.forEach((e) => {
    const amount = Number(e.amount || 0);
    if (!amount) return;
    if (e.assignedToId === "everyone") {
      // Everyone: split evenly among all memberIds
      const count = memberIds.length || 1;
      const share = round2(amount / count);
      let runningTotal = 0;
      memberIds.forEach((id, idx) => {
        const val =
          idx === memberIds.length - 1
            ? round2(amount - runningTotal)
            : share;
        memberTotals[id] = round2((memberTotals[id] || 0) + val);
        runningTotal += val;
      });
    } else {
      if (memberTotals[e.assignedToId] == null) {
        memberTotals[e.assignedToId] = 0;
      }
      memberTotals[e.assignedToId] = round2(
        memberTotals[e.assignedToId] + amount
      );
    }
  });

  // 2) Paid from payments array
  payments.forEach((p) => {
    const amount = Number(p.paid || 0);
    if (!amount) return;
    if (memberPaid[p.memberId] == null) memberPaid[p.memberId] = 0;
    memberPaid[p.memberId] = round2(memberPaid[p.memberId] + amount);
  });

  // Render rows
  memberIds.forEach((id) => {
    const row = document.createElement("div");
    row.className = "receipt-member-row";

    const nameSpan = document.createElement("div");
    nameSpan.className = "member-name";
    nameSpan.textContent = getMemberName(id);

    const paidInput = document.createElement("input");
    paidInput.type = "number";
    paidInput.step = "0.01";
    paidInput.min = "0";
    paidInput.className = "member-paid-input";
    paidInput.value = (memberPaid[id] || 0).toFixed(2);
    paidInput.addEventListener("change", () => {
      const newVal = Number(paidInput.value || 0);
      updateReceiptMemberPaid(receipt.id, id, newVal);
    });

    const totalsSpan = document.createElement("div");
    totalsSpan.className = "member-totals";
    const total = memberTotals[id] || 0;
    totalsSpan.textContent = `Total: ${formatAmount(total)}`;

    row.appendChild(nameSpan);
    row.appendChild(paidInput);
    row.appendChild(totalsSpan);
    containerEl.appendChild(row);
  });

    // Info about closure logic
  const note = document.createElement("div");
  note.className = "small-text";
  const totalDue = Object.values(memberTotals).reduce(
    (sum, v) => sum + (v || 0),
    0
  );
  const totalPaid = Object.values(memberPaid).reduce(
    (sum, v) => sum + (v || 0),
    0
  );
  note.textContent = `Total due: ${formatAmount(
    totalDue
  )}, Paid so far: ${formatAmount(
    totalPaid
  )}. Receipt will auto-close when paid is greater than or equal to total.`;
  containerEl.appendChild(note);

  // Auto-close when totalPaid >= totalDue
  if (!receipt.closed && receipt.published && totalDue > 0 && totalPaid >= totalDue) {
    toggleReceiptClosed(receipt.id);
  }
}

// --------------------------------------------------
// Member detail modal
// --------------------------------------------------
function openMemberModal(memberId) {
  const member = getMemberById(memberId);
  if (!member || !currentDivvyData) return;

  memberModalTitle.textContent = member.name;
  memberOutstandingList.innerHTML = "";
  memberPaidList.innerHTML = "";

  const receipts = currentDivvyData.receipts || [];
  const outstanding = [];
  const paid = [];

  receipts.forEach((r) => {
    if (!r.published) return;
    const collector = getMemberName(r.collectorId);
    const expenses = r.expenses || [];
    const payments = r.payments || [];
    const memberIds = r.memberIds || [];

    if (!memberIds.includes(memberId)) return;

    // compute due
    let due = 0;
    expenses.forEach((e) => {
      const amount = Number(e.amount || 0);
      if (!amount) return;
      if (e.assignedToId === "everyone") {
        const count = memberIds.length || 1;
        const share = round2(amount / count);
        due = round2(due + share);
      } else if (e.assignedToId === memberId) {
        due = round2(due + amount);
      }
    });

    // compute paid
    let paidAmount = 0;
    payments.forEach((p) => {
      if (p.memberId === memberId) {
        paidAmount = round2(paidAmount + Number(p.paid || 0));
      }
    });

    if (due <= 0 && paidAmount <= 0) return;

    const receiptName = r.name && r.name.trim() ? r.name : "Untitled receipt";
    const description = `for ${receiptName}`;

    if (paidAmount < due && !r.closed) {
      outstanding.push({
        text: `Owes ${formatAmount(due - paidAmount)} to ${collector} ${description}`
      });
    }

    if (paidAmount > 0) {
      paid.push({
        text: `Paid ${formatAmount(paidAmount)} to ${collector} ${description}`
      });
    }
  });

  if (!outstanding.length) {
    const item = document.createElement("div");
    item.className = "payment-item";
    item.innerHTML =
      "<div class='payment-subtext'>No outstanding payments 🎉</div>";
    memberOutstandingList.appendChild(item);
  } else {
    outstanding.forEach((o) => {
      const item = document.createElement("div");
      item.className = "payment-item";
      const title = document.createElement("div");
      title.className = "payment-title";
      title.textContent = o.text;
      item.appendChild(title);
      memberOutstandingList.appendChild(item);
    });
  }

  if (!paid.length) {
    const item = document.createElement("div");
    item.className = "payment-item";
    item.innerHTML =
      "<div class='payment-subtext'>No payments recorded yet.</div>";
    memberPaidList.appendChild(item);
  } else {
    paid.forEach((p) => {
      const item = document.createElement("div");
      item.className = "payment-item";
      const title = document.createElement("div");
      title.className = "payment-title";
      title.textContent = p.text;
      item.appendChild(title);
      memberPaidList.appendChild(item);
    });
  }

  memberModal.classList.add("active");
}

function closeMemberModal() {
  memberModal.classList.remove("active");
}

// --------------------------------------------------
// Receipt editing modal
// --------------------------------------------------
function openReceiptModal(receipt) {
  publishErrorEl.textContent = "";
  collectorErrorEl.textContent = "";
  debtorsErrorEl.textContent = "";

  if (!currentDivvyData) return;

  if (receipt) {
    // editing existing
    editingReceipt = JSON.parse(JSON.stringify(receipt)); // clone
    receiptModalTitle.textContent = "Edit receipt";
  } else {
    // new
    editingReceipt = {
      id: uid(),
      name: "",
      collectorId: null,
      collectorName: "",
      memberIds: [],
      expenses: [],
      payments: [],
      published: false,
      closed: false,
      createdAt: null,
      updatedAt: null,
      closedAt: null
    };
    receiptModalTitle.textContent = "New receipt";
  }

  // Fill UI from editingReceipt
  receiptNameInput.value = editingReceipt.name || "";

  renderCollectorOptions();
  renderDebtorsOptions();
  renderExpensesInModal();
  updateReceiptTotalDisplay();

  receiptModal.classList.add("active");
}

function closeReceiptModal() {
  receiptModal.classList.remove("active");
  editingReceipt = null;
  splitTargetExpenseId = null;
}

// Collector options rendering
function renderCollectorOptions() {
  collectorOptionsEl.innerHTML = "";
  const members = currentDivvyData?.members || [];
  const q = (collectorSearchInput.value || "").toLowerCase();

  members.forEach((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return;
    const chip = document.createElement("div");
    chip.className = "chip member-chip";
    chip.textContent = m.name;
    chip.dataset.memberId = m.id;
    if (editingReceipt.collectorId === m.id) {
      chip.classList.add("selected", "collector-chip");
    }
    chip.addEventListener("click", () => {
      editingReceipt.collectorId = m.id;
      editingReceipt.collectorName = m.name;
      renderCollectorOptions();
    });
    collectorOptionsEl.appendChild(chip);
  });

  if (!members.length) {
    const empty = document.createElement("div");
    empty.className = "chip subtle";
    empty.textContent = "No members yet – add one.";
    collectorOptionsEl.appendChild(empty);
  }
}

// Debtors options rendering (multi-select)
function renderDebtorsOptions() {
  debtorsOptionsEl.innerHTML = "";
  const members = currentDivvyData?.members || [];
  const q = (debtorsSearchInput.value || "").toLowerCase();
  const selectedIds = editingReceipt.memberIds || [];

  members.forEach((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return;
    const chip = document.createElement("div");
    chip.className = "chip member-chip";
    chip.textContent = m.name;
    chip.dataset.memberId = m.id;
    if (selectedIds.includes(m.id)) {
      chip.classList.add("selected");
    }
    chip.addEventListener("click", () => {
      const idx = selectedIds.indexOf(m.id);
      if (idx === -1) {
        // add member to this receipt
        selectedIds.push(m.id);
      } else {
        // remove member from this receipt
        const removedId = m.id;
        selectedIds.splice(idx, 1);

        // Redirect any expenses assigned specifically to this member to "everyone"
        if (editingReceipt.expenses && editingReceipt.expenses.length) {
          editingReceipt.expenses.forEach((e) => {
            if (e.assignedToId === removedId) {
              e.assignedToId = "everyone";
            }
          });
        }

        // Also clear any payment entries for this member on this receipt
        if (editingReceipt.payments && editingReceipt.payments.length) {
          editingReceipt.payments = editingReceipt.payments.filter(
            (p) => p.memberId !== removedId
          );
        }
      }

      editingReceipt.memberIds = selectedIds;
      renderDebtorsOptions();
      renderExpensesInModal(); // refresh assignee dropdowns
      updateReceiptTotalDisplay();
    });
    debtorsOptionsEl.appendChild(chip);
  });

  if (!members.length) {
    const empty = document.createElement("div");
    empty.className = "chip subtle";
    empty.textContent = "No members yet – add one.";
    debtorsOptionsEl.appendChild(empty);
  }
}

// Render expenses in receipt modal
function renderExpensesInModal() {
  expensesListEl.innerHTML = "";

  (editingReceipt.expenses || []).forEach((e) => {
    const item = document.createElement("div");
    item.className = "expense-item";
    item.dataset.expenseId = e.id;

    // Top row: name + amount
    const topRow = document.createElement("div");
    topRow.className = "expense-top-row";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Item name";
    nameInput.value = e.name || "";
    nameInput.addEventListener("input", () => {
      e.name = nameInput.value;
    });

    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.step = "0.01";
    amountInput.min = "0";
    amountInput.placeholder = "0.00";
    amountInput.value =
      e.amount != null && e.amount !== "" ? Number(e.amount).toFixed(2) : "";
    amountInput.addEventListener("change", () => {
      e.amount = Number(amountInput.value || 0);
      updateReceiptTotalDisplay();
    });

    topRow.appendChild(nameInput);
    topRow.appendChild(amountInput);

    // Bottom row: assignee + actions
    const bottomRow = document.createElement("div");
    bottomRow.className = "expense-bottom-row";

    const bottomLeft = document.createElement("div");
    bottomLeft.className = "expense-bottom-left";

    const assignLabel = document.createElement("div");
    assignLabel.className = "expense-assign-label";
    assignLabel.textContent = "Assigned to";

    const select = document.createElement("select");
    select.className = "expense-assignee-select";

    // Option: everyone
    const everyoneOpt = document.createElement("option");
    everyoneOpt.value = "everyone";
    everyoneOpt.textContent = "Everyone";
    select.appendChild(everyoneOpt);

    // Options: each member in receipt.memberIds
    (editingReceipt.memberIds || []).forEach((id) => {
      const m = getMemberById(id);
      if (!m) return;
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });

    select.value = e.assignedToId || "everyone";

    select.addEventListener("change", () => {
      e.assignedToId = select.value;
    });

    bottomLeft.appendChild(assignLabel);
    bottomLeft.appendChild(select);

    const actions = document.createElement("div");
    actions.className = "expense-actions";

    const splitBtn = document.createElement("button");
    splitBtn.className = "secondary-btn";
    splitBtn.textContent = "Split";
    splitBtn.addEventListener("click", () => {
      openSplitModal(e.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      editingReceipt.expenses = editingReceipt.expenses.filter(
        (x) => x.id !== e.id
      );
      renderExpensesInModal();
      updateReceiptTotalDisplay();
    });

    actions.appendChild(splitBtn);
    actions.appendChild(deleteBtn);

    bottomRow.appendChild(bottomLeft);
    bottomRow.appendChild(actions);

    item.appendChild(topRow);
    item.appendChild(bottomRow);

    expensesListEl.appendChild(item);
  });

  if (!editingReceipt.expenses || !editingReceipt.expenses.length) {
    const empty = document.createElement("div");
    empty.className = "small-text";
    empty.textContent = "No expenses yet. Tap “Add expense”.";
    expensesListEl.appendChild(empty);
  }
}

function updateReceiptTotalDisplay() {
  const total = calculateReceiptTotal(editingReceipt || {});
  receiptTotalDisplay.textContent = formatAmount(total);
}

// --------------------------------------------------
// Split expense modal
// --------------------------------------------------
function openSplitModal(expenseId) {
  splitTargetExpenseId = expenseId;
  splitEqualCountInput.value = "2";
  splitPercentagesInput.value = "";
  splitErrorEl.textContent = "";
  splitModal.classList.add("active");
}

function closeSplitModal() {
  splitModal.classList.remove("active");
  splitTargetExpenseId = null;
}

// Perform equal split
function performEqualSplit() {
  if (!editingReceipt || !splitTargetExpenseId) return;
  const count = Number(splitEqualCountInput.value || 0);
  if (!Number.isInteger(count) || count < 2) {
    splitErrorEl.textContent = "Enter a number of parts (2 or more).";
    return;
  }

  const expenses = editingReceipt.expenses || [];
  const idx = expenses.findIndex((e) => e.id === splitTargetExpenseId);
  if (idx === -1) {
    splitErrorEl.textContent = "Expense not found.";
    return;
  }

  const original = expenses[idx];
  const total = Number(original.amount || 0);
  if (total <= 0) {
    splitErrorEl.textContent = "Amount must be greater than 0.";
    return;
  }

  const base = round2(total / count);
  const newExpenses = [];
  let running = 0;

  for (let i = 0; i < count; i++) {
    let amount = base;
    if (i === count - 1) {
      amount = round2(total - running);
    }
    running = round2(running + amount);

    newExpenses.push({
      id: uid(),
      name: `${original.name || "Item"} [${i + 1}]`,
      amount,
      assignedToId: original.assignedToId || "everyone"
    });
  }

  // Replace original with new ones
  expenses.splice(idx, 1,...newExpenses);
  editingReceipt.expenses = expenses;
  renderExpensesInModal();
  updateReceiptTotalDisplay();
  closeSplitModal();
}

// Perform percentage split
function performPercentSplit() {
  if (!editingReceipt || !splitTargetExpenseId) return;
  const text = splitPercentagesInput.value || "";
  const parts = text.split(",").map((s) => s.trim()).filter((s) => s.length);

  if (parts.length < 2) {
    splitErrorEl.textContent = "Enter at least two percentages.";
    return;
  }

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) {
    splitErrorEl.textContent = "All percentages must be positive numbers.";
    return;
  }

  const totalPercent = nums.reduce((sum, n) => sum + n, 0);
  if (Math.abs(totalPercent - 100) > 0.01) {
    splitErrorEl.textContent = "Percentages must sum to 100.";
    return;
  }

  const expenses = editingReceipt.expenses || [];
  const idx = expenses.findIndex((e) => e.id === splitTargetExpenseId);
  if (idx === -1) {
    splitErrorEl.textContent = "Expense not found.";
    return;
  }

  const original = expenses[idx];
  const total = Number(original.amount || 0);
  if (total <= 0) {
    splitErrorEl.textContent = "Amount must be greater than 0.";
    return;
  }

  const newExpenses = [];
  let running = 0;

  nums.forEach((pct, i) => {
    let amount = round2((total * pct) / 100);
    if (i === nums.length - 1) {
      amount = round2(total - running);
    }
    running = round2(running + amount);
    newExpenses.push({
      id: uid(),
      name: `${original.name || "Item"} [${i + 1}]`,
      amount,
      assignedToId: original.assignedToId || "everyone"
    });
  });

  expenses.splice(idx, 1,...newExpenses);
  editingReceipt.expenses = expenses;
  renderExpensesInModal();
  updateReceiptTotalDisplay();
  closeSplitModal();
}

// --------------------------------------------------
// Data mutations: members, receipts, payments
// --------------------------------------------------
async function addMemberGlobal() {
  if (!currentDivvyData) return;
  const name = await showPrompt({
    title: "Add member",
    message: "Enter the member's name:",
    placeholder: "e.g. David"
  });
  closePrompt();
  if (!name) {
    return;
  }
  const trimmed = String(name).trim();
  if (!trimmed) return;

  const id = uid();
  currentDivvyData.members.push({ id, name: trimmed });

  await saveDivvy(currentDivvyCode, currentDivvyData);
  renderMembers();
  renderCollectorOptions();
  renderDebtorsOptions();
  renderReceipts();
}

async function addMemberFromCollector() {
  await addMemberGlobal();
}

async function addMemberFromDebtors() {
  await addMemberGlobal();
}

function addExpenseLocal() {
  if (!editingReceipt) return;
  if (!editingReceipt.expenses) editingReceipt.expenses = [];
  editingReceipt.expenses.push({
    id: uid(),
    name: "",
    amount: 0,
    assignedToId: "everyone"
  });
  renderExpensesInModal();
  updateReceiptTotalDisplay();
}

// Update payments for a member in a given receipt
async function updateReceiptMemberPaid(receiptId, memberId, amount) {
  if (!currentDivvyData) return;
  const r = currentDivvyData.receipts.find((x) => x.id === receiptId);
  if (!r) return;
  if (!r.payments) r.payments = [];

  const existing = r.payments.find((p) => p.memberId === memberId);
  if (existing) {
    existing.paid = amount;
  } else {
    r.payments.push({ memberId, paid: amount });
  }

  await saveDivvy(currentDivvyCode, currentDivvyData);
  renderReceipts();
}

// Toggle receipt closed
async function toggleReceiptClosed(receiptId) {
  if (!currentDivvyData) return;
  const r = currentDivvyData.receipts.find((x) => x.id === receiptId);
  if (!r) return;
  r.closed = !r.closed;

  if (r.closed) {
    r.closedAt = { seconds: Math.floor(Date.now() / 1000) };
  } else {
    r.closedAt = null;
  }

  await saveDivvy(currentDivvyCode, currentDivvyData);
  renderReceipts();
}

// Publish or update receipt from modal
async function publishReceipt() {
  if (!editingReceipt || !currentDivvyData) return;

  publishErrorEl.textContent = "";

  // Basic validation
  if (!editingReceipt.collectorId) {
    collectorErrorEl.textContent = "Select who is owed the money.";
    return;
  } else {
    collectorErrorEl.textContent = "";
  }

  if (!editingReceipt.memberIds || !editingReceipt.memberIds.length) {
    debtorsErrorEl.textContent = "Select at least one debtor.";
    return;
  } else {
    debtorsErrorEl.textContent = "";
  }

  if (!editingReceipt.expenses || !editingReceipt.expenses.length) {
    publishErrorEl.textContent = "Add at least one expense.";
    return;
  }

  // Ensure each expense has a numeric amount and assignee
  for (const e of editingReceipt.expenses) {
    const amount = Number(e.amount || 0);
    if (!(amount > 0)) {
      publishErrorEl.textContent =
        "Each expense must have an amount greater than 0.";
      return;
    }
    if (!e.assignedToId) {
      e.assignedToId = "everyone";
    }
  }

  // Set basic fields
  editingReceipt.name = (receiptNameInput.value || "").trim();
  editingReceipt.collectorName =
    getMemberById(editingReceipt.collectorId)?.name ||
    editingReceipt.collectorName ||
    "";
  editingReceipt.published = true;

  // If it's a new receipt (not found by ID), push; otherwise update existing
  const existingIdx = currentDivvyData.receipts.findIndex(
    (x) => x.id === editingReceipt.id
  );
  const now = new Date();

  if (existingIdx === -1) {
    editingReceipt.createdAt = {
      seconds: Math.floor(now.getTime() / 1000)
    };
    editingReceipt.updatedAt = {
      seconds: Math.floor(now.getTime() / 1000)
    };
    currentDivvyData.receipts.push(editingReceipt);
  } else {
    editingReceipt.updatedAt = {
      seconds: Math.floor(now.getTime() / 1000)
    };
    currentDivvyData.receipts[existingIdx] = editingReceipt;
  }

  await saveDivvy(currentDivvyCode, currentDivvyData);
  renderReceipts();
  closeReceiptModal();
}

// --------------------------------------------------
// Join / create divvy
// --------------------------------------------------
async function joinDivvy() {
  landingError.textContent = "";
  let code = (joinCodeInput.value || "").toUpperCase().trim();

  if (!code || code.length !== 5) {
    landingError.textContent = "Enter a 5-letter divvy code.";
    return;
  }

  try {
    const data = await loadDivvy(code);
    if (!data) {
      landingError.textContent = "Divvy not found.";
      return;
    }
    currentDivvyCode = code;
    currentDivvyData = ensureDivvyDefaults(data);

    // currency
    currentCurrency = currentDivvyData.currency || "USD";
    currencySelectEl.value = currentCurrency;
    const flag = currencyMeta[currentCurrency]?.flag || "🇺🇸";
    currencyFlagEl.textContent = flag;

    // divvy name
    divvyNameDisplay.textContent =
      currentDivvyData.name || "Unnamed divvy";
    divvyCodeDisplay.textContent = currentDivvyCode;

    showDivvyScreen();
    renderMembers();
    renderReceipts();
  } catch (err) {
    console.error(err);
    landingError.textContent = "Failed to load divvy. Try again.";
  }
}

async function createDivvy() {
  landingError.textContent = "";
  let code = generateCode();

  // Firestore doc; if already exists, regenerate once or twice (rare)
  for (let i = 0; i < 3; i++) {
    const ref = doc(db, "divvies", code);
    const snap = await getDoc(ref);
    if (!snap.exists()) break;
    code = generateCode();
  }

  const now = serverTimestamp();
  const divvyData = {
    code,
    name: "Unnamed divvy",
    currency: currentCurrency || "USD",
    members: [],
    receipts: [],
    createdAt: now,
    updatedAt: now
  };

  try {
    await setDoc(doc(db, "divvies", code), divvyData);
    currentDivvyCode = code;
    currentDivvyData = ensureDivvyDefaults(divvyData);

    // currency
    currentCurrency = currentDivvyData.currency || "USD";
    currencySelectEl.value = currentCurrency;
    const flag = currencyMeta[currentCurrency]?.flag || "🇺🇸";
    currencyFlagEl.textContent = flag;

    // divvy name
    divvyNameDisplay.textContent =
      currentDivvyData.name || "Unnamed divvy";
    divvyCodeDisplay.textContent = currentDivvyCode;

    showDivvyScreen();
    renderMembers();
    renderReceipts();
  } catch (err) {
    console.error(err);
    landingError.textContent = "Failed to create divvy. Try again.";
  }
}

// --------------------------------------------------
// Event listeners
// --------------------------------------------------

// Landing
joinDivvyBtn.addEventListener("click", joinDivvy);
joinCodeInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") joinDivvy();
});

createDivvyBtn.addEventListener("click", createDivvy);

// Leave divvy
leaveDivvyBtn.addEventListener("click", showLanding);

// Add member from header
addMemberHeaderBtn.addEventListener("click", () => {
  addMemberGlobal();
});

// Add receipt
addReceiptBtn.addEventListener("click", () => {
  openReceiptModal(null);
});

// Receipt modal: close
closeReceiptModalBtn.addEventListener("click", closeReceiptModal);

// Collector search
collectorSearchInput.addEventListener("input", renderCollectorOptions);
collectorAddMemberBtn.addEventListener("click", addMemberFromCollector);

// Debtors
debtorsSearchInput.addEventListener("input", renderDebtorsOptions);
debtorsAddMemberBtn.addEventListener("click", addMemberFromDebtors);

// Add expense
addExpenseBtn.addEventListener("click", addExpenseLocal);

// Publish receipt
publishReceiptBtn.addEventListener("click", publishReceipt);

// Prompt modal buttons
promptCancelBtn.addEventListener("click", () => closePrompt(null));
promptOkBtn.addEventListener("click", () =>
  closePrompt(promptInputEl.value || "")
);

// Split modal buttons
splitCancelBtn.addEventListener("click", closeSplitModal);
splitEqualBtn.addEventListener("click", performEqualSplit);
splitPercentBtn.addEventListener("click", performPercentSplit);

// Member modal close
closeMemberModalBtn.addEventListener("click", closeMemberModal);

// Edit divvy name
editDivvyNameBtn.addEventListener("click", async () => {
  if (!currentDivvyData) return;
  const currentName = currentDivvyData.name || "Unnamed divvy";
  const newName = await showPrompt({
    title: "Divvy name",
    message: "Enter a name for this divvy:",
    placeholder: "e.g. Dubai Trip, Housemates",
    initialValue: currentName
  });
  closePrompt();
  if (!newName) return;
  const trimmed = String(newName).trim();
  if (!trimmed) return;

  currentDivvyData.name = trimmed;
  divvyNameDisplay.textContent = trimmed;
  await saveDivvy(currentDivvyCode, currentDivvyData);
});

// Currency selector
currencySelectEl.addEventListener("change", async () => {
  if (!currentDivvyData) {
    currentCurrency = currencySelectEl.value;
    const flag = currencyMeta[currentCurrency]?.flag || "🇺🇸";
    currencyFlagEl.textContent = flag;
    return;
  }

  currentCurrency = currencySelectEl.value;
  const flag = currencyMeta[currentCurrency]?.flag || "🇺🇸";
  currencyFlagEl.textContent = flag;

  // Persist chosen currency on divvy
  currentDivvyData.currency = currentCurrency;
  await saveDivvy(currentDivvyCode, currentDivvyData);

  // Re-render for new symbol
  renderMembers();
  renderReceipts();
});

// --------------------------------------------------
// Initial
// --------------------------------------------------
showLanding();
