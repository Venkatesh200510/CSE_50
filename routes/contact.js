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
  if (!email || !message)
    return res.status(400).json({ error: "Email and message are required" });

  try {
    const response = await resend.emails.send({
      from: "dams.project25@gmail.com",   // ✅ must be verified in Resend
      to: "dams.project25@gmail.com",
      reply_to: email,
      subject: `📩 New Contact Us Message from ${email}`,
      text: `Email: ${email}\n\nMessage:\n${message}`,
    });

    res.json({ success: true, message: "Message sent successfully!", response });
  } catch (error) {
    console.error("Error sending contact email:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
