const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

// Configure transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "dams.project25@gmail.com",
    pass: "totl oecx oktp kqtv", // App password (not Gmail login password!)
  },
});

// POST /contact
router.post("/", async (req, res) => {
  const { email, message } = req.body;

  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required" });
  }

  const mailOptions = {
    from: '"CSE Department Website" <dams.project25@gmail.com>',
    replyTo: email,
    to: "dams.project25@gmail.com",
    subject: `📩 New Contact Us Message from ${email}`,
    text: `Email: ${email}\n\nMessage:\n${message}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    console.error("Error sending email:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
