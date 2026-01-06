/**
 * CMS Admin Dashboard - Frontend Application
 */

const API_BASE = '/api';

// State
let token = localStorage.getItem('admin_token');
let drivers = [];
let abastecedores = []; // Fuel attendants
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
    outrosInsumos: { page: 1, limit: 10 },
    finPayments: { page: 1, limit: 10 }
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
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value || 0);
}

// Format price per liter with 4 decimal places
function formatPricePerLiter(value) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value || 0);
}

// Format price per km/ton with 6 decimal places
function formatPricePerKmTon(value) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value || 0);
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
    console.log('handleLogin called');
    const button = loginForm.querySelector('button');
    const username = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoading(button, true);
    try {
        console.log('Attempting login for:', username);
        const data = await apiRequest('/auth/admin/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        console.log('Login successful, token received');
        token = data.token;
        localStorage.setItem('admin_token', token);
        console.log('Loading dashboard...');
        await loadDashboard();
        console.log('Dashboard loaded');
    } catch (error) {
        console.error('Login error:', error);
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
        await Promise.all([loadDrivers(), loadAbastecedores()]);
        await loadFreights();
        await loadAbastecimentos();
        await loadOutrosInsumos();
        await loadClients(); // Load clients after freights so renderClientsTable has access to allFreights
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
                loadDrivers(),
                loadAbastecedores(),
                loadFreights(),
                loadAbastecimentos(),
                loadUnassignedComprovantes(),
                loadUnassignedComprovantesCarga(),
                loadUnassignedComprovantesAbast(),
                loadUnpaidTotals()
            ]);
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
        renderFinanceiroDriversTable();
        populateExtratoDriverSelect();
    } catch (error) {
        console.error('Load drivers error:', error);
    }
}

// Load abastecedores (fuel attendants)
async function loadAbastecedores() {
    try {
        abastecedores = await apiRequest('/admin/abastecedores');
        renderDriversTable();
    } catch (error) {
        console.error('Load abastecedores error:', error);
    }
}

function renderDriversTable(filter = '') {
    const tbody = document.getElementById('driversTableBody');

    // Combine drivers and abastecedores into a unified list
    const driversWithType = drivers.map(d => ({ ...d, userType: 'motorista' }));
    const abastecedoresWithType = abastecedores.map(a => ({ ...a, userType: 'abastecedor' }));
    const allUsers = [...driversWithType, ...abastecedoresWithType];

    const filtered = filter
        ? allUsers.filter(u => u.name?.toLowerCase().includes(filter.toLowerCase()))
        : allUsers;

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
        ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Nenhum usuário encontrado</td></tr>'
        : filtered.map(u => {
            const isMotorista = u.userType === 'motorista';

            // Type badge
            const typeBadge = isMotorista
                ? '<span class="status-badge" style="background:rgba(99,102,241,0.2);color:#6366f1;">Motorista</span>'
                : '<span class="status-badge" style="background:rgba(245,158,11,0.2);color:#f59e0b;">Abastecedor</span>';

            // Authentication cell - only for drivers
            let authCell = '-';
            if (isMotorista) {
                const isAuthenticated = u.authenticated === 1 || u.authenticated === true;
                if (isAuthenticated) {
                    authCell = '<span class="status-badge status-authenticated">Autenticado</span>';
                } else {
                    authCell = `<button class="btn btn-sm btn-warning" onclick="authenticateDriver(${u.id})">Autenticar</button>`;
                }
            }

            // Format plates - show all plates for drivers with multiple plates
            let platesDisplay = u.plate || '-';
            if (isMotorista && u.plates) {
                try {
                    const platesArray = typeof u.plates === 'string' ? JSON.parse(u.plates) : u.plates;
                    if (Array.isArray(platesArray) && platesArray.length > 0) {
                        // Deduplicate: use the plates array (which should include primary)
                        const uniquePlates = [...new Set(platesArray)];
                        platesDisplay = uniquePlates.map(p => `<span class="plate-badge">${p}</span>`).join('');
                    }
                } catch (e) {
                    // If parsing fails, just show the primary plate
                    if (u.plate) {
                        platesDisplay = `<span class="plate-badge">${u.plate}</span>`;
                    }
                }
            } else if (isMotorista && u.plate) {
                platesDisplay = `<span class="plate-badge">${u.plate}</span>`;
            }

            // Actions based on user type - only Edit button now
            const actions = isMotorista
                ? `<button class="btn btn-sm btn-outline" onclick="editDriver(${u.id})">Editar</button>`
                : `<button class="btn btn-sm btn-outline" onclick="editAbastecedor(${u.id})">Editar</button>`;

            return `
            <tr>
                <td>${typeBadge}</td>
                <td>${u.name}</td>
                <td style="white-space:nowrap;">${formatCPF(u.cpf)}</td>
                <td style="white-space:nowrap;">${formatPhone(u.phone)}</td>
                <td class="plates-cell" style="white-space:nowrap;">${platesDisplay}</td>
                <td><span class="${u.active ? 'status-active' : 'status-inactive'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>${authCell}</td>
                <td>${actions}</td>
            </tr>
        `}).join('');
}

// Authenticate a driver
window.authenticateDriver = async function (id) {
    try {
        await apiRequest(`/admin/drivers/${id}/authenticate`, {
            method: 'PATCH'
        });
        await loadDrivers();
    } catch (error) {
        console.error('Authenticate driver error:', error);
        alert('Erro ao autenticar motorista: ' + error.message);
    }
};

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

    // Parse additional plates (exclude primary plate from the list)
    let additionalPlates = [];
    if (driver.plates) {
        try {
            const allPlates = typeof driver.plates === 'string' ? JSON.parse(driver.plates) : driver.plates;
            // Filter out the primary plate to show only additional ones
            additionalPlates = allPlates.filter(p => p !== driver.plate);
        } catch (e) { }
    }

    // Format existing values
    const formattedCpf = driver.cpf ? formatCpfInput(driver.cpf) : '';
    const formattedPhone = driver.phone ? formatPhoneInput(driver.phone) : '';

    // Build additional plates HTML
    const additionalPlatesHtml = additionalPlates.map((plate, index) => `
        <div class="additional-plate-row" data-plate-index="${index}">
            <input type="text" class="edit-additional-plate filter-input" value="${plate}" placeholder="ABC-1234">
            <button type="button" class="btn btn-sm btn-danger" onclick="removeEditPlate(${index})">✕</button>
        </div>
    `).join('');

    showModal('Editar Motorista', `
        <input type="hidden" id="editDriverId" value="${id}">
        <div class="input-group">
            <label>Nome</label>
            <input type="text" id="editDriverName" value="${driver.name}" required>
        </div>
        <div class="input-group">
            <label>CPF</label>
            <input type="text" id="editDriverCpf" value="${formattedCpf}" placeholder="000.000.000-00">
        </div>
        <div class="input-group">
            <label>Telefone</label>
            <input type="text" id="editDriverPhone" value="${formattedPhone}" placeholder="(00) 00000-0000">
        </div>
        <div class="input-group">
            <label>Placa Principal</label>
            <input type="text" id="editDriverPlate" value="${driver.plate}" required>
        </div>
        <div class="input-group">
            <label>Placas Adicionais</label>
            <div id="editAdditionalPlatesList">
                ${additionalPlatesHtml}
            </div>
            <button type="button" class="btn btn-sm btn-outline" onclick="addEditPlate()">+ Adicionar Placa</button>
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
        // Collect additional plates
        const plateInputs = document.querySelectorAll('.edit-additional-plate');
        const additionalPlates = Array.from(plateInputs).map(input => input.value.trim().toUpperCase()).filter(v => v);
        const primaryPlate = document.getElementById('editDriverPlate').value.trim().toUpperCase();

        // Combine primary plate with additional plates (primary first, no duplicates)
        const allPlates = [primaryPlate, ...additionalPlates.filter(p => p !== primaryPlate)];

        try {
            await apiRequest(`/admin/drivers/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: document.getElementById('editDriverName').value,
                    cpf: document.getElementById('editDriverCpf').value.replace(/\D/g, ''),
                    phone: document.getElementById('editDriverPhone').value.replace(/\D/g, '') || null,
                    plate: primaryPlate,
                    plates: allPlates,
                    client: document.getElementById('editDriverClient').value || null,
                    active: document.getElementById('editDriverActive').value === 'true'
                })
            });
            await loadDrivers();
            await loadClients();
        } catch (error) {
            console.error('Update driver error:', error);
            alert('Erro ao atualizar motorista: ' + error.message);
        }
    });

    // Attach input formatters after modal is rendered
    setTimeout(attachEditDriverFormatters, 50);
};

