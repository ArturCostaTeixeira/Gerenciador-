/**
 * CMS Driver Portal - Frontend Application
 */

const API_BASE = '/api';

// State
let token = localStorage.getItem('driver_token');
let userData = null;
let currentCameraStream = null;
let currentPhotoType = 'carga'; // 'carga' or 'descarga'
let capturedPhotoBlob = null;
let extratoPollingInterval = null;

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const extratoPage = document.getElementById('extratoPage');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginFormElement = document.getElementById('loginFormElement');
const signupFormElement = document.getElementById('signupFormElement');
const authError = document.getElementById('authError');
const showSignupLink = document.getElementById('showSignup');
const showLoginLink = document.getElementById('showLogin');
const logoutBtn = document.getElementById('logoutBtn');
const extratoLogoutBtn = document.getElementById('extratoLogoutBtn');
const welcomeText = document.getElementById('welcomeText');

// ========================================
// Utility Functions
// ========================================

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value || 0);
}

async function apiRequest(endpoint, options = {}) {
    const headers = {
        ...options.headers
    };

    // Don't set Content-Type if body is FormData (let browser set it with boundary)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

function showError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
    setTimeout(() => {
        authError.classList.add('hidden');
    }, 5000);
}

function hideError() {
    authError.classList.add('hidden');
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

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toast.className = `toast ${type}`;
    toastMessage.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function validateCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++)
        sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);

    remainder = (sum * 10) % 11;

    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++)
        sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);

    remainder = (sum * 10) % 11;

    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;

    return true;
}

// ========================================
// Page Navigation
// ========================================

function showPage(page) {
    // Stop extrato polling when leaving that page
    if (page !== extratoPage) {
        stopExtratoPolling();
    }

    loginPage.classList.remove('active');
    dashboardPage.classList.remove('active');
    extratoPage.classList.remove('active');
    loginPage.classList.add('hidden');
    dashboardPage.classList.add('hidden');
    extratoPage.classList.add('hidden');

    page.classList.remove('hidden');
    page.classList.add('active');
}

