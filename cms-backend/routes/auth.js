const express = require('express');
const router = express.Router();
const Driver = require('../models/driver');
const Admin = require('../models/admin');
const Abastecedor = require('../models/abastecedor');
const Cliente = require('../models/cliente');
const { isValidPlate, normalizePlate, isValidCPF } = require('../utils/validators');
const { generateToken, verifyToken } = require('../middleware/auth');
const { sendWhatsAppVerificationCode, verifyWhatsAppCode } = require('../utils/twilioService');

/**
 * POST /api/auth/driver/signup
 * Driver sign-up (one-time registration)
 * Creates driver with name, plates (optional), password, phone, and CPF
 */
router.post('/driver/signup', async (req, res) => {
    try {
        const { name, plates, password, phone, cpf } = req.body;

        // Validate input - plates are now optional
        if (!name || !password || !phone || !cpf) {
            return res.status(400).json({ error: 'Nome, senha, telefone e CPF são obrigatórios' });
        }

        if (name.trim().length < 2) {
            return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
        }

        // Validate CPF (digits and checksum)
        if (!isValidCPF(cpf)) {
            return res.status(400).json({ error: 'CPF inválido. Verifique os números.' });
        }

        // Validate phone format (at least 10 digits)
        const phoneClean = phone.replace(/\D/g, '');
        const cpfClean = cpf.replace(/\D/g, '');
        if (phoneClean.length < 10) {
            return res.status(400).json({ error: 'Telefone inválido. Deve conter pelo menos 10 dígitos' });
        }

        // Validate and normalize plates if provided
        let normalizedPlates = [];
        if (plates && Array.isArray(plates) && plates.length > 0) {
            for (const plate of plates) {
                if (plate && plate.trim()) {
                    if (!isValidPlate(plate)) {
                        return res.status(400).json({ error: `Formato de placa inválido: ${plate}. Use ABC-1234 ou ABC-1D23` });
                    }
                    normalizedPlates.push(normalizePlate(plate));
                }
            }
        }

        // Check if CPF already exists
        const existingCpf = await Driver.findByCpf(cpfClean);
        if (existingCpf) {
            return res.status(409).json({ error: 'CPF já cadastrado no sistema' });
        }

        // Check if Phone already exists
        const existingPhone = await Driver.findByPhone(phoneClean);
        if (existingPhone) {
            return res.status(409).json({ error: 'Telefone já cadastrado no sistema' });
        }

        // Create driver - plate can be null, plates array stores all plates
        const driver = await Driver.create({
            name: name.trim(),
            plate: normalizedPlates.length > 0 ? normalizedPlates[0] : null, // First plate as primary (for backward compatibility)
            plates: normalizedPlates, // All plates stored in plates array
            price_per_km_ton: 0, // Default, admin will update
            client: null,
            password: password,
            phone: phoneClean,
            cpf: cpfClean
        });

        // Generate JWT token for immediate login
        const token = generateToken({
            id: driver.id,
            name: driver.name,
            plate: driver.plate
        }, 'driver');

        res.status(201).json({
            message: 'Sign-up successful',
            token,
            driver: {
                id: driver.id,
                name: driver.name,
                plate: driver.plate
            }
        });
    } catch (error) {
        console.error('Driver signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/driver/login
 * Driver login with CPF and password
 * Returns JWT token
 */
router.post('/driver/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;

        // Validate input
        if (!cpf || !password) {
            return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
        }

        // Clean CPF (remove formatting)
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido. Deve ter 11 dígitos.' });
        }

        // Verify password using CPF
        const driver = await Driver.verifyPasswordByCpf(cleanCpf, password);

        if (!driver) {
            return res.status(401).json({ error: 'CPF ou senha inválidos' });
        }

        if (!driver.active) {
            return res.status(401).json({ error: 'Conta do motorista está inativa' });
        }

        // Generate JWT token
        const token = generateToken({
            id: driver.id,
            name: driver.name,
            plate: driver.plate
        }, 'driver');

        res.json({
            message: 'Login successful',
            token,
            driver: {
                id: driver.id,
                name: driver.name,
                plate: driver.plate
            }
        });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/unified/login
 * Unified login - tries all user types (driver, abastecedor, cliente)
 * Returns JWT token and user type for routing
 */
router.post('/unified/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;

        // Validate input
        if (!cpf || !password) {
            return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
        }

        // Clean CPF (remove formatting)
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido. Deve ter 11 dígitos.' });
        }

        // Try driver first
        const driver = await Driver.verifyPasswordByCpf(cleanCpf, password);
        if (driver) {
            if (!driver.active) {
                return res.status(401).json({ error: 'Conta do motorista está inativa' });
            }

            const token = generateToken({
                id: driver.id,
                name: driver.name,
                plate: driver.plate
            }, 'driver');

            return res.json({
                message: 'Login successful',
                token,
                userType: 'motorista',
                user: {
                    id: driver.id,
                    name: driver.name,
                    plate: driver.plate,
                    authenticated: driver.authenticated
                }
            });
        }

        // Try abastecedor
        const abastecedor = await Abastecedor.verifyPassword(cleanCpf, password);
        if (abastecedor) {
            if (!abastecedor.active) {
                return res.status(401).json({ error: 'Conta de abastecedor inativa' });
            }

            const token = generateToken({
                id: abastecedor.id,
                name: abastecedor.name,
                cpf: abastecedor.cpf
            }, 'abastecedor');

            return res.json({
                message: 'Login successful',
                token,
                userType: 'abastecedor',
                user: {
                    id: abastecedor.id,
                    name: abastecedor.name
                }
            });
        }

        // Try cliente
        const cliente = await Cliente.verifyPassword(cleanCpf, password);
        if (cliente) {
            if (!cliente.active) {
                return res.status(401).json({ error: 'Conta de cliente inativa' });
            }

            const token = generateToken({
                id: cliente.id,
                name: cliente.name,
                empresa: cliente.empresa,
                cpf: cliente.cpf
            }, 'cliente');

            return res.json({
                message: 'Login successful',
                token,
                userType: 'cliente',
                user: {
                    id: cliente.id,
                    name: cliente.name,
                    empresa: cliente.empresa
                }
            });
        }

        // No match found
        return res.status(401).json({ error: 'CPF ou senha inválidos' });

    } catch (error) {
        console.error('Unified login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/admin/login
 * Admin login with username and password
 * Returns JWT token
 */
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const admin = await Admin.verifyCredentials(username, password);

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = generateToken({
            id: admin.id,
            username: admin.username
        }, 'admin');

        res.json({
            message: 'Login successful',
            token,
            admin: {
                id: admin.id,
                username: admin.username
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/abastecedor/login
 * Abastecedor login with CPF and password
 * Returns JWT token
 */
router.post('/abastecedor/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;

        // Validate input
        if (!cpf || !password) {
            return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
        }

        // Clean CPF
        const cpfClean = cpf.replace(/\D/g, '');

        // Validate CPF format
        if (!isValidCPF(cpfClean)) {
            return res.status(400).json({ error: 'CPF inválido' });
        }

        // Verify password
        const abastecedor = await Abastecedor.verifyPassword(cpfClean, password);

        if (!abastecedor) {
            return res.status(401).json({ error: 'CPF ou senha inválidos' });
        }

        if (!abastecedor.active) {
            return res.status(401).json({ error: 'Conta de abastecedor inativa' });
        }

        // Generate JWT token
        const token = generateToken({
            id: abastecedor.id,
            name: abastecedor.name,
            cpf: abastecedor.cpf
        }, 'abastecedor');

        res.json({
            message: 'Login successful',
            token,
            abastecedor: {
                id: abastecedor.id,
                name: abastecedor.name
            }
        });
    } catch (error) {
        console.error('Abastecedor login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/auth/verify
 * Verify token and return user info
 */
router.get('/verify', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    }

    let user = { id: decoded.id };

    if (decoded.type === 'admin') {
        user.username = decoded.username;
    } else if (decoded.type === 'driver') {
        // Fetch fresh driver data from database to get current authenticated status
        try {
            const driver = await Driver.findById(decoded.id);
            if (driver) {
                user.name = driver.name;
                user.plate = driver.plate;
                user.plates = driver.plates ? JSON.parse(driver.plates) : [];
                user.authenticated = driver.authenticated;
                user.active = driver.active;
            } else {
                user.name = decoded.name;
                user.plate = decoded.plate;
                user.plates = [];
            }
        } catch (error) {
            console.error('Error fetching driver in verify:', error);
            user.name = decoded.name;
            user.plate = decoded.plate;
            user.plates = [];
        }
    } else if (decoded.type === 'abastecedor') {
        user.name = decoded.name;
        user.cpf = decoded.cpf;
    } else if (decoded.type === 'cliente') {
        user.name = decoded.name;
        user.empresa = decoded.empresa;
        user.cpf = decoded.cpf;
    }

    res.json({
        valid: true,
        type: decoded.type,
        user
    });
});

/**
 * POST /api/auth/driver/forgot-password
 * Request password reset - sends SMS code to driver's phone
 */
router.post('/driver/forgot-password', async (req, res) => {
    try {
        const { cpf } = req.body;

        if (!cpf) {
            return res.status(400).json({ error: 'CPF é obrigatório' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido' });
        }

        // Find driver by CPF
        const driver = await Driver.findByCpf(cleanCpf);
        if (!driver) {
            return res.status(404).json({ error: 'CPF não cadastrado' });
        }

        if (!driver.phone) {
            return res.status(400).json({ error: 'Motorista não possui telefone cadastrado' });
        }

        // Send verification code via WhatsApp or SMS
        const result = await sendWhatsAppVerificationCode(driver.phone);

        // Mask phone number for response (show only last 4 digits)
        const maskedPhone = '***' + driver.phone.slice(-4);
        const channelMessage = result.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';

        res.json({
            success: true,
            message: `Código enviado por ${channelMessage}`,
            phone: maskedPhone
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Erro ao enviar código. Tente novamente.' });
    }
});

/**
 * POST /api/auth/driver/verify-reset-code
 * Verify the SMS code
 */
router.post('/driver/verify-reset-code', async (req, res) => {
    try {
        const { cpf, code } = req.body;

        if (!cpf || !code) {
            return res.status(400).json({ error: 'CPF e código são obrigatórios' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');

        // Find driver
        const driver = await Driver.findByCpf(cleanCpf);
        if (!driver) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Verify code with WhatsApp
        const result = await verifyWhatsAppCode(driver.phone, code);

        if (!result.valid) {
            return res.status(400).json({ error: 'Código inválido ou expirado' });
        }

        res.json({
            valid: true,
            message: 'Código verificado com sucesso'
        });
    } catch (error) {
        console.error('Verify reset code error:', error);
        res.status(500).json({ error: 'Erro ao verificar código' });
    }
});

/**
 * POST /api/auth/driver/reset-password
 * Reset password after code verification
 * Note: Code was already verified in verify-reset-code step
 */
router.post('/driver/reset-password', async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;

        if (!cpf || !newPassword) {
            return res.status(400).json({ error: 'CPF e nova senha são obrigatórios' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');

        // Find driver
        const driver = await Driver.findByCpf(cleanCpf);
        if (!driver) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Update password (code was already verified in previous step)
        await Driver.updatePassword(driver.id, newPassword);

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
});

// ========================================
// Abastecedor Password Reset Endpoints
// ========================================

/**
 * POST /api/auth/abastecedor/forgot-password
 * Request password reset - sends SMS code to abastecedor's phone
 */
router.post('/abastecedor/forgot-password', async (req, res) => {
    try {
        const { cpf } = req.body;

        if (!cpf) {
            return res.status(400).json({ error: 'CPF é obrigatório' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido' });
        }

        // Find abastecedor by CPF
        const abastecedor = await Abastecedor.findByCpf(cleanCpf);
        if (!abastecedor) {
            return res.status(404).json({ error: 'CPF não cadastrado' });
        }

        if (!abastecedor.phone) {
            return res.status(400).json({ error: 'Abastecedor não possui telefone cadastrado' });
        }

        // Send verification code via WhatsApp or SMS
        const result = await sendWhatsAppVerificationCode(abastecedor.phone);

        // Mask phone number for response (show only last 4 digits)
        const maskedPhone = '***' + abastecedor.phone.slice(-4);
        const channelMessage = result.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';

        res.json({
            success: true,
            message: `Código enviado por ${channelMessage}`,
            phone: maskedPhone
        });
    } catch (error) {
        console.error('Abastecedor forgot password error:', error);
        res.status(500).json({ error: 'Erro ao enviar código. Tente novamente.' });
    }
});

/**
 * POST /api/auth/abastecedor/verify-reset-code
 * Verify the SMS code
 */
router.post('/abastecedor/verify-reset-code', async (req, res) => {
    try {
        const { cpf, code } = req.body;

        if (!cpf || !code) {
            return res.status(400).json({ error: 'CPF e código são obrigatórios' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');

        // Find abastecedor
        const abastecedor = await Abastecedor.findByCpf(cleanCpf);
        if (!abastecedor) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Verify code with WhatsApp
        const result = await verifyWhatsAppCode(abastecedor.phone, code);

        if (!result.valid) {
            return res.status(400).json({ error: 'Código inválido ou expirado' });
        }

        res.json({
            valid: true,
            message: 'Código verificado com sucesso'
        });
    } catch (error) {
        console.error('Abastecedor verify reset code error:', error);
        res.status(500).json({ error: 'Erro ao verificar código' });
    }
});

/**
 * POST /api/auth/abastecedor/reset-password
 * Reset password after code verification
 * Note: Code was already verified in verify-reset-code step
 */
router.post('/abastecedor/reset-password', async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;

        if (!cpf || !newPassword) {
            return res.status(400).json({ error: 'CPF e nova senha são obrigatórios' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');

        // Find abastecedor
        const abastecedor = await Abastecedor.findByCpf(cleanCpf);
        if (!abastecedor) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Update password (code was already verified in previous step)
        await Abastecedor.updatePassword(abastecedor.id, newPassword);

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });
    } catch (error) {
        console.error('Abastecedor reset password error:', error);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
});

/**
 * POST /api/auth/driver/reset-password-cpf
 * Request password reset when user can't receive SMS
 * Sets a flag to notify admin that driver needs password reset
 */
router.post('/driver/reset-password-cpf', async (req, res) => {
    try {
        const { cpf } = req.body;

        if (!cpf) {
            return res.status(400).json({ error: 'CPF é obrigatório' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido' });
        }

        // Find driver
        const driver = await Driver.findByCpf(cleanCpf);
        if (!driver) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Set password_reset_requested flag to 1
        await Driver.update(driver.id, { password_reset_requested: true });

        res.json({
            success: true,
            message: 'Solicitação de redefinição de senha enviada ao administrador'
        });
    } catch (error) {
        console.error('Reset password CPF error:', error);
        res.status(500).json({ error: 'Erro ao solicitar redefinição de senha' });
    }
});

// ========================================
// Cliente Authentication Endpoints
// ========================================

/**
 * POST /api/auth/cliente/login
 * Cliente login with CPF and password
 * Returns JWT token
 */
router.post('/cliente/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;

        // Validate input
        if (!cpf || !password) {
            return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
        }

        // Clean CPF (remove formatting)
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido. Deve ter 11 dígitos.' });
        }

        // Verify password
        const cliente = await Cliente.verifyPassword(cleanCpf, password);

        if (!cliente) {
            return res.status(401).json({ error: 'CPF ou senha inválidos' });
        }

        if (!cliente.active) {
            return res.status(401).json({ error: 'Conta de cliente inativa' });
        }

        // Generate JWT token
        const token = generateToken({
            id: cliente.id,
            name: cliente.name,
            empresa: cliente.empresa,
            cpf: cliente.cpf
        }, 'cliente');

        res.json({
            message: 'Login successful',
            token,
            cliente: {
                id: cliente.id,
                name: cliente.name,
                empresa: cliente.empresa
            }
        });
    } catch (error) {
        console.error('Cliente login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/cliente/forgot-password
 * Request password reset - sends SMS code to cliente's phone
 */
router.post('/cliente/forgot-password', async (req, res) => {
    try {
        const { cpf } = req.body;

        if (!cpf) {
            return res.status(400).json({ error: 'CPF é obrigatório' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido' });
        }

        // Find cliente by CPF
        const cliente = await Cliente.findByCpf(cleanCpf);
        if (!cliente) {
            return res.status(404).json({ error: 'CPF não cadastrado' });
        }

        if (!cliente.phone) {
            return res.status(400).json({ error: 'Cliente não possui telefone cadastrado' });
        }

        // Send verification code via WhatsApp or SMS
        const result = await sendWhatsAppVerificationCode(cliente.phone);

        // Mask phone number for response (show only last 4 digits)
        const maskedPhone = '***' + cliente.phone.slice(-4);
        const channelMessage = result.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';

        res.json({
            success: true,
            message: `Código enviado por ${channelMessage}`,
            phone: maskedPhone
        });
    } catch (error) {
        console.error('Cliente forgot password error:', error);
        res.status(500).json({ error: 'Erro ao enviar código. Tente novamente.' });
    }
});

/**
 * POST /api/auth/cliente/verify-reset-code
 * Verify the SMS code
 */
router.post('/cliente/verify-reset-code', async (req, res) => {
    try {
        const { cpf, code } = req.body;

        if (!cpf || !code) {
            return res.status(400).json({ error: 'CPF e código são obrigatórios' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');

        // Find cliente
        const cliente = await Cliente.findByCpf(cleanCpf);
        if (!cliente) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Verify code with WhatsApp
        const result = await verifyWhatsAppCode(cliente.phone, code);

        if (!result.valid) {
            return res.status(400).json({ error: 'Código inválido ou expirado' });
        }

        res.json({
            valid: true,
            message: 'Código verificado com sucesso'
        });
    } catch (error) {
        console.error('Cliente verify reset code error:', error);
        res.status(500).json({ error: 'Erro ao verificar código' });
    }
});

/**
 * POST /api/auth/cliente/reset-password
 * Reset password after code verification
 */
router.post('/cliente/reset-password', async (req, res) => {
    try {
        const { cpf, newPassword } = req.body;

        if (!cpf || !newPassword) {
            return res.status(400).json({ error: 'CPF e nova senha são obrigatórios' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
        }

        // Clean CPF
        const cleanCpf = cpf.replace(/\D/g, '');

        // Find cliente
        const cliente = await Cliente.findByCpf(cleanCpf);
        if (!cliente) {
            return res.status(404).json({ error: 'CPF não encontrado' });
        }

        // Update password (code was already verified in previous step)
        await Cliente.updatePassword(cliente.id, newPassword);

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });
    } catch (error) {
        console.error('Cliente reset password error:', error);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
});

module.exports = router;