// Add plate to edit modal
window.addEditPlate = function () {
    const list = document.getElementById('editAdditionalPlatesList');
    const index = list.children.length;
    const div = document.createElement('div');
    div.className = 'additional-plate-row';
    div.dataset.plateIndex = index;
    div.innerHTML = `
        <input type="text" class="edit-additional-plate filter-input" value="" placeholder="ABC-1234">
        <button type="button" class="btn btn-sm btn-danger" onclick="removeEditPlate(${index})">✕</button>
    `;
    list.appendChild(div);

    // Format plate input
    const input = div.querySelector('input');
    input.addEventListener('input', (e) => {
        e.target.value = formatPlateInput(e.target.value);
    });
};

// Remove plate from edit modal
window.removeEditPlate = function (index) {
    const row = document.querySelector(`.additional-plate-row[data-plate-index="${index}"]`);
    if (row) row.remove();
};

// Attach formatters to edit driver modal
function attachEditDriverFormatters() {
    const cpfInput = document.getElementById('editDriverCpf');
    const phoneInput = document.getElementById('editDriverPhone');
    const plateInput = document.getElementById('editDriverPlate');

    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            e.target.value = formatCpfInput(e.target.value);
        });
    }

    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = formatPhoneInput(e.target.value);
        });
    }

    if (plateInput) {
        plateInput.addEventListener('input', (e) => {
            e.target.value = formatPlateInput(e.target.value);
        });
    }

    // Format existing additional plate inputs
    document.querySelectorAll('.edit-additional-plate').forEach(input => {
        input.addEventListener('input', (e) => {
            e.target.value = formatPlateInput(e.target.value);
        });
    });
}

function showAddDriverModal() {
    showModal('Novo Usuário', `
        <div class="input-group">
            <label>Tipo de Usuário</label>
            <select id="newUserType" required onchange="toggleUserTypeFields()">
                <option value="motorista">Motorista</option>
                <option value="abastecedor">Abastecedor</option>
            </select>
        </div>
        <div class="input-group">
            <label>Nome</label>
            <input type="text" id="newDriverName" required>
        </div>
        <div class="input-group" id="cpfField">
            <label>CPF</label>
            <input type="text" id="newDriverCpf" placeholder="000.000.000-00" required>
        </div>
        <div class="input-group" id="passwordField">
            <label>Senha</label>
            <input type="password" id="newDriverPassword" placeholder="Mínimo 4 caracteres" minlength="4" required>
        </div>
        <div class="input-group" id="phoneField">
            <label>Telefone (Opcional)</label>
            <input type="text" id="newDriverPhone" placeholder="(00) 00000-0000">
        </div>
        <div id="motoristaFields">
            <div class="input-group">
                <label>Placa</label>
                <input type="text" id="newDriverPlate" placeholder="ABC-1234">
            </div>
        </div>
    `, async () => {
        const userType = document.getElementById('newUserType').value;

        if (userType === 'motorista') {
            await apiRequest('/admin/drivers', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('newDriverName').value,
                    cpf: document.getElementById('newDriverCpf').value,
                    password: document.getElementById('newDriverPassword').value,
                    phone: document.getElementById('newDriverPhone').value || null,
                    plate: document.getElementById('newDriverPlate').value
                })
            });
            await loadDrivers();
        } else if (userType === 'abastecedor') {
            await apiRequest('/admin/abastecedores', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('newDriverName').value,
                    cpf: document.getElementById('newDriverCpf').value,
                    password: document.getElementById('newDriverPassword').value,
                    phone: document.getElementById('newDriverPhone').value || null
                })
            });
            await loadAbastecedores();
        }
    });

    // Attach input formatters after modal is rendered
    setTimeout(attachInputFormatters, 50);
}


// Toggle fields based on user type selection
window.toggleUserTypeFields = function () {
    const userType = document.getElementById('newUserType').value;
    const motoristaFields = document.getElementById('motoristaFields');
    const plateInput = document.getElementById('newDriverPlate');

    if (userType === 'motorista') {
        motoristaFields.style.display = 'block';
        plateInput.required = true;
    } else {
        motoristaFields.style.display = 'none';
        plateInput.required = false;
    }
};

// ========================================
// Input Formatting Functions
// ========================================

// Format CPF as 000.000.000-00
function formatCpfInput(value) {
    const numbers = value.replace(/\D/g, '').substring(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
}

// Format phone as (00) 00000-0000 or (00) 0000-0000
function formatPhoneInput(value) {
    const numbers = value.replace(/\D/g, '').substring(0, 11);
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
}

// Format plate as ABC-1234 or ABC1D23
function formatPlateInput(value) {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 7);
    if (cleaned.length <= 3) return cleaned;
    // Check if it's new format (ABC1D23) or old format (ABC1234)
    if (cleaned.length >= 4) {
        const hasLetterIn5thPosition = cleaned.length >= 5 && /[A-Z]/.test(cleaned[4]);
        if (hasLetterIn5thPosition) {
            // New format: ABC1D23 (no hyphen)
            return cleaned;
        } else {
            // Old format: ABC-1234
            return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
        }
    }
    return cleaned;
}

// Attach formatters to new user modal inputs
function attachInputFormatters() {
    const cpfInput = document.getElementById('newDriverCpf');
    const phoneInput = document.getElementById('newDriverPhone');
    const plateInput = document.getElementById('newDriverPlate');

    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            e.target.value = formatCpfInput(e.target.value);
        });
    }

    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = formatPhoneInput(e.target.value);
        });
    }

    if (plateInput) {
        plateInput.addEventListener('input', (e) => {
            e.target.value = formatPlateInput(e.target.value);
        });
    }
}

// Attach formatters to edit abastecedor modal inputs
function attachAbastecedorFormatters() {
    const cpfInput = document.getElementById('editAbastecedorCpf');
    const phoneInput = document.getElementById('editAbastecedorPhone');

    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            e.target.value = formatCpfInput(e.target.value);
        });
    }

    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = formatPhoneInput(e.target.value);
        });
    }
}