function toggleForms(showSignup) {
    if (showSignup) {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    } else {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
    hideError();
}

// ========================================
// Authentication
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    const button = loginFormElement.querySelector('button');
    const plate = document.getElementById('loginPlate').value.trim().toUpperCase();
    const password = document.getElementById('loginPassword').value;

    if (!plate || !password) {
        showError('Preencha todos os campos');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        const data = await apiRequest('/auth/driver/login', {
            method: 'POST',
            body: JSON.stringify({ plate, password })
        });

        token = data.token;
        userData = data.driver;
        localStorage.setItem('driver_token', token);

        await loadDashboard();
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const button = signupFormElement.querySelector('button');
    const name = document.getElementById('signupName').value.trim();
    const cpf = document.getElementById('signupCpf').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const plate = document.getElementById('signupPlate').value.trim().toUpperCase();
    const password = document.getElementById('signupPassword').value;

    if (!name || !cpf || !phone || !plate || !password) {
        showError('Preencha todos os campos');
        return;
    }

    if (password.length < 4) {
        showError('A senha deve ter pelo menos 4 caracteres');
        return;
    }

    // Validate CPF (checksum)
    const cpfClean = cpf.replace(/\D/g, '');
    if (!validateCPF(cpfClean)) {
        showError('CPF inválido. Verifique os números digitados.');
        return;
    }

    // Validate phone (at least 10 digits)
    const phoneClean = phone.replace(/\D/g, '');
    if (phoneClean.length < 10) {
        showError('Telefone inválido. Deve conter pelo menos 10 dígitos');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        const data = await apiRequest('/auth/driver/signup', {
            method: 'POST',
            body: JSON.stringify({ name, plate, password, phone: phoneClean, cpf: cpfClean })
        });

        token = data.token;
        userData = data.driver;
        localStorage.setItem('driver_token', token);

        await loadDashboard();
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

function logout() {
    token = null;
    userData = null;
    localStorage.removeItem('driver_token');
    showPage(loginPage);
    loginFormElement.reset();
    signupFormElement.reset();
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
    try {
        // Verify token and get user info
        const verifyData = await apiRequest('/auth/verify');
        if (!verifyData.valid || verifyData.type !== 'driver') {
            throw new Error('Invalid session');
        }
        userData = verifyData.user;

        // Show dashboard
        showPage(dashboardPage);
        welcomeText.textContent = `Bem-vindo, ${userData.name}!`;

    } catch (error) {
        console.error('Dashboard error:', error);
        logout();
    }
}

// ========================================
// Extrato Page
// ========================================

async function showExtrato() {
    showPage(extratoPage);
    document.getElementById('extratoWelcome').textContent = userData?.name || 'Resumo Financeiro';

    // Load all data
    await refreshExtratoData();

    // Start polling for real-time updates (every 5 seconds)
    stopExtratoPolling(); // Clear any existing interval
    extratoPollingInterval = setInterval(refreshExtratoData, 5000);
}

function stopExtratoPolling() {
    if (extratoPollingInterval) {
        clearInterval(extratoPollingInterval);
        extratoPollingInterval = null;
    }
}

async function refreshExtratoData() {
    await Promise.all([
        loadExtratoStats(),
        loadExtratoFretes(),
        loadExtratoAbastecimentos(),
        loadExtratoOutrosInsumos(),
        loadExtratoPagamentos()
    ]);
}

async function loadExtratoStats() {
    try {
        const stats = await apiRequest('/driver/stats');

        document.getElementById('totalFretesValue').textContent = formatCurrency(stats.freights.total_value);
        document.getElementById('totalRecebidoValue').textContent = formatCurrency(stats.total_received || 0);
        document.getElementById('totalAbastecimentosValue').textContent = '-' + formatCurrency(stats.abastecimentos.total_value);
        document.getElementById('totalOutrosInsumosValue').textContent = '-' + formatCurrency(stats.outrosInsumos?.total_value || 0);
        document.getElementById('totalAReceberValue').textContent = formatCurrency(stats.total_to_receive);
    } catch (error) {
        console.error('Stats error:', error);
    }
}

async function loadExtratoFretes() {
    const tbody = document.getElementById('extratoFretesBody');

    try {
        const data = await apiRequest('/driver/freights');
        const freights = data.freights || [];

        if (freights.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum frete encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = freights.map(f => {
            const cargaCell = f.comprovante_carga
                ? `<a href="${f.comprovante_carga}" target="_blank" class="btn btn-outline btn-view">📷</a>`
                : '<span class="text-muted">-</span>';
            const descargaCell = f.comprovante_descarga
                ? `<a href="${f.comprovante_descarga}" target="_blank" class="btn btn-outline btn-view">📷</a>`
                : '<span class="text-muted">-</span>';

            return `
                <tr>
                    <td>${formatDate(f.date)}</td>
                    <td>${formatNumber(f.km)}</td>
                    <td>${formatNumber(f.tons, 2)}</td>
                    <td class="value-positive">${formatCurrency(f.total_value)}</td>
                    <td>${cargaCell}</td>
                    <td>${descargaCell}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Freights error:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Erro ao carregar</td></tr>';
    }
}

async function loadExtratoAbastecimentos() {
    const tbody = document.getElementById('extratoAbastecimentosBody');

    try {
        const data = await apiRequest('/driver/abastecimentos');
        const abastecimentos = data.abastecimentos || [];

        if (abastecimentos.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum abastecimento encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = abastecimentos.map(a => {
            const comprovanteCell = a.comprovante_abastecimento
                ? `<a href="${a.comprovante_abastecimento}" target="_blank" class="btn btn-outline btn-view">📷</a>`
                : '<span class="text-muted">-</span>';

            return `
                <tr>
                    <td>${formatDate(a.date)}</td>
                    <td>${formatNumber(a.quantity)} L</td>
                    <td>${formatCurrency(a.price_per_liter)}</td>
                    <td class="value-negative">-${formatCurrency(a.total_value)}</td>
                    <td>${comprovanteCell}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Abastecimentos error:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Erro ao carregar</td></tr>';
    }
}

async function loadExtratoOutrosInsumos() {
    const tbody = document.getElementById('extratoOutrosInsumosBody');

    try {
        const data = await apiRequest('/driver/outrosinsumos');
        const outrosInsumos = data.outrosInsumos || [];

        if (outrosInsumos.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum insumo encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = outrosInsumos.map(oi => `
            <tr>
                <td>${formatDate(oi.date)}</td>
                <td>${formatNumber(oi.quantity)}</td>
                <td>${oi.description || '-'}</td>
                <td>${formatCurrency(oi.unit_price)}</td>
                <td class="value-negative">-${formatCurrency(oi.total_value)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Outros Insumos error:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Erro ao carregar</td></tr>';
    }
}

async function loadExtratoPagamentos() {
    const tbody = document.getElementById('extratoPagamentosBody');

    try {
        const data = await apiRequest('/driver/payments');
        const payments = data.payments || [];

        if (payments.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Nenhum pagamento recebido</td></tr>';
            return;
        }

        tbody.innerHTML = payments.map(p => {
            const comprovanteCell = p.comprovante_path
                ? `<a href="${p.comprovante_path}" target="_blank" class="btn btn-outline btn-view">📷 Ver Comprovante</a>`
                : '<span class="text-muted">-</span>';

            return `
                <tr>
                    <td>${p.date_range}</td>
                    <td class="value-positive">${formatCurrency(p.total_value)}</td>
                    <td>${comprovanteCell}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Pagamentos error:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Erro ao carregar</td></tr>';
    }
}

// ========================================
// Camera Functions
// ========================================

async function openCameraModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');

    const videoId = modalId === 'cameraModalCarga' ? 'cameraVideoCarga' : 'cameraVideoAbast';
    const video = document.getElementById(videoId);

    try {
        // Request camera with rear camera preference for mobile
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };

        currentCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentCameraStream;
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Erro ao acessar câmera. Verifique as permissões.', 'error');
        closeCameraModal(modalId);
    }
}

function closeCameraModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('hidden');

    // Stop camera stream
    if (currentCameraStream) {
        currentCameraStream.getTracks().forEach(track => track.stop());
        currentCameraStream = null;
    }

    // Reset UI
    const videoId = modalId === 'cameraModalCarga' ? 'cameraVideoCarga' : 'cameraVideoAbast';
    const previewId = modalId === 'cameraModalCarga' ? 'photoPreviewCarga' : 'photoPreviewAbast';
    const captureId = modalId === 'cameraModalCarga' ? 'capturePhotoCarga' : 'capturePhotoAbast';
    const retakeId = modalId === 'cameraModalCarga' ? 'retakePhotoCarga' : 'retakePhotoAbast';
    const sendId = modalId === 'cameraModalCarga' ? 'sendPhotoCarga' : 'sendPhotoAbast';

    document.getElementById(videoId).classList.remove('hidden');
    document.getElementById(previewId).classList.add('hidden');
    document.getElementById(captureId).classList.remove('hidden');
    document.getElementById(retakeId).classList.add('hidden');
    document.getElementById(sendId).classList.add('hidden');

    capturedPhotoBlob = null;
}

function capturePhoto(modalId) {
    const videoId = modalId === 'cameraModalCarga' ? 'cameraVideoCarga' : 'cameraVideoAbast';
    const canvasId = modalId === 'cameraModalCarga' ? 'cameraCanvasCarga' : 'cameraCanvasAbast';
    const previewId = modalId === 'cameraModalCarga' ? 'photoPreviewCarga' : 'photoPreviewAbast';
    const captureId = modalId === 'cameraModalCarga' ? 'capturePhotoCarga' : 'capturePhotoAbast';
    const retakeId = modalId === 'cameraModalCarga' ? 'retakePhotoCarga' : 'retakePhotoAbast';
    const sendId = modalId === 'cameraModalCarga' ? 'sendPhotoCarga' : 'sendPhotoAbast';

    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    const preview = document.getElementById(previewId);

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob((blob) => {
        capturedPhotoBlob = blob;
        preview.src = URL.createObjectURL(blob);

        // Show preview, hide video
        video.classList.add('hidden');
        preview.classList.remove('hidden');

        // Update buttons
        document.getElementById(captureId).classList.add('hidden');
        document.getElementById(retakeId).classList.remove('hidden');
        document.getElementById(sendId).classList.remove('hidden');
    }, 'image/jpeg', 0.9);
}

function retakePhoto(modalId) {
    const videoId = modalId === 'cameraModalCarga' ? 'cameraVideoCarga' : 'cameraVideoAbast';
    const previewId = modalId === 'cameraModalCarga' ? 'photoPreviewCarga' : 'photoPreviewAbast';
    const captureId = modalId === 'cameraModalCarga' ? 'capturePhotoCarga' : 'capturePhotoAbast';
    const retakeId = modalId === 'cameraModalCarga' ? 'retakePhotoCarga' : 'retakePhotoAbast';
    const sendId = modalId === 'cameraModalCarga' ? 'sendPhotoCarga' : 'sendPhotoAbast';

    // Show video, hide preview
    document.getElementById(videoId).classList.remove('hidden');
    document.getElementById(previewId).classList.add('hidden');

    // Update buttons
    document.getElementById(captureId).classList.remove('hidden');
    document.getElementById(retakeId).classList.add('hidden');
    document.getElementById(sendId).classList.add('hidden');

    capturedPhotoBlob = null;
}

async function sendPhotoCarga() {
    if (!capturedPhotoBlob) {
        showToast('Nenhuma foto capturada', 'error');
        return;
    }

    const formData = new FormData();
    const filename = `comprovante_${currentPhotoType}_${Date.now()}.jpg`;
    formData.append(`comprovante_${currentPhotoType}`, capturedPhotoBlob, filename);

    try {
        // For now, we'll upload to a general endpoint
        // In a real implementation, this would associate with a specific freight
        const response = await fetch(`${API_BASE}/driver/upload-comprovante`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            showToast(`Comprovante de ${currentPhotoType} enviado com sucesso!`, 'success');
            closeCameraModal('cameraModalCarga');
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao enviar');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Erro ao enviar comprovante. Tente novamente.', 'error');
    }
}

async function sendPhotoAbast() {
    if (!capturedPhotoBlob) {
        showToast('Nenhuma foto capturada', 'error');
        return;
    }

    const formData = new FormData();
    const filename = `comprovante_abastecimento_${Date.now()}.jpg`;
    formData.append('comprovante_abastecimento', capturedPhotoBlob, filename);

    try {
        const response = await fetch(`${API_BASE}/driver/upload-comprovante-abastecimento`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            showToast('Comprovante de abastecimento enviado com sucesso!', 'success');
            closeCameraModal('cameraModalAbast');
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao enviar');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Erro ao enviar comprovante. Tente novamente.', 'error');
    }
}

// ========================================
// Plate Input Formatting
// ========================================


function formatPlateInput(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (value.length > 3) {
            value = value.slice(0, 3) + '-' + value.slice(3);
        }

        e.target.value = value.slice(0, 8);
    });
}

function formatCPFInput(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);

        if (value.length > 9) {
            value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        } else if (value.length > 6) {
            value = value.replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
        } else if (value.length > 3) {
            value = value.replace(/(\d{3})(\d{3})/, '$1.$2');
        }

        e.target.value = value;
    });
}

