const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const CLIENT_URL = process.env.CLIENT_URL || "http://192.168.43.45:8000";

// Validate that email environment variables exist
if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASSWORD) {
    console.error("Missing email environment variables, please ensure every variable has been created properly in `.env` file");
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: true,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
    },
});

async function sendVerificationEmail(userEmail, verificationToken) {
    const verificationLink = `${CLIENT_URL}?type=verify&token=${verificationToken}`;;
    try {
        await transporter.sendMail({
            from: EMAIL_USER,
            to: userEmail,
            subject: 'Verify Your Email Address',
            html: `
              <p>Hello,</p>
              <p>Please verify your email address by clicking on the following link:</p>
               <p><a href="${verificationLink}">Verify Email</a></p>
             <p>This link is valid for 1 hour.</p>
           `,
        });
        console.log('Verification email sent successfully');

    } catch (error) {
        console.error('Error sending verification email:', error);
    }
}

async function sendPasswordResetEmail(userEmail, resetToken) {
    const resetLink = `${CLIENT_URL}?type=reset&token=${resetToken}`;
    try {
        await transporter.sendMail({
            from: EMAIL_USER,
            to: userEmail,
            subject: 'Password Reset Request',
            html: `
          <p>Hello,</p>
              <p>You have requested a password reset. Click the link below to set a new password:</p>
                <p><a href="${resetLink}">Reset password</a></p>
           <p>This link is valid for 1 hour.</p>
           `
        });
        console.log('Password reset email sent successfully');

    } catch (error) {
        console.error('Error sending password reset email:', error);
    }
}

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
};