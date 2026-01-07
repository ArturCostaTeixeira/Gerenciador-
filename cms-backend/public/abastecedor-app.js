/**
 * CMS Abastecedor Portal - Frontend Application
 */

const API_BASE = '/api';

// State
let token = localStorage.getItem('abastecedor_token');
let userData = null;
let currentCameraStream = null;
let currentCameraType = null; // 'abast' or 'insumo'
let capturedPhotoData = null;
let driversData = []; // Store drivers for dropdown
let platesData = []; // Store plates with associated drivers
let selectedDriverId = null; // Store selected driver when plate has multiple drivers

// Password reset state
let resetCpf = null;

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const loginFormElement = document.getElementById('loginFormElement');
const loginCpf = document.getElementById('loginCpf');
const loginPassword = document.getElementById('loginPassword');
const authError = document.getElementById('authError');
const logoutBtn = document.getElementById('logoutBtn');
const welcomeText = document.getElementById('welcomeText');

// ========================================
// Utility Functions
// ========================================

function formatCPFInput(input) {
    let value = input.value.replace(/\D/g, '');

    if (value.length > 11) {
        value = value.slice(0, 11);
    }

    // Format as 000.000.000-00
    if (value.length > 9) {
        value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    } else if (value.length > 6) {
        value = value.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    } else if (value.length > 3) {
        value = value.replace(/^(\d{3})(\d{0,3})/, '$1.$2');
    }

    input.value = value;
}

// Fetch drivers for the dropdown
async function fetchDrivers() {
    try {
        const data = await apiRequest('/abastecedor/drivers');
        // Store both formats
        driversData = data.drivers || [];
        platesData = data.plates || [];
        return data;
    } catch (error) {
        console.error('Failed to fetch drivers:', error);
        return { drivers: [], plates: [] };
    }
}

// Populate a plate select dropdown with plates and their drivers info
function populatePlateDropdown(selectElement, plates) {
    // Clear existing options except the first placeholder
    selectElement.innerHTML = '<option value="">Selecione uma placa...</option>';

    plates.forEach(plateInfo => {
        // Only add valid plates (at least 4 characters like ABC-1234)
        if (!plateInfo.plate || plateInfo.plate.length < 4) return;

        const option = document.createElement('option');
        option.value = plateInfo.plate;
        // Show just the plate in the dropdown - cleaner UI
        // If multiple drivers, indicate it with (compartilhada)
        if (plateInfo.multipleDrivers) {
            option.textContent = `${plateInfo.plate} (compartilhada)`;
        } else {
            option.textContent = plateInfo.plate;
        }
        option.dataset.multipleDrivers = plateInfo.multipleDrivers;
        option.dataset.drivers = JSON.stringify(plateInfo.drivers);
        selectElement.appendChild(option);
    });
}

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        ...options.headers
    };

    // Add JSON content-type if body is not FormData
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, { ...options, headers });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

function showError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
}

function hideError() {
    authError.classList.add('hidden');
}

function setLoading(button, loading) {
    const textSpan = button.querySelector('span:first-child');
    const loaderSpan = button.querySelector('.btn-loader');

    if (loading) {
        button.disabled = true;
        if (textSpan) textSpan.classList.add('hidden');
        if (loaderSpan) loaderSpan.classList.remove('hidden');
    } else {
        button.disabled = false;
        if (textSpan) textSpan.classList.remove('hidden');
        if (loaderSpan) loaderSpan.classList.add('hidden');
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// ========================================
// Page Navigation
// ========================================

function showPage(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

    // Show selected page
    const pageElement = document.getElementById(page);
    if (pageElement) {
        pageElement.classList.remove('hidden');
        pageElement.classList.add('active');
    }
}

// ========================================
// Authentication
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    hideError();

    const cpf = loginCpf.value.trim();
    const password = loginPassword.value;

    if (!cpf || !password) {
        showError('CPF e senha são obrigatórios');
        return;
    }

    const submitBtn = loginFormElement.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);

    try {
        const data = await apiRequest('/auth/abastecedor/login', {
            method: 'POST',
            body: { cpf, password }
        });

        // Save token
        token = data.token;
        localStorage.setItem('abastecedor_token', token);

        // Store user data
        userData = data.abastecedor;

        // Show dashboard
        loadDashboard();
    } catch (error) {
        showError(error.message || 'Erro ao fazer login');
    } finally {
        setLoading(submitBtn, false);
    }
}

