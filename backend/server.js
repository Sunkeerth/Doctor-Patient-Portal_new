require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const qr = require("qr-image");

const app = express();
app.use(express.json());
app.use(cors()); // ✅ Enable CORS

// 1. Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/doctorsDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected Successfully!"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// 2. Define Schemas & Models
// 🔹 Availability Schema
const AvailabilitySchema = new mongoose.Schema({
  day: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  location: { type: String, default: "Office" },
});

// 🔹 Doctor Schema
const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  specialty: String,
  experience: Number,
  location: String,
  availability: [AvailabilitySchema],
  // (Optional) If you want to store appointments in the Doctor document:
  // appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }],
});
const Doctor = mongoose.model("Doctor", DoctorSchema);
const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  age: Number,
  gender: String,
  phone: String,
  address: String,
  // (Optional) If you want to store appointments in the Patient document:
  // appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }],
});
const Patient = mongoose.model("Patient", PatientSchema);

const AppointmentSchema = new mongoose.Schema({
  patientName: String,
  patientEmail: String,
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
  timeSlot: String,
  status: { type: String, default: "Booked" },
});
const Appointment = mongoose.model("Appointment", AppointmentSchema);

// 🔹 Patient Schema

// 3. JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  try {
    // Use fallback "mysecret" if process.env.JWT_SECRET not set
    const verified = jwt.verify(token, process.env.JWT_SECRET || "mysecret");
    req.user = verified; // e.g., { doctorId: "..." }
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

