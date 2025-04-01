import amqp from "amqplib";
import { exec } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { MongoClient } from "mongodb";

const execPromise = promisify(exec);  // Allows using async/await for shell commands
const BROKER_URL = process.env.BROKER_URL || 'amqp://localhost';
const MONGO_URI = "mongodb://localhost:27017/userdb" // during local dev
// const MONGO_URI = "mongodb://ques-mongo-srv:27017/userdb"; // during k8s dev
let ch = null;

const mongoClient = new MongoClient(MONGO_URI);
await mongoClient.connect();
const db = mongoClient.db("userdb");
const collection = db.collection("submissions");

const connectRabbitMQ = async () => {
    if (ch) return ch; // Return existing channel if already connected

    try {
        const conn = await amqp.connect(BROKER_URL);
        ch = await conn?.createChannel();

    } catch (error) {
        console.log("Oops something went wrong during connection!")
        console.log(error);
    }

    let queue = "c-code-queue";
    await ch.assertQueue(queue, { durable: true });

    return ch;
};

(async () => {
    const channel = await connectRabbitMQ();
    const queue = `c-code-queue`;  // This worker only listens to the C language queue

    console.log(`[*] Waiting for messages in ${queue}`);

    // Consumes messages from the RabbitMQ queue
    channel.consume(queue, async (msg) => {
        if (msg !== null) {
            const { sourceCode, jobId, testcases } = JSON.parse(msg.content.toString());
            let testCases = [];
            testcases.forEach(testcase => testCases.push(testcase.input));
            console.log(`Received testcases:\n${testCases}`);
            console.log(`jobid : ${jobId}`);
            console.log(`Received C Code:\n${sourceCode}`);

            try {
                const output = await executeCode(sourceCode, testcases);
                console.log(`Execution Result: ${output}`);

                // Store the result in MongoDB
                let updateResult = await collection.updateOne({ jobId: jobId }, {
                    $set: {
                        executionStatus: "executed",
                        results: output
                    }
                });
                updateResult = updateResult.modifiedCount === 1 ? 'Document updated successfully' : 'Something went wrong while updating document';
                console.log(updateResult);
            } catch (error) {
                console.error(`Error executing C code: ${error.message}`);
            }

            channel.ack(msg);  // Acknowledge the message so RabbitMQ removes it from the queue
        }
    });
})();

// Function to execute C code
async function executeCode(sourceCode, testCases) {
    const filename = `code.c`;
    const outputFile = `output`;

    // Write the received C code to a file inside the container
    fs.writeFileSync(filename, sourceCode);

    // Compile and execute the C code
    const compileCommand = `gcc ${filename} -o ${outputFile}`;
    await execPromise(compileCommand);  // Compile the C code

    // const executeCommand = `./${outputFile}`; // during k8s dev (ubuntu)
    // const executeCommand = `${outputFile}.exe`; // during local dev (windows)

    let testResults = [];
    // Run each test case
    for (const testCase of testCases) {
        const { input, expectedOutput } = testCase;

        try {
            // Execute with input redirection
            // const { stdout } = await execPromise(`echo "${input}" | ./${outputFile}`); // during k8s dev (ubuntu)
            const { stdout } = await execPromise(`echo ${input} | ${outputFile}.exe`); // during local dev (windows)

            const actualOutput = stdout.trim();
            const isCorrect = actualOutput === expectedOutput ? true : false;

            testResults.push({ input, expectedOutput, actualOutput, isCorrect });
        } catch (error) {
            testResults.push({ input, expectedOutput, actualOutput: "Error", status: "failed" });
        }
    }


    // const { stdout, stderr } = await execPromise(executeCommand);  // Execute the compiled binary
    // return stdout || stderr;  // Return the execution output
    return testResults;
}