function logout() {
    token = null;
    userData = null;
    localStorage.removeItem('abastecedor_token');
    showPage('loginPage');
    showLoginForm();

    // Clear forms
    loginFormElement.reset();
    hideError();
}

// ========================================
// Password Recovery Functions
// ========================================

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    document.getElementById('verifyCodeForm').classList.add('hidden');
    document.getElementById('resetPasswordForm').classList.add('hidden');
    hideError();
}

function showForgotPasswordForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('forgotPasswordForm').classList.remove('hidden');
    document.getElementById('verifyCodeForm').classList.add('hidden');
    document.getElementById('resetPasswordForm').classList.add('hidden');
    hideError();
}

function showVerifyCodeForm(phone) {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    document.getElementById('verifyCodeForm').classList.remove('hidden');
    document.getElementById('resetPasswordForm').classList.add('hidden');
    document.getElementById('verifyCodeSubtitle').textContent = `Código enviado para ${phone}`;
    hideError();
}

function showResetPasswordForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    document.getElementById('verifyCodeForm').classList.add('hidden');
    document.getElementById('resetPasswordForm').classList.remove('hidden');
    hideError();
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const form = document.getElementById('forgotPasswordFormElement');
    const button = form.querySelector('button[type="submit"]');
    const cpf = document.getElementById('forgotCpf').value.trim();

    if (!cpf) {
        showError('CPF é obrigatório');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        const response = await apiRequest('/auth/abastecedor/forgot-password', {
            method: 'POST',
            body: { cpf }
        });

        resetCpf = cpf;
        showVerifyCodeForm(response.phone);
        showToast('Código enviado por SMS!', 'success');
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleVerifyCode(e) {
    e.preventDefault();
    const form = document.getElementById('verifyCodeFormElement');
    const button = form.querySelector('button[type="submit"]');
    const code = document.getElementById('verifyCode').value.trim();

    if (!code || code.length !== 6) {
        showError('Digite o código de 6 dígitos');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        await apiRequest('/auth/abastecedor/verify-reset-code', {
            method: 'POST',
            body: { cpf: resetCpf, code }
        });

        showResetPasswordForm();
        showToast('Código verificado!', 'success');
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const form = document.getElementById('resetPasswordFormElement');
    const button = form.querySelector('button[type="submit"]');
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!newPassword || newPassword.length < 4) {
        showError('Senha deve ter pelo menos 4 caracteres');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError('As senhas não coincidem');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        await apiRequest('/auth/abastecedor/reset-password', {
            method: 'POST',
            body: { cpf: resetCpf, newPassword }
        });

        showToast('Senha alterada com sucesso!', 'success');
        showLoginForm();

        // Clear forms
        document.getElementById('forgotPasswordFormElement').reset();
        document.getElementById('verifyCodeFormElement').reset();
        document.getElementById('resetPasswordFormElement').reset();
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleResendCode(e) {
    e.preventDefault();

    if (!resetCpf) {
        showError('Erro: CPF não encontrado');
        return;
    }

    try {
        const response = await apiRequest('/auth/abastecedor/forgot-password', {
            method: 'POST',
            body: { cpf: resetCpf }
        });

        showToast('Novo código enviado!', 'success');
        document.getElementById('verifyCodeSubtitle').textContent = `Código enviado para ${response.phone}`;
    } catch (error) {
        showError(error.message);
    }
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
    showPage('dashboardPage');

    try {
        // Get user profile
        const profile = await apiRequest('/abastecedor/profile');
        userData = profile;
        welcomeText.textContent = `Olá, ${userData.name}!`;
    } catch (error) {
        console.error('Failed to load profile:', error);
        welcomeText.textContent = 'Bem-vindo!';
    }
}

// ========================================
// Modal Functions
// ========================================

async function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        // Set today's date as default
        const dateInput = modal.querySelector('input[type="date"]');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // Reset driver selection
        selectedDriverId = null;

        // Fetch drivers and populate dropdown
        if (platesData.length === 0) {
            await fetchDrivers();
        }

        // Populate the plate dropdown based on which modal
        if (modalId === 'modalAbastecimento') {
            const abastPlaca = document.getElementById('abastPlaca');
            if (abastPlaca) {
                populatePlateDropdown(abastPlaca, platesData);
            }
            // Hide driver select initially
            document.getElementById('abastDriverSelectGroup')?.classList.add('hidden');
            const driverSelect = document.getElementById('abastDriverSelect');
            if (driverSelect) {
                driverSelect.innerHTML = '<option value="">Selecione um motorista...</option>';
                driverSelect.required = false;
            }
        } else if (modalId === 'modalOutrosInsumos') {
            const insumoPlaca = document.getElementById('insumoPlaca');
            if (insumoPlaca) {
                populatePlateDropdown(insumoPlaca, platesData);
            }
            // Hide driver select initially
            document.getElementById('insumoDriverSelectGroup')?.classList.add('hidden');
            const driverSelect = document.getElementById('insumoDriverSelect');
            if (driverSelect) {
                driverSelect.innerHTML = '<option value="">Selecione um motorista...</option>';
                driverSelect.required = false;
            }
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        // Stop camera if running
        stopCamera();
        // Reset form
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
        // Reset camera UI
        resetCameraUI(modalId);
        // Clear captured photo
        capturedPhotoData = null;
    }
}

function resetCameraUI(modalId) {
    const prefix = modalId === 'modalAbastecimento' ? 'abast' : 'insumo';

    document.getElementById(`${prefix}Video`).classList.add('hidden');
    document.getElementById(`${prefix}Preview`).classList.add('hidden');
    document.getElementById(`${prefix}Placeholder`).classList.remove('hidden');
    document.getElementById(`${prefix}OpenCamera`).classList.remove('hidden');
    document.getElementById(`${prefix}Capture`).classList.add('hidden');
    document.getElementById(`${prefix}Retake`).classList.add('hidden');

    const statusElement = document.getElementById(`${prefix}PlacaStatus`);
    if (statusElement) {
        statusElement.textContent = '';
        statusElement.className = 'input-hint plate-status';
    }
}

// ========================================
// Camera Functions
// ========================================

async function startCamera(type) {
    currentCameraType = type;
    const video = document.getElementById(`${type}Video`);
    const placeholder = document.getElementById(`${type}Placeholder`);
    const openCameraBtn = document.getElementById(`${type}OpenCamera`);
    const captureBtn = document.getElementById(`${type}Capture`);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });

        currentCameraStream = stream;
        video.srcObject = stream;
        video.classList.remove('hidden');
        placeholder.classList.add('hidden');
        openCameraBtn.classList.add('hidden');
        captureBtn.classList.remove('hidden');
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Erro ao acessar câmera', 'error');
    }
}

