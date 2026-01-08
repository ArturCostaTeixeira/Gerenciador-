/**
 * Cliente Portal - Frontend Application
 */

const API_BASE = '/api';

// State
let token = localStorage.getItem('cliente_token');
let clienteInfo = null;
let freights = [];
let currentCpf = '';

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const authError = document.getElementById('authError');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

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
    if (!dateString) return '-';
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value || 0);
}

function formatPricePerKmTon(value) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
    }).format(value || 0);
}

function formatCpf(value) {
    const numbers = value.replace(/\D/g, '').substring(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
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

function showToast(message, isError = false) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.toggle('toast-error', isError);
    toast.classList.toggle('toast-success', !isError);
    setTimeout(() => toast.classList.add('hidden'), 3000);
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
// Pages Navigation
// ========================================

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
    });
    page.classList.remove('hidden');
    page.classList.add('active');
}

function showForm(formId) {
    document.querySelectorAll('.form-section').forEach(f => f.classList.add('hidden'));
    document.getElementById(formId)?.classList.remove('hidden');
}

// ========================================
// Authentication
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    const cpf = document.getElementById('loginCpf').value;
    const password = document.getElementById('loginPassword').value;

    setLoading(button, true);
    try {
        const data = await apiRequest('/auth/cliente/login', {
            method: 'POST',
            body: JSON.stringify({ cpf, password })
        });
        token = data.token;
        localStorage.setItem('cliente_token', token);
        await loadDashboard();
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    const cpf = document.getElementById('forgotCpf').value;

    setLoading(button, true);
    try {
        const data = await apiRequest('/auth/cliente/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ cpf })
        });
        currentCpf = cpf;
        document.getElementById('verifyCodeSubtitle').textContent = `Código enviado para ${data.phone}`;
        showForm('verifyCodeForm');
        showToast(data.message);
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleVerifyCode(e) {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    const code = document.getElementById('verifyCode').value;

    setLoading(button, true);
    try {
        await apiRequest('/auth/cliente/verify-reset-code', {
            method: 'POST',
            body: JSON.stringify({ cpf: currentCpf, code })
        });
        showForm('resetPasswordForm');
        showToast('Código verificado com sucesso!');
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showError('As senhas não coincidem');
        return;
    }

    setLoading(button, true);
    try {
        await apiRequest('/auth/cliente/reset-password', {
            method: 'POST',
            body: JSON.stringify({ cpf: currentCpf, newPassword })
        });
        showToast('Senha alterada com sucesso!');
        showForm('loginForm');
        document.getElementById('loginCpf').value = currentCpf;
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(button, false);
    }
}

function logout() {
    token = null;
    clienteInfo = null;
    localStorage.removeItem('cliente_token');
    showPage(loginPage);
    document.getElementById('loginFormElement').reset();
    showForm('loginForm');
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
    try {
        // Verify token
        const verify = await apiRequest('/auth/verify');
        if (!verify.valid || verify.type !== 'cliente') throw new Error('Invalid session');

        clienteInfo = verify.user;

        // Update header with empresa name and user name
        document.getElementById('empresaName').textContent = clienteInfo.empresa || 'Empresa';
        document.getElementById('welcomeText').textContent = `Olá, ${clienteInfo.name}!`;

        showPage(dashboardPage);
        await loadStats();
        await loadFreights();
    } catch (error) {
        console.error('Dashboard error:', error);
        logout();
    }
}

async function loadStats(filters = {}) {
    try {
        let url = '/cliente/stats';
        const params = new URLSearchParams();
        if (filters.date_from) params.append('date_from', filters.date_from);
        if (filters.date_to) params.append('date_to', filters.date_to);
        if (params.toString()) url += `?${params.toString()}`;

        const stats = await apiRequest(url);
        document.getElementById('totalFreightsCount').textContent = stats.total_freights;
        document.getElementById('totalKm').textContent = formatNumber(stats.total_km);
        document.getElementById('totalTons').textContent = formatNumber(stats.total_tons, 2);
        document.getElementById('totalValue').textContent = formatCurrency(stats.total_value);
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

async function loadFreights(filters = {}) {
    const tbody = document.getElementById('freightsTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';

    try {
        let url = '/cliente/freights';
        const params = new URLSearchParams();
        if (filters.date_from) params.append('date_from', filters.date_from);
        if (filters.date_to) params.append('date_to', filters.date_to);
        if (params.toString()) url += `?${params.toString()}`;

        const data = await apiRequest(url);
        freights = data.freights || [];
        renderFreightsTable();
    } catch (error) {
        console.error('Load freights error:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="error">Erro ao carregar fretes</td></tr>';
    }
}

function renderFreightsTable() {
    const tbody = document.getElementById('freightsTableBody');

    if (freights.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nenhum frete encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = freights.map(f => {
        const comprovanteDescarga = f.comprovante_descarga
            ? `<a href="${f.comprovante_descarga}" target="_blank" class="btn btn-sm btn-outline">Ver</a>`
            : '-';

        return `
            <tr>
                <td>${formatDate(f.date)}</td>
                <td><span class="plate-badge">${f.plate || f.driver_plate || '-'}</span></td>
                <td>${formatNumber(f.km)}</td>
                <td>${formatNumber(f.tons, 2)}</td>
                <td>R$ ${formatPricePerKmTon(f.price_per_km_ton_transportadora)}</td>
                <td class="value-positive">${formatCurrency(f.total_value_transportadora)}</td>
                <td>${comprovanteDescarga}</td>
            </tr>
        `;
    }).join('');
}

function handleFilter() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const filters = { date_from: dateFrom, date_to: dateTo };
    loadStats(filters);
    loadFreights(filters);
}

function clearFilter() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    loadStats();
    loadFreights();
}

// ========================================
// Password Toggle
// ========================================

function setupPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            const img = btn.querySelector('img');

            if (input.type === 'password') {
                input.type = 'text';
                img.src = 'eye-closed.png';
            } else {
                input.type = 'password';
                img.src = 'eye-open.png';
            }
        });
    });
}

