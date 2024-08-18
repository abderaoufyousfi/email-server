const express = require('express');
const cors = require('cors');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const app = express();
const port = process.env.PORT || 4000;

const corsOptions = {
    origin: '*', // Replace with your client's URL
    methods: 'GET,POST',
    allowedHeaders: 'Content-Type',
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

async function getOTPFromEmail(email, password, senderEmail, subject, retries = 3, delay = 1000) {
    const imap = new Imap({
        user: email,
        password: password,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
    });

    return new Promise((resolve, reject) => {
        const connectAndSearch = () => {
            imap.once('ready', () => {
                imap.openBox('INBOX', true, (err, box) => {
                    if (err) {
                        imap.end();
                        return reject(err);
                    }

                    const criteria = ['UNSEEN', ['FROM', senderEmail], ['SUBJECT', subject]];
                    const fetchOptions = { bodies: '', markSeen: false }; // Do not mark as seen during fetch

                    imap.search(criteria, (err, results) => {
                        if (err) {
                            imap.end();
                            return reject(err);
                        }

                        if (!results.length) {
                            imap.end();
                            if (retries > 0) {
                                console.log('Retrying to find an email...');
                                setTimeout(() => connectAndSearch(), delay);
                            } else {
                                return reject(new Error('No matching emails found after retries'));
                            }
                        }

                        // Get the latest email (i.e., the last one in the results array)
                        const latestEmail = results[results.length - 1];
                        const f = imap.fetch(latestEmail, fetchOptions);

                        f.on('message', (msg) => {
                            msg.on('body', async (stream) => {
                                try {
                                    const parsed = await simpleParser(stream);
                                    const otp = extractOTP(parsed.text);
                                    if (otp) {
                                        // Mark the email as seen after processing
                                        imap.addFlags(latestEmail, '\\Seen', (err) => {
                                            if (err) {
                                                imap.end();
                                                return reject(new Error('Failed to mark email as read: ' + err.message));
                                            }
                                            imap.end();
                                            resolve({ otp });
                                        });
                                    } else {
                                        imap.end();
                                        reject(new Error('No OTP found in the email body'));
                                    }
                                } catch (parseError) {
                                    imap.end();
                                    reject(new Error('Error parsing email: ' + parseError.message));
                                }
                            });
                        });

                        f.once('end', () => {
                            imap.end();
                        });
                    });
                });
            });

            imap.once('error', (err) => {
                if (retries > 0) {
                    console.log('Retrying due to error...');
                    setTimeout(() => connectAndSearch(), delay);
                } else {
                    reject(err);
                }
            });

            imap.connect();
        };

        connectAndSearch();
    });
}

function extractOTP(text) {
    const otpRegex = /\b\d{6}\b/; // Adjust the regex based on OTP format
    const match = text.match(otpRegex);
    return match ? match[0] : null;
}

app.post('/otp1', async (req, res) => {
    const { email, password, senderEmail, subject } = req.body;

    if (!email || !password || !senderEmail || !subject) {
        return res.status(400).json({ error: "Email, password, senderEmail, and subject are required." });
    }

    try {
        const otp = await getOTPFromEmail(email, password, senderEmail, subject);
        res.json(otp);
    } catch (error) {
        console.error('Failed to retrieve OTP:', error);
        res.status(500).json({ error: 'Failed to retrieve OTP: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
