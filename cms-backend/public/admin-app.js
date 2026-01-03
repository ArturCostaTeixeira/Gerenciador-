/**
 * CMS Admin Dashboard - Frontend Application
 */

const API_BASE = '/api';

// State
let token = localStorage.getItem('admin_token');
let drivers = [];
let clients = [];
let allFreights = [];
let allAbastecimentos = [];
let allOutrosInsumos = [];
let unassignedComprovantes = []; // Pool of unassigned comprovantes de descarga
let unassignedComprovantesCarga = []; // Pool of unassigned comprovantes de carga
let unassignedComprovantesAbast = []; // Pool of unassigned comprovantes de abastecimento
let unpaidTotals = []; // Unpaid totals per driver
let pollingInterval = null; // For real-time updates
let currentDriverForPayment = null; // Currently selected driver for payment view
let driverPayments = []; // Payments for current driver

const pagination = {
    freights: { page: 1, limit: 10 },
    abastecimentos: { page: 1, limit: 10 },
    outrosInsumos: { page: 1, limit: 10 }
};

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const loginForm = document.getElementById('loginForm');
const authError = document.getElementById('authError');
const logoutBtn = document.getElementById('logoutBtn');

// ========================================
// Utility Functions
// ========================================

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value || 0);
}

async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function showError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
    setTimeout(() => authError.classList.add('hidden'), 5000);
}

function setLoading(button, loading) {
    const span = button.querySelector('span:first-child');
    const loader = button.querySelector('.btn-loader');
    if (loading) {
        span.style.opacity = '0';
        loader?.classList.remove('hidden');
        button.disabled = true;
    } else {
        span.style.opacity = '1';
        loader?.classList.add('hidden');
        button.disabled = false;
    }
}

// ========================================
// Authentication
// ========================================

function showPage(page) {
    loginPage.classList.remove('active');
    dashboardPage.classList.remove('active');
    loginPage.classList.add('hidden');
    dashboardPage.classList.add('hidden');
    page.classList.remove('hidden');
    page.classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const button = loginForm.querySelector('button');
    const username = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoading(button, true);
    try {
        const data = await apiRequest('/auth/admin/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        token = data.token;
        localStorage.setItem('admin_token', token);
        await loadDashboard();
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

function logout() {
    token = null;
    localStorage.removeItem('admin_token');
    stopPolling();
    showPage(loginPage);
    loginForm.reset();
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
    try {
        const verify = await apiRequest('/auth/verify');
        if (!verify.valid || verify.type !== 'admin') throw new Error('Invalid session');

        showPage(dashboardPage);
        await Promise.all([loadDrivers(), loadClients()]);
        await loadFreights();
        await loadAbastecimentos();
        await loadOutrosInsumos();
        await loadUnassignedComprovantes();
        await loadUnassignedComprovantesCarga();
        await loadUnassignedComprovantesAbast();
        await loadUnpaidTotals();

        // Start polling for real-time updates (every 5 seconds)
        startPolling();
    } catch (error) {
        console.error('Dashboard error:', error);
        logout();
    }
}

// Polling for real-time updates
function startPolling() {
    stopPolling(); // Clear any existing interval
    pollingInterval = setInterval(async () => {
        try {
            await Promise.all([
                loadFreights(),
                loadAbastecimentos(),
                loadUnassignedComprovantes(),
                loadUnassignedComprovantesCarga(),
                loadUnassignedComprovantesAbast(),
                loadUnpaidTotals()
            ]);
            renderDriversTable(); // Re-render to update unpaid totals
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 5000); // Poll every 5 seconds
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

async function loadUnassignedComprovantes() {
    try {
        unassignedComprovantes = await apiRequest('/admin/comprovantes-descarga');
    } catch (error) {
        console.error('Load comprovantes error:', error);
    }
}

async function loadUnassignedComprovantesCarga() {
    try {
        unassignedComprovantesCarga = await apiRequest('/admin/comprovantes-carga');
    } catch (error) {
        console.error('Load comprovantes carga error:', error);
    }
}

async function loadUnassignedComprovantesAbast() {
    try {
        unassignedComprovantesAbast = await apiRequest('/admin/comprovantes-abastecimento');
    } catch (error) {
        console.error('Load comprovantes abastecimento error:', error);
    }
}

async function loadUnpaidTotals() {
    try {
        unpaidTotals = await apiRequest('/admin/freights/unpaid-totals');
    } catch (error) {
        console.error('Load unpaid totals error:', error);
    }
}

// ========================================
// Navigation
// ========================================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.content-page');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            pages.forEach(p => {
                p.classList.remove('active');
                p.classList.add('hidden');
            });
            const targetPage = document.getElementById(`${item.dataset.page}Page`);
            targetPage.classList.remove('hidden');
            targetPage.classList.add('active');
        });
    });
}

// ========================================
// Drivers
// ========================================

async function loadDrivers() {
    try {
        drivers = await apiRequest('/admin/drivers');
        renderDriversTable();
        updateDriverFilters();
    } catch (error) {
        console.error('Load drivers error:', error);
    }
}

