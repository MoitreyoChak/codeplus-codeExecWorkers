import amqp from "amqplib";
import { exec } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { MongoClient } from "mongodb";
import { connect, StringCodec } from 'nats';


const execPromise = promisify(exec);
const BROKER_URL = process.env.BROKER_URL || 'amqp://localhost';
const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/userdb"
// const MONGO_URI = "mongodb://localhost:27017/userdb";  // during local dev
// const MONGO_URI = "mongodb://ques-mongo-srv:27017/userdb"; // during k8s dev
let ch = null;

const mongoClient = new MongoClient(MONGO_URI);
await mongoClient.connect();
const db = mongoClient.db("userdb");
const collection = db.collection("submissions");

const connectRabbitMQ = async () => {
    if (ch) return ch;

    try {
        const conn = await amqp.connect(BROKER_URL);
        ch = await conn?.createChannel();
    } catch (error) {
        console.log("Oops something went wrong during RabbitMQ connection!");
        console.log(error);
    }

    let queue = "cpp-code-queue";
    await ch.assertQueue(queue, { durable: true });

    console.log("✅ Connected to RabbitMQ");
    return ch;
};

let nc = null;
let js = null;
let sc = StringCodec();

const initJetStream = async () => {
    if (!nc) {
        console.log("🔧 NATS_URL ENV:", process.env.NATS_URL);
        console.log("🔧 Using NATS_URL:", NATS_URL);

        nc = await connect({ servers: NATS_URL });
        js = nc.jetstream();
        console.log("✅ Connected to JetStream");
    }
    return { nc, js, sc };
};

(async () => {
    const channel = await connectRabbitMQ();
    await initJetStream();
    const queue = `cpp-code-queue`;

    console.log(`[*] Waiting for messages in ${queue}`);

    channel.consume(queue, async (msg) => {
        if (msg !== null) {
            const { sourceCode, id, qid, jobId, testcases, submissionId, questionTitle, problemSetterName } = JSON.parse(msg.content.toString());
            let testCases = [];
            testcases.forEach(testcase => testCases.push(testcase.input));
            console.log(`Received testcases:\n${testCases}`);
            console.log(`jobid : ${jobId}`);
            console.log(`Received C++ Code:\n${sourceCode}`);

            try {
                const results = await executeCode(sourceCode, testcases);
                console.log(`Execution Result: ${results}`);

                let updateResult = await collection.updateOne({ jobId: jobId }, {
                    $set: {
                        executionStatus: "executed",
                        results
                    }
                });

                const isExecuted = updateResult.modifiedCount === 1 ? '✅ Document updated successfully' : 'Something went wrong while updating document';
                console.log(isExecuted);

                if (updateResult.modifiedCount === 1) {
                    await publishMessage(id, submissionId, questionTitle, problemSetterName, qid, results);
                }
            } catch (error) {
                console.error(`Error executing C++ code: ${error.message}`);
            }

            channel.ack(msg);
        }
    });
})();

async function publishMessage(id, submissionId, questionTitle, problemSetterName, qid, results) {
    let status = 'AC';

    results.forEach((r) => {
        if (!r.isCorrect) {
            status = 'WA';
        }
    })

    try {
        await js.publish("user.submission.created", sc.encode(JSON.stringify({
            submissionId,
            id, qid, questionTitle,
            problemSetter: problemSetterName,
            status: status
        })));
        console.log("message published successfully!");
    } catch (error) {
        console.log("❌ Failed to publish message to JetStream:", error);
    }
}

async function executeCode(sourceCode, testCases) {
    const filename = `code.cpp`;
    const outputFile = `output`;

    fs.writeFileSync(filename, sourceCode);

    const compileCommand = `g++ ${filename} -o ${outputFile}`;
    await execPromise(compileCommand);

    let testResults = [];

    for (const testCase of testCases) {
        const { input, expectedOutput } = testCase;

        try {
            // const { stdout } = await execPromise(`echo ${input} | ${outputFile}.exe`); // during local dev (windows)
            const { stdout } = await execPromise(`echo "${input}" | ./${outputFile}`); // during k8s dev (ubuntu)

            const actualOutput = stdout.trim();
            const isCorrect = actualOutput === expectedOutput;

            testResults.push({ input, expectedOutput, actualOutput, isCorrect });
        } catch (error) {
            testResults.push({ input, expectedOutput, actualOutput: "Error", status: "failed" });
        }
    }

    return testResults;
}
