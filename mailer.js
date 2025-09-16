const { Resend } = require("resend");

const resend = new Resend(process.env.re_BNTnJcBj_Fxj6hzpwS2tvDL4ECY1iHRiK);

const transporter = {
  async sendMail({ to, subject, text, html }) {
    try {
      const response = await resend.emails.send({
        from: "dams.project25@gmail.com", // must be verified in Resend
        to,
        subject,
        text,
        html,
      });
      console.log("Email sent:", response);
      return response;
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  },
};

module.exports = { transporter };
