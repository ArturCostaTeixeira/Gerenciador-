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
 * Send verification code via SMS using Twilio Verify
 * Uses SMS channel for verification
 * @param {string} phoneNumber - Phone number (e.g., 69992042544)
 * @returns {Promise<object>} - Result
 */
async function sendWhatsAppVerificationCode(phoneNumber) {
    try {
        // Format phone number with country code
        let cleanPhone = phoneNumber.replace(/\D/g, '');
        if (!cleanPhone.startsWith('55')) {
            cleanPhone = '55' + cleanPhone;
        }
        const formattedPhone = '+' + cleanPhone;

        console.log(`Sending SMS verification to: ${formattedPhone}`);

        const serviceSid = getVerifyServiceSid();
        if (!serviceSid) {
            throw new Error('TWILIO_SERVICE_ID not configured');
        }

        // Use Twilio Verify API with SMS channel
        const verification = await getTwilioClient().verify.v2
            .services(serviceSid)
            .verifications
            .create({ to: formattedPhone, channel: 'sms' });

        console.log(`SMS verification sent: ${verification.sid}, status: ${verification.status}`);
        return { success: true, sid: verification.sid, channel: 'sms', status: verification.status };
    } catch (error) {
        console.error('Verification send error:', error);
        throw error;
    }
}



/**
 * Fallback: Send verification code via SMS
 */
async function sendVerificationCodeSMS(phoneNumber) {
    try {
        let formattedPhone = phoneNumber.replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) {
            formattedPhone = '55' + formattedPhone;
        }
        formattedPhone = '+' + formattedPhone;

        console.log(`Sending SMS verification to: ${formattedPhone}`);

        const verification = await getTwilioClient().verify.v2
            .services(getVerifyServiceSid())
            .verifications
            .create({ to: formattedPhone, channel: 'sms' });

        console.log(`SMS verification sent: ${verification.sid}, status: ${verification.status}`);
        return { success: true, sid: verification.sid, status: verification.status };
    } catch (error) {
        console.error('SMS send error:', error);
        throw error;
    }
}

/**
 * Verify code entered by user
 * First checks in-memory codes (for WhatsApp), then falls back to Twilio Verify (for SMS)
 * @param {string} phoneNumber - Phone number
 * @param {string} code - 6-digit verification code
 * @returns {Promise<object>} - Verification result
 */
async function verifyWhatsAppCode(phoneNumber, code) {
    try {
        // Format phone number with country code
        let formattedPhone = phoneNumber.replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) {
            formattedPhone = '55' + formattedPhone;
        }
        formattedPhone = '+' + formattedPhone;

        console.log(`Verifying code for: ${formattedPhone}`);

        // First, check in-memory codes (used for WhatsApp template messages)
        const storedData = whatsappVerificationCodes.get(formattedPhone);

        if (storedData) {
            console.log('Found in-memory verification code (WhatsApp)');

            if (storedData.expires < Date.now()) {
                console.log('Code expired');
                whatsappVerificationCodes.delete(formattedPhone);
                return { valid: false, status: 'expired' };
            }

            if (storedData.code === code) {
                console.log('Code verified successfully (WhatsApp)');
                whatsappVerificationCodes.delete(formattedPhone);
                return { valid: true, status: 'approved' };
            } else {
                console.log('Invalid code');
                return { valid: false, status: 'invalid' };
            }
        }

        // Fallback: Check with Twilio Verify API (used for SMS)
        console.log('Checking with Twilio Verify API (SMS)');

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
        console.error('Verify code error:', error);

        // If code is wrong or expired, Twilio throws an error
        if (error.code === 20404) {
            return { valid: false, status: 'not_found' };
        }
        if (error.code === 60202) {
            return { valid: false, status: 'max_attempts_reached' };
        }

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
