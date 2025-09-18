const express = require("express");
const sgMail = require("@sendgrid/mail");

const router = express.Router();

// ✅ Setup SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// POST /contact
router.post("/", async (req, res) => {
  const { email, message } = req.body;
  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required" });
  }

  try {
    const msg = {
      to: "dams.project25@gmail.com", // admin/department inbox
      from: {
        name: "CSE Department Website",
        email: "dams.project25@gmail.com", // must be verified in SendGrid
      },
      replyTo: email, // so admin can reply directly to sender
      subject: `📩 New Contact Us Message from ${email}`,
      text: `Email: ${email}\n\nMessage:\n${message}`,
    };

    await sgMail.send(msg);

    res.json({ success: true, message: "Message sent successfully!" });
  } catch (error) {
    console.error("Error sending contact email:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