function renderDriversTable(filter = '') {
    const tbody = document.getElementById('driversTableBody');
    const filtered = filter
        ? drivers.filter(d => d.name?.toLowerCase().includes(filter.toLowerCase()))
        : drivers;

    // Helper function to format CPF
    const formatCPF = (cpf) => {
        if (!cpf) return '-';
        const clean = cpf.replace(/\D/g, '');
        if (clean.length !== 11) return cpf;
        return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    };

    // Helper function to format phone
    const formatPhone = (phone) => {
        if (!phone) return '-';
        const clean = phone.replace(/\D/g, '');
        if (clean.length === 11) {
            return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (clean.length === 10) {
            return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        }
        return phone;
    };

    tbody.innerHTML = filtered.length === 0
        ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nenhum motorista encontrado</td></tr>'
        : filtered.map(d => {
            // Find unpaid total for this driver
            const unpaidEntry = unpaidTotals.find(u => u.driver_id === d.id);
            const unpaidAmount = unpaidEntry ? unpaidEntry.unpaid_total : 0;
            const unpaidClass = unpaidAmount > 0 ? 'value-negative' : 'text-muted';

            return `
            <tr>
                <td>${d.name}</td>
                <td>${formatCPF(d.cpf)}</td>
                <td>${formatPhone(d.phone)}</td>
                <td>${d.plate}</td>
                <td class="${unpaidClass}">${unpaidAmount > 0 ? formatCurrency(unpaidAmount) : '-'}</td>
                <td><span class="${d.active ? 'status-active' : 'status-inactive'}">${d.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openDriverPayments(${d.id})">💰 Pagamentos</button>
                    <button class="btn btn-sm btn-outline" onclick="editDriver(${d.id})">Editar</button>
                </td>
            </tr>
        `}).join('');
}

function updateDriverFilters() {
    const freightSelect = document.getElementById('freightDriverFilter');
    const abastSelect = document.getElementById('abastDriverFilter');
    const outrosSelect = document.getElementById('outrosDriverFilter');
    const clientSelects = [
        document.getElementById('freightClientFilter'),
        document.getElementById('abastClientFilter'),
        document.getElementById('outrosClientFilter')
    ];

    const driverOptions = '<option value="">Todos os motoristas</option>' +
        drivers.map(d => `<option value="${d.id}">${d.name} (${d.plate})</option>`).join('');
    freightSelect.innerHTML = driverOptions;
    abastSelect.innerHTML = driverOptions;
    outrosSelect.innerHTML = driverOptions;

    const uniqueClients = [...new Set(drivers.filter(d => d.client).map(d => d.client))];
    const clientOptions = '<option value="">Todos os clientes</option>' +
        uniqueClients.map(c => `<option value="${c}">${c}</option>`).join('');
    clientSelects.forEach(s => s.innerHTML = clientOptions);
}

window.editDriver = async function (id) {
    const driver = drivers.find(d => d.id === id);
    if (!driver) return;

    const clientOptions = '<option value="">Selecione um cliente (Opcional)</option>' +
        clients.map(c => `<option value="${c.client}" ${driver.client === c.client ? 'selected' : ''}>${c.client}</option>`).join('');

    showModal('Editar Motorista', `
        <input type="hidden" id="editDriverId" value="${id}">
        <div class="input-group">
            <label>Nome</label>
            <input type="text" id="editDriverName" value="${driver.name}" required>
        </div>
        <div class="input-group">
            <label>Placa</label>
            <input type="text" id="editDriverPlate" value="${driver.plate}" required>
        </div>
        <div class="input-group">
            <label>Cliente</label>
            <select id="editDriverClient">
                ${clientOptions}
            </select>
        </div>
        <div class="input-group">
            <label>Ativo</label>
            <select id="editDriverActive">
                <option value="true" ${driver.active ? 'selected' : ''}>Sim</option>
                <option value="false" ${!driver.active ? 'selected' : ''}>Não</option>
            </select>
        </div>
    `, async () => {
        await apiRequest(`/admin/drivers/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: document.getElementById('editDriverName').value,
                plate: document.getElementById('editDriverPlate').value,
                client: document.getElementById('editDriverClient').value || null,
                active: document.getElementById('editDriverActive').value === 'true'
            })
        });
        await loadDrivers();
        await loadClients();
    });
};

function showAddDriverModal() {
    const clientOptions = '<option value="">Selecione um cliente (Opcional)</option>' +
        clients.map(c => `<option value="${c.client}">${c.client}</option>`).join('');

    showModal('Novo Motorista', `
        <div class="input-group">
            <label>Nome</label>
            <input type="text" id="newDriverName" required>
        </div>
        <div class="input-group">
            <label>Placa</label>
            <input type="text" id="newDriverPlate" placeholder="ABC-1234" required>
        </div>
        <div class="input-group">
            <label>Cliente</label>
            <select id="newDriverClient">
                ${clientOptions}
            </select>
        </div>
    `, async () => {
        await apiRequest('/admin/drivers', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('newDriverName').value,
                plate: document.getElementById('newDriverPlate').value,
                client: document.getElementById('newDriverClient').value || null
            })
        });
        await loadDrivers();
        await loadClients();
    });
}

// ========================================
// Freights
// ========================================

async function loadFreights() {
    try {
        allFreights = await apiRequest('/admin/freights');
        renderFreightsTable();
    } catch (error) {
        console.error('Load freights error:', error);
    }
}

function renderFreightsTable() {
    const tbody = document.getElementById('freightsTableBody');
    const driverFilter = document.getElementById('freightDriverFilter').value;
    const clientFilter = document.getElementById('freightClientFilter').value;
    const dateFilter = document.getElementById('freightDateFilter').value;

    let filtered = allFreights;
    if (driverFilter) filtered = filtered.filter(f => f.driver_id == driverFilter);
    if (clientFilter) filtered = filtered.filter(f => f.client === clientFilter);
    if (dateFilter) filtered = filtered.filter(f => f.date === dateFilter);

    // Sort: pending first, then by date desc
    filtered.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.date) - new Date(a.date);
    });

    // Pagination Logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pagination.freights.limit) || 1;

    if (pagination.freights.page > totalPages) pagination.freights.page = totalPages;
    if (pagination.freights.page < 1) pagination.freights.page = 1;

    const start = (pagination.freights.page - 1) * pagination.freights.limit;
    const end = start + pagination.freights.limit;
    const pageItems = filtered.slice(start, end);

    // Update UI Controls
    document.getElementById('freightsPageInfo').textContent = `Página ${pagination.freights.page} de ${totalPages}`;
    document.getElementById('freightsPrevBtn').disabled = pagination.freights.page === 1;
    document.getElementById('freightsNextBtn').disabled = pagination.freights.page === totalPages;

    tbody.innerHTML = pageItems.length === 0
        ? '<tr><td colspan="11" style="text-align:center;color:var(--text-muted)">Nenhum frete encontrado</td></tr>'
        : pageItems.map(f => {
            const driver = drivers.find(d => d.id === f.driver_id);
            const isPending = f.status === 'pending';

            // Carga dropdown (similar to descarga)
            let cargaCell;
            if (f.comprovante_carga) {
                // Already has a comprovante assigned - show view link and option to change
                cargaCell = `
                    <div class="descarga-dropdown">
                        <a href="${f.comprovante_carga}" target="_blank" class="btn btn-sm btn-outline">📷</a>
                        <button class="btn btn-sm btn-outline" onclick="showCargaDropdown(${f.id}, event)">⚙️</button>
                    </div>
                `;
            } else {
                // No comprovante - show dropdown to select one
                cargaCell = `
                    <select class="descarga-select" onchange="assignCarga(${f.id}, this.value)" data-freight-id="${f.id}">
                        <option value="">Selecionar...</option>
                        ${unassignedComprovantesCarga.map(c =>
                    `<option value="${c.id}">${c.display_name}</option>`
                ).join('')}
                    </select>
                `;
            }

            // Descarga dropdown
            let descargaCell;
            if (f.comprovante_descarga) {
                // Already has a comprovante assigned - show view link and option to change
                descargaCell = `
                    <div class="descarga-dropdown">
                        <a href="${f.comprovante_descarga}" target="_blank" class="btn btn-sm btn-outline">📷</a>
                        <button class="btn btn-sm btn-outline" onclick="showDescargaDropdown(${f.id}, event)">⚙️</button>
                    </div>
                `;
            } else {
                // No comprovante - show dropdown to select one
                descargaCell = `
                    <select class="descarga-select" onchange="assignDescarga(${f.id}, this.value)" data-freight-id="${f.id}">
                        <option value="">Selecionar...</option>
                        ${unassignedComprovantes.map(c =>
                    `<option value="${c.id}">${c.display_name}</option>`
                ).join('')}
                    </select>
                `;
            }

            // Paid checkbox (only for complete freights with value)
            const isPaid = f.paid === 1 || f.paid === true;
            const paidCell = f.status === 'complete' && f.total_value > 0
                ? `<input type="checkbox" class="paid-checkbox" ${isPaid ? 'checked' : ''} onchange="togglePaid(${f.id})">`
                : '<span class="text-muted">-</span>';

            const actionBtn = isPending
                ? `<button class="btn btn-sm btn-primary" onclick="editFreight(${f.id})">Completar</button>`
                : `<button class="btn btn-sm btn-outline" onclick="editFreight(${f.id})">Editar</button>`;
            return `
                <tr class="${isPending ? 'row-pending' : ''}">
                    <td>${formatDate(f.date)}</td>
                    <td>${f.driver_name || driver?.name || '-'}</td>
                    <td>${f.client || '<span class="text-muted">-</span>'}</td>
                    <td>${f.km > 0 ? formatNumber(f.km) + ' km' : '<span class="text-muted">-</span>'}</td>
                    <td>${f.tons > 0 ? formatNumber(f.tons, 2) + 'T' : '<span class="text-muted">-</span>'}</td>
                    <td>${f.price_per_km_ton > 0 ? formatCurrency(f.price_per_km_ton) : '<span class="text-muted">-</span>'}</td>
                    <td class="${f.total_value > 0 ? 'value-positive' : ''}">${f.total_value > 0 ? formatCurrency(f.total_value) : '<span class="text-muted">-</span>'}</td>
                    <td>${cargaCell}</td>
                    <td>${descargaCell}</td>
                    <td>${paidCell}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        }).join('');
}

// Toggle paid status for a freight
window.togglePaid = async function (freightId) {
    try {
        await apiRequest(`/admin/freights/${freightId}/toggle-paid`, {
            method: 'PATCH'
        });

        // Reload data to update totals
        await Promise.all([loadFreights(), loadUnpaidTotals()]);
        renderDriversTable(); // Re-render drivers to update unpaid totals
    } catch (error) {
        console.error('Toggle paid error:', error);
        alert('Erro ao atualizar status de pagamento: ' + error.message);
    }
};

// Assign comprovante descarga to freight
window.assignDescarga = async function (freightId, comprovanteId) {
    if (!comprovanteId) return;

    try {
        await apiRequest(`/admin/comprovantes-descarga/${comprovanteId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ freight_id: freightId })
        });

        // Reload data
        await Promise.all([loadFreights(), loadUnassignedComprovantes()]);
    } catch (error) {
        console.error('Assign descarga error:', error);
        alert('Erro ao atribuir comprovante: ' + error.message);
    }
};

// Show dropdown to change descarga
window.showDescargaDropdown = function (freightId, event) {
    event.preventDefault();
    event.stopPropagation();

    // Remove any existing dropdown
    const existing = document.querySelector('.descarga-popup');
    if (existing) existing.remove();

    // Create popup dropdown
    const popup = document.createElement('div');
    popup.className = 'descarga-popup glass';
    popup.innerHTML = `
        <div class="descarga-popup-content">
            <p style="margin-bottom: 0.5rem; font-weight: 600;">Alterar Comprovante</p>
            <select id="descargaPopupSelect" class="filter-input" style="margin-bottom: 0.5rem;">
                <option value="">Selecionar novo...</option>
                ${unassignedComprovantes.map(c =>
        `<option value="${c.id}">${c.display_name}</option>`
    ).join('')}
            </select>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-primary" onclick="applyDescargaChange(${freightId})">Aplicar</button>
                <button class="btn btn-sm btn-outline" onclick="unassignDescarga(${freightId})">Remover</button>
                <button class="btn btn-sm btn-outline" onclick="closeDescargaPopup()">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Position near the button
    const rect = event.target.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 5) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.zIndex = '1000';
};

window.applyDescargaChange = async function (freightId) {
    const select = document.getElementById('descargaPopupSelect');
    const comprovanteId = select.value;

    if (comprovanteId) {
        await assignDescarga(freightId, comprovanteId);
    }
    closeDescargaPopup();
};

window.unassignDescarga = async function (freightId) {
    try {
        await apiRequest(`/admin/freights/${freightId}/unassign-descarga`, {
            method: 'POST'
        });

        await Promise.all([loadFreights(), loadUnassignedComprovantes()]);
        closeDescargaPopup();
    } catch (error) {
        console.error('Unassign descarga error:', error);
        alert('Erro ao remover comprovante: ' + error.message);
    }
};

window.closeDescargaPopup = function () {
    const popup = document.querySelector('.descarga-popup');
    if (popup) popup.remove();
};

// ============================================
// Carga Comprovante Functions
// ============================================

// Assign comprovante carga to freight
window.assignCarga = async function (freightId, comprovanteId) {
    if (!comprovanteId) return;

    try {
        await apiRequest(`/admin/comprovantes-carga/${comprovanteId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ freight_id: freightId })
        });

        // Reload data
        await Promise.all([loadFreights(), loadUnassignedComprovantesCarga()]);
    } catch (error) {
        console.error('Assign carga error:', error);
        alert('Erro ao atribuir comprovante: ' + error.message);
    }
};

// Show dropdown to change carga
window.showCargaDropdown = function (freightId, event) {
    event.preventDefault();
    event.stopPropagation();

    // Remove any existing dropdown
    const existing = document.querySelector('.descarga-popup');
    if (existing) existing.remove();

    // Create popup dropdown
    const popup = document.createElement('div');
    popup.className = 'descarga-popup glass';
    popup.innerHTML = `
        <div class="descarga-popup-content">
            <p style="margin-bottom: 0.5rem; font-weight: 600;">Alterar Comprovante de Carga</p>
            <select id="cargaPopupSelect" class="filter-input" style="margin-bottom: 0.5rem;">
                <option value="">Selecionar novo...</option>
                ${unassignedComprovantesCarga.map(c =>
        `<option value="${c.id}">${c.display_name}</option>`
    ).join('')}
            </select>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-primary" onclick="applyCargaChange(${freightId})">Aplicar</button>
                <button class="btn btn-sm btn-outline" onclick="unassignCarga(${freightId})">Remover</button>
                <button class="btn btn-sm btn-outline" onclick="closeDescargaPopup()">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Position near the button
    const rect = event.target.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 5) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.zIndex = '1000';
};

window.applyCargaChange = async function (freightId) {
    const select = document.getElementById('cargaPopupSelect');
    const comprovanteId = select.value;

    if (comprovanteId) {
        await assignCarga(freightId, comprovanteId);
    }
    closeDescargaPopup();
};

window.unassignCarga = async function (freightId) {
    try {
        await apiRequest(`/admin/freights/${freightId}/unassign-carga`, {
            method: 'POST'
        });

        await Promise.all([loadFreights(), loadUnassignedComprovantesCarga()]);
        closeDescargaPopup();
    } catch (error) {
        console.error('Unassign carga error:', error);
        alert('Erro ao remover comprovante: ' + error.message);
    }
};

window.editFreight = async function (id) {
    const freight = allFreights.find(f => f.id === id);
    if (!freight) return;

    const uniqueClients = [...new Set(drivers.filter(d => d.client).map(d => d.client))];
    const allClients = [...new Set([
        ...clients.map(c => c.client),
        ...uniqueClients
    ])];
    const clientOptions = '<option value="">Selecione um cliente</option>' +
        allClients.map(c => `<option value="${c}" ${freight.client === c ? 'selected' : ''}>${c}</option>`).join('');

    const isPending = freight.status === 'pending';
    const title = isPending ? 'Completar Frete' : 'Editar Frete';

    showModal(title, `
        <input type="hidden" id="editFreightId" value="${id}">
        <div class="input-group">
            <label>Motorista</label>
            <input type="text" value="${freight.driver_name || '-'}" disabled>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="text" value="${formatDate(freight.date)}" disabled>
        </div>
        <div class="input-group">
            <label>Cliente</label>
            <select id="editFreightClient" required>${clientOptions}</select>
        </div>
        <div class="input-group">
            <label>KM</label>
            <input type="number" id="editFreightKm" value="${freight.km || ''}" required>
        </div>
        <div class="input-group">
            <label>Toneladas</label>
            <input type="number" step="0.01" id="editFreightTons" value="${freight.tons || ''}" required>
        </div>
        <div class="input-group">
            <label>Preço por km/ton</label>
            <input type="number" step="0.01" id="editFreightPrice" value="${freight.price_per_km_ton || ''}" required>
        </div>
        <div class="input-group">
            <label>Comprovante de Carga ${freight.comprovante_carga ? '(já anexado - enviar novo substitui)' : ''}</label>
            <input type="file" id="editFreightCarga" class="file-input" accept="image/png, image/jpeg">
            ${freight.comprovante_carga ? `<a href="${freight.comprovante_carga}" target="_blank" style="color:var(--accent-primary);font-size:0.85rem;margin-top:0.25rem;">📷 Ver atual</a>` : ''}
        </div>
        <div class="input-group">
            <label>Comprovante de Descarga ${freight.comprovante_descarga ? '(já anexado - enviar novo substitui)' : ''}</label>
            <input type="file" id="editFreightDescarga" class="file-input" accept="image/png, image/jpeg">
            ${freight.comprovante_descarga ? `<a href="${freight.comprovante_descarga}" target="_blank" style="color:var(--accent-primary);font-size:0.85rem;margin-top:0.25rem;">📷 Ver atual</a>` : ''}
        </div>
    `, async () => {
        const formData = new FormData();
        formData.append('client', document.getElementById('editFreightClient').value);
        formData.append('km', parseFloat(document.getElementById('editFreightKm').value));
        formData.append('tons', parseFloat(document.getElementById('editFreightTons').value));
        formData.append('price_per_km_ton', parseFloat(document.getElementById('editFreightPrice').value));

        const cargaFile = document.getElementById('editFreightCarga').files[0];
        const descargaFile = document.getElementById('editFreightDescarga').files[0];

        if (cargaFile) formData.append('comprovante_carga', cargaFile);
        if (descargaFile) formData.append('comprovante_descarga', descargaFile);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/admin/freights/${id}`, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update freight');
        }

        await loadFreights();
        await loadClients();
    });
};

function showAddFreightModal() {
    const driverOptions = drivers.map(d => `<option value="${d.id}">${d.name} (${d.plate})</option>`).join('');
    const uniqueClients = [...new Set(drivers.filter(d => d.client).map(d => d.client))];
    const clientOptions = '<option value="">Selecione um cliente</option>' +
        clients.map(c => `<option value="${c.client}">${c.client}</option>`).join('') +
        uniqueClients.filter(c => !clients.some(cl => cl.client === c)).map(c => `<option value="${c}">${c}</option>`).join('');

    showModal('Novo Frete', `
        <div class="input-group">
            <label>Motorista</label>
            <select id="newFreightDriver" required>${driverOptions}</select>
        </div>
        <div class="input-group">
            <label>Cliente</label>
            <select id="newFreightClient" required>${clientOptions}</select>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="date" id="newFreightDate" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <div class="input-group">
            <label>KM</label>
            <input type="number" id="newFreightKm" required>
        </div>
        <div class="input-group">
            <label>Toneladas</label>
            <input type="number" step="0.01" id="newFreightTons" required>
        </div>
        <div class="input-group">
            <label>Preço por km/ton</label>
            <input type="number" step="0.01" id="newFreightPrice" value="0.50" required>
        </div>
        <div class="input-group">
            <label>Comprovante de Carga (Foto)</label>
            <input type="file" id="newFreightComprovanteCarga" accept=".png,.jpg,.jpeg" class="file-input">
        </div>
        <div class="input-group">
            <label>Comprovante de Descarga (Foto)</label>
            <input type="file" id="newFreightComprovanteDescarga" accept=".png,.jpg,.jpeg" class="file-input">
        </div>
    `, async () => {
        const formData = new FormData();
        formData.append('driver_id', document.getElementById('newFreightDriver').value);
        formData.append('client', document.getElementById('newFreightClient').value);
        formData.append('date', document.getElementById('newFreightDate').value);
        formData.append('km', document.getElementById('newFreightKm').value);
        formData.append('tons', document.getElementById('newFreightTons').value);
        formData.append('price_per_km_ton', document.getElementById('newFreightPrice').value);

        const cargaFile = document.getElementById('newFreightComprovanteCarga').files[0];
        const descargaFile = document.getElementById('newFreightComprovanteDescarga').files[0];

        if (cargaFile) {
            formData.append('comprovante_carga', cargaFile);
        }
        if (descargaFile) {
            formData.append('comprovante_descarga', descargaFile);
        }

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/admin/freights`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create freight');
        }

        await loadFreights();
        await loadClients();
    });
}

// ========================================
// Abastecimentos
// ========================================

async function loadAbastecimentos() {
    try {
        allAbastecimentos = await apiRequest('/admin/abastecimentos');
        renderAbastecimentosTable();
    } catch (error) {
        console.error('Load abastecimentos error:', error);
    }
}

function renderAbastecimentosTable() {
    const tbody = document.getElementById('abastecimentosTableBody');
    const driverFilter = document.getElementById('abastDriverFilter').value;
    const clientFilter = document.getElementById('abastClientFilter').value;
    const dateFilter = document.getElementById('abastDateFilter').value;

    let filtered = allAbastecimentos;
    if (driverFilter) filtered = filtered.filter(a => a.driver_id == driverFilter);
    if (clientFilter) {
        const driverIds = drivers.filter(d => d.client === clientFilter).map(d => d.id);
        filtered = filtered.filter(a => driverIds.includes(a.driver_id));
    }
    if (dateFilter) filtered = filtered.filter(a => a.date === dateFilter);

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination Logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pagination.abastecimentos.limit) || 1;

    if (pagination.abastecimentos.page > totalPages) pagination.abastecimentos.page = totalPages;
    if (pagination.abastecimentos.page < 1) pagination.abastecimentos.page = 1;

    const start = (pagination.abastecimentos.page - 1) * pagination.abastecimentos.limit;
    const end = start + pagination.abastecimentos.limit;
    const pageItems = filtered.slice(start, end);

    // Update UI Controls
    document.getElementById('abastecimentosPageInfo').textContent = `Página ${pagination.abastecimentos.page} de ${totalPages}`;
    document.getElementById('abastecimentosPrevBtn').disabled = pagination.abastecimentos.page === 1;
    document.getElementById('abastecimentosNextBtn').disabled = pagination.abastecimentos.page === totalPages;

    tbody.innerHTML = pageItems.length === 0
        ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Nenhum abastecimento encontrado</td></tr>'
        : pageItems.map(a => {
            const driver = drivers.find(d => d.id === a.driver_id);
            const isPending = a.status === 'pending';

            // Comprovante dropdown (similar to descarga)
            let comprovanteCell;
            if (a.comprovante_abastecimento) {
                // Already has a comprovante assigned - show view link and option to change
                comprovanteCell = `
                    <div class="descarga-dropdown">
                        <a href="${a.comprovante_abastecimento}" target="_blank" class="btn btn-sm btn-outline">📷</a>
                        <button class="btn btn-sm btn-outline" onclick="showAbastComprovanteDropdown(${a.id}, event)">⚙️</button>
                    </div>
                `;
            } else {
                // No comprovante - show dropdown to select one
                comprovanteCell = `
                    <select class="descarga-select" onchange="assignAbastComprovante(${a.id}, this.value)" data-abast-id="${a.id}">
                        <option value="">Selecionar...</option>
                        ${unassignedComprovantesAbast.map(c =>
                    `<option value="${c.id}">${c.display_name}</option>`
                ).join('')}
                    </select>
                `;
            }

            // Action button - Completar for pending, Editar for complete
            const actionBtn = isPending
                ? `<button class="btn btn-sm btn-primary" onclick="editAbastecimento(${a.id})">Completar</button>`
                : `<button class="btn btn-sm btn-outline" onclick="editAbastecimento(${a.id})">Editar</button>`;

            return `
                <tr class="${isPending ? 'row-pending' : ''}">
                    <td>${formatDate(a.date)}</td>
                    <td>${a.driver_name || driver?.name || '-'}</td>
                    <td>${a.client || driver?.client || '-'}</td>
                    <td>${isPending ? '<span class="text-muted">-</span>' : formatNumber(a.quantity) + ' L'}</td>
                    <td>${isPending ? '<span class="text-muted">-</span>' : formatCurrency(a.price_per_liter)}</td>
                    <td class="${isPending ? '' : 'value-negative'}">${isPending ? '<span class="text-muted">Pendente</span>' : '-' + formatCurrency(a.total_value)}</td>
                    <td>${comprovanteCell}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        }).join('');
}

// Assign comprovante abastecimento to an abastecimento
window.assignAbastComprovante = async function (abastecimentoId, comprovanteId) {
    if (!comprovanteId) return;

    try {
        await apiRequest(`/admin/comprovantes-abastecimento/${comprovanteId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ abastecimento_id: abastecimentoId })
        });

        // Reload data
        await Promise.all([loadAbastecimentos(), loadUnassignedComprovantesAbast()]);
    } catch (error) {
        console.error('Assign comprovante abastecimento error:', error);
        alert('Erro ao atribuir comprovante: ' + error.message);
    }
};

