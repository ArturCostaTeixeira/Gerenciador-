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

function formatPlateInput(input) {
    let value = input.value.toUpperCase();

    // Remove non-alphanumeric except dash
    value = value.replace(/[^A-Z0-9-]/g, '');

    // Auto-insert dash after 3 letters
    if (value.length >= 3 && value[3] !== '-') {
        value = value.slice(0, 3) + '-' + value.slice(3);
    }

    // Limit length
    if (value.length > 8) {
        value = value.slice(0, 8);
    }

    input.value = value;
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

    // Clear forms
    loginFormElement.reset();
    hideError();
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

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        // Set today's date as default
        const dateInput = modal.querySelector('input[type="date"]');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
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
// Plate Validation
// ========================================

let plateValidationTimeout = null;

async function validatePlate(type, plate) {
    const statusElement = document.getElementById(`${type}PlacaStatus`);

    if (!plate || plate.length < 7) {
        statusElement.textContent = '';
        statusElement.className = 'input-hint plate-status';
        return;
    }

    // Format plate
    const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalizedPlate.length < 7) {
        statusElement.textContent = '';
        return;
    }

    try {
        const data = await apiRequest(`/abastecedor/validate-plate/${plate}`);

        if (data.valid) {
            statusElement.textContent = `✓ ${data.driver.name} (${data.driver.plate})`;
            statusElement.className = 'input-hint plate-status valid';
        } else {
            statusElement.textContent = '✗ Veículo não encontrado';
            statusElement.className = 'input-hint plate-status invalid';
        }
    } catch (error) {
        statusElement.textContent = '✗ Erro ao validar placa';
        statusElement.className = 'input-hint plate-status invalid';
    }
}

// ========================================
// Form Submissions
// ========================================

async function submitAbastecimento(e) {
    e.preventDefault();

    const plate = document.getElementById('abastPlaca').value.trim();
    const date = document.getElementById('abastData').value;
    const liters = document.getElementById('abastLitros').value;

    if (!plate || !date || !liters) {
        showToast('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);

    try {
        const formData = new FormData();
        formData.append('plate', plate);
        formData.append('date', date);
        formData.append('liters', liters);

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
    const date = document.getElementById('insumoData').value;
    const quantity = document.getElementById('insumoQuantidade').value;
    const description = document.getElementById('insumoDescricao').value.trim();

    if (!plate || !date || !quantity) {
        showToast('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn, true);

    try {
        const formData = new FormData();
        formData.append('plate', plate);
        formData.append('date', date);
        formData.append('quantity', quantity);
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

    // Plate input formatting and validation - Abastecimento
    const abastPlaca = document.getElementById('abastPlaca');
    if (abastPlaca) {
        abastPlaca.addEventListener('input', () => {
            formatPlateInput(abastPlaca);
            clearTimeout(plateValidationTimeout);
            plateValidationTimeout = setTimeout(() => {
                validatePlate('abast', abastPlaca.value);
            }, 500);
        });
    }

    // Plate input formatting and validation - Outros Insumos
    const insumoPlaca = document.getElementById('insumoPlaca');
    if (insumoPlaca) {
        insumoPlaca.addEventListener('input', () => {
            formatPlateInput(insumoPlaca);
            clearTimeout(plateValidationTimeout);
            plateValidationTimeout = setTimeout(() => {
                validatePlate('insumo', insumoPlaca.value);
            }, 500);
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

    // Check if already logged in
    if (token) {
        loadDashboard();
    } else {
        showPage('loginPage');
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
