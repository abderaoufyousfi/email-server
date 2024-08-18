const express = require('express');
const cors = require('cors');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const app = express();
const port = process.env.PORT || 4000;

const corsOptions = {
    origin: '*', // Replace with your client's URL if needed
    methods: 'GET,POST',
    allowedHeaders: 'Content-Type',
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

function getOTPFromEmail(email, password, senderEmail, subject) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: email,
            password: password,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        });

        function openInbox(cb) {
            imap.openBox('INBOX', false, cb); // Open inbox in read/write mode
        }

        imap.once('ready', function () {
            openInbox(function (err, box) {
                if (err) return reject(err);

                const criteria = ['UNSEEN', ['FROM', senderEmail], ['SUBJECT', subject]];
                const fetchOptions = { bodies: '', markSeen: true }; // Mark emails as seen

                imap.search(criteria, (err, results) => {
                    if (err) return reject(err);

                    if (!results || !results.length) {
                        imap.end();
                        return reject(new Error('No matching unread emails found'));
                    }

                    // Fetch the latest unread email
                    const latestEmail = [results[results.length - 1]];
                    const f = imap.fetch(latestEmail, fetchOptions);

                    f.on('message', (msg) => {
                        msg.on('body', async (stream) => {
                            const parsed = await simpleParser(stream);
                            const otp = extractOTP(parsed.text);

                            if (otp) {
                                imap.end();
                                resolve({ otp });
                            } else {
                                imap.end();
                                reject(new Error('No OTP found in the email body'));
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
            reject(err);
        });

        imap.connect();
    });
}

function extractOTP(text) {
    const otpRegex = /\b\d{6}\b/;
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
        res.status(500).json({ error: 'Failed to retrieve OTP: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
