/**
 * Twilio Verification Service
 * Handles SMS and WhatsApp verification for password reset
 */

// Twilio client is initialized lazily to ensure env vars are loaded
let client = null;

function getTwilioClient() {
    if (!client) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            console.error('ERROR: Twilio credentials not found!');
            console.error('TWILIO_ACCOUNT_SID:', accountSid ? 'SET' : 'NOT SET');
            console.error('TWILIO_AUTH_TOKEN:', authToken ? 'SET' : 'NOT SET');
            throw new Error('Twilio credentials not configured');
        }

        client = require('twilio')(accountSid, authToken);
        console.log('Twilio client initialized successfully');
    }
    return client;
}

function getWhatsAppFrom() {
    return process.env.TWILIO_WHATSAPP_FROM;
}

function getVerifyServiceSid() {
    return process.env.TWILIO_SERVICE_ID;
}

// In-memory storage for WhatsApp verification codes (with 5-minute expiration)
const whatsappVerificationCodes = new Map();

// Clean up expired codes every minute
setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of whatsappVerificationCodes.entries()) {
        if (data.expires < now) {
            whatsappVerificationCodes.delete(phone);
        }
    }
}, 60000);

/**
 * Format phone number for WhatsApp
 * @param {string} phoneNumber - Phone number
 * @returns {string} - Formatted WhatsApp number
 */
function formatToWhatsApp(phoneNumber) {
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
    }
    return 'whatsapp:+' + cleanPhone;
}

/**
 * Send verification code via WhatsApp
 * @param {string} phoneNumber - Phone number (e.g., 69992042544)
 * @returns {Promise<object>} - Result
 */
async function sendWhatsAppVerificationCode(phoneNumber) {
    try {
        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Format phone for WhatsApp
        const formattedPhone = formatToWhatsApp(phoneNumber);

        console.log(`Sending WhatsApp verification to: ${formattedPhone}`);

        // Send WhatsApp message
        const message = await getTwilioClient().messages.create({
            from: getWhatsAppFrom(),
            to: formattedPhone,
            body: `🔐 Seu código de verificação é: *${code}*\n\nVálido por 5 minutos.\n\nSe você não solicitou este código, ignore esta mensagem.`
        });

        console.log(`WhatsApp message sent: ${message.sid}`);

        // Store code with 5-minute expiration
        whatsappVerificationCodes.set(formattedPhone, {
            code: code,
            expires: Date.now() + 5 * 60 * 1000 // 5 minutes
        });

        return { success: true, sid: message.sid };
    } catch (error) {
        console.error('Twilio WhatsApp send error:', error);
        throw error;
    }
}

/**
 * Verify WhatsApp code entered by user
 * @param {string} phoneNumber - Phone number
 * @param {string} code - 6-digit verification code
 * @returns {Promise<object>} - Verification result
 */
async function verifyWhatsAppCode(phoneNumber, code) {
    try {
        const formattedPhone = formatToWhatsApp(phoneNumber);

        console.log(`Verifying WhatsApp code for: ${formattedPhone}`);

        const storedData = whatsappVerificationCodes.get(formattedPhone);

        if (!storedData) {
            console.log('No verification code found for this number');
            return { valid: false, status: 'not_found' };
        }

        if (storedData.expires < Date.now()) {
            console.log('Verification code expired');
            whatsappVerificationCodes.delete(formattedPhone);
            return { valid: false, status: 'expired' };
        }

        if (storedData.code !== code) {
            console.log('Invalid verification code');
            return { valid: false, status: 'invalid' };
        }

        // Code is valid - remove it to prevent reuse
        whatsappVerificationCodes.delete(formattedPhone);
        console.log('WhatsApp code verified successfully');

        return { valid: true, status: 'approved' };
    } catch (error) {
        console.error('WhatsApp verify code error:', error);
        throw error;
    }
}

/**
 * Send verification code via SMS (legacy)
 * @param {string} phoneNumber - Phone number (e.g., 69992042544)
 * @returns {Promise<object>} - Twilio verification response
 */
async function sendVerificationCode(phoneNumber) {
    try {
        // Ensure phone number is in E.164 format
        let formattedPhone = phoneNumber;
        if (!phoneNumber.startsWith('+')) {
            // Remove any non-digits and add Brazil code
            formattedPhone = '+55' + phoneNumber.replace(/\D/g, '');
        }

        console.log(`Sending SMS verification to: ${formattedPhone}`);

        const verification = await getTwilioClient().verify.v2
            .services(getVerifyServiceSid())
            .verifications
            .create({ to: formattedPhone, channel: 'sms' });

        console.log(`Verification sent: ${verification.sid}, status: ${verification.status}`);
        return { success: true, status: verification.status };
    } catch (error) {
        console.error('Twilio send verification error:', error);
        throw error;
    }
}

/**
 * Verify the SMS code entered by user (legacy)
 * @param {string} phoneNumber - Phone number
 * @param {string} code - 6-digit verification code
 * @returns {Promise<object>} - Verification result
 */
async function verifyCode(phoneNumber, code) {
    try {
        // Ensure phone number is in E.164 format
        let formattedPhone = phoneNumber;
        if (!phoneNumber.startsWith('+')) {
            formattedPhone = '+55' + phoneNumber.replace(/\D/g, '');
        }

        console.log(`Verifying SMS code for: ${formattedPhone}`);

        const verificationCheck = await getTwilioClient().verify.v2
            .services(getVerifyServiceSid())
            .verificationChecks
            .create({ to: formattedPhone, code: code });

        console.log(`Verification check: ${verificationCheck.status}`);
        return {
            valid: verificationCheck.status === 'approved',
            status: verificationCheck.status
        };
    } catch (error) {
        console.error('Twilio verify code error:', error);
        // If code is wrong or expired, Twilio throws an error
        if (error.code === 20404) {
            return { valid: false, status: 'not_found' };
        }
        throw error;
    }
}

module.exports = {
    sendVerificationCode,
    verifyCode,
    sendWhatsAppVerificationCode,
    verifyWhatsAppCode
};