// Show dropdown to change abastecimento comprovante
window.showAbastComprovanteDropdown = function (abastecimentoId, event) {
    event.preventDefault();
    event.stopPropagation();

    // Remove any existing dropdown
    const existing = document.querySelector('.descarga-popup');
    if (existing) existing.remove();

    // Create popup dropdown
    const popup = document.createElement('div');
    popup.className = 'descarga-popup glass';
    popup.innerHTML = `
        <div class="descarga-popup-content">
            <p style="margin-bottom: 0.5rem; font-weight: 600;">Alterar Comprovante</p>
            <select id="abastComprovantePopupSelect" class="filter-input" style="margin-bottom: 0.5rem;">
                <option value="">Selecionar novo...</option>
                ${unassignedComprovantesAbast.map(c =>
        `<option value="${c.id}">${c.display_name}</option>`
    ).join('')}
            </select>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-primary" onclick="applyAbastComprovanteChange(${abastecimentoId})">Aplicar</button>
                <button class="btn btn-sm btn-outline" onclick="unassignAbastComprovante(${abastecimentoId})">Remover</button>
                <button class="btn btn-sm btn-outline" onclick="closeDescargaPopup()">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Position near the button
    const rect = event.target.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 5) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.zIndex = '1000';
};

window.applyAbastComprovanteChange = async function (abastecimentoId) {
    const select = document.getElementById('abastComprovantePopupSelect');
    const comprovanteId = select.value;

    if (comprovanteId) {
        await assignAbastComprovante(abastecimentoId, comprovanteId);
    }
    closeDescargaPopup();
};

window.unassignAbastComprovante = async function (abastecimentoId) {
    try {
        await apiRequest(`/admin/abastecimentos/${abastecimentoId}/unassign-comprovante`, {
            method: 'POST'
        });

        await Promise.all([loadAbastecimentos(), loadUnassignedComprovantesAbast()]);
        closeDescargaPopup();
    } catch (error) {
        console.error('Unassign comprovante abastecimento error:', error);
        alert('Erro ao remover comprovante: ' + error.message);
    }
};

// Edit or complete an abastecimento
window.editAbastecimento = async function (id) {
    const abastecimento = allAbastecimentos.find(a => a.id === id);
    if (!abastecimento) return;

    const isPending = abastecimento.status === 'pending';
    const title = isPending ? 'Completar Abastecimento' : 'Editar Abastecimento';

    const allClients = [...new Set(clients.map(c => c.client))];
    const clientOptions = '<option value="">(Opcional) Selecione um cliente</option>' +
        allClients.map(c => `<option value="${c}" ${abastecimento.client === c ? 'selected' : ''}>${c}</option>`).join('');

    showModal(title, `
        <input type="hidden" id="editAbastId" value="${id}">
        <div class="input-group">
            <label>Motorista</label>
            <input type="text" value="${abastecimento.driver_name || '-'}" disabled>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="text" value="${formatDate(abastecimento.date)}" disabled>
        </div>
        <div class="input-group">
            <label>Cliente (Opcional)</label>
            <select id="editAbastClient">${clientOptions}</select>
        </div>
        <div class="input-group">
            <label>Litros</label>
            <input type="number" step="0.01" id="editAbastQuantity" value="${abastecimento.quantity || ''}" required>
        </div>
        <div class="input-group">
            <label>Preço por Litro (R$)</label>
            <input type="number" step="0.01" id="editAbastPrice" value="${abastecimento.price_per_liter || ''}" required>
        </div>
        <div class="input-group">
            <label>Comprovante ${abastecimento.comprovante_abastecimento ? '(já anexado - enviar novo substitui)' : ''}</label>
            <input type="file" id="editAbastComprovante" class="file-input" accept="image/png, image/jpeg">
            ${abastecimento.comprovante_abastecimento ? `<a href="${abastecimento.comprovante_abastecimento}" target="_blank" style="color:var(--accent-primary);font-size:0.85rem;margin-top:0.25rem;">📷 Ver atual</a>` : ''}
        </div>
    `, async () => {
        const formData = new FormData();
        formData.append('quantity', parseFloat(document.getElementById('editAbastQuantity').value));
        formData.append('price_per_liter', parseFloat(document.getElementById('editAbastPrice').value));
        formData.append('client', document.getElementById('editAbastClient').value);

        const comprovanteFile = document.getElementById('editAbastComprovante').files[0];
        if (comprovanteFile) formData.append('comprovante_abastecimento', comprovanteFile);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/admin/abastecimentos/${id}`, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update abastecimento');
        }

        await loadAbastecimentos();
    });
};

