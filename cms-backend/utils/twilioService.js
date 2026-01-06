/**
 * Twilio Verify Service
 * Handles SMS verification for password reset
 */

require('dotenv').config();

// Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

// Initialize Twilio client
const client = require('twilio')(accountSid, authToken);

/**
 * Send verification code via SMS
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

        console.log(`Sending verification to: ${formattedPhone}`);

        const verification = await client.verify.v2
            .services(verifyServiceSid)
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
 * Verify the code entered by user
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

        console.log(`Verifying code for: ${formattedPhone}`);

        const verificationCheck = await client.verify.v2
            .services(verifyServiceSid)
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
    verifyCode
};
