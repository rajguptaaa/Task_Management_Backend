const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        trim: true,
    },
    email: {
        type: String,
        trin: true,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    // type: {
    //     type: String,
    //     default: "Client",
    // }
},
{
    timestamps: true,
});

const User = mongoose.model("users_data", userSchema);
module.exports = User;