function showAddAbastecimentoModal() {
    const options = drivers.map(d => `<option value="${d.id}">${d.name} (${d.plate})</option>`).join('');
    showModal('Novo Abastecimento', `
        <div class="input-group">
            <label>Motorista</label>
            <select id="newAbastDriver" required>${options}</select>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="date" id="newAbastDate" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <div class="input-group">
            <label>Litros</label>
            <input type="number" id="newAbastQuantity" required>
        </div>
        <div class="input-group">
            <label>Preço por Litro</label>
            <input type="number" step="0.01" id="newAbastPrice" value="5.50" required>
        </div>
        <div class="input-group">
            <label>Comprovante de Abastecimento (Foto)</label>
            <input type="file" id="newAbastComprovante" accept=".png,.jpg,.jpeg" class="file-input">
        </div>
    `, async () => {
        const formData = new FormData();
        formData.append('driver_id', document.getElementById('newAbastDriver').value);
        formData.append('date', document.getElementById('newAbastDate').value);
        formData.append('quantity', document.getElementById('newAbastQuantity').value);
        formData.append('price_per_liter', document.getElementById('newAbastPrice').value);

        const comprovanteFile = document.getElementById('newAbastComprovante').files[0];
        if (comprovanteFile) {
            formData.append('comprovante_abastecimento', comprovanteFile);
        }

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/admin/abastecimentos`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create abastecimento');
        }

        await loadAbastecimentos();
        await loadClients();
    });
}

// ========================================
// Outros Insumos
// ========================================

async function loadOutrosInsumos() {
    try {
        allOutrosInsumos = await apiRequest('/admin/outrosinsumos');
        renderOutrosInsumosTable();
    } catch (error) {
        console.error('Load outros insumos error:', error);
    }
}

function renderOutrosInsumosTable() {
    const tbody = document.getElementById('outrosInsumosTableBody');
    const driverFilter = document.getElementById('outrosDriverFilter').value;
    const clientFilter = document.getElementById('outrosClientFilter').value;
    const dateFilter = document.getElementById('outrosDateFilter').value;

    let filtered = allOutrosInsumos;
    if (driverFilter) filtered = filtered.filter(oi => oi.driver_id == driverFilter);
    if (clientFilter) {
        const driverIds = drivers.filter(d => d.client === clientFilter).map(d => d.id);
        filtered = filtered.filter(oi => driverIds.includes(oi.driver_id));
    }
    if (dateFilter) filtered = filtered.filter(oi => oi.date === dateFilter);

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination Logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pagination.outrosInsumos.limit) || 1;

    if (pagination.outrosInsumos.page > totalPages) pagination.outrosInsumos.page = totalPages;
    if (pagination.outrosInsumos.page < 1) pagination.outrosInsumos.page = 1;

    const start = (pagination.outrosInsumos.page - 1) * pagination.outrosInsumos.limit;
    const end = start + pagination.outrosInsumos.limit;
    const pageItems = filtered.slice(start, end);

    // Update UI Controls
    document.getElementById('outrosInsumosPageInfo').textContent = `Página ${pagination.outrosInsumos.page} de ${totalPages}`;
    document.getElementById('outrosInsumosPrevBtn').disabled = pagination.outrosInsumos.page === 1;
    document.getElementById('outrosInsumosNextBtn').disabled = pagination.outrosInsumos.page === totalPages;

    tbody.innerHTML = pageItems.length === 0
        ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhum insumo encontrado</td></tr>'
        : pageItems.map(oi => {
            return `
    < tr >
                    <td>${formatDate(oi.date)}</td>
                    <td>${formatNumber(oi.quantity)}</td>
                    <td>${oi.description || '-'}</td>
                    <td>${formatCurrency(oi.unit_price)}</td>
                    <td class="value-negative">-${formatCurrency(oi.total_value)}</td>
                </tr >
        `;
        }).join('');
}

function showAddOutrosInsumoModal() {
    const options = drivers.map(d => `<option value="${d.id}">${d.name} (${d.plate})</option>`).join('');
    showModal('Novo Insumo', `
        <div class="input-group">
            <label>Motorista</label>
            <select id="newOutrosDriver" required>${options}</select>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="date" id="newOutrosDate" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <div class="input-group">
            <label>Quantidade</label>
            <input type="number" id="newOutrosQuantity" step="0.01" required>
        </div>
        <div class="input-group">
            <label>Descrição</label>
            <input type="text" id="newOutrosDescription" placeholder="Ex: Óleo, Filtro, Pneu...">
        </div>
        <div class="input-group">
            <label>Preço Unitário</label>
            <input type="number" step="0.01" id="newOutrosPrice" value="0" required>
        </div>
    `, async () => {
        await apiRequest('/admin/outrosinsumos', {
            method: 'POST',
            body: JSON.stringify({
                driver_id: parseInt(document.getElementById('newOutrosDriver').value),
                date: document.getElementById('newOutrosDate').value,
                quantity: parseFloat(document.getElementById('newOutrosQuantity').value),
                description: document.getElementById('newOutrosDescription').value,
                unit_price: parseFloat(document.getElementById('newOutrosPrice').value)
            })
        });
        await loadOutrosInsumos();
        await loadClients();
    });
}
// ========================================
// Clients
// ========================================

async function loadClients() {
    try {
        clients = await apiRequest('/admin/clients');
        renderClientsTable();
    } catch (error) {
        console.error('Load clients error:', error);
    }
}

function renderClientsTable() {
    const tbody = document.getElementById('clientsTableBody');

    // Calculate statistics for each client from freights data
    const clientStats = {};

    // Get unique clients from freights
    allFreights.filter(f => f.client && f.status === 'complete').forEach(f => {
        if (!clientStats[f.client]) {
            clientStats[f.client] = {
                name: f.client,
                drivers: new Set(),
                freightCount: 0,
                receivedTotal: 0,
                toReceiveTotal: 0
            };
        }
        clientStats[f.client].drivers.add(f.driver_id);
        clientStats[f.client].freightCount++;
        if (f.client_paid) {
            clientStats[f.client].receivedTotal += f.total_value || 0;
        } else {
            clientStats[f.client].toReceiveTotal += f.total_value || 0;
        }
    });

    // Also add clients from the clients table that might not have freights yet
    clients.forEach(c => {
        if (!clientStats[c.client]) {
            clientStats[c.client] = {
                name: c.client,
                drivers: new Set(),
                freightCount: 0,
                receivedTotal: 0,
                toReceiveTotal: 0
            };
        }
    });

    // Calculate abastecimentos and outros insumos per client from freights' drivers
    const clientsList = Object.values(clientStats).map(c => {
        // Get driver IDs for this client's freights
        const driverIds = Array.from(c.drivers);

        // Sum abastecimentos for these drivers' freights with this client
        const abastTotal = allAbastecimentos
            .filter(a => driverIds.includes(a.driver_id))
            .reduce((sum, a) => sum + (a.total_value || 0), 0);

        // Sum outros insumos for these drivers
        const insumosTotal = allOutrosInsumos
            .filter(oi => driverIds.includes(oi.driver_id))
            .reduce((sum, oi) => sum + (oi.total_value || 0), 0);

        // Lucro = Total Recebido + A Receber - Abastecimentos - Insumos
        const lucro = c.receivedTotal + c.toReceiveTotal - abastTotal - insumosTotal;

        return {
            ...c,
            driverCount: c.drivers.size,
            abastTotal,
            insumosTotal,
            lucro
        };
    });

    // Sort by name
    clientsList.sort((a, b) => a.name.localeCompare(b.name));

    tbody.innerHTML = clientsList.length === 0
        ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nenhum cliente encontrado. Crie fretes com clientes.</td></tr>'
        : clientsList.map(c => {
            const lucroClass = c.lucro >= 0 ? 'value-positive' : 'value-negative';
            return `
            <tr>
                <td><strong>🏢 ${c.name}</strong></td>
                <td>${c.driverCount}</td>
                <td>${c.freightCount}</td>
                <td class="value-positive">${formatCurrency(c.receivedTotal)}</td>
                <td>${c.toReceiveTotal > 0 ? formatCurrency(c.toReceiveTotal) : '-'}</td>
                <td class="${lucroClass}">${formatCurrency(c.lucro)}</td>
                <td><button class="btn btn-sm btn-outline" onclick="viewClientDetails('${encodeURIComponent(c.name)}')">Detalhes</button></td>
            </tr>
        `}).join('');
}

window.viewClientDetails = async function (clientName) {
    try {
        const decodedName = decodeURIComponent(clientName);

        // Calculate stats from local data
        const clientFreights = allFreights.filter(f => f.client === decodedName && f.status === 'complete');
        const driverIds = [...new Set(clientFreights.map(f => f.driver_id))];

        const receivedTotal = clientFreights.filter(f => f.client_paid).reduce((sum, f) => sum + (f.total_value || 0), 0);
        const toReceiveTotal = clientFreights.filter(f => !f.client_paid).reduce((sum, f) => sum + (f.total_value || 0), 0);

        // Get abastecimentos and insumos for these drivers
        const clientAbast = allAbastecimentos.filter(a => driverIds.includes(a.driver_id));
        const clientInsumos = allOutrosInsumos.filter(oi => driverIds.includes(oi.driver_id));

        const abastTotal = clientAbast.reduce((sum, a) => sum + (a.total_value || 0), 0);
        const insumosTotal = clientInsumos.reduce((sum, oi) => sum + (oi.total_value || 0), 0);
        const lucro = receivedTotal + toReceiveTotal - abastTotal - insumosTotal;

        document.getElementById('clientsListView').classList.add('hidden');
        document.getElementById('clientDetailView').classList.remove('hidden');

        document.getElementById('clientDetailName').textContent = `🏢 ${decodedName}`;
        document.getElementById('clientDriverCount').textContent = driverIds.length;
        document.getElementById('clientFreightCount').textContent = clientFreights.length;
        document.getElementById('clientReceivedValue').textContent = formatCurrency(receivedTotal);
        document.getElementById('clientToReceive').textContent = toReceiveTotal > 0 ? formatCurrency(toReceiveTotal) : 'R$ 0,00';
        document.getElementById('clientAbastValue').textContent = `-${formatCurrency(abastTotal)}`;
        document.getElementById('clientOutrosInsumosValue').textContent = `-${formatCurrency(insumosTotal)}`;

        const lucroEl = document.getElementById('clientLucro');
        lucroEl.textContent = formatCurrency(lucro);
        lucroEl.className = 'card-value ' + (lucro >= 0 ? 'value-positive' : 'value-negative');

        document.getElementById('clientFreightsBody').innerHTML = clientFreights.map(f => {
            const isPaid = f.client_paid === 1 || f.client_paid === true;
            return `
            <tr>
                <td>${formatDate(f.date)}</td>
                <td>${f.driver_name}</td>
                <td>${formatNumber(f.km)} km</td>
                <td>${formatNumber(f.tons, 2)} t</td>
                <td class="value-positive">${formatCurrency(f.total_value)}</td>
                <td><input type="checkbox" class="paid-checkbox" ${isPaid ? 'checked' : ''} onchange="toggleClientPaid(${f.id})"></td>
            </tr>
        `}).join('') || '<tr><td colspan="6" style="text-align:center">Nenhum frete</td></tr>';

        document.getElementById('clientAbastecimentosBody').innerHTML = clientAbast.map(a => `
            <tr>
                <td>${formatDate(a.date)}</td>
                <td>${a.driver_name}</td>
                <td>${formatNumber(a.quantity)} L</td>
                <td>${formatCurrency(a.price_per_liter)}</td>
                <td class="value-negative">-${formatCurrency(a.total_value)}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center">Nenhum abastecimento</td></tr>';

        document.getElementById('clientOutrosInsumosBody').innerHTML = clientInsumos.map(oi => `
            <tr>
                <td>${formatDate(oi.date)}</td>
                <td>${formatNumber(oi.quantity)}</td>
                <td>${oi.description || '-'}</td>
                <td>${formatCurrency(oi.unit_price)}</td>
                <td class="value-negative">-${formatCurrency(oi.total_value)}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center">Nenhum insumo</td></tr>';
    } catch (error) {
        console.error('Load client details error:', error);
    }
};

// Toggle client_paid status for a freight (payment FROM client)
window.toggleClientPaid = async function (freightId) {
    try {
        await apiRequest(`/admin/freights/${freightId}/toggle-client-paid`, {
            method: 'PATCH'
        });

        // Reload freights and re-render
        await loadFreights();

        // Re-open the same client detail view to refresh totals
        const clientName = document.getElementById('clientDetailName').textContent.replace('🏢 ', '');
        if (clientName) {
            viewClientDetails(encodeURIComponent(clientName));
        }

        renderClientsTable();
    } catch (error) {
        console.error('Toggle client paid error:', error);
        alert('Erro ao atualizar pagamento: ' + error.message);
    }
};

function initClientDetailTabs() {
    const tabs = document.querySelectorAll('#clientDetailView .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Hide all sections
            document.getElementById('clientFreightsSection').classList.add('hidden');
            document.getElementById('clientAbastecimentosSection').classList.add('hidden');
            document.getElementById('clientOutrosInsumosSection').classList.add('hidden');

            // Show selected section
            if (tab.dataset.tab === 'clientFreights') {
                document.getElementById('clientFreightsSection').classList.remove('hidden');
            } else if (tab.dataset.tab === 'clientAbastecimentos') {
                document.getElementById('clientAbastecimentosSection').classList.remove('hidden');
            } else if (tab.dataset.tab === 'clientOutrosInsumos') {
                document.getElementById('clientOutrosInsumosSection').classList.remove('hidden');
            }
        });
    });
}

function showAddClientModal() {
    showModal('Novo Cliente', `
        <div class="input-group">
            <label>Nome do Cliente</label>
            <input type="text" id="newClientName" placeholder="Ex: Empresa ABC" required>
        </div>
    `, async () => {
        await apiRequest('/admin/clients', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('newClientName').value
            })
        });
        await loadClients();
    });
}

// ========================================
// Modal
// ========================================

let modalCallback = null;

function showModal(title, content, onSubmit) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalForm').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
    modalCallback = onSubmit;
}

function hideModal() {
    document.getElementById('modal').classList.add('hidden');
    modalCallback = null;
}

function initModal() {
    document.getElementById('modalClose').addEventListener('click', hideModal);
    document.getElementById('modalCancel').addEventListener('click', hideModal);
    document.querySelector('.modal-backdrop').addEventListener('click', hideModal);

    document.getElementById('modalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (modalCallback) {
            try {
                await modalCallback();
                hideModal();
            } catch (error) {
                alert(error.message);
            }
        }
    });
}

// ========================================
// Filters
// ========================================

function initFilters() {
    document.getElementById('driverSearch').addEventListener('input', (e) => {
        renderDriversTable(e.target.value);
    });

    ['freightDriverFilter', 'freightClientFilter', 'freightDateFilter'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            pagination.freights.page = 1;
            renderFreightsTable();
        });
    });

    ['abastDriverFilter', 'abastClientFilter', 'abastDateFilter'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            pagination.abastecimentos.page = 1;
            renderAbastecimentosTable();
        });
    });

    ['outrosDriverFilter', 'outrosClientFilter', 'outrosDateFilter'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            pagination.outrosInsumos.page = 1;
            renderOutrosInsumosTable();
        });
    });
}

function initPagination() {
    // Freights
    document.getElementById('freightsPrevBtn').addEventListener('click', () => {
        if (pagination.freights.page > 1) {
            pagination.freights.page--;
            renderFreightsTable();
        }
    });
    document.getElementById('freightsNextBtn').addEventListener('click', () => {
        pagination.freights.page++;
        renderFreightsTable();
    });
    document.getElementById('freightsPageSize').addEventListener('change', (e) => {
        pagination.freights.limit = parseInt(e.target.value);
        pagination.freights.page = 1;
        renderFreightsTable();
    });

    // Abastecimentos
    document.getElementById('abastecimentosPrevBtn').addEventListener('click', () => {
        if (pagination.abastecimentos.page > 1) {
            pagination.abastecimentos.page--;
            renderAbastecimentosTable();
        }
    });
    document.getElementById('abastecimentosNextBtn').addEventListener('click', () => {
        pagination.abastecimentos.page++;
        renderAbastecimentosTable();
    });
    document.getElementById('abastecimentosPageSize').addEventListener('change', (e) => {
        pagination.abastecimentos.limit = parseInt(e.target.value);
        pagination.abastecimentos.page = 1;
        renderAbastecimentosTable();
    });

    // Outros Insumos
    document.getElementById('outrosInsumosPrevBtn').addEventListener('click', () => {
        if (pagination.outrosInsumos.page > 1) {
            pagination.outrosInsumos.page--;
            renderOutrosInsumosTable();
        }
    });
    document.getElementById('outrosInsumosNextBtn').addEventListener('click', () => {
        pagination.outrosInsumos.page++;
        renderOutrosInsumosTable();
    });
    document.getElementById('outrosInsumosPageSize').addEventListener('change', (e) => {
        pagination.outrosInsumos.limit = parseInt(e.target.value);
        pagination.outrosInsumos.page = 1;
        renderOutrosInsumosTable();
    });
}

// ========================================
// Driver Payments
// ========================================

window.openDriverPayments = async function (driverId) {
    currentDriverForPayment = drivers.find(d => d.id === driverId);
    if (!currentDriverForPayment) return;

    // Update title
    document.getElementById('driverPaymentsTitle').textContent = `💰 Pagamentos - ${currentDriverForPayment.name}`;

    // Hide all content pages, show payments page
    document.querySelectorAll('.content-page').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
    });
    document.getElementById('driverPaymentsPage').classList.remove('hidden');
    document.getElementById('driverPaymentsPage').classList.add('active');

    // Reset to unpaid tab
    document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.payment-tab[data-tab="unpaid"]').classList.add('active');
    document.querySelectorAll('.payment-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('unpaidTab').classList.remove('hidden');

    // Load data
    await loadDriverPaymentsData();
};

async function loadDriverPaymentsData() {
    if (!currentDriverForPayment) return;

    // Load payments for this driver
    try {
        driverPayments = await apiRequest(`/admin/payments?driver_id=${currentDriverForPayment.id}`);
    } catch (e) {
        driverPayments = [];
    }

    renderUnpaidFreights();
    renderPaymentsHistory();
}

function renderUnpaidFreights() {
    const tbody = document.getElementById('unpaidFreightsBody');
    const driverFreights = allFreights.filter(f =>
        f.driver_id === currentDriverForPayment.id &&
        f.status === 'complete' &&
        !f.paid
    ).sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first

    if (driverFreights.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhum frete não pago</td></tr>';
        return;
    }

    tbody.innerHTML = driverFreights.map(f => `
        <tr>
            <td>${formatDate(f.date)}</td>
            <td>${currentDriverForPayment.name}</td>
            <td class="value-positive">${formatCurrency(f.total_value)}</td>
            <td><input type="checkbox" class="payment-check" data-freight-id="${f.id}" data-date="${f.date}" data-value="${f.total_value}"></td>
        </tr>
    `).join('');
}

function renderPaymentsHistory() {
    const tbody = document.getElementById('paymentsHistoryBody');

    if (driverPayments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhum pagamento registrado</td></tr>';
        return;
    }

    tbody.innerHTML = driverPayments.map(p => `
        <tr>
            <td>${p.date_range}</td>
            <td class="value-positive">${formatCurrency(p.total_value)}</td>
            <td>${p.comprovante_path
            ? `<a href="${p.comprovante_path}" target="_blank" class="btn btn-sm btn-outline">📷 Ver Comprovante</a>`
            : `<label class="btn btn-sm btn-outline" style="cursor:pointer;">
                    📤 Anexar Arquivo
                    <input type="file" accept="image/png, image/jpeg" style="display:none;" onchange="uploadPaymentProofDirect(${p.id}, this)">
                   </label>`}</td>
        </tr>
    `).join('');
}

function calculateDateRange(dates) {
    if (dates.length === 0) return '';
    if (dates.length === 1) return formatDate(dates[0]);

    // Sort dates
    const sortedDates = [...dates].sort((a, b) => new Date(a) - new Date(b));

    // Get all dates in the range from the driver's freights
    const driverFreights = allFreights.filter(f =>
        f.driver_id === currentDriverForPayment.id &&
        f.status === 'complete' &&
        !f.paid
    );

    const firstDate = new Date(sortedDates[0]);
    const lastDate = new Date(sortedDates[sortedDates.length - 1]);

    // Check if all freights in the date range are selected
    const freightsInRange = driverFreights.filter(f => {
        const d = new Date(f.date);
        return d >= firstDate && d <= lastDate;
    });

    const isSequential = freightsInRange.every(f => sortedDates.includes(f.date));

    if (isSequential) {
        // Sequential: "12/01/2026 - 19/01/2026"
        return `${formatDate(sortedDates[0])} - ${formatDate(sortedDates[sortedDates.length - 1])}`;
    } else {
        // Non-sequential: list all dates
        return sortedDates.map(d => formatDate(d)).join(', ');
    }
}

window.generatePayment = async function () {
    const checkboxes = document.querySelectorAll('.payment-check:checked');

    if (checkboxes.length === 0) {
        alert('Selecione pelo menos um frete para gerar o pagamento.');
        return;
    }

    const freightIds = [];
    const dates = [];
    let totalValue = 0;

    checkboxes.forEach(cb => {
        freightIds.push(parseInt(cb.dataset.freightId));
        dates.push(cb.dataset.date);
        totalValue += parseFloat(cb.dataset.value);
    });

    const dateRange = calculateDateRange(dates);

    // Show modal to optionally attach comprovante
    showModal('Gerar Pagamento', `
        <div class="payment-summary">
            <div class="input-group">
                <label>Período</label>
                <input type="text" value="${dateRange}" disabled>
            </div>
            <div class="input-group">
                <label>Valor Total</label>
                <input type="text" value="${formatCurrency(totalValue)}" disabled>
            </div>
            <div class="input-group">
                <label>Comprovante de Pagamento (Opcional)</label>
                <input type="file" id="paymentComprovante" accept="image/png, image/jpeg" class="file-input">
            </div>
        </div>
    `, async () => {
        const formData = new FormData();
        formData.append('driver_id', currentDriverForPayment.id);
        formData.append('date_range', dateRange);
        formData.append('total_value', totalValue);
        formData.append('freight_ids', JSON.stringify(freightIds));

        const comprovanteFile = document.getElementById('paymentComprovante').files[0];
        if (comprovanteFile) {
            formData.append('comprovante', comprovanteFile);
        }

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/admin/payments`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao criar pagamento');
        }

        // Reload all data
        await loadFreights();
        await loadUnpaidTotals();
        await loadDriverPaymentsData();
    });
};

