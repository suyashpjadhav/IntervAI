const mongoose = require("mongoose")



async function connectToDB() {
    if (mongoose.connection.readyState >= 1) {
        return
    }

    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("Connected to Database")
    }
    catch (err) {
        console.log(err)
    }
}

module.exports = connectToDB