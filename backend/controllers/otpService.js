import axios from "axios";
import OTP from "../models/OTP.js";

const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

async function sendViaTwilio(phone, otp) {
  const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM } = process.env;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

  await axios.post(
    url,
    new URLSearchParams({
      To: `+91${phone}`,
      From: TWILIO_FROM,
      Body: `Your PayGuard OTP is ${otp}`,
    }),
    {
      auth: {
        username: TWILIO_SID,
        password: TWILIO_TOKEN,
      },
    }
  );
}

async function sendViaMsg91(phone, otp) {
  const { MSG91_AUTHKEY, MSG91_TEMPLATE_ID } = process.env;

  await axios.post("https://api.msg91.com/api/v5/otp", {
    template_id: MSG91_TEMPLATE_ID,
    mobile: `91${phone}`,
    authkey: MSG91_AUTHKEY,
    otp,
  });
}

export async function sendOTP(phone, purpose = "register") {
  const otp = generateOTP();

  console.log("🚀 sendOTP called");
  console.log(`🔐 OTP for ${phone}: ${otp}`);

  await OTP.deleteMany({ phone });

  await OTP.create({
    phone,
    otp,
    attempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    verified: false,
    purpose,
  });

  const provider = process.env.OTP_PROVIDER || "mock";

  if (provider === "twilio") {
    await sendViaTwilio(phone, otp);
  } 
  else if (provider === "msg91") {
    await sendViaMsg91(phone, otp);
  } 
  else {
    console.log("🧪 MOCK OTP MODE (no SMS sent)");
  }

  return {
    success: true,
    message: `OTP sent to +91${phone}`,
  };
}

export async function verifyOTP(phone, otp) {
  const record = await OTP.findOne({ phone });

  if (!record) {
    return { valid: false, reason: "OTP not found" };
  }

  if (new Date(record.expiresAt) < new Date()) {
    return { valid: false, reason: "OTP expired" };
  }

  if (record.otp !== otp) {
    record.attempts += 1;
    await record.save();
    return { valid: false, reason: "Incorrect OTP" };
  }

  record.verified = true;
  await record.save();

  return { valid: true };
}