function formatPhoneInput(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);

        if (value.length > 10) {
            value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (value.length > 6) {
            value = value.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        } else if (value.length > 2) {
            value = value.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        } else if (value.length > 0) {
            value = value.replace(/(\d{0,2})/, '($1');
        }

        e.target.value = value;
    });
}

// ========================================
// Initialize App
// ========================================

function init() {
    // Auth Event Listeners
    loginFormElement.addEventListener('submit', handleLogin);
    signupFormElement.addEventListener('submit', handleSignup);
    showSignupLink.addEventListener('click', (e) => { e.preventDefault(); toggleForms(true); });
    showLoginLink.addEventListener('click', (e) => { e.preventDefault(); toggleForms(false); });
    logoutBtn.addEventListener('click', logout);
    extratoLogoutBtn.addEventListener('click', logout);

    // Input Formatting
    formatPlateInput(document.getElementById('loginPlate'));
    formatPlateInput(document.getElementById('signupPlate'));
    formatCPFInput(document.getElementById('signupCpf'));
    formatPhoneInput(document.getElementById('signupPhone'));

    // Dashboard Action Buttons
    document.getElementById('btnComprovanteCarga').addEventListener('click', () => {
        openCameraModal('cameraModalCarga');
    });

    document.getElementById('btnComprovanteAbastecimento').addEventListener('click', () => {
        openCameraModal('cameraModalAbast');
    });

    document.getElementById('btnExtrato').addEventListener('click', showExtrato);

    // Back to main from extrato
    document.getElementById('backToMain').addEventListener('click', () => {
        showPage(dashboardPage);
    });

    // Camera Modal - Carga/Descarga
    document.getElementById('closeCameraModalCarga').addEventListener('click', () => {
        closeCameraModal('cameraModalCarga');
    });
    document.getElementById('capturePhotoCarga').addEventListener('click', () => {
        capturePhoto('cameraModalCarga');
    });
    document.getElementById('retakePhotoCarga').addEventListener('click', () => {
        retakePhoto('cameraModalCarga');
    });
    document.getElementById('sendPhotoCarga').addEventListener('click', sendPhotoCarga);

    // Type toggle for carga/descarga
    document.getElementById('typeCargaBtn').addEventListener('click', () => {
        currentPhotoType = 'carga';
        document.getElementById('typeCargaBtn').classList.add('active');
        document.getElementById('typeDescargaBtn').classList.remove('active');
    });
    document.getElementById('typeDescargaBtn').addEventListener('click', () => {
        currentPhotoType = 'descarga';
        document.getElementById('typeDescargaBtn').classList.add('active');
        document.getElementById('typeCargaBtn').classList.remove('active');
    });

    // Camera Modal - Abastecimento
    document.getElementById('closeCameraModalAbast').addEventListener('click', () => {
        closeCameraModal('cameraModalAbast');
    });
    document.getElementById('capturePhotoAbast').addEventListener('click', () => {
        capturePhoto('cameraModalAbast');
    });
    document.getElementById('retakePhotoAbast').addEventListener('click', () => {
        retakePhoto('cameraModalAbast');
    });
    document.getElementById('sendPhotoAbast').addEventListener('click', sendPhotoAbast);

    // Modal backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            closeCameraModal('cameraModalCarga');
            closeCameraModal('cameraModalAbast');
        });
    });

    // Format plate inputs
    formatPlateInput(document.getElementById('loginPlate'));
    formatPlateInput(document.getElementById('signupPlate'));

    // Check for existing token
    if (token) {
        loadDashboard();
    } else {
        showPage(loginPage);

        // Check URL params for signup action
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('signup')) {
            toggleForms(true);
        }
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
