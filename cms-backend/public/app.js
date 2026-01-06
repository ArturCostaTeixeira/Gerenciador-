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
const waitingPage = document.getElementById('waitingPage');
const platesPage = document.getElementById('platesPage');
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
    waitingPage.classList.remove('active');
    if (platesPage) platesPage.classList.remove('active');
    loginPage.classList.add('hidden');
    dashboardPage.classList.add('hidden');
    extratoPage.classList.add('hidden');
    waitingPage.classList.add('hidden');
    if (platesPage) platesPage.classList.add('hidden');

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
    const cpf = document.getElementById('loginCpf').value.trim().replace(/\D/g, '');
    const password = document.getElementById('loginPassword').value;

    if (!cpf || !password) {
        showError('Preencha todos os campos');
        return;
    }

    if (cpf.length !== 11) {
        showError('CPF deve ter 11 dígitos');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        const data = await apiRequest('/auth/driver/login', {
            method: 'POST',
            body: JSON.stringify({ cpf, password })
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
    const button = signupFormElement.querySelector('button[type="submit"]');
    const name = document.getElementById('signupName').value.trim();
    const cpf = document.getElementById('signupCpf').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const password = document.getElementById('signupPassword').value;

    // Collect plates (all optional now)
    const plateInputs = document.querySelectorAll('.signup-plate-input');
    const plates = [];
    plateInputs.forEach(input => {
        const value = input.value.trim().toUpperCase();
        if (value) {
            plates.push(value);
        }
    });

    // Validate required fields (plates no longer required)
    if (!name || !cpf || !phone || !password) {
        showError('Preencha todos os campos obrigatórios');
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
            body: JSON.stringify({ name, plates, password, phone: phoneClean, cpf: cpfClean })
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
    stopWaitingPolling(); // Stop any waiting page polling
    showPage(loginPage);
    loginFormElement.reset();
    signupFormElement.reset();
}

// ========================================
// Dashboard
// ========================================

let waitingPollingInterval = null;

async function loadDashboard() {
    try {
        // Verify token and get user info
        const verifyData = await apiRequest('/auth/verify');
        if (!verifyData.valid || verifyData.type !== 'driver') {
            throw new Error('Invalid session');
        }
        userData = verifyData.user;

        // Check if driver is authenticated by admin
        const isAuthenticated = userData.authenticated === 1 || userData.authenticated === true;

        if (!isAuthenticated) {
            // Show waiting for authorization page
            showPage(waitingPage);
            document.getElementById('waitingWelcome').textContent = `Olá, ${userData.name}!`;

            // Start polling to check for authentication status
            startWaitingPolling();
            return;
        }

        // Stop waiting polling if we're authenticated
        stopWaitingPolling();

        // Show dashboard
        showPage(dashboardPage);
        welcomeText.textContent = `Bem-vindo, ${userData.name}!`;

    } catch (error) {
        console.error('Dashboard error:', error);
        logout();
    }
}

// Polling to check if driver has been authenticated
function startWaitingPolling() {
    stopWaitingPolling(); // Clear any existing interval
    waitingPollingInterval = setInterval(async () => {
        try {
            const verifyData = await apiRequest('/auth/verify');
            if (verifyData.valid && verifyData.type === 'driver') {
                const isAuthenticated = verifyData.user.authenticated === 1 || verifyData.user.authenticated === true;
                if (isAuthenticated) {
                    // Driver has been authenticated! Show success and redirect
                    userData = verifyData.user;
                    stopWaitingPolling();
                    showToast('Sua conta foi aprovada! Bem-vindo!', 'success');
                    showPage(dashboardPage);
                    welcomeText.textContent = `Bem-vindo, ${userData.name}!`;
                }
            }
        } catch (error) {
            console.error('Waiting polling error:', error);
        }
    }, 3000); // Check every 3 seconds
}

function stopWaitingPolling() {
    if (waitingPollingInterval) {
        clearInterval(waitingPollingInterval);
        waitingPollingInterval = null;
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

        // Total Fretes (positive - green)
        document.getElementById('totalFretesValue').textContent = formatCurrency(stats.freights.total_value);

        // Abastecimentos (negative - red)
        document.getElementById('totalAbastecimentosValue').textContent = '-' + formatCurrency(stats.abastecimentos.total_value);

        // Outros Insumos (negative - red)
        document.getElementById('totalOutrosInsumosValue').textContent = '-' + formatCurrency(stats.outrosInsumos?.total_value || 0);

        // Total a Receber = Fretes - Abastecimentos - Outros Insumos - Pago
        document.getElementById('totalAReceberValue').textContent = formatCurrency(stats.total_to_receive);

        // Pago (amount already received from payments)
        document.getElementById('totalPagoValue').textContent = formatCurrency(stats.total_received || 0);
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
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum frete encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = freights.map(f => {
            const cargaCell = f.comprovante_carga
                ? `<a href="${f.comprovante_carga}" target="_blank" class="btn btn-outline btn-view">📷</a>`
                : '<span class="text-muted">-</span>';
            const descargaCell = f.comprovante_descarga
                ? `<a href="${f.comprovante_descarga}" target="_blank" class="btn btn-outline btn-view">📷</a>`
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
    } catch (error) {
        console.error('Freights error:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Erro ao carregar</td></tr>';
    }
}

async function loadExtratoAbastecimentos() {
    const tbody = document.getElementById('extratoAbastecimentosBody');

    try {
        const data = await apiRequest('/driver/abastecimentos');
        const abastecimentos = data.abastecimentos || [];

        if (abastecimentos.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum abastecimento encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = abastecimentos.map(a => {
            const comprovanteCell = a.comprovante_abastecimento
                ? `<a href="${a.comprovante_abastecimento}" target="_blank" class="btn btn-outline btn-view">📷</a>`
                : '<span class="text-muted">-</span>';
            const plateDisplay = a.plate || a.driver_plate || '-';

            return `
                <tr>
                    <td>${formatDate(a.date)}</td>
                    <td><span class="plate-badge">${plateDisplay}</span></td>
                    <td>${formatNumber(a.quantity)} L</td>
                    <td>${formatCurrency(a.price_per_liter)}</td>
                    <td class="value-negative">-${formatCurrency(a.total_value)}</td>
                    <td>${comprovanteCell}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Abastecimentos error:', error);
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Erro ao carregar</td></tr>';
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
// PDF Export
// ========================================

async function exportExtratoPDF() {
    const content = document.querySelector('.extrato-content');

    if (!content) {
        showToast('Conteúdo não encontrado', 'error');
        return;
    }

    // Show loading state
    const exportBtn = document.getElementById('exportExtratoPdfBtn');
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

        const driverName = userData?.name || 'Motorista';
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
        showToast('PDF exportado com sucesso!', 'success');
    } catch (error) {
        console.error('PDF export error:', error);
        content.classList.remove('pdf-print-mode');
        showToast('Erro ao gerar PDF. Tente novamente.', 'error');
    } finally {
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
    }
}

// ========================================
// Camera Functions
// ========================================

function getAllDriverPlates() {
    // Get all plates for the current driver (primary + additional)
    const plates = [];
    if (userData?.plate) {
        plates.push(userData.plate);
    }
    if (userData?.plates && Array.isArray(userData.plates)) {
        plates.push(...userData.plates);
    }
    return plates;
}

function populatePlateSelect(selectId, containerId) {
    const plates = getAllDriverPlates();
    const select = document.getElementById(selectId);
    const container = document.getElementById(containerId);

    if (plates.length > 1) {
        // Multiple plates - show selection
        select.innerHTML = plates.map(plate =>
            `<option value="${plate}">${plate}</option>`
        ).join('');
        container.classList.remove('hidden');
    } else {
        // Single plate - hide selection
        container.classList.add('hidden');
    }
}

async function openCameraModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');

    const videoId = modalId === 'cameraModalCarga' ? 'cameraVideoCarga' : 'cameraVideoAbast';
    const video = document.getElementById(videoId);

    // Populate plate selection if driver has multiple plates
    if (modalId === 'cameraModalCarga') {
        populatePlateSelect('plateSelectCarga', 'plateSelectContainerCarga');
    } else {
        populatePlateSelect('plateSelectAbast', 'plateSelectContainerAbast');
    }

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

function getSelectedPlate(selectId) {
    const plates = getAllDriverPlates();
    if (plates.length > 1) {
        const select = document.getElementById(selectId);
        return select.value;
    }
    return userData?.plate || null;
}

async function sendPhotoCarga() {
    if (!capturedPhotoBlob) {
        showToast('Nenhuma foto capturada', 'error');
        return;
    }

    const selectedPlate = getSelectedPlate('plateSelectCarga');

    const formData = new FormData();
    const filename = `comprovante_${currentPhotoType}_${Date.now()}.jpg`;
    formData.append(`comprovante_${currentPhotoType}`, capturedPhotoBlob, filename);
    if (selectedPlate) {
        formData.append('plate', selectedPlate);
    }

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

    const selectedPlate = getSelectedPlate('plateSelectAbast');

    const formData = new FormData();
    const filename = `comprovante_abastecimento_${Date.now()}.jpg`;
    formData.append('comprovante_abastecimento', capturedPhotoBlob, filename);
    if (selectedPlate) {
        formData.append('plate', selectedPlate);
    }

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
// Signup Plates Input Management
// ========================================

let plateCounter = 0;

function addAdditionalPlateInput() {
    plateCounter++;
    const container = document.getElementById('signupPlatesList');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'signup-plate-row';
    div.id = `signupPlateRow_${plateCounter}`;
    div.innerHTML = `
        <input type="text" class="signup-plate-input" placeholder="ABC-1234" autocomplete="off">
        <button type="button" class="btn btn-sm btn-remove-plate" onclick="removeSignupPlate('${plateCounter}')">✕</button>
    `;
    container.appendChild(div);

    // Add formatting to the new input
    const input = div.querySelector('.signup-plate-input');
    formatPlateInput(input);
}

window.removeSignupPlate = function (id) {
    const row = document.getElementById(`signupPlateRow_${id}`);
    if (row) {
        row.remove();
    }
};

// ========================================
// Driver Plate Management Page
// ========================================

async function showPlatesPage() {
    showPage(platesPage);
    await loadDriverPlates();
}

async function loadDriverPlates() {
    const platesList = document.getElementById('driverPlatesList');
    if (!platesList) return;

    platesList.innerHTML = '<div class="loading">Carregando...</div>';

    try {
        const data = await apiRequest('/driver/plates');
        const plates = data.plates || [];

        if (plates.length === 0) {
            platesList.innerHTML = '<div class="empty-plates">Nenhum veículo cadastrado</div>';
            return;
        }

        platesList.innerHTML = plates.map(plate => `
            <div class="plate-item glass">
                <span class="plate-number">🚛 ${plate}</span>
                <button class="btn btn-sm btn-outline btn-remove" onclick="removePlate('${plate}')">Remover</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load plates error:', error);
        platesList.innerHTML = '<div class="error">Erro ao carregar placas</div>';
    }
}

async function addNewPlate() {
    const input = document.getElementById('newPlateInput');
    if (!input) return;

    const plate = input.value.trim().toUpperCase();
    if (!plate) {
        showToast('Digite uma placa', 'error');
        return;
    }

    // Validate plate format
    const plateRegex = /^[A-Z]{3}-[0-9][A-Z0-9][0-9]{2}$/i;
    if (!plateRegex.test(plate)) {
        showToast('Formato de placa inválido. Use ABC-1234 ou ABC-1D23', 'error');
        return;
    }

    try {
        await apiRequest('/driver/plates', {
            method: 'POST',
            body: JSON.stringify({ plate })
        });

        input.value = '';
        showToast('Placa adicionada com sucesso!', 'success');
        await loadDriverPlates();

        // Update userData to reflect new plates
        const verifyData = await apiRequest('/auth/verify');
        if (verifyData.valid) {
            userData = verifyData.user;
        }
    } catch (error) {
        showToast(error.message || 'Erro ao adicionar placa', 'error');
    }
}

window.removePlate = async function (plate) {
    if (!confirm(`Remover a placa ${plate}?`)) return;

    try {
        await apiRequest(`/driver/plates/${encodeURIComponent(plate)}`, {
            method: 'DELETE'
        });

        showToast('Placa removida com sucesso!', 'success');
        await loadDriverPlates();

        // Update userData to reflect new plates
        const verifyData = await apiRequest('/auth/verify');
        if (verifyData.valid) {
            userData = verifyData.user;
        }
    } catch (error) {
        showToast(error.message || 'Erro ao remover placa', 'error');
    }
};


// ========================================
// Password Recovery
// ========================================

let resetCpf = ''; // Store CPF during reset flow
let resetCode = ''; // Store verified code during reset flow

function showForgotPasswordForm() {
    loginForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    document.getElementById('forgotPasswordForm').classList.remove('hidden');
    document.getElementById('verifyCodeForm').classList.add('hidden');
    document.getElementById('resetPasswordForm').classList.add('hidden');
    hideError();
    resetCpf = '';
    resetCode = '';
}

function showVerifyCodeForm(phone) {
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    document.getElementById('verifyCodeForm').classList.remove('hidden');
    document.getElementById('verifyCodeSubtitle').textContent = `Digite o código enviado para ${phone}`;
    hideError();
}

function showResetPasswordForm() {
    document.getElementById('verifyCodeForm').classList.add('hidden');
    document.getElementById('resetPasswordForm').classList.remove('hidden');
    hideError();
}

function showLoginForm() {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    document.getElementById('verifyCodeForm').classList.add('hidden');
    document.getElementById('resetPasswordForm').classList.add('hidden');
    hideError();
    resetCpf = '';
    resetCode = '';
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const form = document.getElementById('forgotPasswordFormElement');
    const button = form.querySelector('button[type="submit"]');
    const cpf = document.getElementById('forgotCpf').value.trim().replace(/\D/g, '');

    if (!cpf || cpf.length !== 11) {
        showError('Digite um CPF válido');
        return;
    }

    setLoading(button, true);
    hideError();

    try {
        const data = await apiRequest('/auth/driver/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ cpf })
        });

        resetCpf = cpf;
        showVerifyCodeForm(data.phone);
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
        await apiRequest('/auth/driver/verify-reset-code', {
            method: 'POST',
            body: JSON.stringify({ cpf: resetCpf, code })
        });

        resetCode = code;
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
        await apiRequest('/auth/driver/reset-password', {
            method: 'POST',
            body: JSON.stringify({ cpf: resetCpf, newPassword })
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

async function handleResendCode() {
    if (!resetCpf) {
        showForgotPasswordForm();
        return;
    }

    try {
        const data = await apiRequest('/auth/driver/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ cpf: resetCpf })
        });
        showToast('Código reenviado!', 'success');
    } catch (error) {
        showError(error.message);
    }
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

    // Password Recovery Event Listeners
    const showForgotPasswordLink = document.getElementById('showForgotPassword');
    if (showForgotPasswordLink) {
        showForgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); showForgotPasswordForm(); });
    }

    const forgotPasswordFormElement = document.getElementById('forgotPasswordFormElement');
    if (forgotPasswordFormElement) {
        forgotPasswordFormElement.addEventListener('submit', handleForgotPassword);
        formatCPFInput(document.getElementById('forgotCpf'));
    }

    const verifyCodeFormElement = document.getElementById('verifyCodeFormElement');
    if (verifyCodeFormElement) {
        verifyCodeFormElement.addEventListener('submit', handleVerifyCode);
    }

    const resetPasswordFormElement = document.getElementById('resetPasswordFormElement');
    if (resetPasswordFormElement) {
        resetPasswordFormElement.addEventListener('submit', handleResetPassword);
    }

    // Back to login links
    const backToLoginFromForgot = document.getElementById('backToLoginFromForgot');
    if (backToLoginFromForgot) {
        backToLoginFromForgot.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    }

    const backToLoginFromVerify = document.getElementById('backToLoginFromVerify');
    if (backToLoginFromVerify) {
        backToLoginFromVerify.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    }

    const backToLoginFromReset = document.getElementById('backToLoginFromReset');
    if (backToLoginFromReset) {
        backToLoginFromReset.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    }

    // Resend code link
    const resendCodeLink = document.getElementById('resendCode');
    if (resendCodeLink) {
        resendCodeLink.addEventListener('click', (e) => { e.preventDefault(); handleResendCode(); });
    }

    // Waiting page logout button
    const waitingLogoutBtn = document.getElementById('waitingLogoutBtn');
    if (waitingLogoutBtn) {
        waitingLogoutBtn.addEventListener('click', logout);
    }

    // Add plate button
    const addPlateBtn = document.getElementById('addPlateBtn');
    if (addPlateBtn) {
        addPlateBtn.addEventListener('click', addAdditionalPlateInput);
    }

    // Input Formatting
    formatCPFInput(document.getElementById('loginCpf'));
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

    // Plates management button
    const btnPlates = document.getElementById('btnPlates');
    if (btnPlates) {
        btnPlates.addEventListener('click', showPlatesPage);
    }

    // Back to main from plates
    const backToMainFromPlates = document.getElementById('backToMainFromPlates');
    if (backToMainFromPlates) {
        backToMainFromPlates.addEventListener('click', () => showPage(dashboardPage));
    }

    // Plates page logout
    const platesLogoutBtn = document.getElementById('platesLogoutBtn');
    if (platesLogoutBtn) {
        platesLogoutBtn.addEventListener('click', logout);
    }

    // Add new plate button
    const addNewPlateBtn = document.getElementById('addNewPlateBtn');
    if (addNewPlateBtn) {
        addNewPlateBtn.addEventListener('click', addNewPlate);
    }

    // Allow Enter key to add plate
    const newPlateInput = document.getElementById('newPlateInput');
    if (newPlateInput) {
        newPlateInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewPlate();
            }
        });
        formatPlateInput(newPlateInput);
    }

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

    // PDF Export button
    const exportPdfBtn = document.getElementById('exportExtratoPdfBtn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportExtratoPDF);
    }

    // Format plate inputs (loginPlate may not exist anymore)
    const loginPlate = document.getElementById('loginPlate');
    if (loginPlate) formatPlateInput(loginPlate);

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


