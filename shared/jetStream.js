import { connect, StringCodec } from "nats";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";
let nc = null, js = null, sc = StringCodec();

export const connectJetStream = async () => {
    if (!nc) {
        nc = await connect({ servers: NATS_URL });
        js = nc.jetstream();
        console.log("✅ Connected to JetStream");
    }
    return { nc, js, sc };
};

export const publishSubmissionEvent = async (js, sc, { id, submissionId, qid, questionTitle, problemSetterName, results }) => {
    let status = results.every(r => r.isCorrect) ? "AC" : "WA";

    try {
        await js.publish("user.submission.created", sc.encode(JSON.stringify({
            submissionId,
            id, qid, questionTitle,
            problemSetter: problemSetterName,
            status
        })));
        console.log("📨 Message published to JetStream");
    } catch (err) {
        console.error("❌ Failed to publish message:", err);
    }
};
