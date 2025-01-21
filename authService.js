const bcrypt = require('bcryptjs');
const uuid = require('uuid');
const emailService = require('./emailService');
const moment = require('moment');

const saltRounds = 10;

async function signupUser(pool, username, email, password) {
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const verificationToken = uuid.v4();
        const conn = await pool.getConnection();
        const [existingUser] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (existingUser.length) {
            conn.release();
            return { error: "User with that email already exists" };
        }
        console.log(`Signup Attempt: Email: ${email}, Generated Token: ${verificationToken}`); // Log before insertion
        const [result] = await conn.execute(
            'INSERT INTO users (username, email, password, verificationToken) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, verificationToken]
        );

        console.log("Signup Insertion Result:", result); // Log insertion result
        conn.release();

        await emailService.sendVerificationEmail(email, verificationToken);
        return { userId: result.insertId, user: { username: username, email: email } };
    } catch (error) {
        console.error('Error signing up user:', error);
        return { error: "Error during signup, try using a different username and try again later"};
    }
}

async function loginUser(pool, email, password) {
    try {
        const conn = await pool.getConnection();
        const [users] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            conn.release();
            return { error: "User with that email doesn't exist" };
        }
        const user = users[0];

        const passwordMatch = await bcrypt.compare(password, user.password);
        conn.release();
        if (!passwordMatch) {
            return { error: "Incorrect email or password provided" };
        }
        if (!user.isVerified) {
            return { error: 'Please verify your email to continue' };
        }

        return { userId: user.id, user: { username: user.username, email: user.email } };

    } catch (error) {
        console.error("Error logging user", error);
        return { error: "Error during login, please try again later" };
    }
}

async function forgotPassword(pool, email) {
    try {
        const conn = await pool.getConnection();
        const [users] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            conn.release();
            return { error: "There is no user associated with this email" };
        }
        const user = users[0];
        const resetToken = uuid.v4();
        const resetTokenExpiry = moment().add(1, 'hour').toDate(); // 1 hour from now

        await conn.execute('UPDATE users SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?',
            [resetToken, resetTokenExpiry, user.id]);

        conn.release();

        await emailService.sendPasswordResetEmail(email, resetToken);

        return {};

    } catch (err) {
        console.error("Error when requesting forgot password", err);
        return { error: 'Error during password reset, please try again later.' };
    }
}

async function resetPassword(pool, token, newPassword) {
    try {
        const conn = await pool.getConnection();
        // Modified to query using token AND ensure token is not expired
        const [users] = await conn.execute('SELECT * FROM users WHERE resetToken = ? AND resetTokenExpiry > ?', [token.trim(), moment().toDate()]);

        if (users.length === 0) {
            conn.release();
             return { error: "Invalid or expired password reset token" };
        }
        const user = users[0];

        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        await conn.execute('UPDATE users SET password = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ?',
            [hashedNewPassword, user.id]);
        conn.release();
        return { message: 'Password reset successfully!' };
    } catch (err) {
        console.error("Error during reset", err);
       return { error: "Error resetting password, please try again later" };
    }
}

async function verifyEmail(pool, token) {
     try {
         const conn = await pool.getConnection();
         // Modified to query using token
         const [users] = await conn.execute('SELECT * FROM users WHERE LOWER(verificationToken) = LOWER(?)', [token.trim()]);
         if (users.length === 0) {
            conn.release();
            console.log("Verification Failed: Token not found in database:", token,  "Database Token:", user.verificationToken); // Added log
            return { error: 'Invalid token, user cannot be verified' };
        }
         const user = users[0];
         console.log("Verification Attempt: Received Token:", token, "Database Token:", user.verificationToken); // Added log
         if (user.isVerified) {
            conn.release();
             return { error: 'User is already verified' };
         }
        await conn.execute('UPDATE users SET isVerified = TRUE, verificationToken = NULL WHERE id = ?', [user.id]);
        conn.release();
        return { message: 'Email verified successfully' };

    } catch (err) {
        console.error("Error verifying user email", err);
        return { error: 'There has been an issue verifying your email, please try again later.' };
    }
}


module.exports = {
    signupUser,
    loginUser,
    forgotPassword,
    resetPassword,
    verifyEmail,
};