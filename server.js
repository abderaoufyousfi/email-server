const express = require('express');
const cors = require('cors');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

function getOTPFromEmail(email, password) {
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
                if (err) throw err;

                const criteria = ['UNSEEN'];
                const fetchOptions = { bodies: '' };

                imap.search(criteria, (err, results) => {
                    if (err) throw err;

                    if (!results || !results.length) {
                        imap.end();
                        return reject('No unread emails found');
                    }

                    const f = imap.fetch(results, fetchOptions);

                    f.on('message', (msg) => {
                        msg.on('body', async (stream) => {
                            const parsed = await simpleParser(stream);
                            const otp = extractOTP(parsed.text);

                            if (otp) {
                                imap.end();
                                resolve(otp);
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
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    try {
        const otp = await getOTPFromEmail(email, password);
        res.json({ otp });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve OTP: ' + error });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
