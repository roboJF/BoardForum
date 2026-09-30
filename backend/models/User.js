import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // stored as a bcrypt hash
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