function stopCamera() {
    if (currentCameraStream) {
        currentCameraStream.getTracks().forEach(track => track.stop());
        currentCameraStream = null;
    }
}

function capturePhoto(type) {
    const video = document.getElementById(`${type}Video`);
    const canvas = document.getElementById(`${type}Canvas`);
    const preview = document.getElementById(`${type}Preview`);
    const captureBtn = document.getElementById(`${type}Capture`);
    const retakeBtn = document.getElementById(`${type}Retake`);

    // Draw video frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Get image data
    capturedPhotoData = canvas.toDataURL('image/jpeg', 0.8);
    preview.src = capturedPhotoData;

    // Update UI
    video.classList.add('hidden');
    preview.classList.remove('hidden');
    captureBtn.classList.add('hidden');
    retakeBtn.classList.remove('hidden');

    // Stop camera
    stopCamera();
}

function retakePhoto(type) {
    const preview = document.getElementById(`${type}Preview`);
    const retakeBtn = document.getElementById(`${type}Retake`);

    preview.classList.add('hidden');
    retakeBtn.classList.add('hidden');
    capturedPhotoData = null;

    // Restart camera
    startCamera(type);
}

// ========================================
// Plate Selection Handler
// ========================================

function handlePlateSelection(type, plate, selectElement) {
    const statusElement = document.getElementById(`${type}PlacaStatus`);
    const driverSelectGroup = document.getElementById(`${type}DriverSelectGroup`);
    const driverSelect = document.getElementById(`${type}DriverSelect`);

    // Reset driver selection
    selectedDriverId = null;

    if (!plate) {
        statusElement.textContent = '';
        statusElement.className = 'input-hint plate-status';
        driverSelectGroup?.classList.add('hidden');
        if (driverSelect) driverSelect.required = false;
        return;
    }

    // Get the selected option to check if multiple drivers
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const multipleDrivers = selectedOption?.dataset.multipleDrivers === 'true';
    const drivers = selectedOption?.dataset.drivers ? JSON.parse(selectedOption.dataset.drivers) : [];

    if (multipleDrivers && drivers.length > 1) {
        // Show driver selection dropdown
        statusElement.textContent = '⚠️ Selecione o motorista abaixo';
        statusElement.className = 'input-hint plate-status warning';

        // Populate driver dropdown
        driverSelect.innerHTML = '<option value="">Selecione um motorista...</option>';
        drivers.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.id;
            option.textContent = driver.name;
            driverSelect.appendChild(option);
        });

        driverSelectGroup?.classList.remove('hidden');
        driverSelect.required = true;
    } else if (drivers.length === 1) {
        // Single driver - auto-select
        selectedDriverId = drivers[0].id;
        statusElement.textContent = `✓ ${drivers[0].name}`;
        statusElement.className = 'input-hint plate-status valid';
        driverSelectGroup?.classList.add('hidden');
        if (driverSelect) driverSelect.required = false;
    } else {
        // Fallback for backward compatibility
        const driver = driversData.find(d => d.plate === plate);
        if (driver) {
            selectedDriverId = driver.id;
            statusElement.textContent = `✓ ${driver.name}`;
            statusElement.className = 'input-hint plate-status valid';
        } else {
            statusElement.textContent = '';
            statusElement.className = 'input-hint plate-status';
        }
        driverSelectGroup?.classList.add('hidden');
        if (driverSelect) driverSelect.required = false;
    }
}

