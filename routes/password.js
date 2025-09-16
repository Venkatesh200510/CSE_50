const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db"); // adjust if db connection is elsewhere
const { isAuth } = require("../middleware/auth");
const { Resend } = require("resend");

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// In-memory OTP store
let otpStore = {};

// ================== CHANGE PASSWORD ==================
router.post("/change-password", isAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
      return res.status(400).json({ message: "All fields required" });

    const role = req.session.user.role;
    const id = role === "student" ? req.session.user.usn : req.session.user.ssn_id;
    const table = role === "student" ? "student" : "faculty";
    const idField = role === "student" ? "usn" : "ssn_id";

    const [rows] = await db.query(`SELECT * FROM ${table} WHERE ${idField}=?`, [id]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(oldPassword, rows[0].password);
    if (!match) return res.status(400).json({ message: "Old password incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query(`UPDATE ${table} SET password=? WHERE ${idField}=?`, [hashed, id]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== FORGOT PASSWORD (OTP) ==================
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    let [rows] = await db.query("SELECT * FROM student WHERE email=?", [email]);
    if (!rows.length)
      [rows] = await db.query("SELECT * FROM faculty WHERE email=?", [email]);

    if (!rows.length)
      return res.status(404).json({ message: "Email not registered" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 300000 };

    await resend.emails.send({
      from: "dams.project25@gmail.com", // ✅ must be verified in Resend dashboard
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP is: ${otp} (valid for 5 minutes)`,
    });

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================== RESET PASSWORD ==================
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const stored = otpStore[email];
    if (!stored) return res.status(400).json({ message: "OTP not requested" });
    if (Date.now() > stored.expires)
      return res.status(400).json({ message: "OTP expired" });
    if (stored.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    const hashed = await bcrypt.hash(newPassword, 10);
    let [result] = await db.query("UPDATE student SET password=? WHERE email=?", [
      hashed,
      email,
    ]);
    if (!result.affectedRows)
      await db.query("UPDATE faculty SET password=? WHERE email=?", [hashed, email]);

    delete otpStore[email];
    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
