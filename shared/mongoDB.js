import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/userdb";
const DB_NAME = "userdb";

let mongoClient = null;

export const getSubmissionCollection = async () => {
    if (!mongoClient) {
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        console.log("✅ Connected to MongoDB");
    }

    const db = mongoClient.db(DB_NAME);
    return db.collection("submissions");
};
