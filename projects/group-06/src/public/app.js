/**
 * SprintBoard Frontend Client Application
 * Interacts with REST API, renders dynamic capacity gauges,
 * stages proposals, and commits to data.json only upon explicit Approve.
 */

let appState = {
  members: [],
  tasks: [],
  selectedTaskIds: new Set(),
  activeProposal: null
};

// DOM Elements
const membersContainer = document.getElementById('members-container');
const tasksContainer = document.getElementById('tasks-container');
const selectAssignee = document.getElementById('select-assignee');
const btnStageProposal = document.getElementById('btn-stage-proposal');
const proposalCard = document.getElementById('proposal-card');
const propMemberName = document.getElementById('prop-member-name');
const propTaskCount = document.getElementById('prop-task-count');
const propPointsAdded = document.getElementById('prop-points-added');
const propProjectedTotal = document.getElementById('prop-projected-total');
const propTasksList = document.getElementById('prop-tasks-list');
const btnApproveProposal = document.getElementById('btn-approve-proposal');
const btnCancelProposal = document.getElementById('btn-cancel-proposal');
const toastContainer = document.getElementById('toast-container');

// Benchmark Buttons
const btnDemoCase1 = document.getElementById('btn-demo-case1');
const btnDemoCase2 = document.getElementById('btn-demo-case2');
const btnDemoCase3 = document.getElementById('btn-demo-case3');

/**
 * Fetch latest data from the backend
 */
async function loadData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Failed to fetch sprint data');
    const data = await res.json();
    appState.members = data.members;
    appState.tasks = data.tasks;
    renderMembers();
    renderTasks();
    renderAssigneeDropdown();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

/**
 * Render Team Member Capacity Cards
 */
function renderMembers() {
  membersContainer.innerHTML = '';
  for (const member of appState.members) {
    const percentage = Math.min((member.currentPoints / member.maxPoints) * 100, 100);
    let gaugeClass = 'normal';
    if (member.currentPoints >= 6 && member.currentPoints <= 8) {
      gaugeClass = 'warning';
    } else if (member.currentPoints > 8) {
      gaugeClass = 'overflow';
    }

    const card = document.createElement('div');
    card.className = 'member-card';
    card.innerHTML = `
      <div class="member-top">
        <div class="member-info">
          <div class="member-avatar">${member.name.charAt(0)}</div>
          <div>
            <div class="member-name">${member.name}</div>
          </div>
        </div>
        <div class="capacity-metric">
          <strong>${member.currentPoints}</strong> / ${member.maxPoints} pts
        </div>
      </div>

      <div class="gauge-track">
        <div class="gauge-fill ${gaugeClass}" style="width: ${percentage}%"></div>
      </div>

      <div class="member-footer">
        <span>${member.remainingPoints} points remaining</span>
        <span class="badge ${member.currentPoints === 8 ? 'badge-warning' : 'badge-subtle'}">
          ${member.currentPoints === 8 ? 'AT MAX CAPACITY' : `${member.maxPoints - member.currentPoints} pts free`}
        </span>
      </div>
    `;
    membersContainer.appendChild(card);
  }
}

/**
 * Populate Assignee Dropdown
 */
function renderAssigneeDropdown() {
  const currentVal = selectAssignee.value;
  selectAssignee.innerHTML = '<option value="">-- Choose Member --</option>';
  for (const member of appState.members) {
    const opt = document.createElement('option');
    opt.value = member.name;
    opt.textContent = `${member.name} (${member.currentPoints}/8 pts)`;
    selectAssignee.appendChild(opt);
  }
  if (currentVal) selectAssignee.value = currentVal;
}

/**
 * Render Backlog Tasks List
 */
function renderTasks() {
  tasksContainer.innerHTML = '';
  for (const task of appState.tasks) {
    const isAssigned = task.status === 'assigned';
    const isSelected = appState.selectedTaskIds.has(task.id);

    const item = document.createElement('div');
    item.className = `task-item ${isAssigned ? 'assigned' : ''} ${isSelected ? 'selected' : ''}`;
    item.dataset.id = task.id;

    item.innerHTML = `
      <div class="task-left">
        <input 
          type="checkbox" 
          class="task-checkbox" 
          id="chk-${task.id}" 
          ${isAssigned ? 'disabled' : ''} 
          ${isSelected ? 'checked' : ''}
        />
        <label for="chk-${task.id}" class="task-title">${task.title}</label>
      </div>

      <div class="task-right">
        <span class="badge badge-points">${task.points} pts</span>
        <span class="badge badge-status ${isAssigned ? 'assigned' : ''}">
          ${isAssigned ? `Assigned (${task.assignee})` : 'Backlog'}
        </span>
      </div>
    `;

    if (!isAssigned) {
      item.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const chk = item.querySelector('.task-checkbox');
          chk.checked = !chk.checked;
          toggleTaskSelection(task.id, chk.checked);
        }
      });

      const checkbox = item.querySelector('.task-checkbox');
      checkbox.addEventListener('change', (e) => {
        toggleTaskSelection(task.id, e.target.checked);
      });
    }

    tasksContainer.appendChild(item);
  }

  updateStageButtonState();
}

function toggleTaskSelection(taskId, isChecked) {
  if (isChecked) {
    appState.selectedTaskIds.add(taskId);
  } else {
    appState.selectedTaskIds.delete(taskId);
  }
  renderTasks();
}