app.post("/api/registerDoctor", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      specialty,
      experience,
      location,
      availability,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !email ||
      !password ||
      !specialty ||
      !experience ||
      !location ||
      !availability
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check if doctor already exists
    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      return res
        .status(400)
        .json({ message: "Doctor with this email already exists." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new doctor
    const doctor = new Doctor({
      name,
      email,
      password: hashedPassword,
      specialty,
      experience,
      location,
      availability,
    });
    await doctor.save();

    return res.status(201).json({
      message: "Doctor registered successfully!",
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
      },
    });
  } catch (error) {
    console.error("Error registering doctor:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// 4. Patient Registration
app.post("/api/registerPatient", async (req, res) => {
  try {
    const { name, email, password, age, gender, phone, address } = req.body;

    // Validate required fields
    if (!name || !email || !password || !age || !gender || !phone || !address) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check if patient already exists
    const existingPatient = await Patient.findOne({ email });
    if (existingPatient) {
      return res
        .status(400)
        .json({ message: "Patient with this email already exists." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create and save new patient
    const patient = new Patient({
      name,
      email,
      password: hashedPassword,
      age,
      gender,
      phone,
      address,
    });
    await patient.save();

    res.status(201).json({ message: "Patient registered successfully!" });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});
// 5. Doctor Registration

// 6. Patient Login
app.post("/api/loginPatient", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required." });
    }

    const patient = await Patient.findOne({ email });
    if (!patient) {
      return res.status(401).json({ message: "Patient not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, patient.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password." });
    }

    const secret = process.env.JWT_SECRET || "mysecret";
    const token = jwt.sign({ patientId: patient._id }, secret, {
      expiresIn: "1h",
    });

    res.json({
      success: true,
      message: "Patient logged in successfully!",
      token,
      patient: {
        id: patient._id, // or _id
        name: patient.name,
        email: patient.email,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        address: patient.address,
      },
    });
  } catch (error) {
    console.error("Patient login error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// 7. Doctor Login
app.post("/api/loginDoctor", async (req, res) => {
  try {
    const { email, password } = req.body;
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(401).json({ message: "Doctor not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, doctor.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password." });
    }

    const secret = process.env.JWT_SECRET || "mysecret";
    const token = jwt.sign({ doctorId: doctor._id }, secret, {
      expiresIn: "1h",
    });

    return res.json({
      success: true,
      message: "Doctor logged in successfully!",
      token,
    });
  } catch (error) {
    console.error("Doctor login error:", error);
    return res.status(500).json({ message: "Server error." });
  }
});

// 8. Get Doctor Availability
app.get("/api/doctor/:doctorId", authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    res.json({ availability: doctor.availability });
  } catch (error) {
    console.error("Error fetching doctor availability:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/setAvailability", authenticateToken, async (req, res) => {
  try {
    const { doctorId, availability } = req.body;
    if (!doctorId || !Array.isArray(availability)) {
      return res.status(400).json({ message: "Invalid request format." });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found." });
    }

    // Overwrite existing availability
    doctor.availability = availability;
    await doctor.save();

    return res.json({
      message: "Availability updated successfully!",
      doctor: {
        _id: doctor._id,
        availability: doctor.availability,
      },
    });
  } catch (error) {
    console.error("Error setting availability:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// 9. Set Doctor Availability
app.post("/api/bookAppointment", async (req, res) => {
  try {
    const { doctorId, patientId, patientName, patientEmail, timeSlot } =
      req.body;
    if (!doctorId || !patientId || !patientName || !patientEmail || !timeSlot) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check concurrency: if slot is taken
    const existing = await Appointment.findOne({ doctorId, timeSlot });
    if (existing) {
      return res.status(400).json({ message: "Time slot already booked!" });
    }

    // Create new appointment
    const appointment = new Appointment({
      doctorId,
      patientId,
      patientName,
      patientEmail,
      timeSlot,
      status: "Booked",
    });
    await appointment.save();

    // Link appointment to patient (optional, if your schema includes it)
    await Patient.findByIdAndUpdate(patientId, {
      $push: { appointments: appointment._id },
    });

    // Optionally send email
    sendEmail(
      patientEmail,
      "Appointment Confirmation",
      `Dear ${patientName}, your appointment is booked for ${timeSlot}.`
    );

    return res.status(201).json({
      message: "Appointment booked successfully!",
      appointment,
    });
  } catch (error) {
    console.error("Booking Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 10. Book Appointment
// app.post("/api/bookAppointment", async (req, res) => {
//   try {
//     const { doctorId, patientId, patientName, patientEmail, timeSlot } =
//       req.body;

//     // 1) Validate fields
//     if (!doctorId || !patientId || !patientName || !patientEmail || !timeSlot) {
//       return res.status(400).json({ message: "All fields are required." });
//     }

//     // 2) Check if slot is already booked
//     const existing = await Appointment.findOne({ doctorId, timeSlot });
//     if (existing) {
//       return res.status(400).json({ message: "Time slot already booked!" });
//     }

//     // 3) Create the new appointment
//     const appointment = new Appointment({
//       doctorId,
//       patientId,
//       patientName,
//       patientEmail,
//       timeSlot,
//       status: "Booked",
//     });
//     await appointment.save();

//     // 4) Optionally link appointment to patient's array
//     await Patient.findByIdAndUpdate(patientId, {
//       $push: { appointments: appointment._id },
//     });

//     // 5) Send optional email notification
//     sendEmail(
//       patientEmail,
//       "Appointment Confirmation",
//       `Dear ${patientName}, your appointment is booked for ${timeSlot}.`
//     );

//     // 6) Return success
//     return res.status(201).json({
//       message: "Appointment booked successfully!",
//       appointment,
//     });
//   } catch (error) {
//     console.error("Booking Error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// email sending function
function sendEmail(to, subject, text) {
  // Make sure you set EMAIL_USER and EMAIL_PASS in your .env or environment
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = { from: process.env.EMAIL_USER, to, subject, text };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error("Error sending email:", err);
    } else {
      console.log("Email sent:", info.response);
    }
  });
}

// 11. Cancel Appointment
// POST /api/cancelAppointment
app.post("/api/cancelAppointment", authenticateToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { appointmentId, patientId, patientEmail } = req.body;
    if (!appointmentId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Appointment ID required." });
    }

    // 1) Check if the appointment exists
    const appointment = await Appointment.findById(appointmentId).session(
      session
    );
    if (!appointment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Appointment not found." });
    }

    // 2) Delete the appointment
    await Appointment.findByIdAndDelete(appointmentId).session(session);

    // 3) Remove appointment from patient's array
    await Patient.findByIdAndUpdate(
      patientId,
      { $pull: { appointments: appointmentId } },
      { session }
    );

    // 4) Commit
    await session.commitTransaction();
    session.endSession();

    // 5) Optionally send email
    sendEmail(
      patientEmail,
      "Appointment Cancelled",
      `Your appointment on ${appointment.timeSlot} was cancelled.`
    );

    return res.json({ message: "Appointment cancelled successfully!" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error cancelling appointment:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// 12. Search Doctors
app.get("/api/searchDoctors", async (req, res) => {
  try {
    const doctors = await Doctor.find().select("-password");
    res.json(doctors);
  } catch (error) {
    console.error("Error fetching doctors:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// 13. Start Server on port 3019
app.listen(3019, () => {
  console.log("🚀 Server running on http://localhost:3019");
});