// Handle driver selection from dropdown
function handleDriverSelection(type, driverId) {
    const statusElement = document.getElementById(`${type}PlacaStatus`);
    const driverSelect = document.getElementById(`${type}DriverSelect`);

    if (!driverId) {
        selectedDriverId = null;
        statusElement.textContent = '⚠️ Selecione o motorista';
        statusElement.className = 'input-hint plate-status warning';
        return;
    }

    selectedDriverId = parseInt(driverId);

    // Find driver name
    const selectedOption = driverSelect.options[driverSelect.selectedIndex];
    const driverName = selectedOption?.textContent || '';

    statusElement.textContent = `✓ ${driverName}`;
    statusElement.className = 'input-hint plate-status valid';
}

// ========================================
// Form Submissions
// ========================================

async function submitAbastecimento(e) {
    e.preventDefault();

    const plate = document.getElementById('abastPlaca').value.trim();
    const driverSelectGroup = document.getElementById('abastDriverSelectGroup');
    const driverSelect = document.getElementById('abastDriverSelect');
    const date = document.getElementById('abastData').value;
    const liters = document.getElementById('abastLitros').value;

    if (!plate || !date || !liters) {
        showToast('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    // If driver selection is visible and required, check it
    if (!driverSelectGroup?.classList.contains('hidden') && driverSelect?.required) {
        if (!driverSelect.value) {
            showToast('Selecione um motorista', 'error');
            return;
        }
        selectedDriverId = parseInt(driverSelect.value);
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);

    try {
        const formData = new FormData();
        formData.append('plate', plate);
        formData.append('date', date);
        formData.append('liters', liters);

        // Include driver_id if selected (for shared plates)
        if (selectedDriverId) {
            formData.append('driver_id', selectedDriverId);
        }

        // Add photo if captured
        if (capturedPhotoData) {
            const blob = dataURLtoBlob(capturedPhotoData);
            formData.append('comprovante', blob, 'comprovante.jpg');
        }

        await apiRequest('/abastecedor/abastecimento', {
            method: 'POST',
            body: formData
        });

        showToast('Abastecimento registrado com sucesso!', 'success');
        closeModal('modalAbastecimento');
    } catch (error) {
        showToast(error.message || 'Erro ao registrar abastecimento', 'error');
    } finally {
        setLoading(submitBtn, false);
    }
}

async function submitOutrosInsumos(e) {
    e.preventDefault();

    const plate = document.getElementById('insumoPlaca').value.trim();
    const driverSelectGroup = document.getElementById('insumoDriverSelectGroup');
    const driverSelect = document.getElementById('insumoDriverSelect');
    const date = document.getElementById('insumoData').value;
    const quantity = document.getElementById('insumoQuantidade').value;
    const description = document.getElementById('insumoDescricao').value.trim();

    if (!plate || !date || !quantity) {
        showToast('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    // If driver selection is visible and required, check it
    if (!driverSelectGroup?.classList.contains('hidden') && driverSelect?.required) {
        if (!driverSelect.value) {
            showToast('Selecione um motorista', 'error');
            return;
        }
        selectedDriverId = parseInt(driverSelect.value);
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);

    try {
        const formData = new FormData();
        formData.append('plate', plate);
        formData.append('date', date);
        formData.append('quantity', quantity);

        // Include driver_id if selected (for shared plates)
        if (selectedDriverId) {
            formData.append('driver_id', selectedDriverId);
        }

        if (description) {
            formData.append('description', description);
        }

        // Add photo if captured
        if (capturedPhotoData) {
            const blob = dataURLtoBlob(capturedPhotoData);
            formData.append('comprovante', blob, 'comprovante.jpg');
        }

        await apiRequest('/abastecedor/outros-insumos', {
            method: 'POST',
            body: formData
        });

        showToast('Outros Insumos registrado com sucesso!', 'success');
        closeModal('modalOutrosInsumos');
    } catch (error) {
        showToast(error.message || 'Erro ao registrar outros insumos', 'error');
    } finally {
        setLoading(submitBtn, false);
    }
}

// Helper function to convert data URL to Blob
function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// ========================================
// Initialize App
// ========================================

function init() {
    // Login form handler
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', handleLogin);
    }

    // CPF formatting
    if (loginCpf) {
        loginCpf.addEventListener('input', () => formatCPFInput(loginCpf));
    }

    // Logout buttons
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Dashboard buttons
    const btnAbastecimento = document.getElementById('btnComprovanteAbastecimento');
    const btnOutrosInsumos = document.getElementById('btnOutrosInsumos');

    if (btnAbastecimento) {
        btnAbastecimento.addEventListener('click', () => openModal('modalAbastecimento'));
    }
    if (btnOutrosInsumos) {
        btnOutrosInsumos.addEventListener('click', () => openModal('modalOutrosInsumos'));
    }

    // Modal close buttons
    document.getElementById('closeModalAbastecimento')?.addEventListener('click', () => closeModal('modalAbastecimento'));
    document.getElementById('closeModalOutrosInsumos')?.addEventListener('click', () => closeModal('modalOutrosInsumos'));

    // Modal backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });

    // Form submissions
    document.getElementById('formAbastecimento')?.addEventListener('submit', submitAbastecimento);
    document.getElementById('formOutrosInsumos')?.addEventListener('submit', submitOutrosInsumos);

    // Plate select change handler - Abastecimento
    const abastPlaca = document.getElementById('abastPlaca');
    if (abastPlaca) {
        abastPlaca.addEventListener('change', () => {
            handlePlateSelection('abast', abastPlaca.value, abastPlaca);
        });
    }

    // Driver select change handler - Abastecimento
    const abastDriverSelect = document.getElementById('abastDriverSelect');
    if (abastDriverSelect) {
        abastDriverSelect.addEventListener('change', () => {
            handleDriverSelection('abast', abastDriverSelect.value);
        });
    }

    // Plate select change handler - Outros Insumos
    const insumoPlaca = document.getElementById('insumoPlaca');
    if (insumoPlaca) {
        insumoPlaca.addEventListener('change', () => {
            handlePlateSelection('insumo', insumoPlaca.value, insumoPlaca);
        });
    }

    // Driver select change handler - Outros Insumos
    const insumoDriverSelect = document.getElementById('insumoDriverSelect');
    if (insumoDriverSelect) {
        insumoDriverSelect.addEventListener('change', () => {
            handleDriverSelection('insumo', insumoDriverSelect.value);
        });
    }

    // Camera buttons - Abastecimento
    document.getElementById('abastOpenCamera')?.addEventListener('click', () => startCamera('abast'));
    document.getElementById('abastCapture')?.addEventListener('click', () => capturePhoto('abast'));
    document.getElementById('abastRetake')?.addEventListener('click', () => retakePhoto('abast'));
    document.getElementById('abastPlaceholder')?.addEventListener('click', () => startCamera('abast'));

    // Camera buttons - Outros Insumos
    document.getElementById('insumoOpenCamera')?.addEventListener('click', () => startCamera('insumo'));
    document.getElementById('insumoCapture')?.addEventListener('click', () => capturePhoto('insumo'));
    document.getElementById('insumoRetake')?.addEventListener('click', () => retakePhoto('insumo'));
    document.getElementById('insumoPlaceholder')?.addEventListener('click', () => startCamera('insumo'));

    // Password Recovery - Event Listeners
    document.getElementById('showForgotPassword')?.addEventListener('click', (e) => {
        e.preventDefault();
        showForgotPasswordForm();
    });

    document.getElementById('backToLoginFromForgot')?.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });

    document.getElementById('backToLoginFromVerify')?.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });

    document.getElementById('backToLoginFromReset')?.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });

    document.getElementById('resendCode')?.addEventListener('click', handleResendCode);

    // Password Recovery - Form Handlers
    document.getElementById('forgotPasswordFormElement')?.addEventListener('submit', handleForgotPassword);
    document.getElementById('verifyCodeFormElement')?.addEventListener('submit', handleVerifyCode);
    document.getElementById('resetPasswordFormElement')?.addEventListener('submit', handleResetPassword);

    // CPF formatting for forgot password form
    const forgotCpf = document.getElementById('forgotCpf');
    if (forgotCpf) {
        forgotCpf.addEventListener('input', () => formatCPFInput(forgotCpf));
    }

    // Check if already logged in
    if (token) {
        loadDashboard();
    } else {
        showPage('loginPage');
    }
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

// Start app
document.addEventListener('DOMContentLoaded', () => {
    init();
    initPasswordToggle();
});

// ========================================
// PWA Service Worker Registration
// ========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('[PWA] Service Worker registered successfully:', registration.scope);

                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New content available, show update notification
                            console.log('[PWA] New version available! Refresh to update.');
                            showToast('Nova versão disponível! Recarregue a página para atualizar.', 'info');
                        }
                    });
                });
            })
            .catch(error => {
                console.log('[PWA] Service Worker registration failed:', error);
            });
    });
}

// Handle PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67+ from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    console.log('[PWA] Install prompt available');
});

