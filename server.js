const express = require('express');
const cors = require('cors');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const app = express();
const port = process.env.PORT || 4000; // Use environment variable for port

app.use(cors());
app.use(express.json());

function getOTPFromEmail(email, password, senderEmail) {
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
            imap.openBox('INBOX', true, cb);
        }

        imap.once('ready', function () {
            openInbox(function (err, box) {
                if (err) return reject(err);

                const criteria = ['UNSEEN', ['FROM', senderEmail]]; // Filter by sender email
                const fetchOptions = { bodies: '' };

                imap.search(criteria, (err, results) => {
                    if (err) return reject(err);

                    if (!results || !results.length) {
                        imap.end();
                        return reject('No unread emails from the specified sender found');
                    }

                    const f = imap.fetch(results, fetchOptions);

                    f.on('message', (msg) => {
                        msg.on('body', async (stream) => {
                            const parsed = await simpleParser(stream);
                            const otp = extractOTP(parsed.text);

                            if (otp) {
                                imap.end();
                                resolve({ otp });
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
    const otpRegex = /\b\d{6}\b/; // Adjust the regex based on OTP format
    const match = text.match(otpRegex);
    return match ? match[0] : null;
}

app.post('/otp1', async (req, res) => {
    const { email, password, senderEmail } = req.body;

    if (!email || !password || !senderEmail) {
        return res.status(400).json({ error: "Email, password, and senderEmail are required." });
    }

    try {
        const otp = await getOTPFromEmail(email, password, senderEmail);
        res.json(otp);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve OTP: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