window.uploadPaymentProof = async function (paymentId) {
    showModal('Anexar Comprovante', `
        <div class="input-group">
            <label>Comprovante de Pagamento</label>
            <input type="file" id="paymentProofFile" accept="image/png, image/jpeg" class="file-input" required>
        </div>
    `, async () => {
        const file = document.getElementById('paymentProofFile').files[0];
        if (!file) {
            throw new Error('Selecione um arquivo');
        }

        const formData = new FormData();
        formData.append('comprovante', file);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/admin/payments/${paymentId}`, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao anexar comprovante');
        }

        await loadDriverPaymentsData();
    });
};

window.deletePayment = async function (paymentId) {
    if (!confirm('Tem certeza que deseja excluir este pagamento? Os fretes serão marcados como não pagos novamente.')) {
        return;
    }

    try {
        await apiRequest(`/admin/payments/${paymentId}`, { method: 'DELETE' });
        await loadFreights();
        await loadUnpaidTotals();
        await loadDriverPaymentsData();
    } catch (error) {
        alert('Erro ao excluir pagamento: ' + error.message);
    }
};

// Direct file upload for payment proof
window.uploadPaymentProofDirect = async function (paymentId, input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('comprovante', file);

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(`${API_BASE}/admin/payments/${paymentId}`, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao anexar comprovante');
        }

        await loadDriverPaymentsData();
    } catch (error) {
        alert('Erro ao anexar comprovante: ' + error.message);
    }
};

function initDriverPayments() {
    // Back button
    document.getElementById('backToDriversBtn').addEventListener('click', () => {
        document.getElementById('driverPaymentsPage').classList.add('hidden');
        document.getElementById('driverPaymentsPage').classList.remove('active');
        document.getElementById('driversPage').classList.remove('hidden');
        document.getElementById('driversPage').classList.add('active');
        currentDriverForPayment = null;
    });

    // Payment tab switching
    document.querySelectorAll('.payment-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            document.querySelectorAll('.payment-tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(tabName + 'Tab').classList.remove('hidden');
        });
    });

    // Generate payment button
    document.getElementById('generatePaymentBtn').addEventListener('click', generatePayment);
}

// ========================================
// Initialize
// ========================================

function init() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', logout);

    document.getElementById('addDriverBtn').addEventListener('click', showAddDriverModal);
    document.getElementById('addFreightBtn').addEventListener('click', showAddFreightModal);
    document.getElementById('addAbastecimentoBtn').addEventListener('click', showAddAbastecimentoModal);
    document.getElementById('addOutrosInsumoBtn').addEventListener('click', showAddOutrosInsumoModal);
    document.getElementById('addClientBtn').addEventListener('click', showAddClientModal);
    document.getElementById('backToClients').addEventListener('click', () => {
        document.getElementById('clientDetailView').classList.add('hidden');
        document.getElementById('clientsListView').classList.remove('hidden');
    });

    initNavigation();
    initModal();
    initFilters();
    initPagination();
    initClientDetailTabs();
    initDriverPayments();

    if (token) loadDashboard();
    else showPage(loginPage);
}

document.addEventListener('DOMContentLoaded', init);