// Edit abastecedor
window.editAbastecedor = async function (id) {
    const abastecedor = abastecedores.find(a => a.id === id);
    if (!abastecedor) return;

    // Pre-format values for display
    const formattedCpf = abastecedor.cpf ? formatCpfInput(abastecedor.cpf) : '';
    const formattedPhone = abastecedor.phone ? formatPhoneInput(abastecedor.phone) : '';

    showModal('Editar Abastecedor', `
        <input type="hidden" id="editAbastecedorId" value="${id}">
        <div class="input-group">
            <label>Nome</label>
            <input type="text" id="editAbastecedorName" value="${abastecedor.name}" required>
        </div>
        <div class="input-group">
            <label>CPF</label>
            <input type="text" id="editAbastecedorCpf" value="${formattedCpf}" placeholder="000.000.000-00">
        </div>
        <div class="input-group">
            <label>Telefone</label>
            <input type="text" id="editAbastecedorPhone" value="${formattedPhone}" placeholder="(00) 00000-0000">
        </div>
        <div class="input-group">
            <label>Ativo</label>
            <select id="editAbastecedorActive">
                <option value="true" ${abastecedor.active ? 'selected' : ''}>Sim</option>
                <option value="false" ${!abastecedor.active ? 'selected' : ''}>Não</option>
            </select>
        </div>
    `, async () => {
        await apiRequest(`/admin/abastecedores/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: document.getElementById('editAbastecedorName').value,
                cpf: document.getElementById('editAbastecedorCpf').value.replace(/\D/g, ''),
                phone: document.getElementById('editAbastecedorPhone').value.replace(/\D/g, '') || null,
                active: document.getElementById('editAbastecedorActive').value === 'true'
            })
        });
        await loadAbastecedores();
    });

    // Attach input formatters after modal is rendered
    setTimeout(attachAbastecedorFormatters, 50);
};

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
        ? '<tr><td colspan="14" style="text-align:center;color:var(--text-muted)">Nenhum frete encontrado</td></tr>'
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

            // Recebimento cell
            let recebimentoCell;
            if (f.comprovante_recebimento) {
                recebimentoCell = `<a href="${f.comprovante_recebimento}" target="_blank" class="btn btn-sm btn-outline">📷</a>`;
            } else {
                recebimentoCell = '<span class="text-muted">-</span>';
            }

            // Documento frete cell (PDF)
            let documentoCell;
            if (f.documento_frete) {
                documentoCell = `<a href="${f.documento_frete}" target="_blank" class="btn btn-sm btn-outline">📄</a>`;
            } else {
                documentoCell = '<span class="text-muted">-</span>';
            }

            // Status badge (only for complete freights with value)
            const isPaid = f.paid === 1 || f.paid === true;
            let statusCell;
            if (f.status === 'complete' && f.total_value > 0) {
                statusCell = isPaid
                    ? `<span class="status-badge status-paid" onclick="togglePaid(${f.id})" style="cursor:pointer;">Pago</span>`
                    : `<span class="status-badge status-pending" onclick="togglePaid(${f.id})" style="cursor:pointer;">Pendente</span>`;
            } else {
                statusCell = '<span class="text-muted">-</span>';
            }

            const actionBtn = isPending
                ? `<button class="btn btn-sm btn-primary" onclick="editFreight(${f.id})">Completar</button>`
                : `<button class="btn btn-sm btn-outline" onclick="editFreight(${f.id})">Editar</button>`;
            return `
                <tr class="${isPending ? 'row-pending' : ''}">
                    <td>${formatDate(f.date)}</td>
                    <td>${f.driver_name || driver?.name || '-'}</td>
                    <td style="white-space:nowrap;">${f.plate || driver?.plate || '<span class="text-muted">-</span>'}</td>
                    <td>${f.client || '<span class="text-muted">-</span>'}</td>
                    <td>${f.km > 0 ? formatNumber(f.km) : '<span class="text-muted">-</span>'}</td>
                    <td>${f.tons > 0 ? formatNumber(f.tons, 2) : '<span class="text-muted">-</span>'}</td>
                    <td>${cargaCell}</td>
                    <td>${descargaCell}</td>
                    <td>${documentoCell}</td>
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

    // Build driver options dropdown
    const driverOptions = drivers.map(d =>
        `<option value="${d.id}" ${freight.driver_id === d.id ? 'selected' : ''}>${d.name}</option>`
    ).join('');

    // Helper function to get all plates for a driver
    const getDriverPlates = (driver) => {
        if (!driver) return [];
        let plates = [];
        if (driver.plate) plates.push(driver.plate);
        if (driver.plates) {
            try {
                const additionalPlates = typeof driver.plates === 'string' ? JSON.parse(driver.plates) : driver.plates;
                if (Array.isArray(additionalPlates)) {
                    plates = [...new Set([...plates, ...additionalPlates])];
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        return plates;
    };

    // Get plates for the current driver
    const currentDriver = drivers.find(d => d.id === freight.driver_id);
    const currentPlate = freight.plate || freight.driver_plate || '';
    const currentDriverPlates = getDriverPlates(currentDriver);
    const plateOptions = currentDriverPlates.map(p =>
        `<option value="${p}" ${currentPlate === p ? 'selected' : ''}>${p}</option>`
    ).join('') || '<option value="">Nenhuma placa</option>';

    const isPending = freight.status === 'pending';
    const title = isPending ? 'Completar Frete' : 'Editar Frete';

    showModal(title, `
        <input type="hidden" id="editFreightId" value="${id}">
        <div class="input-group">
            <label>Motorista</label>
            <select id="editFreightDriver" required>${driverOptions}</select>
        </div>
        <div class="input-group">
            <label>Placa</label>
            <select id="editFreightPlate">${plateOptions}</select>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="date" id="editFreightDate" value="${freight.date}" required>
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
            <label>Preço por km/ton (R$) (Motorista)</label>
            <input type="number" step="0.000001" id="editFreightPrice" value="${freight.price_per_km_ton ? freight.price_per_km_ton.toFixed(6) : ''}" required>
        </div>
        <div class="input-group">
            <label>Preço por km/ton (R$) (Transportadora)</label>
            <input type="number" step="0.000001" id="editFreightPriceTransportadora" value="${freight.price_per_km_ton_transportadora ? freight.price_per_km_ton_transportadora.toFixed(6) : ''}">
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
        <div class="input-group">
            <label>Documento do Frete (PDF) ${freight.documento_frete ? '(já anexado - enviar novo substitui)' : ''}</label>
            <input type="file" id="editFreightDocumento" class="file-input" accept="application/pdf,.pdf">
            ${freight.documento_frete ? `<a href="${freight.documento_frete}" target="_blank" style="color:var(--accent-primary);font-size:0.85rem;margin-top:0.25rem;">📄 Ver atual</a>` : ''}
        </div>
    `, async () => {
        const formData = new FormData();
        formData.append('driver_id', document.getElementById('editFreightDriver').value);
        formData.append('plate', document.getElementById('editFreightPlate').value);
        formData.append('date', document.getElementById('editFreightDate').value);
        formData.append('client', document.getElementById('editFreightClient').value);
        formData.append('km', parseFloat(document.getElementById('editFreightKm').value));
        formData.append('tons', parseFloat(document.getElementById('editFreightTons').value));
        formData.append('price_per_km_ton', parseFloat(document.getElementById('editFreightPrice').value));

        const priceTransp = document.getElementById('editFreightPriceTransportadora').value;
        if (priceTransp) formData.append('price_per_km_ton_transportadora', parseFloat(priceTransp));

        const cargaFile = document.getElementById('editFreightCarga').files[0];
        const descargaFile = document.getElementById('editFreightDescarga').files[0];
        const documentoFile = document.getElementById('editFreightDocumento').files[0];

        if (cargaFile) formData.append('comprovante_carga', cargaFile);
        if (descargaFile) formData.append('comprovante_descarga', descargaFile);
        if (documentoFile) formData.append('documento_frete', documentoFile);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE} / admin / freights / ${id}`, {
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
        renderFreightsTable();
    }, async () => {
        // Delete callback
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE} / admin / freights / ${id}`, {
            method: 'DELETE',
            headers
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao excluir frete');
        }

        await loadFreights();
        await loadClients();
    });

    // Add event listener to update plate dropdown when driver changes
    setTimeout(() => {
        const driverSelect = document.getElementById('editFreightDriver');
        const plateSelect = document.getElementById('editFreightPlate');

        if (driverSelect && plateSelect) {
            driverSelect.addEventListener('change', function () {
                const selectedDriverId = parseInt(this.value);
                const selectedDriver = drivers.find(d => d.id === selectedDriverId);
                const plates = getDriverPlates(selectedDriver);

                plateSelect.innerHTML = plates.length > 0
                    ? plates.map(p => `<option value="${p}">${p}</option>`).join('')
                    : '<option value="">Nenhuma placa</option>';
            });
        }
    }, 100);
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
            <label>Preço por km/ton (R$) (Motorista)</label>
            <input type="number" step="0.000001" id="newFreightPrice" value="0.500000" placeholder="0.000000" required>
        </div>
        <div class="input-group">
            <label>Preço por km/ton (R$) (Transportadora)</label>
            <input type="number" step="0.000001" id="newFreightPriceTransportadora" value="0.500000" placeholder="0.000000">
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

        const priceTransp = document.getElementById('newFreightPriceTransportadora').value;
        if (priceTransp) formData.append('price_per_km_ton_transportadora', priceTransp);

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

        const response = await fetch(`${API_BASE} / admin / freights`, {
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
        ? '<tr><td colspan="10" style="text-align:center;color:var(--text-muted)">Nenhum abastecimento encontrado</td></tr>'
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

            // Status badge for paid status
            const isPaid = a.paid === 1 || a.paid === true;
            let statusCell;
            if (!isPending && a.total_value > 0) {
                statusCell = isPaid
                    ? `<span class="status-badge status-paid">Pago</span>`
                    : `<span class="status-badge status-pending">Pendente</span>`;
            } else {
                statusCell = '<span class="text-muted">-</span>';
            }

            return `
                <tr class="${isPending ? 'row-pending' : ''}">
                    <td>${formatDate(a.date)}</td>
                    <td>${a.driver_name || driver?.name || '-'}</td>
                    <td>${a.driver_plate || driver?.plate || '-'}</td>
                    <td>${a.client || driver?.client || '-'}</td>
                    <td>${isPending ? '<span class="text-muted">-</span>' : formatNumber(a.quantity, 2)}</td>
                    <td>${isPending ? '<span class="text-muted">-</span>' : formatPricePerLiter(a.price_per_liter)}</td>
                    <td class="${isPending ? '' : 'value-negative'}" style="white-space:nowrap;">${isPending ? '<span class="text-muted">Pendente</span>' : '-' + formatCurrency(a.total_value)}</td>
                    <td>${comprovanteCell}</td>
                    <td>${statusCell}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        }).join('');
}

// Assign comprovante abastecimento to an abastecimento
window.assignAbastComprovante = async function (abastecimentoId, comprovanteId) {
    if (!comprovanteId) return;

    try {
        await apiRequest(`/ admin / comprovantes - abastecimento / ${comprovanteId} / assign`, {
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
        await apiRequest(`/ admin / abastecimentos / ${abastecimentoId} / unassign - comprovante`, {
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

    // Build driver options dropdown
    const driverOptions = drivers.map(d =>
        `<option value="${d.id}" ${abastecimento.driver_id === d.id ? 'selected' : ''}>${d.name}</option>`
    ).join('');

    // Get plates for the current driver
    const currentDriver = drivers.find(d => d.id === abastecimento.driver_id);
    const currentPlate = abastecimento.plate || abastecimento.driver_plate || '';

    // Helper function to get all plates for a driver
    const getDriverPlates = (driver) => {
        if (!driver) return [];
        let plates = [];
        if (driver.plate) plates.push(driver.plate);
        if (driver.plates) {
            try {
                const additionalPlates = typeof driver.plates === 'string' ? JSON.parse(driver.plates) : driver.plates;
                if (Array.isArray(additionalPlates)) {
                    plates = [...new Set([...plates, ...additionalPlates])];
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        return plates;
    };

    const currentDriverPlates = getDriverPlates(currentDriver);
    const plateOptions = currentDriverPlates.map(p =>
        `<option value="${p}" ${currentPlate === p ? 'selected' : ''}>${p}</option>`
    ).join('') || '<option value="">Nenhuma placa</option>';

    showModal(title, `
        <input type="hidden" id="editAbastId" value="${id}">
        <div class="input-group">
            <label>Motorista</label>
            <select id="editAbastDriver" required>${driverOptions}</select>
        </div>
        <div class="input-group">
            <label>Placa</label>
            <select id="editAbastPlate" required>${plateOptions}</select>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="date" id="editAbastDate" value="${abastecimento.date}" required>
        </div>
        <div class="input-group">
            <label>Cliente (Opcional)</label>
            <select id="editAbastClient">${clientOptions}</select>
        </div>
        <div class="input-group">
            <label>Litros</label>
            <input type="number" step="0.01" id="editAbastQuantity" value="${abastecimento.quantity ? abastecimento.quantity.toFixed(2) : ''}" required>
        </div>
        <div class="input-group">
            <label>Preço por Litro (R$)</label>
            <input type="number" step="0.0001" id="editAbastPrice" value="${abastecimento.price_per_liter ? abastecimento.price_per_liter.toFixed(4) : ''}" required>
        </div>
        <div class="input-group">
            <label>Comprovante ${abastecimento.comprovante_abastecimento ? '(já anexado - enviar novo substitui)' : ''}</label>
            <input type="file" id="editAbastComprovante" class="file-input" accept="image/png, image/jpeg">
            ${abastecimento.comprovante_abastecimento ? `<a href="${abastecimento.comprovante_abastecimento}" target="_blank" style="color:var(--accent-primary);font-size:0.85rem;margin-top:0.25rem;">📷 Ver atual</a>` : ''}
        </div>
`, async () => {
        const formData = new FormData();
        formData.append('driver_id', document.getElementById('editAbastDriver').value);
        formData.append('plate', document.getElementById('editAbastPlate').value);
        formData.append('date', document.getElementById('editAbastDate').value);
        formData.append('quantity', parseFloat(document.getElementById('editAbastQuantity').value));
        formData.append('price_per_liter', parseFloat(document.getElementById('editAbastPrice').value));
        formData.append('client', document.getElementById('editAbastClient').value);

        const comprovanteFile = document.getElementById('editAbastComprovante').files[0];
        if (comprovanteFile) formData.append('comprovante_abastecimento', comprovanteFile);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token} `;

        const response = await fetch(`${API_BASE} /admin/abastecimentos / ${id} `, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update abastecimento');
        }

        await loadAbastecimentos();
        renderAbastecimentosTable();
    }, async () => {
        // Delete callback
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token} `;

        const response = await fetch(`${API_BASE} /admin/abastecimentos / ${id} `, {
            method: 'DELETE',
            headers
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao excluir abastecimento');
        }

        await loadAbastecimentos();
    });

    // Add event listener to update plate dropdown when driver changes
    setTimeout(() => {
        const driverSelect = document.getElementById('editAbastDriver');
        const plateSelect = document.getElementById('editAbastPlate');

        if (driverSelect && plateSelect) {
            driverSelect.addEventListener('change', function () {
                const selectedDriverId = parseInt(this.value);
                const selectedDriver = drivers.find(d => d.id === selectedDriverId);
                const plates = getDriverPlates(selectedDriver);

                plateSelect.innerHTML = plates.length > 0
                    ? plates.map(p => `<option value="${p}">${p}</option>`).join('')
                    : '<option value="">Nenhuma placa</option>';
            });
        }
    }, 100);
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
            <input type="number" step="0.01" id="newAbastQuantity" placeholder="0.00" required>
        </div>
        <div class="input-group">
            <label>Preço por Litro (R$)</label>
            <input type="number" step="0.0001" id="newAbastPrice" value="5.5000" placeholder="0.0000" required>
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
        if (token) headers['Authorization'] = `Bearer ${token} `;

        const response = await fetch(`${API_BASE} /admin/abastecimentos`, {
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
    document.getElementById('outrosInsumosPageInfo').textContent = `Página ${pagination.outrosInsumos.page} de ${totalPages} `;
    document.getElementById('outrosInsumosPrevBtn').disabled = pagination.outrosInsumos.page === 1;
    document.getElementById('outrosInsumosNextBtn').disabled = pagination.outrosInsumos.page === totalPages;

    tbody.innerHTML = pageItems.length === 0
        ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Nenhum insumo encontrado</td></tr>'
        : pageItems.map(oi => {
            // Status badge for paid status
            const isPaid = oi.paid === 1 || oi.paid === true;
            let statusCell;
            if (oi.total_value > 0) {
                statusCell = isPaid
                    ? `<span class="status-badge status-paid">Pago</span>`
                    : `<span class="status-badge status-pending">Pendente</span>`;
            } else {
                statusCell = '<span class="text-muted">-</span>';
            }

            // Comprovante cell
            let comprovanteCell;
            if (oi.comprovante) {
                comprovanteCell = `<a href="${oi.comprovante}" target="_blank" class="btn btn-sm btn-outline">📷</a>`;
            } else {
                comprovanteCell = '<span class="text-muted">-</span>';
            }

            return `
                <tr>
                    <td>${formatDate(oi.date)}</td>
                    <td>${formatNumber(oi.quantity)}</td>
                    <td>${oi.description || '-'}</td>
                    <td>${formatCurrency(oi.unit_price)}</td>
                    <td class="value-negative" style="white-space:nowrap;">-${formatCurrency(oi.total_value)}</td>
                    <td>${comprovanteCell}</td>
                    <td>${statusCell}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="editOutrosInsumo(${oi.id})">Editar</button></td>
                </tr>
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

// Edit outros insumo
window.editOutrosInsumo = async function (id) {
    const insumo = allOutrosInsumos.find(oi => oi.id === id);
    if (!insumo) return;

    showModal('Editar Outros Insumos', `
        <input type="hidden" id="editOutrosId" value="${id}">
        <div class="input-group">
            <label>Motorista</label>
            <input type="text" value="${insumo.driver_name || '-'}" disabled>
        </div>
        <div class="input-group">
            <label>Data</label>
            <input type="date" id="editOutrosDate" value="${insumo.date}" required>
        </div>
        <div class="input-group">
            <label>Quantidade</label>
            <input type="number" step="0.01" id="editOutrosQuantity" value="${insumo.quantity}" required>
        </div>
        <div class="input-group">
            <label>Descrição</label>
            <input type="text" id="editOutrosDescription" value="${insumo.description || ''}" placeholder="Ex: Óleo, Filtro, Pneu...">
        </div>
        <div class="input-group">
            <label>Preço Unitário (R$)</label>
            <input type="number" step="0.01" id="editOutrosPrice" value="${insumo.unit_price}" required>
        </div>
        <div class="input-group">
            <label>Comprovante ${insumo.comprovante ? '(já anexado - enviar novo substitui)' : ''}</label>
            <input type="file" id="editOutrosComprovante" class="file-input" accept="image/png, image/jpeg">
            ${insumo.comprovante ? `<a href="${insumo.comprovante}" target="_blank" style="color:var(--accent-primary);font-size:0.85rem;margin-top:0.25rem;">📷 Ver atual</a>` : ''}
        </div>
`, async () => {
        const formData = new FormData();
        formData.append('date', document.getElementById('editOutrosDate').value);
        formData.append('quantity', parseFloat(document.getElementById('editOutrosQuantity').value));
        formData.append('description', document.getElementById('editOutrosDescription').value);
        formData.append('unit_price', parseFloat(document.getElementById('editOutrosPrice').value));

        const comprovanteFile = document.getElementById('editOutrosComprovante').files[0];
        if (comprovanteFile) formData.append('comprovante', comprovanteFile);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token} `;

        const response = await fetch(`${API_BASE} /admin/outrosinsumos / ${id} `, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update outros insumo');
        }

        await loadOutrosInsumos();
    }, async () => {
        // Delete callback
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token} `;

        const response = await fetch(`${API_BASE} /admin/outrosinsumos / ${id} `, {
            method: 'DELETE',
            headers
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao excluir insumo');
        }

        await loadOutrosInsumos();
    });
};

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

    // Get unique clients from freights - tracking both transportadora and driver values
    allFreights.filter(f => f.client && f.status === 'complete').forEach(f => {
        if (!clientStats[f.client]) {
            clientStats[f.client] = {
                name: f.client,
                drivers: new Set(),
                freightCount: 0,
                receivedTotal: 0,      // From client (transportadora value)
                toReceiveTotal: 0,     // From client (transportadora value)
                paidToDriver: 0,       // To driver (driver value)
                toPayDriver: 0         // To driver (driver value)
            };
        }
        clientStats[f.client].drivers.add(f.driver_id);
        clientStats[f.client].freightCount++;

        // Client value (transportadora) - what we receive from client
        const clientValue = f.total_value_transportadora || f.total_value || 0;
        // Driver value - what we pay to driver
        const driverValue = f.total_value || 0;

        if (f.client_paid) {
            clientStats[f.client].receivedTotal += clientValue;
        } else {
            clientStats[f.client].toReceiveTotal += clientValue;
        }

        // Track driver payments (using f.paid for driver payment status)
        if (f.paid) {
            clientStats[f.client].paidToDriver += driverValue;
        } else {
            clientStats[f.client].toPayDriver += driverValue;
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
                toReceiveTotal: 0,
                paidToDriver: 0,
                toPayDriver: 0
            };
        }
    });

    // Calculate lucro for each client
    const clientsList = Object.values(clientStats).map(c => {
        // Lucro = (Total from client: received + to receive) - (Total to driver: paid + to pay)
        const totalFromClient = c.receivedTotal + c.toReceiveTotal;
        const totalToDriver = c.paidToDriver + c.toPayDriver;
        const lucro = totalFromClient - totalToDriver;

        return {
            ...c,
            driverCount: c.drivers.size,
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

        // Client values (transportadora) - what we receive from client
        const receivedTotal = clientFreights.filter(f => f.client_paid).reduce((sum, f) => sum + (f.total_value_transportadora || f.total_value || 0), 0);
        const toReceiveTotal = clientFreights.filter(f => !f.client_paid).reduce((sum, f) => sum + (f.total_value_transportadora || f.total_value || 0), 0);

        // Driver values - what we pay to driver
        const paidToDriver = clientFreights.filter(f => f.paid).reduce((sum, f) => sum + (f.total_value || 0), 0);
        const toPayDriver = clientFreights.filter(f => !f.paid).reduce((sum, f) => sum + (f.total_value || 0), 0);

        // Get abastecimentos and insumos for these drivers (for display only)
        const clientAbast = allAbastecimentos.filter(a => driverIds.includes(a.driver_id));
        const clientInsumos = allOutrosInsumos.filter(oi => driverIds.includes(oi.driver_id));

        const abastTotal = clientAbast.reduce((sum, a) => sum + (a.total_value || 0), 0);
        const insumosTotal = clientInsumos.reduce((sum, oi) => sum + (oi.total_value || 0), 0);

        // Lucro = (Total from client) - (Total to driver)
        const totalFromClient = receivedTotal + toReceiveTotal;
        const totalToDriver = paidToDriver + toPayDriver;
        const lucro = totalFromClient - totalToDriver;

        document.getElementById('clientsListView').classList.add('hidden');
        document.getElementById('clientDetailView').classList.remove('hidden');

        document.getElementById('clientDetailName').textContent = `🏢 ${decodedName} `;
        document.getElementById('clientDriverCount').textContent = driverIds.length;
        document.getElementById('clientFreightCount').textContent = clientFreights.length;
        document.getElementById('clientReceivedValue').textContent = formatCurrency(receivedTotal);
        document.getElementById('clientToReceive').textContent = toReceiveTotal > 0 ? formatCurrency(toReceiveTotal) : '0,00';

        document.getElementById('clientFreightsBody').innerHTML = clientFreights.map(f => {
            const isPaid = f.client_paid === 1 || f.client_paid === true;
            const valorTransp = f.total_value_transportadora || f.total_value || 0;
            const precoTransp = f.price_per_km_ton_transportadora || f.price_per_km_ton || 0;

            // Recebimento cell - with upload capability
            let recebimentoCell;
            if (f.comprovante_recebimento) {
                recebimentoCell = `
                    <a href="${f.comprovante_recebimento}" target="_blank" class="btn btn-sm btn-outline" title="Ver comprovante">📷</a>
                    <label class="btn btn-sm btn-outline" style="cursor:pointer;margin-left:4px;" title="Substituir comprovante">
                        📤
                        <input type="file" accept="image/png,image/jpeg" style="display:none;" onchange="uploadRecebimento(${f.id}, this)">
                    </label>`;
            } else {
                recebimentoCell = `
                    <label class="btn btn-sm btn-primary" style="cursor:pointer;" title="Anexar comprovante de recebimento">
                        📤
                        <input type="file" accept="image/png,image/jpeg" style="display:none;" onchange="uploadRecebimento(${f.id}, this)">
                    </label>`;
            }

            return `
                <tr>
                    <td>${formatDate(f.date)}</td>
                    <td>${f.driver_name}</td>
                    <td>${formatNumber(f.km)}</td>
                    <td>${formatNumber(f.tons, 2)}</td>
                    <td>${formatPricePerKmTon(precoTransp)}</td>
                    <td class="value-positive">${formatCurrency(valorTransp)}</td>
                    <td>${recebimentoCell}</td>
                    <td><input type="checkbox" class="paid-checkbox" ${isPaid ? 'checked' : ''} onchange="toggleClientPaid(${f.id})"></td>
                </tr>
            `}).join('') || '<tr><td colspan="8" style="text-align:center">Nenhum frete</td></tr>';

        document.getElementById('clientAbastecimentosBody').innerHTML = clientAbast.map(a => `
            <tr>
                <td>${formatDate(a.date)}</td>
                <td>${a.driver_name}</td>
                <td>${formatNumber(a.quantity)}</td>
                <td>${formatCurrency(a.price_per_liter)}</td>
                <td class="value-negative" style="white-space:nowrap;">-${formatCurrency(a.total_value)}</td>
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
        await apiRequest(`/ admin / freights / ${freightId}/toggle-client-paid`, {
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

// Upload comprovante de recebimento for a freight
window.uploadRecebimento = async function (freightId, input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('comprovante_recebimento', file);

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(`${API_BASE}/admin/freights/${freightId}`, {
            method: 'PUT',
            headers,
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao enviar comprovante');
        }

        // Reload freights and re-render
        await loadFreights();

        // Re-open the same client detail view to refresh
        const clientName = document.getElementById('clientDetailName').textContent.replace('🏢 ', '');
        if (clientName) {
            viewClientDetails(encodeURIComponent(clientName));
        }

        alert('Comprovante de recebimento anexado com sucesso!');
    } catch (error) {
        console.error('Upload recebimento error:', error);
        alert('Erro ao enviar comprovante: ' + error.message);
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
let modalDeleteCallback = null;

function showModal(title, content, onSubmit, onDelete = null) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalForm').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
    modalCallback = onSubmit;
    modalDeleteCallback = onDelete;

    // Show/hide delete button based on whether delete callback is provided
    const deleteBtn = document.getElementById('modalDelete');
    if (deleteBtn) {
        deleteBtn.style.display = onDelete ? 'inline-flex' : 'none';
    }
}

function hideModal() {
    document.getElementById('modal').classList.add('hidden');
    modalCallback = null;
    modalDeleteCallback = null;

    // Hide delete button
    const deleteBtn = document.getElementById('modalDelete');
    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }
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

    // Delete button handler
    const deleteBtn = document.getElementById('modalDelete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (modalDeleteCallback) {
                if (confirm('Tem certeza que deseja excluir? Esta ação não pode ser desfeita.')) {
                    try {
                        await modalDeleteCallback();
                        hideModal();
                    } catch (error) {
                        alert(error.message);
                    }
                }
            }
        });
    }
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
    // Render Fretes (positive)
    const fretesBody = document.getElementById('unpaidFreightsBody');
    const driverFreights = allFreights.filter(f =>
        f.driver_id === currentDriverForPayment.id &&
        f.status === 'complete' &&
        !f.paid
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (driverFreights.length === 0) {
        fretesBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem;">Nenhum frete não pago</td></tr>';
    } else {
        fretesBody.innerHTML = driverFreights.map(f => `
            <tr>
                <td>${formatDate(f.date)}</td>
                <td>${f.client || 'Frete'} - ${formatNumber(f.km)}km / ${formatNumber(f.tons, 2)}t</td>
                <td class="value-positive">${formatCurrency(f.total_value)}</td>
                <td><input type="checkbox" class="payment-check freight-check" data-id="${f.id}" data-date="${f.date}" data-value="${f.total_value}"></td>
            </tr>
        `).join('');
    }

    // Render Abastecimentos (negative)
    const abastBody = document.getElementById('unpaidAbastBody');
    const driverAbast = allAbastecimentos.filter(a =>
        a.driver_id === currentDriverForPayment.id &&
        a.status === 'complete' &&
        (a.paid === 0 || a.paid === null || a.paid === undefined || !a.paid)
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (driverAbast.length === 0) {
        abastBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem;">Nenhum abastecimento não pago</td></tr>';
    } else {
        abastBody.innerHTML = driverAbast.map(a => `
            <tr>
                <td>${formatDate(a.date)}</td>
                <td>${formatNumber(a.quantity)} L x ${formatCurrency(a.price_per_liter)}/L</td>
                <td class="value-negative">-${formatCurrency(a.total_value)}</td>
                <td><input type="checkbox" class="payment-check abast-check" data-id="${a.id}" data-date="${a.date}" data-value="${a.total_value}"></td>
            </tr>
        `).join('');
    }

    // Render Outros Insumos (negative)
    const insumosBody = document.getElementById('unpaidInsumosBody');
    const driverInsumos = allOutrosInsumos.filter(oi =>
        oi.driver_id === currentDriverForPayment.id &&
        (oi.paid === 0 || oi.paid === null || oi.paid === undefined || !oi.paid)
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (driverInsumos.length === 0) {
        insumosBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem;">Nenhum insumo não pago</td></tr>';
    } else {
        insumosBody.innerHTML = driverInsumos.map(oi => `
            <tr>
                <td>${formatDate(oi.date)}</td>
                <td>${oi.description || 'Insumo'} x ${formatNumber(oi.quantity)}</td>
                <td class="value-negative">-${formatCurrency(oi.total_value)}</td>
                <td><input type="checkbox" class="payment-check insumo-check" data-id="${oi.id}" data-date="${oi.date}" data-value="${oi.total_value}"></td>
            </tr>
        `).join('');
    }

    // Add event listeners for live calculation
    document.querySelectorAll('.payment-check').forEach(cb => {
        cb.addEventListener('change', updatePaymentSummary);
    });

    // Initialize summary with zeros
    updatePaymentSummary();
}

function updatePaymentSummary() {
    let freightsTotal = 0;
    let abastTotal = 0;
    let insumosTotal = 0;

    // Calculate selected freights
    document.querySelectorAll('.freight-check:checked').forEach(cb => {
        freightsTotal += parseFloat(cb.dataset.value);
    });

    // Calculate selected abastecimentos
    document.querySelectorAll('.abast-check:checked').forEach(cb => {
        abastTotal += parseFloat(cb.dataset.value);
    });

    // Calculate selected insumos
    document.querySelectorAll('.insumo-check:checked').forEach(cb => {
        insumosTotal += parseFloat(cb.dataset.value);
    });

    // Net total = Fretes - Abastecimentos - Insumos
    const netTotal = freightsTotal - abastTotal - insumosTotal;

    // Update UI
    document.getElementById('selectedFreightsTotal').textContent = formatCurrency(freightsTotal);
    document.getElementById('selectedAbastTotal').textContent = `-${formatCurrency(abastTotal)}`;
    document.getElementById('selectedInsumosTotal').textContent = `-${formatCurrency(insumosTotal)}`;
    document.getElementById('netTotalToPay').textContent = formatCurrency(netTotal);

    // Color the net total based on positive/negative
    const netEl = document.getElementById('netTotalToPay');
    netEl.className = netTotal >= 0 ? 'value-positive' : 'value-negative';
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
    const freightCheckboxes = document.querySelectorAll('.freight-check:checked');
    const abastCheckboxes = document.querySelectorAll('.abast-check:checked');
    const insumoCheckboxes = document.querySelectorAll('.insumo-check:checked');

    if (freightCheckboxes.length === 0 && abastCheckboxes.length === 0 && insumoCheckboxes.length === 0) {
        alert('Selecione pelo menos um item para gerar o pagamento.');
        return;
    }

    const freightIds = [];
    const abastecimentoIds = [];
    const outrosInsumoIds = [];
    const dates = [];
    let freightsTotal = 0;
    let abastTotal = 0;
    let insumosTotal = 0;

    freightCheckboxes.forEach(cb => {
        freightIds.push(parseInt(cb.dataset.id));
        dates.push(cb.dataset.date);
        freightsTotal += parseFloat(cb.dataset.value);
    });

    abastCheckboxes.forEach(cb => {
        abastecimentoIds.push(parseInt(cb.dataset.id));
        dates.push(cb.dataset.date);
        abastTotal += parseFloat(cb.dataset.value);
    });

    insumoCheckboxes.forEach(cb => {
        outrosInsumoIds.push(parseInt(cb.dataset.id));
        dates.push(cb.dataset.date);
        insumosTotal += parseFloat(cb.dataset.value);
    });

    // Net total = Fretes - Abastecimentos - Insumos
    const netTotal = freightsTotal - abastTotal - insumosTotal;
    const dateRange = calculateDateRange(dates);

    // Show modal to optionally attach comprovante
    showModal('Gerar Pagamento', `
        <div class="payment-summary">
            <div class="input-group">
                <label>Período</label>
                <input type="text" value="${dateRange}" disabled>
            </div>
            <div class="input-group">
                <label>Fretes (+)</label>
                <input type="text" value="${formatCurrency(freightsTotal)}" disabled style="color: var(--success);">
            </div>
            <div class="input-group">
                <label>Abastecimentos (-)</label>
                <input type="text" value="-${formatCurrency(abastTotal)}" disabled style="color: var(--error);">
            </div>
            <div class="input-group">
                <label>Outros Insumos (-)</label>
                <input type="text" value="-${formatCurrency(insumosTotal)}" disabled style="color: var(--error);">
            </div>
            <div class="input-group">
                <label><strong>Total Líquido a Pagar</strong></label>
                <input type="text" value="${formatCurrency(netTotal)}" disabled style="font-weight: bold; color: var(--accent-primary);">
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
        formData.append('total_value', netTotal);
        formData.append('freight_ids', JSON.stringify(freightIds));
        formData.append('abastecimento_ids', JSON.stringify(abastecimentoIds));
        formData.append('outros_insumo_ids', JSON.stringify(outrosInsumoIds));

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
        await loadAbastecimentos();
        await loadOutrosInsumos();
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
// Financeiro Page
// ========================================

function renderFinanceiroDriversTable(filter = '') {
    const tbody = document.getElementById('financeiroDriversTableBody');
    if (!tbody) return;

    // Only show motoristas (drivers) in the financeiro page
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

    tbody.innerHTML = filtered.length === 0
        ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhum motorista encontrado</td></tr>'
        : filtered.map(d => {
            // Find unpaid total for driver
            const unpaidEntry = unpaidTotals.find(ut => ut.driver_id === d.id);
            const unpaidAmount = unpaidEntry ? unpaidEntry.unpaid_total : 0;
            const unpaidClass = unpaidAmount > 0 ? 'value-negative' : 'text-muted';

            // Format plates - show all plates
            let platesDisplay = d.plate || '-';
            if (d.plates) {
                try {
                    const additionalPlates = typeof d.plates === 'string' ? JSON.parse(d.plates) : d.plates;
                    if (Array.isArray(additionalPlates) && additionalPlates.length > 0) {
                        const allPlates = [d.plate, ...additionalPlates];
                        platesDisplay = allPlates.map(p => `<span class="plate-badge">${p}</span>`).join('');
                    }
                } catch (e) {
                    // If parsing fails, just show the primary plate
                }
            }

            return `
            <tr>
                <td>${d.name}</td>
                <td>${formatCPF(d.cpf)}</td>
                <td class="plates-cell">${platesDisplay}</td>
                <td class="${unpaidClass}">${unpaidAmount > 0 ? formatCurrency(unpaidAmount) : '-'}</td>
                <td><button class="btn btn-sm btn-primary" onclick="openDriverPayments(${d.id})">💰 Pagamento</button></td>
            </tr>
        `}).join('');
}

function renderFinanceiroPaymentsTable() {
    const tbody = document.getElementById('financeiroPaymentsTableBody');
    if (!tbody) return;

    const driverFilter = document.getElementById('finPaymentDriverFilter')?.value || '';
    const clientFilter = document.getElementById('finPaymentClientFilter')?.value || '';
    const dateFilter = document.getElementById('finPaymentDateFilter')?.value || '';

    // Filter only complete freights with values
    let filtered = allFreights.filter(f => f.status === 'complete' && (f.total_value > 0 || f.total_value_transportadora > 0));

    if (driverFilter) filtered = filtered.filter(f => f.driver_id == driverFilter);
    if (clientFilter) filtered = filtered.filter(f => f.client === clientFilter);
    if (dateFilter) filtered = filtered.filter(f => f.date === dateFilter);

    // Sort by date descending
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination Logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pagination.finPayments.limit) || 1;

    if (pagination.finPayments.page > totalPages) pagination.finPayments.page = totalPages;
    if (pagination.finPayments.page < 1) pagination.finPayments.page = 1;

    const start = (pagination.finPayments.page - 1) * pagination.finPayments.limit;
    const end = start + pagination.finPayments.limit;
    const pageItems = filtered.slice(start, end);

    // Update UI Controls
    const pageInfo = document.getElementById('finPaymentsPageInfo');
    const prevBtn = document.getElementById('finPaymentsPrevBtn');
    const nextBtn = document.getElementById('finPaymentsNextBtn');

    if (pageInfo) pageInfo.textContent = `Página ${pagination.finPayments.page} de ${totalPages}`;
    if (prevBtn) prevBtn.disabled = pagination.finPayments.page === 1;
    if (nextBtn) nextBtn.disabled = pagination.finPayments.page === totalPages;

    tbody.innerHTML = pageItems.length === 0
        ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Nenhum pagamento encontrado</td></tr>'
        : pageItems.map(f => {
            const driver = drivers.find(d => d.id === f.driver_id);
            const isPaid = f.paid === 1 || f.paid === true;
            const statusCell = isPaid
                ? `<span class="status-badge status-paid" onclick="togglePaid(${f.id})" style="cursor:pointer;">Pago</span>`
                : `<span class="status-badge status-pending" onclick="togglePaid(${f.id})" style="cursor:pointer;">Pendente</span>`;

            return `
                <tr>
                    <td>${formatDate(f.date)}</td>
                    <td>${f.driver_name || driver?.name || '-'}</td>
                    <td>${f.client || '<span class="text-muted">-</span>'}</td>
                    <td>${f.price_per_km_ton > 0 ? formatPricePerKmTon(f.price_per_km_ton) : '<span class="text-muted">-</span>'}</td>
                    <td class="${f.total_value > 0 ? 'value-positive' : ''}">${f.total_value > 0 ? formatCurrency(f.total_value) : '<span class="text-muted">-</span>'}</td>
                    <td>${f.price_per_km_ton_transportadora > 0 ? formatPricePerKmTon(f.price_per_km_ton_transportadora) : '<span class="text-muted">-</span>'}</td>
                    <td class="${f.total_value_transportadora > 0 ? 'value-positive' : ''}">${f.total_value_transportadora > 0 ? formatCurrency(f.total_value_transportadora) : '<span class="text-muted">-</span>'}</td>
                    <td>${statusCell}</td>
                </tr>
            `;
        }).join('');
}

function updateFinanceiroFilters() {
    const driverSelect = document.getElementById('finPaymentDriverFilter');
    const clientSelect = document.getElementById('finPaymentClientFilter');

    if (driverSelect) {
        const driverOptions = '<option value="">Todos os motoristas</option>' +
            drivers.map(d => `<option value="${d.id}">${d.name} (${d.plate})</option>`).join('');
        driverSelect.innerHTML = driverOptions;
    }

    if (clientSelect) {
        const uniqueClients = [...new Set(drivers.filter(d => d.client).map(d => d.client))];
        const clientOptions = '<option value="">Todos os clientes</option>' +
            uniqueClients.map(c => `<option value="${c}">${c}</option>`).join('');
        clientSelect.innerHTML = clientOptions;
    }
}

function initFinanceiroPage() {
    // Tab switching for Financeiro page
    const financeiroPage = document.getElementById('financeiroPage');
    if (!financeiroPage) return;

    financeiroPage.querySelectorAll('.payment-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            financeiroPage.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            financeiroPage.querySelectorAll('.payment-tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(tabName + 'Tab').classList.remove('hidden');

            // Render the appropriate table when switching tabs
            if (tabName === 'finDrivers') {
                renderFinanceiroDriversTable();
            } else if (tabName === 'finPayments') {
                updateFinanceiroFilters();
                renderFinanceiroPaymentsTable();
            }
        });
    });

    // Search filter for drivers in Financeiro
    const finDriverSearch = document.getElementById('finDriverSearch');
    if (finDriverSearch) {
        finDriverSearch.addEventListener('input', (e) => {
            renderFinanceiroDriversTable(e.target.value);
        });
    }

    // Filters for payments
    const paymentFilters = ['finPaymentDriverFilter', 'finPaymentClientFilter', 'finPaymentDateFilter'];
    paymentFilters.forEach(filterId => {
        const el = document.getElementById(filterId);
        if (el) {
            el.addEventListener('change', renderFinanceiroPaymentsTable);
        }
    });

    // Pagination for payments
    const finPaymentsPageSize = document.getElementById('finPaymentsPageSize');
    if (finPaymentsPageSize) {
        finPaymentsPageSize.addEventListener('change', (e) => {
            pagination.finPayments.limit = parseInt(e.target.value);
            pagination.finPayments.page = 1;
            renderFinanceiroPaymentsTable();
        });
    }

    const finPaymentsPrevBtn = document.getElementById('finPaymentsPrevBtn');
    if (finPaymentsPrevBtn) {
        finPaymentsPrevBtn.addEventListener('click', () => {
            if (pagination.finPayments.page > 1) {
                pagination.finPayments.page--;
                renderFinanceiroPaymentsTable();
            }
        });
    }

    const finPaymentsNextBtn = document.getElementById('finPaymentsNextBtn');
    if (finPaymentsNextBtn) {
        finPaymentsNextBtn.addEventListener('click', () => {
            pagination.finPayments.page++;
            renderFinanceiroPaymentsTable();
        });
    }

    // Initial render
    renderFinanceiroDriversTable();
}

// ========================================
// Extratos (Motorista) Page
// ========================================


let selectedExtratoDriverId = null;
let cachedExtratoData = null; // Cache for export

async function exportExtratoPDF() {
    if (!selectedExtratoDriverId || !cachedExtratoData) {
        alert('Selecione um motorista primeiro');
        return;
    }

    const { driverName } = cachedExtratoData;
    const content = document.getElementById('extratoContent');

    if (!content) {
        alert('Conteúdo não encontrado');
        return;
    }

    // Show loading state
    const exportBtn = document.getElementById('exportExtratoBtn');
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Gerando PDF...';
    exportBtn.disabled = true;

    try {
        // Apply print mode for white background and black text
        content.classList.add('pdf-print-mode');

        // Wait for styles to apply
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture the content as canvas
        const canvas = await html2canvas(content, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        // Remove print mode
        content.classList.remove('pdf-print-mode');

        // Create PDF with A4 dimensions
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // Calculate image dimensions to fit A4
        const imgWidth = pageWidth - 20;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Add white background and black header text
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');

        // Add logo to top right corner
        try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                logoImg.onload = resolve;
                logoImg.onerror = reject;
                logoImg.src = '../images/logo1.jpg';
            });
            const logoCanvas = document.createElement('canvas');
            logoCanvas.width = logoImg.width;
            logoCanvas.height = logoImg.height;
            const logoCtx = logoCanvas.getContext('2d');
            logoCtx.drawImage(logoImg, 0, 0);
            const logoData = logoCanvas.toDataURL('image/png');
            const logoWidth = 25; // mm
            const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
            pdf.addImage(logoData, 'PNG', pageWidth - logoWidth - 10, 5, logoWidth, logoHeight);
        } catch (e) {
            console.warn('Could not add logo to PDF:', e);
        }

        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(16);
        pdf.text(`Extrato - ${driverName}`, 10, 15);
        pdf.setFontSize(10);
        pdf.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 10, 22);

        // Add content image
        const imgData = canvas.toDataURL('image/png');

        // Handle multi-page if content is too long
        let yPosition = 30;
        const maxHeightPerPage = pageHeight - 40;

        if (imgHeight <= maxHeightPerPage) {
            pdf.addImage(imgData, 'PNG', 10, yPosition, imgWidth, imgHeight);
        } else {
            let sourceY = 0;
            const sourceHeight = canvas.height;
            const pixelsPerPage = (maxHeightPerPage / imgHeight) * sourceHeight;

            while (sourceY < sourceHeight) {
                if (sourceY > 0) {
                    pdf.addPage();
                    pdf.setFillColor(255, 255, 255);
                    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
                    yPosition = 10;
                }

                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = Math.min(pixelsPerPage, sourceHeight - sourceY);
                const ctx = pageCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, sourceY, canvas.width, pageCanvas.height, 0, 0, canvas.width, pageCanvas.height);

                const pageImgData = pageCanvas.toDataURL('image/png');
                const pageImgHeight = (pageCanvas.height * imgWidth) / canvas.width;
                pdf.addImage(pageImgData, 'PNG', 10, yPosition, imgWidth, pageImgHeight);

                sourceY += pixelsPerPage;
            }
        }

        // Generate filename and save
        const sanitizedName = driverName.replace(/[^a-zA-Z0-9]/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `Extrato_${sanitizedName}_${dateStr}.pdf`;

        pdf.save(filename);
    } catch (error) {
        console.error('PDF export error:', error);
        content.classList.remove('pdf-print-mode');
        alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
    }
}


function initExtratosPage() {
    const driverSelect = document.getElementById('extratoDriverSelect');
    const exportBtn = document.getElementById('exportExtratoBtn');

    if (driverSelect) {
        driverSelect.addEventListener('change', (e) => {
            const driverId = e.target.value;
            if (driverId) {
                selectedExtratoDriverId = parseInt(driverId);
                loadAdminExtrato(selectedExtratoDriverId);
                if (exportBtn) exportBtn.style.display = 'inline-flex';
            } else {
                selectedExtratoDriverId = null;
                document.getElementById('extratoContent').style.display = 'none';
                document.getElementById('extratoPlaceholder').style.display = 'block';
                if (exportBtn) exportBtn.style.display = 'none';
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', exportExtratoPDF);
    }
}

function populateExtratoDriverSelect() {
    const select = document.getElementById('extratoDriverSelect');
    if (!select) return;

    // Get only drivers (not abastecedores)
    const activeDrivers = drivers.filter(d => d.active);

    select.innerHTML = '<option value="">Selecione um motorista</option>' +
        activeDrivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function loadAdminExtrato(driverId) {
    // Show content, hide placeholder
    document.getElementById('extratoContent').style.display = 'block';
    document.getElementById('extratoPlaceholder').style.display = 'none';

    // Get driver data from existing arrays
    const driverFreights = allFreights.filter(f => f.driver_id === driverId && f.status === 'complete');
    const driverAbast = allAbastecimentos.filter(a => a.driver_id === driverId);
    const driverInsumos = allOutrosInsumos.filter(oi => oi.driver_id === driverId);

    // Calculate stats
    const totalFretes = driverFreights.reduce((sum, f) => sum + (f.total_value || 0), 0);
    const totalAbast = driverAbast.reduce((sum, a) => sum + (a.total_value || 0), 0);
    const totalInsumos = driverInsumos.reduce((sum, oi) => sum + (oi.total_value || 0), 0);

    // Get payments for this driver
    let payments = [];
    let totalPago = 0;
    try {
        payments = await apiRequest(`/admin/payments?driver_id=${driverId}`);
        totalPago = payments.reduce((sum, p) => sum + (p.total_value || 0), 0);
    } catch (e) {
        console.error('Error loading payments:', e);
    }

    // Total a Receber = Fretes - Abast - Insumos - Pago
    const totalAReceber = totalFretes - totalAbast - totalInsumos - totalPago;

    // Cache data for export
    const driver = drivers.find(d => d.id === driverId);
    cachedExtratoData = {
        driverName: driver?.name || 'Motorista',
        driverFreights,
        driverAbast,
        driverInsumos,
        payments,
        totals: { totalFretes, totalAbast, totalInsumos, totalAReceber, totalPago }
    };

    // Update summary cards
    document.getElementById('adminExtratoFretes').textContent = formatCurrency(totalFretes);
    document.getElementById('adminExtratoAbast').textContent = `-${formatCurrency(totalAbast)}`;
    document.getElementById('adminExtratoInsumos').textContent = `-${formatCurrency(totalInsumos)}`;
    document.getElementById('adminExtratoAReceber').textContent = formatCurrency(totalAReceber);
    document.getElementById('adminExtratoPago').textContent = formatCurrency(totalPago);

    // Color the "A Receber" value
    const aReceberEl = document.getElementById('adminExtratoAReceber');
    aReceberEl.className = 'card-value ' + (totalAReceber >= 0 ? 'value-positive' : 'value-negative');

    // Render Fretes table
    const fretesBody = document.getElementById('adminExtratoFretesBody');
    if (driverFreights.length === 0) {
        fretesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nenhum frete encontrado</td></tr>';
    } else {
        fretesBody.innerHTML = driverFreights.map(f => {
            const cargaCell = f.comprovante_carga
                ? `<a href="${f.comprovante_carga}" target="_blank" class="btn btn-sm btn-outline">📷</a>`
                : '<span class="text-muted">-</span>';
            const descargaCell = f.comprovante_descarga
                ? `<a href="${f.comprovante_descarga}" target="_blank" class="btn btn-sm btn-outline">📷</a>`
                : '<span class="text-muted">-</span>';
            const plateDisplay = f.plate || f.driver_plate || '-';
            return `
                <tr>
                    <td>${formatDate(f.date)}</td>
                    <td><span class="plate-badge">${plateDisplay}</span></td>
                    <td>${formatNumber(f.km)}</td>
                    <td>${formatNumber(f.tons, 2)}</td>
                    <td class="value-positive">${formatCurrency(f.total_value)}</td>
                    <td>${cargaCell}</td>
                    <td>${descargaCell}</td>
                </tr>
            `;
        }).join('');
    }

    // Render Abastecimentos table
    const abastBody = document.getElementById('adminExtratoAbastBody');
    if (driverAbast.length === 0) {
        abastBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Nenhum abastecimento encontrado</td></tr>';
    } else {
        abastBody.innerHTML = driverAbast.map(a => {
            const comprovanteCell = a.comprovante_abastecimento
                ? `<a href="${a.comprovante_abastecimento}" target="_blank" class="btn btn-sm btn-outline">📷</a>`
                : '<span class="text-muted">-</span>';
            const plateDisplay = a.plate || a.driver_plate || '-';
            return `
                <tr>
                    <td>${formatDate(a.date)}</td>
                    <td><span class="plate-badge">${plateDisplay}</span></td>
                    <td>${formatNumber(a.quantity)}</td>
                    <td>${formatCurrency(a.price_per_liter)}</td>
                    <td class="value-negative" style="white-space:nowrap;">-${formatCurrency(a.total_value)}</td>
                    <td>${comprovanteCell}</td>
                </tr>
            `;
        }).join('');
    }

    // Render Outros Insumos table
    const insumosBody = document.getElementById('adminExtratoInsumosBody');
    if (driverInsumos.length === 0) {
        insumosBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhum insumo encontrado</td></tr>';
    } else {
        insumosBody.innerHTML = driverInsumos.map(oi => `
            <tr>
                <td>${formatDate(oi.date)}</td>
                <td>${formatNumber(oi.quantity)}</td>
                <td>${oi.description || '-'}</td>
                <td>${formatCurrency(oi.unit_price)}</td>
                <td class="value-negative" style="white-space:nowrap;">-${formatCurrency(oi.total_value)}</td>
            </tr>
        `).join('');
    }

    // Render Pagamentos table
    const pagamentosBody = document.getElementById('adminExtratoPagamentosBody');
    if (payments.length === 0) {
        pagamentosBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Nenhum pagamento recebido</td></tr>';
    } else {
        pagamentosBody.innerHTML = payments.map(p => {
            const comprovanteCell = p.comprovante_path
                ? `<a href="${p.comprovante_path}" target="_blank" class="btn btn-sm btn-outline">📷 Ver</a>`
                : '<span class="text-muted">-</span>';
            return `
                <tr>
                    <td>${p.date_range}</td>
                    <td class="value-positive">${formatCurrency(p.total_value)}</td>
                    <td>${comprovanteCell}</td>
                </tr>
            `;
        }).join('');
    }
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
    initFinanceiroPage();
    initExtratosPage();

    if (token) loadDashboard();
    else showPage(loginPage);
}

// ========================================
// Password Toggle
// ========================================

function initPasswordToggle() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const eyeIcon = this.querySelector('.eye-icon img');

            if (input.type === 'password') {
                input.type = 'text';
                eyeIcon.src = 'eye-closed.png';
                eyeIcon.alt = 'Hide password';
                this.classList.add('active');
            } else {
                input.type = 'password';
                eyeIcon.src = 'eye-open.png';
                eyeIcon.alt = 'Show password';
                this.classList.remove('active');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    initPasswordToggle();
});

