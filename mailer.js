const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "dams.project25@gmail.com", // your email
    pass: "totl oecx oktp kqtv",      // your app password
  },
});

module.exports = { transporter };