function updateStageButtonState() {
  const hasSelectedTasks = appState.selectedTaskIds.size > 0;
  const hasMember = selectAssignee.value !== '';
  btnStageProposal.disabled = !(hasSelectedTasks && hasMember);
}

selectAssignee.addEventListener('change', updateStageButtonState);

/**
 * Stage an Assignment Proposal
 */
btnStageProposal.addEventListener('click', async () => {
  const memberName = selectAssignee.value;
  const taskIds = Array.from(appState.selectedTaskIds);

  if (!memberName || taskIds.length === 0) return;

  try {
    const res = await fetch('/api/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberName, taskIds })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(`❌ ${data.message || 'Capacity violation'}`, 'error');
      return;
    }

    // Success staging proposal
    appState.activeProposal = {
      memberName,
      taskIds,
      proposal: data.proposal,
      capacityCheck: data.capacityCheck
    };

    renderActiveProposal();
    showToast(`⏳ Proposal staged for ${memberName}. Click Approve to commit to data.json.`, 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
});

/**
 * Render Active Proposal Card
 */
function renderActiveProposal() {
  if (!appState.activeProposal) {
    proposalCard.classList.add('hidden');
    return;
  }

  const { memberName, proposal, capacityCheck } = appState.activeProposal;

  propMemberName.textContent = memberName;
  propTaskCount.textContent = `${proposal.taskIds.length} task(s)`;
  propPointsAdded.textContent = `+${proposal.addedPoints} pts`;
  propProjectedTotal.textContent = `${proposal.projectedTotal} / 8 pts`;

  propTasksList.innerHTML = '';
  for (let i = 0; i < proposal.taskIds.length; i++) {
    const id = proposal.taskIds[i];
    const title = proposal.taskTitles[i];
    const taskObj = appState.tasks.find(t => t.id === id);
    const pts = taskObj ? taskObj.points : '';

    const row = document.createElement('div');
    row.className = 'proposal-task-item';
    row.innerHTML = `
      <span>${title}</span>
      <strong style="color: #a5b4fc;">${pts} pts</strong>
    `;
    propTasksList.appendChild(row);
  }

  proposalCard.classList.remove('hidden');
  proposalCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Explicit Human Approval: Approve & Save to data.json
 */
btnApproveProposal.addEventListener('click', async () => {
  if (!appState.activeProposal) return;

  const { memberName, taskIds } = appState.activeProposal;

  btnApproveProposal.disabled = true;
  btnApproveProposal.innerHTML = 'Saving to data.json...';

  try {
    const res = await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberName, taskIds })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(`❌ Cannot save: ${data.message}`, 'error');
      return;
    }

    showToast(`🎉 Approved! Saved to data.json. ${memberName} now has ${data.member.currentPoints}/8 pts.`, 'success');
    appState.activeProposal = null;
    appState.selectedTaskIds.clear();
    proposalCard.classList.add('hidden');
    await loadData();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnApproveProposal.disabled = false;
    btnApproveProposal.innerHTML = '<span class="btn-icon">✓</span> Approve & Save to data.json';
  }
});

btnCancelProposal.addEventListener('click', () => {
  appState.activeProposal = null;
  proposalCard.classList.add('hidden');
  showToast('Proposal dismissed.', 'info');
});

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span>
    <span class="toast-msg">${message}</span>
  `;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/**
 * Quick Scenario Benchmark Buttons
 */
// Case 1: Normal (Assign Login & Payment -> exactly 8 pts)
btnDemoCase1.addEventListener('click', () => {
  appState.selectedTaskIds.clear();
  appState.selectedTaskIds.add('task-1'); // Login (3 pts)
  appState.selectedTaskIds.add('task-2'); // Payment (5 pts)
  selectAssignee.value = 'Sarah';
  renderTasks();
  updateStageButtonState();
  showToast('Scenario 1 loaded: Login (3pts) + Payment (5pts) for Sarah. Click "Stage Proposal" to test.', 'info');
});

// Case 2: Boundary (8 pts vs 9 pts)
btnDemoCase2.addEventListener('click', async () => {
  showToast('Testing Boundary: Checking 8 pts (allowed) vs 9 pts (rejected)...', 'info');
  // Check 8 pts
  const check8 = await fetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberName: 'Rafi', taskIds: ['task-1', 'task-2'] }) // 3 + 5 = 8 pts
  }).then(r => r.json());

  // Check 9 pts
  const check9 = await fetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberName: 'Rafi', taskIds: ['task-1', 'task-2', 'task-6'] }) // 3 + 5 + 1 = 9 pts
  }).then(r => r.json());

  if (check8.allowed && !check9.allowed && check9.code === 'ERR_MAX_POINTS_EXCEEDED') {
    showToast(`✅ Boundary holds! 8 pts: Allowed. 9 pts: Refused with code "${check9.code}".`, 'success');
  } else {
    showToast(`❌ Boundary test failed: 8pts=${check8.allowed}, 9pts=${check9.allowed}`, 'error');
  }
});

// Case 3: Overload / Rule Break (Assign all 6 tasks to Rafi)
btnDemoCase3.addEventListener('click', async () => {
  const allTaskIds = appState.tasks.map(t => t.id);
  const res = await fetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberName: 'Rafi', taskIds: allTaskIds })
  });

  const data = await res.json();
  if (!res.ok && data.code === 'ERR_MAX_POINTS_EXCEEDED') {
    showToast(`🛡️ Case 3 Refused! "${data.code}": ${data.message}. Suggestion: Spread tasks across teammates.`, 'error');
  }
});

// Initial boot
loadData();