// ========================================
// CPF Formatting
// ========================================

function setupCpfFormatters() {
    document.querySelectorAll('#loginCpf, #forgotCpf').forEach(input => {
        input.addEventListener('input', (e) => {
            e.target.value = formatCpf(e.target.value);
        });
    });
}

// ========================================
// Event Listeners
// ========================================

function initEventListeners() {
    // Login form
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);

    // Forgot password flow
    document.getElementById('showForgotPassword').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('forgotPasswordForm');
    });
    document.getElementById('forgotPasswordFormElement').addEventListener('submit', handleForgotPassword);
    document.getElementById('verifyCodeFormElement').addEventListener('submit', handleVerifyCode);
    document.getElementById('resetPasswordFormElement').addEventListener('submit', handleResetPassword);

    // Back to login links
    document.getElementById('backToLoginFromForgot').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('loginForm');
    });
    document.getElementById('backToLoginFromVerify').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('loginForm');
    });
    document.getElementById('backToLoginFromReset').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('loginForm');
    });

    // Resend code
    document.getElementById('resendCode').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const data = await apiRequest('/auth/cliente/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ cpf: currentCpf })
            });
            showToast(data.message);
        } catch (error) {
            showError(error.message);
        }
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Filters
    document.getElementById('filterBtn').addEventListener('click', handleFilter);
    document.getElementById('clearFilterBtn').addEventListener('click', clearFilter);

    // PDF Export
    document.getElementById('exportPdfBtn').addEventListener('click', exportPDF);
}

// ========================================
// PDF Export
// ========================================

async function exportPDF() {
    const content = document.getElementById('clienteContent');

    if (!content) {
        showToast('Conteúdo não encontrado', true);
        return;
    }

    // Show loading state
    const exportBtn = document.getElementById('exportPdfBtn');
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
                logoImg.src = 'logo1.jpg';
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

        const empresaName = clienteInfo?.empresa || 'Cliente';
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(16);
        pdf.text(`Relatório de Fretes`, 10, 15);
        pdf.setFontSize(12);
        pdf.text(`Cliente: ${empresaName}`, 10, 22);
        pdf.setFontSize(10);
        pdf.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 10, 28);

        // Add date range if filter is applied
        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;
        if (dateFrom || dateTo) {
            const fromStr = dateFrom ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
            const toStr = dateTo ? new Date(dateTo + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
            pdf.text(`Período: ${fromStr} até ${toStr}`, 10, 34);
        }

        // Add content image
        const imgData = canvas.toDataURL('image/png');

        // Handle multi-page if content is too long
        let yPosition = dateFrom || dateTo ? 42 : 36;
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
        const sanitizedName = empresaName.replace(/[^a-zA-Z0-9]/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `Relatorio_Fretes_${sanitizedName}_${dateStr}.pdf`;

        pdf.save(filename);
        showToast('PDF exportado com sucesso!');
    } catch (error) {
        console.error('PDF export error:', error);
        content.classList.remove('pdf-print-mode');
        showToast('Erro ao gerar PDF. Tente novamente.', true);
    } finally {
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
    }
}

// ========================================
// Initialization
// ========================================

async function init() {
    initEventListeners();
    setupPasswordToggles();
    setupCpfFormatters();

    // Check for existing token
    if (token) {
        try {
            await loadDashboard();
        } catch (error) {
            logout();
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
